-- 0019_add_lead_intake_submissions.sql
-- Persist website submission ids so a network retry cannot duplicate a lead.

CREATE TABLE IF NOT EXISTS lead_intake_submissions (
  id serial PRIMARY KEY,
  submission_id text NOT NULL,
  payload_hash text NOT NULL,
  account_id integer REFERENCES accounts(id) ON DELETE SET NULL,
  created_at timestamp DEFAULT now(),
  completed_at timestamp
);

CREATE UNIQUE INDEX IF NOT EXISTS lead_intake_submissions_submission_id_key
  ON lead_intake_submissions (submission_id);
CREATE INDEX IF NOT EXISTS idx_lead_intake_submissions_account_id
  ON lead_intake_submissions (account_id);
