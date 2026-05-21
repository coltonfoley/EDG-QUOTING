ALTER TABLE "quotes"
  ADD COLUMN IF NOT EXISTS "internal_notes" text;
