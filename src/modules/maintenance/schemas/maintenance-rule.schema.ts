import {
  boolean,
  index,
  integer,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { vehicles } from "../../garage/schemas/vehicle.schema";

export const maintenanceRules = pgTable(
  "maintenance_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, {
        onDelete: "cascade",
      }),

    /**
     * Стабільний ключ вузла/роботи.
     *
     * Приклади:
     * engine_oil
     * engine_oil_filter
     * air_filter
     * cabin_filter
     * brake_fluid
     * timing_belt
     * dsg_oil
     */
    key: varchar("key", {
      length: 120,
    }).notNull(),

    title: varchar("title", {
      length: 160,
    }).notNull(),

    /**
     * Тип джерела регламенту:
     * manufacturer / vin / manual / service / system.
     */
    source: varchar("source", {
      length: 32,
    })
      .notNull()
      .default("manual"),

    /**
     * Інтервал за пробігом.
     * null означає, що критерій за кілометрами не застосовується.
     */
    intervalKm: integer("interval_km"),

    /**
     * Інтервал за часом у місяцях.
     */
    intervalMonths: integer("interval_months"),

    /**
     * Інтервал за мотогодинами.
     */
    intervalEngineHours: integer("interval_engine_hours"),

    /**
     * Раннє попередження до досягнення основного інтервалу.
     */
    warningKmBefore: integer("warning_km_before"),

    warningDaysBefore: integer("warning_days_before"),

    warningEngineHoursBefore: integer("warning_engine_hours_before"),

    /**
     * Подія Vehicle History, яка вважається
     * підтвердженням виконання обслуговування.
     *
     * Наприклад: maintenance.engine_oil.changed
     */
    completionEventType: varchar("completion_event_type", {
      length: 160,
    }).notNull(),

    isActive: boolean("is_active").notNull().default(true),

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
    vehicleIndex: index("maintenance_rules_vehicle_id_idx").on(table.vehicleId),

    vehicleKeyIndex: index("maintenance_rules_vehicle_key_idx").on(
      table.vehicleId,
      table.key,
    ),

    completionEventTypeIndex: index(
      "maintenance_rules_completion_event_type_idx",
    ).on(table.completionEventType),
  }),
);

export type MaintenanceRule = typeof maintenanceRules.$inferSelect;

export type NewMaintenanceRule = typeof maintenanceRules.$inferInsert;
