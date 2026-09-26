import { Module } from "@nestjs/common";

import { UrgencyLevel } from "../../common/urgency/urgency.enum";
import { GarageModule } from "../garage/garage.module";
import { MileageModule } from "../mileage/mileage.module";
import { VehicleHistoryModule } from "../vehicle-history/vehicle-history.module";

import { MaintenanceController } from "./controllers/maintenance.controller";
import { MaintenanceDbService } from "./maintenance.db.service";
import { MaintenanceStatusCalculatorService } from "./services/maintenance-status-calculator.service";
import { MaintenanceService } from "./services/maintenance.service";

@Module({
  imports: [
    GarageModule,
    MileageModule,
    VehicleHistoryModule,

  ],

  controllers: [MaintenanceController],

  providers: [
    MaintenanceDbService,
    MaintenanceStatusCalculatorService,
    MaintenanceService,
  ],

  exports: [MaintenanceService],
})
export class MaintenanceModule {}
