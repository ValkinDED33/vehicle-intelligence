import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { vehicles } from "../../garage/schemas/vehicle.schema";

export const vehicleHistoryEvents = pgTable(
  "vehicle_history_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, {
        onDelete: "cascade",
      }),

    eventId: uuid("event_id").notNull().unique(),

    type: varchar("type", {
      length: 120,
    }).notNull(),

    sourceModule: varchar("source_module", {
      length: 64,
    }).notNull(),

    origin: varchar("origin", {
      length: 32,
    }).notNull(),

    mileageKm: integer("mileage_km"),

    confidence: doublePrecision("confidence").notNull().default(1),

    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),

    attachments: jsonb("attachments").$type<string[]>(),

    occurredAt: timestamp("occurred_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),

    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    vehicleOccurredAtIndex: index("vehicle_history_vehicle_occurred_at_idx").on(
      table.vehicleId,
      table.occurredAt,
    ),

    vehicleTypeIndex: index("vehicle_history_vehicle_type_idx").on(
      table.vehicleId,
      table.type,
    ),

    sourceModuleIndex: index("vehicle_history_source_module_idx").on(
      table.sourceModule,
    ),
  }),
);

export type VehicleHistoryEvent = typeof vehicleHistoryEvents.$inferSelect;

export type NewVehicleHistoryEvent = typeof vehicleHistoryEvents.$inferInsert;
