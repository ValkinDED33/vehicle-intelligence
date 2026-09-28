import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { GarageModule } from "../garage/garage.module";
import { VehicleProfileModule } from "../vehicle-profile/vehicle-profile.module";

import { VinController } from "./controllers/vin.controller";
import { VIN_PROVIDER_TOKEN } from "./providers/vin-provider.interface";
import { VehicleDatabasesVinProvider } from "./providers/vehicle-databases-vin.provider";
import { AdvancedVinProvider } from "./providers/advanced-vin/advanced-vin.provider";
import { VincarioVinProvider } from "./providers/vincario-vin.provider";
import { VinService } from "./services/vin.service";
import { VinDbService } from "./vin.db.service";

@Module({
  imports: [
    GarageModule,
    VehicleProfileModule,
  ],

  controllers: [VinController],

  providers: [
    VinDbService,
    VinService,
    VehicleDatabasesVinProvider,
    VincarioVinProvider,
    AdvancedVinProvider,
    {
      provide: VIN_PROVIDER_TOKEN,
      inject: [
        ConfigService,
        VehicleDatabasesVinProvider,
        VincarioVinProvider,
      ],
      useFactory: (
        configService: ConfigService,
        vehicleDatabasesProvider: VehicleDatabasesVinProvider,
        vincarioProvider: VincarioVinProvider,
      ) => {
        const provider = configService
          .get<string>("VIN_PROVIDER")
          ?.trim()
          .toLowerCase();

        return provider === "vincario"
          ? vincarioProvider
          : vehicleDatabasesProvider;
      },
    },
  ],

  exports: [VinService],
})
export class VinModule {}
