CREATE TABLE "vin_check_access" (
  "owner_id" uuid PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "state" varchar(16) DEFAULT 'available' NOT NULL,
  "claim_token" uuid,
  "claimed_at" timestamptz,
  "source" varchar(100),
  "vin" varchar(17),
  CONSTRAINT "vin_check_access_state" CHECK ("state" IN ('available','in_progress','used','uncertain'))
);
--> statement-breakpoint
CREATE TABLE "standalone_vin_checks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "vin" varchar(17) NOT NULL,
  "status" varchar(16) DEFAULT 'success' NOT NULL,
  "result" jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "standalone_vin_checks_owner_created_idx" ON "standalone_vin_checks" ("owner_id", "created_at");
--> statement-breakpoint
INSERT INTO "vin_check_access" ("owner_id", "state", "source")
SELECT DISTINCT v.owner_id, 'used', 'existing-report'
FROM vehicles v
WHERE EXISTS (SELECT 1 FROM vin_decodes d WHERE d.vehicle_id = v.id AND d.status = 'success')
   OR EXISTS (SELECT 1 FROM vehicle_external_reports r WHERE r.vehicle_id = v.id AND r.provider IN ('vehicle-databases','oneauto','vincario') AND r.vin IS NOT NULL AND r.status IN ('success', 'no-data'));
