import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { vehicles } from "../../garage/schemas/vehicle.schema";

export const vehicleProfiles = pgTable(
  "vehicle_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, {
        onDelete: "cascade",
      }),

    version: integer("version").notNull().default(1),

    isCurrent: boolean("is_current").notNull().default(true),

    source: varchar("source", {
      length: 32,
    })
      .notNull()
      .default("manual"),

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

    aspirationType: varchar("aspiration_type", {
      length: 32,
    }),

    powerKw: integer("power_kw"),

    powerHp: integer("power_hp"),

    transmissionType: varchar("transmission_type", {
      length: 32,
    }),

    transmissionCode: varchar("transmission_code", {
      length: 64,
    }),

    driveType: varchar("drive_type", {
      length: 32,
    }),

    /**
     * Полная ёмкость топливного бака.
     * Применяется только если у автомобиля
     * есть жидкое/газовое топливо.
     */
    fuelTankCapacityLiters: doublePrecision("fuel_tank_capacity_liters"),

    /**
     * Ёмкость бака AdBlue, если система есть.
     */
    adBlueTankCapacityLiters: doublePrecision("adblue_tank_capacity_liters"),

    /**
     * Полная физическая ёмкость тяговой батареи.
     */
    batteryGrossCapacityKwh: doublePrecision("battery_gross_capacity_kwh"),

    /**
     * Доступная пользователю ёмкость батареи.
     * Именно её чаще логичнее использовать
     * для эксплуатационных расчётов.
     */
    batteryUsableCapacityKwh: doublePrecision("battery_usable_capacity_kwh"),

    confirmedAt: timestamp("confirmed_at", {
      withTimezone: true,
      mode: "date",
    }),

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
    vehicleIdIndex: index("vehicle_profiles_vehicle_id_idx").on(
      table.vehicleId,
    ),

    vehicleVersionUnique: uniqueIndex(
      "vehicle_profiles_vehicle_version_uidx",
    ).on(table.vehicleId, table.version),

    vehicleCurrentUnique: uniqueIndex("vehicle_profiles_vehicle_current_uidx")
      .on(table.vehicleId)
      .where(sql`${table.isCurrent} = true`),
  }),
);

export type VehicleProfile = typeof vehicleProfiles.$inferSelect;

export type NewVehicleProfile = typeof vehicleProfiles.$inferInsert;
