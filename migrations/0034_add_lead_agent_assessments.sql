BEGIN;

CREATE TABLE IF NOT EXISTS "lead_agent_assessments" (
  "id" serial PRIMARY KEY NOT NULL,
  "inquiry_id" integer NOT NULL REFERENCES "lead_inquiries"("id") ON DELETE cascade,
  "outcome" text NOT NULL,
  "reason" text NOT NULL,
  "gmail_draft_id" text,
  "gmail_message_id" text,
  "gmail_draft_url" text,
  "idempotency_key_hash" text NOT NULL UNIQUE,
  "source" text NOT NULL DEFAULT 'jacob-codex',
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "lead_agent_assessments_outcome_check"
    CHECK ("outcome" IN ('fit', 'not_fit')),
  CONSTRAINT "lead_agent_assessments_gmail_check"
    CHECK (
      (
        "outcome" = 'fit'
        AND "gmail_message_id" IS NOT NULL
      )
      OR (
        "outcome" = 'not_fit'
        AND "gmail_draft_id" IS NULL
        AND "gmail_message_id" IS NULL
        AND "gmail_draft_url" IS NULL
      )
    )
);

CREATE INDEX IF NOT EXISTS "idx_lead_agent_assessments_inquiry_time"
  ON "lead_agent_assessments" ("inquiry_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_lead_agent_assessments_outcome"
  ON "lead_agent_assessments" ("outcome");
CREATE UNIQUE INDEX IF NOT EXISTS "lead_agent_assessments_gmail_draft_id_key"
  ON "lead_agent_assessments" ("gmail_draft_id");
CREATE UNIQUE INDEX IF NOT EXISTS "lead_agent_assessments_gmail_message_id_key"
  ON "lead_agent_assessments" ("gmail_message_id");

COMMIT;
