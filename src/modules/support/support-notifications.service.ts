import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "crypto";
import { and, asc, eq, gt, lte, lt, sql } from "drizzle-orm";
import { DatabaseService } from "../../common/database/database.service";
import { SupportAccessService, supportTelegramConfig } from "./support-access.service";
import { supportNotificationOutbox } from "./schemas/support.schema";

const MAX_ATTEMPTS = 5;
const LEASE_MS = 60_000;
type DeliveryError = "telegram_unavailable" | "rate_limited" | "telegram_rejected" | "transport_failure";
export type SupportDeliveryResult = { kind: "sent" }
  | { kind: "retry"; code: DeliveryError; retryAfterSeconds?: number }
  | { kind: "failed"; code: DeliveryError };
export type SupportNotificationJob = typeof supportNotificationOutbox.$inferSelect;

@Injectable()
export class SupportTelegramSender {
  constructor(private readonly config: ConfigService, private readonly access: SupportAccessService) {}
  async isConfigured() { return this.access.notificationsConfigured(); }
  async recipients() { return this.access.recipients(); }

  private ticketLink(ticketId: string): string {
    const fallback = "https://vehicle-intelligence-nu.vercel.app";
    let url: URL;
    try {
      url = new URL(this.config.get<string>("TELEGRAM_WEB_APP_URL") || fallback);
      if (url.protocol !== "https:" || url.username || url.password) throw new Error("Invalid app URL");
    } catch { url = new URL(fallback); }
    url.hash = "";
    url.search = "";
    url.searchParams.set("supportTicket", ticketId);
    return url.toString();
  }

  async send(job: Pick<SupportNotificationJob, "ticketId" | "event">, chatId: string): Promise<SupportDeliveryResult> {
    const { token } = supportTelegramConfig(this.config);
    if (this.config.get<string>("SUPPORT_NOTIFICATIONS_ENABLED") !== "true" || !token || !chatId) return { kind: "retry", code: "telegram_unavailable" };
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: `CARA support: ${job.event === "new_ticket" ? "new ticket" : "new reply"}\nTicket ID: ${job.ticketId}\n${this.ticketLink(job.ticketId)}`,
          link_preview_options: { is_disabled: true },
        }),
        signal: AbortSignal.timeout(8_000), redirect: "error",
      });
      const body = await response.json() as { ok?: boolean; error_code?: number; result?: { message_id?: number }; parameters?: { retry_after?: number } };
      if (response.ok && body.ok === true && Number.isSafeInteger(body.result?.message_id)) return { kind: "sent" };
      const code = body.error_code ?? response.status;
      if (code === 429) {
        const delay = body.parameters?.retry_after;
        return { kind: "retry", code: "rate_limited", retryAfterSeconds: typeof delay === "number" && Number.isFinite(delay) ? Math.min(3600, Math.max(1, Math.ceil(delay))) : 60 };
      }
      if (code >= 400 && code < 500) return { kind: "failed", code: "telegram_rejected" };
      return { kind: "retry", code: "telegram_unavailable" };
    } catch {
      // At-least-once delivery: a timeout may produce a duplicate generic notice.
      return { kind: "retry", code: "transport_failure" };
    }
  }
}

@Injectable()
export class SupportNotificationStore {
  private readonly logger = new Logger(SupportNotificationStore.name);
  constructor(private readonly db: DatabaseService) {}

  async claim(now = new Date()): Promise<SupportNotificationJob | null> {
    return this.db.connection.transaction(async tx => {
      const exhausted = await tx.update(supportNotificationOutbox)
        .set({ status: "failed", lastError: "retry_exhausted", lockToken: null, leaseUntil: null })
        .where(and(eq(supportNotificationOutbox.status, "sending"), lte(supportNotificationOutbox.leaseUntil, now),
          eq(supportNotificationOutbox.attempts, MAX_ATTEMPTS))).returning({ id: supportNotificationOutbox.id });
      for (const job of exhausted) this.logger.warn(`Support notification exhausted: ${job.id}`);
      await tx.update(supportNotificationOutbox)
        .set({ status: "pending", lastError: "lease_expired", nextAttemptAt: now, lockToken: null, leaseUntil: null })
        .where(and(eq(supportNotificationOutbox.status, "sending"), lte(supportNotificationOutbox.leaseUntil, now),
          lt(supportNotificationOutbox.attempts, MAX_ATTEMPTS)));
      const [pending] = await tx.select().from(supportNotificationOutbox)
        .where(and(eq(supportNotificationOutbox.status, "pending"), lte(supportNotificationOutbox.nextAttemptAt, now),
          lt(supportNotificationOutbox.attempts, MAX_ATTEMPTS)))
        .orderBy(asc(supportNotificationOutbox.nextAttemptAt), asc(supportNotificationOutbox.id))
        .limit(1).for("update", { skipLocked: true });
      if (!pending) return null;
      const [job] = await tx.update(supportNotificationOutbox).set({
        status: "sending", attempts: pending.attempts + 1, lockToken: randomUUID(), leaseUntil: new Date(now.getTime() + LEASE_MS),
      }).where(eq(supportNotificationOutbox.id, pending.id)).returning();
      return job;
    });
  }

