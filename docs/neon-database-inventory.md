# Neon Database Inventory

Last checked: 2026-05-22

## Active Rainmaker Database

Use `rainmaker-production` for live Rainmaker data.

Evidence from Neon `main` branch:

| Database | Quotes | Max quote id | Latest quote created | Notes |
| --- | ---: | ---: | --- | --- |
| `rainmaker-production` | 302 | 609 | 2026-05-21 20:41:53 | Active live database. Contains quote `591` and quote `609`. |
| `rainmaker_production` | 216 | 507 | 2026-04-24 20:06:24 | Older duplicate-looking database. Does not contain quote `591` or `609`. |

## Other Databases In The Neon Project

| Database | Current interpretation |
| --- | --- |
| `rainmaker_cutover_20260425200501` | Historical Rainmaker cutover copy. Keep as archive until backups/rollback policy is confirmed. |
| `rainmaker_production` | Stale Rainmaker database with a confusing name. Candidate for archive/drop after backup confirmation. |
| `ops_staging` | Ops Portal staging database. Not Rainmaker. |
| `ops_production` | Ops Portal production database. Not Rainmaker. |
| `ops_prod_cutover_202604251913` | Historical Ops cutover copy. Keep as archive until Ops backup policy is confirmed. |
| `neondb` | Default Neon database. Not the Rainmaker source of truth. |
| `postgres` | Default system/admin database. Do not treat as app data. |

## Rainmaker App Tables

After the 2026-05-22 cleanup, Rainmaker code should retain these app tables:

`accounts`, `api_keys`, `colors`, `contract_templates`, `groups`, `issue_reports`, `line_items`, `pricing_defaults`, `pricing_tables`, `product_colors`, `products`, `quickbooks_settings`, `quote_cover_photos`, `quote_product_renderings`, `quotes`, `sessions`, `users`.

Two unused tables were intentionally retired from the app code on 2026-05-22. Neon may still contain them until the backup-and-drop checklist below is completed.

| Retired table | Why |
| --- | --- |
| `google_contacts_sync` | Google Contacts sync is not part of the current Rainmaker workflow. The live table had 0 rows at audit time. |
| `product_accessories` | Product accessory linking is not used by the current product/quote workflow. The live table had 0 rows at audit time. |

## Cleanup Rule

Before dropping databases or tables in Neon:

1. Confirm the Vercel production `DATABASE_URL` points to `rainmaker-production`.
2. Export or snapshot the database being removed.
3. Run a read-only count/recency check immediately before deletion.
4. Drop only the specific archive/unused object, never the whole Neon project.

Suggested table-drop SQL after backup confirmation:

```sql
DROP TABLE IF EXISTS public.google_contacts_sync;
DROP TABLE IF EXISTS public.product_accessories;
ALTER TABLE public.accounts DROP COLUMN IF EXISTS google_contact_id;
```
