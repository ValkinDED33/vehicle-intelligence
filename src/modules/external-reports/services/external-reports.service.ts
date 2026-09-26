import {
  BadRequestException,
  Injectable,
  Logger,
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
  private readonly logger = new Logger(ExternalReportsService.name);

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

      return await this.externalReportsDbService.createReport({
        vehicleId,
        provider: result.provider,
        reportType: "vehicle-history",
        vin: result.vin,
        status: "success",
        rawPayload: result.rawPayload,
      });
    } catch (error) {
      await this.saveFailedReport(vehicleId, vin, error);

      throw error;
    }
  }

  private async saveFailedReport(
    vehicleId: string,
    vin: string,
    error: unknown,
  ): Promise<void> {
    try {
      await this.externalReportsDbService.createReport({
        vehicleId,
        provider: "vehicle-databases",
        reportType: "vehicle-history",
        vin,
        status: "failed",
        rawPayload: {
          error: error instanceof Error ? error.message : "unknown error",
        },
      });
    } catch (persistError) {
      this.logger.warn(
        `Failed to persist failed vehicle-history report for vehicle ${vehicleId}: ${
          persistError instanceof Error
            ? persistError.message
            : String(persistError)
        }`,
      );
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
