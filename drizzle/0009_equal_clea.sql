CREATE TABLE "service_record_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_record_id" uuid NOT NULL,
	"item_type" varchar(32) NOT NULL,
	"name" varchar(180) NOT NULL,
	"description" text,
	"brand" varchar(120),
	"part_number" varchar(120),
	"quantity" numeric(12, 3),
	"unit" varchar(32),
	"unit_cost" numeric(12, 2),
	"total_cost" numeric(12, 2),
	"currency" varchar(3),
	"warranty_months" integer,
	"warranty_km" integer
);
--> statement-breakpoint
CREATE TABLE "service_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"expense_id" uuid,
	"type" varchar(32) NOT NULL,
	"title" varchar(180) NOT NULL,
	"description" text,
	"odometer_km" integer,
	"engine_hours" numeric(12, 2),
	"provider_name" varchar(180),
	"document_number" varchar(120),
	"total_cost" numeric(12, 2),
	"currency" varchar(3),
	"source" varchar(32) DEFAULT 'manual' NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "service_record_items" ADD CONSTRAINT "service_record_items_service_record_id_service_records_id_fk" FOREIGN KEY ("service_record_id") REFERENCES "public"."service_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "service_record_items_service_record_idx" ON "service_record_items" USING btree ("service_record_id");--> statement-breakpoint
CREATE INDEX "service_record_items_type_idx" ON "service_record_items" USING btree ("item_type");--> statement-breakpoint
CREATE INDEX "service_record_items_part_number_idx" ON "service_record_items" USING btree ("part_number");--> statement-breakpoint
CREATE INDEX "service_records_vehicle_occurred_at_idx" ON "service_records" USING btree ("vehicle_id","occurred_at");--> statement-breakpoint
CREATE INDEX "service_records_vehicle_type_idx" ON "service_records" USING btree ("vehicle_id","type");--> statement-breakpoint
CREATE INDEX "service_records_vehicle_odometer_idx" ON "service_records" USING btree ("vehicle_id","odometer_km");--> statement-breakpoint
CREATE INDEX "service_records_expense_id_idx" ON "service_records" USING btree ("expense_id");