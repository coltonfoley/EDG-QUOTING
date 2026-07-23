import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "@shared/schema";

const migrationDirectory = resolve(process.cwd(), "migrations");
const migrationFilesOnDisk = readdirSync(migrationDirectory)
  .filter((file) => file.endsWith(".sql"))
  .sort((left, right) => left.localeCompare(right));
const migrationManifest = JSON.parse(
  readFileSync(resolve(migrationDirectory, "manifest.json"), "utf8")
) as { version: number; migrations: string[] };
const migrationFiles = migrationManifest.migrations;

const expectedSchema = new Map<string, Set<string>>();

for (const value of Object.values(schema)) {
  try {
    const table = getTableConfig(value as any);
    if (!table?.name) continue;
    expectedSchema.set(table.name, new Set(table.columns.map((column) => column.name)));
  } catch {
    // The schema module also exports validators and types that are not tables.
  }
}

describe("fresh database restore", () => {
  it("applies every checked-in migration to an empty PostgreSQL database", async () => {
    const database = new PGlite();

    try {
      expect([...migrationFiles].sort((left, right) => left.localeCompare(right))).toEqual(migrationFilesOnDisk);

      for (const file of migrationFiles) {
        const sql = readFileSync(resolve(migrationDirectory, file), "utf8");
        try {
          await database.exec(sql);
        } catch (error) {
          throw new Error(`Migration ${file} failed on an empty database`, { cause: error });
        }
      }

      const result = await database.query<{ table_name: string; column_name: string }>(`
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY table_name, ordinal_position
      `);

      const restoredSchema = new Map<string, Set<string>>();
      for (const row of result.rows) {
        const columns = restoredSchema.get(row.table_name) ?? new Set<string>();
        columns.add(row.column_name);
        restoredSchema.set(row.table_name, columns);
      }

      const missingTables = [...expectedSchema.keys()].filter((table) => !restoredSchema.has(table));
      const missingColumns = [...expectedSchema.entries()].flatMap(([table, columns]) =>
        [...columns]
          .filter((column) => !restoredSchema.get(table)?.has(column))
          .map((column) => `${table}.${column}`)
      );

      expect(missingTables).toEqual([]);
      expect(missingColumns).toEqual([]);

      const quoteAccountColumn = await database.query<{ is_nullable: string }>(`
        SELECT is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'quotes'
          AND column_name = 'account_id'
      `);
      expect(quoteAccountColumn.rows).toEqual([{ is_nullable: "YES" }]);

      const legacyProductPriceColumn = await database.query<{ column_default: string | null }>(`
        SELECT column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'products'
          AND column_name = 'default_unit_price'
      `);
      expect(legacyProductPriceColumn.rows[0]?.column_default).not.toBeNull();
    } finally {
      await database.close();
    }
  }, 60_000);

  it("restores the required legacy product defaults on a production-drifted schema", async () => {
    const database = new PGlite();

    try {
      await database.exec(`
        CREATE TABLE "products" (
          "id" serial PRIMARY KEY,
          "retail_price" numeric(10, 2) NOT NULL
        );
        INSERT INTO "products" ("retail_price") VALUES (125.50);
      `);

      await database.exec(
        readFileSync(resolve(migrationDirectory, "0026_preserve_legacy_product_price_default.sql"), "utf8")
      );

      const columns = await database.query<{
        column_name: string;
        column_default: string | null;
        is_nullable: string;
      }>(`
        SELECT column_name, column_default, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'products'
          AND column_name IN ('default_unit_price', 'default_markup_type', 'default_markup_value')
        ORDER BY column_name
      `);
      const product = await database.query<{
        default_unit_price: string;
        default_markup_type: string;
        default_markup_value: string;
      }>(`
        SELECT
          "default_unit_price"::text AS "default_unit_price",
          "default_markup_type",
          "default_markup_value"::text AS "default_markup_value"
        FROM "products"
      `);

      expect(columns.rows).toEqual([
        { column_name: "default_markup_type", column_default: "'percentage'::text", is_nullable: "NO" },
        { column_name: "default_markup_value", column_default: "25", is_nullable: "NO" },
        { column_name: "default_unit_price", column_default: "0", is_nullable: "NO" },
      ]);
      expect(product.rows).toEqual([{
        default_unit_price: "125.50",
        default_markup_type: "percentage",
        default_markup_value: "25.00",
      }]);
    } finally {
      await database.close();
    }
  }, 60_000);

  it("archives populated retired fields before removing them", async () => {
    const database = new PGlite();

    try {
      await database.exec(`
        CREATE TABLE accounts (id serial PRIMARY KEY, qb_customer_id text);
        CREATE TABLE quotes (
          id serial PRIMARY KEY,
          is_draft boolean,
          qb_estimate_id text,
          qb_sync_status text,
          qb_synced_at timestamp,
          qb_sync_error text
        );
        CREATE TABLE products (
          id serial PRIMARY KEY,
          default_markup_type text,
          default_markup_value numeric(10, 2)
        );
        CREATE TABLE pricing_tables (id serial PRIMARY KEY, housing_code text);
        CREATE INDEX idx_accounts_qb_customer_id ON accounts (qb_customer_id);
        CREATE INDEX idx_quotes_qb_sync_status ON quotes (qb_sync_status);

        INSERT INTO accounts (qb_customer_id) VALUES ('customer-1');
        INSERT INTO quotes (is_draft, qb_estimate_id, qb_sync_status)
          VALUES (false, 'estimate-1', 'synced');
        INSERT INTO products (default_markup_type, default_markup_value)
          VALUES ('percentage', 25);
        INSERT INTO pricing_tables (housing_code) VALUES ('H6EX');

        CREATE SCHEMA archive;
        CREATE TABLE archive.retired_field_values (
          source_table text NOT NULL,
          source_id text NOT NULL,
          retired_fields jsonb NOT NULL,
          archived_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (source_table, source_id)
        );
        INSERT INTO archive.retired_field_values (source_table, source_id, retired_fields)
          VALUES ('quotes', '1', '{"opportunity_id":"kept"}'::jsonb);
      `);

      await database.exec(
        readFileSync(resolve(migrationDirectory, "0032_archive_reviewed_legacy_fields.sql"), "utf8")
      );

      const archived = await database.query<{
        source_table: string;
        retired_fields: Record<string, unknown>;
      }>(`
        SELECT source_table, retired_fields
        FROM archive.retired_field_values
        ORDER BY source_table
      `);
      const remainingColumns = await database.query<{ column_name: string }>(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND (
            (table_name = 'accounts' AND column_name = 'qb_customer_id')
            OR (table_name = 'quotes' AND column_name IN (
              'is_draft', 'qb_estimate_id', 'qb_sync_status', 'qb_synced_at', 'qb_sync_error'
            ))
            OR (table_name = 'products' AND column_name IN (
              'default_markup_type', 'default_markup_value'
            ))
            OR (table_name = 'pricing_tables' AND column_name = 'housing_code')
          )
      `);

      expect(archived.rows).toEqual([
        { source_table: "accounts", retired_fields: { qb_customer_id: "customer-1" } },
        { source_table: "pricing_tables", retired_fields: { housing_code: "H6EX" } },
        {
          source_table: "products",
          retired_fields: { default_markup_type: "percentage", default_markup_value: 25 },
        },
        {
          source_table: "quotes",
          retired_fields: {
            is_draft: false,
            opportunity_id: "kept",
            qb_estimate_id: "estimate-1",
            qb_sync_status: "synced",
          },
        },
      ]);
      expect(remainingColumns.rows).toEqual([]);
    } finally {
      await database.close();
    }
  }, 60_000);

  it("purges retired QuickBooks storage without removing unrelated archived fields", async () => {
    const database = new PGlite();

    try {
      await database.exec(`
        CREATE TABLE accounts (id serial PRIMARY KEY, qb_customer_id text);
        CREATE TABLE quotes (
          id serial PRIMARY KEY,
          qb_estimate_id text,
          qb_sync_status text,
          qb_synced_at timestamp,
          qb_sync_error text
        );
        CREATE INDEX idx_accounts_qb_customer_id ON accounts (qb_customer_id);
        CREATE INDEX idx_quotes_qb_sync_status ON quotes (qb_sync_status);

        CREATE SCHEMA archive;
        CREATE TABLE archive.quickbooks_settings (
          id serial PRIMARY KEY,
          realm_id text NOT NULL
        );
        CREATE TABLE archive.retired_field_values (
          source_table text NOT NULL,
          source_id text NOT NULL,
          retired_fields jsonb NOT NULL,
          archived_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (source_table, source_id)
        );
        INSERT INTO archive.retired_field_values (source_table, source_id, retired_fields)
        VALUES
          ('accounts', '1', '{"qb_customer_id":"customer-1"}'::jsonb),
          ('quotes', '1', '{"opportunity_id":"kept","qb_estimate_id":"estimate-1","qb_sync_status":"synced"}'::jsonb);
      `);

      await database.exec(
        readFileSync(resolve(migrationDirectory, "0033_purge_quickbooks_remnants.sql"), "utf8")
      );

      const quickBooksTables = await database.query<{ table_schema: string; table_name: string }>(`
        SELECT table_schema, table_name
        FROM information_schema.tables
        WHERE table_name = 'quickbooks_settings'
      `);
      const quickBooksColumns = await database.query<{ table_name: string; column_name: string }>(`
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND (
            (table_name = 'accounts' AND column_name = 'qb_customer_id')
            OR (table_name = 'quotes' AND column_name IN (
              'qb_estimate_id', 'qb_sync_status', 'qb_synced_at', 'qb_sync_error'
            ))
          )
      `);
      const archived = await database.query<{
        source_table: string;
        retired_fields: Record<string, unknown>;
      }>(`
        SELECT source_table, retired_fields
        FROM archive.retired_field_values
        ORDER BY source_table
      `);

      expect(quickBooksTables.rows).toEqual([]);
      expect(quickBooksColumns.rows).toEqual([]);
      expect(archived.rows).toEqual([
        { source_table: "quotes", retired_fields: { opportunity_id: "kept" } },
      ]);
    } finally {
      await database.close();
    }
  }, 60_000);
});
