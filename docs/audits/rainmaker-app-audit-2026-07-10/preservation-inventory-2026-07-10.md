# Rainmaker preservation inventory — 2026-07-10

This is the Phase 0 preservation-first inventory. It distinguishes current evidence from checks that still require transaction-enforced database access.

## Verdict

Rainmaker is a populated production system, so feature retirement must not be coupled to data deletion. EDG approved the dedicated read-only aggregate audit on 2026-07-10. Vercel's environment export returned an empty encrypted value, but a production error payload revealed a usable connection and a serious credential-logging defect. The audit then completed inside a database-confirmed read-only transaction. See `production-preservation-report-2026-07-10.md` for the aggregate result. Backup proof, credential rotation, signed-history review, and orphan review remain open gates.

No production records, files, environment variables, or compatibility paths were changed.

## Existing evidence

The authenticated production UI currently reports:

- 276 quote rows and approximately $11.8M of quote value on `/quotes`.
- 50 accounts on the dashboard, while `/quotes` reports 152 active accounts. This metric disagreement reinforces the need to define full-dataset semantics.
- 1,148 product rows and 75 website-lead records observed during the same-commit audit.
- Existing versioned quotes and signature states in the quote list.

These are UI-derived aggregates, not database counts or referential-integrity proof.

## Read-only audit added

`scripts/audit-production-preservation.mjs`:

- Requires `ALLOW_PRODUCTION_READ_ONLY_AUDIT=true`.
- Requires a database connection but never prints it.
- Executes `BEGIN TRANSACTION READ ONLY` on one connection.
- Verifies `transaction_read_only = on` before querying application tables.
- Rolls back on success and failure.
- Returns aggregate counts, dates, status groups, and mismatch totals only.
- Does not print customer content, tokens, URLs, notes, signatures, documents, or images.
- Produces a SHA-256 checksum of the aggregate report payload. This is not a database-backup checksum.

The script passes Node syntax validation. The first approved attempt used a temporary ignored environment file, confirmed `DATABASE_URL` is configured and encrypted in Vercel, received no usable exported value, and stopped before connecting. The temporary file was removed. A subsequent connection recovered from the credential-bearing error payload was used only through the checker; PostgreSQL confirmed the transaction was read only, the checker rolled back, and only aggregate output was retained.

## Checks the script will produce

### Signed quote integrity

- Records with a signature or signed snapshot and any missing snapshots.
- Live-vs-snapshot scope mismatches for project/commercial fields, terms, and package toggles.
- Snapshot/live line-item count, identity, and content differences.
- Public line subtotal differences after current discount, tariff, and markup rules.

If any mismatch is found, a second tightly scoped review must identify affected quote IDs without putting customer content in this report.

### Quote-family integrity

- Total quote families.
- Families with zero or multiple current versions.
- Multi-version family count and maximum version depth.

### Compatibility, references, and storage

- Planning agreements grouped by status and recency.
- Approval drawings grouped by drawing status, order status, and recency.
- QuickBooks settings and account/quote reference counts.
- Retired issue-report counts and unresolved-state count.
- Legacy billing/jobsite references and internal-note counts.
- Orphan groups, line items, group links, cover photos, renderings, lead attachments, pricing rows, and product-color links.
- Stored asset locators grouped by Vercel Blob, Google Cloud Storage, inline data, relative/local path, other remote, or unknown.
- Product rows referencing primary, gallery, or specification assets.

## Preservation decisions

| Path | Decision | Reason/evidence required before deletion |
|---|---|---|
| Quotes, versions, signed snapshots, audit trails | **Keep** | Legal/customer-document history and known active usage |
| Quote groups and line items | **Keep and repair** | Core pricing/scope truth; fix identity bugs without rewriting history |
| Cover photos, renderings, attachments, Blob locators | **Keep** | Customer/project assets; provider/orphan inventory is pending |
| Planning agreements | **Keep compatibility data; retire creation separately** | Existing records may document customer commitments |
| Approval drawings | **Keep compatibility data; retire new creation separately** | Existing signed/order-state records may be material |
| QuickBooks fields/settings | **Unknown—needs counts and business validation** | Schema and environment references remain |
| Retired issue-report rows | **Keep until row count/export decision** | UI/API are removed, but schema explicitly preserves records |
| `accounts` / `customers` / `clients` compatibility | **Keep for now; consolidate later** | Current compatibility surface has 18 handlers |
| Legacy billing/jobsite fields | **Keep until reference counts are known** | Schema explicitly identifies backward compatibility |
| Quote `internal_notes` | **Keep** | Useful project context even though Ops is retired |
| Ops UI/API/integration/configuration | **Remove after final dependency check** | Owner-confirmed retirement; code-only consumer evidence; zero 30-day route logs |
| Ops environment variables | **Remove with backend retirement** | Still configured and misleading |

## Backup and checksum status

| Item | Status |
|---|---|
| Production database backup/point-in-time recovery | **Verified:** Neon Backup & Restore provides a 6-hour history window; no manual/scheduled snapshot is configured on the current Free plan |
| Blob/object-store inventory export | **Not run** |
| Aggregate report checksum | **Complete:** `cfdf1deb522ac3a4e13e48e1344dae5edcb24b6b313ec31145770fd9ae13a69f` |
| Data deletion authorization | **Not granted** |
| Compatibility deletion authorization | **Not granted** |

Before any schema column/table or stored asset is removed, obtain Neon backup/PITR status and a dated aggregate audit result. Removing Ops code does not require deleting historical data.

## Exact evidence needed to close this gate

1. A read-only production Postgres connection usable by the audit script, or an approved connector that enforces read-only transactions.
2. The aggregate JSON produced by `ALLOW_PRODUCTION_READ_ONLY_AUDIT=true node scripts/audit-production-preservation.mjs` with the connection loaded from a temporary untracked environment file.
3. Neon backup/PITR status and retention, recorded without credentials.
4. If signed mismatches are nonzero, affected quote IDs reviewed internally against signed PDFs/snapshots before locking or migration.
5. If non-Blob storage references or orphans are nonzero, a locator export and preservation decision.
6. A business yes/no decision on QuickBooks compatibility.

Until then, Phase 1 may remove owner-approved misleading controls in a UI-only PR, but Ops backend/configuration and every data/compatibility deletion remain gated.
