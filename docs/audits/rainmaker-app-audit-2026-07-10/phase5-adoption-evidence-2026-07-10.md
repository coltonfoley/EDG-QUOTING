# Phase 5C local evidence — privacy-minimized adoption events

**Date:** 2026-07-10
**Status:** Implemented and verified locally; not committed, pushed, deployed, or connected to production data
**Historical boundary:** Counts begin only after this instrumentation is deployed. A zero is not evidence that a feature was historically unused.

## Outcome

Rainmaker now has a small append-only business-event ledger and an admin-only **Recorded feature use** summary. The purpose is narrow: replace future guesses about feature use with authoritative completed-action counts while avoiding a second store of customer, pricing, document, or message content.

This is not a general analytics platform and does not backfill historical behavior. The local fixture numbers are fictional layout evidence only. Until migration `0030_add_business_events.sql` and the matching application code are deployed, production adoption remains unknown.

## Recorded actions

| Admin label | Durable completion boundary | Source |
|---|---|---|
| Customer packages prepared | E-signature/customer-package preparation commits | `business_events.customer_package_prepared` |
| Customer approvals completed | Customer signature update commits | `business_events.quote_customer_signed` |
| EDG signatures completed | Company signature update commits | `business_events.quote_company_signed` |
| Lead inquiries converted to quotes | Inquiry conversion and quote creation commit together | `business_events.lead_converted_to_quote` |
| Quote import actions completed | The transactional quote/PDF import commits | `business_events.quote_import_completed` |
| Exact dimensional prices resolved | Server returns a successful exact-band price | `business_events.dimensional_price_resolved` |
| Product catalog imports completed | The validated catalog batch and event commit together | `business_events.product_catalog_import_completed` |
| Sundance packages inserted | The configured group, lines, quote revision, drawing revision state, and event commit together | `business_events.sundance_configuration_inserted` |
| Approval emails accepted by provider | Existing signature-request ledger reaches `sent` | `email_delivery_attempts` |
| Quote versions created | Existing version-created audit event commits | `quote_version_events` |

Failed imports, failed/manual-review dimensional pricing, and rolled-back business transactions do not count as completed use. Package/signature transitions use deterministic event keys so a repeated request cannot inflate the same authoritative action. Quote import and exact-price actions intentionally count completed invocations rather than pretending to identify a unique customer outcome. Product catalog import and Sundance insertion use stable client-attempt UUIDs; a replay cannot inflate their counts, and Sundance replay cannot create a second package.

## Data minimization and boundaries

`business_events` stores only event type, optional internal quote/account/inquiry/product/actor IDs, an optional idempotency key, and occurrence time. The schema has no payload or metadata object and no columns for:

- customer names, contact details, addresses, or notes;
- message subject/body or recipient;
- filenames, document contents, or storage URLs;
- dimensions, configuration, cost, price, discount, or margin;
- signing tokens or signatures.

The package-preparation key hashes the signing token rather than retaining the raw public credential. The admin endpoint is `GET`-only and role-gated. The UI offers only refresh; it cannot create, edit, delete, resend, or replay an event.

The ledger is append-only in Rainmaker application code: the shared helper inserts and can ignore a duplicate key; no update or delete path was added. This is an application guarantee, not a database-level denial of privileged SQL access.

## Truthful interpretation

The summary uses a fixed 30-day window and returns the first recorded timestamp for context. The UI states:

> Counts begin only after this instrumentation is deployed. A zero means no event was recorded in this window; it does not prove the feature was historically unused.

If the ledger cannot be read, the card does not render zeroes. It says **Usage evidence unavailable** and **No feature should be classified from this state**, with one retry action.

The metrics support “recorded use” only. They do not establish whether a feature is well used, valuable, efficient, or should be retired. Those decisions still need a suitable observation period plus staff context.

## UI evidence

- Desktop fixture: [Recorded feature use at 1024 px](screenshots/phase5-adoption-summary-1024.png)
- Mobile context and zero-interpretation warning: [Recorded feature use at 390 px](screenshots/phase5-adoption-summary-390-context.png)
- Mobile metric/privacy layout: [Recorded metrics at 390 px](screenshots/phase5-adoption-summary-390.png)

In-app Browser inspection verified the populated Admin page at 1024 and 390 pixels and the failure state at 390 pixels. At 390 pixels the card measured 358 pixels within a 390-pixel document, with no document overflow. The failure state contained exactly one **Try Again** button and no metric classification.

## Verification

- `server/tests/business-event-routes.test.ts`: authentication, admin authorization, minimized response contract, and generic errors.
- `server/tests/authorization-policy.test.ts`: append-only/minimized schema and code policy, read-only admin route, and the explicit rule that zero is not historical non-use.
- `server/tests/removed-feature-routes.test.ts`: only successful exact dimensional prices record use; manual-review failures do not; no dimensions or price enter the event call.
- `server/tests/quotes.test.ts`: isolated migrated database proves idempotent keys, committed signature/package/conversion/import events, specialized email/version sources, and normalized timestamps.
- `npm test`: 187 ordinary tests passed; the 47 database tests are deliberately skipped there.
- `npm run test:database:isolated`: all 47 database tests passed against a fresh in-memory restore.
- `npm run check` and `npm run build`: passed.
- `npm run audit:browser:a11y`: 59 route/viewport states and 14 dialog/theme states passed, along with local-only keyboard/import rehearsals.

## Known adoption gaps

The current slice does not record client-only preview/download actions, BOM downloads, dark-mode use, or contract-template use. Client-side clicks were deliberately excluded because they are weaker evidence and would require a separate trustworthy delivery path. AI/manual product imports share the authoritative committed product-catalog-import metric, and Sundance Builder insertion has its own committed metric. See [phase5-product-workflow-evidence-2026-07-10.md](phase5-product-workflow-evidence-2026-07-10.md).

“Approval email accepted by provider” means the configured provider accepted Rainmaker's send request; it does not prove inbox delivery or customer reading. Existing reconciliation limitations still apply.

## Release and decision gate

After an approved deployment, retain the historical-coverage warning and collect a defined observation window before revisiting unknown-feature decisions. Do not backfill inferred events from record timestamps and do not classify a feature as unused from a zero count alone. Production migration/readiness and preservation proof remain required before rollout.

## Safety

No production database, customer record, quote, email provider, signature, storage object, or deployment configuration was read or changed in this slice. No email, customer action, commit, push, or deployment occurred.
