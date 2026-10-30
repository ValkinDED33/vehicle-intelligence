CREATE TABLE "telegram_conversations" (
  "user_id" uuid PRIMARY KEY NOT NULL,
  "state" jsonb NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "lock_token" uuid,
  "locked_until" timestamp with time zone
);--> statement-breakpoint
ALTER TABLE "telegram_conversations" ADD CONSTRAINT "telegram_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
