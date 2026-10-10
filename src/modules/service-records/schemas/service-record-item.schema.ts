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
     * work       — виконана робота
     * part       — запчастина
     * fluid      — масло / антифриз / гальмівна рідина
     * consumable — витратний матеріал
     * diagnostic — діагностична операція
     * other      — інше
     */
    itemType: varchar("item_type", {
      length: 32,
    }).notNull(),

    name: varchar("name", {
      length: 180,
    }).notNull(),

    description: text("description"),

    /**
     * Виробник деталі / рідини.
     * Наприклад MANN, Bosch, Motul, OEM.
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
     * Кількість.
     *
     * Наприклад:
     * 1 фільтр
     * 4 свічки
     * 5.2 літра масла
     */
    quantity: numeric("quantity", {
      precision: 12,
      scale: 3,
    }),

    /**
     * piece / liter / ml / kg / hour / set тощо.
     */
    unit: varchar("unit", {
      length: 32,
    }),

    /**
     * Ціна однієї одиниці.
     */
    unitCost: numeric("unit_cost", {
      precision: 12,
      scale: 2,
    }),

    /**
     * Вартість цієї позиції.
     */
    totalCost: numeric("total_cost", {
      precision: 12,
      scale: 2,
    }),

    currency: varchar("currency", {
      length: 3,
    }),

    /**
     * Гарантія саме на цю позицію,
     * якщо вона відома.
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
