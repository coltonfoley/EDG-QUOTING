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
let pricingDefaultsTableReady: Promise<void> | null = null;

export async function ensureSignatureAuditColumns(): Promise<void> {
  if (!signatureAuditColumnsReady) {
    signatureAuditColumnsReady = pool.query(`
      ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "signed_document_snapshot" jsonb;
      ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "signature_audit_trail" jsonb;
    `).then(() => undefined);
  }

  await signatureAuditColumnsReady;
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
