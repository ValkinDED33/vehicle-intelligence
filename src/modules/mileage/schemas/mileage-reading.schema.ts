import {
  doublePrecision,
  index,
  integer,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { vehicles } from "../../garage/schemas/vehicle.schema";

export const mileageReadings = pgTable(
  "mileage_readings",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, {
        onDelete: "cascade",
      }),

    odometerKm: integer("odometer_km").notNull(),

    /**
     * Мотогодини, якщо конкретний автомобіль
     * надає таку інформацію.
     */
    engineHours: doublePrecision("engine_hours"),

    /**
     * Звідки отримано показання:
     * manual / telegram / obd / document / service / system.
     */
    source: varchar("source", {
      length: 32,
    })
      .notNull()
      .default("manual"),

    /**
     * Впевненість у даних: 0..1.
     * Для ручного підтвердженого вводу зазвичай 1.
     */
    confidence: doublePrecision("confidence").notNull().default(1),

    recordedAt: timestamp("recorded_at", {
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
    vehicleRecordedAtIndex: index(
      "mileage_readings_vehicle_recorded_at_idx",
    ).on(table.vehicleId, table.recordedAt),

    vehicleOdometerIndex: index("mileage_readings_vehicle_odometer_idx").on(
      table.vehicleId,
      table.odometerKm,
    ),
  }),
);

export type MileageReading = typeof mileageReadings.$inferSelect;

export type NewMileageReading = typeof mileageReadings.$inferInsert;
