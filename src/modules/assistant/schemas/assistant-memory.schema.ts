import { check, index, integer, jsonb, pgTable, primaryKey, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "../../identity/schemas/user.schema";
import { vehicles } from "../../garage/schemas/vehicle.schema";
import type { MemoryMessage } from "../assistant-memory.types";

export const assistantMemories = pgTable("assistant_memories", {
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  scopeKey: varchar("scope_key", { length: 36 }).notNull(),
  vehicleId: uuid("vehicle_id").references(() => vehicles.id, { onDelete: "cascade" }),
  language: varchar("language", { length: 2 }).notNull(),
  messages: jsonb("messages").$type<MemoryMessage[]>().notNull().default([]),
  epoch: integer("epoch").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  lockToken: uuid("lock_token"),
  lockedUntil: timestamp("locked_until", { withTimezone: true, mode: "date" }),
}, table => [
  primaryKey({ columns: [table.ownerId, table.scopeKey, table.language] }),
  index("assistant_memories_expiry_idx").on(table.expiresAt),
  check("assistant_memory_scope", sql`${table.scopeKey} = coalesce(${table.vehicleId}::text, 'general')`),
  check("assistant_memory_language", sql`${table.language} in ('uk','pl','en')`),
]);
