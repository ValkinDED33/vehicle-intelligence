import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AiGatewayModule } from "./common/ai-gateway/ai-gateway.module";
import { DatabaseModule } from "./common/database/database.module";
import { EventBusModule } from "./common/event-bus/event-bus.module";
import { HealthModule } from "./common/health/health.module";
import { ModuleRegistryModule } from "./common/module-registry/module-registry.module";
import { ObjectStorageModule } from "./common/object-storage/object-storage.module";

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
    }),

    DatabaseModule,
    EventBusModule,
    ModuleRegistryModule,
    AiGatewayModule,
    ObjectStorageModule,
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
  ],
})
export class AppModule {}
