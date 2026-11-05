import { index, integer, jsonb, pgTable, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { vehicles } from "../../garage/schemas/vehicle.schema";
import type { ReminderOffset } from "../reminder-schedule";
import { maintenanceRules } from "../../maintenance/schemas/maintenance-rule.schema";
import { vehicleDocuments } from "../../documents/schemas/vehicle-document.schema";

export const reminders = pgTable("reminders", {
  id: uuid("id").defaultRandom().primaryKey(),
  vehicleId: uuid("vehicle_id").notNull().references(() => vehicles.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 180 }).notNull(),
  dueDate: varchar("due_date", { length: 10 }).notNull(),
  remindAt: varchar("remind_at", { length: 5 }).notNull(),
  timeZone: varchar("time_zone", { length: 64 }).notNull(),
  offsets: jsonb("offsets").$type<ReminderOffset[]>().notNull(),
  status: varchar("status", { length: 16 }).notNull().default("active"),
  revision: integer("revision").notNull().default(1),
  documentId: uuid("document_id").references(() => vehicleDocuments.id, { onDelete: "cascade" }),
  maintenanceRuleId: uuid("maintenance_rule_id").references(() => maintenanceRules.id, { onDelete: "cascade" }),
  sourceCycle: varchar("source_cycle", { length: 160 }),
  sourcePhase: varchar("source_phase", { length: 32 }),
  sourceVersion: timestamp("source_version", { withTimezone: true }),
  targetOdometerKm: integer("target_odometer_km"),
  serviceDueDate: varchar("service_due_date", { length: 10 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => ({ vehicleIndex: index("reminders_vehicle_idx").on(table.vehicleId),
  sourceIndex: uniqueIndex("reminders_maintenance_cycle_idx").on(table.maintenanceRuleId, table.sourceCycle, table.sourcePhase) }));

export const reminderDeliveries = pgTable("reminder_deliveries", {
  id: uuid("id").defaultRandom().primaryKey(),
  reminderId: uuid("reminder_id").notNull().references(() => reminders.id, { onDelete: "cascade" }),
  revision: integer("revision").notNull(),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  status: varchar("status", { length: 16 }).notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  retryAt: timestamp("retry_at", { withTimezone: true }).notNull().defaultNow(),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  lockToken: uuid("lock_token"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  messageId: integer("message_id"),
  lastError: varchar("last_error", { length: 48 }),
}, table => ({
  dueIndex: index("reminder_deliveries_due_idx").on(table.status, table.retryAt, table.scheduledAt),
  uniqueSchedule: uniqueIndex("reminder_deliveries_schedule_idx").on(table.reminderId, table.revision, table.scheduledAt),
}));
export type ReminderRecord = typeof reminders.$inferSelect;
export type ReminderDelivery = typeof reminderDeliveries.$inferSelect;
