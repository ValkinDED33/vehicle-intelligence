import { HttpModule } from "@nestjs/axios";
import { Module, OnModuleInit } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { ModuleRegistryService } from "../../common/module-registry/module-registry.service";

import { GarageModule } from "../garage/garage.module";
import { VehicleProfileModule } from "../vehicle-profile/vehicle-profile.module";

import { VinController } from "./controllers/vin.controller";
import { VIN_PROVIDER_TOKEN } from "./providers/vin-provider.interface";
import { VehicleDatabasesVinProvider } from "./providers/vehicle-databases-vin.provider";
import { VinService } from "./services/vin.service";
import { VinDbService } from "./vin.db.service";

@Module({
  imports: [
    GarageModule,
    VehicleProfileModule,

    HttpModule.register({
      timeout: 15_000,
      maxRedirects: 3,
    }),

    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: {
        expiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
      },
    }),
  ],

  controllers: [VinController],

  providers: [
    VinDbService,
    VinService,
    VehicleDatabasesVinProvider,
    {
      provide: VIN_PROVIDER_TOKEN,
      useExisting: VehicleDatabasesVinProvider,
    },
  ],

  exports: [VinService],
})
export class VinModule implements OnModuleInit {
  constructor(private readonly moduleRegistry: ModuleRegistryService) {}

  onModuleInit(): void {
    this.moduleRegistry.register({
      id: "vin",
      version: "0.1.0",
      description: "VIN decoding and normalized vehicle data ingestion",

      commands: [
        {
          name: "vin.decode",
          description: "Decode VIN for a vehicle",
        },
        {
          name: "vin.latest",
          description: "Get latest VIN decode result",
        },
        {
          name: "vin.history",
          description: "Get VIN decode history",
        },
      ],

      events: [],

      data: ["vin_decodes"],

      aiTools: [],

      notifications: [],

      uiSlots: [],

      telegramActions: [],

      permissions: [
        {
          scope: "self.vehicle-vin",
          access: "read-write",
        },
      ],
    });
  }
}
