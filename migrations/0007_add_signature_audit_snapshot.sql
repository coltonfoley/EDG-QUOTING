ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "signed_document_snapshot" jsonb;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "signature_audit_trail" jsonb;
