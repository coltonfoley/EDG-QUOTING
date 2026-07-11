import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

if (process.env.NODE_ENV !== "test") {
  throw new Error("The PGlite database adapter is test-only.");
}

if (process.env.RAINMAKER_TEST_DATABASE_DRIVER !== "node-postgres") {
  throw new Error("RAINMAKER_TEST_DATABASE_DRIVER=node-postgres is required for the PGlite adapter.");
}

if (!process.env.TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL is required for the PGlite adapter.");
}

export const pool = new Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  max: 4,
  ssl: false,
});

export const db = drizzle(pool, { schema });

// The isolated test harness restores every checked-in migration before Vitest
// starts. Runtime schema repair is intentionally bypassed here so tests exercise
// the restored schema without importing or changing the production DB module.
export async function ensureSignatureAuditColumns(): Promise<void> {}
export async function ensureProductCatalogColumns(): Promise<void> {}
export async function ensurePricingDefaultsTable(): Promise<void> {}
export async function ensurePlanningAgreementTables(): Promise<void> {}
export async function ensureLeadAttachmentTable(): Promise<void> {}
export async function ensureLeadIntakeSubmissionTable(): Promise<void> {}
export async function ensureQuoteApprovalDrawingTables(): Promise<void> {}
