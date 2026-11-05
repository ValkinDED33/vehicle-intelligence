ALTER TABLE "maintenance_rules" ADD COLUMN "telegram_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "maintenance_rules" ADD COLUMN "notify_when_due" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "maintenance_rules" ADD COLUMN "reminder_offsets" jsonb DEFAULT '[{"amount":1,"unit":"months"},{"amount":1,"unit":"weeks"}]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "maintenance_rules" ADD COLUMN "remind_at" varchar(5) DEFAULT '09:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "maintenance_rules" ADD COLUMN "time_zone" varchar(64) DEFAULT 'Europe/Warsaw' NOT NULL;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "document_id" uuid;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "maintenance_rule_id" uuid;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "source_cycle" varchar(160);--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "source_phase" varchar(32);--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "source_version" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "target_odometer_km" integer;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "service_due_date" varchar(10);--> statement-breakpoint
ALTER TABLE "service_records" ADD COLUMN "maintenance_keys" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_document_id_vehicle_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."vehicle_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_maintenance_rule_id_maintenance_rules_id_fk" FOREIGN KEY ("maintenance_rule_id") REFERENCES "public"."maintenance_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reminders_maintenance_cycle_idx" ON "reminders" USING btree ("maintenance_rule_id","source_cycle","source_phase");