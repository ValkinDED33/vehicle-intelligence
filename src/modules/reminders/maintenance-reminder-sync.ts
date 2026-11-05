import { Injectable, Logger } from "@nestjs/common";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { DatabaseService } from "../../common/database/database.service";
import { vehicles } from "../garage/schemas/vehicle.schema";
import { maintenanceRules } from "../maintenance/schemas/maintenance-rule.schema";
import type { MaintenanceRuleStatus } from "../maintenance/maintenance.types";
import { MaintenanceService } from "../maintenance/services/maintenance.service";
import { buildReminderSchedule } from "./reminder-schedule";
import { reminders, reminderDeliveries } from "./schemas/reminder.schema";

export function maintenanceNotices(status: MaintenanceRuleStatus, now = new Date()) {
  const { rule } = status;
  const localNow = DateTime.fromJSDate(now, { zone: rule.timeZone });
  const serviceDueDate = rule.intervalMonths && status.lastCompletedAt
    ? DateTime.fromJSDate(status.lastCompletedAt, { zone: rule.timeZone }).plus({ months: rule.intervalMonths }).toISODate() : null;
  const targetOdometerKm = rule.intervalKm && status.lastCompletedMileageKm !== null
    ? status.lastCompletedMileageKm + rule.intervalKm : null;
  const dueByDate = serviceDueDate !== null && (serviceDueDate < localNow.toISODate()!
    || serviceDueDate === localNow.toISODate() && localNow.toFormat("HH:mm") >= rule.remindAt);
  const due = dueByDate || status.kmRemaining !== null && status.kmRemaining <= 0
    || status.engineHoursRemaining !== null && status.engineHoursRemaining <= 0;
  const notices: { phase: string; dueDate: string; scheduledAt: Date[] }[] = [];
  if (!rule.telegramEnabled || !status.lastCompletedAt || status.lastCompletedAt > now || !status.lastCompletionId) return { due, serviceDueDate, targetOdometerKm, notices };
  if (due) {
    if (rule.notifyWhenDue) notices.push({ phase: "due", dueDate: localNow.toISODate()!, scheduledAt: [now] });
  } else {
    if (serviceDueDate && rule.reminderOffsets.some(offset => offset.amount > 0)) {
      try {
        const schedule = buildReminderSchedule({ title: rule.title, dueDate: serviceDueDate, remindAt: rule.remindAt, timeZone: rule.timeZone,
          offsets: rule.reminderOffsets.filter(offset => offset.amount > 0) }, now);
        notices.push({ phase: "calendar", dueDate: serviceDueDate, scheduledAt: schedule.scheduledAt });
      } catch { /* Elapsed warnings are not backfilled; the due notice has its own stage. */ }
    }
    if (status.kmRemaining !== null && rule.warningKmBefore !== null && status.kmRemaining <= rule.warningKmBefore
      || status.engineHoursRemaining !== null && rule.warningEngineHoursBefore !== null && status.engineHoursRemaining <= rule.warningEngineHoursBefore) {
      notices.push({ phase: "mileage_warning", dueDate: localNow.toISODate()!, scheduledAt: [now] });
    }
  }
  return { due, serviceDueDate, targetOdometerKm, notices };
}

@Injectable()
export class MaintenanceReminderSync {
  private readonly logger = new Logger(MaintenanceReminderSync.name);
  constructor(private readonly database: DatabaseService, private readonly maintenance: MaintenanceService) {}

