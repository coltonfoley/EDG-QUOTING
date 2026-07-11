# Rainmaker improvement plan

**Status:** Production release complete and verified on 2026-07-11. All planned technical phases are live; preserved historical/compatibility data remains intentionally untouched. Human VoiceOver/NVDA interpretation and a physical browser-zoom spot check remain documented validation recommendations, not unshipped functionality.
**Created:** 2026-07-10
**Source audit:** [Rainmaker application audit](./README.md)
**Planning baseline:** repository commit `154988e0656c3cfe58cac88c6c661f332a912ae3`
**Estimated program:** 6–9 engineering weeks, delivered as small independently reviewable changes

**Production proof:** [production-release-verification-2026-07-11.md](production-release-verification-2026-07-11.md). Status statements later in this plan describe the pre-release implementation sequence; the production proof supersedes their former rollout gates.

## Outcome

Rainmaker should become a smaller, safer pre-sale source of truth that reliably moves one opportunity through:

> lead or client -> quote family -> priced current version -> customer-approved snapshot

The program is successful when:

1. Retired and owner-confirmed unused controls are gone.
2. A signed quote cannot be silently changed; changes require a new version.
3. The customer preview, signed snapshot, and receipt PDF contain the same intended pricing, contract, groups, and visuals.
4. Catalog selections, groups, dimensions, imports, and totals retain their source data and fail safely.
5. Returning inquiries do not overwrite established customer truth.
6. Users see only actions they are allowed and expected to perform.
7. Production health, errors, tests, and business events make failures visible.

## Decisions already made

These are not open design questions:

- The Ops Portal is retired. Remove `Send to Ops`; do not harden, replace, or expand it.
- Remove the unused Bell, non-functional Rep filter/assignment affordances, and stale Templates link.
- Keep Google Workspace as the only human authentication method.
- Keep Rainmaker focused on pre-sale work. Do not add a replacement post-sale portal in this program.
- Keep quote families and versions as the core commercial model.
- Preserve customer/project data, legacy records, image references, and storage compatibility until read-only reference checks and backup proof support removal.
- New planning-agreement and approval-drawing creation stays retired. Existing records remain compatibility data.

## Non-goals

- Rewriting Rainmaker or changing frameworks.
- Replacing the product catalog or quote-family model.
- Building a new Ops or project-management portal.
- Removing legacy storage, QuickBooks, planning-agreement, drawing, or image data without evidence.
- Redesigning every screen before correctness work is finished.
- Sending customer emails, creating signatures, changing production quotes, or deploying without separate approval.

## Delivery principles

1. **Safety before cleanup.** Inventory and preserve data before removing backend compatibility.
2. **One business behavior per change.** Signed locking, package fidelity, pricing, lead identity, and UI cleanup should be independently reviewable.
3. **Test the boundary, not only the helper.** Public signing must be tested unauthenticated; role behavior must be tested as admin and normal user; database workflows need a real isolated test database.
4. **Current version is explicit.** A quote family must have exactly one current version, and customer-approved versions become immutable.
5. **Failure must be visible.** Do not convert API/load failures into empty pages, fallback quotes, nearest prices, or silently incomplete PDFs.
6. **Local, CI, deployment, and production proof remain separate.** No change is “live” until all required checkpoints pass.

## Program sequence

| Phase | Focus | Duration | Main result | Approval gate |
|---|---|---:|---|---|
| 0 | Read-only safety and baselines | 2–3 days | Evidence needed to change safely | Approve implementation scope |
| 1 | Retired/unused removal and small safety fixes | 3–5 days | Smaller, less misleading surface | Approve production release |
| 2 | Signed quote and customer-document integrity | 7–10 days | One authoritative approved version | Approve migration/behavior change |
| 3 | Catalog, pricing, and import correctness | 7–10 days | Source-linked lines and fail-safe prices/imports | Approve pricing behavior |
| 4 | Lead/client workflow and UX simplification | 5–8 days | Cleaner daily sales workflow | Approve workflow changes |
| 5 | Permissions, observability, and maintainability | 7–12 days | Dependable operation and safer future changes | Approve platform changes |

Estimates assume focused engineering time and exclude waiting for business review, credentials, test data, or deployment approval.

## Phase 0 — Read-only safety and baselines

