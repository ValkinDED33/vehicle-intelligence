import { Controller, Headers, Post, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SkipThrottle } from "@nestjs/throttler";
import { timingSafeEqual } from "crypto";
import { ReminderWorker, TelegramReminderSender } from "./reminder-worker.service";

@Controller("internal/reminders")
export class ReminderCronController {
  constructor(private readonly config: ConfigService, private readonly worker: ReminderWorker, private readonly sender: TelegramReminderSender) {}
  @Post("dispatch")
  @SkipThrottle()
  async dispatch(@Headers("authorization") authorization?: string) {
    const secret = this.config.get<string>("REMINDERS_CRON_SECRET")?.trim();
    if (!secret || secret.length < 32) throw new ServiceUnavailableException("Reminder scheduler is not configured");
    const actual = Buffer.from(authorization ?? "");
    const expected = Buffer.from(`Bearer ${secret}`);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new UnauthorizedException();
    if (!this.sender.enabled) throw new ServiceUnavailableException("Reminder delivery is disabled");
    return this.worker.drain();
  }
}
