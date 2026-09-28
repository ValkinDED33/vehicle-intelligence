import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";

import { AiGatewayModule } from "./common/ai-gateway/ai-gateway.module";
import { JwtAuthModule } from "./common/auth/jwt-auth.module";
import { DatabaseModule } from "./common/database/database.module";
import { HealthModule } from "./common/health/health.module";
import { ObjectStorageModule } from "./common/object-storage/object-storage.module";
import { VehicleDatabasesModule } from "./common/vehicle-databases/vehicle-databases.module";

import { AssistantModule } from "./modules/assistant/assistant.module";
import { DocumentsModule } from "./modules/documents/documents.module";
import { EnergyModule } from "./modules/energy/energy.module";
import { ExpensesModule } from "./modules/expenses/expenses.module";
import { ExternalReportsModule } from "./modules/external-reports/external-reports.module";
import { GarageModule } from "./modules/garage/garage.module";
import { IdentityModule } from "./modules/identity/identity.module";
import { MaintenanceModule } from "./modules/maintenance/maintenance.module";
import { MileageModule } from "./modules/mileage/mileage.module";
import { ServiceRecordsModule } from "./modules/service-records/service-records.module";
import { VehicleHistoryModule } from "./modules/vehicle-history/vehicle-history.module";
import { VehicleProfileModule } from "./modules/vehicle-profile/vehicle-profile.module";
import { VinModule } from "./modules/vin/vin.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: (config: Record<string, unknown>) => {
        const required = ["DATABASE_URL", "JWT_SECRET"];
        const missing = required.filter((key) => !config[key]);

        if (missing.length > 0) {
          throw new Error(
            `Missing required environment variables: ${missing.join(", ")}`,
          );
        }

        return config;
      },
    }),

    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120,
      },
    ]),

    JwtAuthModule,
    DatabaseModule,
    AiGatewayModule,
    ObjectStorageModule,
    VehicleDatabasesModule,
    HealthModule,

    IdentityModule,
    GarageModule,
    VehicleProfileModule,
    VinModule,
    VehicleHistoryModule,
    MileageModule,
    MaintenanceModule,
    EnergyModule,
    ExpensesModule,
    ServiceRecordsModule,
    DocumentsModule,
    ExternalReportsModule,
    AssistantModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
