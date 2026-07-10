# Rainmaker Order Approval Drawing Feature Plan

Research date: June 22, 2026

## Short Summary

Jacob wants Rainmaker to create a lightweight, customer-facing order approval drawing for louvered roof / pergola quotes. The drawing should be the same general format for Sundance, Brustor, and Azenco. It should show the customer what EDG intends to order: top-down layout, exact dimensions, frame/louver colors, wall/enclosure options, lights, and column/post heights where needed.

This is not a permit, engineering, or shop drawing feature. If a customer needs permit-ready or shop drawings, that remains a separate paid Design + Planning scope. This feature is for order approval inside the quote/install agreement so the signed proposal locks the dimensions and selected options before EDG orders.

## Corrected Feature Notes

- The manufacturers are Sundance, Brustor, and Azenco.
- "Sango" should not be treated as a separate manufacturer in the feature model.
- The customer-facing drawing model should be manufacturer-neutral.
- Manufacturer selection can be stored for EDG/order context, but the required drawing fields should not fork by manufacturer.
- The drawing should appear in the signed proposal/install agreement, not in a separate customer portal.
- No elevation drawing is required for the MVP.
- A top-down, high-level perspective drawing can include post/column height labels instead of a separate elevation view.

## Current Repo Grounding

Repository state checked before planning and again after cleanup:

- Repo root: `/Users/coltonfoley/Documents/Codex Projects/Rainmaker EDG Quoting/EDG-QUOTING`
- Remote: `https://github.com/coltonfoley/EDG-QUOTING.git`
- Branch during latest review: `codex/rainmaker-security-stabilization`
- Commit during latest review: `b25f8594a20b6e7117c91cdd9efb9ec3971fd9c7`
- Worktree after cleanup: only this plan doc was untracked.
- Node engine is `22.x` in `package.json`.

Rainmaker already has the important rails this feature should reuse:

- Quote schema and signed proposal state: `shared/schema.ts`
- Quote detail fetching, versioning, signing, and signed snapshots: `server/storage.ts`, `server/routes/quoteRoutes.ts`
- Signed quote fingerprinting via `signedDocumentSnapshot` and `signatureAuditTrail`
- Design + Planning Agreement flow: `planning_agreements`, `server/routes/planningAgreementRoutes.ts`, `client/src/components/planning-agreement-panel.tsx`
- Proposal PDF generation: `client/src/lib/generate-signed-pdf.ts`, `client/src/lib/pdf-branded-sequence.ts`, `client/src/lib/pdf-sections.ts`
- Customer signing preview: `client/src/pages/public-sign.tsx`
- Ops handoff payload: `server/integrations/operationsPayload.ts`

The cleanest implementation is a first-class, quote-version-owned approval drawing record that is pulled into the quote detail, rendered in the quote builder, and included in the signed quote snapshot/PDF. It should not be resolved from a quote family in a way that lets a signed or archived version display a newer drawing.

## Specialist Review Corrections

Two read-only specialist reviews were run after the initial plan. The main corrections to carry into implementation are:

- Customer approval and internal order readiness are separate states. A signed drawing proves the customer approved the shown dimensions/options; it does not automatically mean the job is internally ready to release for ordering.
- The signing flow builds public quote data live until the customer signs today. The implementation must freeze a sanitized approval drawing snapshot when the signing package is prepared, signature email is sent, or EDG/company signature is applied, then reject edits unless a revision/new quote version is created.
- The approval drawing must be owned by the exact `quote_id`/version. `quote_family_root_id` can be stored only for grouping/search.
- Default side labels should be `A/B/C/D`, with a reference side such as "A = house/wall side". Compass directions should be optional metadata, not the primary customer-facing model.
- Ready fields need to be broader than dimensions/colors/sides: include reference side, mount type, height/clearance basis, post data, louver direction, enclosure span/height where applicable, lights/accessories, field verification, and no `TBD` values.
- The public signing payload must include only the public drawing subset and exclude internal notes/order-source data.
- Ops payload and Ops-generated documents are server-side paths. Add drawing summaries there without importing client PDF/rendering helpers into server code.

## Manufacturer Research Notes

These sources support the field set Jacob described:

