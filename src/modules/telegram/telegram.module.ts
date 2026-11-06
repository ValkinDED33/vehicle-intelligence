import { Module } from "@nestjs/common";

import { AssistantModule } from "../assistant/assistant.module";
import { DocumentsModule } from "../documents/documents.module";
import { EnergyModule } from "../energy/energy.module";
import { ExpensesModule } from "../expenses/expenses.module";
import { GarageModule } from "../garage/garage.module";
import { IdentityModule } from "../identity/identity.module";
import { MileageModule } from "../mileage/mileage.module";
import { ServiceRecordsModule } from "../service-records/service-records.module";
import { VinModule } from "../vin/vin.module";
import { VinAccessModule } from "../vin-access/vin-access.module";

import { TelegramController } from "./telegram.controller";
import { TelegramService } from "./telegram.service";
import { TelegramSessionService } from "./telegram-session.service";
import { TelegramConversationService } from "./telegram-conversation.service";
import { TelegramActionsService } from "./telegram-actions.service";
import { MaintenanceModule } from "../maintenance/maintenance.module";
import { VehicleProfileModule } from "../vehicle-profile/vehicle-profile.module";
import { ExternalReportsModule } from "../external-reports/external-reports.module";
import { TelegramReportsService } from "./telegram-reports.service";
import { RemindersModule } from "../reminders/reminders.module";

@Module({
  imports: [
    VinAccessModule,
    AssistantModule,
    DocumentsModule,
    EnergyModule,
    ExpensesModule,
    GarageModule,
    IdentityModule,
    MileageModule,
    ServiceRecordsModule,
    VinModule,
    MaintenanceModule,
    VehicleProfileModule,
    ExternalReportsModule,
    RemindersModule,
  ],
  controllers: [TelegramController],
  providers: [TelegramService, TelegramSessionService, TelegramConversationService, TelegramActionsService, TelegramReportsService],
})
export class TelegramModule {}
