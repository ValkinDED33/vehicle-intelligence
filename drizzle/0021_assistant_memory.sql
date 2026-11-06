CREATE TABLE "assistant_memories" (
  "owner_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "scope_key" varchar(36) NOT NULL,
  "vehicle_id" uuid REFERENCES "vehicles"("id") ON DELETE CASCADE,
  "language" varchar(2) NOT NULL,
  "messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "epoch" integer DEFAULT 0 NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "lock_token" uuid,
  "locked_until" timestamp with time zone,
  PRIMARY KEY ("owner_id", "scope_key", "language"),
  CONSTRAINT "assistant_memory_scope" CHECK ("scope_key" = coalesce("vehicle_id"::text, 'general')),
  CONSTRAINT "assistant_memory_language" CHECK ("language" in ('uk','pl','en'))
);
--> statement-breakpoint
CREATE INDEX "assistant_memories_expiry_idx" ON "assistant_memories" ("expires_at");
