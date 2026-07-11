# Phase 2A signed-version immutability — local implementation evidence

**Date:** 2026-07-10
**State:** implemented and verified locally; not committed, pushed, deployed, or exercised against production data.

## Outcome

A quote version becomes customer-approved when `clientSignedAt`, `clientSignatureData`, or `signedDocumentSnapshot` exists. Once approved, its commercial package is read-only. Staff can still change pipeline stage, add the dedicated EDG signature, download documents, or create a new version. They cannot edit or delete the approved quote, its line items, groups, images, drawing content, package choices, or amount-due inputs.

Rejected writes return HTTP 409 with code `QUOTE_SIGNED_LOCKED` and direct the user to **Create New Version**. There is no administrator bypass that silently changes customer-approved scope.

## Enforcement evidence

The invariant is enforced in the storage transaction, not only in the visible UI:

- `server/quoteLock.ts` defines the three approval indicators, the stable conflict response, and narrow allowlists for pipeline, customer-signature, and company-signature transitions.
- `server/storage.ts` locks the quote row with `SELECT ... FOR UPDATE` before quote, line-item, group, image, drawing, and planning-credit writes. Related-content changes advance the quote revision.
- `server/routes/quoteRoutes.ts`, `server/routes/lineItemRoutes.ts`, and `server/routes/planningAgreementRoutes.ts` translate the storage conflict to the stable 409 response. Upload and email routes preflight the lock before creating Blob objects or sending mail.
- Customer signing supplies the quote revision observed during preview. The signing transaction locks and rechecks that revision, so a stale customer cannot approve scope changed after review.
- Company signing appends its audit data without replacing the customer fingerprint or frozen snapshot.

The database tests prove that an edit and customer signature cannot both commit from the same stale state. They also cover quote delete, line-item/group/image mutation, bulk and reorder paths, planning credit, repeat signatures, and the narrow permitted transitions.

## Version recovery and audit trail

**Create New Version** is the supported recovery path. Version creation now:

- copies quote scope, groups, line items, package preferences, and tariff applicability;
- clears customer/company signatures, tokens, and signed snapshots;
- locks the quote family while allocating the next version number;
- leaves exactly one family member current; and
- records `version_created` in the append-only `quote_version_events` table.

Making an existing family version current records `version_made_current` and carries a signature-aware confirmation in the UI. Migration `0024_add_quote_version_events.sql` adds only this audit table and its indexes; it does not rewrite quote or customer data.

## Staff UI and recovery behavior

The signed editor now shows an emerald **Customer-approved version — read only** banner and one primary **Create New Version** action. Commercial fields, catalog/custom-item entry, grouping, reorder, images, contract/package controls, notes, terms, and financial inputs are disabled or read-only. Pipeline stage, downloads, and the EDG signature remain available.

If an already-open editor receives `QUOTE_SIGNED_LOCKED`, autosave stops, pending local edits are discarded, the quote is refetched, and the user receives the read-only/new-version explanation. The client does not endlessly retry the rejected mutation.

The signature workflow status now requires a customer signature; an EDG-only signature no longer marks customer approval complete.

## Browser evidence

The signed fixture was inspected in the Codex in-app Browser at a 1280 by 720 viewport. The inspection confirmed:

- the read-only banner is visible;
- **Save Now** is absent;
- exactly one **Create New Version** action is present and enabled;
- tax and notes are read-only;
- catalog entry is disabled;
- pipeline stage and **Add EDG Signature** remain enabled; and
- the account display resolves to the fixture client instead of an empty disabled combobox.

Screenshot: [signed quote read-only state](screenshots/phase2-signed-quote-read-only.jpg).

This pass did not establish a 390-pixel Phase 2 screenshot because the available browser viewport remained 1280 by 720. Phase 1 already verified the primary navigation at 390 pixels, but signed-editor mobile behavior remains a validation item.

## Verification results

| Check | Result |
|---|---|
| TypeScript | Pass |
| Ordinary tests | 115 passed; 34 database tests intentionally skipped without the isolated harness |
| Isolated fresh-database tests | 34 passed |
| Fresh migration/schema audit | 22 declared tables; 25 manifest migrations; no drift |
| Production build | Pass |
| Dependency audit | 0 vulnerabilities at the requested threshold |
| Asset audit | 3 tracked assets; no missing or unreferenced files |
| Working-tree secret scan | 249 files scanned; no findings |
| Diff whitespace check | Pass |

The build still reports the pre-existing large fonts chunk warning. It is a performance follow-up, not a Phase 2A failure.

## Remaining boundary

Phase 2B now makes signed staff/customer views and receipts snapshot-backed through one authoritative package containing the reviewed account details, groups and ordering, visuals, contract content, pricing choices, and compatible drawing data. See [phase2-customer-package-2026-07-10.md](phase2-customer-package-2026-07-10.md). The remaining Phase 2 work is consolidating duplicate package controls and repairing document-layout professionalism without changing the frozen package contract.

Production rollout remains blocked until all of the following are available:

1. A transaction-enforced, read-only production preservation report, including signed-current versus snapshot mismatch counts.
2. Backup/restore evidence for customer, quote, signature, document, and compatibility data.
3. Review of any mismatched quote IDs internally without exposing customer details in the report.
4. Explicit user approval for the migration and deployment.
5. The required commit, CI, Vercel, health, authenticated-session, and browser proof chain.

No production behavior or data changed during this work.
