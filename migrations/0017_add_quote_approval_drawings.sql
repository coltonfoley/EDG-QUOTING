CREATE TABLE IF NOT EXISTS "quote_approval_drawings" (
  "id" serial PRIMARY KEY NOT NULL,
  "quote_id" integer NOT NULL REFERENCES "quotes"("id") ON DELETE cascade,
  "quote_family_root_id" integer REFERENCES "quotes"("id") ON DELETE set null,
  "drawing_type" text DEFAULT 'louvered_roof_order_approval' NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "manufacturer" text,
  "product_system" text,
  "title" text,
  "revision_label" text,
  "copied_from_drawing_id" integer REFERENCES "quote_approval_drawings"("id") ON DELETE set null,
  "drawing_data" jsonb NOT NULL,
  "public_snapshot" jsonb,
  "customer_notes" text,
  "internal_notes" text,
  "source_quote_or_order_id" text,
  "source_document_label" text,
  "source_document_url" text,
  "source_prepared_by" text,
  "source_prepared_at" timestamp,
  "ready_at" timestamp,
  "sent_for_signature_at" timestamp,
  "signed_locked_at" timestamp,
  "order_status" text DEFAULT 'not_reviewed' NOT NULL,
  "order_reviewed_by" integer REFERENCES "users"("id") ON DELETE set null,
  "order_reviewed_at" timestamp,
  "order_ready_by" integer REFERENCES "users"("id") ON DELETE set null,
  "order_ready_at" timestamp,
  "order_ready_override_reason" text,
  "superseded_by_id" integer REFERENCES "quote_approval_drawings"("id") ON DELETE set null,
  "created_by" integer REFERENCES "users"("id") ON DELETE set null,
  "updated_by" integer REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_quote_approval_drawings_quote_id"
  ON "quote_approval_drawings" ("quote_id");

CREATE INDEX IF NOT EXISTS "idx_quote_approval_drawings_family_root"
  ON "quote_approval_drawings" ("quote_family_root_id");

CREATE INDEX IF NOT EXISTS "idx_quote_approval_drawings_status"
  ON "quote_approval_drawings" ("status");

CREATE INDEX IF NOT EXISTS "idx_quote_approval_drawings_order_status"
  ON "quote_approval_drawings" ("order_status");

CREATE INDEX IF NOT EXISTS "idx_quote_approval_drawings_copied_from"
  ON "quote_approval_drawings" ("copied_from_drawing_id");
