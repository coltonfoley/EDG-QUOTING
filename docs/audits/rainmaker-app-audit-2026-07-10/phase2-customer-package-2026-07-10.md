# Phase 2B authoritative customer package — local implementation evidence

**Date:** 2026-07-10
**State:** implemented and verified locally; not committed, pushed, deployed, or exercised against production data.

## Outcome

Rainmaker now builds one token-scoped customer package for review, signature, frozen snapshot, customer receipt, and signed staff download. The package contains the selected customer-facing account details, sanitized line items, ordered groups, selected visual references, contract content, pricing choices, and compatible approval-drawing snapshot.

The public signing page no longer calls authenticated quote, group, or rendering endpoints. Preview and post-sign download use the same `generateSignedPDF` path. Signed staff views and downloads resolve commercial fields from `signedDocumentSnapshot`, while keeping only operational pipeline/version/signature state live.

## Package and data-flow evidence

- `server/storage.ts` now loads groups, active cover photo, and ordered active renderings in both `getQuoteWithDetails` and `getQuoteBySigningToken`.
- `server/quotePublicSigning.ts` creates customer package version 1, sanitizes contract/group/visual fields, sorts groups and visuals, reports package issues, and includes a commercial-package fingerprint.
- `GET /api/signatures/:token/full` is the only data request the public quote screen needs. It returns the live package before approval and the frozen snapshot afterward.
- `client/src/pages/public-sign.tsx` renders preview and receipt from that response and passes the embedded groups/visuals directly to the PDF generator.
- `client/src/lib/customer-package.ts` prevents signed staff downloads or read-only views from filling missing legacy snapshot fields with mutable live account, group, visual, line-item, or contract data.

The token response still carries only customer-facing line-item prices. Internal retail/cost controls and configuration data remain excluded. Visual metadata is limited to the file reference and display fields required by the document renderer.

## Exact-review signing guard

The public package includes two separate values:

- `documentRevision` records the quote revision that produced the response for evidence and troubleshooting.
- `customerPackageFingerprint` hashes the actual reviewed commercial package while excluding operational timestamps, signature metadata, and audit fields.

The browser submits the package fingerprint with the customer signature. The server rebuilds the current package and rejects a missing or different fingerprint with `QUOTE_CHANGED_BEFORE_SIGNATURE`. This catches scope/account/contract/group/visual/package changes without falsely rejecting a review after a harmless pipeline or email-status update.

After that comparison, the storage transaction still locks the quote row and compares the current row revision. A commercial edit that races between the comparison and signature write therefore cannot commit alongside the signature.

The snapshot created at signature contains the same package fingerprint, groups, ordering, visuals, contract, and pricing choices the customer reviewed. Signature/audit data is then appended to the signed artifact fingerprint.

## Incomplete and unavailable content

Rainmaker now blocks preparation or signature when:

- the proposal has no line items;
- contract inclusion is selected but no customer-facing contract content exists;
- visual inclusion is selected but no visuals are attached; or
- an included visual lacks a usable source reference.

Staff see the exact missing-package items before **Prepare Approval Link**. Customers opening a stale/incomplete link see the exact issue and cannot proceed to signature. The server records only quote ID and issue codes in its warning; it does not log customer content.

If an included visual or cover reference exists but cannot be loaded by the renderer, PDF generation now fails with a visible recovery message instead of silently producing an incomplete document.

## Browser evidence

The Codex in-app Browser verified the local fictional routes without submitting a signature or changing any data:

- `/quotes/9301/edit` with the signed fixture showed the customer-approved banner, frozen **Avery Example** client/scope/terms, disabled commercial controls, and enabled pipeline, signed download, and EDG signature controls.
- `/sign/test-token` rendered the full proposal review, enabled **Approve & Sign**, and advanced to the signature step. The page source contains no authenticated group/rendering fetch; the token package supplies those fields.
- `/sign/incomplete-token` showed **This proposal is not ready for approval**, listed the missing visuals issue, and disabled **Approve & Sign**.

The browser fixture remains synthetic and local. No email, signature, upload, customer record, or production request was created.

## Verification results

| Check | Result |
|---|---|
| TypeScript | Pass |
| Ordinary tests | 126 passed; 35 database tests intentionally skipped without the isolated harness |
| Isolated fresh-database tests | 35 passed |
| Token-scoped DTO and sanitization | Pass |
| Reviewed-package fingerprint and changed-package rejection | Pass |
| Snapshot-backed staff document resolution | Pass |
| Incomplete-package staff/public boundaries | Pass |
| Fresh migration/schema audit | 22 declared tables; 25 manifest migrations; no drift |
| Production build | Pass |
| Asset and working-tree secret audits | Pass |
| Fictional signed PDF regeneration | Pass; five pages rendered |

## Compatibility and remaining limitations

- Existing signed snapshots are never backfilled from mutable live relations. If a legacy snapshot omitted groups or visuals, the signed view preserves that historical package rather than inventing legal-document content after approval.
- Existing approval drawings retain the current opt-in snapshot behavior. New approval-drawing creation remains removed from the visible workflow.
- A visual URL can become unavailable after package preparation. The renderer now fails visibly, but Rainmaker does not yet preflight every remote asset before sending the link.
- The regenerated fictional PDF confirms package content, but its visual professionalism defects remain: signature text collides with rules/labels, acceptance content is duplicated, page density is uneven, and the footer is crowded. Those are document-layout work, not a package-fidelity regression.
- Proposal Generator and Proposal Approval Options still duplicate configuration concepts. Work package 2C should consolidate them only after preserving the now-tested package contract.

Production rollout remains gated on the read-only production preservation report, backup/restore evidence, internal review of signed-current mismatches, explicit user approval, and the full commit/CI/Vercel/health/session/browser proof chain.

No production behavior or data changed during this work.
