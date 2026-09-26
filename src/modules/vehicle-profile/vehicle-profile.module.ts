import { Module, OnModuleInit } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { ModuleRegistryService } from "../../common/module-registry/module-registry.service";
import { GarageModule } from "../garage/garage.module";
import { VehicleProfileController } from "./controllers/vehicle-profile.controller";
import { VehicleProfileService } from "./services/vehicle-profile.service";
import { VehicleProfileDbService } from "./vehicle-profile.db.service";

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
  controllers: [VehicleProfileController],
  providers: [VehicleProfileDbService, VehicleProfileService],
  exports: [VehicleProfileService],
})
export class VehicleProfileModule implements OnModuleInit {
  constructor(private readonly moduleRegistry: ModuleRegistryService) {}

  onModuleInit(): void {
    this.moduleRegistry.register({
      id: "vehicle-profile",
      version: "0.1.0",
      description: "Версионируемый технический профиль конкретного автомобиля",
      commands: [
        {
          name: "vehicle-profile.current",
          description: "Получить текущий технический профиль автомобиля",
        },
        {
          name: "vehicle-profile.history",
          description: "Получить историю версий технического профиля",
        },
        {
          name: "vehicle-profile.create-version",
          description: "Создать новую версию технического профиля",
        },
      ],
      events: [],
      data: ["vehicle_profiles"],
      aiTools: [],
      notifications: [],
      uiSlots: [
        {
          slot: "vehicle-technical-profile",
          description: "Технические характеристики конкретного автомобиля",
        },
      ],
      telegramActions: [],
      permissions: [
        {
          scope: "self.vehicle-profile",
          access: "read-write",
        },
      ],
    });
  }
}
