import { Module } from "@nestjs/common";

import { EnergyModule } from "../energy/energy.module";
import { GarageModule } from "../garage/garage.module";
import { MileageModule } from "../mileage/mileage.module";
import { VehicleHistoryModule } from "../vehicle-history/vehicle-history.module";

import { ExpensesController } from "./controllers/expenses.controller";
import { ExpensesDbService } from "./expenses.db.service";
import { CostOfOwnershipMessageBuilderService } from "./services/cost-of-ownership-message-builder.service";
import { CostOfOwnershipService } from "./services/cost-of-ownership.service";
import { ExpenseCostCalculatorService } from "./services/expense-cost-calculator.service";
import { ExpenseEntryValidatorService } from "./services/expense-entry-validator.service";
import { ExpensesService } from "./services/expenses.service";

@Module({
  imports: [
    GarageModule,
    EnergyModule,
    MileageModule,
    VehicleHistoryModule,

  ],

  controllers: [ExpensesController],

  providers: [
    ExpensesDbService,
    ExpenseEntryValidatorService,
    ExpenseCostCalculatorService,
    CostOfOwnershipMessageBuilderService,
    CostOfOwnershipService,
    ExpensesService,
  ],

  exports: [ExpensesService],
})
export class ExpensesModule {}
