import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { vehicles } from "../../garage/schemas/vehicle.schema";

export const vehicleDocuments = pgTable(
  "vehicle_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, {
        onDelete: "cascade",
      }),

    /**
     * insurance
     * registration
     * inspection
     * service-invoice
     * purchase
     * warranty
     * tax
     * fine
     * receipt
     * manual
     * other
     */
    type: varchar("type", {
      length: 32,
    }).notNull(),

    title: varchar("title", {
      length: 180,
    }).notNull(),

    description: text("description"),

    documentNumber: varchar("document_number", {
      length: 160,
    }),

    issuerName: varchar("issuer_name", {
      length: 180,
    }),

    issuedAt: timestamp("issued_at", {
      withTimezone: true,
      mode: "date",
    }),

    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }),

    /**
     * Провайдер внешнего object storage.
     *
     * Например:
     * r2
     * s3
     * supabase
     * azure-blob
     *
     * Никакого локального файлового storage.
     */
    storageProvider: varchar("storage_provider", {
      length: 32,
    }),

    /**
     * Bucket / container во внешнем object storage.
     */
    storageBucket: varchar("storage_bucket", {
      length: 160,
    }),

    /**
     * Ключ объекта во внешнем object storage.
     *
     * Пример:
     * vehicles/<vehicleId>/documents/<uuid>.pdf
     *
     * Это НЕ локальный путь.
     */
    storageKey: text("storage_key"),

    /**
     * Last signed upload target issued for this document.
     *
     * Kept durably so upload confirmation survives app restarts and works
     * across multiple web instances.
     */
    uploadIntentKey: text("upload_intent_key"),

    uploadIntentFileSizeBytes: integer("upload_intent_file_size_bytes"),

    uploadIntentExpiresAt: timestamp("upload_intent_expires_at", {
      withTimezone: true,
      mode: "date",
    }),

    /**
     * Версия объекта, если storage provider
     * поддерживает versioning.
     */
    storageVersionId: varchar("storage_version_id", {
      length: 255,
    }),

    originalFileName: varchar("original_file_name", {
      length: 255,
    }),

    mimeType: varchar("mime_type", {
      length: 120,
    }),

    /**
     * Размер файла в байтах.
     */
    fileSizeBytes: integer("file_size_bytes"),

    /**
     * SHA-256 или другой checksum.
     *
     * Нужен для deduplication,
     * integrity-check и безопасного импорта.
     */
    checksum: varchar("checksum", {
      length: 128,
    }),

    /**
     * manual
     * upload
     * telegram
     * email
     * integration
     * ocr
     * ai
     */
    source: varchar("source", {
      length: 32,
    })
      .notNull()
      .default("manual"),

    /**
     * none
     * pending
     * processing
     * completed
     * failed
     */
    processingStatus: varchar("processing_status", {
      length: 32,
    })
      .notNull()
      .default("none"),

    processingStartedAt: timestamp("processing_started_at", {
      withTimezone: true,
      mode: "date",
    }),

    processingError: text("processing_error"),

    /**
     * OCR/AI может сохранить сюда извлечённый текст.
     *
     * Это производные данные,
     * а не источник истины.
     */
    extractedText: text("extracted_text"),

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
    vehicleTypeIndex: index("vehicle_documents_vehicle_type_idx").on(
      table.vehicleId,
      table.type,
    ),

    vehicleExpiresAtIndex: index("vehicle_documents_vehicle_expires_at_idx").on(
      table.vehicleId,
      table.expiresAt,
    ),

    documentNumberIndex: index("vehicle_documents_document_number_idx").on(
      table.documentNumber,
    ),

    processingStatusIndex: index("vehicle_documents_processing_status_idx").on(
      table.processingStatus,
    ),

    storageObjectIndex: index("vehicle_documents_storage_object_idx").on(
      table.storageProvider,
      table.storageBucket,
      table.storageKey,
    ),

    uploadIntentIndex: index("vehicle_documents_upload_intent_idx").on(
      table.uploadIntentKey,
      table.uploadIntentExpiresAt,
    ),

    checksumIndex: index("vehicle_documents_checksum_idx").on(table.checksum),
  }),
);

export type VehicleDocument = typeof vehicleDocuments.$inferSelect;

export type NewVehicleDocument = typeof vehicleDocuments.$inferInsert;
