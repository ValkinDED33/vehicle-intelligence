CREATE TABLE "energy_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"kind" varchar(16) NOT NULL,
	"energy_type" varchar(32) NOT NULL,
	"volume_liters" numeric(10, 3),
	"energy_kwh" numeric(10, 3),
	"unit_price" numeric(12, 4),
	"subtotal_cost" numeric(12, 2),
	"discount_percent" numeric(5, 2),
	"discount_amount" numeric(12, 2),
	"discount_label" varchar(120),
	"total_cost" numeric(12, 2),
	"currency" varchar(3),
	"odometer_km" integer,
	"is_full_tank" boolean DEFAULT false NOT NULL,
	"provider_name" varchar(160),
	"source" varchar(32) DEFAULT 'manual' NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vehicle_profiles" ADD COLUMN "fuel_tank_capacity_liters" double precision;--> statement-breakpoint
ALTER TABLE "vehicle_profiles" ADD COLUMN "adblue_tank_capacity_liters" double precision;--> statement-breakpoint
ALTER TABLE "vehicle_profiles" ADD COLUMN "battery_gross_capacity_kwh" double precision;--> statement-breakpoint
ALTER TABLE "vehicle_profiles" ADD COLUMN "battery_usable_capacity_kwh" double precision;--> statement-breakpoint
ALTER TABLE "energy_entries" ADD CONSTRAINT "energy_entries_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "energy_entries_vehicle_occurred_at_idx" ON "energy_entries" USING btree ("vehicle_id","occurred_at");--> statement-breakpoint
CREATE INDEX "energy_entries_vehicle_energy_type_idx" ON "energy_entries" USING btree ("vehicle_id","energy_type");--> statement-breakpoint
CREATE INDEX "energy_entries_vehicle_odometer_idx" ON "energy_entries" USING btree ("vehicle_id","odometer_km");--> statement-breakpoint
CREATE INDEX "energy_entries_vehicle_full_tank_idx" ON "energy_entries" USING btree ("vehicle_id","is_full_tank","occurred_at");--> statement-breakpoint
ALTER TABLE "vehicle_profiles" DROP COLUMN "battery_capacity_kwh";