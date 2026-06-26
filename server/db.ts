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
let planningAgreementTablesReady: Promise<void> | null = null;
let leadAttachmentTableReady: Promise<void> | null = null;
let quoteApprovalDrawingTablesReady: Promise<void> | null = null;

export async function ensureSignatureAuditColumns(): Promise<void> {
  if (!signatureAuditColumnsReady) {
    signatureAuditColumnsReady = pool.query(`
      ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "internal_notes" text;
      ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "signed_document_snapshot" jsonb;
      ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "signature_audit_trail" jsonb;
      ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "esig_include_approval_drawing" boolean DEFAULT false;
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

export async function ensurePlanningAgreementTables(): Promise<void> {
  if (!planningAgreementTablesReady) {
    planningAgreementTablesReady = pool.query(`
      CREATE TABLE IF NOT EXISTS "planning_agreements" (
        "id" serial PRIMARY KEY NOT NULL,
        "account_id" integer,
        "quote_id" integer,
        "quote_family_root_id" integer,
        "status" text DEFAULT 'required' NOT NULL,
        "tier" text DEFAULT 'standard_design' NOT NULL,
        "amount" numeric(10, 2) DEFAULT '0' NOT NULL,
        "credit_eligible" boolean DEFAULT true NOT NULL,
        "credit_expires_at" timestamp,
        "scope_summary" text,
        "internal_notes" text,
        "signing_token" text,
        "agreement_document_snapshot" jsonb,
        "signed_document_snapshot" jsonb,
        "customer_signature_data" jsonb,
        "customer_signed_at" timestamp,
        "customer_signed_ip" text,
        "signature_audit_trail" jsonb,
        "signature_email_sent_at" timestamp,
        "signature_email_message" text,
        "agreement_sent_at" timestamp,
        "agreement_signed_at" timestamp,
        "payment_confirmed_at" timestamp,
        "payment_confirmed_by" integer,
        "payment_method" text,
        "payment_reference" text,
        "payment_notes" text,
        "waived_at" timestamp,
        "waived_by" integer,
        "waiver_reason" text,
        "delivered_at" timestamp,
        "delivered_by" integer,
        "credited_quote_id" integer,
        "credited_at" timestamp,
        "applied_credit_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
        "created_by" integer,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now()
      );

      ALTER TABLE "planning_agreements" ADD COLUMN IF NOT EXISTS "signing_token" text;
      ALTER TABLE "planning_agreements" ADD COLUMN IF NOT EXISTS "agreement_document_snapshot" jsonb;
      ALTER TABLE "planning_agreements" ADD COLUMN IF NOT EXISTS "signed_document_snapshot" jsonb;
      ALTER TABLE "planning_agreements" ADD COLUMN IF NOT EXISTS "customer_signature_data" jsonb;
      ALTER TABLE "planning_agreements" ADD COLUMN IF NOT EXISTS "customer_signed_at" timestamp;
      ALTER TABLE "planning_agreements" ADD COLUMN IF NOT EXISTS "customer_signed_ip" text;
      ALTER TABLE "planning_agreements" ADD COLUMN IF NOT EXISTS "signature_audit_trail" jsonb;
      ALTER TABLE "planning_agreements" ADD COLUMN IF NOT EXISTS "signature_email_sent_at" timestamp;
      ALTER TABLE "planning_agreements" ADD COLUMN IF NOT EXISTS "signature_email_message" text;

      CREATE TABLE IF NOT EXISTS "planning_agreement_events" (
        "id" serial PRIMARY KEY NOT NULL,
        "planning_agreement_id" integer NOT NULL REFERENCES "planning_agreements"("id") ON DELETE cascade,
        "event_type" text NOT NULL,
        "actor_user_id" integer,
        "from_status" text,
        "to_status" text,
        "payload" jsonb,
        "created_at" timestamp DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS "idx_planning_agreements_account_id" ON "planning_agreements" ("account_id");
      CREATE INDEX IF NOT EXISTS "idx_planning_agreements_quote_id" ON "planning_agreements" ("quote_id");
      CREATE INDEX IF NOT EXISTS "idx_planning_agreements_quote_family_root_id" ON "planning_agreements" ("quote_family_root_id");
      CREATE INDEX IF NOT EXISTS "idx_planning_agreements_status" ON "planning_agreements" ("status");
      CREATE UNIQUE INDEX IF NOT EXISTS "planning_agreements_signing_token_unique" ON "planning_agreements" ("signing_token") WHERE "signing_token" IS NOT NULL;
      CREATE INDEX IF NOT EXISTS "idx_planning_agreements_signing_token" ON "planning_agreements" ("signing_token");
      CREATE INDEX IF NOT EXISTS "idx_planning_agreements_payment_confirmed_at" ON "planning_agreements" ("payment_confirmed_at");
      CREATE INDEX IF NOT EXISTS "idx_planning_agreements_credit_expires_at" ON "planning_agreements" ("credit_expires_at");
      CREATE INDEX IF NOT EXISTS "idx_planning_agreement_events_agreement_id" ON "planning_agreement_events" ("planning_agreement_id");
      CREATE INDEX IF NOT EXISTS "idx_planning_agreement_events_created_at" ON "planning_agreement_events" ("created_at");
    `).then(() => undefined).catch((error) => {
      planningAgreementTablesReady = null;
      throw error;
    });
  }

  await planningAgreementTablesReady;
}

export async function ensureLeadAttachmentTable(): Promise<void> {
  if (!leadAttachmentTableReady) {
    leadAttachmentTableReady = pool.query(`
      CREATE TABLE IF NOT EXISTS "lead_attachments" (
        "id" serial PRIMARY KEY,
        "account_id" integer NOT NULL REFERENCES "accounts"("id") ON DELETE cascade,
        "submission_id" text,
        "filename" text NOT NULL,
        "original_name" text NOT NULL,
        "storage_url" text NOT NULL,
        "file_size" integer,
        "mime_type" text NOT NULL,
        "source" text NOT NULL DEFAULT 'website',
        "display_order" integer DEFAULT 0,
        "is_active" boolean DEFAULT true,
        "uploaded_at" timestamp DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS "idx_lead_attachments_account_id" ON "lead_attachments" ("account_id");
      CREATE INDEX IF NOT EXISTS "idx_lead_attachments_submission_id" ON "lead_attachments" ("submission_id");
      CREATE INDEX IF NOT EXISTS "idx_lead_attachments_active" ON "lead_attachments" ("is_active");
      CREATE INDEX IF NOT EXISTS "idx_lead_attachments_order" ON "lead_attachments" ("account_id", "display_order");
    `).then(() => undefined).catch((error) => {
      leadAttachmentTableReady = null;
      throw error;
    });
  }

  await leadAttachmentTableReady;
}

export async function ensureQuoteApprovalDrawingTables(): Promise<void> {
  if (!quoteApprovalDrawingTablesReady) {
    quoteApprovalDrawingTablesReady = pool.query(`
      CREATE TABLE IF NOT EXISTS "quote_approval_drawings" (
        "id" serial PRIMARY KEY NOT NULL,
        "quote_id" integer NOT NULL REFERENCES "quotes"("id") ON DELETE cascade,
        "quote_family_root_id" integer REFERENCES "quotes"("id") ON DELETE set null,
        "drawing_type" text DEFAULT 'louvered_roof_order_approval' NOT NULL,
        "status" text DEFAULT 'draft' NOT NULL,
        "manufacturer" text,
        "product_system" text,
        "title" text,
        "revision_label" text,
        "copied_from_drawing_id" integer REFERENCES "quote_approval_drawings"("id") ON DELETE set null,
        "drawing_data" jsonb NOT NULL,
        "public_snapshot" jsonb,
        "customer_notes" text,
        "internal_notes" text,
        "source_quote_or_order_id" text,
        "source_document_label" text,
        "source_document_url" text,
        "source_prepared_by" text,
        "source_prepared_at" timestamp,
        "ready_at" timestamp,
        "sent_for_signature_at" timestamp,
        "signed_locked_at" timestamp,
        "order_status" text DEFAULT 'not_reviewed' NOT NULL,
        "order_reviewed_by" integer REFERENCES "users"("id") ON DELETE set null,
        "order_reviewed_at" timestamp,
        "order_ready_by" integer REFERENCES "users"("id") ON DELETE set null,
        "order_ready_at" timestamp,
        "order_ready_override_reason" text,
        "superseded_by_id" integer REFERENCES "quote_approval_drawings"("id") ON DELETE set null,
        "created_by" integer REFERENCES "users"("id") ON DELETE set null,
        "updated_by" integer REFERENCES "users"("id") ON DELETE set null,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now()
      );

      ALTER TABLE "quote_approval_drawings" ADD COLUMN IF NOT EXISTS "quote_family_root_id" integer REFERENCES "quotes"("id") ON DELETE set null;
      ALTER TABLE "quote_approval_drawings" ADD COLUMN IF NOT EXISTS "drawing_type" text DEFAULT 'louvered_roof_order_approval';
      UPDATE "quote_approval_drawings" SET "drawing_type" = 'louvered_roof_order_approval' WHERE "drawing_type" IS NULL;
      ALTER TABLE "quote_approval_drawings" ALTER COLUMN "drawing_type" SET DEFAULT 'louvered_roof_order_approval';
      ALTER TABLE "quote_approval_drawings" ALTER COLUMN "drawing_type" SET NOT NULL;
      ALTER TABLE "quote_approval_drawings" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'draft';
      UPDATE "quote_approval_drawings" SET "status" = 'draft' WHERE "status" IS NULL;
      ALTER TABLE "quote_approval_drawings" ALTER COLUMN "status" SET DEFAULT 'draft';
      ALTER TABLE "quote_approval_drawings" ALTER COLUMN "status" SET NOT NULL;
      ALTER TABLE "quote_approval_drawings" ADD COLUMN IF NOT EXISTS "manufacturer" text;
      ALTER TABLE "quote_approval_drawings" ADD COLUMN IF NOT EXISTS "product_system" text;
      ALTER TABLE "quote_approval_drawings" ADD COLUMN IF NOT EXISTS "title" text;
      ALTER TABLE "quote_approval_drawings" ADD COLUMN IF NOT EXISTS "revision_label" text;
      ALTER TABLE "quote_approval_drawings" ADD COLUMN IF NOT EXISTS "copied_from_drawing_id" integer REFERENCES "quote_approval_drawings"("id") ON DELETE set null;
      ALTER TABLE "quote_approval_drawings" ADD COLUMN IF NOT EXISTS "drawing_data" jsonb;
      UPDATE "quote_approval_drawings" SET "drawing_data" = '{}'::jsonb WHERE "drawing_data" IS NULL;
      ALTER TABLE "quote_approval_drawings" ALTER COLUMN "drawing_data" SET NOT NULL;
      ALTER TABLE "quote_approval_drawings" ADD COLUMN IF NOT EXISTS "public_snapshot" jsonb;
      ALTER TABLE "quote_approval_drawings" ADD COLUMN IF NOT EXISTS "customer_notes" text;
      ALTER TABLE "quote_approval_drawings" ADD COLUMN IF NOT EXISTS "internal_notes" text;
      ALTER TABLE "quote_approval_drawings" ADD COLUMN IF NOT EXISTS "source_quote_or_order_id" text;
      ALTER TABLE "quote_approval_drawings" ADD COLUMN IF NOT EXISTS "source_document_label" text;
      ALTER TABLE "quote_approval_drawings" ADD COLUMN IF NOT EXISTS "source_document_url" text;
      ALTER TABLE "quote_approval_drawings" ADD COLUMN IF NOT EXISTS "source_prepared_by" text;
      ALTER TABLE "quote_approval_drawings" ADD COLUMN IF NOT EXISTS "source_prepared_at" timestamp;
      ALTER TABLE "quote_approval_drawings" ADD COLUMN IF NOT EXISTS "ready_at" timestamp;
      ALTER TABLE "quote_approval_drawings" ADD COLUMN IF NOT EXISTS "sent_for_signature_at" timestamp;
      ALTER TABLE "quote_approval_drawings" ADD COLUMN IF NOT EXISTS "signed_locked_at" timestamp;
      ALTER TABLE "quote_approval_drawings" ADD COLUMN IF NOT EXISTS "order_status" text DEFAULT 'not_reviewed' NOT NULL;
      ALTER TABLE "quote_approval_drawings" ADD COLUMN IF NOT EXISTS "order_reviewed_by" integer REFERENCES "users"("id") ON DELETE set null;
      ALTER TABLE "quote_approval_drawings" ADD COLUMN IF NOT EXISTS "order_reviewed_at" timestamp;
      ALTER TABLE "quote_approval_drawings" ADD COLUMN IF NOT EXISTS "order_ready_by" integer REFERENCES "users"("id") ON DELETE set null;
      ALTER TABLE "quote_approval_drawings" ADD COLUMN IF NOT EXISTS "order_ready_at" timestamp;
      ALTER TABLE "quote_approval_drawings" ADD COLUMN IF NOT EXISTS "order_ready_override_reason" text;
      ALTER TABLE "quote_approval_drawings" ADD COLUMN IF NOT EXISTS "superseded_by_id" integer REFERENCES "quote_approval_drawings"("id") ON DELETE set null;
      ALTER TABLE "quote_approval_drawings" ADD COLUMN IF NOT EXISTS "created_by" integer REFERENCES "users"("id") ON DELETE set null;
      ALTER TABLE "quote_approval_drawings" ADD COLUMN IF NOT EXISTS "updated_by" integer REFERENCES "users"("id") ON DELETE set null;

      CREATE INDEX IF NOT EXISTS "idx_quote_approval_drawings_quote_id" ON "quote_approval_drawings" ("quote_id");
      CREATE INDEX IF NOT EXISTS "idx_quote_approval_drawings_family_root" ON "quote_approval_drawings" ("quote_family_root_id");
      CREATE INDEX IF NOT EXISTS "idx_quote_approval_drawings_status" ON "quote_approval_drawings" ("status");
      CREATE INDEX IF NOT EXISTS "idx_quote_approval_drawings_order_status" ON "quote_approval_drawings" ("order_status");
      CREATE INDEX IF NOT EXISTS "idx_quote_approval_drawings_copied_from" ON "quote_approval_drawings" ("copied_from_drawing_id");
    `).then(() => undefined).catch((error) => {
      quoteApprovalDrawingTablesReady = null;
      throw error;
    });
  }

  await quoteApprovalDrawingTablesReady;
}