- Sundance describes a motorized louvered roof with remote-controlled slats, made-to-measure/customized systems, color choices, and accessories such as accent lighting, retracting solar shades, ceiling fans, outdoor sound/audio, heating/cooling, glass sliding panels, lighting, gutter screens, and motorized screens.
  - https://sundanceoutdoorliving.com/faqs-about-modern-smart-pergolas/
  - https://sundanceoutdoorliving.com/wp-content/uploads/2024/05/Sundance-Outdoor-Living-Technical-Data.pdf
- Brustor B200 (XL) supports rotating louvers, integrated screens, dimensions, RAL colors, 16 cm or 21 cm louvers, connected layouts, and many configuration options. Brustor also points users to a 3D simulator, which reinforces that a simple approval layout is useful but should not pretend to replace manufacturer/order tooling.
  - https://www.brustor.com/en-us/products/product-types/patio-covers/louvered-roof-pergolas/b200-xl
  - https://www.brustor.com/en-us/products/product-types/patio-covers/louvered-roof-pergolas
  - https://www.brustor.com/en-us
- Azenco R-BLADE is a motorized louvered pergola with color palette, lighting/privacy accessories, motorized screens, wall-mounted/free-standing/multi-zone configurations, custom dimensions, weather automation, and official note that permit requirements vary by location.
  - https://azenco-outdoor.com/r-blade/
  - https://azenco-outdoor.com/pergolas/
  - https://azenco-outdoor.com/custom-pergola-drawings/
- Glass wall options should be captured generically as an enclosure type on a side, not as a manufacturer-specific drawing engine or vendor-branded option.

Conclusion: a universal top-down approval drawing can cover the shared approval-level facts across Sundance, Brustor, and Azenco without becoming a manufacturer-specific configurator.

## Product Boundary

Build:

- One quote-level approval drawing/spec block for louvered roof orders.
- One top-down diagram renderer.
- One signed proposal/PDF section.
- Internal status tracking so staff know whether the drawing is draft, ready, signed, revised, or superseded.
- Internal order-readiness tracking so staff know whether a customer-approved drawing has also been reviewed for release to ordering/Ops.
- A clear disclaimer that this is an order approval layout, not a permit/shop/engineering drawing.

Do not build in the MVP:

- CAD export.
- Permit or engineering calculations.
- Elevations.
- Manufacturer-specific order forms.
- Price calculations.
- Customer portal/dashboard.
- Automatic vendor ordering.
- Automatic Ops handoff actions beyond including the signed approval data in the existing handoff payload.

## Recommended Data Model

Add a new table in migration `0017_add_quote_approval_drawings.sql`.

Suggested table: `quote_approval_drawings`

Fields:

- `id serial primary key`
- `quote_id integer not null references quotes(id) on delete cascade`
- `quote_family_root_id integer references quotes(id) on delete set null`
- `drawing_type text not null default 'louvered_roof_order_approval'`
- `status text not null default 'draft'`
- `manufacturer text`
- `product_system text`
- `title text`
- `revision_label text`
- `copied_from_drawing_id integer references quote_approval_drawings(id) on delete set null`
- `drawing_data jsonb not null`
- `public_snapshot jsonb`
- `customer_notes text`
- `internal_notes text`
- `source_quote_or_order_id text`
- `source_document_label text`
- `source_document_url text`
- `source_prepared_by text`
- `source_prepared_at timestamp`
- `ready_at timestamp`
- `sent_for_signature_at timestamp`
- `signed_locked_at timestamp`
- `order_status text not null default 'not_reviewed'`
- `order_reviewed_by integer references users(id) on delete set null`
- `order_reviewed_at timestamp`
- `order_ready_by integer references users(id) on delete set null`
- `order_ready_at timestamp`
- `order_ready_override_reason text`
- `superseded_by_id integer references quote_approval_drawings(id) on delete set null`
- `created_by integer references users(id) on delete set null`
- `updated_by integer references users(id) on delete set null`
- `created_at timestamp default now()`
- `updated_at timestamp default now()`

Suggested status values:

- `draft`
- `ready_for_agreement`
- `sent_for_signature`
- `signed_locked`
- `revision_needed`
- `superseded`

Suggested order status values:

- `not_reviewed`
- `reviewed`
- `order_ready`
- `override_released`
- `blocked`

Why a separate table:

