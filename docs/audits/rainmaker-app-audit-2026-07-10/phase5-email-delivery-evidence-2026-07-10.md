# Phase 5C local evidence — idempotent signature-email delivery

**Date:** 2026-07-10
**Status:** Signature-request retry safety implemented and verified locally; not committed, pushed, deployed, migrated in production, or used to send a real email
**Scope:** Quote approval-request email and the retained admin-only legacy planning-agreement request email

## Outcome

Rainmaker's visible quote approval-email action now creates one opaque action key per deliberate click and reuses that key when React Query retries the same mutation. The server claims that key in a durable delivery ledger before calling Gmail. A completed key returns the prior success without sending again; a pending key blocks a second send; a provider failure records a redacted failure state and permits a controlled retry of the same action.

This closes the specific audit risk where the client automatically retries a mutation after Gmail may already have accepted the message. It is not a general asynchronous email outbox and does not prove delivery to the recipient's inbox.

## Data and request flow

1. `client/src/components/quote-summary.tsx` creates `quote-email:<quote id>:<UUID>` when the user clicks **Send Email**.
2. `client/src/lib/queryClient.ts` carries the value in `Idempotency-Key`; automatic mutation retries reuse the same mutation variables and key.
3. `server/emailDelivery.ts` requires a syntactically safe, non-empty key.
4. `server/routes/quoteRoutes.ts` completes quote, archive, signature, package, drawing, and recipient checks, then claims the operation through `storage.claimEmailDelivery`.
5. `server/storage.ts` inserts or locks the unique key transactionally in `email_delivery_attempts`.
6. Only a `claimed` operation may call `sendEmail`.
7. A provider failure becomes `failed` with only the error class; the same operation may reclaim it and increments `attempt_count`.
8. Provider acceptance is recorded as `sent`, including Gmail's provider message ID when returned, before the quote's convenience `signature_email_sent_at` field is updated.

The unmounted compatibility panel and admin-only planning route use the same pattern with `planning-email:<agreement id>:<UUID>`. Keeping this path safe preserves existing records without restoring the retired visible planning workflow.

## Persisted evidence

Migration `migrations/0029_add_email_delivery_attempts.sql` adds:

- a unique `idempotency_key`;
- message type and quote/planning-agreement references;
- `pending`, `failed`, or `sent` status;
- attempt count;
- provider message ID;
- redacted last error type;
- created, updated, and sent timestamps.

The shared declaration is `shared/schema.ts:emailDeliveryAttempts`; its storage contract is in `server/storageContract.ts`.

## State decisions

| Existing state | Server decision | Provider call |
|---|---|---|
| No record | Claim as `pending` | Allowed once |
| Same operation, `pending` | `EMAIL_DELIVERY_IN_PROGRESS` | Blocked |
| Same operation, `failed` | Reclaim and increment attempts | Allowed once |
| Same operation, `sent` | Return prior success with `replayed: true` | Blocked |
| Same key, different operation/resource | `EMAIL_IDEMPOTENCY_CONFLICT` | Blocked |

If Gmail accepts a message but finalizing the ledger fails, the record intentionally remains `pending`. A retry is blocked instead of risking a duplicate. That ambiguous state requires manual reconciliation using the ledger, provider evidence, request ID, and application logs. The later read-only operator surface is documented in [phase5-email-reconciliation-2026-07-10.md](phase5-email-reconciliation-2026-07-10.md).

## Confirmation-email boundary

The automatic confirmation emails sent after a customer signature are not moved into this ledger. Their signature writes are already duplicate-protected, so retrying the signature cannot create a second signature or uncontrolled duplicate confirmation. However, a confirmation-provider failure after the signature commits can leave the customer without a confirmation and has no staff retry/reconciliation workflow. A future transactional outbox or explicit confirmation-recovery action is still needed if EDG considers confirmation delivery operationally critical.

## Verification

- `server/tests/email-delivery.test.ts` validates key requirements and rejects ambiguous key formats.
- `server/tests/removed-feature-routes.test.ts` proves the quote route requires a key, sends a claimed action once, stores the provider ID, returns completed replays without a second provider call, records provider failure, and does not expose the provider's raw error message. It also proves the retained planning route requires a key.
- `server/tests/quotes.test.ts` exercises the real storage lifecycle against a fresh isolated PostgreSQL-compatible database: claim, pending replay, failed state, retry count, sent finalization, sent replay, and cross-resource conflict.
- `server/tests/authorization-policy.test.ts` pins both client headers, both server claim/finalization boundaries, and the checked-in table/migration.
- Full verification passed: 162 ordinary tests, 43 isolated migrated-database tests, TypeScript, production build, asset audit, secret audit, migration restore, preservation-script syntax, and `git diff --check`.

## Remaining work

- Validate the implemented 15-minute review threshold and assign an owner for investigating ambiguous pending deliveries.
- Add a true transactional outbox/worker only if EDG needs guaranteed eventual sending independent of the web request.
- Cover signature-confirmation recovery if it is business-critical.
- Add adoption views based on durable events. The new ledger can evidence signature-request attempts and provider acceptance, but it cannot by itself prove recipient delivery, feature usefulness, or usage of unrelated tools.
- Validate migration/readiness and the real provider boundary in a non-production environment before any release.

## Safety boundaries

No production database was queried or migrated. No Gmail call, customer email, quote mutation, planning-agreement mutation, signature, deployment, commit, or push was performed during this slice.
