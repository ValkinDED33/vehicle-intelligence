import { Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { DatabaseService } from "../../common/database/database.service";
import { MaintenanceService } from "../maintenance/services/maintenance.service";
import { maintenanceNotices } from "./maintenance-reminder-sync";

export interface ClaimedReminder {
  id: string; reminderId: string; revision: number; lockToken: string; attempts: number;
  title: string; dueDate: string; remindAt: string; timeZone: string; scheduledAt: Date;
  telegramId: string | null; language: string; vehicleName: string;
  maintenanceRuleId?: string | null; sourceCycle?: string | null; sourcePhase?: string | null;
  targetOdometerKm?: number | null; serviceDueDate?: string | null; ownerId?: string; vehicleId?: string;
  sourceVersion?: Date | null;
}

type StoredClaim = Omit<ClaimedReminder, "scheduledAt" | "sourceVersion"> & {
  scheduledAt: string | Date;
  sourceVersion?: string | Date | null;
};

function storedDate(value: string | Date): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid reminder timestamp");
  return date;
}

@Injectable()
export class ReminderDeliveryStore {
  constructor(private readonly database: DatabaseService, private readonly maintenance: MaintenanceService) {}

  async claim(now: Date): Promise<ClaimedReminder | null> {
    return this.database.connection.transaction(async tx => {
      // An interrupted send has an unknown outcome. Never automatically send it a second time.
      await tx.execute(sql`UPDATE reminder_deliveries SET status='uncertain', last_error='delivery_uncertain'
        WHERE status='sending' AND locked_at < ${new Date(now.getTime() - 10 * 60_000)}`);
      await tx.execute(sql`UPDATE reminder_deliveries j SET status='expired', last_error='event_passed'
        FROM reminders r WHERE j.reminder_id=r.id AND j.status='pending'
        AND (r.maintenance_rule_id IS NULL OR r.source_phase='calendar')
        AND (r.due_date::date + interval '2 days') AT TIME ZONE r.time_zone < ${now}`);
      const candidates = await tx.execute(sql`SELECT r.id FROM reminders r
        JOIN vehicles v ON v.id=r.vehicle_id
        WHERE r.status='active' AND NOT v.is_archived
        AND EXISTS (SELECT 1 FROM reminder_deliveries j WHERE j.reminder_id=r.id AND j.revision=r.revision
          AND j.status='pending' AND j.scheduled_at<=${now} AND j.retry_at<=${now})
        AND NOT EXISTS (SELECT 1 FROM reminder_deliveries j WHERE j.reminder_id=r.id AND j.status='sending')
        ORDER BY r.due_date, r.id LIMIT 1 FOR UPDATE OF r SKIP LOCKED`);
      const reminderId = candidates.rows[0]?.id as string | undefined;
      if (!reminderId) return null;
      const lockToken = randomUUID();
      const result = await tx.execute(sql`UPDATE reminder_deliveries j
        SET status='sending', lock_token=${lockToken}::uuid, locked_at=${now}, attempts=attempts+1
        WHERE j.id=(SELECT d.id FROM reminder_deliveries d JOIN reminders r ON r.id=d.reminder_id
          WHERE r.id=${reminderId}::uuid AND d.revision=r.revision AND d.status='pending'
          AND d.scheduled_at<=${now} AND d.retry_at<=${now}
          ORDER BY d.scheduled_at DESC LIMIT 1)
        RETURNING j.id, j.reminder_id AS "reminderId", j.revision, j.lock_token AS "lockToken",
          j.attempts, j.scheduled_at AS "scheduledAt"`);
      const job = result.rows[0];
      if (!job) return null;
      // If the server was offline, send the newest due notice, not a burst of stale notices.
      await tx.execute(sql`UPDATE reminder_deliveries SET status='skipped', last_error='superseded'
        WHERE reminder_id=${reminderId}::uuid AND revision=${job.revision} AND status='pending'
        AND scheduled_at<=${job.scheduledAt as Date}`);
      const details = await tx.execute(sql`SELECT r.title, r.due_date AS "dueDate", r.remind_at AS "remindAt", r.time_zone AS "timeZone",
        u.telegram_id AS "telegramId", u.language,
        r.maintenance_rule_id AS "maintenanceRuleId", r.source_cycle AS "sourceCycle", r.source_phase AS "sourcePhase",
        r.target_odometer_km AS "targetOdometerKm", r.service_due_date AS "serviceDueDate", v.owner_id AS "ownerId", v.id AS "vehicleId",
        r.source_version AS "sourceVersion",
        concat_ws(' ', v.make, v.model, v.nickname, v.license_plate) AS "vehicleName"
        FROM reminders r JOIN vehicles v ON v.id=r.vehicle_id JOIN users u ON u.id=v.owner_id
        WHERE r.id=${reminderId}::uuid`);
      const row = { ...job, ...details.rows[0] } as StoredClaim;
      return { ...row, scheduledAt: storedDate(row.scheduledAt),
        sourceVersion: row.sourceVersion == null ? null : storedDate(row.sourceVersion) };
    });
  }

  async isCurrent(job: ClaimedReminder): Promise<boolean> {
    const result = await this.database.connection.execute(sql`SELECT j.id FROM reminder_deliveries j
      JOIN reminders r ON r.id=j.reminder_id JOIN vehicles v ON v.id=r.vehicle_id JOIN users u ON u.id=v.owner_id
      WHERE j.id=${job.id}::uuid AND j.lock_token=${job.lockToken}::uuid AND j.status='sending'
      AND r.status='active' AND r.revision=j.revision AND NOT v.is_archived
      AND u.telegram_id IS NOT DISTINCT FROM ${job.telegramId}`);
    if (!result.rows.length) return false;
    if (!job.maintenanceRuleId) return true;
    const statuses = await this.maintenance.getStatus(job.ownerId!, job.vehicleId!);
    const current = statuses.find(status => status.rule.id === job.maintenanceRuleId);
    if (!current || !current.rule.telegramEnabled || current.lastCompletionId !== job.sourceCycle
      || current.rule.updatedAt.getTime() !== job.sourceVersion?.getTime()) return false;
    const plan = maintenanceNotices(current);
    return job.sourcePhase === "calendar" ? !plan.due && plan.serviceDueDate === job.serviceDueDate
      : plan.notices.some(notice => notice.phase === job.sourcePhase);
  }

  async finish(job: ClaimedReminder, status: string, options: { messageId?: number; error?: string; retryAt?: Date; undoAttempt?: boolean } = {}) {
    await this.database.connection.execute(sql`UPDATE reminder_deliveries SET status=${status},
      message_id=${options.messageId ?? null}, last_error=${options.error ?? null},
      sent_at=${status === "sent" ? new Date() : null}, retry_at=${options.retryAt ?? new Date()},
      locked_at=NULL, lock_token=NULL, attempts=greatest(0, attempts-${options.undoAttempt ? 1 : 0})
      WHERE id=${job.id}::uuid AND lock_token=${job.lockToken}::uuid AND status='sending'`);
  }
}
