# Rainmaker test baseline — 2026-07-10

This records the Phase 0 local baseline at commit `154988e0656c3cfe58cac88c6c661f332a912ae3`. No production actions were executed.

## Passing checks

| Check | Result | Notes |
|---|---|---|
| Unit/policy/migration tests | **Pass** | 25 files passed, 1 skipped; 187 non-database tests passed after the atomic product-workflow slice |
| Isolated quote-storage tests | **Pass** | All 47 database tests run against an in-memory PGlite PostgreSQL socket |
| TypeScript | **Pass** | `npm run check` |
| Production build | **Pass** | Vite, server bundle, and Vercel API bundle completed |
| Responsive accessibility audit | **Pass** | 59 light, dark, public-edge, stored-theme, forced-colors, and 200%-scale-equivalent cases plus 14 dialog/theme states; zero severe axe violations, page overflow, unnamed or invisible sampled focus stops, or theme/scale mismatches; native signing-tree order and full local-fixture keyboard approval/new-quote/existing-edit, fictional product-import, and Sundance insertion flows pass |
| Attached assets | **Pass with inventory note** | 3 tracked assets; none missing; 1 unreferenced; no private-key files |
| Secret scan | **Pass** | 248 files scanned; no findings |
| Preservation script syntax | **Pass** | `scripts/audit-production-preservation.mjs` |
| Authenticated core-route rendering | **Pass** | `/`, `/leads`, `/accounts`, `/quotes`, `/pipeline`, `/products`, `/admin` |
| Live health | **Pass** | HTTP 200 |
| Unauthenticated user boundary | **Pass** | `/api/user` returned HTTP 401 |

The build emits a size warning: the generated fonts chunk is roughly 667 KB before compression. This is a performance item, not a failure.

## Isolated database suite

All 47 tests in `server/tests/quotes.test.ts` now run locally through `npm run test:database:isolated`. They cover quote storage create/read/update/delete, pagination, customer-package relations, source provenance, group recovery, groups/line items, signed-version locking, edit/sign serialization, audit preservation, planning credit, concurrent versioning, transactional dimensional-pricing replacement, exact-band lookup, non-negative price recalculation, exact import targeting, import provenance, all-or-nothing quote/PDF import rollback, conservative returning-inquiry preservation, one-inquiry/one-quote conversion, atomic/idempotent product catalog and Sundance configuration writes, the signature-email delivery lifecycle, redacted stale/failed reconciliation summaries, and idempotent minimized adoption events/summaries.

The suite runs only when:

- `TEST_DATABASE_URL` exists.
- `ALLOW_DATABASE_TEST_WRITES=true`.
- `TEST_DATABASE_URL` differs from `DATABASE_URL`.

The harness restores every checked-in migration into a fresh in-memory PGlite database, exposes it over PostgreSQL's wire protocol, and runs the storage layer through `node-postgres`. The production Neon database module is not imported or changed. The generated local connection is passed only as `TEST_DATABASE_URL`, database writes must be explicitly enabled, and `DATABASE_URL` is removed from the child process.

The first run exposed genuine migration drift: fresh restores still made `quotes.account_id` mandatory although the current schema and production workflow allow unassigned quotes. Migration `0023_allow_unassigned_quotes.sql` repairs the restore path, and the migration test now asserts the column remains nullable. Phase 3B also exposed the retained non-null `products.default_unit_price` compatibility requirement; migration `0026_preserve_legacy_product_price_default.sql` supplies a safe default while current catalog writes keep it synchronized with retail price.

Phase 2A adds migration `0024_add_quote_version_events.sql`, an append-only audit table for version creation and make-current decisions. Phase 3A adds nullable line-source fields in migration `0025_add_line_item_source_identity.sql`; Phase 3B adds the legacy product-price default in migration `0026_preserve_legacy_product_price_default.sql`. Phase 4 adds the inquiry/provenance model in `0027_add_lead_inquiry_history.sql` and the dedicated stage-transition timestamp in `0028_add_deal_stage_timestamp.sql`. Phase 5 adds the signature-request delivery ledger in `0029_add_email_delivery_attempts.sql` and the privacy-minimized business-event ledger in `0030_add_business_events.sql`. The fresh-restore audit reports 25 declared tables and 31 manifest migrations with no missing or duplicate entries.

CI now runs the isolated database suite after the regular safety tests.
CI also runs the responsive accessibility audit after the production build.

