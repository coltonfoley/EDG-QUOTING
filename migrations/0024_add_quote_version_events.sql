CREATE TABLE IF NOT EXISTS "quote_version_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "quote_family_root_id" integer NOT NULL REFERENCES "quotes"("id") ON DELETE cascade,
  "quote_id" integer REFERENCES "quotes"("id") ON DELETE set null,
  "event_type" text NOT NULL,
  "actor_user_id" integer REFERENCES "users"("id") ON DELETE set null,
  "from_quote_id" integer REFERENCES "quotes"("id") ON DELETE set null,
  "to_quote_id" integer REFERENCES "quotes"("id") ON DELETE set null,
  "payload" jsonb,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_quote_version_events_family"
  ON "quote_version_events" ("quote_family_root_id");
CREATE INDEX IF NOT EXISTS "idx_quote_version_events_quote"
  ON "quote_version_events" ("quote_id");
CREATE INDEX IF NOT EXISTS "idx_quote_version_events_created"
  ON "quote_version_events" ("created_at");
