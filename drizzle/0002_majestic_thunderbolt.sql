CREATE TABLE "vehicle_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"source" varchar(32) DEFAULT 'manual' NOT NULL,
	"engine_code" varchar(64),
	"engine_family" varchar(120),
	"displacement_cc" integer,
	"fuel_type" varchar(32),
	"aspiration_type" varchar(32),
	"power_kw" integer,
	"power_hp" integer,
	"transmission_type" varchar(32),
	"transmission_code" varchar(64),
	"drive_type" varchar(32),
	"battery_capacity_kwh" double precision,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vehicle_profiles" ADD CONSTRAINT "vehicle_profiles_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vehicle_profiles_vehicle_id_idx" ON "vehicle_profiles" USING btree ("vehicle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicle_profiles_vehicle_version_uidx" ON "vehicle_profiles" USING btree ("vehicle_id","version");