## Browser coverage

The repository now has a durable local browser fixture for admin, normal user, public signer, incomplete public package, invalid/expired/archived public links, already-approved public receipt, populated, empty, not-found, auth-error/recovery, quote-specific 403/404/retryable-error states, core data-source failures, a customer-approved quote, configurable-product manual-review pricing, repeat-inquiry lead conversion, account summaries, dashboard stage/markup semantics, populated/error email reconciliation, guarded confirmation recovery, and populated/error adoption evidence. Phases 1A–4D and the Phase 5 admin evidence cards were verified through the Codex in-app Browser. The repeatable audit covers 59 light, dark, public-edge, stored-theme, true forced-colors, and 200%-scale-equivalent route/viewport cases; 14 high-value dialog/theme states; full local-fixture keyboard approval, new-quote, and existing-edit rehearsals with exact request/success proof; and a chooser-capable fictional-PDF review that stops before `/api/quotes/import-batch`. The submit fixtures store nothing and send no email. A separate in-app dark-theme pass covers authenticated core routes at 1280 and compact Products/Pipeline at 390; public signing is explicitly isolated to light. Browser passes found and verified repairs to lead-to-new-quote prefill, required project-name validation, semantic selection/filter controls, persistent section navigation, visible load failures, accessible names, compact header breakpoints, long-client-name containment, theme/forced-colors/zoom contrast, settled dialog contrast, public-signing focus stability, post-upload field labels, exact import-target guards, and redacted truthful admin evidence states. See the linked phase evidence reports.

Remaining browser coverage includes:

- First-time use beyond the empty quote list.
- Failed save/import/upload behavior.
- Human VoiceOver/NVDA interpretation and visual focus/browser-zoom spot checks. Native accessibility-tree signing order, computed focus indicators, full local-only keyboard submit/edit flows, forced-colors, and 200% effective-scale reflow are automated.

The route check deliberately did not click destructive controls, send email, enable signing, import a PDF, create a quote, or change a deal stage.

## PDF/document coverage

Phase 0 now includes a reproducible fictional signed-quote fixture and five rendered page images under [`fixtures/`](fixtures/). The source quote contains grouped taxable/non-taxable items, shipping, discount, tariff, synthetic terms, and test-only signatures. A public-projection test verifies that the fixture does not expose retail price or configuration data.

The visual baseline confirms the current PDF is not yet professional: typed signatures collide with labels/rules, acceptance content is duplicated, the project-details page is unusually sparse, and the line-item footer is crowded. These are Phase 2 regression targets, not an approved customer document.

The fixture contains:

- A clearly fictional account and project.
- Two grouped items, one taxable and one non-taxable.
- Shipping, discount, and tariff examples.
- Test-only customer notes, terms, signatures, cover, logo, and back page.

## Safely reproducible today

- Unauthenticated `/api/user` rejection.
- Admin/sales visibility, empty quote list, not-found, auth-error/recovery, explicit quote-load failures, and valid public-signer rendering.
- 390, 768, 1024, and desktop primary navigation plus the automated core-path accessibility gate.
- Local compile/build/test failures.
- Migration restoration against PGlite.

## Not yet safely reproducible

- Connection failures across the quote storage lifecycle.
- Signed-editor behavior at a verified 390-pixel viewport.
- Real remote-asset failure behavior beyond the deterministic local missing-package fixture.
- Backend role rejection through a real normal-user browser session.
- Transaction rollback for PDF/vision import.

## Test-environment decision

The local/CI default is now the isolated PGlite socket harness. A temporary Neon test branch may still be useful before high-risk migrations that depend on Neon-specific behavior, but it is no longer required for the ordinary quote-storage suite.

## Phase 0 approval gate

Before the first implementation bundle, confirm:

- UI-only removal of Bell, Rep affordances, stale Templates link, and visible Ops surface is complete locally.
- Ops backend/configuration remains gated until the preservation audit runs.
- Signed snapshot mismatch count and backup proof are known before the local signed-version migration is approved for production.
- Unsupported dimensional pricing fails closed rather than using nearest-price fallback.
- Initial capabilities: admin manages products/users/deletes; sales edits unsigned quotes and creates versions; no role may silently override a customer-approved version.
- The fictional PDF fixture is the approved regression input; visual defects remain to be fixed in Phase 2.

No deployment, customer-visible action, or data/compatibility deletion is included in this gate.
