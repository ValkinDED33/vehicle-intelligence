CREATE TABLE "vehicle_artworks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "vehicle_id" uuid NOT NULL REFERENCES "vehicles"("id") ON DELETE cascade,
  "fingerprint" varchar(64) NOT NULL,
  "facts" jsonb NOT NULL,
  "state" varchar(16) NOT NULL CHECK ("state" IN ('generating','ready','failed','uncertain')),
  "token" uuid NOT NULL,
  "image_base64" text CHECK (length("image_base64") <= 2796204),
  "error_code" varchar(48),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "vehicle_artworks_ready_image" CHECK (("state" = 'ready') = ("image_base64" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "vehicle_artworks_facts_idx" ON "vehicle_artworks" ("owner_id","vehicle_id","fingerprint");
--> statement-breakpoint
CREATE INDEX "vehicle_artworks_owner_day_idx" ON "vehicle_artworks" ("owner_id","created_at");
--> statement-breakpoint
CREATE TABLE "vehicle_artwork_budgets" (
  "day" varchar(10) PRIMARY KEY NOT NULL,
  "used" integer DEFAULT 0 NOT NULL CHECK ("used" >= 0)
);
