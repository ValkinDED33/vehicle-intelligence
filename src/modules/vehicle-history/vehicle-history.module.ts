import { Module, OnModuleInit } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { ModuleRegistryService } from "../../common/module-registry/module-registry.service";
import { GarageModule } from "../garage/garage.module";
import { VehicleHistoryController } from "./controllers/vehicle-history.controller";
import { VehicleHistoryService } from "./services/vehicle-history.service";
import { VehicleHistoryDbService } from "./vehicle-history.db.service";

@Module({
  imports: [
    GarageModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: {
        expiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
      },
    }),
  ],
  controllers: [VehicleHistoryController],
  providers: [VehicleHistoryDbService, VehicleHistoryService],
  exports: [VehicleHistoryService],
})
export class VehicleHistoryModule implements OnModuleInit {
  constructor(private readonly moduleRegistry: ModuleRegistryService) {}

  onModuleInit(): void {
    this.moduleRegistry.register({
      id: "vehicle-history",
      version: "0.1.0",
      description:
        "Permanent chronological history of vehicle facts and events",
      commands: [
        {
          name: "vehicle-history.record",
          description: "Record a vehicle history event",
        },
        {
          name: "vehicle-history.list",
          description: "Read vehicle history",
        },
        {
          name: "vehicle-history.latest",
          description: "Read latest vehicle history event",
        },
      ],
      events: [],
      data: ["vehicle_history_events"],
      aiTools: [],
      notifications: [],
      uiSlots: [
        {
          slot: "vehicle-history",
          description: "Chronological timeline of vehicle events",
        },
      ],
      telegramActions: [],
      permissions: [
        {
          scope: "self.vehicle-history",
          access: "read-write",
        },
      ],
    });
  }
}
