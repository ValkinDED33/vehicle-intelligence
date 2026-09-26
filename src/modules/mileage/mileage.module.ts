import { Module } from "@nestjs/common";

import { GarageModule } from "../garage/garage.module";
import { VehicleHistoryModule } from "../vehicle-history/vehicle-history.module";
import { MileageController } from "./controllers/mileage.controller";
import { MileageDbService } from "./mileage.db.service";
import { MileageAnomalyService } from "./services/mileage-anomaly.service";
import { MileageService } from "./services/mileage.service";

@Module({
  imports: [
    GarageModule,
    VehicleHistoryModule,

  ],
  controllers: [MileageController],
  providers: [MileageDbService, MileageService, MileageAnomalyService],
  exports: [MileageService, MileageAnomalyService],
})
export class MileageModule {}