  async sync(now = new Date()) {
    const inactive = await this.database.connection.execute(sql`UPDATE reminders r SET status='cancelled', updated_at=${now}
      FROM maintenance_rules m WHERE r.maintenance_rule_id=m.id AND r.status='active' AND (NOT m.is_active OR NOT m.telegram_enabled)
      RETURNING r.id`);
    if (inactive.rows.length) await this.database.connection.update(reminderDeliveries).set({ status: "cancelled" })
      .where(and(inArray(reminderDeliveries.reminderId, inactive.rows.map(row => row.id as string)), eq(reminderDeliveries.status, "pending")));
    const eligible = await this.database.connection.select({ ownerId: vehicles.ownerId, vehicleId: vehicles.id })
      .from(maintenanceRules).innerJoin(vehicles, eq(vehicles.id, maintenanceRules.vehicleId))
      .where(and(eq(maintenanceRules.isActive, true), eq(maintenanceRules.telegramEnabled, true), eq(vehicles.isArchived, false)))
      .groupBy(vehicles.ownerId, vehicles.id);
    for (const vehicle of eligible) {
      try {
        const statuses = await this.maintenance.getStatus(vehicle.ownerId, vehicle.vehicleId);
        for (const status of statuses.filter(item => item.rule.telegramEnabled)) await this.reconcile(status, now);
      } catch { this.logger.warn("Maintenance notification sync failed for a vehicle"); }
    }
  }

  private async reconcile(status: MaintenanceRuleStatus, now: Date) {
    const { rule } = status;
    const plan = maintenanceNotices(status, now);
    const cycle = status.lastCompletionId;
    await this.database.connection.transaction(async tx => {
      const [current] = await tx.select().from(maintenanceRules).where(eq(maintenanceRules.id, rule.id)).for("update");
      if (!current?.isActive || !current.telegramEnabled || current.updatedAt.getTime() !== rule.updatedAt.getTime()) return;
      const obsolete = await tx.update(reminders).set({ status: "completed", updatedAt: now }).where(and(
        eq(reminders.maintenanceRuleId, rule.id), eq(reminders.status, "active"),
        cycle ? ne(reminders.sourceCycle, cycle) : sql`true`,
      )).returning({ id: reminders.id });
      if (plan.due) {
        const early = await tx.update(reminders).set({ status: "completed", updatedAt: now }).where(and(
          eq(reminders.maintenanceRuleId, rule.id), eq(reminders.sourceCycle, cycle ?? ""), eq(reminders.status, "active"), ne(reminders.sourcePhase, "due"),
        )).returning({ id: reminders.id });
        obsolete.push(...early);
      }
      if (obsolete.length) await tx.update(reminderDeliveries).set({ status: "cancelled" }).where(and(
        inArray(reminderDeliveries.reminderId, obsolete.map(row => row.id)), eq(reminderDeliveries.status, "pending"),
      ));
      if (!cycle) return;
      for (const notice of plan.notices) {
        const [existing] = await tx.select().from(reminders).where(and(eq(reminders.maintenanceRuleId, rule.id), eq(reminders.sourceCycle, cycle), eq(reminders.sourcePhase, notice.phase)));
        if (existing?.sourceVersion?.getTime() === rule.updatedAt.getTime()) continue;
        const values = { title: rule.title, vehicleId: rule.vehicleId, dueDate: notice.dueDate, remindAt: rule.remindAt, timeZone: rule.timeZone,
          offsets: rule.reminderOffsets, maintenanceRuleId: rule.id, sourceCycle: cycle, sourcePhase: notice.phase, sourceVersion: rule.updatedAt,
          targetOdometerKm: plan.targetOdometerKm, serviceDueDate: plan.serviceDueDate, status: "active", updatedAt: now };
        let record;
        if (existing) {
          [record] = await tx.update(reminders).set({ ...values, revision: existing.revision + 1 }).where(eq(reminders.id, existing.id)).returning();
          await tx.update(reminderDeliveries).set({ status: "cancelled" }).where(and(eq(reminderDeliveries.reminderId, existing.id), eq(reminderDeliveries.status, "pending")));
        } else [record] = await tx.insert(reminders).values(values).returning();
        await tx.insert(reminderDeliveries).values(notice.scheduledAt.map(date => ({ reminderId: record.id, revision: record.revision, scheduledAt: date })));
      }
    });
  }
}
