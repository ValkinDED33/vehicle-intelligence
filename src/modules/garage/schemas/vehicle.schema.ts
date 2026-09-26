import {
  boolean,
  index,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { users } from "../../identity/schemas/user.schema";

export const vehicles = pgTable(
  "vehicles",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, {
        onDelete: "cascade",
      }),

    vin: varchar("vin", { length: 17 }),

    nickname: varchar("nickname", { length: 80 }),

    make: varchar("make", { length: 120 }),

    model: varchar("model", { length: 120 }),

    modelYear: varchar("model_year", { length: 4 }),

    licensePlate: varchar("license_plate", { length: 32 }),

    country: varchar("country", { length: 2 }).notNull().default("PL"),

    isArchived: boolean("is_archived").notNull().default(false),

    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    ownerIdIndex: index("vehicles_owner_id_idx").on(table.ownerId),
    vinIndex: index("vehicles_vin_idx").on(table.vin),
  }),
);

export type Vehicle = typeof vehicles.$inferSelect;
export type NewVehicle = typeof vehicles.$inferInsert;
