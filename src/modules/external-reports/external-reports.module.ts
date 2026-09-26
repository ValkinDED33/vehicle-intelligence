import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { GarageModule } from "../garage/garage.module";

import { ExternalReportsController } from "./controllers/external-reports.controller";
import { ExternalReportsDbService } from "./external-reports.db.service";
import { VehicleDatabasesHistoryProvider } from "./providers/vehicle-history/vehicle-databases-history.provider";
import { VEHICLE_HISTORY_PROVIDER_TOKEN } from "./providers/vehicle-history/vehicle-history-provider.interface";
import { ExternalReportsService } from "./services/external-reports.service";

@Module({
  imports: [
    HttpModule,
    GarageModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: {
        expiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
      },
    }),
  ],
  controllers: [
    ExternalReportsController,
  ],
  providers: [
    ExternalReportsDbService,
    ExternalReportsService,

    VehicleDatabasesHistoryProvider,

    {
      provide: VEHICLE_HISTORY_PROVIDER_TOKEN,
      useExisting: VehicleDatabasesHistoryProvider,
    },
  ],
  exports: [
    ExternalReportsDbService,
    ExternalReportsService,
    VEHICLE_HISTORY_PROVIDER_TOKEN,
  ],
})
export class ExternalReportsModule {}