- Keeps large drawing/spec JSON out of normal quote autosaves.
- Allows future quote versions to copy drawings deliberately.
- Allows audit/status events later without overloading `quotes`.
- Lets Ops handoff include the drawing only when present and ready/signed.
- Keeps order-readiness separate from customer approval/signature state.

Add `approvalDrawing?: QuoteApprovalDrawing` to `QuoteWithDetails` in `shared/schema.ts`.

Ownership rules:

- `quote_id` is authoritative. The active drawing for a quote is the latest non-superseded drawing for that exact quote id.
- `quote_family_root_id` is grouping/search metadata only.
- A new quote version copies the current drawing to the new quote as `draft`, links `copied_from_drawing_id`, clears signature/order timestamps, and preserves the old version unchanged.

## Drawing Data Shape

Keep this JSON stable and human-readable.

```ts
type LouveredRoofApprovalDrawingData = {
  schemaVersion: 1;
  units: "ft-in" | "in" | "mm";
  orientation: {
    sideLabelMode: "abcd";
    referenceSide: "A" | "B" | "C" | "D";
    referenceSideLabel?: string; // e.g. "House/wall side"
    compassBySide?: Partial<Record<"A" | "B" | "C" | "D", "north" | "east" | "south" | "west">>;
    northArrow?: boolean;
  };
  layout: {
    mountType: "attached" | "freestanding" | "other";
    overallLength: DimensionValue;
    overallProjection: DimensionValue;
    measurementBasis?: string; // e.g. outside post, outside frame, opening, field measured
    finishedHeight?: DimensionValue;
    clearanceHeight?: DimensionValue;
    louverDirection?: "length" | "projection" | "unknown";
    zones?: Array<{
      id: string;
      label: string;
      length?: DimensionValue;
      projection?: DimensionValue;
    }>;
  };
  colors: {
    frameColor?: string;
    louverColor?: string;
    postTrimGutterColor?: string;
    screenColor?: string;
    wallColor?: string;
  };
  posts: Array<{
    id: string;
    label: string;
    x: number;
    y: number;
    height?: DimensionValue;
    note?: string;
  }>;
  sides: Array<{
    side: "A" | "B" | "C" | "D";
    label?: string;
    length?: DimensionValue;
    enclosureSpan?: DimensionValue;
    enclosureHeight?: DimensionValue;
    openingHeight?: DimensionValue;
    enclosure:
      | { type: "none" }
      | { type: "motorized_screen"; label?: string; color?: string }
      | { type: "sliding_privacy_wall"; label?: string; color?: string }
      | { type: "glass_wall"; label?: string }
      | { type: "other"; label: string };
    notes?: string;
  }>;
  lights: Array<{
    id: string;
    type: "led_strip" | "spot" | "fan_light" | "other";
    location: string;
    quantity?: number;
    side?: "A" | "B" | "C" | "D";
    note?: string;
  }>;
  approvals: {
    fieldVerifiedBy?: string;
    fieldVerifiedAt?: string;
    fieldVerifiedSource?: "field_measure" | "customer_measure" | "manufacturer_config" | "other";
    preparedBy?: string;
    preparedAt?: string;
    customerApprovalCopy: string;
    noTbdValuesConfirmed?: boolean;
  };
};
```

For `DimensionValue`, store both a display value and normalized inches/mm for sorting and rendering:

```ts
type DimensionValue = {
  display: string;
  inches?: number;
  mm?: number;
};
```

## Staff Workflow

1. Jacob creates or opens a quote.
2. Rainmaker detects supported manufacturers from quote lines if possible:
   - `Sundance`
   - `Brustor`
   - `Azenco`
   - normalize close variants such as `Azenco Outdoor`
3. If a supported line exists and no approval drawing exists, show a prompt in the quote builder: "Add order approval drawing." Also allow a manual "this quote needs an order approval drawing" action because imported/manual line items may not carry reliable manufacturer data.
4. Jacob fills the drawing panel:
   - manufacturer/product system
   - attached vs freestanding
   - length and projection/depth
   - measurement basis/reference side
   - frame color
   - louver color
   - post/trim/gutter color if different
   - side enclosures
   - enclosure span/height/drop/opening dimensions where applicable
   - post/column locations and heights
   - lights/accessories
   - field verified by/date/source
   - customer-facing notes/exclusions
   - internal order notes
