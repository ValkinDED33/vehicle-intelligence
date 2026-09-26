import { Module } from "@nestjs/common";

import { GarageModule } from "../garage/garage.module";
import { VehicleProfileModule } from "../vehicle-profile/vehicle-profile.module";

import { VinController } from "./controllers/vin.controller";
import { VIN_PROVIDER_TOKEN } from "./providers/vin-provider.interface";
import { VehicleDatabasesVinProvider } from "./providers/vehicle-databases-vin.provider";
import { AdvancedVinProvider } from "./providers/advanced-vin/advanced-vin.provider";
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
    AdvancedVinProvider,
    {
      provide: VIN_PROVIDER_TOKEN,
      useExisting: VehicleDatabasesVinProvider,
    },
  ],

  exports: [VinService],
})
export class VinModule {}
