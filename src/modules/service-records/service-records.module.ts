import { Module, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule, type JwtModuleOptions } from "@nestjs/jwt";

import { ModuleRegistryService } from "../../common/module-registry/module-registry.service";
import { GarageModule } from "../garage/garage.module";
import { VehicleHistoryModule } from "../vehicle-history/vehicle-history.module";

import { ServiceRecordsController } from "./controllers/service-records.controller";
import { ServiceRecordsDbService } from "./service-records.db.service";
import { ServiceRecordItemPreparerService } from "./services/service-record-item-preparer.service";
import { ServiceRecordValidatorService } from "./services/service-record-validator.service";
import { ServiceRecordsService } from "./services/service-records.service";

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

  controllers: [ServiceRecordsController],

  providers: [
    ServiceRecordsDbService,
    ServiceRecordValidatorService,
    ServiceRecordItemPreparerService,
    ServiceRecordsService,
  ],

  exports: [ServiceRecordsService],
})
export class ServiceRecordsModule implements OnModuleInit {
  constructor(private readonly moduleRegistry: ModuleRegistryService) {}

  onModuleInit(): void {
    this.moduleRegistry.register({
      id: "service-records",
      version: "0.1.0",

      description:
        "Vehicle service, repair, parts, fluids and maintenance history",

      commands: [
        {
          name: "service-records.create",
          description: "Record completed vehicle service or repair",
        },
        {
          name: "service-records.history",
          description: "Read vehicle service and repair history",
        },
        {
          name: "service-records.get",
          description: "Read a service record with its items",
        },
        {
          name: "service-records.part-history",
          description: "Find service history for a specific part number",
        },
      ],

      events: [
        {
          type: "service.completed",
          direction: "publishes",
          description: "Published when completed service or repair is recorded",
        },
      ],

      data: ["service_records", "service_record_items"],

      aiTools: [
        {
          name: "vehicle.service.history",
          description:
            "Explain completed maintenance, repairs, parts and fluids",
        },
        {
          name: "vehicle.part.history",
          description: "Explain when a specific part was installed or replaced",
        },
      ],

      notifications: [],

      uiSlots: [
        {
          slot: "vehicle-service-history",
          description: "Vehicle maintenance and repair timeline",
        },
      ],

      telegramActions: [
        {
          command: "service-record",
          description:
            "Record completed maintenance or repair from conversational input",
        },
      ],

      permissions: [
        {
          scope: "self.vehicle-service-records",
          access: "read-write",
        },
      ],
    });
  }
}
