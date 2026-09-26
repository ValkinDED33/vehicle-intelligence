import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { VehicleDatabasesClientService } from "../../../common/vehicle-databases/vehicle-databases-client.service";
import {
  type VinDecodeResult,
  type VinProvider,
} from "./vin-provider.interface";
import { mapVehicleDatabasesResponse } from "./vehicle-databases/vehicle-databases.mapper";
import { type VehicleDatabasesResponse } from "./vehicle-databases/vehicle-databases.types";

const DEFAULT_VIN_PROVIDER_URL =
  "https://api.vehicledatabases.com/europe-vin-decode/v2/{vin}";

@Injectable()
export class VehicleDatabasesVinProvider implements VinProvider {
  constructor(
    private readonly vehicleDatabasesClient: VehicleDatabasesClientService,
    private readonly configService: ConfigService,
  ) {}

  async decode(vin: string): Promise<VinDecodeResult> {
    const normalizedVin = vin.trim().toUpperCase();

    const data = await this.vehicleDatabasesClient.fetch<
      NonNullable<VehicleDatabasesResponse["data"]>
    >({
      apiName: "VIN provider",
      url: this.buildUrl(normalizedVin),
    });

    return mapVehicleDatabasesResponse(data);
  }

  private buildUrl(vin: string): string {
    const configuredUrl = this.configService
      .get<string>("VIN_PROVIDER_URL")
      ?.trim();

    return this.vehicleDatabasesClient.buildVinUrl(
      configuredUrl || DEFAULT_VIN_PROVIDER_URL,
      vin,
    );
  }
}
