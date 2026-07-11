# Phase 3A catalog and group source identity — local implementation evidence

**Date:** 2026-07-10
**State:** implemented and verified locally; not committed, pushed, deployed, or run against production data.

## Outcome

Quote lines created from the catalog now retain their catalog relationship and a frozen source record. Custom lines remain explicitly manual. **Add Item to Group** carries the selected group through save. Version creation copies both line source provenance and group configuration data.

Line and group deletion now require confirmation. Deleting a group preserves its lines as ungrouped items in deterministic order through one storage transaction. Line and group drag handles are real focusable buttons backed by pointer and keyboard sensors.

## Additive source fields

Migration `0025_add_line_item_source_identity.sql` adds nullable fields only:

- `manufacturer` — manufacturer frozen when the line is created;
- `unit` — frozen catalog unit;
- `price_source` — `manual`, `catalog_cost`, `dimensional_catalog`, `configured_catalog`, or future explicit import source; and
- `source_metadata` — frozen product/configuration provenance used for audit, reload, and recovery.

The migration does not rewrite or classify legacy rows. Existing rows continue to load through the current product join when available and fall back to their preserved legacy values. Production migration remains gated by the preservation and backup requirements.

## Catalog and configurator boundary

The ordinary line-item route no longer trusts submitted SKU/manufacturer/unit metadata for catalog-linked lines. When `productId` is present, it reloads the current product and records a canonical product snapshot, while preserving the entered quote cost and configuration separately. A missing catalog product fails visibly and asks the user to refresh.

The Sundance/configured-product path now canonicalizes product-backed snapshots against server catalog truth and records `configured_catalog` provenance. Its line `configData` remains JSON, rather than being double-encoded as a JSON string.

The customer projection includes the frozen manufacturer and unit but continues to omit internal source metadata, catalog cost controls, and configuration data.

## Group behavior and recovery

- The custom-item draft carries `newItemTargetGroupId` from **Add Item to Group** through `POST /api/quotes/:quoteId/line-items`.
- The draft visibly says either **Adding to [group]** or **Adding to ungrouped items** before save.
- Version creation copies group `configData`, line `productId`, SKU, manufacturer, unit, price source, source metadata, configuration, and remapped group ID.
- Group deletion locks the quote, appends the group’s lines after existing ungrouped lines, clears their group IDs, deletes the group, and advances the quote revision in one transaction.

## Safety and accessibility

- Line deletion displays the exact line description and requires **Delete Item** confirmation.
- Group deletion states that its lines will be preserved as ungrouped and requires **Delete Group** confirmation.
- Line and group reorder handles are named buttons with tab index 0.
- `KeyboardSensor` and `sortableKeyboardCoordinates` provide a non-pointer reorder path.

## Browser evidence

The local fictional quote was inspected through the Codex in-app Browser:

- **Add Item to Group** opened a custom draft labeled **Adding to Fictional Option A**.
- Catalog selection opened a draft labeled **Catalog item**, displayed `SKU TEST-CAT-9401`, and said **Adding to ungrouped items**.
- Deleting the fictional line opened **Delete this line item?** with a separate confirmation action.
- Deleting **Fictional Option A** stated that its items would be preserved as ungrouped.
- Both reorder handles were focusable buttons.

No line, group, quote, or catalog record was written or deleted during browser verification.

## Verification

| Check | Result |
|---|---|
| TypeScript | Pass |
| Ordinary tests | 129 passed; 36 database tests intentionally skipped without the isolated harness |
| Isolated fresh-database tests | 36 passed |
| Fresh migration/schema audit | 22 declared tables; 26 manifest migrations; no drift |
| Production build | Pass |
| Canonical catalog route test | Pass; spoofed client SKU/manufacturer replaced by server truth |
| Version-copy provenance test | Pass |
| Group-deletion preservation/order test | Pass |
| Browser grouped/catalog/delete/keyboard checks | Pass |

## Remaining boundary

- Legacy lines are not guessed or backfilled. The exact evidence required before any backfill is a read-only count of null source fields, valid product matches by stable ID/SKU, ambiguous matches, and orphaned product IDs.
- Configured-product group and line creation still spans multiple storage calls; Phase 3C’s transaction work should make the entire insertion atomic.
- Dimensional price selection and pricing-table replacement are addressed in Phase 3B.
- Import-specific price/source semantics are addressed in Phase 3C.

No production behavior or data changed during this work.