**Status on 2026-07-11:** complete in production. External production truth, authenticated core-route rendering, Ops dependency evidence, the transaction-enforced read-only preservation audit, ID-level historical-record review, live pricing/attachment aggregate preflight, credential rotation, backup-window verification, preview isolation, production restore checkpoint, migrations, deployment, and the local/CI/security baselines are complete. See [production-release-verification-2026-07-11.md](production-release-verification-2026-07-11.md).

### 0.1 Confirm production truth

**Purpose:** Ensure implementation starts from the real deployed system, not only the local checkout.

Tasks:

- Record exact local commit, GitHub `main`, CI state, and exact Vercel production deployment commit.
- Verify live liveness, authenticated `/api/user`, and the core routes without mutation.
- Save the current route/API inventory and environment-variable names without values.
- Confirm whether any current system, automation, or person still calls the Ops import endpoint.

Deliverable: `production-baseline-YYYY-MM-DD.md` with sources and timestamps.

Acceptance:

- Local, GitHub, Vercel, and live states are explicitly separated.
- Ops retirement has a documented dependency result, not an assumption based only on UI.

### 0.2 Run preservation-first data checks

Read-only queries should produce counts, IDs, dates, and mismatch summaries—not customer content.

Required checks:

- Signed quotes whose current scope/totals differ from `signedDocumentSnapshot`.
- Quote families with zero or multiple current versions.
- Planning agreements and approval drawings by status/recency.
- QuickBooks fields/settings and issue-report table reference counts.
- Quote groups, line items, images, lead attachments, and Blob/storage locators by provider.
- Orphaned groups, line items, image metadata, and object references.
- Any retained Ops job IDs, request logs, environment configuration, or consumer references.

Deliverable: a redacted preservation inventory and backup/checksum status.

Acceptance:

- No writes or cleanup occur.
- Every planned backend deletion has a reference count and preservation decision.

### 0.3 Establish a dependable test baseline

Tasks:

- Provision an isolated disposable test database.
- Run the currently skipped 25 database-backed quote tests.
- Add a minimal browser fixture for admin, normal user, public signer, and empty/error states.
- Record current PDF snapshots for one safe fictional quote.
- Confirm current test, type-check, build, asset audit, and secret audit results.

Acceptance:

- Database tests run in CI without pointing at production.
- A failed quote load, public signing request, and role rejection can be reproduced safely.

### Phase 0 exit gate

Before implementation, approve:

- exact files/data paths allowed to be removed;
- whether any signed quote currently differs from its snapshot;
- pricing behavior for unsupported dimensions;
- role/capability expectations;
- the safe fictional quote used for document/browser verification.

## Phase 1 — Remove retired/unused surfaces and land small safety fixes

### Work package 1A — Remove dead visible controls

**Local status on 2026-07-10:** complete and verified against synthetic admin, sales, public signer, empty, not-found, auth-error, desktop, and 390px fixtures. No production deployment has occurred. See [phase1-ui-cleanup-2026-07-10.md](phase1-ui-cleanup-2026-07-10.md).

Scope:

- Remove **Send to Ops**, the Ops workflow badge/step, its confirmation dialog, and any Ops job-link state from the quote UI.
- Remove the Bell.
- Remove Rep filter/assignment affordances and “Rep feature disabled” copy.
- Remove the stale Templates link.
- Replace developer-facing 404 copy with a normal return action.
- Hide quote/account delete controls from non-admin users.
- Decide and enforce whether normal users may read contract templates.

Primary files:

- `client/src/components/quote-header.tsx`
- `client/src/components/app-header.tsx`
- `client/src/pages/pipeline.tsx`
- `client/src/components/pipeline-card.tsx`
- `client/src/pages/contracts.tsx`
- `client/src/pages/not-found.tsx`
- `client/src/pages/quotes.tsx`
- `client/src/pages/accounts.tsx`
- `client/src/components/quote-summary.tsx`

Acceptance:

- No visible Ops, Bell, Rep, or Templates affordance remains.
- Normal users no longer see admin-only deletes.
- The quote workflow ends at customer approval/signature.
- Desktop and 390px navigation remain usable.

Recommended PR boundary: one UI-only removal PR with screenshots and role checks.

### Work package 1B — Retire the Ops backend

