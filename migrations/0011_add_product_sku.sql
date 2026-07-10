ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "sku" text;

CREATE INDEX IF NOT EXISTS "idx_products_sku" ON "products" ("sku");

UPDATE "products"
SET "sku" = "name"
WHERE "manufacturer" = 'Sundance'
  AND ("sku" IS NULL OR btrim("sku") = '');

INSERT INTO "products" (
  "name",
  "sku",
  "description",
  "manufacturer",
  "category",
  "product_type",
  "default_unit_price",
  "retail_price",
  "default_discount_type",
  "default_discount_value",
  "unit"
)
SELECT
  'timotionmotorcoverblk',
  'timotionmotorcoverblk',
  'TiMOTION Motor Cover - Black',
  'Sundance',
  'Motors',
  'simple',
  '64.00',
  '64.00',
  'percentage',
  '0',
  'each'
WHERE NOT EXISTS (
  SELECT 1
  FROM "products"
  WHERE lower("name") = 'timotionmotorcoverblk'
     OR lower(coalesce("sku", '')) = 'timotionmotorcoverblk'
);
