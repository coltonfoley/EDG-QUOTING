# Phase 4D local evidence — daily usability and accessibility

**Date:** 2026-07-10
**Status:** Core responsive, automated severe-accessibility, and authenticated-route theme passes complete locally; manual assistive-technology proof remains
**Scope:** Quote-editor navigation, names/landmarks, form feedback, keyboard controls, client terminology, theme-safe styling, and visible page-load failures

## Outcome

The quote editor now behaves like a navigable work surface instead of one undifferentiated page. Its section navigation stays visible while scrolling, provides touch-sized keyboard-focusable links, and moves among Details, Versions, Line Items, and Review & Approval. The quote has a real page heading and main landmark, autosave state is announced, invalid quote details receive a focused persistent summary, and every rendered interactive element in the fictional populated editor has an accessible name.

The local browser pass also found and repaired a data-quality mismatch: **Project Name** was visually marked required but the client schema accepted an empty value. It is now trimmed and required before any create request can run.

## Changes

- `client/src/pages/quote-builder.tsx`
  - uses a `main` landmark;
  - keeps the semantic section navigation sticky on long quotes;
  - uses 44-pixel minimum section targets and horizontal overflow containment;
  - makes version-history rows stack safely before the desktop breakpoint.
- `client/src/components/quote-header.tsx`
  - adds an `h1` quote title;
  - makes Project Name genuinely required;
  - announces Saved / Unsaved changes / Saving / Save needs attention through a polite status region;
  - renders a focused `role="alert"` error summary instead of relying on a transient toast.
- `client/src/components/line-items-table.tsx`
  - replaces pointer-only product cards with native buttons;
  - names search/filter controls;
  - makes the wide table a named keyboard-focusable horizontal-scroll region.
- `client/src/components/sortable-line-item-row.tsx` and `group-components.tsx`
  - name row inputs, markup controls, collapse, rename, and delete actions;
  - retain keyboard drag sensors and destructive confirmations;
  - replace light-only group styling with theme tokens.
- `client/src/components/quote-importer.tsx` replaces pointer-only PDF choices with pressed-state buttons.
- `client/src/components/address-autocomplete.tsx` gives the nested address input an explicit name in both loaded and fallback modes.
- `client/src/components/app-header.tsx`, `theme-toggle.tsx`, and `pages/quotes.tsx`
  - standardize the durable business entity as **Client** on primary navigation and quote-list surfaces;
  - name the user, theme, and whole-quote delete controls;
  - keep the compact scrollable navigation through 1024 pixels and switch to the full desktop navigation at 1280 pixels, avoiding header overflow.