**Local status on 2026-07-10:** complete and verified after the read-only dependency and preservation checks. The callable route, integration modules, environment template/validation, and send-behavior tests are removed locally. Historical customer/project records, internal notes, drawings, agreements, signed snapshots, documents, and stored assets remain unchanged. Production environment variables remain untouched until an approved release. See [phase1b-ops-backend-retirement-2026-07-10.md](phase1b-ops-backend-retirement-2026-07-10.md).

Start only after Phase 0 proves no remaining consumer or required record dependency.

Scope:

- Remove `/api/quotes/:id/send-to-ops`.
- Remove `server/integrations/operations*.ts` and Ops-only document generation.
- Remove Ops-only environment variables, validation, tests, scripts, and documentation.
- Preserve unrelated internal notes, quote fields, documents, and customer/project data.
- Do not introduce a replacement destination.

Acceptance:

- Repository search finds no callable Ops import path or active configuration.
- Tests/build pass without the retired integration dependencies.
- No database or Blob deletion is included.

Recommended PR boundary: separate backend retirement PR for easy rollback/audit.

### Work package 1C — Small high-confidence safety fixes

**Local status on 2026-07-10:** complete and verified with unit/policy tests, the isolated database suite, type-check, production build, and synthetic in-app Browser scenarios. No production data, customer action, deployment, or compatibility-path removal occurred. See [phase1-safety-fixes-2026-07-10.md](phase1-safety-fixes-2026-07-10.md).

Scope:

- Hash the complete decoded image bytes for vision cache keys, or disable the cache.
- Remove arbitrary `status` from generic legacy planning-agreement PATCH.
- Clarify legacy planning credit as a separate amount-due adjustment that does not rewrite taxable line items, tax, discount, or the displayed quote Total. Preserve the existing legacy customer-document behavior until production reference checks permit a larger change.
- Fix auth-error recovery and suppress raw HTML/JSON parse details.
- Render an explicit QuoteBuilder error instead of a blank fallback quote.

Acceptance:

- Two images with the same prefix and different bodies cannot share a cache entry.
- Legacy status changes must use guarded transition routes.
- `/quotes/:id/edit` shows distinct 403, 404, retryable error, and loading states.
- “Go to Login” exits the auth error state.

Recommended PRs: cache fix, legacy transition guard, and UI error states as separate changes.

## Phase 2 — Signed quote and customer-document integrity

**Local status on 2026-07-10:** Work packages 2A–2C are implemented and verified locally. Storage transactions enforce signed-version immutability, version decisions are audited, the signed editor is read-only, review/signature/receipt use one token-scoped package and frozen snapshot, and one Customer Package Builder now owns preview and approval configuration. See [phase2-signed-lock-boundary-2026-07-10.md](phase2-signed-lock-boundary-2026-07-10.md), [phase2-signed-immutability-2026-07-10.md](phase2-signed-immutability-2026-07-10.md), [phase2-customer-package-2026-07-10.md](phase2-customer-package-2026-07-10.md), and [phase2-package-consolidation-2026-07-10.md](phase2-package-consolidation-2026-07-10.md). Nothing was committed, pushed, deployed, or run against production data. Production rollout remains gated by the read-only preservation inventory, backup evidence, explicit approval, and the full deployment proof chain.

### Work package 2A — Make signed versions immutable

**Status:** complete locally; production rollout not approved.

Required behavior:

- After customer signature, block changes to account, scope, financial fields, contract terms, line items, groups, and document-package options.
- Company signing must not reopen customer-approved scope.
- The only change path is **Create New Version**.
- A new version copies scope, resets all signatures/tokens/snapshots, and becomes the sole current version transactionally.
- Direct “make current” actions must show signature-aware warnings and create an audit event.

Backend acceptance:

- Update/create/delete/reorder endpoints return a clear conflict for signed versions.
- Database tests cover quote fields, line items, groups, package options, current-version invariants, and concurrent attempts.
- Exactly one current version exists per family after every version operation.

UI acceptance:

- Signed quotes are clearly read-only.
- The user sees why editing is blocked and can create a new version without losing context.
- Signed and current/new-version states are visually unambiguous.

Recommended PR boundary: backend lock/invariants first, UI read-only/version workflow second.

### Work package 2B — Build one authoritative customer package

**Status:** complete locally; production rollout not approved.

Scope:

- Put included groups, group ordering, rendering references, contract content, pricing options, and drawing compatibility data into the token-scoped public DTO/snapshot.
- Stop public pages from calling authenticated quote/group/rendering routes.
- Generate preview and receipt/download from the same snapshot-backed package.
- Treat missing required assets as a visible package error, not an empty success.
- Preserve the current opt-in drawing behavior for legacy records.

