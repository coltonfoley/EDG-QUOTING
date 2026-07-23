BEGIN;

DROP TABLE IF EXISTS public.quickbooks_settings;
DROP TABLE IF EXISTS archive.quickbooks_settings;

DROP INDEX IF EXISTS public.idx_accounts_qb_customer_id;
DROP INDEX IF EXISTS public.idx_quotes_qb_sync_status;

ALTER TABLE IF EXISTS public.accounts
  DROP COLUMN IF EXISTS qb_customer_id;

ALTER TABLE IF EXISTS public.quotes
  DROP COLUMN IF EXISTS qb_estimate_id,
  DROP COLUMN IF EXISTS qb_sync_status,
  DROP COLUMN IF EXISTS qb_synced_at,
  DROP COLUMN IF EXISTS qb_sync_error;

DO $$
BEGIN
  IF to_regclass('archive.retired_field_values') IS NOT NULL THEN
    UPDATE archive.retired_field_values
    SET retired_fields = retired_fields
      - 'qb_customer_id'
      - 'qb_estimate_id'
      - 'qb_sync_status'
      - 'qb_synced_at'
      - 'qb_sync_error'
    WHERE retired_fields ?| ARRAY[
      'qb_customer_id',
      'qb_estimate_id',
      'qb_sync_status',
      'qb_synced_at',
      'qb_sync_error'
    ];

    DELETE FROM archive.retired_field_values
    WHERE retired_fields = '{}'::jsonb;
  END IF;
END
$$;

COMMIT;