- `client/src/components/client-combobox-with-create.tsx` truncates long client labels inside the trigger instead of widening the page and gives the control an explicit name.
- `client/src/components/quote-header.tsx`, `quote-summary.tsx`, and `pages/public-sign.tsx` explicitly name the pipeline-stage, estimated-start-date, contract-template, and fullscreen controls.
- `client/src/pages/leads.tsx` replaces status-filter tabs that had no corresponding tab panels with an accurately modeled pressed-button filter group.
- `client/src/pages/products.tsx`, `pages/pipeline.tsx`, `pages/accounts.tsx`, and `components/product-catalog-sections.tsx` replace light-only surfaces with theme tokens, keep Products controls within a 390-pixel viewport, and make each client row reachable through a real keyboard-focusable link.
- Dashboard, Quotes, Pipeline, and Products now use a real `h1` page title. Dashboard progress bars have business-specific accessible names; client/product/pipeline search and filter controls and client deletion have explicit names.
- Pipeline drag behavior now uses a separate named keyboard/pointer drag handle instead of placing a focusable quote link inside a sortable element with button semantics.
- Successful Pipeline stage moves expose a persistent named **Undo stage change** action. Failed moves retain optimistic rollback, moving out of Closed Lost clears the stale lost reason, destructive deletes remain confirmation-gated, and signed commercial changes remain version-gated.
- Products uses an accurately modeled pressed-button section switcher instead of tabs whose controlled panels were outside the tab component. The AI price-sheet drop zone is keyboard reachable and theme safe.
- `client/src/components/app-header.tsx` makes the primary logo readable in both themes.
- `client/src/hooks/use-public-light-theme.ts` isolates public quote and retained planning-agreement signing from an internal user's stored dark preference. Public customer documents deliberately remain light, and the prior staff theme is restored on return to the authenticated app.
- Public approval moves focus to the **Your Approval** heading when the review step changes to signing. If the proposal-preview iframe finishes loading afterward and takes focus, Rainmaker restores focus only when the body or iframe still owns it; it does not interrupt a signer already using the form.
- `client/src/index.css` supplies explicit system-color behavior and focus outlines for Windows High Contrast / forced-colors mode instead of relying on branded foreground/background pairs.
- `client/src/components/error-alert.tsx` adds a reusable page-level failure state with retry.
- Home, Leads, Clients, Quotes, Pipeline, and Products now distinguish retrieval failure from valid empty business data.
- `scripts/serve-browser-fixtures.mjs` adds a fictional `data-error` scenario for local failure-state checks.
- `scripts/audit-browser-accessibility.mjs` runs a durable axe/WCAG, page-overflow, and keyboard-focus gate across 59 route/viewport states plus 14 settled dialog/theme states and full no-write keyboard rehearsals.
- `.github/workflows/ci.yml` runs that gate after the production build so responsive/accessibility regressions fail review before deployment.

## In-app Browser evidence

All browser work used `http://127.0.0.1:4174` with synthetic `example.invalid` data. No production session, customer record, signature, email, or destructive control was used.

Observed on `/quotes/9301/edit` at the available 1280 by 720 browser viewport:

- `mainCount: 1`, `h1Count: 1`, and one named **Quote sections** navigation.
- 73 visible interactive elements and `missingNames: []` after repair.
- `duplicateIds: []` and no images missing `alt`.
- No document-level horizontal overflow; the 11-column line-item table owns its named horizontal-scroll region.
- Clicking **Line Items** produced `#quote-line-items`, scrolled to `scrollY: 1528`, left the section at 16 pixels from the viewport top, and kept the sticky navigation at top 0.
- Product choices rendered as two native `BUTTON` elements with their fictional product names, SKUs, descriptions, and prices in the accessible name.
- Dark theme activated successfully with zero unnamed buttons and no page overflow.

Observed on blank `/quotes/new`:

- The pre-fix fictional submission demonstrated that an empty Project Name passed client validation. The fixture does not persist data and returned no ID.
- After repair, **Create Quote** kept the URL at `/quotes/new`, made no create request, rendered `Quote details need attention — Project name: Project name is required`, and focused `quote-form-error-summary`.

Observed with the fictional `data-error` scenario:

- Quotes displayed **Quotes couldn't be loaded** with explicit loading-failure copy and **Try Again**, rather than the empty quote list.
- Dashboard displayed **Dashboard couldn't be loaded** and refused to show partial/misleading totals.
- Source/policy tests require the same reusable failure boundary and retry hook on Leads, Clients, Pipeline, and Products.

### Formal responsive and automated accessibility pass

The in-app Browser viewport capability rendered the real built fixture at 390, 768, 1024, and 1280 pixels. The pass found and repaired a 39-pixel mobile page overflow caused by a long client label, unnamed select/date/fullscreen controls, a header that expanded the document to 1060 pixels at a 768-pixel viewport, and an invalid Lead Inbox tab relationship.

Final in-app observations:

