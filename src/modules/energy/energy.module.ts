import { Module } from "@nestjs/common";

import { GarageModule } from "../garage/garage.module";
import { MileageModule } from "../mileage/mileage.module";
import { VehicleHistoryModule } from "../vehicle-history/vehicle-history.module";
import { VehicleProfileModule } from "../vehicle-profile/vehicle-profile.module";

import { EnergyController } from "./controllers/energy.controller";
import { EnergyDbService } from "./energy.db.service";
import { EnergyConsumptionService } from "./services/energy-consumption.service";
import { EnergyCostCalculatorService } from "./services/energy-cost-calculator.service";
import { EnergyEntryValidatorService } from "./services/energy-entry-validator.service";
import { EnergyService } from "./services/energy.service";
import { EnergySummaryService } from "./services/energy-summary.service";

@Module({
  imports: [
    GarageModule,
    MileageModule,
    VehicleHistoryModule,
    VehicleProfileModule,

  ],

  controllers: [EnergyController],

  providers: [
    EnergyDbService,
    EnergyEntryValidatorService,
    EnergyCostCalculatorService,
    EnergyConsumptionService,
    EnergySummaryService,
    EnergyService,
  ],

  exports: [EnergyService],
})
export class EnergyModule {}
