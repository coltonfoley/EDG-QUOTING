ALTER TABLE "quotes"
  ADD COLUMN IF NOT EXISTS "esig_include_approval_drawing" boolean DEFAULT false;
