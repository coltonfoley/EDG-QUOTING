# Phase 5A local evidence — honest permissions baseline

**Date:** 2026-07-10
**Status:** Two-role capability policy approved by EDG and enforced locally
**Scope:** Make existing authorization semantics honest, align retired planning-record controls, and enforce the approved two-role policy

## Outcome

Rainmaker currently has two human roles: `user` and `admin`. Quotes are a shared authenticated sales workspace; there is no per-rep ownership relation on quote records. The former `validateQuoteOwnership` routine ignored its user argument and only checked whether the quote existed. That misleading authorization language has been removed throughout storage, quote visuals, line items, groups, and tests.

Existing Design + Planning Agreement records remain readable and publicly signable through their existing scoped tokens, but every internal mutation of those retired records now requires an administrator. This creates the narrow compatibility-resolution path recommended by the audit without deleting records or reviving the retired feature for sales users.

## Effective local capability matrix

This matrix records the EDG-approved two-role policy and current local implementation truth.

| Capability | Public token/anonymous | Authenticated user | Administrator | Evidence |
|---|---:|---:|---:|---|
| Health and readiness | Yes | Yes | Yes | `api/index.ts`, `server/app.ts` |
| Submit a website inquiry | Yes, intake endpoint | Yes | Yes | `api/lead-intake.ts`, `leadIntakeRoutes.ts` |
| Review/sign an existing customer package | Scoped token only | N/A | N/A | `quoteRoutes.ts` public signature routes |
| Review/sign an existing planning agreement | Scoped legacy token only | Read only | Read and resolve | `planningAgreementRoutes.ts` |
| View shared leads, clients, quotes, pipeline | No | Yes | Yes | authenticated route guards |
| Create/edit quotes, line items, groups, visuals | No | Yes | Yes | quote/line-item/image routes |
| Create quote versions and manage customer approval | No | Yes | Yes | quote lifecycle and approval routes |
| Make an archived quote version current | No | No | Yes | `POST /api/quotes/:id/use-version`; Quote Builder control |
| Delete a whole quote or client | No | No | Yes | central `requireAdmin`; matching UI visibility |
| Change products, pricing tables, colors, and catalog imports | No | No | Yes | product/admin route guards; Products UI uses `isAdmin` |
| Administer contract templates | No | No | Yes | `routes.ts`; Contracts page admin gate |
| Administer users and storage settings | No | No | Yes | `routes.ts`; Admin page gate |
| Mutate retired planning records, confirm payment, waive, deliver, or apply credit | No | No | Yes | `planningAgreementRoutes.ts` now uses `requireAdmin` |
| Send to retired Ops Portal | No | No | No | callable backend and integration removed after preservation review; no replacement added |

## Implementation details

- `storage.validateQuoteOwnership(quoteId, userId)` is replaced by `storage.quoteExists(quoteId)`.
- `storage.validateLineItemsOwnership(ids, userId)` is replaced by `validateLineItemSelection(ids)`, which checks existence and one-quote boundaries only.
- Missing parent quotes now return HTTP 404 rather than a false HTTP 403 ownership denial.
- Mixed/missing bulk line selections return HTTP 400 with an integrity message rather than claiming the lines belong to another user.
- Internal planning-record PATCH, signing preparation/email, manual signed status, payment confirmation, waiver, delivery, and credit application now require `isAuthenticated` plus the central `requireAdmin` guard.
- Making an archived quote version current now requires the same central `requireAdmin` guard; non-admin screens show the archived state and direct the user to an administrator instead of exposing a failing control.
- Public token-scoped planning signatures remain unchanged for compatibility.
- Existing planning events already record actor, time, transition, and reason/payment payload where applicable; no historical events were modified.

## Approved EDG policy

1. Rainmaker has only two human roles: `user` and `admin`; no manager or finance role is being added.
2. Users may create and edit unsigned quotes, create new versions, and prepare/send customer approval links.
3. Only administrators may make an archived quote version current, manage catalog/settings, delete whole quotes or clients, or resolve retained legacy records.
4. Quotes remain a shared sales workspace. Assignment is workflow metadata and does not restrict visibility.
5. Retired planning compatibility endpoints remain for existing records. The callable Ops endpoint and integration were removed after production reference counts and backup evidence became available. No replacement Ops portal will be added.

## Verification

- At the time of this permissions report, the full ordinary suite passed 189 tests with 47 database tests skipped in that command. After the later retired Ops backend cleanup removed seven obsolete Ops-only tests, the current ordinary suite passes 182 tests with the same 47 database cases covered separately by the isolated database run.
- Current isolated migrated database suite: 47 tests passed.
- Policy tests prove all retired planning-record mutations are admin guarded and the public scoped-signature route remains available.
- Policy tests reject reintroduction of either misleading ownership name.
- Existing route tests prove missing quote parents block line, group, and image deletion without calling the destructive storage method.
- TypeScript, production build, asset/secret/schema audits, and patch formatting pass.
- After owner approval, the focused authorization suite passes 35 tests and TypeScript passes with the version-override policy enforced.

No production role, session, record, route, deployment, or customer action was changed.
