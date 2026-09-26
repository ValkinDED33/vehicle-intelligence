import { Module, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule, type JwtModuleOptions } from "@nestjs/jwt";

import { ModuleRegistryService } from "../../common/module-registry/module-registry.service";
import { GarageModule } from "../garage/garage.module";
import { VehicleHistoryModule } from "../vehicle-history/vehicle-history.module";
import { MileageController } from "./controllers/mileage.controller";
import { MileageDbService } from "./mileage.db.service";
import { MileageService } from "./services/mileage.service";

@Module({
  imports: [
    GarageModule,
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
  controllers: [MileageController],
  providers: [MileageDbService, MileageService],
  exports: [MileageService],
})
export class MileageModule implements OnModuleInit {
  constructor(private readonly moduleRegistry: ModuleRegistryService) {}

  onModuleInit(): void {
    this.moduleRegistry.register({
      id: "mileage",
      version: "0.1.0",
      description: "Vehicle odometer and engine-hours history",
      commands: [
        {
          name: "mileage.record",
          description:
            "Record vehicle odometer and optional engine-hours reading",
        },
        {
          name: "mileage.latest",
          description: "Get latest vehicle mileage reading",
        },
        {
          name: "mileage.history",
          description: "Get vehicle mileage history",
        },
        {
          name: "mileage.stale",
          description: "Check whether vehicle mileage data is stale",
        },
      ],
      events: [
        {
          type: "vehicle.mileage_updated",
          direction: "publishes",
          description: "Published when a new mileage reading is recorded",
        },
      ],
      data: ["mileage_readings"],
      aiTools: [],
      notifications: [],
      uiSlots: [
        {
          slot: "vehicle-mileage",
          description: "Current odometer, engine hours and mileage history",
        },
      ],
      telegramActions: [],
      permissions: [
        {
          scope: "self.vehicle-mileage",
          access: "read-write",
        },
      ],
    });
  }
}
