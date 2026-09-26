CREATE TABLE "vehicle_history_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"type" varchar(120) NOT NULL,
	"source_module" varchar(64) NOT NULL,
	"origin" varchar(32) NOT NULL,
	"mileage_km" integer,
	"confidence" double precision DEFAULT 1 NOT NULL,
	"payload" jsonb NOT NULL,
	"attachments" jsonb,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_history_events_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
ALTER TABLE "vehicle_history_events" ADD CONSTRAINT "vehicle_history_events_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vehicle_history_vehicle_occurred_at_idx" ON "vehicle_history_events" USING btree ("vehicle_id","occurred_at");--> statement-breakpoint
CREATE INDEX "vehicle_history_vehicle_type_idx" ON "vehicle_history_events" USING btree ("vehicle_id","type");--> statement-breakpoint
CREATE INDEX "vehicle_history_source_module_idx" ON "vehicle_history_events" USING btree ("source_module");