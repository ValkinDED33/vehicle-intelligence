import { HttpService } from "@nestjs/axios";
import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import axios from "axios";
import { firstValueFrom } from "rxjs";

export interface AdvancedVinResult {
  provider: "vehicle-databases";
  vin: string;
  rawPayload: Record<string, unknown>;
}

interface AdvancedVinResponse {
  status?: string;
  data?: Record<string, unknown>;
  error?: unknown;
  message?: unknown;
}

@Injectable()
export class AdvancedVinProvider {
  private readonly logger = new Logger(AdvancedVinProvider.name);
  private readonly timeoutMs = 30_000;

  constructor(private readonly httpService: HttpService) {}

  async decode(vin: string): Promise<AdvancedVinResult> {
    const normalizedVin = vin.trim().toUpperCase();

    if (!normalizedVin) {
      throw new BadGatewayException("Advanced VIN provider requires a VIN");
    }

    const apiKey = process.env.VIN_PROVIDER_API_KEY?.trim();

    if (!apiKey) {
      throw new ServiceUnavailableException(
        "VIN provider API key is not configured",
      );
    }

    const url =
      process.env.ADVANCED_VIN_PROVIDER_URL?.trim() ||
      `https://api.vehicledatabases.com/advanced-vin-decode/v2/${encodeURIComponent(
        normalizedVin,
      )}`;

    try {
      const response = await firstValueFrom(
        this.httpService.get<AdvancedVinResponse>(url, {
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
          `Advanced VIN returned an unsuccessful response for VIN ${normalizedVin}`,
        );

        throw new BadGatewayException(
          "Advanced VIN provider returned an unsuccessful response",
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
          throw new ServiceUnavailableException(
            "Advanced VIN provider request timed out",
          );
        }

        if (status === 400 || status === 404 || status === 422) {
          throw new BadGatewayException(
            "Advanced VIN provider could not decode this VIN",
          );
        }

        if (status === 401 || status === 403) {
          this.logger.error(
            `Advanced VIN authentication failed with HTTP ${status}`,
          );

          throw new ServiceUnavailableException(
            "Advanced VIN provider authentication failed",
          );
        }

        if (status === 429) {
          throw new ServiceUnavailableException(
            "Advanced VIN provider rate limit exceeded",
          );
        }

        if (status !== undefined && status >= 500) {
          throw new ServiceUnavailableException(
            "Advanced VIN provider is temporarily unavailable",
          );
        }

        throw new BadGatewayException(
          "Advanced VIN provider request failed",
        );
      }

      this.logger.error(
        `Unexpected Advanced VIN error: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );

      throw new BadGatewayException(
        "Advanced VIN provider request failed",
      );
    }
  }
}
