BEGIN;

ALTER TABLE "lead_inquiries"
  ADD COLUMN IF NOT EXISTS "draft_email_content" text;

ALTER TABLE "lead_agent_assessments"
  ADD COLUMN IF NOT EXISTS "draft_email_content" text;

COMMIT;
