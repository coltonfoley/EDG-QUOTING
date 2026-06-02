ALTER TABLE "planning_agreements" ADD COLUMN IF NOT EXISTS "signing_token" text;
ALTER TABLE "planning_agreements" ADD COLUMN IF NOT EXISTS "agreement_document_snapshot" jsonb;
ALTER TABLE "planning_agreements" ADD COLUMN IF NOT EXISTS "signed_document_snapshot" jsonb;
ALTER TABLE "planning_agreements" ADD COLUMN IF NOT EXISTS "customer_signature_data" jsonb;
ALTER TABLE "planning_agreements" ADD COLUMN IF NOT EXISTS "customer_signed_at" timestamp;
ALTER TABLE "planning_agreements" ADD COLUMN IF NOT EXISTS "customer_signed_ip" text;
ALTER TABLE "planning_agreements" ADD COLUMN IF NOT EXISTS "signature_audit_trail" jsonb;
ALTER TABLE "planning_agreements" ADD COLUMN IF NOT EXISTS "signature_email_sent_at" timestamp;
ALTER TABLE "planning_agreements" ADD COLUMN IF NOT EXISTS "signature_email_message" text;

CREATE UNIQUE INDEX IF NOT EXISTS "planning_agreements_signing_token_unique"
  ON "planning_agreements" ("signing_token")
  WHERE "signing_token" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_planning_agreements_signing_token"
  ON "planning_agreements" ("signing_token");
