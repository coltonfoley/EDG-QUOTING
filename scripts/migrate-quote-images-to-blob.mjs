import "dotenv/config";
import { Pool } from "@neondatabase/serverless";
import { put } from "@vercel/blob";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const execute = process.env.MIGRATE_STORAGE_EXECUTE === "true";
const activeOnly = process.env.MIGRATE_STORAGE_ACTIVE_ONLY === "true";
const limit = Number(process.env.MIGRATE_STORAGE_LIMIT || "0");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

if (execute && !process.env.BLOB_READ_WRITE_TOKEN) {
  console.error("BLOB_READ_WRITE_TOKEN is required when MIGRATE_STORAGE_EXECUTE=true.");
  process.exit(1);
}

const tables = [
  {
    tableName: "quote_cover_photos",
    destinationPrefix: "rainmaker-migrated/quote-cover-photos",
  },
  {
    tableName: "quote_product_renderings",
    destinationPrefix: "rainmaker-migrated/quote-product-renderings",
  },
];

function sanitizeFilename(filename) {
  const fallback = `image-${Date.now()}.jpg`;
  return (filename || fallback)
    .replace(/[/\\]/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 140);
}

function extensionFromContentType(contentType) {
  if (!contentType) return "";
  if (contentType.includes("png")) return ".png";
  if (contentType.includes("webp")) return ".webp";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return ".jpg";
  return "";
}

function needsMigration(storageUrl) {
  return /^https?:\/\//i.test(storageUrl || "")
    && !storageUrl.includes("blob.vercel-storage.com");
}

async function getRows({ tableName }) {
  const where = [
    "storage_url IS NOT NULL",
    "storage_url <> ''",
    "(storage_url LIKE 'http://%' OR storage_url LIKE 'https://%')",
    "storage_url NOT LIKE '%blob.vercel-storage.com%'",
  ];

  if (activeOnly) {
    where.push("is_active IS TRUE");
  }

  const queryLimit = limit > 0 ? `LIMIT ${limit}` : "";
  const { rows } = await pool.query(`
    SELECT id, quote_id, filename, storage_url
    FROM ${tableName}
    WHERE ${where.join(" AND ")}
    ORDER BY id ASC
    ${queryLimit};
  `);

  return rows.filter((row) => needsMigration(row.storage_url));
}

async function migrateRow(config, row) {
  const response = await fetch(row.storage_url);
  if (!response.ok) {
    throw new Error(`download failed ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") || "application/octet-stream";
  const buffer = Buffer.from(await response.arrayBuffer());
  const originalName = sanitizeFilename(row.filename || new URL(row.storage_url).pathname.split("/").pop());
  const hasExtension = /\.[a-z0-9]{2,5}$/i.test(originalName);
  const filename = hasExtension ? originalName : `${originalName}${extensionFromContentType(contentType)}`;
  const pathname = `${config.destinationPrefix}/${row.id}-${filename}`;

  if (!execute) {
    return {
      dryRun: true,
      pathname,
      bytes: buffer.length,
      contentType,
    };
  }

  const blob = await put(pathname, buffer, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60 * 60 * 24 * 30,
    contentType,
  });

  await pool.query(
    `UPDATE ${config.tableName} SET storage_url = $1 WHERE id = $2`,
    [blob.url, row.id],
  );

  return {
    dryRun: false,
    pathname: blob.pathname,
    url: blob.url,
    bytes: buffer.length,
    contentType,
  };
}

try {
  console.log("Rainmaker quote image migration");
  console.log("===============================");
  console.log(`mode: ${execute ? "EXECUTE" : "DRY RUN"}`);
  console.log(`active only: ${activeOnly ? "yes" : "no"}`);
  if (limit > 0) console.log(`limit per table: ${limit}`);

  let total = 0;
  let migrated = 0;
  let failed = 0;

  for (const config of tables) {
    const rows = await getRows(config);
    total += rows.length;
    console.log(`\n${config.tableName}: ${rows.length} candidate rows`);

    for (const row of rows) {
      try {
        const result = await migrateRow(config, row);
        migrated++;
        console.log(`- #${row.id} quote ${row.quote_id}: ${result.pathname} (${result.bytes} bytes)`);
      } catch (error) {
        failed++;
        console.error(`- #${row.id} quote ${row.quote_id}: FAILED ${error.message}`);
      }
    }
  }

  console.log("\nSummary");
  console.log(`- candidates: ${total}`);
  console.log(`- ${execute ? "migrated" : "dry-run checked"}: ${migrated}`);
  console.log(`- failed: ${failed}`);

  if (!execute) {
    console.log("\nNo database rows were changed. Set MIGRATE_STORAGE_EXECUTE=true to upload and rewrite rows.");
  }

  if (failed > 0) {
    process.exitCode = 1;
  }
} finally {
  await pool.end();
}