- 390-pixel Quote Editor: document width exactly 390; compact primary navigation visible; long client trigger contained to 308 pixels; Estimated Start Date has an explicit label.
- 768-pixel Quote Editor: document width exactly 768; compact navigation visible; quote-section navigation fits its 718-pixel content width without page overflow.
- 1024-pixel Quote Editor: document width exactly 1024 with no page overflow.
- 1280-pixel Quote Editor: full desktop navigation visible; compact navigation hidden; document width exactly 1280.
- 390-pixel Lead Inbox: document width exactly 390; one `h1`; seven named pressed-state filter buttons in a named group; zero invalid tab controls.
- A fresh in-app Browser keyboard-focus spot check on the real built quote editor showed the focused **Details** section link with a clearly visible two-pixel dark ring; computed `box-shadow` also reported a two-pixel focus ring. The controlled in-app tab did not change `innerWidth`, `devicePixelRatio`, or `visualViewport.scale` under macOS zoom shortcuts, so this evidence is not mislabeled as an actual browser-zoom test.

The automated `npm run audit:browser:a11y` gate now passes all 59 route/viewport combinations:

- populated Admin, Admin delivery-error, Lead Inbox, Quote Editor, and Public Approval;
- 390x844, 768x900, and 1024x900;
- incomplete-package, invalid-link, expired-link, archived-version, and already-approved public states at 390 and 1024 pixels;
- dark Dashboard, Leads, Clients, Quotes, Pipeline, Products, Admin, and Quote Editor at 390 and 1024 pixels, plus Product Import at 1024 pixels;
- public approval forced to light at 390 and 1024 pixels even when the stored staff preference is dark;
- true `forced-colors: active` rendering for Dashboard, Clients, Pipeline, Products, Quote Editor, and Public Approval at 1024 pixels;
- a 512 CSS-pixel viewport at device scale 2—representing a 1024x900 display at 200% effective scaling—for Admin populated/error, Lead Inbox, Quote Editor, Public Approval, Dashboard, Clients, Pipeline, and Products;
- zero document-level horizontal overflow;
- zero axe violations with critical or serious impact under WCAG 2.0/2.1 A/AA tags;
- keyboard focus moves through at least three distinct named controls per case;
- zero unnamed keyboard focus stops in the sampled traversal.
- zero sampled keyboard focus stops without a computed outline or ring; ordinary controls must match `:focus-visible`, while the embedded PDF preview uses explicit focus-event state because Chromium transfers focus into the iframe document.

The same gate opens seven important dialog surfaces in both light desktop and dark compact layouts—create client, delete client, create product, delete quote, edit workspace access, create client from a quote, and Customer Package Builder—for 14 additional settled visual states. Every dialog has an accessible name, receives focus, remains within the page width, matches the intended theme, and has zero critical/serious axe violations. The pass repaired low-contrast helper/guidance text and the unnamed client-type selector found only after opening these surfaces. Test-only motion suppression ensures contrast is measured after the opening transition reaches its final state.

The same gate performs a full fictional keyboard approval rehearsal at 1024 pixels. Starting from the document, it reaches **Approve & Sign** within five Tab presses, activates it with Enter, confirms focus moves to the new **Your Approval** heading, selects **Type**, enters `Fixture Keyboard Signer`, checks consent with Space, and activates **Approve Proposal**. It verifies the exact signer name/type in one local-only POST, reaches **Proposal Approved**, and confirms the UI recommends download rather than claiming an email was sent. The fixture response is ephemeral, declares `emailSent: false`, and has no database or provider connection.

During that rehearsal the gate also reads Chromium's native accessibility tree through the DevTools Accessibility domain. It reconstructs parent/child reading order and requires **Your Approval** → **Draw** → **Type** → **Type Your Full Legal Name** → consent → **Back** → **Approve Proposal**, with zero unnamed actionable buttons, tabs, textboxes, checkboxes, links, comboboxes, radios, or switches in the tree.

A second keyboard rehearsal opens `/quotes/new`, reaches **Create Quote**, submits the empty form with Enter, proves the persistent **Project name is required** summary receives focus, reaches Project Name by keyboard, and enters `TEST ONLY - Keyboard Quote Readiness`. The new-quote action now sits immediately after the only required field, so final submission is one Tab away instead of forty. The rehearsal activates it, verifies the exact project name in one local-only POST, and reaches the synthetic fixture quote. The fixture response is ephemeral and stores no quote.

