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
     * fuel   — бензин / дизель / LPG / CNG и т.п.
     * charge — зарядка EV / PHEV.
     */
    kind: varchar("kind", {
      length: 16,
    }).notNull(),

    /**
     * petrol / diesel / lpg / cng /
     * electricity / hydrogen и т.п.
     */
    energyType: varchar("energy_type", {
      length: 32,
    }).notNull(),

    /**
     * Количество топлива в литрах.
     * Для EV остаётся null.
     */
    volumeLiters: numeric("volume_liters", {
      precision: 10,
      scale: 3,
    }),

    /**
     * Полученная электроэнергия.
     * Для ДВС остаётся null.
     */
    energyKwh: numeric("energy_kwh", {
      precision: 10,
      scale: 3,
    }),

    /**
     * Цена за литр / кВт⋅ч до скидки.
     */
    unitPrice: numeric("unit_price", {
      precision: 12,
      scale: 4,
    }),

    /**
     * Стоимость до скидки.
     */
    subtotalCost: numeric("subtotal_cost", {
      precision: 12,
      scale: 2,
    }),

    /**
     * Скидка в процентах.
     * Например 5.00 = 5%.
     */
    discountPercent: numeric("discount_percent", {
      precision: 5,
      scale: 2,
    }),

    /**
     * Абсолютная сумма скидки.
     */
    discountAmount: numeric("discount_amount", {
      precision: 12,
      scale: 2,
    }),

    /**
     * Название скидки:
     * loyalty / coupon / fleet / promotion и т.п.
     */
    discountLabel: varchar("discount_label", {
      length: 120,
    }),

    /**
     * Итоговая реально уплаченная сумма.
     */
    totalCost: numeric("total_cost", {
      precision: 12,
      scale: 2,
    }),

    /**
     * ISO 4217:
     * PLN / EUR / USD / UAH и т.п.
     */
    currency: varchar("currency", {
      length: 3,
    }),

    /**
     * Пробег на момент операции.
     */
    odometerKm: integer("odometer_km"),

    /**
     * true означает, что после этой заправки
     * пользователь подтвердил полный бак.
     *
     * Используется для точного full-to-full
     * расчёта расхода топлива.
     *
     * Для EV обычно false.
     */
    isFullTank: boolean("is_full_tank").notNull().default(false),

    /**
     * АЗС / зарядная станция / оператор.
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