5. Rainmaker renders a live top-down preview.
6. Jacob marks the drawing `ready_for_agreement`.
7. When the proposal approval link is prepared, signature email is sent, or EDG/company signature is applied, Rainmaker freezes a sanitized public snapshot and includes that snapshot in `buildPublicSigningQuote`.
8. Customer reviews the generated proposal PDF preview and signs.
9. Rainmaker stores the drawing in `signedDocumentSnapshot` along with the rest of the proposal and fingerprints it.
10. After customer signature, Jacob or an authorized staff member performs an internal order review and marks the drawing `order_ready` before Ops/order release. Override release requires a reason.
11. If the quote or drawing is revised after readiness/signing, the existing version remains locked and a new quote version or drawing revision gets a copied draft drawing that must be re-readied.

## UI Placement

Add a new component:

- `client/src/components/quote-approval-drawing-panel.tsx`

Place it in `client/src/pages/quote-builder.tsx` between:

- `QuoteHeader`
- `LineItemsTable`

or directly after `LineItemsTable` if Jacob usually knows dimensions after quote items are built.

Recommended MVP placement: after `LineItemsTable`, before `QuoteSummary`. That keeps product/parts first, then order drawing, then proposal approval.

Panel sections:

- Header/status row:
  - draft/ready/sent/signed/revision status
  - internal order review/order-ready status
  - manufacturer/product selector
  - "Preview" and "Mark ready" buttons
- Dimensions:
  - length
  - projection/depth
  - measurement basis/reference side
  - mount type
  - louver direction
  - finished height/clearance height
- Colors:
  - frame color
  - louver color
  - post/trim/gutter color if different
  - screen/wall color if applicable
- Sides:
  - four A/B/C/D side rows with side label, enclosure type, span/height where applicable, notes
- Posts:
  - add/remove post, location, height label
- Lights:
  - type, quantity, location
- Verification:
  - field verified by/date/source
  - prepared by/date
  - no TBD values confirmation
- Notes:
  - customer-facing notes
  - internal order notes
- Live drawing:
  - responsive SVG preview
  - warning badge: "Order approval layout only. Not permit/shop drawings."

Controls should use existing shadcn/Radix UI components and lucide icons already in the app.

## Drawing Renderer Plan

Create pure helpers instead of adding a heavy rendering dependency:

- `client/src/lib/approval-drawing-model.ts`
  - validation defaults
  - dimension parsing/formatting
  - side normalization
  - shape layout calculation
- `client/src/components/quote-approval-drawing-preview.tsx`
  - renders SVG from the normalized shape model
- `client/src/lib/pdf-approval-drawing-section.ts`
  - draws the same normalized shape model into jsPDF using lines, rectangles, labels, and simple icons

Do not use browser screenshots/canvas capture for the signed PDF. The signed PDF should be deterministic from data.

Visual style:

- Simple scaled rectangle for roof footprint.
- Dimension lines outside the rectangle.
- Side labels A/B/C/D by default.
- House/wall side with heavier line.
- Optional compass/north arrow when staff has reliable orientation.
- Posts as square markers with labels.
- Post heights as small callouts near posts.
- Motorized screen as dashed side line.
- Sliding privacy wall as thicker segmented side line.
- Glass wall as blue-tinted line with glass label.
- Lights as dots/short strips with labels.
- Louver direction as subtle arrows.
- Legend at bottom.

## API And Storage Plan

Add storage methods:

- `getQuoteApprovalDrawingByQuoteId(quoteId)`
- `createQuoteApprovalDrawing(data, actorUserId?)`
- `updateQuoteApprovalDrawing(id, data, actorUserId?)`
- `markQuoteApprovalDrawingReady(id, actorUserId?)`
- `freezeQuoteApprovalDrawingForSignature(id, actorUserId?)`
- `markQuoteApprovalDrawingSignedLocked(id, actorUserId?)`
- `markQuoteApprovalDrawingOrderReviewed(id, actorUserId?)`
- `markQuoteApprovalDrawingOrderReady(id, actorUserId?, overrideReason?)`
- `copyQuoteApprovalDrawingToVersion(sourceQuoteId, targetQuoteId, actorUserId?)`

