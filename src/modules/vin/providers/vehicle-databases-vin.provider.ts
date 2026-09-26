import { HttpService } from "@nestjs/axios";
import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import axios from "axios";
import { firstValueFrom } from "rxjs";

import {
  type VinDecodeResult,
  type VinProvider,
} from "./vin-provider.interface";
import {
  isRecord,
  mapVehicleDatabasesResponse,
} from "./vehicle-databases/vehicle-databases.mapper";
import { type VehicleDatabasesResponse } from "./vehicle-databases/vehicle-databases.types";

@Injectable()
export class VehicleDatabasesVinProvider implements VinProvider {
  private readonly logger = new Logger(VehicleDatabasesVinProvider.name);
  private readonly timeoutMs = 30_000;

  constructor(private readonly httpService: HttpService) {}

  async decode(vin: string): Promise<VinDecodeResult> {
    const normalizedVin = vin.trim().toUpperCase();
    const apiKey = process.env.VIN_PROVIDER_API_KEY?.trim();

    if (!apiKey) {
      throw new ServiceUnavailableException(
        "VIN provider API key is not configured",
      );
    }

    const url = this.buildUrl(normalizedVin);

    try {
      const response = await firstValueFrom(
        this.httpService.get<VehicleDatabasesResponse>(url, {
          headers: {
            "x-authkey": apiKey,
            Accept: "application/json",
          },
          timeout: this.timeoutMs,
        }),
      );

      const payload = response.data;

      if (
        !payload ||
        payload.status?.toLowerCase() !== "success" ||
        !isRecord(payload.data)
      ) {
        this.logger.warn(
          `Vehicle Databases returned an unsuccessful response for VIN ${normalizedVin}`,
        );

        throw new BadGatewayException(
          "VIN provider returned an unsuccessful response",
        );
      }

      return mapVehicleDatabasesResponse(payload.data);
    } catch (error: unknown) {
      if (
        error instanceof BadGatewayException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }

      if (axios.isAxiosError(error)) {
        const status = error.response?.status;

        if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
          this.logger.warn(
            `Vehicle Databases timed out for VIN ${normalizedVin}`,
          );

          throw new ServiceUnavailableException(
            "VIN provider request timed out",
          );
        }

        if (status === 400 || status === 404 || status === 422) {
          throw new BadGatewayException(
            "VIN provider could not decode this VIN",
          );
        }

        if (status === 401 || status === 403) {
          this.logger.error(
            `Vehicle Databases authentication failed with HTTP ${status}`,
          );

          throw new ServiceUnavailableException(
            "VIN provider authentication failed",
          );
        }

        if (status === 429) {
          this.logger.warn("Vehicle Databases rate limit exceeded");

          throw new ServiceUnavailableException(
            "VIN provider rate limit exceeded",
          );
        }

        if (status !== undefined && status >= 500) {
          this.logger.warn(`Vehicle Databases upstream error: HTTP ${status}`);

          throw new ServiceUnavailableException(
            "VIN provider is temporarily unavailable",
          );
        }

        this.logger.error(
          `Vehicle Databases request failed. ` +
            `HTTP ${status ?? "NO_RESPONSE"}, code ${error.code ?? "UNKNOWN"}`,
        );

        throw new BadGatewayException("VIN provider request failed");
      }

      this.logger.error(
        `Unexpected Vehicle Databases error: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );

      throw new BadGatewayException("VIN provider request failed");
    }
  }

  private buildUrl(vin: string): string {
    const configuredUrl = process.env.VIN_PROVIDER_URL?.trim();

    const baseUrl =
      configuredUrl ||
      "https://api.vehicledatabases.com/europe-vin-decode/v2/{vin}";

    if (baseUrl.includes("{vin}")) {
      return baseUrl.replace("{vin}", encodeURIComponent(vin));
    }

    return `${baseUrl.replace(/\/+$/, "")}/${encodeURIComponent(vin)}`;
  }
}
