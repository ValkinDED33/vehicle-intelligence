import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { AxiosError } from "axios";
import { firstValueFrom } from "rxjs";

import { GarageService } from "../../garage/services/garage.service";
import { ExternalReportsDbService } from "../external-reports.db.service";
import { type NormalizationOutcome } from "../normalization/source-normalization.service";
import { type VehicleExternalReport } from "../schemas/vehicle-external-report.schema";

export interface OneAutoSourceDefinition {
  key: string;
  apiName: string;
  path: string;
  note?: string;
}

export interface OneAutoFetchResult {
  report: VehicleExternalReport;
  normalization: NormalizationOutcome;
}

export const ONE_AUTO_SOURCES: readonly OneAutoSourceDefinition[] = [
  {
    key: "oneauto-oe-build-sheet-europe-vin",
    apiName: "OneAuto OE Build Sheet Europe from VIN",
    path: "/oneauto/oebuildsheeteuropefromvin/v2",
    note: "Best first try for European VIN build/options data.",
  },
  {
    key: "oneauto-oe-build-sheet-vin",
    apiName: "OneAuto OE Build Sheet from VIN",
    path: "/oneauto/oebuildsheetfromvin/v2",
  },
  {
    key: "oneauto-oe-service-schedule-vin",
    apiName: "OneAuto OE Service Schedule from VIN",
    path: "/oneauto/oeserviceschedulefromvin/v2",
  },
  {
    key: "oneauto-recall-check-vin",
    apiName: "OneAuto Recall Check from VIN",
    path: "/oneauto/recallcheckfromvin/v2",
  },
  {
    key: "oneauto-recall-report-vin",
    apiName: "OneAuto Recall Report from VIN",
    path: "/oneauto/recallreportfromvin/v2",
  },
  {
    key: "oneauto-vin-decode-basic-us",
    apiName: "OneAuto VIN Decode Basic US",
    path: "/oneauto/vindecodebasic/us/v2",
    note: "US-focused VIN decode.",
  },
  {
    key: "oneauto-vin-decode-plus-us",
    apiName: "OneAuto VIN Decode Plus US",
    path: "/oneauto/vindecodeplus/us/v2",
    note: "US-focused extended VIN decode.",
  },
] as const;

const ONE_AUTO_SOURCE_MAP: ReadonlyMap<string, OneAutoSourceDefinition> =
  new Map(ONE_AUTO_SOURCES.map((source) => [source.key, source]));

const DEFAULT_ONE_AUTO_BASE_URL = "https://api.oneautoapi.com";

@Injectable()
export class OneAutoReportsService {
  private readonly baseUrl: string;
  private readonly apiKey?: string;

  constructor(
    private readonly garageService: GarageService,
    private readonly externalReportsDbService: ExternalReportsDbService,
    private readonly httpService: HttpService,
    configService: ConfigService,
  ) {
    this.baseUrl =
      configService.get<string>("ONEAUTO_BASE_URL") ?? DEFAULT_ONE_AUTO_BASE_URL;
    this.apiKey = configService.get<string>("ONEAUTO_API_KEY");
  }

  listSources(): Array<{
    key: string;
    apiName: string;
    input: "vin";
    fetchableByVehicleVin: boolean;
    note?: string;
  }> {
    return ONE_AUTO_SOURCES.map((source) => ({
      key: source.key,
      apiName: source.apiName,
      input: "vin",
      fetchableByVehicleVin: true,
      note: source.note,
    }));
  }

  async fetchSource(
    ownerId: string,
    vehicleId: string,
    sourceKey: string,
  ): Promise<OneAutoFetchResult> {
    const definition = ONE_AUTO_SOURCE_MAP.get(sourceKey);

    if (!definition) {
      throw new BadRequestException(`Unknown OneAuto source: ${sourceKey}`);
    }

    if (!this.apiKey) {
      throw new ServiceUnavailableException(
        "OneAutoAPI is not configured (missing ONEAUTO_API_KEY)",
      );
    }

    const vehicle = await this.garageService.getVehicle(ownerId, vehicleId);
    const vin = vehicle.vin?.trim().toUpperCase();

    if (!vin) {
      throw new BadRequestException("У автомобиля не указан VIN");
    }

    const url = new URL(definition.path, this.baseUrl);
    url.searchParams.set("vehicle_identification_number", vin);

    const response = await this.fetchOneAuto(definition, url);

    const report = await this.externalReportsDbService.createReport({
      vehicleId,
      provider: "oneauto",
      reportType: definition.key,
      vin,
      status: "success",
      rawPayload: response.data,
    });

    return {
      report,
      normalization: {
        normalized: false,
        reason:
          "OneAutoAPI report is stored as a provider-specific raw report; manual review is required before applying facts.",
      },
    };
  }

  private async fetchOneAuto(
    definition: OneAutoSourceDefinition,
    url: URL,
  ): Promise<{ data: Record<string, unknown> }> {
    try {
      return await firstValueFrom(
        this.httpService.get<Record<string, unknown>>(url.toString(), {
          headers: {
            Accept: "application/json",
            "x-api-key": this.apiKey,
          },
        }),
      );
    } catch (error) {
      if (error instanceof AxiosError) {
        const status = error.response?.status;
        const upstreamMessage = this.extractUpstreamMessage(error.response?.data);

        throw new BadGatewayException(
          `OneAutoAPI ${definition.apiName} failed${status ? ` (${status})` : ""}: ${upstreamMessage}`,
        );
      }

      throw error;
    }
  }

  private extractUpstreamMessage(data: unknown): string {
    if (typeof data === "string" && data.trim()) {
      return data.trim().slice(0, 300);
    }

    if (data && typeof data === "object") {
      const record = data as Record<string, unknown>;
      const message =
        record.message ?? record.error ?? record.detail ?? record.title;

      if (typeof message === "string" && message.trim()) {
        return message.trim().slice(0, 300);
      }

      return JSON.stringify(record).slice(0, 300);
    }

    return "upstream request failed";
  }
}
