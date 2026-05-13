ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "cost_price" numeric(10, 2);

UPDATE "products"
SET "cost_price" = CASE
  WHEN "default_discount_type" = 'percentage'
    THEN ROUND("retail_price" * (1 - LEAST(GREATEST("default_discount_value", 0), 100) / 100), 2)
  WHEN "default_discount_type" = 'dollar'
    THEN ROUND(GREATEST(0, "retail_price" - GREATEST("default_discount_value", 0)), 2)
  ELSE "retail_price"
END
WHERE "cost_price" IS NULL;

ALTER TABLE "products" ALTER COLUMN "cost_price" SET DEFAULT 0;
ALTER TABLE "products" ALTER COLUMN "cost_price" SET NOT NULL;
