import { Module, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule, type JwtModuleOptions } from "@nestjs/jwt";

import { ModuleRegistryService } from "../../common/module-registry/module-registry.service";
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

    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService): JwtModuleOptions => {
        const jwtSecret = configService.get<string>("JWT_SECRET");

        if (!jwtSecret) {
          throw new Error("JWT_SECRET environment variable is required");
        }

        return {
          secret: jwtSecret,
          signOptions: {
            expiresIn: "7d",
          },
        };
      },
    }),
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
export class ExpensesModule implements OnModuleInit {
  constructor(private readonly moduleRegistry: ModuleRegistryService) {}

  onModuleInit(): void {
    this.moduleRegistry.register({
      id: "expenses",
      version: "0.1.0",

      description: "Vehicle expenses and total cost-of-ownership analytics",

      commands: [
        {
          name: "expenses.record",
          description: "Record a non-energy vehicle expense",
        },
        {
          name: "expenses.history",
          description: "Read vehicle expense history",
        },
        {
          name: "expenses.monthly-summary",
          description: "Calculate monthly vehicle cost of ownership",
        },
      ],

      events: [
        {
          type: "expense.recorded",
          direction: "publishes",
          description: "Published when a vehicle expense is recorded",
        },
      ],

      data: ["expenses"],

      aiTools: [
        {
          name: "vehicle.cost-of-ownership.summary",
          description:
            "Explain vehicle expenses, energy costs and cost per kilometer",
        },
      ],

      notifications: [],

      uiSlots: [
        {
          slot: "vehicle-expenses",
          description: "Vehicle expenses and ownership-cost analytics",
        },
      ],

      telegramActions: [
        {
          command: "expense-entry",
          description: "Record a vehicle expense from conversational input",
        },
      ],

      permissions: [
        {
          scope: "self.vehicle-expenses",
          access: "read-write",
        },
      ],
    });
  }
}
