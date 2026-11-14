import { Module } from "@nestjs/common";
import { SupportAccessService } from "./support-access.service";
import { SupportAdminGuard } from "./support-admin.guard";
import { AdminSupportController, SupportController } from "./support.controller";
import { SupportNotificationStore, SupportNotificationWorker, SupportTelegramSender } from "./support-notifications.service";
import { SupportService } from "./support.service";

@Module({
  controllers: [SupportController, AdminSupportController],
  providers: [SupportService, SupportAccessService, SupportAdminGuard, SupportNotificationStore, SupportNotificationWorker, SupportTelegramSender],
})
export class SupportModule {}
