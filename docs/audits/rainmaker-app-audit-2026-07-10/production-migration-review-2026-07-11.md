# Rainmaker production migration review — 2026-07-11

## Verdict

Migrations `0023` through `0030` are suitable for an approval-gated production release. They are additive or compatibility-preserving, were applied successfully to the isolated Neon preview branch copied from production, and do not delete or rewrite customer, quote, signature, document, or stored-object history.

Production has not been migrated or deployed. The remaining hard gates are a named Neon child branch from current `main` as the manual restore checkpoint and explicit release approval.

## Release candidate

- Branch: `codex/rainmaker-improvement-plan`
- Commit reviewed: `dc93bc17b3d7aafa68a52f6ff37a78eb34c17a56`
- Draft pull request: `#12`
- GitHub CI: passed for `dc93bc1`
- Vercel private-preview check: passed for `dc93bc1`
- Isolated database branch: `preview/codex/rainmaker-improvement-plan` (`br-fragrant-hat-an9iuwdg`)
- Private preview: `/health` 200, `/ready` 200 with 25 tables and 370 expected columns, unauthenticated `/api/user` 401

## Read-only production preflight

The following aggregate-only queries ran in the Neon SQL Editor against the `main` branch and `rainmaker-production` database on 2026-07-11. They did not read customer content, prices, dimensions, filenames, storage URLs, or contact details.

The live baseline was refreshed at 06:56 CDT on 2026-07-11: `/health` returned the expected JSON with HTTP 200 and unauthenticated `/api/user` returned 401. The current production deployment does not yet implement the new readiness route: `/ready` returned the frontend HTML shell with HTTP 200. Post-release verification must therefore assert the JSON body (`status: ready`, `database: ready`, and schema counts), not merely the HTTP status.

### Pricing configuration

| Check | Result | Release meaning |
|---|---:|---|
| Dimensional pricing bands | 912 | Existing configuration is present. |
| Products with bands | 2 | Both configurable products are represented. |
| Configurable products without bands | 0 | No configured product will immediately fall into “not configured.” |
| Invalid/inverted ranges | 0 | Existing rows satisfy the new range shape. |
| Negative retail/base prices | 0 | Existing rows satisfy non-negative pricing rules. |
| Inclusive overlap pairs | 0 | Existing rows will not become ambiguous under exact-band matching. |

This closes the live-configuration aggregate gate for Phase 3B. Unsupported gaps still fail visibly as **manual review required**; the release does not invent a nearest price.

### Lead attachment preservation

| Check | Result | Release meaning |
|---|---:|---|
| Attachments | 1 active, 0 inactive | Existing attachment remains present. |
| Accounts represented | 1 | Attachment retains its durable client link. |
| Orphan account references | 0 | The account foreign key is intact. |
| Missing attachment submission IDs | 0 | Existing attachment retains its historical submission identifier. |
| Submission IDs absent from retry ledger | 1 | One historical submission predates `lead_intake_submissions`. Preserve it; do not fabricate a ledger row. |
| Vercel Blob records | 1 | Storage provider compatibility remains intact. |
| Legacy lead accounts | 76 | Migration `0027` will create at most one compatibility inquiry per account. |
| Legacy lead accounts with attachments | 1 | The historical attachment's account will receive a compatibility inquiry. |

The historical attachment is read by account in the current application, not solely through the retry ledger. Migration `0027` keeps the account-level attachment path and legacy lead fields, so the unmatched retry-ledger reference is a preservation exception rather than a migration blocker.

### Current schema

- All four new tables are absent, as expected.
- All nine new/compatibility columns checked are absent, as expected.
- `quotes.account_id` is already nullable; migration `0023` is a no-op in production.
- There are 58 existing unassigned quotes. The migration and release must preserve them.

## Migration-by-migration decision

