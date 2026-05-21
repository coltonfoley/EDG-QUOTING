import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.on('error', (err) => {
  console.error('[db] Unexpected pool error (connection will be recycled):', err);
});

export const db = drizzle({ client: pool, schema });

let signatureAuditColumnsReady: Promise<void> | null = null;
let productCatalogColumnsReady: Promise<void> | null = null;
let pricingDefaultsTableReady: Promise<void> | null = null;

export async function ensureSignatureAuditColumns(): Promise<void> {
  if (!signatureAuditColumnsReady) {
    signatureAuditColumnsReady = pool.query(`
      ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "internal_notes" text;
      ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "signed_document_snapshot" jsonb;
      ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "signature_audit_trail" jsonb;
    `).then(() => undefined);
  }

  await signatureAuditColumnsReady;
}

export async function ensureProductCatalogColumns(): Promise<void> {
  if (!productCatalogColumnsReady) {
    productCatalogColumnsReady = pool.query(`
      ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "sku" text;
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

      CREATE INDEX IF NOT EXISTS "idx_products_sku"
        ON "products" ("sku");

      UPDATE "products"
      SET "sku" = derived."sku"
      FROM (
        SELECT
          "id",
          CASE
            WHEN regexp_replace(lower(coalesce("name", '')), '[^a-z0-9]', '', 'g') IN (
              'controlboxandpowersupply1permotor',
              'controlboxandpowersupply'
            ) THEN 'controlboxandpowersupply'
            WHEN regexp_replace(lower(coalesce("name", '')), '[^a-z0-9]', '', 'g') = 'motor1perbay' THEN 'motor1perbay'
            WHEN regexp_replace(lower(coalesce("name", '')), '[^a-z0-9]', '', 'g') IN (
              'timotionmotorcoverblack',
              'timotionmotorcoverinblack'
            ) THEN 'timotionmotorcoverblk'
            WHEN regexp_replace(lower(split_part(btrim(coalesce("name", '')), ' ', 1)), '[^a-z0-9]', '', 'g') ~ '[0-9]'
              OR split_part(btrim(coalesce("name", '')), ' ', 1) ~ '[_".-]'
              OR split_part(btrim(coalesce("name", '')), ' ', 1) = btrim(coalesce("name", ''))
            THEN regexp_replace(lower(split_part(btrim(coalesce("name", '')), ' ', 1)), '[^a-z0-9]', '', 'g')
            ELSE regexp_replace(lower(coalesce("name", '')), '[^a-z0-9]', '', 'g')
          END AS "sku"
        FROM "products"
        WHERE lower(coalesce("manufacturer", '')) = 'sundance'
      ) AS derived
      WHERE "products"."id" = derived."id"
        AND ("products"."sku" IS NULL OR btrim("products"."sku") = '')
        AND derived."sku" <> '';
    `).then(() => undefined).catch((error) => {
      productCatalogColumnsReady = null;
      throw error;
    });
  }

  await productCatalogColumnsReady;
}

export async function ensurePricingDefaultsTable(): Promise<void> {
  if (!pricingDefaultsTableReady) {
    pricingDefaultsTableReady = pool.query(`
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
    `).then(() => undefined).catch((error) => {
      pricingDefaultsTableReady = null;
      throw error;
    });
  }

  await pricingDefaultsTableReady;
}
