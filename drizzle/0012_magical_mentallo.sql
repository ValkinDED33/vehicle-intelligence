CREATE TABLE "vehicle_external_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"provider" varchar(64) NOT NULL,
	"report_type" varchar(64) NOT NULL,
	"vin" varchar(17),
	"status" varchar(32) NOT NULL,
	"raw_payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vehicle_external_reports" ADD CONSTRAINT "vehicle_external_reports_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vehicle_external_reports_vehicle_fetched_at_idx" ON "vehicle_external_reports" USING btree ("vehicle_id","fetched_at");--> statement-breakpoint
CREATE INDEX "vehicle_external_reports_vehicle_type_idx" ON "vehicle_external_reports" USING btree ("vehicle_id","report_type");--> statement-breakpoint
CREATE INDEX "vehicle_external_reports_provider_type_idx" ON "vehicle_external_reports" USING btree ("provider","report_type");