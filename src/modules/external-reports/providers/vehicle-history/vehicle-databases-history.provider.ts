import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { VehicleDatabasesClientService, VehicleDatabasesNoRecordsError } from "../../../../common/vehicle-databases/vehicle-databases-client.service";
import {
  type VehicleHistoryProvider,
  type VehicleHistoryProviderResult,
} from "./vehicle-history-provider.interface";

@Injectable()
export class VehicleDatabasesHistoryProvider
  implements VehicleHistoryProvider
{
  constructor(
    private readonly vehicleDatabasesClient: VehicleDatabasesClientService,
    private readonly configService: ConfigService,
  ) {}

  async getHistory(
    vin: string,
  ): Promise<VehicleHistoryProviderResult> {
    const normalizedVin = vin.trim().toUpperCase();

    if (!normalizedVin) {
      throw new BadGatewayException(
        "Vehicle history provider requires a VIN",
      );
    }

    const configuredUrl = this.configService
      .get<string>("VEHICLE_HISTORY_PROVIDER_URL")
      ?.trim();

    if (!configuredUrl) {
      throw new ServiceUnavailableException(
        "Vehicle history provider URL is not configured",
      );
    }

    let rawPayload: Record<string, unknown>;

    try {
      rawPayload = await this.vehicleDatabasesClient.fetch({
        apiName: "Vehicle history provider",
        url: this.vehicleDatabasesClient.buildVinUrl(
          configuredUrl,
          normalizedVin,
        ),
      });
    } catch (error) {
      if (error instanceof VehicleDatabasesNoRecordsError) {
        throw new BadGatewayException(
          "Vehicle history provider could not find this VIN",
        );
      }

      throw error;
    }

    return {
      provider: "vehicle-databases",
      vin: normalizedVin,
      rawPayload,
    };
  }
}
