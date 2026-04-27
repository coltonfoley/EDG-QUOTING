# Rainmaker Replit Exit Status

Last updated: 2026-04-27

## Current Production Path

- Active Replit fallback: `https://edgquote.replit.app`
- New Rainmaker production: `https://rainmaker.edgpatioshade.com`
- Vercel project: `edgpatioshade/rainmaker`
- Current Vercel production deployment: `rainmaker-pf21sw5tl-edgpatioshade.vercel.app`
- Neon production database now used by Vercel Rainmaker: `rainmaker-production`
- Storage provider now used by migrated quote images: Vercel Blob

No Replit app, Replit database, or Replit storage was deleted or disabled.

## What Was Migrated

The active Replit Rainmaker database was copied into the new Neon `rainmaker-production` database. The migration used table-level CSV export/import because the local `pg_dump` client was PostgreSQL 14 and Replit's Neon database was PostgreSQL 16, which blocked custom-format `pg_dump`.

Replit-auth `users.id` values are text/UUID-style IDs, while the Vercel/GitHub Rainmaker app uses integer user IDs. Because of that, Replit is authoritative for quote/account/product data, but the Vercel-native `users` and `sessions` tables were preserved from the existing Vercel database so login continues to work.

## Count Check

After the Replit data copy and before overlap lead merge:

| Table | Replit | New DB |
| --- | ---: | ---: |
| accounts | 94 | 94 |
| quotes | 223 | 223 |
| latest quotes (`is_latest_version`) | 159 | 159 |
| line_items | 1,879 | 1,879 |
| products | 1,147 | 1,147 |
| quote_cover_photos | 9 | 9 |
| quote_product_renderings | 266 | 266 |
| users | 5 | 5 |

After preserving Vercel-only overlap leads and the final live website intake proof, the new DB has 102 accounts. Replit still has 94 accounts. The difference is expected: `rainmaker-production` includes the preserved website/test lead accounts that only existed in Vercel plus one archived cutover proof lead (`127`). Quote, latest quote, line item, product, cover photo, and rendering counts still match Replit.

Final proof bundle: `output/cutover/20260427-1257/`

## Verified

- `https://rainmaker.edgpatioshade.com/health` returns 200.
- `https://edgquote.replit.app/health` returns 200.
- Vercel alias now points at deployment `dpl_BwSRc4wDhmYUMHwsbAcqehGaw6pC`.
- Live Vercel Rainmaker quote list shows the latest Replit quote: `Q-1777294231483`.
- Live Vercel Rainmaker quote dashboard shows `159` latest quotes, matching Replit.
- Live Vercel lead inbox shows the merged/new lead state: Christopher + David Chang as new leads, with archived test/overlap leads preserved.
- Quote image migration copied 275 image rows to Vercel Blob with 0 failures.
- Blob verification: sample cover photo and sample rendering both returned HTTP 200 from `blob.vercel-storage.com`.
- Quote `513` proposal modal was verified in Comet on `rainmaker.edgpatioshade.com`: all 4 visual thumbnails rendered, Generate PDF completed, and View PDF opened a 12-page PDF.
- PDF brand assets were copied to Vercel Blob under `brand-assets/`; `/api/brand-assets/brand-logo.png`, `/api/brand-assets/brand-cover.jpg`, and `/api/brand-assets/brand-back.jpg` return HTTP 200 from the production custom domain.
- Live website `/api/leads` submitted successfully and created a Rainmaker lead in `rainmaker-production`.
- Live website lead intake created account `127` with 0 quote rows, and the test lead was archived after proof.
- Vercel logs showed the exercised Rainmaker APIs returning 200 during browser checks: `/api/user`, `/api/leads`, `/api/quotes`, `/api/quotes/520`, `/api/quotes/520/groups`, `/api/products`, `/api/colors`, and `/api/accounts`.
- Exact CSV diffs for imported `quotes`, `line_items`, and `products` are empty between the Replit export and `rainmaker-production` after the refresh.
- A non-persistent transaction smoke test inserted an account, quote, and line item in `rainmaker-production`, verified the rows existed inside the transaction, rolled back, and verified 0 persisted rows.

## Watch Items

- Production `RAINMAKER_API_KEY` is not the same as the local `.env.local` key. Do not overwrite it casually; the live website uses the production key and was verified working.
- Browser proof screenshots are stored under `output/cutover/20260427-1257/screenshots/`.
- I did not create a temporary quote that would need deletion in production. Creating one is fine, but deleting the test quote/account requires explicit action-time confirmation.
- Replit remains the rollback source through the first working week.
- Do not delete Replit data/storage until the team has used `rainmaker.edgpatioshade.com` successfully in real work.
