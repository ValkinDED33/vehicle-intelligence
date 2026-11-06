CREATE TABLE "assistant_preferences" (
  "owner_id" uuid PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "detail_level" varchar(16) DEFAULT 'concise' NOT NULL,
  "priority" varchar(16) DEFAULT 'balanced' NOT NULL,
  "driving_pattern" varchar(16) DEFAULT 'unspecified' NOT NULL,
  "revision" integer DEFAULT 0 NOT NULL,
  CONSTRAINT "assistant_preferences_detail" CHECK ("detail_level" in ('concise','detailed')),
  CONSTRAINT "assistant_preferences_priority" CHECK ("priority" in ('balanced','reliability','economy')),
  CONSTRAINT "assistant_preferences_driving" CHECK ("driving_pattern" in ('unspecified','city','highway','mixed'))
);
