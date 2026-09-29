import { BadRequestException, Injectable } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { firstValueFrom } from "rxjs";

import { GarageService } from "../../garage/services/garage.service";
import { ExternalReportsDbService } from "../external-reports.db.service";
import { type NormalizationOutcome } from "../normalization/source-normalization.service";
import { type VehicleExternalReport } from "../schemas/vehicle-external-report.schema";

export interface CepikVehiclesQuery {
  wojewodztwo: string;
  dataOd: string;
  dataDo?: string;
  typDaty?: "1" | "2";
  tylkoZarejestrowane?: boolean;
  limit?: string;
  page?: string;
}

export interface CepikFetchResult {
  report: VehicleExternalReport;
  normalization: NormalizationOutcome;
}

const DEFAULT_CEPIK_BASE_URL = "https://api.cepik.gov.pl";

@Injectable()
export class CepikReportsService {
  private readonly baseUrl: string;

  constructor(
    private readonly garageService: GarageService,
    private readonly externalReportsDbService: ExternalReportsDbService,
    private readonly httpService: HttpService,
    configService: ConfigService,
  ) {
    this.baseUrl =
      configService.get<string>("CEPIK_BASE_URL") ?? DEFAULT_CEPIK_BASE_URL;
  }

  async fetchVehicles(
    ownerId: string,
    vehicleId: string,
    query: CepikVehiclesQuery,
  ): Promise<CepikFetchResult> {
    const vehicle = await this.garageService.getVehicle(ownerId, vehicleId);
    const normalizedQuery = this.normalizeQuery(query);

    const url = new URL("/pojazdy", this.baseUrl);
    url.searchParams.set("wojewodztwo", normalizedQuery.wojewodztwo);
    url.searchParams.set("data-od", normalizedQuery.dataOd);
    url.searchParams.set("typ-daty", normalizedQuery.typDaty ?? "1");
    url.searchParams.set(
      "tylko-zarejestrowane",
      String(normalizedQuery.tylkoZarejestrowane ?? true),
    );
    url.searchParams.set("pokaz-wszystkie-pola", "true");
    url.searchParams.set("limit", normalizedQuery.limit ?? "25");
    url.searchParams.set("page", normalizedQuery.page ?? "1");

    if (normalizedQuery.dataDo) {
      url.searchParams.set("data-do", normalizedQuery.dataDo);
    }

    const response = await firstValueFrom(
      this.httpService.get<Record<string, unknown>>(url.toString(), {
        headers: {
          Accept: "application/json",
        },
      }),
    );

    const rawPayload = {
      query: normalizedQuery,
      vehicleMatchInput: {
        vin: vehicle.vin ?? null,
        make: vehicle.make ?? null,
        model: vehicle.model ?? null,
        modelYear: vehicle.modelYear ?? null,
        country: vehicle.country,
      },
      response: response.data,
    };

    const report = await this.externalReportsDbService.createReport({
      vehicleId,
      provider: "cepik",
      reportType: "cepik-pojazdy",
      vin: vehicle.vin ?? undefined,
      status: "success",
      rawPayload,
    });

    return {
      report,
      normalization: {
        normalized: false,
        reason:
          "CEPiK is stored as an alternative Polish registry report; manual review is required before applying facts.",
      },
    };
  }

  async fetchVehicleByCepikId(
    ownerId: string,
    vehicleId: string,
    cepikId: string,
  ): Promise<CepikFetchResult> {
    const vehicle = await this.garageService.getVehicle(ownerId, vehicleId);
    const id = cepikId.trim();

    if (!/^\d+$/.test(id)) {
      throw new BadRequestException("CEPiK vehicle id must be numeric");
    }

    const response = await this.getCepik<Record<string, unknown>>(
      `/pojazdy/${encodeURIComponent(id)}`,
    );

    const report = await this.externalReportsDbService.createReport({
      vehicleId,
      provider: "cepik",
      reportType: "cepik-pojazdy-detail",
      vin: vehicle.vin ?? undefined,
      status: "success",
      rawPayload: {
        cepikId: id,
        vehicleMatchInput: {
          vin: vehicle.vin ?? null,
          make: vehicle.make ?? null,
          model: vehicle.model ?? null,
          modelYear: vehicle.modelYear ?? null,
          country: vehicle.country,
        },
        response,
      },
    });

    return {
      report,
      normalization: {
        normalized: false,
        reason:
          "CEPiK detail report is stored as raw registry data; manual review is required before applying facts.",
      },
    };
  }

  async listDictionaries(limit = "100", page = "1"): Promise<Record<string, unknown>> {
    this.assertPositiveInteger(limit, "CEPiK limit", 1, 500);
    this.assertPositiveInteger(page, "CEPiK page", 1);

    return this.getCepik<Record<string, unknown>>(
      `/slowniki?limit=${encodeURIComponent(limit)}&page=${encodeURIComponent(page)}`,
    );
  }

  async getDictionary(name: string): Promise<Record<string, unknown>> {
    const dictionaryName = name.trim();

    if (!/^[a-z0-9-]+$/i.test(dictionaryName)) {
      throw new BadRequestException("Invalid CEPiK dictionary name");
    }

    return this.getCepik<Record<string, unknown>>(
      `/slowniki/${encodeURIComponent(dictionaryName)}`,
    );
  }

  private normalizeQuery(query: CepikVehiclesQuery): CepikVehiclesQuery {
    const wojewodztwo = query.wojewodztwo?.trim();
    const dataOd = query.dataOd?.trim();
    const dataDo = query.dataDo?.trim();
    const typDaty = query.typDaty ?? "1";
    const limit = query.limit?.trim() || "25";
    const page = query.page?.trim() || "1";

    if (!wojewodztwo) {
      throw new BadRequestException("CEPiK requires wojewodztwo code");
    }

    if (!/^\d{8}$/.test(dataOd)) {
      throw new BadRequestException(
        "CEPiK dataOd must be in YYYYMMDD format",
      );
    }

    if (dataDo && !/^\d{8}$/.test(dataDo)) {
      throw new BadRequestException(
        "CEPiK dataDo must be in YYYYMMDD format",
      );
    }

    if (typDaty !== "1" && typDaty !== "2") {
      throw new BadRequestException("CEPiK typDaty must be 1 or 2");
    }

    this.assertPositiveInteger(limit, "CEPiK limit", 1, 500);
    this.assertPositiveInteger(page, "CEPiK page", 1);

    return {
      wojewodztwo,
      dataOd,
      dataDo: dataDo || undefined,
      typDaty,
      tylkoZarejestrowane: query.tylkoZarejestrowane ?? true,
      limit,
      page,
    };
  }

  private async getCepik<T>(pathWithQuery: string): Promise<T> {
    const response = await firstValueFrom(
      this.httpService.get<T>(new URL(pathWithQuery, this.baseUrl).toString(), {
        headers: {
          Accept: "application/json",
        },
      }),
    );

    return response.data;
  }

  private assertPositiveInteger(
    value: string,
    label: string,
    min: number,
    max?: number,
  ): void {
    const numberValue = Number(value);

    if (!/^\d+$/.test(value) || numberValue < min || (max != null && numberValue > max)) {
      throw new BadRequestException(
        max != null ? `${label} must be ${min}..${max}` : `${label} must be >= ${min}`,
      );
    }
  }
}
