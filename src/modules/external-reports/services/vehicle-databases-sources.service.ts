import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";

import {
  VehicleDatabasesClientService,
  VehicleDatabasesNoRecordsError,
} from "../../../common/vehicle-databases/vehicle-databases-client.service";
import { GarageService } from "../../garage/services/garage.service";
import { VinAccessService } from "../../vin-access/vin-access.service";
import { ExternalReportsDbService } from "../external-reports.db.service";
import {
  type NormalizationOutcome,
  SourceNormalizationService,
} from "../normalization/source-normalization.service";
import {
  VEHICLE_DATABASES_SOURCE_MAP,
  VEHICLE_DATABASES_SOURCES,
  type VehicleDatabasesSourceDefinition,
} from "../providers/vehicle-databases/source-catalog";
import { type VehicleExternalReport } from "../schemas/vehicle-external-report.schema";

export interface SourceFetchResult {
  report: VehicleExternalReport;
  normalization: NormalizationOutcome;
}

export interface SourceFetchSummary {
  source: string;
  status: "success" | "no-data" | "failed";
  reportId?: string;
  normalization?: NormalizationOutcome;
  error?: string;
}

@Injectable()
export class VehicleDatabasesSourcesService {
  private readonly logger = new Logger(VehicleDatabasesSourcesService.name);

  constructor(
    private readonly garageService: GarageService,
    private readonly externalReportsDbService: ExternalReportsDbService,
    private readonly vehicleDatabasesClient: VehicleDatabasesClientService,
    private readonly sourceNormalizationService: SourceNormalizationService,
    private readonly access: VinAccessService,
  ) {}

  listSources(): Array<{
    key: string;
    apiName: string;
    input: VehicleDatabasesSourceDefinition["input"];
    fetchableByVehicleVin: boolean;
    note?: string;
  }> {
    return VEHICLE_DATABASES_SOURCES.map(
      ({ key, apiName, input, note, enabled }) => ({
        key,
        apiName,
        input,
        fetchableByVehicleVin: input === "vin" && enabled !== false,
        note,
      }),
    );
  }

  async fetchSource(
    ownerId: string,
    vehicleId: string,
    sourceKey: string,
  ): Promise<SourceFetchResult> {
    const definition = VEHICLE_DATABASES_SOURCE_MAP.get(sourceKey);

    if (!definition) {
      throw new NotFoundException(`Unknown external source: ${sourceKey}`);
    }

    if (definition.enabled === false) {
      throw new BadRequestException(
        `${definition.apiName} is disabled for this vehicle flow. ${definition.note ?? ""}`.trim(),
      );
    }

    if (definition.input !== "vin") {
      throw new BadRequestException(
        `${definition.apiName} cannot be fetched from vehicle VIN alone. ${definition.note ?? "Use a dedicated endpoint for this source."}`,
      );
    }

    const vin = await this.resolveVin(ownerId, vehicleId);

    if (!definition.urlTemplate) throw new BadRequestException("Джерело VIN не налаштовано.");
    return this.access.run(ownerId, sourceKey, vin, () => this.fetchAndStore(ownerId, vehicleId, vin, definition));
  }

  async fetchAllSources(
    ownerId: string,
    vehicleId: string,
  ): Promise<SourceFetchSummary[]> {
    await this.garageService.getVehicle(ownerId, vehicleId);
    throw new BadRequestException("Оберіть одне VIN-джерело. Масове завантаження звітів недоступне.");
  }

  private async resolveVin(
    ownerId: string,
    vehicleId: string,
  ): Promise<string> {
    const vehicle = await this.garageService.getVehicle(ownerId, vehicleId);

    const vin = vehicle.vin?.trim().toUpperCase();

    if (!vin) {
      throw new BadRequestException("В автомобіля не вказано VIN");
    }

    return vin;
  }

  private async fetchAndStore(
    ownerId: string,
    vehicleId: string,
    vin: string,
    definition: VehicleDatabasesSourceDefinition,
  ): Promise<SourceFetchResult> {
    if (!definition.urlTemplate) {
      throw new BadRequestException(
        `${definition.apiName} does not have a configured endpoint`,
      );
    }

    try {
      const rawPayload = await this.vehicleDatabasesClient.fetch({
        apiName: definition.apiName,
        url: this.vehicleDatabasesClient.buildVinUrl(
          definition.urlTemplate,
          vin,
        ),
      });

      const report = await this.externalReportsDbService.createReport({
        vehicleId,
        provider: "vehicle-databases",
        reportType: definition.key,
        vin,
        status: "success",
        rawPayload,
      });

      const normalization =
        await this.sourceNormalizationService.applyToReport(
          ownerId,
          vehicleId,
          report,
        );

      return { report, normalization };
    } catch (error) {
      if (error instanceof VehicleDatabasesNoRecordsError) {
        const report = await this.externalReportsDbService.createReport({
          vehicleId,
          provider: "vehicle-databases",
          reportType: definition.key,
          vin,
          status: "no-data",
          rawPayload: { message: error.message },
        });

        return { report, normalization: { normalized: false, reason: "no-data" } };
      }

      await this.saveFailedReport(vehicleId, vin, definition, error);

      throw error;
    }
  }

  private async saveFailedReport(
    vehicleId: string,
    vin: string,
    definition: VehicleDatabasesSourceDefinition,
    error: unknown,
  ): Promise<void> {
    try {
      await this.externalReportsDbService.createReport({
        vehicleId,
        provider: "vehicle-databases",
        reportType: definition.key,
        vin,
        status: "failed",
        rawPayload: {
          error: error instanceof Error ? error.message : "unknown error",
        },
      });
    } catch (persistError) {
      this.logger.warn(
        `Failed to persist failed ${definition.key} report for vehicle ${vehicleId}: ${
          persistError instanceof Error
            ? persistError.message
            : String(persistError)
        }`,
      );
    }
  }
}
