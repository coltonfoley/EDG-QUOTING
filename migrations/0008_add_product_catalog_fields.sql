ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "manufacturer" text;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "retail_price" numeric(10, 2) DEFAULT '0' NOT NULL;
