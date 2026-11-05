CREATE TABLE "reminder_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reminder_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"retry_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"lock_token" uuid,
	"sent_at" timestamp with time zone,
	"message_id" integer,
	"last_error" varchar(48)
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"title" varchar(180) NOT NULL,
	"due_date" varchar(10) NOT NULL,
	"remind_at" varchar(5) NOT NULL,
	"time_zone" varchar(64) NOT NULL,
	"offsets" jsonb NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reminder_deliveries" ADD CONSTRAINT "reminder_deliveries_reminder_id_reminders_id_fk" FOREIGN KEY ("reminder_id") REFERENCES "public"."reminders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reminder_deliveries_due_idx" ON "reminder_deliveries" USING btree ("status","retry_at","scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reminder_deliveries_schedule_idx" ON "reminder_deliveries" USING btree ("reminder_id","revision","scheduled_at");--> statement-breakpoint
CREATE INDEX "reminders_vehicle_idx" ON "reminders" USING btree ("vehicle_id");