| Migration | Forward effect | Data risk | Rollback decision |
|---|---|---|---|
| `0023_allow_unassigned_quotes.sql` | Drops an already-absent `NOT NULL` requirement. | None observed; 58 existing unassigned quotes confirm null is production truth. | Leave nullable on code rollback. Never attempt to force `NOT NULL` while those rows exist. |
| `0024_add_quote_version_events.sql` | Adds an audit table and indexes. | No backfill or quote rewrite. | Leave table/rows in place; older code ignores them. |
| `0025_add_line_item_source_identity.sql` | Adds four nullable provenance fields and an index. | No existing line-item rewrite. | Leave columns in place; older code ignores them. |
| `0026_preserve_legacy_product_price_default.sql` | Restores price/markup compatibility columns, backfills defaults, and enforces safe defaults. | Existing products receive compatibility values only where the columns are absent/null. | Do not drop columns. Older code remains compatible. Snapshot restore is the only full data rollback. |
| `0027_add_lead_inquiry_history.sql` | Adds append-only inquiry history, backfills one compatibility inquiry per legacy lead account, and adds nullable quote provenance. | Expected backfill is 76 accounts; legacy account fields and attachments remain unchanged. | Keep the history table and rows on code rollback. Do not delete generated history. |
| `0028_add_deal_stage_timestamp.sql` | Adds a nullable business timestamp and index. | Historical dates remain null rather than guessed. | Leave column/index in place. |
| `0029_add_email_delivery_attempts.sql` | Adds an idempotency/evidence ledger and indexes. | No email is sent by the migration. | Preserve ledger rows; older code ignores them. |
| `0030_add_business_events.sql` | Adds a privacy-minimized event ledger and indexes. | No historical usage is fabricated or backfilled. | Preserve event rows; older code ignores them. |

## Approved-shape execution plan

These steps describe the release but do not authorize it.

1. Confirm the exact production deployment and database branch are still the expected sources of truth.
2. Create a named Neon child branch from current `main` immediately before the migration and verify it is visible. This is the manual restore checkpoint because the current plan has no manual snapshot control and the automatic history window is six hours.
3. Re-run the aggregate preflight. Stop if signed/history exception counts change unexpectedly, pricing has invalid/overlapping rows, the attachment becomes orphaned, or the pending schema is partially present without explanation.
4. Apply migrations `0023`–`0030` in manifest order inside one transaction. Any SQL failure must roll back the entire transaction.
5. Run a schema-only readiness check before deploying application code. Expected application schema: 25 tables and 370 columns.
6. Deploy the exact approved commit through GitHub-connected Vercel production.
7. Verify Vercel `Ready`, live `/health`, live `/ready`, authenticated `/api/user`, the signed-out login shell, role visibility, quote loading, and one read-only customer-package comparison. `/ready` must return readiness JSON with `status: ready`, `database: ready`, and the expected schema counts; frontend HTML with HTTP 200 is a failure.
8. Review Vercel runtime/error logs and the redacted email reconciliation view. Do not send a test customer email or create a signature to prove the release.

## Rollback checkpoint

There is intentionally no destructive “down migration.” Dropping the new tables or columns could erase audit, inquiry, provenance, email, or adoption evidence created after release.

- **Migration fails before commit:** execute `ROLLBACK`; do not deploy the new application.
- **Migration succeeds but deployment fails:** redeploy the prior production application commit and leave the additive schema in place. Confirm `/health`, `/ready`, and `/api/user` on the restored app.
- **Application issue before meaningful new writes:** roll back the Vercel deployment; preserve the new schema and any ledger/history rows.
- **Data-integrity issue after new writes:** stop customer-visible actions, capture redacted counts, and decide whether targeted repair or snapshot restoration is safer. Snapshot restoration is last resort because it discards valid post-checkpoint work and requires separate approval.

## Preserved exceptions

The release must not alter the 11 signed records without snapshots, 9 historical quote families without a current version, 28 orphan rows/objects, the historical lead attachment, legacy lead fields, QuickBooks fields, planning agreements, approval drawings, stored image locators, or obsolete Vercel Ops variables. The Ops variables can be removed only after the released application proves no callable Ops path remains; data and storage cleanup remain separate projects.

## Decision needed

The technical migration review is complete. Production work may begin only after EDG explicitly approves the migration/release scope and the named Neon restore-checkpoint branch.
