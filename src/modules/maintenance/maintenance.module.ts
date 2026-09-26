import { Module, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule, type JwtModuleOptions } from "@nestjs/jwt";

import { ModuleRegistryService } from "../../common/module-registry/module-registry.service";
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

  controllers: [MaintenanceController],

  providers: [
    MaintenanceDbService,
    MaintenanceStatusCalculatorService,
    MaintenanceService,
  ],

  exports: [MaintenanceService],
})
export class MaintenanceModule implements OnModuleInit {
  constructor(private readonly moduleRegistry: ModuleRegistryService) {}

  onModuleInit(): void {
    this.moduleRegistry.register({
      id: "maintenance",
      version: "0.1.0",

      description:
        "Vehicle maintenance rules, intervals and service status calculation",

      commands: [
        {
          name: "maintenance.rule.create",
          description: "Create a maintenance rule for a vehicle",
        },
        {
          name: "maintenance.rules.list",
          description: "List active maintenance rules",
        },
        {
          name: "maintenance.rule.deactivate",
          description: "Deactivate a maintenance rule",
        },
        {
          name: "maintenance.status",
          description: "Calculate current maintenance status",
        },
      ],

      events: [
        {
          type: "maintenance.*",
          direction: "subscribes",
          description:
            "Maintenance completion events stored in vehicle history",
        },
      ],

      data: ["maintenance_rules"],

      aiTools: [],

      notifications: [
        {
          type: "maintenance_due",
          urgencyLevels: [UrgencyLevel.ATTENTION],
          description: "Maintenance interval is approaching",
        },
        {
          type: "maintenance_overdue",
          urgencyLevels: [UrgencyLevel.CHECK_SOON],
          description: "Maintenance interval has been exceeded",
        },
      ],

      uiSlots: [
        {
          slot: "vehicle-maintenance",
          description: "Maintenance schedule and calculated service status",
        },
      ],

      telegramActions: [],

      permissions: [
        {
          scope: "self.vehicle-maintenance",
          access: "read-write",
        },
      ],
    });
  }
}
