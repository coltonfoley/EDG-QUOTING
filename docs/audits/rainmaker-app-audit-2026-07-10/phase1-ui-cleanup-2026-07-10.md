# Phase 1A UI cleanup — 2026-07-10

**State:** complete locally; not committed, pushed, deployed, or production-verified.

This package removes owner-confirmed unused or misleading visible surfaces while preserving database records, internal notes, documents, and compatibility paths. At the time of the first UI pass, the retired Ops backend and environment variables remained gated until the production preservation audit could run.

After the preservation audit completed, the two unmounted legacy creation panels (`planning-agreement-panel.tsx` and `quote-approval-drawing-panel.tsx`) were also removed locally. Existing records remain visible as read-only historical summaries, and public legacy signing/document paths remain for compatibility.

## Changes

### Retired Ops surface

- Removed `Send to Ops`, its dialog, mutation/state, job link, and Ops workflow step from `client/src/components/quote-header.tsx`.
- Changed the quote workflow to end at customer/company signature.
- Removed remaining visible Ops wording from fields, archived-version guidance, approval copy, product help, planning-agreement status, and document tools.
- Preserved internal notes, BOM/proposal tools, agreements, drawings, the backend endpoint, integration modules, and environment configuration.

### Owner-confirmed unused controls

- Removed the empty Bell control from `client/src/components/app-header.tsx`.
- Removed the non-functional Rep filter, user request, and disabled-Rep card footer.
- Removed the `/admin/templates` link that routed to a 404.
- Replaced developer-facing not-found copy with a normal return action.

### Role alignment

- Quote and account delete controls render only for administrators.
- Backend delete routes remain protected by `requireAdmin`.
- Authenticated sales users may read contract templates needed during quoting; create/update/delete remain admin-only.

### Responsive navigation

- Added mobile primary navigation for Home, Leads, Accounts, Quotes, Pipeline, Products, and Admin when applicable.
- Reduced logo/user-name footprint on small screens.
- At 390 x 844, the page has no horizontal overflow and sales users have six primary navigation links.

## Browser fixture

`scripts/serve-browser-fixtures.mjs` serves the built app locally with synthetic admin, sales, public signer, populated, empty, not-found, and authentication-error states. It never connects to production or uses real customer data.

Run `npm run build`, then `npm run fixture:browser`, then open a fixture URL such as `http://127.0.0.1:4174/__fixture/admin?next=/quotes`.

## Verified local behavior

| Scenario | Result |
|---|---|
| Admin quote list | Delete visible; Admin navigation visible; no Bell |
| Sales quote list | Delete hidden; Admin navigation hidden |
| Sales/admin account lists | Delete hidden for sales and visible for admin |
| Quote editor | No visible `Ops` text/action; workflow ends at Signature; current version renders |
| Pipeline | No Rep filter or disabled-Rep copy |
| Contracts | No stale Templates link |
| Not found | Return action present; developer copy absent |
| Empty quotes | `No quotes yet` renders |
| Auth failure | Connection Error, Retry, and Go to Login render |
| Public signer | Fictional proposal and Approve & Sign render |
| 390px quote list | Mobile nav visible; no page overflow; delete hidden for sales |

## Screenshots

- [Quote editor without Ops](screenshots/phase1-quote-editor-no-ops.jpg)
- [Pipeline without Rep controls](screenshots/phase1-pipeline-no-rep.jpg)
- [390px quote list/navigation](screenshots/phase1-quotes-mobile-390.jpg)
- [Public signer fixture](screenshots/phase0-public-signer-fixture.jpg)

## Automated proof

- Source-policy tests protect admin-only delete visibility and removal of Bell, Rep, Templates, developer 404 copy, and visible Ops terminology.
- Contract-template policy tests require authenticated reads and admin-only mutation.
- `npm test`: 99 passed; 25 database tests run separately.
- `npm run test:database:isolated`: 25 passed.
- Type-check and production build passed.

## Remaining gate

Work package 1B was completed later after the production preservation inventory, ID-level review, backup-window proof, and credential rotation. See `phase1b-ops-backend-retirement-2026-07-10.md`. Historical compatibility/data paths remain preserved.
