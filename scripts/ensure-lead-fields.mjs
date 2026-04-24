import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  await pool.query(`
    ALTER TABLE accounts
      ADD COLUMN IF NOT EXISTS lead_status text,
      ADD COLUMN IF NOT EXISTS lead_source text,
      ADD COLUMN IF NOT EXISTS lead_project_type text,
      ADD COLUMN IF NOT EXISTS lead_message text,
      ADD COLUMN IF NOT EXISTS lead_received_at timestamp,
      ADD COLUMN IF NOT EXISTS lead_last_contacted_at timestamp,
      ADD COLUMN IF NOT EXISTS lead_converted_at timestamp;

    CREATE INDEX IF NOT EXISTS idx_accounts_lead_status ON accounts (lead_status);
    CREATE INDEX IF NOT EXISTS idx_accounts_lead_received_at ON accounts (lead_received_at);
  `);

  console.log("[ok] accounts lead intake fields are ready.");
} catch (error) {
  console.error("Failed to ensure lead intake fields.");
  console.error(error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
