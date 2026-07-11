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
});
