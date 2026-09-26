import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";

import { GarageService } from "../../garage/services/garage.service";
import { ExternalReportsDbService } from "../external-reports.db.service";
import {
  VEHICLE_HISTORY_PROVIDER_TOKEN,
  type VehicleHistoryProvider,
} from "../providers/vehicle-history/vehicle-history-provider.interface";
import { Inject } from "@nestjs/common";

@Injectable()
export class ExternalReportsService {
  constructor(
    private readonly garageService: GarageService,
    private readonly externalReportsDbService: ExternalReportsDbService,

    @Inject(VEHICLE_HISTORY_PROVIDER_TOKEN)
    private readonly vehicleHistoryProvider: VehicleHistoryProvider,
  ) {}

  async fetchVehicleHistory(
    ownerId: string,
    vehicleId: string,
  ) {
    const vehicle = await this.garageService.getVehicle(
      ownerId,
      vehicleId,
    );

    const vin = vehicle.vin?.trim().toUpperCase();

    if (!vin) {
      throw new BadRequestException(
        "У автомобиля не указан VIN",
      );
    }

    try {
      const result =
        await this.vehicleHistoryProvider.getHistory(vin);

      return this.externalReportsDbService.createReport({
        vehicleId,
        provider: result.provider,
        reportType: "vehicle-history",
        vin: result.vin,
        status: "success",
        rawPayload: result.rawPayload,
      });
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      throw error;
    }
  }

  async getLatestVehicleHistory(
    ownerId: string,
    vehicleId: string,
  ) {
    await this.garageService.getVehicle(ownerId, vehicleId);

    return this.externalReportsDbService.getLatest(
      vehicleId,
      "vehicle-databases",
      "vehicle-history",
    );
  }

  async getReports(
    ownerId: string,
    vehicleId: string,
    reportType?: string,
  ) {
    await this.garageService.getVehicle(ownerId, vehicleId);

    return this.externalReportsDbService.listForVehicle(
      vehicleId,
      reportType,
    );
  }
}