Acceptance matrix:

| State | Must verify |
|---|---|
| Before signature | Preview shows selected pricing, groups, terms, and visuals |
| At signature | Stored snapshot contains exactly the reviewed package |
| After signature | Receipt PDF matches the stored snapshot |
| Unauthenticated | No internal authenticated route is called |
| Missing asset | Clear error/fallback is shown and logged |

Recommended PR boundary: public DTO/API tests first, client/PDF renderer second, visual-regression evidence third.

### Work package 2C — Consolidate package configuration

**Status:** complete locally; production rollout not approved.

After package correctness is proven:

- Replace Proposal Generator and Approval Options with one package builder.
- Use one set of include/exclude controls and one authoritative preview.
- Standardize proposal/approval/signature/contract language.
- Keep internal notes visibly separate from customer-facing terms.

Acceptance:

- A user never has to choose between two places to configure the same document.
- Preview, signing link, and receipt share the same configuration object.

## Phase 3 — Catalog, pricing, and import correctness

**Local status on 2026-07-10:** Work packages 3A–3C are implemented and verified locally. Catalog/group source identity is preserved, dimensional prices now require exactly one valid band, pricing-table replacement is transactional, the restored legacy product-price requirement is preserved, and quote/PDF import is now one all-or-nothing transaction with explicit target and price semantics. See [phase3-catalog-source-identity-2026-07-10.md](phase3-catalog-source-identity-2026-07-10.md), [phase3-dimensional-pricing-2026-07-10.md](phase3-dimensional-pricing-2026-07-10.md), and [phase3-transactional-quote-import-2026-07-10.md](phase3-transactional-quote-import-2026-07-10.md). No production pricing or import data was read, transformed, or written.

### Work package 3A — Preserve line-item source identity

**Status:** complete locally; production migration not approved.

Scope:

- `Add From Catalog` must persist `productId`, SKU, manufacturer, configuration/dimensions, color, unit, and price-source metadata.
- `Add Item to Group` must persist the intended `groupId`.
- Keep custom items explicitly custom.
- Add confirmation or undo for line/group deletion.

Acceptance:

- Reloading the quote preserves product/group relationships.
- Product-linked lines can be distinguished from custom lines.
- Reordering and grouping remain correct after refresh/version copy.
- Keyboard users have a non-pointer reorder path.

### Work package 3B — Make dimensional pricing fail safely

**Status:** complete locally and aggregate-preflighted against production read-only. The live configuration contains 912 bands across both configurable products with no missing product table, invalid range, negative price, or inclusive overlap. Production rollout is not approved.

Business decision applied locally: exact supported-range coverage with no tolerance or nearest-band fallback. Any future tolerance requires a separate explicit rule and boundary tests.

Scope:

- Reject dimensions outside all configured bands by default.
- Validate no inverted, overlapping, duplicate, or ambiguous bands.
- Replace pricing tables transactionally.
- Prevent negative recalculated costs.
- Show “manual review required” rather than returning a plausible nearest price.

Acceptance:

- In-range dimensions return exactly one deterministic band.
- Out-of-range, gap, overlap, and invalid-range tests fail visibly.
- A failed bulk upload leaves the previous table intact.

### Work package 3C — Make quote/PDF import transactional and explicit

**Status:** complete locally; a chooser-capable local browser rehearsal now verifies the fictional PDF's editable review values, default price meaning, exact quote/client target guards, responsive accessibility, and zero final import requests. Production rollout is not approved.

Scope:

- Honor the customer/quote explicitly selected by the user.
- Use extracted matching only when no explicit target was supplied.
- Wrap account/quote/line creation in a transaction.
- Roll back fully on failure.
- Clarify whether imported prices are supplier cost or customer price.
- Make “Preview & Edit” line items actually editable, or rename the step.
- Preserve source-document and extraction-confidence metadata without logging customer content.

Acceptance:

- A failed import creates zero partial business records.
- Explicit customer selection cannot be overridden by extracted text.
- Two different documents cannot share vision-cache output.
- Imported totals and source-price semantics are explained before save.

## Phase 4 — Lead/client workflow and UX simplification

