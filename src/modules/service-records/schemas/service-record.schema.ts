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

import { expenses } from "../../expenses/schemas/expense.schema";
import { vehicles } from "../../garage/schemas/vehicle.schema";

export const serviceRecords = pgTable(
  "service_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, {
        onDelete: "cascade",
      }),

    /**
     * Пов’язана фінансова витрата.
     *
     * ServiceRecord зберігає факт обслуговування,
     * а Expense залишається джерелом істини
     * для Cost of Ownership.
     */
    expenseId: uuid("expense_id").references(() => expenses.id, {
      onDelete: "set null",
    }),

    /**
     * maintenance / repair / diagnostic /
     * inspection / replacement / upgrade / other
     */
    type: varchar("type", {
      length: 32,
    }).notNull(),

    title: varchar("title", {
      length: 180,
    }).notNull(),

    description: text("description"),

    odometerKm: integer("odometer_km"),

    engineHours: numeric("engine_hours", {
      precision: 12,
      scale: 2,
    }),

    /**
     * Сервіс / майстер / дилер.
     */
    providerName: varchar("provider_name", {
      length: 180,
    }),

    /**
     * Номер замовлення-наряду / invoice / service order.
     */
    documentNumber: varchar("document_number", {
      length: 120,
    }),

    /**
     * Інформаційна вартість із замовлення-наряду.
     *
     * У Cost of Ownership напряму НЕ підсумовується.
     * Для фінансової аналітики використовується Expense.
     */
    totalCost: numeric("total_cost", {
      precision: 12,
      scale: 2,
    }),

    currency: varchar("currency", {
      length: 3,
    }),

    /**
     * manual / telegram / receipt / ocr /
     * service / integration / ai
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
    vehicleOccurredAtIndex: index("service_records_vehicle_occurred_at_idx").on(
      table.vehicleId,
      table.occurredAt,
    ),

    vehicleTypeIndex: index("service_records_vehicle_type_idx").on(
      table.vehicleId,
      table.type,
    ),

    vehicleOdometerIndex: index("service_records_vehicle_odometer_idx").on(
      table.vehicleId,
      table.odometerKm,
    ),

    expenseIdIndex: index("service_records_expense_id_idx").on(table.expenseId),
  }),
);

export type ServiceRecord = typeof serviceRecords.$inferSelect;

export type NewServiceRecord = typeof serviceRecords.$inferInsert;
