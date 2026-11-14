import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { vehicles } from "../../garage/schemas/vehicle.schema";
import { users } from "../../identity/schemas/user.schema";

export const SUPPORT_CATEGORIES = ["technical", "report", "account", "other"] as const;
export const SUPPORT_STATUSES = ["open", "in_progress", "resolved"] as const;
export type SupportCategory = typeof SUPPORT_CATEGORIES[number];
export type SupportStatus = typeof SUPPORT_STATUSES[number];

const date = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const supportTickets = pgTable("support_tickets", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  vehicleId: uuid("vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
  subject: varchar("subject", { length: 160 }).notNull(),
  category: varchar("category", { length: 20 }).$type<SupportCategory>().notNull(),
  status: varchar("status", { length: 20 }).$type<SupportStatus>().notNull().default("open"),
  createdAt: date("created_at").notNull().defaultNow(),
  updatedAt: date("updated_at").notNull().defaultNow(),
}, table => ({
  ownerIndex: index("support_tickets_owner_updated_idx").on(table.ownerId, table.updatedAt),
  statusIndex: index("support_tickets_status_updated_idx").on(table.status, table.updatedAt),
  updatedIndex: index("support_tickets_updated_idx").on(table.updatedAt),
  categoryCheck: check("support_tickets_category_check", sql`${table.category} IN ('technical', 'report', 'account', 'other')`),
  statusCheck: check("support_tickets_status_check", sql`${table.status} IN ('open', 'in_progress', 'resolved')`),
  subjectCheck: check("support_tickets_subject_check", sql`length(trim(${table.subject})) BETWEEN 1 AND 160`),
}));

export const supportMessages = pgTable("support_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  ticketId: uuid("ticket_id").notNull().references(() => supportTickets.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
  authorRole: varchar("author_role", { length: 10 }).$type<"user" | "admin">().notNull(),
  body: text("body").notNull(),
  createdAt: date("created_at").notNull().defaultNow(),
}, table => ({
  ticketIndex: index("support_messages_ticket_created_idx").on(table.ticketId, table.createdAt),
  roleCheck: check("support_messages_role_check", sql`${table.authorRole} IN ('user', 'admin')`),
  bodyCheck: check("support_messages_body_check", sql`length(trim(${table.body})) BETWEEN 1 AND 10000`),
}));

export const supportNotificationOutbox = pgTable("support_notification_outbox", {
  id: uuid("id").defaultRandom().primaryKey(),
  ticketId: uuid("ticket_id").notNull().references(() => supportTickets.id, { onDelete: "cascade" }),
  messageId: uuid("message_id").notNull().references(() => supportMessages.id, { onDelete: "cascade" }),
  event: varchar("event", { length: 20 }).$type<"new_ticket" | "new_reply">().notNull(),
  status: varchar("status", { length: 10 }).$type<"pending" | "sending" | "sent" | "failed">().notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: date("next_attempt_at").notNull().defaultNow(),
  lockToken: uuid("lock_token"),
  leaseUntil: date("lease_until"),
  lastError: varchar("last_error", { length: 40 }),
  sentTo: text("sent_to").array().notNull().default(sql`'{}'::text[]`),
  sentAt: date("sent_at"),
  createdAt: date("created_at").notNull().defaultNow(),
}, table => ({
  messageIndex: uniqueIndex("support_outbox_message_idx").on(table.messageId),
  pendingIndex: index("support_outbox_pending_idx").on(table.status, table.nextAttemptAt),
  leaseIndex: index("support_outbox_lease_idx").on(table.status, table.leaseUntil),
  statusCheck: check("support_outbox_status_check", sql`${table.status} IN ('pending', 'sending', 'sent', 'failed')`),
  eventCheck: check("support_outbox_event_check", sql`${table.event} IN ('new_ticket', 'new_reply')`),
  attemptsCheck: check("support_outbox_attempts_check", sql`${table.attempts} BETWEEN 0 AND 5`),
}));

export type SupportTicket = typeof supportTickets.$inferSelect;
export type SupportMessage = Pick<typeof supportMessages.$inferSelect, "id" | "body" | "authorRole" | "createdAt">;
export interface SupportTicketView extends Omit<SupportTicket, "ownerId"> {
  owner?: { id: string; email: string; displayName: string | null };
  notification?: {
    status: "pending" | "sending" | "sent" | "failed";
    attempts: number;
    lastError: string | null;
    nextAttemptAt: Date | null;
  } | null;
}
export interface SupportTicketDetail { ticket: SupportTicketView; messages: SupportMessage[] }