**Local status on 2026-07-10:** Work packages 4A–4C are implemented and verified locally. Returning submissions append inquiry history without overwriting established client identity, one inquiry can transactionally create only one linked quote, lead/account quote actions carry the client into the editor, account counts use current quote families, and dashboard monthly/markup metrics now use explicit business semantics. The in-app Browser exposed and verified a repair to the new-quote prefill path. Work package 4D's automated responsive/accessibility, authenticated-route theme, forced-colors/zoom-equivalent, keyboard workflow, and destructive/reversible recovery scope is complete; manual assistive-technology validation remains. See [phase4-lead-client-workflow-2026-07-10.md](phase4-lead-client-workflow-2026-07-10.md) and [phase4d-usability-accessibility-2026-07-10.md](phase4d-usability-accessibility-2026-07-10.md). No production data was read or written, and no migration, quote, customer action, or deployment was executed in production.

### Work package 4A — Stop inquiry intake from overwriting accounts

**Status:** complete locally and aggregate-preflighted against production read-only. Preservation counts and attachment references are validated: the single active attachment retains its account and Vercel Blob links; its historical submission ID predates the retry ledger and remains preserved through the account compatibility path. A named Neon child branch from current `main` as the manual restore checkpoint, migration approval, and rollout remain pending.

Recommended staged approach:

1. Immediate conservative merge: never regress lead status or replace established identity/contact fields automatically.
2. Add append-only `inquiries`/`lead_submissions` records linked to an account.
3. Move message, source, received date, project type, attachments, and submission metadata to the inquiry.
4. Keep account as durable customer identity.

Migration acceptance:

- Existing accounts and lead history remain readable.
- Repeated-email submissions create new inquiry history without replacing the account.
- Attachment ownership and access remain intact.
- Migration has backup, dry-run counts, and rollback steps.

### Work package 4B — Create a real lead-to-quote conversion path

**Status:** complete locally; production rollout not approved.

Scope:

- Add **Create Quote** from a lead/account with client preselected.
- Persist source inquiry and conversion timestamp.
- Define when status becomes qualified versus converted.
- Do not require users to re-find the same client in QuoteBuilder.

Acceptance:

- New quote opens with the correct account and source inquiry.
- Conversion is auditable and does not erase prior statuses/messages.
- Approval-email readiness is visible before the user reaches the email action.

### Work package 4C — Repair account and dashboard truth

**Status:** complete locally; production aggregate validation and rollout not approved.

Scope:

- Server-backed account search/filter/counts.
- Count quote families/current projects, not version rows.
- Define “Won This Month” from a dedicated stage-transition date, not generic `updatedAt`.
- Rename markup-derived “Profit” metrics or implement an agreed net-profit definition.
- Document metric definitions in the UI.

Acceptance:

- Totals do not change merely because the user paged the list.
- Editing an old won quote does not make it newly won.
- Every dashboard metric has a single documented formula.

### Work package 4D — Daily usability and accessibility

**Status:** automated responsive/accessibility and authenticated-route theme scope complete locally. Mobile/compact navigation, semantic sticky QuoteBuilder section navigation, visible core page-load failures/retry, client terminology, real page headings, required Project Name validation, named/focusable filters and progress indicators, a separate keyboard drag handle, keyboard line reordering, save/error announcements, theme-safe quote grouping, explicit forced-colors behavior, 200% effective-scale reflow, stable public-signing focus, and explicit recovery semantics are present. In-app rendering passes at 390, 768, 1024, and 1280 pixels. The durable axe/overflow/focus audit now passes 59 light, dark, public-edge, stored-theme, forced-colors, and zoom-equivalent route/viewport combinations plus 14 high-value dialog/theme states with zero critical or serious violations, page overflow, unnamed sampled focus stops, or theme/forced-colors/zoom mismatches. Full keyboard-only rehearsals cover fictional local-fixture public approval, new-quote validation/creation, and existing-quote edit/autosave with exact local payload and success-state proof; the fixtures store nothing and send no email. Reversible Pipeline stage moves now expose Undo, failed moves roll back, signed changes use versions, and destructive changes remain confirmation-gated. Manual screen-reader/focus review and a human browser-zoom spot check remain open; truly rare legacy-only surfaces are not claimed as exhaustively reviewed. See [phase4d-usability-accessibility-2026-07-10.md](phase4d-usability-accessibility-2026-07-10.md).

Scope:

