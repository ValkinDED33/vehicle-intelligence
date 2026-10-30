CREATE TABLE "telegram_links" (
  "token_hash" varchar(64) PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  CONSTRAINT "telegram_links_user_id_unique" UNIQUE("user_id")
);--> statement-breakpoint
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
