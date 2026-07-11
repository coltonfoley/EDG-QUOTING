CREATE TABLE IF NOT EXISTS "email_delivery_attempts" (
  "id" serial PRIMARY KEY NOT NULL,
  "idempotency_key" text NOT NULL UNIQUE,
  "message_type" text NOT NULL,
  "quote_id" integer REFERENCES "quotes"("id") ON DELETE set null,
  "planning_agreement_id" integer REFERENCES "planning_agreements"("id") ON DELETE set null,
  "status" text DEFAULT 'pending' NOT NULL,
  "attempt_count" integer DEFAULT 1 NOT NULL,
  "provider_message_id" text,
  "last_error_type" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  "sent_at" timestamp
);

CREATE INDEX IF NOT EXISTS "idx_email_delivery_attempts_quote"
  ON "email_delivery_attempts" ("quote_id");
CREATE INDEX IF NOT EXISTS "idx_email_delivery_attempts_planning"
  ON "email_delivery_attempts" ("planning_agreement_id");
CREATE INDEX IF NOT EXISTS "idx_email_delivery_attempts_status"
  ON "email_delivery_attempts" ("status");
CREATE INDEX IF NOT EXISTS "idx_email_delivery_attempts_created"
  ON "email_delivery_attempts" ("created_at");
