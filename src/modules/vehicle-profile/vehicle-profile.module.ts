import { Module } from "@nestjs/common";

import { GarageModule } from "../garage/garage.module";
import { VehicleProfileController } from "./controllers/vehicle-profile.controller";
import { VehicleProfileService } from "./services/vehicle-profile.service";
import { VehicleProfileDbService } from "./vehicle-profile.db.service";

@Module({
  imports: [
    GarageModule,
  ],
  controllers: [VehicleProfileController],
  providers: [VehicleProfileDbService, VehicleProfileService],
  exports: [VehicleProfileService],
})
export class VehicleProfileModule {}
