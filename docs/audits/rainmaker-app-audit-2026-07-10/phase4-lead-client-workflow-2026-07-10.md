# Phase 4A–4C local evidence — lead, client, and dashboard truth

**Date:** 2026-07-10
**Status:** Implemented and verified locally; not committed, pushed, deployed, or run against production data
**Scope:** Phase 4A inquiry preservation, Phase 4B lead-to-quote conversion, and Phase 4C account/dashboard truth
**Out of scope:** customer messages, quote submission, production writes, production migration, destructive cleanup, and the remaining Phase 4D usability/accessibility program

## Outcome

Rainmaker now has a locally verified separation between durable client identity and repeat inquiries:

> account -> many append-only inquiries -> at most one quote per inquiry -> one current quote family in list/dashboard counts

A returning website submission no longer replaces an established client's name, phone, company, status, or prior message. It appends an inquiry. A salesperson can start a quote from that inquiry with the client, source inquiry, and suggested project type already carried into the new-quote form. The dashboard no longer calls gross markup “profit,” and “won this month” requires a dedicated stage-transition timestamp instead of a generic edit date.

## 4A — Preserve account identity and inquiry history

### Data model

- `shared/schema.ts` defines `lead_inquiries`, including account, submission ID, status, source, project type, message, location, customer type, received/contacted/converted timestamps, conversion actor, and converted quote.
- `migrations/0027_add_lead_inquiry_history.sql` creates the table and indexes, backfills one compatibility inquiry for every account with legacy lead state, adds `quotes.source_inquiry_id`, and preserves the account-level lead fields for older readers.
- The migration is additive. It does not delete or rewrite customer/project records, legacy lead fields, attachments, Ops compatibility, QuickBooks fields, or Blob references.
- `server/routes/leadIntakeRoutes.ts:214` implements `preserveAccountAndCreateInquiry`. Existing accounts receive only missing/placeholder identity values; established values are not overwritten. Every idempotent submission creates or returns its own inquiry.
- `GET /api/accounts/:id/inquiries` exposes the account's inquiry history, while the existing `/api/leads` response remains a compatibility projection of the latest inquiry.

### Database proof

`server/tests/quotes.test.ts` submits two returning inquiries for one established account and verifies:

- two inquiry rows exist;
- the account's established name, phone, lead status, and prior lead message remain unchanged;
- the new inquiry messages and project types remain independently readable.

### Remaining production gate

The local migration/restore proof is complete, but production execution is not approved. Before production migration, the preservation audit still needs a usable read-only database connection, redacted row counts, backup proof, and an attachment-reference check. Current attachment paths remain untouched compatibility data; this phase does not claim they were migrated into the new table.

## 4B — Auditable lead-to-quote conversion

### Backend boundary

- `server/inquiryConversion.ts` locks the selected inquiry inside a transaction, checks that it exists, rejects a second conversion, rejects an account mismatch, inserts the linked quote, and records the inquiry status, converted time, quote ID, and actor.
- `server/routes/quoteRoutes.ts` invokes that transaction only when `sourceInquiryId` is present. Ordinary quote creation remains compatible.
- `server/storage.ts` copies `sourceInquiryId` into new quote versions so provenance survives versioning.
- Stable failures are returned for missing inquiries, already-converted inquiries, and client/inquiry mismatch.

### UI path

- `client/src/pages/leads.tsx` adds **Create Quote** for a concrete inquiry and routes to `/quotes/new?accountId=…&inquiryId=…&projectName=…`.
- Inquiry status actions update the exact inquiry when available, with the legacy account endpoint retained as a compatibility fallback.
- `client/src/pages/account-detail.tsx` now opens `/quotes/new?accountId=…` instead of returning the user to the quote list.
- `client/src/pages/quote-builder.tsx` carries the selected account, source inquiry, and suggested project name into the create payload.

### Browser-discovered repair

The first in-app Browser pass exposed a real integration defect: the URL parameters were correct, but `QuoteHeader` received no initial quote object for a new quote, so the client and project remained blank. Passing the initialized draft into `QuoteHeader` fixed the values, but initially made the page look like an existing quote. `client/src/components/quote-header.tsx` now distinguishes an existing quote by a truthy persisted ID, keeping the heading/action as **New Quote / Create Quote** while still accepting prefilled values.

The repeated local browser journey proved:

