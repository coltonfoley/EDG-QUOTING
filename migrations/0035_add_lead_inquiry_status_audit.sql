BEGIN;

ALTER TABLE "lead_inquiries"
  ADD COLUMN IF NOT EXISTS "archive_reason" text;

CREATE TABLE IF NOT EXISTS "lead_inquiry_status_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "inquiry_id" integer NOT NULL REFERENCES "lead_inquiries"("id") ON DELETE cascade,
  "from_status" text,
  "to_status" text NOT NULL,
  "reason" text,
  "actor_user_id" integer REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_lead_inquiry_status_events_inquiry_time"
  ON "lead_inquiry_status_events" ("inquiry_id", "created_at");

COMMIT;
