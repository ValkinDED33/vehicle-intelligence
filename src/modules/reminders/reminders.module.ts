import { Module } from "@nestjs/common";
import { GarageModule } from "../garage/garage.module";
import { RemindersController } from "./reminders.controller";
import { RemindersService } from "./reminders.service";
import { ReminderDeliveryStore } from "./reminder-delivery.store";
import { ReminderWorker, TelegramReminderSender } from "./reminder-worker.service";
import { ReminderCronController } from "./reminder-cron.controller";
import { MaintenanceModule } from "../maintenance/maintenance.module";
import { MaintenanceReminderSync } from "./maintenance-reminder-sync";

@Module({
  imports: [GarageModule, MaintenanceModule],
  controllers: [RemindersController, ReminderCronController],
  providers: [RemindersService, ReminderDeliveryStore, TelegramReminderSender, ReminderWorker, MaintenanceReminderSync],
  exports: [RemindersService, TelegramReminderSender],
})
export class RemindersModule {}
