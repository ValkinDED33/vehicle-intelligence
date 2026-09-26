CREATE TABLE "document_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"field_key" varchar(120) NOT NULL,
	"field_label" varchar(180),
	"value_type" varchar(32) DEFAULT 'string' NOT NULL,
	"value_text" text,
	"value_number" numeric(18, 4),
	"value_json" jsonb,
	"confidence" numeric(5, 4),
	"source" varchar(32) DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"type" varchar(32) NOT NULL,
	"title" varchar(180) NOT NULL,
	"description" text,
	"document_number" varchar(160),
	"issuer_name" varchar(180),
	"issued_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"storage_provider" varchar(32),
	"storage_bucket" varchar(160),
	"storage_key" text,
	"storage_version_id" varchar(255),
	"original_file_name" varchar(255),
	"mime_type" varchar(120),
	"file_size_bytes" integer,
	"checksum" varchar(128),
	"source" varchar(32) DEFAULT 'manual' NOT NULL,
	"processing_status" varchar(32) DEFAULT 'none' NOT NULL,
	"extracted_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_fields" ADD CONSTRAINT "document_fields_document_id_vehicle_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."vehicle_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_documents" ADD CONSTRAINT "vehicle_documents_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_fields_document_idx" ON "document_fields" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "document_fields_document_key_idx" ON "document_fields" USING btree ("document_id","field_key");--> statement-breakpoint
CREATE INDEX "document_fields_key_idx" ON "document_fields" USING btree ("field_key");--> statement-breakpoint
CREATE INDEX "vehicle_documents_vehicle_type_idx" ON "vehicle_documents" USING btree ("vehicle_id","type");--> statement-breakpoint
CREATE INDEX "vehicle_documents_vehicle_expires_at_idx" ON "vehicle_documents" USING btree ("vehicle_id","expires_at");--> statement-breakpoint
CREATE INDEX "vehicle_documents_document_number_idx" ON "vehicle_documents" USING btree ("document_number");--> statement-breakpoint
CREATE INDEX "vehicle_documents_processing_status_idx" ON "vehicle_documents" USING btree ("processing_status");--> statement-breakpoint
CREATE INDEX "vehicle_documents_storage_object_idx" ON "vehicle_documents" USING btree ("storage_provider","storage_bucket","storage_key");--> statement-breakpoint
CREATE INDEX "vehicle_documents_checksum_idx" ON "vehicle_documents" USING btree ("checksum");