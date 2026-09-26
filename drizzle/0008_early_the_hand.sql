CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"category" varchar(32) NOT NULL,
	"subcategory" varchar(64),
	"title" varchar(160) NOT NULL,
	"description" text,
	"subtotal_cost" numeric(12, 2),
	"discount_percent" numeric(5, 2),
	"discount_amount" numeric(12, 2),
	"discount_label" varchar(120),
	"total_cost" numeric(12, 2) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"odometer_km" integer,
	"provider_name" varchar(160),
	"document_number" varchar(120),
	"source" varchar(32) DEFAULT 'manual' NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expenses_vehicle_occurred_at_idx" ON "expenses" USING btree ("vehicle_id","occurred_at");--> statement-breakpoint
CREATE INDEX "expenses_vehicle_category_idx" ON "expenses" USING btree ("vehicle_id","category");--> statement-breakpoint
CREATE INDEX "expenses_vehicle_odometer_idx" ON "expenses" USING btree ("vehicle_id","odometer_km");