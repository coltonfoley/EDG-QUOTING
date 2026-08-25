CREATE TABLE IF NOT EXISTS "dealer_portal_company_mappings" (
  "portal_company_id" text PRIMARY KEY NOT NULL,
  "account_id" integer NOT NULL REFERENCES "accounts"("id") ON DELETE RESTRICT,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "dealer_portal_company_mappings_account_key"
  ON "dealer_portal_company_mappings" ("account_id");

CREATE TABLE IF NOT EXISTS "dealer_portal_order_submissions" (
  "portal_order_id" text PRIMARY KEY NOT NULL,
  "portal_company_id" text NOT NULL REFERENCES "dealer_portal_company_mappings"("portal_company_id") ON DELETE RESTRICT,
  "request_hash" text NOT NULL,
  "snapshot_hash" text NOT NULL,
  "account_id" integer NOT NULL REFERENCES "accounts"("id") ON DELETE RESTRICT,
  "quote_id" integer REFERENCES "quotes"("id") ON DELETE RESTRICT,
  "payload" jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp
);

CREATE UNIQUE INDEX IF NOT EXISTS "dealer_portal_order_submissions_quote_key"
  ON "dealer_portal_order_submissions" ("quote_id");
CREATE INDEX IF NOT EXISTS "dealer_portal_order_submissions_company_created_idx"
  ON "dealer_portal_order_submissions" ("portal_company_id", "created_at");
