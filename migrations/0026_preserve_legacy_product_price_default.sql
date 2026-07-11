-- The modern catalog uses retail_price and cost_price, but the original
-- default_unit_price column remains a required compatibility path. Give direct
-- and older writers a safe default while application writes keep it synced to
-- retail_price.
ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "default_unit_price" numeric(10, 2);

UPDATE "products"
SET "default_unit_price" = coalesce("retail_price", 0)
WHERE "default_unit_price" IS NULL;

ALTER TABLE "products" ALTER COLUMN "default_unit_price" SET DEFAULT 0;
ALTER TABLE "products" ALTER COLUMN "default_unit_price" SET NOT NULL;
