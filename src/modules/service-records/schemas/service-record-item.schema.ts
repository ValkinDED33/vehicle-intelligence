import {
  index,
  integer,
  numeric,
  pgTable,
  text,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { serviceRecords } from "./service-record.schema";

export const serviceRecordItems = pgTable(
  "service_record_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    serviceRecordId: uuid("service_record_id")
      .notNull()
      .references(() => serviceRecords.id, {
        onDelete: "cascade",
      }),

    /**
     * work       — выполненная работа
     * part       — запчасть
     * fluid      — масло / антифриз / тормозная жидкость
     * consumable — расходник
     * diagnostic — диагностическая операция
     * other      — другое
     */
    itemType: varchar("item_type", {
      length: 32,
    }).notNull(),

    name: varchar("name", {
      length: 180,
    }).notNull(),

    description: text("description"),

    /**
     * Производитель детали / жидкости.
     * Например MANN, Bosch, Motul, OEM.
     */
    brand: varchar("brand", {
      length: 120,
    }),

    /**
     * OEM / manufacturer / catalog part number.
     */
    partNumber: varchar("part_number", {
      length: 120,
    }),

    /**
     * Количество.
     *
     * Например:
     * 1 фильтр
     * 4 свечи
     * 5.2 литра масла
     */
    quantity: numeric("quantity", {
      precision: 12,
      scale: 3,
    }),

    /**
     * piece / liter / ml / kg / hour / set и т.д.
     */
    unit: varchar("unit", {
      length: 32,
    }),

    /**
     * Цена одной единицы.
     */
    unitCost: numeric("unit_cost", {
      precision: 12,
      scale: 2,
    }),

    /**
     * Стоимость этой позиции.
     */
    totalCost: numeric("total_cost", {
      precision: 12,
      scale: 2,
    }),

    currency: varchar("currency", {
      length: 3,
    }),

    /**
     * Гарантия именно на эту позицию,
     * если она известна.
     */
    warrantyMonths: integer("warranty_months"),

    warrantyKm: integer("warranty_km"),
  },
  (table) => ({
    serviceRecordIndex: index("service_record_items_service_record_idx").on(
      table.serviceRecordId,
    ),

    itemTypeIndex: index("service_record_items_type_idx").on(table.itemType),

    partNumberIndex: index("service_record_items_part_number_idx").on(
      table.partNumber,
    ),
  }),
);

export type ServiceRecordItem = typeof serviceRecordItems.$inferSelect;

export type NewServiceRecordItem = typeof serviceRecordItems.$inferInsert;
