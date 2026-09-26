CREATE TABLE "vin_decodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"vin" varchar(17) NOT NULL,
	"provider" varchar(64) NOT NULL,
	"status" varchar(32) DEFAULT 'success' NOT NULL,
	"make" varchar(120),
	"model" varchar(120),
	"model_year" integer,
	"engine_code" varchar(64),
	"engine_family" varchar(120),
	"displacement_cc" integer,
	"fuel_type" varchar(32),
	"transmission_type" varchar(32),
	"drive_type" varchar(32),
	"raw_payload" jsonb,
	"decoded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vin_decodes" ADD CONSTRAINT "vin_decodes_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vin_decodes_vehicle_id_idx" ON "vin_decodes" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "vin_decodes_vin_idx" ON "vin_decodes" USING btree ("vin");--> statement-breakpoint
CREATE INDEX "vin_decodes_vehicle_decoded_at_idx" ON "vin_decodes" USING btree ("vehicle_id","decoded_at");