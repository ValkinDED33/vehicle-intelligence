import { check, integer, pgTable, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "../../identity/schemas/user.schema";
import type { AssistantPreferences } from "../assistant-preferences";

export const assistantPreferences = pgTable("assistant_preferences", {
  ownerId: uuid("owner_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  detailLevel: varchar("detail_level", { length: 16 }).$type<AssistantPreferences["detailLevel"]>().notNull().default("concise"),
  priority: varchar("priority", { length: 16 }).$type<AssistantPreferences["priority"]>().notNull().default("balanced"),
  drivingPattern: varchar("driving_pattern", { length: 16 }).$type<AssistantPreferences["drivingPattern"]>().notNull().default("unspecified"),
  revision: integer("revision").notNull().default(0),
}, table => [
  check("assistant_preferences_detail", sql`${table.detailLevel} in ('concise','detailed')`),
  check("assistant_preferences_priority", sql`${table.priority} in ('balanced','reliability','economy')`),
  check("assistant_preferences_driving", sql`${table.drivingPattern} in ('unspecified','city','highway','mixed')`),
]);
