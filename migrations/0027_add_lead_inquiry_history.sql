-- Preserve durable account identity while retaining every website inquiry.
CREATE TABLE IF NOT EXISTS "lead_inquiries" (
  "id" serial PRIMARY KEY,
  "account_id" integer NOT NULL REFERENCES "accounts"("id") ON DELETE cascade,
  "submission_id" text UNIQUE,
  "status" text DEFAULT 'new' NOT NULL,
  "source" text,
  "project_type" text,
  "message" text,
  "location" text,
  "customer_type" text,
  "metadata" jsonb,
  "received_at" timestamp DEFAULT now() NOT NULL,
  "last_contacted_at" timestamp,
  "converted_at" timestamp,
  "converted_quote_id" integer REFERENCES "quotes"("id") ON DELETE set null,
  "converted_by" integer REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_lead_inquiries_account_id" ON "lead_inquiries" ("account_id");
CREATE INDEX IF NOT EXISTS "idx_lead_inquiries_status" ON "lead_inquiries" ("status");
CREATE INDEX IF NOT EXISTS "idx_lead_inquiries_received_at" ON "lead_inquiries" ("received_at");
CREATE INDEX IF NOT EXISTS "idx_lead_inquiries_converted_quote_id" ON "lead_inquiries" ("converted_quote_id");

-- One compatibility inquiry preserves each existing account-level lead record.
INSERT INTO "lead_inquiries" (
  "account_id",
  "status",
  "source",
  "project_type",
  "message",
  "received_at",
  "last_contacted_at",
  "converted_at",
  "created_at",
  "updated_at"
)
SELECT
  "id",
  coalesce("lead_status", 'new'),
  "lead_source",
  "lead_project_type",
  "lead_message",
  coalesce("lead_received_at", "created_at", now()),
  "lead_last_contacted_at",
  "lead_converted_at",
  coalesce("lead_received_at", "created_at", now()),
  coalesce("updated_at", now())
FROM "accounts"
WHERE "lead_status" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "lead_inquiries" WHERE "lead_inquiries"."account_id" = "accounts"."id"
  );

ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "source_inquiry_id" integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'quotes_source_inquiry_id_lead_inquiries_id_fk'
      AND conrelid = 'public.quotes'::regclass
  ) THEN
    ALTER TABLE "quotes"
      ADD CONSTRAINT "quotes_source_inquiry_id_lead_inquiries_id_fk"
      FOREIGN KEY ("source_inquiry_id") REFERENCES "lead_inquiries"("id") ON DELETE set null;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_quotes_source_inquiry_id" ON "quotes" ("source_inquiry_id");
