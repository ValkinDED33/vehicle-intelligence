import { Module } from "@nestjs/common";

import { GarageModule } from "../garage/garage.module";
import { VehicleHistoryController } from "./controllers/vehicle-history.controller";
import { VehicleHistoryService } from "./services/vehicle-history.service";
import { VehicleHistoryDbService } from "./vehicle-history.db.service";

@Module({
  imports: [
    GarageModule,
  ],
  controllers: [VehicleHistoryController],
  providers: [VehicleHistoryDbService, VehicleHistoryService],
  exports: [VehicleHistoryService],
})
export class VehicleHistoryModule {}
