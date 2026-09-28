ALTER TABLE "vehicle_profiles" ADD COLUMN "body_type" varchar(64);--> statement-breakpoint
ALTER TABLE "vehicle_profiles" ADD COLUMN "door_count" integer;--> statement-breakpoint
ALTER TABLE "vehicle_profiles" ADD COLUMN "seat_count" integer;--> statement-breakpoint
ALTER TABLE "vehicle_profiles" ADD COLUMN "trim_level" varchar(120);--> statement-breakpoint
ALTER TABLE "vehicle_profiles" ADD COLUMN "exterior_color" varchar(120);