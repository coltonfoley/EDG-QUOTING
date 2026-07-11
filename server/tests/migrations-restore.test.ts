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
});
