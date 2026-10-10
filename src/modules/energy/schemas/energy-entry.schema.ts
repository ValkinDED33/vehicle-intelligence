import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { vehicles } from "../../garage/schemas/vehicle.schema";

export const energyEntries = pgTable(
  "energy_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, {
        onDelete: "cascade",
      }),

    /**
     * fuel   — бензин / дизель / LPG / CNG тощо.
     * charge — заряджання EV / PHEV.
     */
    kind: varchar("kind", {
      length: 16,
    }).notNull(),

    /**
     * petrol / diesel / lpg / cng /
     * electricity / hydrogen тощо.
     */
    energyType: varchar("energy_type", {
      length: 32,
    }).notNull(),

    /**
     * Кількість пального в літрах.
     * Для EV залишається null.
     */
    volumeLiters: numeric("volume_liters", {
      precision: 10,
      scale: 3,
    }),

    /**
     * Отримана електроенергія.
     * Для ДВЗ залишається null.
     */
    energyKwh: numeric("energy_kwh", {
      precision: 10,
      scale: 3,
    }),

    /**
     * Ціна за літр / кВт⋅год до знижки.
     */
    unitPrice: numeric("unit_price", {
      precision: 12,
      scale: 4,
    }),

    /**
     * Вартість до знижки.
     */
    subtotalCost: numeric("subtotal_cost", {
      precision: 12,
      scale: 2,
    }),

    /**
     * Знижка у відсотках.
     * Наприклад 5.00 = 5%.
     */
    discountPercent: numeric("discount_percent", {
      precision: 5,
      scale: 2,
    }),

    /**
     * Абсолютна сума знижки.
     */
    discountAmount: numeric("discount_amount", {
      precision: 12,
      scale: 2,
    }),

    /**
     * Назва знижки:
     * loyalty / coupon / fleet / promotion тощо.
     */
    discountLabel: varchar("discount_label", {
      length: 120,
    }),

    /**
     * Підсумкова реально сплачена сума.
     */
    totalCost: numeric("total_cost", {
      precision: 12,
      scale: 2,
    }),

    /**
     * ISO 4217:
     * PLN / EUR / USD / UAH тощо.
     */
    currency: varchar("currency", {
      length: 3,
    }),

    /**
     * Пробіг на момент операції.
     */
    odometerKm: integer("odometer_km"),

    /**
     * true означає, що після цієї заправки
     * користувач підтвердив повний бак.
     *
     * Використовується для точного full-to-full
     * розрахунку витрати пального.
     *
     * Для EV зазвичай false.
     */
    isFullTank: boolean("is_full_tank").notNull().default(false),

    /**
     * АЗС / зарядна станція / оператор.
     */
    providerName: varchar("provider_name", {
      length: 160,
    }),

    /**
     * manual / telegram / receipt /
     * ocr / integration.
     */
    source: varchar("source", {
      length: 32,
    })
      .notNull()
      .default("manual"),

    occurredAt: timestamp("occurred_at", {
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
    vehicleOccurredAtIndex: index("energy_entries_vehicle_occurred_at_idx").on(
      table.vehicleId,
      table.occurredAt,
    ),

    vehicleEnergyTypeIndex: index("energy_entries_vehicle_energy_type_idx").on(
      table.vehicleId,
      table.energyType,
    ),

    vehicleOdometerIndex: index("energy_entries_vehicle_odometer_idx").on(
      table.vehicleId,
      table.odometerKm,
    ),

    vehicleFullTankIndex: index("energy_entries_vehicle_full_tank_idx").on(
      table.vehicleId,
      table.isFullTank,
      table.occurredAt,
    ),
  }),
);

export type EnergyEntry = typeof energyEntries.$inferSelect;

export type NewEnergyEntry = typeof energyEntries.$inferInsert;
