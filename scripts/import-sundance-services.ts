/**
 * Read-only plan: npx tsx scripts/import-sundance-services.ts
 * Apply the reviewed plan: npx tsx scripts/import-sundance-services.ts --apply
 * DATABASE_URL must be supplied explicitly by the operator. No env file is loaded.
 * Inserts only the three confirmed Sundance customer-price service rows.
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

import { runSundanceServiceCatalogImport } from "../server/sundanceServiceCatalogImport";

const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log("Usage: npx tsx scripts/import-sundance-services.ts [--apply]\nDefaults to a read-only dry run. Requires DATABASE_URL. Existing rows and prices are never overwritten.");
} else if (args.some((arg) => arg !== "--apply") || args.length > 1) {
  console.error("Only --apply is supported. Omit it for a read-only dry run.");
  process.exitCode = 1;
} else if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required. No database connection was made.");
  process.exitCode = 1;
} else {
  neonConfig.webSocketConstructor = ws;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const client = await pool.connect();
    try {
      const result = await runSundanceServiceCatalogImport(client, args.includes("--apply"));
      console.log(JSON.stringify(result, null, 2));
      if (result.plan.some((item) => item.action === "conflict")) process.exitCode = 1;
    } finally {
      client.release();
    }
  } catch (error) {
    // Driver errors can include connection details. Do not print their raw text.
    console.error("Sundance service import did not return a confirmed result. Run the read-only plan to reconcile before retrying.", { errorType: error instanceof Error ? error.name : "UnknownError" });
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
