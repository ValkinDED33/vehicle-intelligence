import { HttpService } from "@nestjs/axios";
import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { firstValueFrom } from "rxjs";

interface VehicleDatabasesEnvelope<TData> {
  status?: string;
  data?: TData;
}

/**
 * Upstream answers HTTP 400 with {status:"error", message:"Record(s) were not
 * found for this vehicle"} when it simply has no data for the VIN. That is a
 * legitimate result, not a provider failure — callers decide how to present it.
 */
export class VehicleDatabasesNoRecordsError extends Error {
  constructor(apiName: string) {
    super(`${apiName}: record(s) were not found for this vehicle`);
    this.name = "VehicleDatabasesNoRecordsError";
  }
}

function isNoRecordsBody(body: unknown): boolean {
  if (!body || typeof body !== "object") {
    return false;
  }

  const status = (body as { status?: unknown }).status;

  if (typeof status !== "string" || status.toLowerCase() !== "error") {
    return false;
  }

  return /not found/i.test(JSON.stringify(body));
}

/**
 * Upstream answers HTTP 403 with {"message":"Out of call volume quota."} when
 * the API key has exhausted its subscription call volume. Retryable later, and
 * distinct from a real authentication failure.
 */
function isQuotaBody(body: unknown): boolean {
  if (!body || typeof body !== "object") {
    return false;
  }

  return /quota/i.test(JSON.stringify(body));
}

export interface VehicleDatabasesRequestOptions {
  /** Human-readable API name used in logs and error messages. */
  apiName: string;
  url: string;
}

@Injectable()
export class VehicleDatabasesClientService {
  private readonly logger = new Logger(VehicleDatabasesClientService.name);
  private readonly timeoutMs = 30_000;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async fetch<TData = Record<string, unknown>>(
    options: VehicleDatabasesRequestOptions,
  ): Promise<TData> {
    const apiKey = this.configService
      .get<string>("VIN_PROVIDER_API_KEY")
      ?.trim();

    if (!apiKey) {
      throw new ServiceUnavailableException(
        "VIN provider API key is not configured",
      );
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get<VehicleDatabasesEnvelope<TData>>(options.url, {
          headers: {
            "x-authkey": apiKey,
            Accept: "application/json",
          },
          timeout: this.timeoutMs,
        }),
      );

      const payload = response.data;

      if (isNoRecordsBody(payload)) {
        throw new VehicleDatabasesNoRecordsError(options.apiName);
      }

      // Some endpoints (auction, stolen-check) return data as an array.
      if (
        !payload ||
        payload.status?.toLowerCase() !== "success" ||
        payload.data === undefined ||
        payload.data === null ||
        typeof payload.data !== "object"
      ) {
        this.logger.warn(
          `${options.apiName} returned an unsuccessful response`,
        );

        throw new BadGatewayException(
          `${options.apiName} returned an unsuccessful response`,
        );
      }

      return payload.data;
    } catch (error: unknown) {
      if (
        error instanceof BadGatewayException ||
        error instanceof ServiceUnavailableException ||
        error instanceof VehicleDatabasesNoRecordsError
      ) {
        throw error;
      }

      if (axios.isAxiosError(error)) {
        const status = error.response?.status;

        if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
          this.logger.warn(`${options.apiName} request timed out`);

          throw new ServiceUnavailableException(
            `${options.apiName} request timed out`,
          );
        }

        if (status === 400 || status === 404 || status === 422) {
          if (isNoRecordsBody(error.response?.data)) {
            throw new VehicleDatabasesNoRecordsError(options.apiName);
          }

          throw new BadGatewayException(
            `${options.apiName} could not handle this request`,
          );
        }

        if (status === 401 || status === 403) {
          if (isQuotaBody(error.response?.data)) {
            this.logger.warn(
              `${options.apiName} provider call quota exhausted`,
            );

            throw new ServiceUnavailableException(
              `${options.apiName} provider quota exhausted`,
            );
          }

          this.logger.error(
            `${options.apiName} authentication failed with HTTP ${status}`,
          );

          throw new ServiceUnavailableException(
            `${options.apiName} authentication failed`,
          );
        }

        if (status === 429) {
          this.logger.warn(`${options.apiName} rate limit exceeded`);

          throw new ServiceUnavailableException(
            `${options.apiName} rate limit exceeded`,
          );
        }

        if (status !== undefined && status >= 500) {
          this.logger.warn(
            `${options.apiName} upstream error: HTTP ${status}`,
          );

          throw new ServiceUnavailableException(
            `${options.apiName} is temporarily unavailable`,
          );
        }

        this.logger.error(
          `${options.apiName} request failed. ` +
            `HTTP ${status ?? "NO_RESPONSE"}, code ${error.code ?? "UNKNOWN"}`,
        );

        throw new BadGatewayException(`${options.apiName} request failed`);
      }

      this.logger.error(
        `Unexpected ${options.apiName} error: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );

      throw new BadGatewayException(`${options.apiName} request failed`);
    }
  }

  buildVinUrl(baseUrl: string, vin: string): string {
    if (baseUrl.includes("{vin}")) {
      return baseUrl.replace("{vin}", encodeURIComponent(vin));
    }

    return `${baseUrl.replace(/\/+$/, "")}/${encodeURIComponent(vin)}`;
  }
}
