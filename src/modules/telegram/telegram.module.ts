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

import { TelegramController } from "./telegram.controller";
import { TelegramService } from "./telegram.service";

@Module({
  imports: [
    AssistantModule,
    DocumentsModule,
    EnergyModule,
    ExpensesModule,
    GarageModule,
    IdentityModule,
    MileageModule,
    ServiceRecordsModule,
    VinModule,
  ],
  controllers: [TelegramController],
  providers: [TelegramService],
})
export class TelegramModule {}
