CREATE TABLE IF NOT EXISTS "business_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "event_key" text UNIQUE,
  "event_type" text NOT NULL,
  "quote_id" integer REFERENCES "quotes"("id") ON DELETE set null,
  "account_id" integer REFERENCES "accounts"("id") ON DELETE set null,
  "inquiry_id" integer REFERENCES "lead_inquiries"("id") ON DELETE set null,
  "product_id" integer REFERENCES "products"("id") ON DELETE set null,
  "actor_user_id" integer REFERENCES "users"("id") ON DELETE set null,
  "occurred_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_business_events_type_time"
  ON "business_events" ("event_type", "occurred_at");
CREATE INDEX IF NOT EXISTS "idx_business_events_quote"
  ON "business_events" ("quote_id");
CREATE INDEX IF NOT EXISTS "idx_business_events_account"
  ON "business_events" ("account_id");
CREATE INDEX IF NOT EXISTS "idx_business_events_inquiry"
  ON "business_events" ("inquiry_id");
CREATE INDEX IF NOT EXISTS "idx_business_events_product"
  ON "business_events" ("product_id");
