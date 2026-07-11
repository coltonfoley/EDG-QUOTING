import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { getTableConfig } from "drizzle-orm/pg-core";
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.on("error", (error) => {
  console.error("[db] Unexpected pool error; connection will be recycled", {
    errorType: error instanceof Error ? error.name : "UnknownError",
  });
});

export const db = drizzle({ client: pool, schema });

export class DatabaseReadinessError extends Error {
  constructor(
    public readonly missingTables: string[],
    public readonly missingColumns: string[],
  ) {
    super("Database schema is not ready for this application version");
    this.name = "DatabaseReadinessError";
  }
}

function expectedApplicationSchema() {
  const expected = new Map<string, Set<string>>();

  for (const value of Object.values(schema)) {
    try {
      const table = getTableConfig(value as never);
      if (!table?.name) continue;
      expected.set(table.name, new Set(table.columns.map((column) => column.name)));
    } catch {
      // The schema module also exports validators, relations, and TypeScript helpers.
    }
  }

  return expected;
}

/**
 * Read-only deployment readiness check. Schema changes belong exclusively in
 * reviewed migrations; ordinary requests must never create or alter tables.
 */
export async function checkDatabaseReadiness(): Promise<{
  tableCount: number;
  columnCount: number;
}> {
  const expected = expectedApplicationSchema();
  const result = await pool.query<{
    table_name: string;
    column_name: string;
  }>(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `);

  const actual = new Map<string, Set<string>>();
  for (const row of result.rows) {
    const columns = actual.get(row.table_name) ?? new Set<string>();
    columns.add(row.column_name);
    actual.set(row.table_name, columns);
  }

  const missingTables = [...expected.keys()].filter((table) => !actual.has(table));
  const missingColumns = [...expected.entries()].flatMap(([table, columns]) =>
    [...columns]
      .filter((column) => !actual.get(table)?.has(column))
      .map((column) => `${table}.${column}`),
  );

  if (missingTables.length > 0 || missingColumns.length > 0) {
    throw new DatabaseReadinessError(missingTables, missingColumns);
  }

  return {
    tableCount: expected.size,
    columnCount: [...expected.values()].reduce((total, columns) => total + columns.size, 0),
  };
}

let schemaReadyPromise: Promise<void> | null = null;

export async function assertDatabaseSchemaReady(): Promise<void> {
  schemaReadyPromise ??= checkDatabaseReadiness()
    .then(() => undefined)
    .catch((error) => {
      schemaReadyPromise = null;
      throw error;
    });

  await schemaReadyPromise;
}

// Temporary compatibility aliases for storage call sites. These functions are
// read-only assertions now; all former DDL is represented by migrations.
export const ensureSignatureAuditColumns = assertDatabaseSchemaReady;
export const ensureProductCatalogColumns = assertDatabaseSchemaReady;
export const ensurePricingDefaultsTable = assertDatabaseSchemaReady;
export const ensurePlanningAgreementTables = assertDatabaseSchemaReady;
export const ensureLeadAttachmentTable = assertDatabaseSchemaReady;
export const ensureLeadIntakeSubmissionTable = assertDatabaseSchemaReady;
export const ensureQuoteApprovalDrawingTables = assertDatabaseSchemaReady;
