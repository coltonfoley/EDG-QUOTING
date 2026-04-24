-- 0006_add_account_lead_fields.sql
-- Track website leads on accounts without forcing every inquiry into the quote pipeline.

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
