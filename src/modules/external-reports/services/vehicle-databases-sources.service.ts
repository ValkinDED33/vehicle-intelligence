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
import { ExternalReportsDbService } from "../external-reports.db.service";
import {
  type NormalizationOutcome,
  SourceNormalizationService,
} from "../normalization/source-normalization.service";
import {
  VEHICLE_DATABASES_SOURCE_MAP,
  VEHICLE_DATABASES_VIN_SOURCES,
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

const FETCH_ALL_CONCURRENCY = 3;
const FETCH_ALL_CHUNK_DELAY_MS = 750;

@Injectable()
export class VehicleDatabasesSourcesService {
  private readonly logger = new Logger(VehicleDatabasesSourcesService.name);

  constructor(
    private readonly garageService: GarageService,
    private readonly externalReportsDbService: ExternalReportsDbService,
    private readonly vehicleDatabasesClient: VehicleDatabasesClientService,
    private readonly sourceNormalizationService: SourceNormalizationService,
  ) {}

  listSources(): Array<{ key: string; apiName: string }> {
    return VEHICLE_DATABASES_VIN_SOURCES.map(({ key, apiName }) => ({
      key,
      apiName,
    }));
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

    const vin = await this.resolveVin(ownerId, vehicleId);

    return this.fetchAndStore(ownerId, vehicleId, vin, definition);
  }

  async fetchAllSources(
    ownerId: string,
    vehicleId: string,
  ): Promise<SourceFetchSummary[]> {
    const vin = await this.resolveVin(ownerId, vehicleId);

    const summaries: SourceFetchSummary[] = [];

    for (
      let start = 0;
      start < VEHICLE_DATABASES_VIN_SOURCES.length;
      start += FETCH_ALL_CONCURRENCY
    ) {
      const chunk = VEHICLE_DATABASES_VIN_SOURCES.slice(
        start,
        start + FETCH_ALL_CONCURRENCY,
      );

      const results = await Promise.allSettled(
        chunk.map((definition) =>
          this.fetchAndStore(ownerId, vehicleId, vin, definition),
        ),
      );

      results.forEach((result, index) => {
        const key = chunk[index].key;

        if (result.status === "fulfilled") {
          summaries.push({
            source: key,
            status:
              result.value.report.status === "no-data" ? "no-data" : "success",
            reportId: result.value.report.id,
            normalization: result.value.normalization,
          });
        } else {
          summaries.push({
            source: key,
            status: "failed",
            error:
              result.reason instanceof Error
                ? result.reason.message
                : "unknown error",
          });
        }
      });

      if (
        start + FETCH_ALL_CONCURRENCY <
        VEHICLE_DATABASES_VIN_SOURCES.length
      ) {
        await new Promise((resolve) =>
          setTimeout(resolve, FETCH_ALL_CHUNK_DELAY_MS),
        );
      }
    }

    return summaries;
  }

  private async resolveVin(
    ownerId: string,
    vehicleId: string,
  ): Promise<string> {
    const vehicle = await this.garageService.getVehicle(ownerId, vehicleId);

    const vin = vehicle.vin?.trim().toUpperCase();

    if (!vin) {
      throw new BadRequestException("У автомобиля не указан VIN");
    }

    return vin;
  }

  private async fetchAndStore(
    ownerId: string,
    vehicleId: string,
    vin: string,
    definition: VehicleDatabasesSourceDefinition,
  ): Promise<SourceFetchResult> {
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
