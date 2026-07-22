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
    'users'::text AS source_table,
    u.id::text AS source_id,
    jsonb_strip_nulls(jsonb_build_object(
      'google_access_token', to_jsonb(u) -> 'google_access_token',
      'google_refresh_token', to_jsonb(u) -> 'google_refresh_token',
      'google_token_expiry', to_jsonb(u) -> 'google_token_expiry',
      'google_sync_enabled', to_jsonb(u) -> 'google_sync_enabled',
      'last_google_sync', to_jsonb(u) -> 'last_google_sync',
      'profile_image_url', to_jsonb(u) -> 'profile_image_url'
    )) AS retired_fields
  FROM public.users u
)
INSERT INTO archive.retired_field_values (source_table, source_id, retired_fields)
SELECT source_table, source_id, retired_fields
FROM snapshots
WHERE retired_fields <> '{}'::jsonb
ON CONFLICT (source_table, source_id) DO UPDATE
SET retired_fields = EXCLUDED.retired_fields,
    archived_at = now();

WITH snapshots AS (
  SELECT
    'quotes'::text AS source_table,
    q.id::text AS source_id,
    jsonb_strip_nulls(jsonb_build_object(
      'opportunity_id', to_jsonb(q) -> 'opportunity_id'
    )) AS retired_fields
  FROM public.quotes q
)
INSERT INTO archive.retired_field_values (source_table, source_id, retired_fields)
SELECT source_table, source_id, retired_fields
FROM snapshots
WHERE retired_fields <> '{}'::jsonb
ON CONFLICT (source_table, source_id) DO UPDATE
SET retired_fields = EXCLUDED.retired_fields,
    archived_at = now();

WITH snapshots AS (
  SELECT
    'quote_cover_photos'::text AS source_table,
    p.id::text AS source_id,
    jsonb_strip_nulls(jsonb_build_object(
      'description', to_jsonb(p) -> 'description'
    )) AS retired_fields
  FROM public.quote_cover_photos p
)
INSERT INTO archive.retired_field_values (source_table, source_id, retired_fields)
SELECT source_table, source_id, retired_fields
FROM snapshots
WHERE retired_fields <> '{}'::jsonb
ON CONFLICT (source_table, source_id) DO UPDATE
SET retired_fields = EXCLUDED.retired_fields,
    archived_at = now();

WITH snapshots AS (
  SELECT
    'quote_product_renderings'::text AS source_table,
    p.id::text AS source_id,
    jsonb_strip_nulls(jsonb_build_object(
      'description', to_jsonb(p) -> 'description'
    )) AS retired_fields
  FROM public.quote_product_renderings p
)
INSERT INTO archive.retired_field_values (source_table, source_id, retired_fields)
SELECT source_table, source_id, retired_fields
FROM snapshots
WHERE retired_fields <> '{}'::jsonb
ON CONFLICT (source_table, source_id) DO UPDATE
SET retired_fields = EXCLUDED.retired_fields,
    archived_at = now();

DO $$
BEGIN
  IF to_regclass('public.issue_reports') IS NOT NULL
     AND to_regclass('archive.issue_reports') IS NULL THEN
    ALTER TABLE public.issue_reports SET SCHEMA archive;
  END IF;

  IF to_regclass('public.quickbooks_settings') IS NOT NULL
     AND to_regclass('archive.quickbooks_settings') IS NULL THEN
    ALTER TABLE public.quickbooks_settings SET SCHEMA archive;
  END IF;

  IF to_regclass('public.api_keys') IS NOT NULL
     AND to_regclass('archive.api_keys') IS NULL THEN
    ALTER TABLE public.api_keys SET SCHEMA archive;
  END IF;
END
$$;

ALTER TABLE IF EXISTS public.users
  DROP COLUMN IF EXISTS google_access_token,
  DROP COLUMN IF EXISTS google_refresh_token,
  DROP COLUMN IF EXISTS google_token_expiry,
  DROP COLUMN IF EXISTS google_sync_enabled,
  DROP COLUMN IF EXISTS last_google_sync,
  DROP COLUMN IF EXISTS profile_image_url;

ALTER TABLE IF EXISTS public.quotes
  DROP COLUMN IF EXISTS opportunity_id;

ALTER TABLE IF EXISTS public.quote_cover_photos
  DROP COLUMN IF EXISTS description;

ALTER TABLE IF EXISTS public.quote_product_renderings
  DROP COLUMN IF EXISTS description;

COMMIT;