Add routes:

- `GET /api/quotes/:id/approval-drawing`
- `POST /api/quotes/:id/approval-drawing`
- `PATCH /api/quotes/:id/approval-drawing/:drawingId`
- `POST /api/quotes/:id/approval-drawing/:drawingId/mark-ready`
- `POST /api/quotes/:id/approval-drawing/:drawingId/revision-needed`
- `POST /api/quotes/:id/approval-drawing/:drawingId/order-reviewed`
- `POST /api/quotes/:id/approval-drawing/:drawingId/order-ready`

Validation:

- Add Zod schemas in `server/validation-schemas.ts`.
- Require exact dimensions, reference side, mount type, colors, A/B/C/D side rows, post/height data, field verification, customer disclaimer acknowledgement, and no `TBD` values before `ready_for_agreement`.
- Allow draft saves with partial fields.
- Reject edits after `sent_for_signature`, `signatureEmailSentAt`, `companySignedAt`, or `signed_locked` unless a new quote version/revision is created.
- If quote lines, dimensions, colors, side options, or drawing data change after `ready_for_agreement` or `sent_for_signature`, mark the drawing `revision_needed` and require staff to mark it ready again.
- Block `order_ready` unless the drawing is `signed_locked`, not stale/revision-needed, has no `TBD` values, and has internal source/order review fields.

Quote detail loading:

- Extend `getQuoteWithDetails`, `getQuoteBySigningToken`, `getQuoteVersions`, and `getAllQuotes` as needed so quote pages and signing pages can access `approvalDrawing`.
- Include only one active/current drawing in the quote detail.
- Add a batch loader for `getAllQuotes` so the quote list does not create an N+1 query.

Quote versioning:

- Update `createQuoteVersion` to copy the existing approval drawing into the new quote version as `draft`.
- Clear signature fields as it already does.
- Clear drawing signature/order timestamps and order status on the copied draft.
- Set `copied_from_drawing_id` so staff can trace the source drawing.
- Never resolve a signed/archived quote version to a newer family-level drawing.

Runtime schema guard:

- This repo uses defensive table guards for some live schema additions. Either add `ensureQuoteApprovalDrawingTables()` in `server/db.ts` and call it from storage methods, or make deployment explicitly depend on `db:push`/migration before any route can touch drawing storage.

## Signed Proposal Integration

Server snapshot:

- Update `buildPublicSigningQuote` in `server/routes/quoteRoutes.ts` to include a public approval drawing object when present.
- Include only the sanitized public subset: drawing data, public status, manufacturer/product label if allowed, customer notes, and the non-permit disclaimer.
- Exclude internal notes, order-source fields, internal review status, and vendor/order ids.
- Include drawing in the snapshot before `createDocumentFingerprint`.
- Freeze the public approval drawing snapshot when preparing the signature package, sending the signature email, or applying EDG/company signature. Do not wait until customer signature to create the first frozen copy.
- On successful customer signature, mark the included active approval drawing `signed_locked` and record `signed_locked_at`.
- Fingerprint should change when public drawing data changes before signing. Internal notes/order-source changes should not change the public fingerprint.

Customer signing page:

- `client/src/pages/public-sign.tsx` already generates a PDF preview. Once `generateSignedPDF` supports approval drawings, the customer will see it before signing.
- Add a signature acknowledgement when a drawing is included:

> I have reviewed the Order Approval Drawing and approve the listed dimensions, colors, layout, and selected options for EDG's order release. I understand field conditions, HOA/code/permit review, engineering, manufacturer review, or written revisions may affect final installation details, pricing, or timeline.

PDF:

- Add `drawApprovalDrawingSection` to `client/src/lib/pdf-sections.ts` or a sibling file.
- Update `client/src/lib/pdf-branded-sequence.ts` so the page order becomes:
  1. Cover
  2. Project details
  3. Order approval drawing, when present
  4. Visuals/renderings, when present
  5. Line items
  6. Terms/signature
  7. Back page

Signed PDF:

- `client/src/lib/generate-signed-pdf.ts` should pass the full quote including `approvalDrawing`.
- Staff proposal generator should use the same section so downloaded proposals match signing previews.

Customer-facing disclaimer text:

