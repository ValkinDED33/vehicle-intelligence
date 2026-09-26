import {
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { vehicles } from "../../garage/schemas/vehicle.schema";

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, {
        onDelete: "cascade",
      }),

    /**
     * maintenance / repair / parts / insurance /
     * inspection / tax / parking / toll / fine /
     * wash / detailing / accessories / tires /
     * roadside / registration / other
     *
     * fuel и charge сюда НЕ записываем.
     */
    category: varchar("category", {
      length: 32,
    }).notNull(),

    /**
     * Более точная пользовательская классификация.
     *
     * Например:
     * oil-change
     * brake-pads
     * oc
     * ac
     * seasonal-tire-change
     */
    subcategory: varchar("subcategory", {
      length: 64,
    }),

    title: varchar("title", {
      length: 160,
    }).notNull(),

    description: text("description"),

    /**
     * Цена до скидки.
     */
    subtotalCost: numeric("subtotal_cost", {
      precision: 12,
      scale: 2,
    }),

    discountPercent: numeric("discount_percent", {
      precision: 5,
      scale: 2,
    }),

    discountAmount: numeric("discount_amount", {
      precision: 12,
      scale: 2,
    }),

    discountLabel: varchar("discount_label", {
      length: 120,
    }),

    /**
     * Реально уплаченная сумма.
     */
    totalCost: numeric("total_cost", {
      precision: 12,
      scale: 2,
    }).notNull(),

    currency: varchar("currency", {
      length: 3,
    }).notNull(),

    /**
     * Пробег автомобиля в момент расхода,
     * если он известен.
     */
    odometerKm: integer("odometer_km"),

    /**
     * Сервис, магазин, страховая,
     * парковочный оператор и т.д.
     */
    providerName: varchar("provider_name", {
      length: 160,
    }),

    /**
     * Номер чека / счёта / invoice,
     * если пользователь его знает.
     */
    documentNumber: varchar("document_number", {
      length: 120,
    }),

    /**
     * manual / web / telegram /
     * receipt / ocr / integration / ai.
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

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    vehicleOccurredAtIndex: index("expenses_vehicle_occurred_at_idx").on(
      table.vehicleId,
      table.occurredAt,
    ),

    vehicleCategoryIndex: index("expenses_vehicle_category_idx").on(
      table.vehicleId,
      table.category,
    ),

    vehicleOdometerIndex: index("expenses_vehicle_odometer_idx").on(
      table.vehicleId,
      table.odometerKm,
    ),
  }),
);

export type Expense = typeof expenses.$inferSelect;

export type NewExpense = typeof expenses.$inferInsert;
