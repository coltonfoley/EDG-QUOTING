import { existsSync, readFileSync } from "node:fs";
import { Pool } from "@neondatabase/serverless";
import dotenv from "dotenv";

for (const fileName of [
  ".env",
  ".env.local",
  ".env.production",
  ".env.production.local",
  ".env.codex-rainmaker-production.local",
]) {
  if (!existsSync(fileName)) continue;

  const parsed = dotenv.parse(readFileSync(fileName));
  for (const [key, value] of Object.entries(parsed)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required to inventory Rainmaker storage references.");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const includeSamples = process.env.STORAGE_INVENTORY_INCLUDE_SAMPLES === "true";

const storageQueries = [
  {
    label: "quote_cover_photos",
    sql: `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE is_active IS TRUE)::int AS active,
        COUNT(*) FILTER (WHERE storage_url LIKE '/objects/%')::int AS object_paths,
        COUNT(*) FILTER (WHERE storage_url LIKE 'http://%' OR storage_url LIKE 'https://%')::int AS absolute_urls,
        COUNT(*) FILTER (WHERE storage_url IS NULL OR storage_url = '')::int AS missing
      FROM quote_cover_photos;
    `,
  },
  {
    label: "quote_product_renderings",
    sql: `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE is_active IS TRUE)::int AS active,
        COUNT(*) FILTER (WHERE storage_url LIKE '/objects/%')::int AS object_paths,
        COUNT(*) FILTER (WHERE storage_url LIKE 'http://%' OR storage_url LIKE 'https://%')::int AS absolute_urls,
        COUNT(*) FILTER (WHERE storage_url IS NULL OR storage_url = '')::int AS missing
      FROM quote_product_renderings;
    `,
  },
  {
    label: "lead_attachments",
    sql: `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE is_active IS TRUE)::int AS active,
        COUNT(*) FILTER (WHERE storage_url LIKE '/objects/%')::int AS object_paths,
        COUNT(*) FILTER (WHERE storage_url LIKE 'http://%' OR storage_url LIKE 'https://%')::int AS absolute_urls,
        COUNT(*) FILTER (WHERE storage_url IS NULL OR storage_url = '')::int AS missing
      FROM lead_attachments;
    `,
  },
];

const sampleQueries = [
  {
    label: "quote_cover_photos",
    sql: `
      SELECT id, quote_id, filename, storage_url
      FROM quote_cover_photos
      WHERE is_active IS TRUE
      ORDER BY uploaded_at DESC NULLS LAST, id DESC
      LIMIT 10;
    `,
  },
  {
    label: "quote_product_renderings",
    sql: `
      SELECT id, quote_id, filename, storage_url
      FROM quote_product_renderings
      WHERE is_active IS TRUE
      ORDER BY uploaded_at DESC NULLS LAST, id DESC
      LIMIT 10;
    `,
  },
  {
    label: "lead_attachments",
    sql: `
      SELECT id, account_id, filename, storage_url
      FROM lead_attachments
      WHERE is_active IS TRUE
      ORDER BY uploaded_at DESC NULLS LAST, id DESC
      LIMIT 10;
    `,
  },
];

try {
  console.log("Rainmaker storage inventory");
  console.log("===========================");

  for (const query of storageQueries) {
    const { rows } = await pool.query(query.sql);
    const row = rows[0];

    console.log(`\n${query.label}`);
    console.log(`- total: ${row.total}`);
    console.log(`- active: ${row.active}`);
    console.log(`- /objects paths: ${row.object_paths}`);
    console.log(`- absolute urls: ${row.absolute_urls}`);
    console.log(`- missing urls: ${row.missing}`);
  }

  if (includeSamples) {
    console.log("\nRecent active samples");
    console.log("---------------------");

    for (const query of sampleQueries) {
      const { rows } = await pool.query(query.sql);
      console.log(`\n${query.label}`);

      if (!rows.length) {
        console.log("- none");
        continue;
      }

      for (const row of rows) {
        const owner = row.quote_id ? `quote ${row.quote_id}` : `account ${row.account_id}`;
        console.log(`- #${row.id} ${owner}: ${row.filename} -> ${row.storage_url}`);
      }
    }
  } else {
    console.log("\nRecent active samples skipped.");
    console.log("Set STORAGE_INVENTORY_INCLUDE_SAMPLES=true to include file-path samples.");
  }
} finally {
  await pool.end();
}
