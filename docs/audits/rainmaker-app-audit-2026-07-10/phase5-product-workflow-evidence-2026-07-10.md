# Phase 5C local evidence — atomic product workflows and adoption proof

**Date:** 2026-07-10
**Status:** Implemented and verified locally; not committed, pushed, deployed, or connected to production data

## Outcome

Product catalog imports and Sundance Builder insertion now cross one server-owned transaction boundary per completed action. Each accepted client attempt carries a stable UUID, and the same transaction appends one privacy-minimized business event. A replay cannot insert a second Sundance package or inflate the recorded-use count.

This closes the two server-authoritative adoption gaps for product imports and Sundance Builder use. It does not claim historical usage: counts begin only after an approved deployment.

## Product catalog import

- `server/productCatalogImport.ts` validates the entire batch before opening the transaction. One invalid row rejects the batch before any product write.
- Existing product matching by normalized name, explicit/derived Sundance SKU, and legacy parenthesized SKU is preserved.
- Create and update paths synchronize `retail_price` and the retained non-null `default_unit_price`, while `cost_price` and supplier-discount compatibility fields are derived together.
- `importRequestId` is retained across an ambiguous client retry. A committed `product_catalog_import_completed:<UUID>` event makes the replay a no-write success rather than another import.
- The event stores no product content, prices, filenames, or source document details.

## Sundance Builder insertion

- `server/configuredProductInsertion.ts` locks the quote, re-resolves catalog products, validates the signed-quote boundary, creates the group and all configured lines, updates quote revision state, marks an applicable approval drawing for revision, and appends the event in one transaction.
- The group ID is deterministic for the attempt: `config-<UUID>`. A replay requires both the group and matching event; mismatched partial state stops for review instead of guessing.
- Saved line-item description, SKU, unit, retail price, EDG cost basis, and markup come from current server-side catalog/default records rather than a stale browser snapshot.
- `sundance_configuration_inserted:<quoteId>:<UUID>` records only quote ID, actor ID, event type/key, and time.

## UI behavior

- Manual CSV/Excel import, AI-assisted product import, and Sundance Builder retain one request ID while retrying the same prepared action.
- A replay reports **Import already completed** or **Configuration already inserted** rather than displaying misleading new-write counts.
- Changing the prepared Sundance item set creates a new attempt ID; successful completion clears it.

## Verification

- `server/tests/quotes.test.ts` proves one product row/event for an import replay, legacy-price synchronization, whole-batch rejection before writes, server-resolved configured lines, one group/line/event for a Sundance replay, and both new admin-summary metrics.
- `server/tests/removed-feature-routes.test.ts` proves the configurator requires an attempt UUID and returns distinct created/replayed responses through the atomic storage boundary.
- `server/tests/authorization-policy.test.ts` requires both minimized event types and transactional modules.
- `scripts/audit-browser-accessibility.mjs` uploads a fictional CSV through the real manual-import UI, verifies one exact local-only POST with a UUID and the expected product/pricing values, and reaches **Import Successful** without persistence. This rehearsal found and repaired ambiguous auto-mapping: **Manufacturer MSRP** now maps to price before the word “manufacturer” is considered as a brand column.
- The same gate opens the real Sundance Builder from a fictional quote, enters quantity 2 for the synthetic Sundance louver, submits exactly one local UUID-tagged request, verifies the catalog snapshot/cost payload, reaches **Configuration inserted**, and confirms the builder closes. The fixture stores no group or line.
- TypeScript passed.
- 187 ordinary tests passed; 47 database tests were skipped in that command.
- All 47 isolated migrated-database tests passed.
- The full 59 route/viewport, 14 dialog/theme, keyboard, quote-import, and product-import browser gate passed.

## Remaining adoption gaps

Client-only preview/download clicks, BOM downloads, dark-mode use, and contract-template use remain intentionally unmeasured. They are weaker click evidence and should not be mixed with server-authoritative completed actions without a separately approved measurement policy. Product catalog import and Sundance Builder completion are no longer in that gap list.

## Safety

No production database, catalog row, quote, customer record, file, email provider, signature, migration, deployment configuration, or compatibility path was read or changed. No customer-visible action, commit, push, or deployment occurred.
