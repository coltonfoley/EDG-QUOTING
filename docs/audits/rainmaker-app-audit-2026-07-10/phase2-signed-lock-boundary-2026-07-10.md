# Phase 2A signed-version lock boundary — 2026-07-10

**State:** design and mutation inventory complete; implemented and verified locally on 2026-07-10; no production behavior changed. Implementation evidence: [phase2-signed-immutability-2026-07-10.md](phase2-signed-immutability-2026-07-10.md).

## Invariant

A quote version becomes customer-approved when any durable customer-approval evidence exists:

- `clientSignedAt` is set;
- `clientSignatureData` exists; or
- `signedDocumentSnapshot` exists.

Using all three indicators fails safely for older or partially migrated records. A customer-approved version is immutable commercial evidence. Staff may view/download it, add the EDG signature through the dedicated signature route, change the non-document pipeline stage, or create a new version. They may not alter or delete the approved commercial package.

The standard conflict response should be HTTP 409 with code `QUOTE_SIGNED_LOCKED` and this recovery message:

> This customer-approved quote is read-only. Create a new version to make changes.

## Mutation inventory and decision

| Surface | Current route/data path | Signed-version decision |
|---|---|---|
| Quote fields, client, address, terms, pricing/package options | `PUT /api/quotes/:id` -> `storage.updateQuote` | **Block** |
| Pipeline stage/lost reason | `PATCH /api/quotes/:id/stage` | **Allow**, because it is operational state outside the signed document |
| Quote deletion | `DELETE /api/quotes/:id` -> `storage.deleteQuote` | **Block**, including admin deletion |
| Create version | `POST /api/quotes/:id/create-version` -> transactional `createQuoteVersion` | **Allow and promote** as the recovery path |
| Make version current | `POST /api/quotes/:id/use-version` -> `setCurrentQuoteVersion` | **Allow only with signature-aware confirmation and an audit event** |
| Enable/change e-signature package | `POST /api/quotes/:id/enable-esignature` | **Block** after customer approval |
| Send approval email | `POST /api/quotes/:id/send-signature-email` | **Block** after customer approval; do not resend an approval request for an already approved version |
| EDG/company signature | `POST /api/quotes/:id/company-signature` | **Allow only dedicated company-signature and audit fields**; never rebuild or replace the customer snapshot |
| Customer signature | `POST /api/signatures/:token/sign` | **Allow once**; the atomic transition that creates the snapshot and lock |
| Line-item create/update/delete/bulk/reorder | `lineItemRoutes.ts` -> line-item storage methods | **Block** |
| Group create/update/delete/reorder | `lineItemRoutes.ts` -> group storage methods | **Block** |
| Configured-product insertion | `POST /api/quotes/:quoteId/configure-product` | **Block** through the same group/line-item invariant |
| Import into existing quote | `POST /api/quotes/import-batch` -> `createLineItem` | **Block**; importing as a new quote/version remains available |
| Cover/product image create/upload/update/delete | image routes -> quote image storage methods | **Block** |
| Legacy approval-drawing content edit | `PATCH /api/quotes/:id/approval-drawing/:drawingId` | **Block** if the related quote is approved |
| Legacy drawing order-review state | dedicated `order-reviewed` / `order-ready` actions | **Preserve** as operational compatibility; these must not rewrite the frozen public snapshot |
| Planning credit targeting the quote | `POST /api/planning-agreements/:id/apply-credit` | **Block** when the target quote is approved; otherwise a post-sign action can change the displayed amount due outside the snapshot |
| Account/contact master-data edit | account routes | **Allow globally**, but signed quote views and documents must read the frozen snapshot rather than mutable account truth |
| Contract-template edit | contract-template routes | **Allow globally**, but signed quote views and documents must use frozen contract content from the snapshot |

## Enforcement architecture

Route-only checks are insufficient because customer signing and a staff mutation can race. The lock must be enforced in the storage transaction that performs each write:

1. Start a transaction.
2. Lock the related quote row (`SELECT ... FOR UPDATE`).
3. Re-read customer-approval evidence.
4. Reject the mutation if locked, unless the operation is an explicitly allowed transition.
5. Perform the write in the same transaction.

The customer-signature transaction must acquire the same quote-row lock before recording the signature and snapshot. This serializes “sign versus edit”: exactly one operation observes the unsigned state first, and the other re-checks after the lock is released.

`storage.updateQuote` needs a narrowly typed transition allowance rather than a general bypass. Recommended allowed transition kinds:

- `pipeline_stage` — only `dealStage`, `lostReason`, and `updatedAt`;
- `company_signature` — only company signature/IP/time and append-only signature audit fields;
- `customer_signature` — only customer signature/IP/time, frozen snapshot, and append-only signature audit fields.

No admin or manager “force edit” bypass is recommended. Administrators use **Create New Version**, preserving a comprehensible audit trail.

## Required tests

### Storage/database

- Quote field update and delete reject every approval indicator independently.
- Line-item create/update/delete/bulk/reorder reject a locked quote.
- Group and image mutations reject a locked quote.
- Pipeline stage and company-signature transitions permit only their allowlisted fields.
- Creating a version from a signed quote succeeds, clears all signature/token/snapshot fields, and makes exactly one family version current.
- A concurrent signature and commercial mutation serialize on the quote row; the mutation cannot commit after approval using a stale pre-check.
- Planning credit cannot target a locked quote.

### HTTP boundary

- Each mutation family returns 409 `QUOTE_SIGNED_LOCKED`, not 500 or a silent success.
- Archived-version restrictions continue to return their existing explicit response.
- Public customer signature remains single-use.

### UI/browser

- A signed quote opens in a clearly read-only state.
- Save, delete, line/group/image editing, package configuration, and import affordances are absent or disabled.
- Pipeline stage and EDG signature remain available when otherwise eligible.
- **Create New Version** is the primary recovery action.
- A stale open editor receiving 409 stops autosave, explains the lock, invalidates/refetches the quote, and does not keep retrying.

## Dependencies and gates

- This design does not require destructive cleanup or an Ops decision.
- Local implementation can be tested against the disposable PGlite database.
- Production rollout remains gated on the read-only signed-snapshot mismatch inventory, backup evidence, explicit deployment approval, and production verification.
- Phase 2B must make signed staff views, customer receipts, contract text, account details, groups, and visuals snapshot-backed; immutability alone does not eliminate every live-versus-snapshot display mismatch.