- Add mobile navigation.
- Break QuoteBuilder into navigable sections without changing underlying truth.
- Add page-level loading/empty/error/retry states.
- Standardize Account/Client/Customer terminology.
- Keep dark mode after the authenticated core-route theme pass; retain explicit light presentation for public customer signing.
- Replace clickable `div`/SVG controls with semantic controls.
- Add accessible names, keyboard reorder, focus/error checks, and destructive undo/confirmation.

Acceptance:

- Core lead -> quote -> approval path works at 390, 768, 1024, and desktop widths.
- Keyboard-only completion is possible.
- Automated accessibility checks have no critical violations on core routes.

## Phase 5 — Permissions, observability, and maintainability

**Local status on 2026-07-10:** Phase 5 has verified permissions, migration/readiness, redacted-logging/request-correlation, signature-request retry safety, operator reconciliation, guarded confirmation-receipt recovery, privacy-minimized adoption evidence, and targeted behavior decomposition. EDG approved the two-role `user`/`admin` capability policy, a shared quote workspace, administrator-only historical-version override and retained-record resolution, and Vercel-only on-demand error review. False quote-ownership checks are now honest existence/selection checks, and retired planning-record mutation is an admin-only compatibility path. Request-time DDL was replaced by read-only schema assertions backed by the checked-in migration sequence; `/health` remains liveness and `/ready` now checks the database and declared schema. Routine customer payloads and public tokens were removed from changed logging paths. Application responses expose an opaque `X-Request-Id`, unhandled 500s no longer return internal exception text, and the UI no longer claims an unimplemented error notification. Quote approval requests, retained admin-only planning requests, and automatic confirmation receipts now use a durable idempotency ledger with provider-message evidence and safe replay behavior. Redacted admin evidence surfaces failed/stale attempts; approval requests and ambiguous pending records have no resend, while an exact failed quote confirmation can be retried only by an administrator after a visible send confirmation and server-side fingerprint match. Recorded feature counts explicitly begin after deployment and zero is never presented as historical non-use. Product catalog import and Sundance Builder insertion now have server-authoritative minimized adoption events; weaker client-only clicks remain intentionally unmeasured. Broad module splitting is intentionally deferred; the bounded Phase 5D extraction is complete. See [phase5-permissions-baseline-2026-07-10.md](phase5-permissions-baseline-2026-07-10.md), [phase5-schema-readiness-2026-07-10.md](phase5-schema-readiness-2026-07-10.md), [phase5-redacted-logging-2026-07-10.md](phase5-redacted-logging-2026-07-10.md), [phase5-email-delivery-evidence-2026-07-10.md](phase5-email-delivery-evidence-2026-07-10.md), [phase5-email-reconciliation-2026-07-10.md](phase5-email-reconciliation-2026-07-10.md), [phase5-confirmation-recovery-2026-07-10.md](phase5-confirmation-recovery-2026-07-10.md), [phase5-adoption-evidence-2026-07-10.md](phase5-adoption-evidence-2026-07-10.md), [phase5-product-workflow-evidence-2026-07-10.md](phase5-product-workflow-evidence-2026-07-10.md), [phase5-error-reporting-decision-2026-07-10.md](phase5-error-reporting-decision-2026-07-10.md), and [phase5d-targeted-decomposition-2026-07-10.md](phase5d-targeted-decomposition-2026-07-10.md). No production database, email provider, reporter, alert, role, or application deployment was changed.

**Phase 5C addendum:** Product catalog import and Sundance Builder insertion now use stable client-attempt IDs and commit their writes plus a minimized adoption event atomically. This closes the server-authoritative product-import/configurator adoption gaps; weaker client-only preview/download, BOM-download, dark-mode, and contract-template click evidence remains intentionally unmeasured pending an owner-approved policy. See [phase5-product-workflow-evidence-2026-07-10.md](phase5-product-workflow-evidence-2026-07-10.md).

### Work package 5A — Define capabilities

**Status:** complete locally with EDG approval. Rainmaker keeps only `user` and `admin`; quotes remain shared; users may create/edit unsigned quotes, create versions, and manage customer approval links; administrators alone may override the current historical version, manage catalog/settings, delete whole records, and resolve retained legacy records. False ownership checks are removed, retired planning/finance mutations are admin-only, and public compatibility signing remains. See [phase5-permissions-baseline-2026-07-10.md](phase5-permissions-baseline-2026-07-10.md).

