# Rainmaker Order Approval Drawing Improvement Audit Plan

Date: 2026-06-22

## Source Intent

Jacob asked for a lightweight drawing inside Rainmaker that lets the customer understand what they are getting and sign off on exact ordering dimensions. It should not be a permit, engineering, sealed, or manufacturer shop drawing. The drawing should be the same basic format for Sundance, Brustor, and Azenco and should be simple enough to use for ordering without charging the customer for full shop/design drawings.

His requested information:

- Top-down view only.
- Length and projection/depth.
- Column/post height called out on the columns.
- Frame color.
- Louver color.
- Side wall/enclosure choices, including motorized screen, sliding privacy wall, and Lumon glass wall.
- Lights/accessories.
- Customer signature should approve the exact dimensions/options so EDG can order immediately.
- Ideally this should appear automatically for Sundance, Brustor, and Azenco/Sango-style pergola products and flow into the install agreement/signing package.

## Visual Audit Evidence

Screenshots captured from the local sample quote:

- Quote editor drawing card: `docs/audit-assets/order-approval-drawing-editor.png`
- Customer approval/signing page: `docs/audit-assets/order-approval-signing-preview.png`

The screenshots were used for this audit. The major visual findings below come from the rendered UI, not just source code.

## Current State Summary

The feature is directionally right and covers the core data model. Rainmaker can store an order approval drawing on a quote, render a top-down drawing, block customer approval until the drawing is marked ready, freeze it when an approval link is prepared, and show special customer consent language when an approval drawing is present.

The experience is not yet simple enough for Jacob's intended workflow. It currently feels like a dense internal form with a drawing attached, instead of a clean order approval surface. The drawing itself also needs visual cleanup before it should be trusted as the customer's signed understanding of the order.

## Critical Gaps

### 1. Customer PDF/Preview Reliability Is Not Proven

Observed issue:

- The customer signing page loaded, but the document preview failed locally with: "Document preview not available" and a toast "Failed to generate PDF preview."

Why this matters:

- Jacob's whole request depends on the customer seeing and signing the exact drawing.
- If the signing preview fails, the feature technically records consent but does not deliver the customer-facing proof Jacob wants.

Likely cause:

- In local testing, this was tied to brand asset/PDF preview generation rather than the approval drawing API itself.

Required improvement:

- Make PDF preview generation resilient when brand assets are missing.
- Add a visible fallback that still shows the approval drawing page if decorative assets fail.
- Verify the generated PDF contains the approval drawing in the same package the customer signs.

Acceptance criteria:

- Opening `/sign/:token` for a quote with an approval drawing renders a document preview without errors.
- The preview includes a distinct "Order Approval Drawing" page.
- The approval drawing page includes dimensions, colors, sides/enclosures, post heights, lights, disclaimer, and customer approval language.
- Missing optional brand assets cannot block the document preview.

### 2. The Drawing Is Visually Too Weak For Customer Signoff

Observed issue:

- The drawing is visible and useful, but several labels are hard to read.
- The dimension line reads visually like "16 ft 0 in A 12 ft 0 in" because the Side A label collides with the dimensions.
- Post labels at top corners are cramped or clipped.
- The light label shows "1 other", which is not customer-friendly.
- The louver label says "Louvers projection" rather than "Louvers run with projection."

Why this matters:

- The signed drawing needs to be quickly understandable by a customer and by EDG ordering staff.
- Ambiguous labels create the exact ordering risk this feature is supposed to reduce.

Required improvement:

- Redesign the SVG layout with protected label zones.
- Put dimensions outside the roof rectangle with clear dimension lines/arrows.
- Move Side A/B/C/D labels away from dimensions.
- Format louver direction as plain English.
- Format lights/accessories from `location` and `type`, not just `type`.
- Increase text size for customer-facing drawing labels.

Acceptance criteria:

- At desktop width, no drawing labels overlap.
- At mobile width, the drawing remains readable without horizontal clipping.
- Light/accessory labels say meaningful text such as "LED strip - perimeter", not "1 other."
- Louver direction says "Louvers run with projection" or "Louvers run with length."

### 3. The Workflow Is Too Buried

Observed issue:

