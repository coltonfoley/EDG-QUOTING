-- Record the business event separately from generic record edits. Historical
-- rows remain null so an old won quote is never guessed into the current month.
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "deal_stage_changed_at" timestamp;

CREATE INDEX IF NOT EXISTS "idx_quotes_deal_stage_changed_at"
  ON "quotes" ("deal_stage", "deal_stage_changed_at");
