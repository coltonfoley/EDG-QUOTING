import "dotenv/config";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { Pool } from "@neondatabase/serverless";

const root = process.cwd();
const schemaSource = readFileSync(path.join(root, "shared/schema.ts"), "utf8");
const declaredTables = Array.from(
  schemaSource.matchAll(/pgTable\(\s*["']([^"']+)["']/g),
  (match) => match[1],
).sort();

const migrationFiles = readdirSync(path.join(root, "migrations"))
  .filter((name) => name.endsWith(".sql"))
  .sort();
const journal = JSON.parse(
  readFileSync(path.join(root, "migrations/meta/_journal.json"), "utf8"),
);
const journalTags = new Set(journal.entries.map((entry) => entry.tag));
const unjournaledMigrations = migrationFiles.filter(
  (name) => !journalTags.has(name.replace(/\.sql$/, "")),
);

const migrationPrefixes = new Map();
for (const name of migrationFiles) {
  const prefix = name.split("_")[0];
  const existing = migrationPrefixes.get(prefix) || [];
  existing.push(name);
  migrationPrefixes.set(prefix, existing);
}
const duplicatePrefixes = Array.from(migrationPrefixes.entries())
  .filter(([, names]) => names.length > 1)
  .map(([prefix, names]) => ({ prefix, files: names }));

const report = {
  mode: process.env.DATABASE_URL ? "database-read-only" : "repository-only",
  repository: {
    declaredTableCount: declaredTables.length,
    declaredTables,
    migrationFileCount: migrationFiles.length,
    journalEntryCount: journal.entries.length,
    unjournaledMigrations,
    duplicateMigrationPrefixes: duplicatePrefixes,
  },
  database: null,
};

if (process.env.DATABASE_URL) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query("BEGIN READ ONLY");

    const tables = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    const liveTables = tables.rows.map((row) => row.table_name);

    const columns = await pool.query(`
      SELECT table_name, column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `);

    const indexes = await pool.query(`
      SELECT tablename AS table_name, indexname AS index_name, indexdef AS definition
      FROM pg_indexes
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname
    `);

    const storageReferences = await pool.query(`
      SELECT 'quote_cover_photos' AS table_name,
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE is_active IS TRUE)::int AS active,
             COUNT(*) FILTER (WHERE storage_url LIKE '/objects/%')::int AS legacy_object_paths,
             COUNT(*) FILTER (WHERE storage_url LIKE 'http://%' OR storage_url LIKE 'https://%')::int AS absolute_urls
      FROM quote_cover_photos
      UNION ALL
      SELECT 'quote_product_renderings',
             COUNT(*)::int,
             COUNT(*) FILTER (WHERE is_active IS TRUE)::int,
             COUNT(*) FILTER (WHERE storage_url LIKE '/objects/%')::int,
             COUNT(*) FILTER (WHERE storage_url LIKE 'http://%' OR storage_url LIKE 'https://%')::int
      FROM quote_product_renderings
    `);

    report.database = {
      tableCount: liveTables.length,
      tables: liveTables,
      missingDeclaredTables: declaredTables.filter((table) => !liveTables.includes(table)),
      databaseOnlyTables: liveTables.filter((table) => !declaredTables.includes(table)),
      columns: columns.rows,
      indexes: indexes.rows,
      storageReferences: storageReferences.rows,
    };

    await pool.query("ROLLBACK");
  } finally {
    await pool.end();
  }
}

console.log(JSON.stringify(report, null, 2));

if (unjournaledMigrations.length || duplicatePrefixes.length) {
  process.exitCode = 2;
}