- The drawing card appears far down the quote builder after client info, project details, versioning, and line items.
- The feature is easy to miss unless the user already knows to scroll.
- The quote workflow header says the drawing matters, but it does not give the user a direct jump into the drawing section.

Why this matters:

- Jacob's expectation is fast order release. If staff miss the drawing step, they may still prepare a quote without the correct order approval.

Required improvement:

- Add a prominent drawing status summary near the quote header when a supported pergola line is present.
- Add a "Review Order Drawing" jump action from the quote workflow/header.
- In line items, show a clear indicator that the current line triggered the drawing requirement.
- Consider making the drawing card sticky or summary-first once a quote needs it.

Acceptance criteria:

- On a Sundance, Brustor, or Azenco quote, staff can reach the drawing section in one click from the top of the quote.
- The quote header clearly distinguishes: Not Added, Draft, Ready, Sent, Signed, Order Ready.
- A user cannot prepare the approval link while the drawing is Draft/Revision Needed.

### 4. Auto-Create Is Not Fully Implemented

Observed issue:

- The system can infer Sundance, Brustor, and Azenco from manufacturer/description and recommend a drawing.
- It does not fully auto-create the drawing when a qualifying product is added.

Why this matters:

- Jacob specifically liked the idea that Rainmaker could automatically operate when it is Sundance, Brustor, or Azenco.

Required improvement:

- Decide between two explicit behaviors:
  - Auto-create a draft drawing as soon as the first supported pergola line item is added.
  - Or show a blocking, one-click "Create Order Drawing" action before approval link prep.
- Avoid silent auto-creation if it creates clutter for false positives.

Recommended behavior:

- Auto-create draft drawing for catalog products with trusted manufacturer metadata.
- Show a recommendation prompt for imported/manual lines that only match by description.

Acceptance criteria:

- Adding a trusted Sundance, Brustor, or Azenco catalog product creates a draft approval drawing automatically.
- Manual/imported line items show a clear prompt instead of silently creating a drawing.
- The prompt explains that the drawing is for customer order approval, not permit/shop drawings.

### 5. Install Agreement Integration Needs Exact Verification

Observed issue:

- The approval drawing is included in the customer approval/PDF path.
- The exact "install agreement" path should be verified, because Rainmaker has proposal, signature, contract terms, PDF generation, and Ops handoff paths that may not all use the same document composition.

Why this matters:

- Jacob explicitly said the drawing should populate into the install agreement so the signed contract has exact dimensions.

Required improvement:

- Map every document path a customer or Ops team may see:
  - Generate Proposal.
  - Public signing preview.
  - Download approved proposal.
  - Contract/install agreement PDF.
  - Ops handoff contract document.
- Ensure each intended customer-facing path includes the approval drawing once, in the correct position.

Acceptance criteria:

- The signed customer package includes the approval drawing.
- The downloaded approved proposal includes the approval drawing.
- The generated proposal includes the approval drawing when applicable.
- The Ops contract/handoff document either includes the drawing or links/references the signed drawing snapshot.

## UX Simplification Plan

### Phase 1: Make The Drawing Trustworthy

Priority: P0

Tasks:

- Fix light/accessory parsing and display.
- Improve SVG label placement.
- Add explicit dimension callouts with arrows.
- Add a concise "Customer approval drawing only" note directly under the drawing title.
- Add a small summary table beside or below the drawing:
  - Manufacturer/system.
  - Length x projection.
  - Finished height.
  - Frame/louver colors.
  - Enclosures.
  - Lights.

Acceptance tests:

- Visual QA screenshot at desktop and mobile.
- No label collisions.
- A non-technical reviewer can answer: "What are we ordering?" in under 15 seconds.

### Phase 2: Make The Staff Workflow Obvious

Priority: P0

Tasks:

- Add top-of-quote drawing status summary.
- Add a jump button to the drawing card.
- Make the supported-product trigger visible on the line item.
- Improve status labels:
  - Draft: "Needs details"
  - Ready: "Ready for customer approval"
  - Sent: "Customer link prepared"
  - Signed Locked: "Customer approved"
  - Order Ready: "Released for ordering"
- Separate customer-signing readiness from internal order-readiness in plain language.

Acceptance tests:

- From the quote top, staff can find the next drawing action without scrolling.
- Staff can tell why Send to Ops is disabled.
- Staff can tell whether they are waiting on customer approval or internal review.

