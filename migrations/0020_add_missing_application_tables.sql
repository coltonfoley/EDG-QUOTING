CREATE TABLE IF NOT EXISTS "quickbooks_settings" (
  "id" serial PRIMARY KEY NOT NULL,
  "realm_id" text NOT NULL UNIQUE,
  "access_token" text NOT NULL,
  "refresh_token" text NOT NULL,
  "token_expires_at" timestamp NOT NULL,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "colors" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "hex_code" text NOT NULL,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_colors_name" ON "colors" ("name");

CREATE TABLE IF NOT EXISTS "product_colors" (
  "id" serial PRIMARY KEY NOT NULL,
  "product_id" integer NOT NULL,
  "color_id" integer NOT NULL,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_product_colors_product_id" ON "product_colors" ("product_id");
CREATE INDEX IF NOT EXISTS "idx_product_colors_color_id" ON "product_colors" ("color_id");

CREATE TABLE IF NOT EXISTS "groups" (
  "id" text PRIMARY KEY NOT NULL,
  "quote_id" integer NOT NULL,
  "title" text NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "is_collapsed" boolean DEFAULT false,
  "config_data" jsonb,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_groups_quote_id" ON "groups" ("quote_id");
CREATE INDEX IF NOT EXISTS "idx_groups_position" ON "groups" ("quote_id", "position");

CREATE TABLE IF NOT EXISTS "issue_reports" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer,
  "user_email" text,
  "description" text NOT NULL,
  "user_action" text NOT NULL,
  "location" text NOT NULL,
  "user_agent" text,
  "browser_name" text,
  "browser_version" text,
  "screen_resolution" text,
  "health_metrics" jsonb,
  "status" text DEFAULT 'open' NOT NULL,
  "priority" text DEFAULT 'medium' NOT NULL,
  "assigned_to" integer,
  "resolved_at" timestamp,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_issue_reports_status" ON "issue_reports" ("status");
CREATE INDEX IF NOT EXISTS "idx_issue_reports_priority" ON "issue_reports" ("priority");
CREATE INDEX IF NOT EXISTS "idx_issue_reports_user_id" ON "issue_reports" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_issue_reports_created_at" ON "issue_reports" ("created_at");
