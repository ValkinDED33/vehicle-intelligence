import { Module, OnModuleInit } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { ModuleRegistryService } from "../../common/module-registry/module-registry.service";
import { GarageController } from "./controllers/garage.controller";
import { GarageDbService } from "./garage.db.service";
import { GarageService } from "./services/garage.service";

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: {
        expiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
      },
    }),
  ],
  controllers: [GarageController],
  providers: [GarageDbService, GarageService],
  exports: [GarageService],
})
export class GarageModule implements OnModuleInit {
  constructor(private readonly moduleRegistry: ModuleRegistryService) {}

  onModuleInit(): void {
    this.moduleRegistry.register({
      id: "garage",
      version: "0.1.0",
      description: "Гараж пользователя и базовые профили автомобилей",

      commands: [
        {
          name: "vehicle.create",
          description: "Добавить автомобиль в гараж",
        },
        {
          name: "vehicle.list",
          description: "Получить автомобили владельца",
        },
        {
          name: "vehicle.get",
          description: "Получить автомобиль",
        },
        {
          name: "vehicle.update",
          description: "Обновить базовые данные автомобиля",
        },
        {
          name: "vehicle.archive",
          description: "Архивировать автомобиль",
        },
        {
          name: "vehicle.restore",
          description: "Восстановить автомобиль из архива",
        },
      ],

      events: [],

      data: ["vehicles"],

      aiTools: [],

      notifications: [],

      uiSlots: [
        {
          slot: "garage",
          description: "Гараж и список автомобилей пользователя",
        },
        {
          slot: "vehicle-profile",
          description: "Профиль конкретного автомобиля",
        },
      ],

      telegramActions: [],

      permissions: [
        {
          scope: "self.vehicles",
          access: "read-write",
        },
      ],
    });
  }
}
