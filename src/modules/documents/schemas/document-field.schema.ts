import {
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { vehicleDocuments } from "./vehicle-document.schema";

export const documentFields = pgTable(
  "document_fields",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    documentId: uuid("document_id")
      .notNull()
      .references(() => vehicleDocuments.id, {
        onDelete: "cascade",
      }),

    /**
     * Нормалізований ключ поля.
     *
     * Приклади:
     * vin
     * policy_number
     * registration_number
     * issuer
     * valid_from
     * valid_until
     * total_amount
     * currency
     * odometer_km
     */
    fieldKey: varchar("field_key", {
      length: 120,
    }).notNull(),

    /**
     * Людиночитна назва.
     */
    fieldLabel: varchar("field_label", {
      length: 180,
    }),

    /**
     * string / number / date /
     * currency / boolean / json
     */
    valueType: varchar("value_type", {
      length: 32,
    })
      .notNull()
      .default("string"),

    /**
     * Нормалізоване строкове значення.
     */
    valueText: text("value_text"),

    /**
     * Для числових значень.
     */
    valueNumber: numeric("value_number", {
      precision: 18,
      scale: 4,
    }),

    /**
     * Для складних структурованих даних.
     *
     * Наприклад список позицій invoice.
     */
    valueJson: jsonb("value_json"),

    /**
     * Впевненість OCR/AI: 0..1.
     */
    confidence: numeric("confidence", {
      precision: 5,
      scale: 4,
    }),

    /**
     * manual / ocr / ai / integration
     */
    source: varchar("source", {
      length: 32,
    })
      .notNull()
      .default("manual"),

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
    documentIndex: index("document_fields_document_idx").on(table.documentId),

    documentFieldKeyIndex: index("document_fields_document_key_idx").on(
      table.documentId,
      table.fieldKey,
    ),

    fieldKeyIndex: index("document_fields_key_idx").on(table.fieldKey),
  }),
);

export type DocumentField = typeof documentFields.$inferSelect;

export type NewDocumentField = typeof documentFields.$inferInsert;
