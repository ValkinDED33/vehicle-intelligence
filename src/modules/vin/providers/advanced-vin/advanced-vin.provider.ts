import { BadGatewayException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { VehicleDatabasesClientService } from "../../../../common/vehicle-databases/vehicle-databases-client.service";

export interface AdvancedVinResult {
  provider: "vehicle-databases";
  vin: string;
  rawPayload: Record<string, unknown>;
}

const DEFAULT_ADVANCED_VIN_URL =
  "https://api.vehicledatabases.com/advanced-vin-decode/v2/{vin}";

@Injectable()
export class AdvancedVinProvider {
  constructor(
    private readonly vehicleDatabasesClient: VehicleDatabasesClientService,
    private readonly configService: ConfigService,
  ) {}

  async decode(vin: string): Promise<AdvancedVinResult> {
    const normalizedVin = vin.trim().toUpperCase();

    if (!normalizedVin) {
      throw new BadGatewayException("Advanced VIN provider requires a VIN");
    }

    const configuredUrl = this.configService
      .get<string>("ADVANCED_VIN_PROVIDER_URL")
      ?.trim();

    const rawPayload = await this.vehicleDatabasesClient.fetch({
      apiName: "Advanced VIN provider",
      url: this.vehicleDatabasesClient.buildVinUrl(
        configuredUrl || DEFAULT_ADVANCED_VIN_URL,
        normalizedVin,
      ),
    });

    return {
      provider: "vehicle-databases",
      vin: normalizedVin,
      rawPayload,
    };
  }
}