  async finish(job: SupportNotificationJob, result: SupportDeliveryResult, now = new Date()): Promise<boolean> {
    const sent = result.kind === "sent";
    const retry = result.kind === "retry" && job.attempts < MAX_ATTEMPTS;
    const delay = result.kind === "retry" ? Math.max(30 * 2 ** (job.attempts - 1), result.retryAfterSeconds ?? 0) : 0;
    const [row] = await this.db.connection.update(supportNotificationOutbox).set({
      status: sent ? "sent" : retry ? "pending" : "failed",
      sentAt: sent ? now : null,
      nextAttemptAt: new Date(now.getTime() + Math.min(3600, delay) * 1000),
      lastError: sent ? null : result.code, lockToken: null, leaseUntil: null,
    }).where(and(eq(supportNotificationOutbox.id, job.id), eq(supportNotificationOutbox.status, "sending"),
      eq(supportNotificationOutbox.lockToken, job.lockToken!), gt(supportNotificationOutbox.leaseUntil, now)))
      .returning({ id: supportNotificationOutbox.id });
    if (row && !sent && !retry) this.logger.warn(`Support notification failed: ${job.id}`);
    return !!row;
  }

  async recordRecipient(job: SupportNotificationJob, recipient: string, now = new Date()): Promise<boolean> {
    const [row] = await this.db.connection.update(supportNotificationOutbox).set({
      sentTo: sql`array_append(${supportNotificationOutbox.sentTo}, ${recipient})`,
      leaseUntil: new Date(now.getTime() + LEASE_MS),
    }).where(and(eq(supportNotificationOutbox.id, job.id), eq(supportNotificationOutbox.status, "sending"),
      eq(supportNotificationOutbox.lockToken, job.lockToken!), gt(supportNotificationOutbox.leaseUntil, now)))
      .returning({ id: supportNotificationOutbox.id });
    return !!row;
  }

  async renew(job: SupportNotificationJob, now = new Date()): Promise<boolean> {
    const [row] = await this.db.connection.update(supportNotificationOutbox).set({ leaseUntil: new Date(now.getTime() + LEASE_MS) })
      .where(and(eq(supportNotificationOutbox.id, job.id), eq(supportNotificationOutbox.status, "sending"),
        eq(supportNotificationOutbox.lockToken, job.lockToken!), gt(supportNotificationOutbox.leaseUntil, now)))
      .returning({ id: supportNotificationOutbox.id });
    return !!row;
  }
}

@Injectable()
export class SupportNotificationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SupportNotificationWorker.name);
  private timer?: ReturnType<typeof setInterval>;
  private active?: Promise<{ processed: number }>;
  private stopping = false;
  private wakeRequested = false;

  constructor(private readonly store: SupportNotificationStore, private readonly sender: SupportTelegramSender) {}

  onModuleInit(): void {
    this.timer = setInterval(() => this.wake(), 15_000);
    this.timer.unref();
    this.wake();
  }

  wake(): void {
    if (this.stopping) return;
    this.wakeRequested = true;
    void this.drain().catch(() => this.logger.error("Support notification queue unavailable"));
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    await this.active?.catch(() => undefined);
  }

  async drain(): Promise<{ processed: number }> {
    if (this.stopping || !await this.sender.isConfigured()) return { processed: 0 };
    if (this.stopping) return { processed: 0 };
    if (this.active) return this.active;
    this.wakeRequested = false;
    this.active = this.run();
    try { return await this.active; }
    finally {
      this.active = undefined;
      if (this.wakeRequested && !this.stopping) this.wake();
    }
  }

  private async run(): Promise<{ processed: number }> {
    let processed = 0;
    for (; processed < 10 && !this.stopping; processed++) {
      const job = await this.store.claim();
      if (!job) break;
      let result: SupportDeliveryResult = { kind: "sent" };
      const recipients = await this.sender.recipients();
      if (!recipients.length) result = { kind: "retry", code: "telegram_unavailable" };
      for (const recipient of recipients) {
        if (job.sentTo.includes(recipient)) continue;
        if (!await this.store.renew(job)) break;
        let delivery: SupportDeliveryResult;
        try { delivery = await this.sender.send(job, recipient); }
        catch { delivery = { kind: "retry", code: "transport_failure" }; }
        if (delivery.kind === "sent") {
          if (!await this.store.recordRecipient(job, recipient)) break;
        } else {
          if (delivery.kind === "retry" || result.kind !== "retry") result = delivery;
        }
      }
      await this.store.finish(job, result);
    }
    return { processed };
  }
}
