import {
  index,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { vehicles } from "../../garage/schemas/vehicle.schema";

export const vehicleExternalReports = pgTable(
  "vehicle_external_reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, {
        onDelete: "cascade",
      }),

    provider: varchar("provider", {
      length: 64,
    }).notNull(),

    reportType: varchar("report_type", {
      length: 64,
    }).notNull(),

    vin: varchar("vin", {
      length: 17,
    }),

    status: varchar("status", {
      length: 32,
    }).notNull(),

    rawPayload: jsonb("raw_payload")
      .$type<Record<string, unknown>>()
      .notNull(),

    fetchedAt: timestamp("fetched_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),

    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    vehicleFetchedAtIndex: index(
      "vehicle_external_reports_vehicle_fetched_at_idx",
    ).on(table.vehicleId, table.fetchedAt),

    vehicleTypeIndex: index(
      "vehicle_external_reports_vehicle_type_idx",
    ).on(table.vehicleId, table.reportType),

    providerTypeIndex: index(
      "vehicle_external_reports_provider_type_idx",
    ).on(table.provider, table.reportType),
  }),
);

export type VehicleExternalReport =
  typeof vehicleExternalReports.$inferSelect;

export type NewVehicleExternalReport =
  typeof vehicleExternalReports.$inferInsert;
