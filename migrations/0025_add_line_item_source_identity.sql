ALTER TABLE "line_items"
  ADD COLUMN IF NOT EXISTS "manufacturer" text,
  ADD COLUMN IF NOT EXISTS "unit" text,
  ADD COLUMN IF NOT EXISTS "price_source" text,
  ADD COLUMN IF NOT EXISTS "source_metadata" jsonb;

CREATE INDEX IF NOT EXISTS "idx_line_items_price_source"
  ON "line_items" ("price_source");
