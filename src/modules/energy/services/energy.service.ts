import { Injectable } from "@nestjs/common";

import { GarageService } from "../../garage/services/garage.service";
import { VehicleHistoryService } from "../../vehicle-history/services/vehicle-history.service";
import { EnergyDbService, type EnergyHistoryQuery } from "../energy.db.service";
import {
  type CreateEnergyEntryInput,
  type EnergyEntryView,
  type FullToFullConsumption,
  type MonthlyEnergySummary,
} from "../energy.types";
import { type EnergyEntry } from "../schemas/energy-entry.schema";
import { toEnergyDecimalString } from "../utils/energy-number.utils";

import { EnergyConsumptionService } from "./energy-consumption.service";
import { EnergyCostCalculatorService } from "./energy-cost-calculator.service";
import { EnergyEntryValidatorService } from "./energy-entry-validator.service";
import { EnergySummaryService } from "./energy-summary.service";

@Injectable()
export class EnergyService {
  constructor(
    private readonly garageService: GarageService,
    private readonly energyDbService: EnergyDbService,
    private readonly vehicleHistoryService: VehicleHistoryService,
    private readonly validator: EnergyEntryValidatorService,
    private readonly costCalculator: EnergyCostCalculatorService,
    private readonly consumptionService: EnergyConsumptionService,
    private readonly summaryService: EnergySummaryService,
  ) {}

  async createEntry(
    ownerId: string,
    vehicleId: string,
    input: CreateEnergyEntryInput,
  ): Promise<EnergyEntryView> {
    await this.garageService.getVehicle(ownerId, vehicleId);

    this.validator.validate(input);

    const calculated = this.costCalculator.calculate(input);

    const entry = await this.energyDbService.createEntry({
      vehicleId,
      kind: input.kind,
      energyType: input.energyType,
      volumeLiters:
        input.volumeLiters !== undefined
          ? toEnergyDecimalString(input.volumeLiters, 3)
          : undefined,
      energyKwh:
        input.energyKwh !== undefined
          ? toEnergyDecimalString(input.energyKwh, 3)
          : undefined,
      unitPrice:
        input.unitPrice !== undefined
          ? toEnergyDecimalString(input.unitPrice, 4)
          : undefined,
      subtotalCost:
        calculated.subtotalCost !== null
          ? toEnergyDecimalString(calculated.subtotalCost, 2)
          : undefined,
      discountPercent:
        calculated.discountPercent !== null
          ? toEnergyDecimalString(calculated.discountPercent, 2)
          : undefined,
      discountAmount:
        calculated.discountAmount !== null
          ? toEnergyDecimalString(calculated.discountAmount, 2)
          : undefined,
      discountLabel: input.discountLabel,
      totalCost:
        calculated.totalCost !== null
          ? toEnergyDecimalString(calculated.totalCost, 2)
          : undefined,
      currency: input.currency,
      odometerKm: input.odometerKm,
      isFullTank: input.isFullTank ?? false,
      providerName: input.providerName,
      source: input.source ?? "manual",
      occurredAt: input.occurredAt,
    });

    await this.vehicleHistoryService.recordEvent(ownerId, vehicleId, {
      type: input.kind === "charge" ? "energy.charge" : "energy.refuel",
      sourceModule: "energy",
      origin: this.mapSourceToOrigin(input.source ?? "manual"),
      mileageKm: input.odometerKm,
      confidence: 1,
      occurredAt: input.occurredAt ?? new Date(),
      payload: {
        energyEntryId: entry.id,
        kind: input.kind,
        energyType: input.energyType,
        volumeLiters: input.volumeLiters ?? null,
        energyKwh: input.energyKwh ?? null,
        unitPrice: input.unitPrice ?? null,
        subtotalCost: calculated.subtotalCost,
        discountPercent: calculated.discountPercent,
        discountAmount: calculated.discountAmount,
        discountLabel: input.discountLabel ?? null,
        totalCost: calculated.totalCost,
        currency: input.currency ?? null,
        providerName: input.providerName ?? null,
        isFullTank: input.isFullTank ?? false,
      },
    });

    return {
      entry,
      calculations: {
        subtotalCost: calculated.subtotalCost,
        discountPercent: calculated.discountPercent,
        discountAmount: calculated.discountAmount,
        totalCost: calculated.totalCost,
        savings: calculated.discountAmount,
      },
    };
  }

  async getHistory(
    ownerId: string,
    vehicleId: string,
    query: EnergyHistoryQuery = {},
  ): Promise<EnergyEntry[]> {
    await this.garageService.getVehicle(ownerId, vehicleId);

    return this.energyDbService.listForVehicle(vehicleId, query);
  }

  async getLatest(
    ownerId: string,
    vehicleId: string,
  ): Promise<EnergyEntry | null> {
    await this.garageService.getVehicle(ownerId, vehicleId);

    return this.energyDbService.getLatestForVehicle(vehicleId);
  }

  async calculateLatestFullToFullConsumption(
    ownerId: string,
    vehicleId: string,
  ): Promise<FullToFullConsumption | null> {
    await this.garageService.getVehicle(ownerId, vehicleId);

    return this.consumptionService.calculateLatestFullToFull(
      ownerId,
      vehicleId,
    );
  }

  async getMonthlySummary(
    ownerId: string,
    vehicleId: string,
    year: number,
    month: number,
  ): Promise<MonthlyEnergySummary> {
    await this.garageService.getVehicle(ownerId, vehicleId);

    return this.summaryService.getMonthlySummary(
      ownerId,
      vehicleId,
      year,
      month,
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
      case "system":
        return "system";

      case "manual":
      case "web":
      default:
        return "web";
    }
  }
}
