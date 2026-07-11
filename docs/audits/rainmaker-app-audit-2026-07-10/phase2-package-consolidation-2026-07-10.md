# Phase 2C customer-package consolidation — local implementation evidence

**Date:** 2026-07-10
**State:** implemented and verified locally; not committed, pushed, deployed, or exercised against production data.

## Outcome

Rainmaker now has one visible document-package setup path. **Customer Package Builder** controls pricing, customer-facing terms, and visuals for both proposal preview download and approval-link preparation. The old **Professional Proposal Generator**, its duplicate temporary options, and its unlabeled quote-list shortcut are removed.

No quote, image, document, snapshot, approval-drawing, or compatibility record was removed. Existing cover-photo and rendering data paths remain available to the authoritative package and historical records.

## Workflow

From the quote editor, the **Customer package** card now:

- summarizes whether pricing, terms, and visuals are included;
- opens one **Build/Review Customer Package** action;
- keeps the existing approval status, signed-document download, link, email, and EDG-signature actions together; and
- places the internal BOM under a separate **Internal Documents** card.

The builder provides:

- **Download Preview**, using `generateSignedPDF` and the current package selections;
- **Prepare Approval Link**, persisting those same selections through the authoritative enable-signature route; and
- the existing rendering upload/removal surface when visuals are selected.

Quotes with no contract content automatically turn contract inclusion off. This fixes the first-use dead end where an older `esigIncludeContract=true` value could display a checked disabled control and block both preview and link preparation.

## Removed duplicate surface

- `client/src/components/simple-proposal-generator.tsx` is removed.
- `client/src/pages/quote-builder.tsx` no longer lazy-loads or manages the separate proposal dialog.
- `client/src/pages/quotes.tsx` no longer shows the unlabeled proposal-generation icon or fetches a second quote copy for that dialog.
- `client/src/components/quote-summary.tsx` no longer exposes a separate **Generate Proposal** action or the misleading enable/disable approval switch.

The approval switch was not a true package workflow: enabling it changed one field while package preparation happened elsewhere, and disabling it did not provide a clear token-revocation contract. The consolidated builder makes preparation explicit and leaves existing signed/link history visible.

## Browser evidence

The local fictional quote was inspected in the Codex in-app Browser:

- The quote editor showed one **Review Customer Package** action and no **Generate Proposal** or old generator.
- The dialog title was **Customer Package Builder**.
- With no contract content, **Include Contract Notes & Terms** was unchecked and disabled rather than checked and blocking.
- **Download Preview** and **Prepare Approval Link** were both enabled.
- Downloading the preview completed and displayed: “This preview uses the same package renderer as the approval link and signed receipt.”

No link was regenerated, email sent, signature submitted, or record changed during browser verification.

## Verification

| Check | Result |
|---|---|
| TypeScript | Pass |
| Ordinary tests | 127 passed; 35 database tests intentionally skipped without the isolated harness |
| Isolated database tests | 35 passed |
| Production build | Pass |
| Source-policy regression | One builder, preview action, and approval action present; duplicate generator absent |
| In-app Browser | Consolidated builder and preview download pass |
| Diff whitespace | Pass |

## Remaining boundary

The customer-package contract is now single-source, but the PDF layout still needs a separate professionalism pass. The current fictional regression PDF continues to show signature-label collisions, duplicated acceptance content, uneven page density, and a crowded footer. Those visual changes must preserve the package/snapshot/fingerprint behavior established in Phases 2A–2C.

Production rollout remains gated on the read-only production preservation report, backup/restore evidence, internal signed-current mismatch review, explicit user approval, and the complete deployment proof chain.

No production behavior or data changed during this work.