### Phase 3: Harden Customer Signing And PDF Output

Priority: P0

Tasks:

- Fix PDF preview resilience around brand assets.
- Add a PDF generation test for quotes with approval drawings.
- Add a public signing smoke test that verifies the preview iframe appears.
- Add a fallback PDF page if optional images/assets fail.
- Confirm signing consent references the order approval drawing only when present.

Acceptance tests:

- Public signing preview renders with no console errors.
- PDF page count increases by one when a drawing is included.
- The approval drawing page appears before gallery/renderings and before or near line items, per the intended customer review order.

### Phase 4: Implement Auto-Create / Smart Prompt

Priority: P1

Tasks:

- Add trusted catalog-product detection for Sundance, Brustor, and Azenco.
- Auto-create a draft drawing when a trusted supported product is added and no drawing exists.
- For description-only matches, show a one-click prompt instead.
- Add an audit note when Rainmaker auto-creates the drawing.

Acceptance tests:

- Catalog Azenco product creates drawing automatically.
- Catalog Brustor product creates drawing automatically.
- Catalog Sundance product creates drawing automatically.
- Manual line "Azenco R-Blade" shows prompt rather than silently creating.
- No duplicate drawing is created if one already exists.

### Phase 5: Install Agreement And Ops Handoff Completeness

Priority: P1

Tasks:

- Verify every customer-facing document path includes the approval drawing where expected.
- Add approval drawing summary to Ops payload.
- Attach/reference signed drawing in Ops handoff documents.
- Block Send to Ops until customer-approved drawing is internally reviewed/order-ready, unless an override reason is recorded.

Acceptance tests:

- Ops payload includes dimensions, colors, enclosures, lights, signed status, and snapshot ID.
- Send to Ops remains disabled until signed/order-ready or override released.
- Override path records who/when/why.

## Specific UI Improvements

### Drawing Card

- Replace the large raw form feel with two modes:
  - Edit mode: focused data entry.
  - Review mode: clean approval summary plus drawing.
- In frozen/sent state, show read-only summary first and collapse raw fields behind "Show details."
- Put the preview higher in the card on desktop, not after the entire form.
- Show a "Customer will approve this" banner with the exact disclaimer.

### Drawing Preview

- Move title and dimension line above the drawing with enough space for Side A.
- Use external dimension arrows:
  - Horizontal length across top.
  - Vertical projection/depth on right side.
- Move post height labels outside the rectangle corners.
- Display enclosures directly on the affected side, not only in the legend.
- Format lights from user-facing labels.
- Add "Not for permit/shop drawings" as a footer, but keep it smaller than the order facts.

### Customer Signing Page

- The page should lead with "Review your approval drawing and proposal."
- If PDF preview fails, show a retry plus a visible fallback summary/drawing, not a dead gray panel.
- Keep the order approval drawing consent, but make sure the drawing is visually available before the customer clicks "Approve & Sign."

## Test Plan

Automated:

- Unit test light label parsing/formatting.
- Unit test manufacturer detection for Sundance, Brustor, Azenco, and false positives.
- Integration test approval drawing auto-create behavior.
- PDF generation test that asserts approval drawing content exists.
- Public signing test that asserts approval drawing consent appears only when drawing exists.

Manual visual QA:

- Desktop quote editor, draft drawing.
- Desktop quote editor, ready drawing.
- Desktop quote editor, sent/frozen drawing.
- Mobile quote editor, sent/frozen drawing.
- Public signing review page.
- Public signing sign step.
- Generated/downloaded PDF.

Browser checks:

- No console errors on quote editor.
- No console errors on public signing preview.
- No label overlap in drawing preview.
- Buttons disabled/enabled match the workflow state.

## Recommended Next Build Order

1. Fix customer PDF preview resilience.
2. Fix drawing visual label collisions and light labels.
3. Add top-of-quote status/jump UI.
4. Add auto-create/smart prompt behavior.
5. Verify and harden all install agreement, signed PDF, and Ops handoff document paths.

The current feature is a solid foundation, but it should not be considered finished until the customer can reliably see a clean, readable drawing in the signing package and staff can reach the drawing workflow without hunting through the quote page.
