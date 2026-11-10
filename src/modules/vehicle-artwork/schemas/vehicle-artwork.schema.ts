import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "../../identity/schemas/user.schema";
import { vehicles } from "../../garage/schemas/vehicle.schema";
import type { ArtworkFacts } from "../artwork-facts";

export const vehicleArtworks = pgTable("vehicle_artworks", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  vehicleId: uuid("vehicle_id").notNull().references(() => vehicles.id, { onDelete: "cascade" }),
  fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
  facts: jsonb("facts").$type<ArtworkFacts>().notNull(),
  state: varchar("state", { length: 16 }).notNull(),
  token: uuid("token").notNull(),
  imageBase64: text("image_base64"),
  errorCode: varchar("error_code", { length: 48 }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
}, table => ({
  factsKey: uniqueIndex("vehicle_artworks_facts_idx").on(table.ownerId, table.vehicleId, table.fingerprint),
  ownerDay: index("vehicle_artworks_owner_day_idx").on(table.ownerId, table.createdAt),
}));

export const artworkBudgets = pgTable("vehicle_artwork_budgets", {
  day: varchar("day", { length: 10 }).primaryKey(),
  used: integer("used").notNull().default(0),
});
