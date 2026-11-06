import { index, jsonb, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "../../identity/schemas/user.schema";
import type { VinDecodeResult } from "../providers/vin-provider.interface";

export const standaloneVinChecks = pgTable("standalone_vin_checks", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  vin: varchar("vin", { length: 17 }).notNull(),
  status: varchar("status", { length: 16 }).default("success").notNull(),
  result: jsonb("result").notNull().$type<VinDecodeResult>(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, table => ({ ownerCreated: index("standalone_vin_checks_owner_created_idx").on(table.ownerId, table.createdAt) }));
