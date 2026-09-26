import {
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { vehicles } from "../../garage/schemas/vehicle.schema";

export const vinDecodes = pgTable(
  "vin_decodes",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, {
        onDelete: "cascade",
      }),

    vin: varchar("vin", {
      length: 17,
    }).notNull(),

    provider: varchar("provider", {
      length: 64,
    }).notNull(),

    status: varchar("status", {
      length: 32,
    })
      .notNull()
      .default("success"),

    make: varchar("make", {
      length: 120,
    }),

    model: varchar("model", {
      length: 120,
    }),

    modelYear: integer("model_year"),

    engineCode: varchar("engine_code", {
      length: 64,
    }),

    engineFamily: varchar("engine_family", {
      length: 120,
    }),

    displacementCc: integer("displacement_cc"),

    fuelType: varchar("fuel_type", {
      length: 32,
    }),

    transmissionType: varchar("transmission_type", {
      length: 32,
    }),

    driveType: varchar("drive_type", {
      length: 32,
    }),

    rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>(),

    decodedAt: timestamp("decoded_at", {
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
    vehicleIdIndex: index("vin_decodes_vehicle_id_idx").on(table.vehicleId),

    vinIndex: index("vin_decodes_vin_idx").on(table.vin),

    vehicleDecodedAtIndex: index("vin_decodes_vehicle_decoded_at_idx").on(
      table.vehicleId,
      table.decodedAt,
    ),
  }),
);

export type VinDecode = typeof vinDecodes.$inferSelect;

export type NewVinDecode = typeof vinDecodes.$inferInsert;