> This order approval drawing documents the selected layout, dimensions, colors, and options for ordering and installation agreement review. It is not a permit drawing, engineering drawing, sealed plan, or manufacturer shop drawing. Field conditions, code requirements, HOA requirements, engineering, and permit review may require separate paid design documents or revisions.

## Ops Handoff Plan

Do not auto-order from this feature in the MVP.

Do include signed approval facts in the existing Ops handoff payload so production can order with confidence:

- approval drawing id
- status
- internal order status
- signed/fingerprint state
- manufacturer/product system
- dimensions
- colors
- sides/enclosures
- lights
- post heights
- customer notes
- document fingerprint if signed
- order-ready reviewer/date or override reason

Target file:

- `server/integrations/operationsPayload.ts`

If Ops packet documents are generated, add a concise "Order Approval Drawing" section there too:

- `server/integrations/operationsDocuments.ts`

Ops release rule:

- Warn or block Ops handoff when a supported pergola quote has no signed/order-ready drawing.
- Block by default when a drawing exists but is stale, `revision_needed`, `superseded`, unsigned, or has `TBD` values.
- Allow override only with a captured reason so Jacob can move an exception forward without losing the audit trail.

## Implementation Phases

### Phase 1: Schema and read/write API

Done when:

- Migration adds `quote_approval_drawings`.
- Runtime table guard or explicit migration/deployment dependency is in place.
- Shared schema/types exist.
- Storage can create, update, load, and mark ready.
- Routes validate draft vs ready updates.
- Quote detail includes `approvalDrawing`.
- Existing quote, signing, and health routes still start without importing client/PDF code into server startup.

Primary files:

- `shared/schema.ts`
- `migrations/0017_add_quote_approval_drawings.sql`
- `server/storage.ts`
- `server/validation-schemas.ts`
- `server/routes/quoteRoutes.ts`

### Phase 2: Staff quote-builder UI

Done when:

- Jacob can create/edit a drawing from the quote page.
- Supported manufacturer lines prompt the drawing workflow.
- A live top-down preview renders reliably.
- Draft saves do not block normal quote edits.
- Ready status requires required approval fields.
- Manual drawing creation works even when manufacturer detection fails.
- Signed/archived quote versions are protected from accidental edits.

Primary files:

- `client/src/pages/quote-builder.tsx`
- `client/src/components/quote-approval-drawing-panel.tsx`
- `client/src/components/quote-approval-drawing-preview.tsx`
- `client/src/lib/approval-drawing-model.ts`

### Phase 3: PDF and signing lock

Done when:

- Proposal downloads include the approval drawing page.
- Public signing preview includes the approval drawing page.
- Signing package freezes the public approval drawing snapshot before customer signature.
- Customer signature snapshots include the frozen drawing.
- Document fingerprint changes if the drawing changes before signing.
- Signed versions preserve the exact drawing the customer approved.
- Signature acknowledgement explicitly references the order approval drawing when present.

Primary files:

- `server/routes/quoteRoutes.ts`
- `client/src/lib/pdf-branded-sequence.ts`
- `client/src/lib/pdf-sections.ts`
- `client/src/lib/generate-signed-pdf.ts`
- `client/src/components/simple-proposal-generator.tsx`
- `client/src/pages/public-sign.tsx`

### Phase 4: Versioning and Ops handoff

Done when:

- Creating a new quote version copies the drawing as editable draft.
- The old signed version remains locked.
- Ops handoff payload includes approval drawing facts.
- Ops handoff and Ops packet documents include server-side drawing summaries.
- Ops/order release has an internal reviewed/order-ready gate with override reason.
- Ops handoff never creates vendor orders automatically.

Primary files:

- `server/storage.ts`
- `server/integrations/operationsPayload.ts`
- `server/integrations/operationsDocuments.ts`
- `server/tests/operations.test.ts`
- `server/tests/quotes.test.ts`

### Phase 5: Hardening and release proof

Done when:

- Targeted API tests pass.
- PDF preview visually verifies on a sample quote.
- Public signing page verifies in the Codex in-app Browser.
- Production readiness follows the repo proof chain: commit, push, CI, Vercel Ready, `/health`, `/api/user`, browser verification.

## Verification Plan

Local targeted checks:

