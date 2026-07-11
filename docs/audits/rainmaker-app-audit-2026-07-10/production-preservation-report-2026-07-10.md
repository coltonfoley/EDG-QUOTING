# Rainmaker production preservation report — 2026-07-10

## Verdict

The approved aggregate audit completed against production inside a database-confirmed read-only transaction. It did not write or return customer content. The result proves that compatibility/data cleanup is not yet safe: older signed records, quote-family state, orphaned historical records, legacy fields, and retained integrations all need preservation or focused review before migration/removal.

Generated at `2026-07-10T23:08:19.144Z`. Aggregate report SHA-256: `cfdf1deb522ac3a4e13e48e1344dae5edcb24b6b313ec31145770fd9ae13a69f`. This checksum covers the aggregate report, not a database backup.

## Read-only safety proof

- The checker required explicit production-audit approval.
- PostgreSQL confirmed `transaction_read_only = on` before application queries ran.
- The checker used one connection, aggregate/status/date queries only, and rolled the transaction back.
- No customer names, emails, addresses, quote content, signatures, tokens, URLs, documents, or images were returned.
- No production record, schema, object, environment variable, deployment, or customer action changed.

## Aggregate inventory

| Area | Count |
|---|---:|
| Accounts | 213 |
| Quotes | 408 |
| Quote families | 285 |
| Groups | 123 |
| Line items | 3,299 |
| Products | 1,148 |
| Pricing rows | 912 |
| Planning agreements / events | 3 / 12 |
| Approval drawings | 4 |
| Cover photos / product renderings | 13 / 578 |
| Lead attachments / intake submissions | 1 / 2 |
| Contract templates | 2 |
| Retired issue reports | 1 |

## Findings that block destructive cleanup or migration

1. **Signed-history review:** 17 records have signature/snapshot activity; 11 are missing a usable snapshot and consequently register scope, line-count/content, and subtotal mismatches. These are likely older records, but that is an inference. Review only the affected IDs internally against signed PDFs/history before any signed-lock migration or cleanup.
2. **Quote-family repair:** 9 of 285 quote families have no current version. None have multiple current versions. There are 75 multi-version families, with a maximum depth of 9.
3. **Historical orphans:** 14 groups, 5 cover photos, and 9 product renderings have no current parent quote. There are no orphan line items, invalid line-to-group links, orphan lead attachments, orphan pricing rows, or orphan product-color links. Preserve the orphaned records until a locator/export review decides whether they are recoverable history or safe debris.
4. **Legacy data is active:** 69 accounts use the legacy billing-address field and 108 quotes contain internal handoff notes. Those paths must not be deleted.
5. **Retained workflows contain records:** all 3 planning agreements have material states (`paid_active`, `signed_awaiting_payment`, and `waived`); approval drawings include 3 drafts and 1 blocked revision. Keep their data and scoped compatibility paths.
6. **QuickBooks cannot be blindly removed:** one quote and one account contain QuickBooks references; the single settings row is inactive. Business confirmation and a preservation/export decision are still required.
7. **Retired issue reporting has one unresolved record:** keep or export it before schema removal.

## Storage result

All 592 stored asset references found by the audit point to Vercel Blob. The audit found no Google Cloud Storage, inline data, relative/local, other remote, or unknown locators. Product catalog rows contain no primary-image, gallery-image, or specification-sheet references.

This provider result is encouraging but does not prove that every Blob object is referenced or backed up. A Blob inventory/export and orphan decision remain necessary before object deletion.

## Production logging security resolution

The Vercel error baseline exposed a production database pool error whose serialized object included database connection credentials. The isolated security fix now logs only the error type rather than the error object, and a regression test protects that rule. Commit `e3664f7` passed GitHub CI and was deployed before the exposed database password was reset.

The Neon password was then rotated through the Vercel-managed integration. Rainmaker's database connection was corrected from a manual Production-only environment variable plus integration-managed Preview/Development variables to one integration-managed connection covering Production, Preview, and Development. The final production deployment became Ready, `/health` returned 200, unauthenticated `/api/user` returned 401, a database-backed invalid-signing-token read returned the expected 404, and the fresh two-minute Vercel error window contained no runtime errors or credential-like fields.

The same error group records 11 database connection terminations by administrator command, last observed on 2026-07-10. The pool recycles these connections, but post-release Vercel review should confirm the frequency drops and that no credential-bearing payload remains.

## Remaining evidence

- Neon Backup & Restore is available with a six-hour point-in-time history window. The Free plan currently has no manual snapshot or scheduled snapshot configured.
- Internally review the 11 signed-history mismatches by ID.
- Export/review the 28 orphaned historical records and associated Blob locators.
- Decide whether the inactive QuickBooks compatibility and unresolved issue-report record should be exported, retained, or retired in a later preservation-safe change.

The ID-level signed, no-current-family, and orphan review is now complete in `production-record-review-2026-07-10.md`. Those records are classified **preserve / no automatic repair**. A private Blob locator export is still required before any later object cleanup.

Until the remaining record reviews are complete, do not remove legacy storage/data paths, Ops backend/configuration, planning/approval compatibility, QuickBooks fields, issue-report storage, or customer/project history.
