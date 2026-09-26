import { Module, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule, type JwtModuleOptions } from "@nestjs/jwt";

import { ModuleRegistryService } from "../../common/module-registry/module-registry.service";
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
export class EnergyModule implements OnModuleInit {
  constructor(private readonly moduleRegistry: ModuleRegistryService) {}

  onModuleInit(): void {
    this.moduleRegistry.register({
      id: "energy",
      version: "0.1.0",

      description:
        "Fuel, charging, discounts, consumption and operating-cost analytics",

      commands: [
        {
          name: "energy.record",
          description: "Record a refuel or charging operation",
        },
        {
          name: "energy.history",
          description: "Read fuel and charging history",
        },
        {
          name: "energy.latest",
          description: "Read latest fuel or charging entry",
        },
        {
          name: "energy.full-to-full",
          description: "Calculate latest full-to-full fuel consumption",
        },
        {
          name: "energy.monthly-summary",
          description:
            "Calculate monthly fuel, charging, discount and cost analytics",
        },
      ],

      events: [
        {
          type: "energy.refuel",
          direction: "publishes",
          description: "Published when a fuel entry is recorded",
        },
        {
          type: "energy.charge",
          direction: "publishes",
          description: "Published when a charging entry is recorded",
        },
      ],

      data: ["energy_entries"],

      aiTools: [
        {
          name: "vehicle.energy.summary",
          description:
            "Explain fuel or charging consumption and costs for a vehicle",
        },
      ],

      notifications: [],

      uiSlots: [
        {
          slot: "vehicle-energy",
          description:
            "Fuel, charging, consumption, discounts and cost analytics",
        },
      ],

      telegramActions: [
        {
          command: "energy-entry",
          description:
            "Record fuel or charging information from conversational input",
        },
      ],

      permissions: [
        {
          scope: "self.vehicle-energy",
          access: "read-write",
        },
      ],
    });
  }
}
