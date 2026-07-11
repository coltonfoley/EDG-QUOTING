# Rainmaker production record review — 2026-07-10

## Verdict

The preservation exceptions are understood well enough to make a safe release decision. None are candidates for automatic deletion or automatic repair.

- The 11 signed records without snapshots are genuine customer-approval history. Keep them locked and preserve their current data; do not synthesize snapshots after the fact.
- The 28 orphaned records are historical leftovers from deleted quotes. Preserve their database rows and Blob objects until a separate export/recovery decision.
- The 9 quote families with no current version are single-version historical records, not broken multi-version races. Do not automatically reactivate them.

The review used production `SELECT` queries only. It accessed record IDs, dates, yes/no status flags, line counts, file sizes, and storage-provider classification. It did not access customer names, addresses, emails, quote descriptions, prices, signatures, document bodies, filenames, or storage URLs.

## Signed records without frozen snapshots

All 11 records have real signature activity and nonempty quote lines. They span September 2025 through June 2026, which confirms this is historical compatibility—not a single recent failed operation.

| Quote ID | Created | Client signature | Company signature | Line count | Decision |
|---:|---|:---:|:---:|---:|---|
| 31 | 2025-09-25 | No | Yes | 22 | Keep locked; also appears in the no-current-family review |
| 32 | 2025-09-29 | Yes | No | 4 | Keep locked |
| 33 | 2025-10-03 | Yes | Yes | 9 | Keep locked |
| 66 | 2025-11-03 | Yes | Yes | 2 | Keep locked |
| 196 | 2025-12-15 | No | Yes | 4 | Keep locked |
| 198 | 2025-12-18 | Yes | No | 2 | Keep locked |
| 342 | 2025-12-22 | Yes | No | 5 | Keep locked |
| 343 | 2025-12-30 | Yes | Yes | 2 | Keep locked |
| 370 | 2026-02-11 | Yes | No | 7 | Keep locked |
| 456 | 2026-04-08 | Yes | Yes | 4 | Keep locked |
| 666 | 2026-06-11 | No | Yes | 15 | Keep locked |

The local signed-lock implementation treats signature activity as sufficient to make a quote read only; it does not require a snapshot to protect these legacy records. A snapshot must not be backfilled from current mutable fields because that would falsely present a later reconstruction as the original signed package.

If EDG later needs to prove the exact historical package for one of these records, review that quote individually against any customer-held PDF/email and its existing audit/signature fields. Do not delay the additive improvement release solely to invent missing historical artifacts.

## Historical records without a current quote version

Each affected family contains exactly one version, so there is no competing version to choose automatically.

| Family / quote ID | Signed activity | Version count | Decision |
|---:|:---:|---:|---|
| 31 | Yes, no snapshot | 1 | Keep historical and locked; owner may review visibility later |
| 93 | No | 1 | Keep historical; do not auto-reactivate |
| 95 | No | 1 | Keep historical; do not auto-reactivate |
| 109 | No | 1 | Keep historical; do not auto-reactivate |
| 127 | No | 1 | Keep historical; do not auto-reactivate |
| 145 | No | 1 | Keep historical; do not auto-reactivate |
| 163 | No | 1 | Keep historical; do not auto-reactivate |
| 181 | No | 1 | Keep historical; do not auto-reactivate |
| 546 | Yes, snapshot present | 1 | Keep historical and locked; owner may review visibility later |

Seven unsigned records share a November 2025 legacy-import period. That timing is evidence of a historical batch, not proof that the records are disposable. A later admin-only integrity view may surface these nine records for human classification; the release should not silently change their current-version flag.

## Orphaned groups and visual assets

The 28 rows belong to 11 deleted quote IDs. There are no orphan line items or invalid line-to-group links, so the 14 groups have no live commercial lines attached.

| Deleted quote ID | Groups | Cover photos | Product renderings | Decision |
|---:|---:|---:|---:|---|
| 48 | 2 | 1 | 5 | Preserve |
| 52 | 2 | 1 | 1 | Preserve |
| 53 | 1 | 0 | 0 | Preserve |
| 54 | 1 | 0 | 0 | Preserve |
| 56 | 2 | 3 | 3 | Preserve |
| 123 | 1 | 0 | 0 | Preserve |
| 141 | 1 | 0 | 0 | Preserve |
| 159 | 1 | 0 | 0 | Preserve |
| 177 | 1 | 0 | 0 | Preserve |
| 197 | 1 | 0 | 0 | Preserve |
| 563 | 1 | 0 | 0 | Preserve |

All 14 file records use Vercel Blob. Eleven are marked active and three inactive. Their combined recorded size is 53,559,356 bytes (about 51.08 MiB). The rows span October 2025; the groups span October 2025 through May 2026.

Do not delete these database rows or Blob objects as part of the improvement release. Before any later cleanup, produce a private locator export, verify whether the Blob objects still exist, and choose archive, relink, or deletion per deleted quote family. Storage URLs and filenames should not be committed to this report.

## Migration safety decision

The eight pending migrations are preservation-compatible:

- `0023` relaxes the quote-account requirement; it does not delete account links.
- `0024`, `0027`, `0029`, and `0030` add event/history tables and indexes.
- `0025` adds line-item source fields.
- `0026` preserves the legacy product price default.
- `0028` adds a deal-stage timestamp.
- `0027` backfills lead-inquiry history from existing account lead fields and adds a nullable source link.

No migration deletes customer/project rows, removes columns/tables, rewrites signed snapshots, changes current-version flags, or deletes stored assets. Foreign-key `ON DELETE` rules describe future parent-deletion behavior; the migrations do not execute those deletions.

Before applying the migrations, create a manual Neon snapshot because the current Free plan's automatic point-in-time history is only six hours. Snapshot creation and production migration/deployment remain separate approval-gated actions.
