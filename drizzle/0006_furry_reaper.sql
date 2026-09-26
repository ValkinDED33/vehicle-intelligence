CREATE TABLE "maintenance_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"key" varchar(120) NOT NULL,
	"title" varchar(160) NOT NULL,
	"source" varchar(32) DEFAULT 'manual' NOT NULL,
	"interval_km" integer,
	"interval_months" integer,
	"interval_engine_hours" integer,
	"warning_km_before" integer,
	"warning_days_before" integer,
	"warning_engine_hours_before" integer,
	"completion_event_type" varchar(160) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "maintenance_rules" ADD CONSTRAINT "maintenance_rules_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "maintenance_rules_vehicle_id_idx" ON "maintenance_rules" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "maintenance_rules_vehicle_key_idx" ON "maintenance_rules" USING btree ("vehicle_id","key");--> statement-breakpoint
CREATE INDEX "maintenance_rules_completion_event_type_idx" ON "maintenance_rules" USING btree ("completion_event_type");