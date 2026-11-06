import { Module } from "@nestjs/common";

import { GarageModule } from "../garage/garage.module";
import { MaintenanceModule } from "../maintenance/maintenance.module";
import { MileageModule } from "../mileage/mileage.module";
import { VehicleProfileModule } from "../vehicle-profile/vehicle-profile.module";
import { VinModule } from "../vin/vin.module";
import { DocumentsModule } from "../documents/documents.module";
import { EnergyModule } from "../energy/energy.module";
import { ExpensesModule } from "../expenses/expenses.module";
import { ExternalReportsModule } from "../external-reports/external-reports.module";
import { ServiceRecordsModule } from "../service-records/service-records.module";
import { VehicleHistoryModule } from "../vehicle-history/vehicle-history.module";
import { AssistantController } from "./assistant.controller";
import { AssistantService } from "./assistant.service";
import { RemindersModule } from "../reminders/reminders.module";
import { AssistantMemoryService } from "./assistant-memory.service";
import { AssistantConversationService } from "./assistant-conversation.service";

@Module({
  imports: [
    GarageModule,
    VehicleProfileModule,
    MileageModule,
    MaintenanceModule,
    VinModule,
    DocumentsModule,
    EnergyModule,
    ExpensesModule,
    ExternalReportsModule,
    ServiceRecordsModule,
    VehicleHistoryModule,
    RemindersModule,
  ],
  controllers: [AssistantController],
  providers: [AssistantService, AssistantMemoryService, AssistantConversationService],
  exports: [AssistantService, AssistantMemoryService, AssistantConversationService],
})
export class AssistantModule {}
