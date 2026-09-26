import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { GarageService } from "../../garage/services/garage.service";
import { VehicleHistoryService } from "../../vehicle-history/services/vehicle-history.service";
import {
  type ServiceRecordHistoryQuery,
  type ServiceRecordWithItems,
  ServiceRecordsDbService,
} from "../service-records.db.service";
import { type CreateServiceRecordInput } from "../service-records.types";
import { type ServiceRecord } from "../schemas/service-record.schema";
import { toServiceRecordDecimalString } from "../utils/service-record-number.utils";

import { ServiceRecordItemPreparerService } from "./service-record-item-preparer.service";
import { ServiceRecordValidatorService } from "./service-record-validator.service";

@Injectable()
export class ServiceRecordsService {
  constructor(
    private readonly garageService: GarageService,
    private readonly serviceRecordsDbService: ServiceRecordsDbService,
    private readonly vehicleHistoryService: VehicleHistoryService,
    private readonly validator: ServiceRecordValidatorService,
    private readonly itemPreparer: ServiceRecordItemPreparerService,
  ) {}

  async createRecord(
    ownerId: string,
    vehicleId: string,
    input: CreateServiceRecordInput,
  ): Promise<ServiceRecordWithItems> {
    await this.garageService.getVehicle(ownerId, vehicleId);

    this.validator.validate(input);

    const items = this.itemPreparer.prepare(input.items ?? []);

    const created = await this.serviceRecordsDbService.createRecord({
      vehicleId,
      expenseId: input.expenseId,
      type: input.type,
      title: input.title,
      description: input.description,
      odometerKm: input.odometerKm,

      engineHours:
        input.engineHours !== undefined
          ? toServiceRecordDecimalString(input.engineHours, 2)
          : undefined,

      providerName: input.providerName,
      documentNumber: input.documentNumber,

      totalCost:
        input.totalCost !== undefined
          ? toServiceRecordDecimalString(input.totalCost, 2)
          : undefined,

      currency: input.currency,
      source: input.source ?? "manual",
      occurredAt: input.occurredAt,
      items,
    });

    await this.vehicleHistoryService.recordEvent(ownerId, vehicleId, {
      type: "service.completed",
      sourceModule: "service-records",
      origin: this.mapSourceToOrigin(input.source ?? "manual"),
      mileageKm: input.odometerKm,
      confidence: 1,
      occurredAt: input.occurredAt ?? new Date(),

      payload: {
        serviceRecordId: created.record.id,
        expenseId: created.record.expenseId,
        serviceType: input.type,
        title: input.title,
        providerName: input.providerName ?? null,
        documentNumber: input.documentNumber ?? null,
        totalCost: input.totalCost ?? null,
        currency: input.currency?.toUpperCase() ?? null,
        itemsCount: created.items.length,

        items: created.items.map((item) => ({
          itemType: item.itemType,
          name: item.name,
          brand: item.brand,
          partNumber: item.partNumber,
          quantity: item.quantity,
          unit: item.unit,
        })),
      },
    });

    return created;
  }

  async getRecord(
    ownerId: string,
    vehicleId: string,
    recordId: string,
  ): Promise<ServiceRecordWithItems> {
    await this.garageService.getVehicle(ownerId, vehicleId);

    const record = await this.serviceRecordsDbService.findByIdForVehicle(
      vehicleId,
      recordId,
    );

    if (!record) {
      throw new NotFoundException("Service record not found");
    }

    return record;
  }

  async getHistory(
    ownerId: string,
    vehicleId: string,
    query: ServiceRecordHistoryQuery = {},
  ): Promise<ServiceRecord[]> {
    await this.garageService.getVehicle(ownerId, vehicleId);

    return this.serviceRecordsDbService.listForVehicle(vehicleId, query);
  }

  async findPartHistory(
    ownerId: string,
    vehicleId: string,
    partNumber: string,
  ) {
    await this.garageService.getVehicle(ownerId, vehicleId);

    const normalizedPartNumber = partNumber.trim();

    if (!normalizedPartNumber) {
      throw new BadRequestException("Part number is required");
    }

    return this.serviceRecordsDbService.findItemsByPartNumber(
      vehicleId,
      normalizedPartNumber,
    );
  }

  private mapSourceToOrigin(
    source: string,
  ): "telegram" | "web" | "ocr" | "ai-inferred" | "system" {
    switch (source) {
      case "telegram":
        return "telegram";

      case "receipt":
      case "ocr":
        return "ocr";

      case "ai":
      case "ai-inferred":
        return "ai-inferred";

      case "integration":
      case "service":
      case "system":
        return "system";

      case "manual":
      case "web":
      default:
        return "web";
    }
  }
}
