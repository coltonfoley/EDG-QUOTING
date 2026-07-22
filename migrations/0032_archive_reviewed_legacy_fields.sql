BEGIN;

CREATE SCHEMA IF NOT EXISTS archive;

CREATE TABLE IF NOT EXISTS archive.retired_field_values (
  source_table text NOT NULL,
  source_id text NOT NULL,
  retired_fields jsonb NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_table, source_id)
);

COMMENT ON TABLE archive.retired_field_values IS
  'Reversible snapshots of populated fields removed from active Rainmaker tables.';

WITH snapshots AS (
  SELECT
    'accounts'::text AS source_table,
    a.id::text AS source_id,
    jsonb_strip_nulls(jsonb_build_object(
      'qb_customer_id', to_jsonb(a) -> 'qb_customer_id'
    )) AS retired_fields
  FROM public.accounts a
)
INSERT INTO archive.retired_field_values (source_table, source_id, retired_fields)
SELECT source_table, source_id, retired_fields
FROM snapshots
WHERE retired_fields <> '{}'::jsonb
ON CONFLICT (source_table, source_id) DO UPDATE
SET retired_fields = archive.retired_field_values.retired_fields || EXCLUDED.retired_fields,
    archived_at = now();

WITH snapshots AS (
  SELECT
    'quotes'::text AS source_table,
    q.id::text AS source_id,
    jsonb_strip_nulls(jsonb_build_object(
      'is_draft', to_jsonb(q) -> 'is_draft',
      'qb_estimate_id', to_jsonb(q) -> 'qb_estimate_id',
      'qb_sync_status', to_jsonb(q) -> 'qb_sync_status',
      'qb_synced_at', to_jsonb(q) -> 'qb_synced_at',
      'qb_sync_error', to_jsonb(q) -> 'qb_sync_error'
    )) AS retired_fields
  FROM public.quotes q
)
INSERT INTO archive.retired_field_values (source_table, source_id, retired_fields)
SELECT source_table, source_id, retired_fields
FROM snapshots
WHERE retired_fields <> '{}'::jsonb
ON CONFLICT (source_table, source_id) DO UPDATE
SET retired_fields = archive.retired_field_values.retired_fields || EXCLUDED.retired_fields,
    archived_at = now();

WITH snapshots AS (
  SELECT
    'products'::text AS source_table,
    p.id::text AS source_id,
    jsonb_strip_nulls(jsonb_build_object(
      'default_markup_type', to_jsonb(p) -> 'default_markup_type',
      'default_markup_value', to_jsonb(p) -> 'default_markup_value'
    )) AS retired_fields
  FROM public.products p
)
INSERT INTO archive.retired_field_values (source_table, source_id, retired_fields)
SELECT source_table, source_id, retired_fields
FROM snapshots
WHERE retired_fields <> '{}'::jsonb
ON CONFLICT (source_table, source_id) DO UPDATE
SET retired_fields = archive.retired_field_values.retired_fields || EXCLUDED.retired_fields,
    archived_at = now();

WITH snapshots AS (
  SELECT
    'pricing_tables'::text AS source_table,
    p.id::text AS source_id,
    jsonb_strip_nulls(jsonb_build_object(
      'housing_code', to_jsonb(p) -> 'housing_code'
    )) AS retired_fields
  FROM public.pricing_tables p
)
INSERT INTO archive.retired_field_values (source_table, source_id, retired_fields)
SELECT source_table, source_id, retired_fields
FROM snapshots
WHERE retired_fields <> '{}'::jsonb
ON CONFLICT (source_table, source_id) DO UPDATE
SET retired_fields = archive.retired_field_values.retired_fields || EXCLUDED.retired_fields,
    archived_at = now();

DROP INDEX IF EXISTS public.idx_accounts_qb_customer_id;
DROP INDEX IF EXISTS public.idx_quotes_qb_sync_status;

ALTER TABLE IF EXISTS public.accounts
  DROP COLUMN IF EXISTS qb_customer_id;

ALTER TABLE IF EXISTS public.quotes
  DROP COLUMN IF EXISTS is_draft,
  DROP COLUMN IF EXISTS qb_estimate_id,
  DROP COLUMN IF EXISTS qb_sync_status,
  DROP COLUMN IF EXISTS qb_synced_at,
  DROP COLUMN IF EXISTS qb_sync_error;

ALTER TABLE IF EXISTS public.products
  DROP COLUMN IF EXISTS default_markup_type,
  DROP COLUMN IF EXISTS default_markup_value;

ALTER TABLE IF EXISTS public.pricing_tables
  DROP COLUMN IF EXISTS housing_code;

COMMIT;
