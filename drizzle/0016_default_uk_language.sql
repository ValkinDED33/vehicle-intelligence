UPDATE "users" SET "language" = 'uk' WHERE "language" = 'ru';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "language" SET DEFAULT 'uk';
