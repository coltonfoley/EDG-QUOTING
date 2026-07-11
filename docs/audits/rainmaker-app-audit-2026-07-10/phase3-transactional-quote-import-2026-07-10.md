# Phase 3C transactional quote/PDF import — local implementation evidence

**Date:** 2026-07-10
**State:** implemented and verified locally; not committed, pushed, deployed, or run against production data.

## Outcome

Quote/PDF import now has one all-or-nothing database boundary. A request either saves its intended client, quote or target-quote lines, and all imported lines, or saves none of them. The selected existing client is authoritative, the selected existing quote is required and locked before line insertion, and customer-approved quotes remain protected by the signed-version lock.

The review step now actually edits imported line descriptions, quantities, units, and unit prices. Before save, the user must explicitly state whether the extracted price is the customer unit price shown on the PDF or EDG cost that still needs markup.

## Defects removed

The prior route in `server/routes/quoteRoutes.ts` performed client matching/creation, quote creation, and each line insertion as separate storage calls. A later failure was collected as a per-PDF error while earlier writes remained. The UI submitted `existingCustomerId`, but `handleCustomerAttachment` never read it. Adding lines to an existing quote still ran unrelated customer matching/creation.

The replacement `server/quoteImport.ts` removes those paths:

- `executeQuoteImport` owns one database transaction for the complete request;
- an explicit `existingCustomerId` is verified and wins before extracted identity matching;
- adding to an existing quote does not create or match a client because the quote already determines the client;
- an existing quote is selected `FOR UPDATE` and checked by the signed-quote mutation policy;
- appended line positions begin after the existing maximum position;
- duplicate quote numbers fail the request with a stable conflict; and
- the route returns a visible all-or-nothing failure instead of a partial-success summary.

## Client matching policy

For new quotes, the user chooses one of two behaviors:

1. **Match an extracted client, otherwise create one.** Matching checks normalized email, then company, then name. A matched account is not rewritten. If no match exists, one new account is created inside the import transaction.
2. **Use one exact existing client.** That account ID overrides every name, email, or company extracted from the PDFs.

No import path updates an established account from extracted PDF content. Missing imported email addresses use a unique `.invalid` placeholder rather than a deliverable domain.

## Price and source semantics

The import options require one explicit price meaning:

- **Customer unit price shown on the PDF** stores the price with zero additional markup and `priceSource: import_customer_price`.
- **EDG cost that still needs markup** stores the price as cost, applies the entered markup percentage, and records `priceSource: import_edg_cost`.

Each imported line retains a source record containing only the source type, PDF ID/filename, extraction confidence, original line index, extracted total, and declared price meaning. Customer identity and document body content are not copied into routine server logs.

Extracted flat discount amount is converted to the quote’s percentage model only when a positive subtotal is available. Extracted notes remain customer-facing notes; the PDF source reference goes to internal notes; extracted terms go to custom contract terms.

## Review and recovery UX

`client/src/components/quote-importer.tsx` now provides editable fields for every extracted line and supports adding or removing lines before save. Calculated line totals update from quantity × unit price. The final import action stays disabled when:

- no existing target quote was chosen for an add-to-existing import;
- exact-client mode has no selected client;
- a PDF has no lines; or
- any line lacks a description, has a non-positive quantity, or has a negative/invalid price.

The exact-client explanation says that the selection overrides extracted client identity. The price explanation says how Rainmaker will calculate the customer unit price.

## Verification

| Check | Result |
|---|---|
| TypeScript | Pass |
| Ordinary tests | 139 passed; 40 database tests intentionally skipped without the isolated harness |
| Isolated fresh-database tests | 40 passed |
| Production build | Pass; existing large-chunk warning remains |
| Request-policy tests | Pass: existing-quote target required; incomplete lines rejected before transaction |
| Route test | Pass: missing target returns `IMPORT_INVALID` with the exact field path |
| Exact-client database test | Pass: selected account overrides an extracted matching account |
| Source/price database test | Pass: EDG-cost import retains markup, unit, confidence, filename, and `import_edg_cost` provenance |
| Rollback database test | Pass: later duplicate conflict removes the new client, first quote, and first lines |
| `git diff --check` | Pass |

## Browser evidence and exact gap

The current build’s **Import PDF** dialog and upload state rendered correctly through the Codex in-app Browser against the fictional local fixture. The in-app Browser explicitly rejected native file upload, so the real client-side PDF parser could not be advanced into the revised review/options tabs on that surface. No alternate browser was substituted and no production-only fixture hook was added.

To close this visual gap, run the repository’s fictional PDF through either:

- a future in-app Browser runtime that supports file chooser uploads; or
- a user-approved manual local upload while capturing the **Preview & Edit** and **Import Options** screens.

The database transaction, route contract, validation, compiled UI, and production bundle are verified now; only the post-upload visual interaction remains unobserved.

## Remaining boundary

- AI product/price-sheet import is a separate admin workflow and was not folded into quote/PDF import. It still needs read-only usage evidence and its own transaction/provenance review before retirement or expansion.
- Production import records have not been counted. Usage claims still require read-only event or source-metadata aggregates after rollout.
- PDF analysis still depends on OpenAI and temporary Blob handling; cost, latency, cleanup, and provider-failure observability remain Phase 5 work.
- Existing imported lines are not backfilled or reclassified.

No production behavior or data changed during this work.
