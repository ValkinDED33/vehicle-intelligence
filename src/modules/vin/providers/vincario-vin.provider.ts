import { HttpService } from "@nestjs/axios";
import {
  BadGatewayException,
  Injectable,
  HttpException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "crypto";
import { firstValueFrom } from "rxjs";
import { isAxiosError } from "axios";

import {
  type VinDecodeResult,
  type VinProvider,
} from "./vin-provider.interface";
import { mapVincarioResponse } from "./vincario/vincario.mapper";

const DEFAULT_VINCARIO_BASE_URL = "https://api.vincario.com/3.2";
const VINCARIO_DECODE_ID = "decode";

@Injectable()
export class VincarioVinProvider implements VinProvider {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async decode(vin: string): Promise<VinDecodeResult> {
    const normalizedVin = vin.trim().toUpperCase();
    const apiKey = this.configService.get<string>("VINCARIO_API_KEY")?.trim();
    const secretKey = this.configService
      .get<string>("VINCARIO_SECRET_KEY")
      ?.trim();

    if (!apiKey || !secretKey) {
      throw new ServiceUnavailableException({
        message:
          "Vincario не налаштовано: додайте VINCARIO_API_KEY і VINCARIO_SECRET_KEY.",
        code: "VINCARIO_NOT_CONFIGURED",
      });
    }

    const url = this.buildDecodeUrl(normalizedVin, apiKey, secretKey);

    try {
      const response = await firstValueFrom(
        this.httpService.get<Record<string, unknown>>(url, {
          timeout: 30_000,
          headers: {
            Accept: "application/json",
          },
        }),
      );

      const payload = response.data;
      if (!payload || typeof payload !== "object" || payload.error || !["decode", "attributes", "vehicle"].some(key => {
        const section = payload[key];
        return section && typeof section === "object" && Object.keys(section).length > 0;
      })) throw new BadGatewayException({ code: "VINCARIO_INVALID_RESPONSE", message: "Vincario returned no vehicle data" });
      return mapVincarioResponse(payload);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (isAxiosError(error) && [401, 403, 429].includes(error.response?.status ?? 0)) {
        throw new ServiceUnavailableException({
          code: error.response?.status === 429 ? "VIN_PROVIDER_RATE_LIMITED" : "VIN_PROVIDER_AUTH_FAILED",
          message: "Vincario rejected the request",
        });
      }
      throw new BadGatewayException({
        message: "Vincario request failed",
        code: "VINCARIO_REQUEST_FAILED",
      });
    }
  }

  private buildDecodeUrl(vin: string, apiKey: string, secretKey: string): string {
    const baseUrl = (
      this.configService.get<string>("VINCARIO_BASE_URL") ??
      DEFAULT_VINCARIO_BASE_URL
    ).replace(/\/+$/, "");

    const controlSum = createHash("sha1")
      .update(`${vin}|${VINCARIO_DECODE_ID}|${apiKey}|${secretKey}`)
      .digest("hex")
      .slice(0, 10);

    return `${baseUrl}/${apiKey}/${controlSum}/${VINCARIO_DECODE_ID}/${encodeURIComponent(vin)}.json`;
  }
}
