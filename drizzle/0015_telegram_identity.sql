ALTER TABLE "users" ADD COLUMN "telegram_id" varchar(32);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "telegram_username" varchar(64);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "telegram_photo_url" varchar(2048);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_telegram_id_unique" UNIQUE("telegram_id");
