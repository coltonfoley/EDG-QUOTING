CREATE TABLE IF NOT EXISTS "pricing_defaults" (
  "id" serial PRIMARY KEY NOT NULL,
  "scope" text NOT NULL,
  "markup_type" text DEFAULT 'percentage' NOT NULL,
  "markup_value" numeric(10, 2) DEFAULT '100' NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_pricing_defaults_scope"
  ON "pricing_defaults" ("scope");

INSERT INTO "pricing_defaults" ("scope", "markup_type", "markup_value")
VALUES ('sundance', 'percentage', '100')
ON CONFLICT ("scope") DO NOTHING;
