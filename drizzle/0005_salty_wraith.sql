CREATE TABLE "mileage_readings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"odometer_km" integer NOT NULL,
	"engine_hours" double precision,
	"source" varchar(32) DEFAULT 'manual' NOT NULL,
	"confidence" double precision DEFAULT 1 NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mileage_readings" ADD CONSTRAINT "mileage_readings_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mileage_readings_vehicle_recorded_at_idx" ON "mileage_readings" USING btree ("vehicle_id","recorded_at");--> statement-breakpoint
CREATE INDEX "mileage_readings_vehicle_odometer_idx" ON "mileage_readings" USING btree ("vehicle_id","odometer_km");