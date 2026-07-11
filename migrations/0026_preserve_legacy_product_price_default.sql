-- The modern catalog uses retail_price and cost_price, but the original price
-- and markup defaults remain required compatibility paths. Give direct and
-- older writers safe defaults while application writes keep the price synced
-- to retail_price.
ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "default_unit_price" numeric(10, 2),
  ADD COLUMN IF NOT EXISTS "default_markup_type" text,
  ADD COLUMN IF NOT EXISTS "default_markup_value" numeric(10, 2);

UPDATE "products"
SET "default_unit_price" = coalesce("retail_price", 0)
WHERE "default_unit_price" IS NULL;

UPDATE "products"
SET "default_markup_type" = 'percentage'
WHERE "default_markup_type" IS NULL;

UPDATE "products"
SET "default_markup_value" = 25
WHERE "default_markup_value" IS NULL;

ALTER TABLE "products" ALTER COLUMN "default_unit_price" SET DEFAULT 0;
ALTER TABLE "products" ALTER COLUMN "default_unit_price" SET NOT NULL;
ALTER TABLE "products" ALTER COLUMN "default_markup_type" SET DEFAULT 'percentage';
ALTER TABLE "products" ALTER COLUMN "default_markup_type" SET NOT NULL;
ALTER TABLE "products" ALTER COLUMN "default_markup_value" SET DEFAULT 25;
ALTER TABLE "products" ALTER COLUMN "default_markup_value" SET NOT NULL;
