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
    CREATE TABLE IF NOT EXISTS lead_attachments (
      id serial PRIMARY KEY,
      account_id integer NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      submission_id text,
      filename text NOT NULL,
      original_name text NOT NULL,
      storage_url text NOT NULL,
      file_size integer,
      mime_type text NOT NULL,
      source text NOT NULL DEFAULT 'website',
      display_order integer DEFAULT 0,
      is_active boolean DEFAULT true,
      uploaded_at timestamp DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_lead_attachments_account_id ON lead_attachments (account_id);
    CREATE INDEX IF NOT EXISTS idx_lead_attachments_submission_id ON lead_attachments (submission_id);
    CREATE INDEX IF NOT EXISTS idx_lead_attachments_active ON lead_attachments (is_active);
    CREATE INDEX IF NOT EXISTS idx_lead_attachments_order ON lead_attachments (account_id, display_order);
  `);

  console.log("[ok] lead attachment storage is ready.");
} catch (error) {
  console.error("Failed to ensure lead attachment storage.");
  console.error(error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