- source route: `/leads`;
- destination: `/quotes/new?accountId=9101&inquiryId=9151&projectName=Pergola`;
- client label: `Avery Example (Example Hospitality Group - TEST ONLY)`;
- project name: `Pergola`;
- exactly one **Create Quote** action and no **Save Now** action;
- no quote was submitted or created.

### Database proof

The isolated database suite verifies that one inquiry creates one quote linked to the correct account and source inquiry, conversion metadata is written atomically, and a second attempt fails without creating a duplicate quote.

## 4C — Account and dashboard truth

### Accounts

- `GET /api/accounts` now applies search and account-type filters on the server.
- `GET /api/accounts/summary` returns full-dataset client and current-quote-family counts.
- Project counts include only `quotes.is_latest_version = true`, so quote versions no longer inflate account project totals.
- `client/src/pages/accounts.tsx` debounces server-backed search, passes type and page parameters to the API, uses the global summary, and labels the metric **Current Quote Families**.

The in-app Browser verified `/accounts` with the fictional fixture:

- **Total Clients:** 1;
- **Current Quote Families:** 1;
- an `Avery` search retained the one matching server result;
- the page no longer presents a current-page count as a global total.

### Dashboard

- `migrations/0028_add_deal_stage_timestamp.sql` adds `quotes.deal_stage_changed_at`. Historical rows intentionally remain null; the migration does not guess an old win into the current month.
- `PATCH /api/quotes/:id/stage` sets the timestamp only when the stage actually changes. Re-saving the same stage does not rewrite it.
- `client/src/pages/home.tsx` filters to current quote versions, uses the dedicated stage-change timestamp for monthly wins, and renames the calculated values to gross markup.
- The UI explains the formula as selling price less stored line cost and explicitly avoids claiming net profit.

The in-app Browser verified `/` contains:

- **Gross Markup — Won**;
- **Gross Markup — Pipeline**;
- **Gross Markup Won This Month**;
- `selling price less stored line cost` and `markup divided by stored line cost` definitions;
- no **Profit This Month** label.

`server/tests/removed-feature-routes.test.ts` also proves a real stage transition supplies a `Date`, while a no-op stage update omits `dealStageChangedAt`.

## Verification

| Check | Result |
|---|---|
| TypeScript | Pass |
| Ordinary unit/policy/route suite | Pass — 141 tests (42 database tests skipped in this command) |
| Isolated real-database suite | Pass — 42 tests |
| Fresh migration restore | Pass — 29 manifest migrations, including `0027` and `0028` |
| Production build | Pass |
| In-app Browser lead -> quote form | Pass after browser-discovered initialization repair |
| In-app Browser account summary/search | Pass |
| In-app Browser dashboard language | Pass |
| Browser console | Only expected local-fixture Google Places missing-key errors; no key was read or added |

The build retains the pre-existing large font/chunk warning. It is not a Phase 4 failure and remains a performance/maintainability item.

## Compatibility and rollback

- Both migrations are additive and retain legacy account lead fields.
- Existing quotes may have null `sourceInquiryId` and `dealStageChangedAt`.
- Historical stage dates remain unknown rather than fabricated.
- The legacy lead-status route and compatibility projection remain available.
- No attachment, account, quote, version, image, Blob, QuickBooks, planning-agreement, drawing, or Ops data path was removed.
- Local rollback is code/migration review only; no production rollback was exercised because no production migration or deployment occurred.

## Phase boundary and open gaps

Phase 4A–4C behavior is complete locally. Phase 4D was subsequently advanced in [phase4d-usability-accessibility-2026-07-10.md](phase4d-usability-accessibility-2026-07-10.md); the remaining proof is narrower:

- mobile navigation, several explicit error states, admin-only destructive visibility, and keyboard line reordering were improved in earlier phases;
- QuoteBuilder now exposes a sticky semantic **Quote sections** navigation with keyboard-focusable anchors for Details, Versions, Line Items, and Review & Approval, plus named scroll targets; true browser passes at 390, 768, and 1024 remain pending;
- primary sales surfaces now call durable people/organizations **Clients**, and the populated quote editor passed a dark-mode check; whole-app theme/terminology review remains;
- the populated quote editor's rendered names/landmarks/ID/overflow scan is clean, but formal axe/WCAG and keyboard-only end-to-end completion remain;
- destructive undo/confirmation remains inconsistent below the page level;
- production aggregate validation and the attachment-reference audit remain blocked on read-only database access.

No production deployment or destructive cleanup should be inferred from this local completion report.
