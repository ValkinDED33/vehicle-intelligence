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
  VEHICLE_HISTORY_PROVIDER_TOKEN,
  type VehicleHistoryProvider,
  type VehicleHistoryProviderResult,
} from "./vehicle-history-provider.interface";
import {
  type VehicleDatabasesHistoryResponse,
} from "./vehicle-databases-history.types";

@Injectable()
export class VehicleDatabasesHistoryProvider
  implements VehicleHistoryProvider
{
  constructor(private readonly httpService: HttpService) {}

  private readonly logger = new Logger(
    VehicleDatabasesHistoryProvider.name,
  );

  private readonly timeoutMs = 30_000;

  async getHistory(
    vin: string,
  ): Promise<VehicleHistoryProviderResult> {
    const normalizedVin = vin.trim().toUpperCase();

    if (!normalizedVin) {
      throw new BadGatewayException(
        "Vehicle history provider requires a VIN",
      );
    }

    const apiKey = process.env.VIN_PROVIDER_API_KEY?.trim();

    if (!apiKey) {
      throw new ServiceUnavailableException(
        "VIN provider API key is not configured",
      );
    }

    const url = this.buildUrl(normalizedVin);

    try {
      const response = await firstValueFrom(
        this.httpService.get<VehicleDatabasesHistoryResponse>(url, {
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
        !payload.data ||
        typeof payload.data !== "object" ||
        Array.isArray(payload.data)
      ) {
        this.logger.warn(
          `Vehicle Databases history returned an unsuccessful response for VIN ${normalizedVin}`,
        );

        throw new BadGatewayException(
          "Vehicle history provider returned an unsuccessful response",
        );
      }

      return {
        provider: "vehicle-databases",
        vin: normalizedVin,
        rawPayload: payload.data,
      };
    } catch (error: unknown) {
      if (
        error instanceof BadGatewayException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }

      if (axios.isAxiosError(error)) {
        const status = error.response?.status;

        if (
          error.code === "ECONNABORTED" ||
          error.code === "ETIMEDOUT"
        ) {
          this.logger.warn(
            `Vehicle Databases history timed out for VIN ${normalizedVin}`,
          );

          throw new ServiceUnavailableException(
            "Vehicle history provider request timed out",
          );
        }

        if (status === 400 || status === 404 || status === 422) {
          throw new BadGatewayException(
            "Vehicle history provider could not find this VIN",
          );
        }

        if (status === 401 || status === 403) {
          this.logger.error(
            `Vehicle Databases history authentication failed with HTTP ${status}`,
          );

          throw new ServiceUnavailableException(
            "Vehicle history provider authentication failed",
          );
        }

        if (status === 429) {
          this.logger.warn(
            "Vehicle Databases history rate limit exceeded",
          );

          throw new ServiceUnavailableException(
            "Vehicle history provider rate limit exceeded",
          );
        }

        if (status !== undefined && status >= 500) {
          this.logger.warn(
            `Vehicle Databases history upstream error: HTTP ${status}`,
          );

          throw new ServiceUnavailableException(
            "Vehicle history provider is temporarily unavailable",
          );
        }

        this.logger.error(
          `Vehicle Databases history request failed. ` +
            `HTTP ${status ?? "NO_RESPONSE"}, ` +
            `code ${error.code ?? "UNKNOWN"}`,
        );

        throw new BadGatewayException(
          "Vehicle history provider request failed",
        );
      }

      this.logger.error(
        `Unexpected Vehicle Databases history error: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );

      throw new BadGatewayException(
        "Vehicle history provider request failed",
      );
    }
  }

  private buildUrl(vin: string): string {
    const configuredUrl =
      process.env.VEHICLE_HISTORY_PROVIDER_URL?.trim();

    if (!configuredUrl) {
      throw new ServiceUnavailableException(
        "Vehicle history provider URL is not configured",
      );
    }

    if (configuredUrl.includes("{vin}")) {
      return configuredUrl.replace(
        "{vin}",
        encodeURIComponent(vin),
      );
    }

    return `${configuredUrl.replace(/\/+$/, "")}/${encodeURIComponent(vin)}`;
  }
}
