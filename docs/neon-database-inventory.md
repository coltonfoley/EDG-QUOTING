# Neon Database Inventory

Last checked: 2026-05-22

## Active Rainmaker Database

Use `rainmaker-production` for live Rainmaker data.

Evidence from Neon `main` branch:

| Database | Quotes | Max quote id | Latest quote created | Notes |
| --- | ---: | ---: | --- | --- |
| `rainmaker-production` | 302 | 609 | 2026-05-21 20:41:53 | Active live database. Contains quote `591` and quote `609`. |

On 2026-05-22, the `main` branch was reduced from 8 non-template databases to 5 after creating a temporary recovery branch and aligning database names to live app reality.

## Other Databases In The Neon Project

| Database | Current interpretation |
| --- | --- |
| `ops_staging` | Ops Portal staging database. Not Rainmaker. |
| `ops_production` | Live Ops Portal production database. Not Rainmaker. |
| `neondb` | Default Neon database. Not the Rainmaker source of truth. |
| `postgres` | Default system/admin database. Do not treat as app data. |

## Removed Databases

A temporary recovery branch named `pre-rainmaker-db-cleanup-20260522` was created from `main` before database removal. Neon set it to auto-delete on 2026-05-23 at 9:19 AM CDT.

| Removed database | Why |
| --- | --- |
| `rainmaker_production` | Stale duplicate-looking Rainmaker database. It had 216 quotes, max quote id `507`, latest quote created 2026-04-24 20:06:24, and did not contain quote `591` or `609`. |
| `rainmaker_cutover_20260425200501` | Historical Rainmaker cutover copy. It was removed after the active Rainmaker database was confirmed as `rainmaker-production`. |
| `ops_prod_cutover_202604251913` | Former Ops Portal production database name. It was copied into `ops_production`, Vercel Production `DATABASE_URL` was updated, live Ops was verified, and the cutover-named database was removed. |

Post-cleanup Neon verification showed these remaining non-template databases on `main`: `neondb`, `ops_production`, `ops_staging`, `postgres`, and `rainmaker-production`.

## Rainmaker App Tables

After the 2026-05-22 cleanup, Rainmaker code should retain these app tables:

`accounts`, `api_keys`, `colors`, `contract_templates`, `groups`, `issue_reports`, `line_items`, `pricing_defaults`, `pricing_tables`, `product_colors`, `products`, `quickbooks_settings`, `quote_cover_photos`, `quote_product_renderings`, `quotes`, `sessions`, `users`.

Two unused tables were intentionally retired from the app code and removed from the live `rainmaker-production` database on 2026-05-22.

Before removal, Neon verification showed:

- `google_contacts_sync`: 0 rows.
- `product_accessories`: 0 rows.
- `accounts.google_contact_id`: 0 populated values.
- `accounts`: 136 rows.
- `quotes`: 302 rows, max quote id `609`.

After removal, Neon verification showed both retired tables absent, `accounts.google_contact_id` absent, and the `accounts`/`quotes` counts unchanged.

| Retired table | Why |
| --- | --- |
| `google_contacts_sync` | Google Contacts sync is not part of the current Rainmaker workflow. The live table had 0 rows before removal. |
| `product_accessories` | Product accessory linking is not used by the current product/quote workflow. The live table had 0 rows before removal. |

## Cleanup Rule

Before any future database or table removal in Neon:

1. Confirm the Vercel production `DATABASE_URL` points to `rainmaker-production`.
2. Export or snapshot the database being removed.
3. Run a read-only count/recency check immediately before deletion.
4. Drop only the specific archive/unused object, never the whole Neon project.

The 2026-05-22 retired-table cleanup used this targeted SQL after the proof gate above:

```sql
DROP TABLE IF EXISTS public.google_contacts_sync;
DROP TABLE IF EXISTS public.product_accessories;
ALTER TABLE public.accounts DROP COLUMN IF EXISTS google_contact_id;
```
