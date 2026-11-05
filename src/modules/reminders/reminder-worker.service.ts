import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DateTime } from "luxon";
import { botLanguage, botText } from "../telegram/telegram-conversation.types";
import { ReminderDeliveryStore, type ClaimedReminder } from "./reminder-delivery.store";
import { MaintenanceReminderSync } from "./maintenance-reminder-sync";

export type SendResult = { kind: "sent"; messageId: number }
  | { kind: "retry"; error: string; delaySeconds: number }
  | { kind: "failed" | "uncertain"; error: string };

@Injectable()
export class TelegramReminderSender {
  constructor(private readonly config: ConfigService) {}
  get enabled() { return this.config.get("REMINDERS_WORKER_ENABLED") === "true" && !!this.config.get("TELEGRAM_BOT_TOKEN"); }
  async send(chatId: string, text: string): Promise<SendResult> {
    try {
      const response = await fetch(`https://api.telegram.org/bot${this.config.get<string>("TELEGRAM_BOT_TOKEN")}/sendMessage`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, link_preview_options: { is_disabled: true } }),
        signal: AbortSignal.timeout(10_000), redirect: "error",
      });
      const body = await response.json() as { ok?: boolean; result?: { message_id?: number }; error_code?: number; parameters?: { retry_after?: number } };
      if (body.ok === true && Number.isSafeInteger(body.result?.message_id)) return { kind: "sent", messageId: body.result!.message_id! };
      if (body.ok !== false || !body.error_code) return { kind: "uncertain", error: "delivery_uncertain" };
      if (body.error_code === 429) return { kind: "retry", error: "rate_limited", delaySeconds: Math.max(1, Math.min(86400, body.parameters?.retry_after ?? 60)) };
      if (body.error_code >= 500) return { kind: "retry", error: "telegram_unavailable", delaySeconds: 60 };
      return { kind: "failed", error: body.error_code === 403 ? "bot_blocked" : body.error_code === 401 ? "bot_configuration" : "chat_unavailable" };
    } catch {
      // A timeout can happen after Telegram accepted the message. Retrying would risk a duplicate.
      return { kind: "uncertain", error: "delivery_uncertain" };
    }
  }
}

export function reminderMessage(job: ClaimedReminder, now: Date): string {
  const language = botLanguage(job.language);
  const locale = language === "uk" ? "uk-UA" : language === "pl" ? "pl-PL" : "en-GB";
  if (job.maintenanceRuleId && job.sourcePhase !== "calendar") {
    return [botText(language, "Нагадування CARA", "Przypomnienie CARA", "CARA reminder"), job.title, job.vehicleName,
      job.sourcePhase === "due" ? botText(language, "Досягнуто строку за вашим правилом обслуговування.", "Osiągnięto termin według Twojego harmonogramu serwisu.", "Your maintenance rule is now due.")
        : botText(language, "Наближається обслуговування за вашим правилом.", "Zbliża się serwis według Twojego harmonogramu.", "Maintenance is approaching under your saved rule."),
      job.targetOdometerKm != null ? botText(language, `Пробіг для обслуговування: ${job.targetOdometerKm} км.`, `Przebieg serwisowy: ${job.targetOdometerKm} km.`, `Service odometer target: ${job.targetOdometerKm} km.`) : "",
      job.serviceDueDate ? botText(language, "Дата за регламентом: ", "Termin z harmonogramu: ", "Scheduled date: ") + job.serviceDueDate.split("-").reverse().join(".") : "",
    ].filter(Boolean).join("\n");
  }
  const event = DateTime.fromISO(`${job.dueDate}T${job.remindAt}`, { zone: job.timeZone });
  const localNow = DateTime.fromJSDate(now, { zone: job.timeZone });
  const days = Math.round(event.startOf("day").diff(localNow.startOf("day"), "days").days);
  const when = days > 0 ? botText(language, `До події: ${days} дн.`, `Do wydarzenia: ${days} dni.`, `Days until the event: ${days}.`)
    : days === 0 ? botText(language, "Подія сьогодні.", "Wydarzenie jest dzisiaj.", "The event is today.")
    : botText(language, "Дата події вже минула. Перевірте, чи все виконано.", "Termin już minął. Sprawdź, czy wszystko zostało wykonane.", "The event date has passed. Check whether it is complete.");
  return [botText(language, "Нагадування CARA", "Przypomnienie CARA", "CARA reminder"), job.title, job.vehicleName,
    event.setLocale(locale).toFormat("dd.MM.yyyy"), when].filter(Boolean).join("\n");
}

@Injectable()
export class ReminderWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReminderWorker.name);
  private timer?: ReturnType<typeof setInterval>;
  private active?: Promise<{ processed: number }>;
  constructor(private readonly store: ReminderDeliveryStore, private readonly sender: TelegramReminderSender, private readonly maintenanceSync: MaintenanceReminderSync) {}

  onModuleInit() {
    if (!this.sender.enabled) return;
    this.timer = setInterval(() => { void this.drain().catch(() => this.logger.error("Reminder queue check failed")); }, 60_000);
    this.timer.unref();
    void this.drain().catch(() => this.logger.error("Reminder queue check failed"));
  }
  async onModuleDestroy() { if (this.timer) clearInterval(this.timer); await this.active?.catch(() => undefined); }
  async drain() {
    if (!this.sender.enabled) return { processed: 0 };
    if (this.active) return this.active;
    this.active = this.run();
    try { return await this.active; } finally { this.active = undefined; }
  }
  private async run() {
    await this.maintenanceSync.sync();
    let processed = 0;
    for (; processed < 20; processed++) {
      const now = new Date();
      const job = await this.store.claim(now);
      if (!job) break;
      if (!await this.store.isCurrent(job)) { await this.store.finish(job, "cancelled"); continue; }
      if (!job.telegramId) {
        await this.store.finish(job, "pending", { error: "not_linked", retryAt: new Date(now.getTime() + 3600_000), undoAttempt: true });
        continue;
      }
      const result = await this.sender.send(job.telegramId, reminderMessage(job, now));
      if (result.kind === "sent") await this.store.finish(job, "sent", { messageId: result.messageId });
      else if (result.kind === "retry" && job.attempts < 5) {
        await this.store.finish(job, "pending", { error: result.error, retryAt: new Date(now.getTime() + Math.max(result.delaySeconds, job.attempts * 60) * 1000) });
      } else await this.store.finish(job, result.kind === "uncertain" ? "uncertain" : "failed", { error: result.error });
    }
    return { processed };
  }
}
