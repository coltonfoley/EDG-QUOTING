ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "google_access_token" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "google_refresh_token" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "google_token_expiry" timestamp;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "google_sync_enabled" boolean DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_google_sync" timestamp;

ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "street_address" text;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "address_line_2" text;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "city" text;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "state" text;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "zip_code" text;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "country" text;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "place_id" text;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "first_name" text;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "last_name" text;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "secondary_contacts" jsonb;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "qb_customer_id" text;

CREATE INDEX IF NOT EXISTS "idx_accounts_qb_customer_id" ON "accounts" ("qb_customer_id");

ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "jobsite_street_address" text;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "jobsite_address_line_2" text;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "jobsite_city" text;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "jobsite_state" text;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "jobsite_zip_code" text;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "jobsite_country" text;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "jobsite_place_id" text;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "tariff_rate" numeric(5, 2) DEFAULT '0';
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "is_shipping_taxable" boolean DEFAULT false;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "enable_e_signature" boolean DEFAULT false;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "signing_token" text;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "client_signature_data" jsonb;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "client_signed_at" timestamp;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "client_signed_ip" text;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "company_signature_data" jsonb;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "company_signed_at" timestamp;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "company_signed_ip" text;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "signature_email_sent_at" timestamp;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "signature_email_message" text;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "esig_include_pricing" boolean DEFAULT true;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "esig_include_images" boolean DEFAULT false;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "esig_include_contract" boolean DEFAULT true;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "qb_estimate_id" text;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "qb_sync_status" text;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "qb_synced_at" timestamp;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "qb_sync_error" text;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "parent_quote_id" integer;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "version_number" integer DEFAULT 1 NOT NULL;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "is_latest_version" boolean DEFAULT true NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "idx_quotes_signing_token_unique" ON "quotes" ("signing_token") WHERE "signing_token" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_quotes_qb_sync_status" ON "quotes" ("qb_sync_status");
CREATE INDEX IF NOT EXISTS "idx_quotes_parent_quote_id" ON "quotes" ("parent_quote_id");
CREATE INDEX IF NOT EXISTS "idx_quotes_is_latest_version" ON "quotes" ("is_latest_version");
CREATE INDEX IF NOT EXISTS "idx_quotes_parent_latest" ON "quotes" ("parent_quote_id", "is_latest_version");

ALTER TABLE "pricing_tables" ADD COLUMN IF NOT EXISTS "retail_price" numeric(10, 2) DEFAULT '0' NOT NULL;
ALTER TABLE "pricing_tables" ADD COLUMN IF NOT EXISTS "housing_code" text;

ALTER TABLE "line_items" ADD COLUMN IF NOT EXISTS "sku" text;
ALTER TABLE "line_items" ADD COLUMN IF NOT EXISTS "is_taxable" boolean DEFAULT true;
ALTER TABLE "line_items" ADD COLUMN IF NOT EXISTS "is_tariff_applicable" boolean DEFAULT false;
ALTER TABLE "line_items" ADD COLUMN IF NOT EXISTS "group_id" text;
ALTER TABLE "line_items" ADD COLUMN IF NOT EXISTS "position" integer DEFAULT 0 NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_line_items_group_id" ON "line_items" ("group_id");
CREATE INDEX IF NOT EXISTS "idx_line_items_group_position" ON "line_items" ("group_id", "position");
