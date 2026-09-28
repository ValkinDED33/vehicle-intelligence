ALTER TABLE "vehicle_documents" ADD COLUMN "upload_intent_key" text;--> statement-breakpoint
ALTER TABLE "vehicle_documents" ADD COLUMN "upload_intent_file_size_bytes" integer;--> statement-breakpoint
ALTER TABLE "vehicle_documents" ADD COLUMN "upload_intent_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vehicle_documents" ADD COLUMN "processing_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vehicle_documents" ADD COLUMN "processing_error" text;--> statement-breakpoint
CREATE INDEX "vehicle_documents_upload_intent_idx" ON "vehicle_documents" USING btree ("upload_intent_key","upload_intent_expires_at");