A third keyboard rehearsal opens the fictional existing quote, reaches Project Name by keyboard, replaces it with `TEST ONLY - Keyboard Edited Courtyard`, leaves the field to flush autosave, verifies the exact `PUT /api/quotes/9301` payload and visible **Saved** status, and proves the request origin is the local fixture. The fixture returns an ephemeral synthetic response and stores no record.

The gate also performs a chooser-capable, no-import PDF rehearsal with `fixtures/fictional-signed-quote.pdf`. It verifies editable extraction of the fictional client, project, line description, quantity, and unit price; confirms the default customer-unit-price interpretation; proves that add-to-existing and use-existing-client modes remain disabled until an exact target is selected; and runs axe/overflow checks on both Preview & Edit and Import Options. A request observer proves that `/api/quotes/import-batch` is never called.

This is strong regression evidence for the tested core path, not a blanket WCAG conformance certification.

### Whole-app theme pass

The in-app Browser also completed a dark-theme pass over the authenticated Dashboard, Leads, Clients, Quotes, Pipeline, Products, Admin, Quote Editor, Product Import, and Manual Import surfaces at 1280 pixels. Products and Pipeline were additionally checked at 390 pixels. The pass found and repaired an invisible header logo, white Products/Pipeline page roots, low-contrast product/account table text, a pointer-only client row, and compact Products control/header crowding. The final compact Products document width is exactly 390 pixels at a 390-pixel viewport.

Public quote signing was then opened while dark mode was stored. The page rendered in an explicit light theme and returned to staff dark mode after navigating back. The same isolation hook is mounted by the retained planning-agreement signer; that route has source/policy coverage but no populated browser fixture.

Evidence:

- [Dark dashboard and corrected logo](./screenshots/phase4d-dark-dashboard-1280.png)
- [Dark Products at 390 pixels](./screenshots/phase4d-dark-products-390.png)
- [Dark Pipeline](./screenshots/phase4d-dark-pipeline-1280.png)
- [Dark Clients with keyboard link](./screenshots/phase4d-dark-clients-1280.png)
- [Public signer isolated to light](./screenshots/phase4d-public-sign-theme-isolated.png)

## Verification

| Check | Result |
|---|---|
| Ordinary unit/policy suite | Pass — 186 tests; 45 database tests skipped in this command |
| Isolated migrated database suite | Pass — 45 tests |
| TypeScript | Pass |
| Production build | Pass; existing large-chunk warning remains |
| Responsive accessibility audit | Pass — 59 route/viewport combinations, 14 dialog/theme states, and full local-fixture keyboard approval/new-quote/existing-edit rehearsals; zero severe axe violations, overflow failures, unnamed focus stops, theme mismatches, forced-colors mismatches, or zoom-equivalent mismatches |
| Asset, secret, and repository schema audits | Pass |
| Patch formatting | Pass |

## Remaining Phase 4D proof

- Keyboard-only public approval, new-quote validation/creation, and existing-quote edit/autosave are now proven end to end against explicit local-only ephemeral fixtures. No customer signature, email, production quote, or persisted customer action is created.
- Native accessibility-tree reading order and computed focus-indicator checks are automated. A human VoiceOver/NVDA interpretation pass plus visual focus/zoom spot checks remain appropriate before claiming formal accessibility conformance; forced-colors and 200% effective-scale reflow are automated.
- Authenticated core routes and 14 high-value dialog/theme states now pass the automated dark/light review. Truly rare legacy-only surfaces still rely on source/policy coverage rather than a claim of exhaustive visual proof.
- Recovery policy is now explicit: reversible Pipeline stage moves have Undo; failed optimistic moves roll back; ordinary text inputs retain native edit reversal before save and remain directly correctable afterward; signed scope changes require a new version; destructive line/group/quote/version actions retain confirmation rather than a misleading soft-undo promise.
- No customer-visible action, production migration, deployment, or destructive cleanup was performed.
