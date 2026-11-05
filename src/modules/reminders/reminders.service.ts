import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { DatabaseService } from "../../common/database/database.service";
import { GarageService } from "../garage/services/garage.service";
import { users } from "../identity/schemas/user.schema";
import { ConfigService } from "@nestjs/config";
import { buildReminderSchedule, type ReminderInput } from "./reminder-schedule";
import { reminderDeliveries, reminders } from "./schemas/reminder.schema";
import { maintenanceRules } from "../maintenance/schemas/maintenance-rule.schema";

@Injectable()
export class RemindersService {
  constructor(private readonly database: DatabaseService, private readonly garage: GarageService, private readonly config: ConfigService) {}

  async list(ownerId: string, vehicleId: string) {
    await this.garage.getVehicle(ownerId, vehicleId);
    const rows = await this.database.connection.select().from(reminders)
      .where(eq(reminders.vehicleId, vehicleId)).orderBy(asc(reminders.status), asc(reminders.dueDate), desc(reminders.createdAt)).limit(200);
    const deliveries = rows.length ? await this.database.connection.select({
      id: reminderDeliveries.id, reminderId: reminderDeliveries.reminderId, revision: reminderDeliveries.revision,
      scheduledAt: reminderDeliveries.scheduledAt, status: reminderDeliveries.status,
      sentAt: reminderDeliveries.sentAt, lastError: reminderDeliveries.lastError,
    }).from(reminderDeliveries).innerJoin(reminders, and(eq(reminders.id, reminderDeliveries.reminderId), eq(reminders.revision, reminderDeliveries.revision)))
      .where(inArray(reminderDeliveries.reminderId, rows.map(row => row.id)))
      .orderBy(asc(reminderDeliveries.scheduledAt)) : [];
    const [user] = await this.database.connection.select({ telegramId: users.telegramId }).from(users).where(eq(users.id, ownerId));
    return { telegramLinked: !!user?.telegramId, deliveryEnabled: this.deliveryEnabled,
      reminders: rows.map(row => ({ ...row, deliveries: deliveries.filter(d => d.reminderId === row.id && d.revision === row.revision) })) };
  }

  get deliveryEnabled() { return this.config.get("REMINDERS_WORKER_ENABLED") === "true" && !!this.config.get("TELEGRAM_BOT_TOKEN"); }

  async get(ownerId: string, vehicleId: string, id: string) {
    await this.garage.getVehicle(ownerId, vehicleId);
    const [record] = await this.database.connection.select().from(reminders).where(and(eq(reminders.id, id), eq(reminders.vehicleId, vehicleId)));
    if (!record) throw new NotFoundException("Нагадування не знайдено.");
    return record;
  }

  async save(ownerId: string, vehicleId: string, input: ReminderInput, id?: string, expectedRevision?: number) {
    const vehicle = await this.garage.getVehicle(ownerId, vehicleId);
    if (vehicle.isArchived) throw new BadRequestException("Авто в архіві");
    const { scheduledAt, ...data } = buildReminderSchedule(input);
    return this.database.connection.transaction(async tx => {
      let record;
      if (id) {
        const [current] = await tx.select().from(reminders).where(and(eq(reminders.id, id), eq(reminders.vehicleId, vehicleId))).for("update");
        if (!current) throw new NotFoundException("Нагадування не знайдено.");
        if (current.maintenanceRuleId) throw new BadRequestException("Це нагадування керується регламентом. Змініть правило в розділі сервісу.");
        if (expectedRevision !== undefined && current.revision !== expectedRevision) throw new ConflictException("Нагадування змінилося. Оновіть дані й перевірте його ще раз.");
        if (current.status !== "active") throw new BadRequestException("Це нагадування вже завершено або скасовано.");
        [record] = await tx.update(reminders).set({ ...data, revision: current.revision + 1, updatedAt: new Date() }).where(eq(reminders.id, id)).returning();
        await tx.update(reminderDeliveries).set({ status: "cancelled" }).where(and(eq(reminderDeliveries.reminderId, id), eq(reminderDeliveries.status, "pending")));
      } else {
        [record] = await tx.insert(reminders).values({ ...data, vehicleId }).returning();
      }
      await tx.insert(reminderDeliveries).values(scheduledAt.map(date => ({ reminderId: record.id, revision: record.revision, scheduledAt: date })));
      return { ...record, scheduledAt };
    });
  }

  async setStatus(ownerId: string, vehicleId: string, id: string, status: "completed" | "cancelled", expectedRevision?: number) {
    await this.garage.getVehicle(ownerId, vehicleId);
    const source = await this.get(ownerId, vehicleId, id);
    if (source.maintenanceRuleId && status === "completed") throw new BadRequestException("Для завершення ТО додайте запис про виконані роботи.");
    return this.database.connection.transaction(async tx => {
      if (source.maintenanceRuleId) await tx.select().from(maintenanceRules).where(eq(maintenanceRules.id, source.maintenanceRuleId)).for("update");
      const [current] = await tx.select().from(reminders).where(and(eq(reminders.id, id), eq(reminders.vehicleId, vehicleId))).for("update");
      if (!current) throw new NotFoundException("Нагадування не знайдено.");
      if (expectedRevision !== undefined && current.revision !== expectedRevision) throw new ConflictException("Нагадування змінилося. Оновіть дані й перевірте його ще раз.");
      if (current.status !== "active") return current;
      if (current.maintenanceRuleId) {
        await tx.update(maintenanceRules).set({ telegramEnabled: false, updatedAt: new Date() }).where(and(eq(maintenanceRules.id, current.maintenanceRuleId), eq(maintenanceRules.vehicleId, vehicleId)));
        const closed = await tx.update(reminders).set({ status: "cancelled", updatedAt: new Date() }).where(and(eq(reminders.maintenanceRuleId, current.maintenanceRuleId), eq(reminders.status, "active"))).returning({ id: reminders.id });
        if (closed.length) await tx.update(reminderDeliveries).set({ status: "cancelled" }).where(and(inArray(reminderDeliveries.reminderId, closed.map(row => row.id)), eq(reminderDeliveries.status, "pending")));
        return { ...current, status: "cancelled" };
      }
      const [record] = await tx.update(reminders).set({ status, updatedAt: new Date() }).where(eq(reminders.id, id)).returning();
      await tx.update(reminderDeliveries).set({ status: "cancelled" }).where(and(eq(reminderDeliveries.reminderId, id), eq(reminderDeliveries.status, "pending")));
      return record;
    });
  }
}