Start with a business-approved matrix. Likely capabilities:

- sales editing;
- manager approval/version override;
- finance/payment/waiver actions;
- contract-template administration;
- product/pricing administration;
- user administration.

Acceptance:

- UI visibility and server enforcement match.
- `validateQuoteOwnership` is replaced by a real authorization rule or honestly named existence check.
- High-consequence actions create an actor/time/reason audit event.

### Work package 5B — Move schema changes out of request paths

**Status:** complete locally. `server/db.ts` contains no DDL; former compatibility helpers perform a cached read-only schema assertion, the migration manifest restores in isolation, `/ready` checks database/schema state, and future production verification requires readiness. The read-only production preservation proof, managed database connection, six-hour PITR window, credential rotation, and preview isolation are complete. A named Neon child branch from current `main` remains required immediately before an approved production migration as the manual restore checkpoint.

Scope:

- Convert `ensure*` DDL into reviewed migrations.
- Add deployment migration verification.
- Remove request-time `ALTER TABLE`/`CREATE TABLE` behavior.
- Add a real readiness endpoint that loads the app and performs a bounded database check; keep `/health` as liveness.

Acceptance:

- Read requests never mutate schema.
- Liveness and readiness are distinct in deployment verification.
- Migration state is visible and repeatable in CI/staging.

### Work package 5C — Add dependable operational evidence

**Status:** complete for the approved local scope. Direct routine content and public signing tokens are redacted, opaque request IDs are attached to application/direct-health responses and routine logs, unhandled 500s are sanitized, and the false notification claim is removed. Quote and retained planning signature-request emails use a durable idempotency ledger, so automatic retries cannot send uncontrolled duplicates. Automatic signature confirmations now use the same ledger; a failed core-quote receipt has a fingerprint-bound, admin-only, explicitly confirmed retry while request emails and ambiguous pending records remain non-retryable. Successful package preparation, signatures, lead conversion, quote import, product catalog import, Sundance Builder insertion, and exact dimensional pricing append minimized events; existing email/version ledgers feed a read-only 30-day admin summary. The UI says counts begin only after deployment and refuses to treat zero or a ledger failure as historical non-use. EDG approved Vercel Runtime Logs/Observability as the only error destination, reviewed by Codex on request and during approved releases with Colton as the human escalation/approval owner. This is explicitly not proactive monitoring. Optional true asynchronous outbox, weaker client-only click evidence, cross-service tracing, and production evidence are outside the approved local scope or remain production-gated. See [phase5-email-delivery-evidence-2026-07-10.md](phase5-email-delivery-evidence-2026-07-10.md), [phase5-email-reconciliation-2026-07-10.md](phase5-email-reconciliation-2026-07-10.md), [phase5-confirmation-recovery-2026-07-10.md](phase5-confirmation-recovery-2026-07-10.md), [phase5-adoption-evidence-2026-07-10.md](phase5-adoption-evidence-2026-07-10.md), [phase5-product-workflow-evidence-2026-07-10.md](phase5-product-workflow-evidence-2026-07-10.md), and [phase5-error-reporting-decision-2026-07-10.md](phase5-error-reporting-decision-2026-07-10.md).

Scope:

- Structured request IDs and redacted error logs.
- Stop logging raw quote/account request bodies.
- Add error reporting with clear ownership.
- Add append-only events for quote versions, package preparation, signature email, signatures, and lead conversion. **Complete locally through the minimized business-event ledger plus the existing specialized version/email ledgers.**
- Add an email outbox/idempotency pattern so retryable sends are safe and ambiguous provider/audit outcomes stop for reconciliation. **Signature requests, confirmation receipts, operator reconciliation, and guarded failed-quote-confirmation recovery are complete locally; a true asynchronous outbox remains an optional larger design.**
- Add a minimal adoption view for imports, proposals, signing, and pricing tools. **Complete locally for package preparation, quote/PDF import, product catalog import, Sundance Builder insertion, signing, approval-email acceptance, versioning, lead conversion, and exact dimensional pricing; client-only downloads/previews, BOM downloads, dark-mode use, and contract-template use remain intentionally unmeasured pending a weaker-click evidence policy.**

Acceptance:

- Error boundary no longer claims notification unless reporting actually occurs.
- Customer content is not present in routine logs.
- Email retry cannot send uncontrolled duplicates.
- Feature-use claims can be based on durable events rather than code presence.