- Type-level check for touched files when feasible.
- Route validation tests for draft/ready/signed_locked states.
- Storage test for quote detail loading and quote version copying.
- Storage/list hydration test to avoid an N+1 quote list query.
- Public signing payload sanitization test: internal notes and vendor/order-source fields stay private.
- Fingerprint test: public drawing data changes affect fingerprint; internal notes do not.
- PDF generation smoke with an approval drawing object.
- Ops payload/document test that approval drawing data is included, order-ready state is respected, and vendor ordering is not triggered.

Browser checks:

- Staff quote page renders drawing panel.
- Fill dimensions/colors/sides/lights/posts.
- Mark ready.
- Generate proposal PDF and inspect approval drawing page.
- Prepare approval link.
- Public signing preview includes approval drawing page.
- Sign quote and confirm approved PDF still includes exact locked drawing.
- Confirm internal order-ready can be marked only after signature/review, or overridden with a reason.

Production proof after implementation:

1. Exact commit hash.
2. GitHub Actions success.
3. Vercel deployment `Ready`.
4. Live `https://rainmaker.edgpatioshade.com/health`.
5. Live `https://rainmaker.edgpatioshade.com/api/user` when auth/session behavior matters.
6. Browser verification of a non-customer test quote path.

## Risks And Mitigations

- Risk: drawing becomes a fake permit/shop drawing.
  - Mitigation: hard-coded disclaimer, "order approval" naming, and no engineering/permit fields.
- Risk: manufacturer-specific complexity creeps in.
  - Mitigation: one universal model; manufacturer is metadata and defaults only.
- Risk: signed drawing changes after approval.
  - Mitigation: freeze a public snapshot at signature-package preparation, include drawing in `signedDocumentSnapshot` and document fingerprint, and reject edits after send/company signature/customer signature without revision.
- Risk: quote versions confuse approval state.
  - Mitigation: copy drawing to new versions as draft, never mutate signed locked drawings.
- Risk: customer approval is mistaken for order readiness.
  - Mitigation: separate internal order status, reviewer/date fields, and override reason.
- Risk: live quote family lookup shows the wrong drawing on an older signed version.
  - Mitigation: own drawing rows by exact `quote_id`; use `quote_family_root_id` only for grouping/search.
- Risk: PDF generation diverges from live preview.
  - Mitigation: shared normalized drawing model with separate SVG/jsPDF renderers.
- Risk: serverless startup gets heavier.
  - Mitigation: keep PDF/rendering code client-side; server stores/validates JSON only.
- Risk: local checks stall in this checkout.
  - Mitigation: use targeted tests first, then rely on CI/Vercel/live proof for production readiness.

## Open Questions For Jacob

These should be answered before implementation or during Phase 2 polish:

- Should the signed customer document show manufacturer names, or should manufacturer stay internal unless Jacob explicitly chooses to show it?
- Is "A = house/wall side" the right default side-label wording, or should A be another reference side?
- Should "length" and "projection/depth" use EDG's preferred terms on the customer PDF?
- Should the drawing block be required before sending any Sundance/Brustor/Azenco quote for signature, or should it only warn?
- Who is allowed to mark field verified, order reviewed, and order ready?
- Which source fields from the real Sundance/Brustor/Azenco order packets should be required before `order_ready`?
- Should glass wall be a first-class enclosure type in the UI from day one, or an "other enclosure" label in MVP?

## Recommended MVP Decision

Build a narrow "Order Approval Drawing" feature:

- One universal louvered-roof drawing model.
- One top-down drawing.
- Default side labels: A/B/C/D, with A as the configurable reference side.
- Required ready fields: exact length, projection/depth, measurement basis, reference side, mount type, frame color, louver color, four side enclosure selections, applicable enclosure span/height details, post/column locations and height labels, lights/accessories, field verified by/date/source, customer notes/exclusions, and no TBD values.
- PDF/signature integration before any Ops/vendor automation.
- Warning, not hard block, when supported manufacturer lines exist but no drawing is ready during rollout. Block when a drawing exists but is stale or incomplete.
- Separate internal order-ready gate after customer signature, with override reason for exceptions.

This gets Jacob the core value: the customer signs the exact dimensions/options EDG plans to order, while keeping permit/shop drawings as a paid design path.
