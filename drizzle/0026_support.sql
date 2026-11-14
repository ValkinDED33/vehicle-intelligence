CREATE TABLE "support_tickets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "vehicle_id" uuid REFERENCES "vehicles"("id") ON DELETE set null,
  "subject" varchar(160) NOT NULL,
  "category" varchar(20) NOT NULL,
  "status" varchar(20) DEFAULT 'open' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "support_tickets_category_check" CHECK ("category" IN ('technical', 'report', 'account', 'other')),
  CONSTRAINT "support_tickets_status_check" CHECK ("status" IN ('open', 'in_progress', 'resolved')),
  CONSTRAINT "support_tickets_subject_check" CHECK (length(trim("subject")) BETWEEN 1 AND 160)
);
--> statement-breakpoint
CREATE INDEX "support_tickets_owner_updated_idx" ON "support_tickets" ("owner_id", "updated_at");
--> statement-breakpoint
CREATE INDEX "support_tickets_status_updated_idx" ON "support_tickets" ("status", "updated_at");
--> statement-breakpoint
CREATE INDEX "support_tickets_updated_idx" ON "support_tickets" ("updated_at");
--> statement-breakpoint
CREATE TABLE "support_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ticket_id" uuid NOT NULL REFERENCES "support_tickets"("id") ON DELETE cascade,
  "author_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "author_role" varchar(10) NOT NULL,
  "body" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "support_messages_role_check" CHECK ("author_role" IN ('user', 'admin')),
  CONSTRAINT "support_messages_body_check" CHECK (length(trim("body")) BETWEEN 1 AND 10000)
);
--> statement-breakpoint
CREATE INDEX "support_messages_ticket_created_idx" ON "support_messages" ("ticket_id", "created_at");
--> statement-breakpoint
CREATE TABLE "support_notification_outbox" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ticket_id" uuid NOT NULL REFERENCES "support_tickets"("id") ON DELETE cascade,
  "message_id" uuid NOT NULL REFERENCES "support_messages"("id") ON DELETE cascade,
  "event" varchar(20) NOT NULL,
  "status" varchar(10) DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
  "lock_token" uuid,
  "lease_until" timestamp with time zone,
  "last_error" varchar(40),
  "sent_to" text[] DEFAULT '{}'::text[] NOT NULL,
  "sent_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "support_outbox_status_check" CHECK ("status" IN ('pending', 'sending', 'sent', 'failed')),
  CONSTRAINT "support_outbox_event_check" CHECK ("event" IN ('new_ticket', 'new_reply')),
  CONSTRAINT "support_outbox_attempts_check" CHECK ("attempts" BETWEEN 0 AND 5)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "support_outbox_message_idx" ON "support_notification_outbox" ("message_id");
--> statement-breakpoint
CREATE INDEX "support_outbox_pending_idx" ON "support_notification_outbox" ("status", "next_attempt_at");
--> statement-breakpoint
CREATE INDEX "support_outbox_lease_idx" ON "support_notification_outbox" ("status", "lease_until");