### Work package 5D — Decompose only after behavior is protected

**Status:** targeted local package complete. Signed mutation policy, public package/snapshot construction, transactional import, pricing validation, inquiry conversion, email idempotency, quote confirmation delivery, minimized events, and request redaction now have bounded modules backed by focused tests. Broad splitting of `storage.ts`, `quoteRoutes.ts`, or QuoteBuilder is intentionally deferred until a real behavior change supplies a smaller contract. See [phase5d-targeted-decomposition-2026-07-10.md](phase5d-targeted-decomposition-2026-07-10.md).

Candidate boundaries:

- quote version/lifecycle service;
- pricing calculation service;
- package/snapshot service;
- import service;
- storage repository modules;
- smaller QuoteBuilder sections.

Do not start with broad file splitting. Extract only when tests prove the behavior being moved.

## Recommended pull-request sequence

| PR | Scope | Depends on | Deploy separately? |
|---:|---|---|---|
| 1 | Remove retired/unused visible controls and align role visibility | Phase 0 baseline | Yes |
| 2 | Retire Ops backend/config/docs/tests | Ops dependency check | Yes |
| 3 | Full-byte vision cache key | None | Yes |
| 4 | QuoteBuilder/auth/404 error states | Browser fixture | Yes |
| 5 | Signed-version backend lock and family invariants | Test DB | Yes |
| 6 | Signed read-only/new-version UI | PR 5 | Yes |
| 7 | Public token-scoped package DTO | Safe fixture quote | Yes |
| 8 | Public preview/receipt renderer parity | PR 7 | Yes |
| 9 | Product/group identity preservation | Test DB | Yes |
| 10 | Dimensional pricing validation/transaction | Pricing decision | Yes |
| 11 | Transactional quote/PDF import | Import semantics decision | Yes |
| 12 | Conservative lead merge | Read-only lead analysis | Yes |
| 13 | Inquiry model migration | PR 12 + backup/dry run | Yes |
| 14 | Lead/account -> quote conversion | PR 13 | Yes |
| 15 | Account/dashboard metric truth | Metric definitions | Yes |
| 16 | Unified proposal/approval package UI | PRs 7–8 | Yes |
| 17 | Mobile/accessibility/destructive recovery | Stable core workflow | Can be grouped carefully |
| 18 | Capability model | Role matrix | Yes |
| 19 | Migrations/readiness/logging/events | Stable domain tests | Split into smaller PRs |

## Verification contract for every implementation PR

### Before change

- Confirm repo root, branch, remote, commit, and dirty state.
- Preserve unrelated user changes.
- Identify whether the change touches customer-visible or live-data paths.
- Record the rollback strategy.

### Local proof

- Focused unit/integration tests for the behavior.
- Database tests when persistence changes.
- `npm run check` and `npm run build` when appropriate.
- Browser check with fictional data for affected routes/states.
- PDF render comparison when documents change.
- `git diff --check` and secret/asset audits when relevant.

### Production release proof

Only after explicit deployment approval:

1. exact commit hash;
2. GitHub Actions success;
3. Vercel deployment `Ready`;
4. live liveness;
5. live readiness;
6. authenticated `/api/user` when relevant;
7. browser verification of the affected flow;
8. rollback checkpoint and post-release error review.

## Suggested first implementation bundle

After Phase 0 approval, start with three separate low-coupling changes:

1. Remove visible Ops/Bell/Rep/Templates controls and align delete visibility.
2. Fix the vision-cache key.
3. Add QuoteBuilder/auth/404 error states.

These reduce risk and confusion without a schema migration. Do **not** combine signed-version locking, public package changes, lead-model migration, or pricing-table replacement into that first bundle.

## Plan completion criteria

This improvement program is complete when:

- Rainmaker contains no retired Ops path or owner-confirmed unused visible controls.
- Signed versions are immutable and new versions are the only change mechanism.
- Customer package preview, snapshot, and receipt are identical in included content.
- Catalog/group identity and price provenance survive reload/versioning.
- Unsupported prices and failed imports stop visibly without partial data.
- Inquiry history no longer overwrites customer identity.
- Account/pipeline/dashboard metrics use documented full-dataset semantics.
- Roles, UI controls, and backend authorization agree.
- Core routes work on mobile and keyboard.
- Database workflows run in CI, production has real readiness/error evidence, and future “unused” claims can be measured.
