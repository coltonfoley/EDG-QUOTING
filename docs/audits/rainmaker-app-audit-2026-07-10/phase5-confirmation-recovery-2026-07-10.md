# Phase 5C local evidence — signature confirmation recovery

**Date:** 2026-07-10
**Status:** Implemented and verified locally; no email sent, no production data/provider accessed, and nothing committed, pushed, or deployed
**Scope:** Quote and retained planning-agreement confirmation evidence; deliberately guarded retry only for failed quote confirmation receipts

## Outcome

Customer signature confirmation emails no longer disappear into a best-effort `try/catch`. Both quote and retained planning-agreement confirmation sends now use the existing durable email-delivery ledger with deterministic keys tied to the signed document fingerprint.

For the core quote flow, an administrator can deliberately retry a failed confirmation receipt from the existing delivery-evidence panel. This is not a general resend feature:

- approval-request emails have no reconciliation-panel resend action;
- pending or stale-pending deliveries have no retry action because provider acceptance may be ambiguous;
- sent deliveries have no retry action;
- retained planning-agreement confirmations remain evidence-only;
- only a `failed` `quote_signature_confirmation` record exposes **Retry confirmation**;
- the server re-loads the exact delivery record and signed quote, requires the stored idempotency key to match the signed-document fingerprint, and refuses missing or mismatched records;
- an action-time dialog explains that one replacement receipt will go to the email currently saved on the quote and that the recorded signature will not change.

No retry was activated during local validation.

## Delivery behavior

`server/emailDelivery.ts:deliverIdempotentEmail` centralizes the confirmation ledger boundary:

1. claim the deterministic action key;
2. do not send for an already-sent, in-progress, or conflicting claim;
3. call the configured provider only for a newly claimed or explicitly failed/reclaimed record;
4. mark provider rejection as `failed` using only the error class;
5. mark provider acceptance as `sent` with provider message ID and timestamp;
6. leave a provider-accepted but unfinalized record `pending` for manual reconciliation rather than risk an automatic duplicate.

The public signing response remains successful if its separate confirmation receipt fails. The customer is told to download the signed document when `emailSent` is false. A failed confirmation therefore cannot undo or misrepresent the recorded signature.

The automatic quote-confirmation template now uses the recorded signature timestamp and escapes customer/project values before inserting them into HTML. The retry template is reconstructed from the frozen signed quote references and includes the quote number, signed time, shortened document ID, and secure signed-document link without persisting message content in the ledger.

## Guarded recovery route

`POST /api/admin/email-delivery-attempts/:id/retry-confirmation` requires authentication and the admin role. It accepts no recipient, message body, signing token, quote ID, or idempotency key from the browser. All of those decisions are re-derived server-side from the failed ledger row and signed quote.

The endpoint returns generic operational messages and does not expose the recipient, provider message ID, idempotency key, public token, or provider exception. A provider failure remains failed and visible; an ambiguous outcome remains unavailable for retry.

## UI evidence

- [390 px action-time confirmation dialog](screenshots/phase5-confirmation-retry-guard-390.png)

In-app Browser inspection at 390 and 1024 pixels verified:

- one retry button for the fictional failed quote confirmation;
- no retry button for the fictional pending retained approval request;
- the delivery type is visibly labeled **Confirmation receipt** or **Approval request**;
- the 390-pixel document has no horizontal overflow;
- opening the dialog names the quote, describes the external email action, says the signature will not change, and provides **Cancel** and **Send replacement receipt**;
- the send action was not clicked.

## Verification

- `server/tests/email-delivery.test.ts` proves provider finalization, sent replay without a second provider call, redacted provider failure, and ambiguous-finalization reconciliation.
- `server/tests/removed-feature-routes.test.ts` proves an automatic quote confirmation is claimed/finalized and a failed receipt does not turn a successfully recorded signature into a failed signing response.
- `server/tests/email-delivery-routes.test.ts` proves admin-only recovery, exact failed-type/status/fingerprint checks, provider finalization, and rejection of request-email or mismatched records.
- `server/tests/quotes.test.ts` proves the exact delivery record can be read from the isolated migrated database before a guarded retry.
- `server/tests/authorization-policy.test.ts` pins the narrow POST boundary, UI confirmation, and absence of approval-request resend behavior.
- Full local verification passes: 180 ordinary tests, 45 isolated database tests, TypeScript, production build, and the 15-case responsive/accessibility matrix.

## Remaining boundary

A real external error-reporting destination and accountable owner remain undecided. Rainmaker should not claim exceptions are reported until EDG selects the destination, access model, alert owner, retention policy, and customer-data scrubbing rules. That is a product/operations decision, not something to infer from the repository.

A durable outbox/worker remains a larger optional design if EDG wants automatic eventual delivery after provider or server interruptions. The current implementation chooses explicit failed-record recovery and conservative handling of ambiguous provider outcomes.

## Safety

All UI and email evidence used fictional `.invalid` data. No production database, Gmail/provider record, customer email, signature, quote, or configuration was read or changed. No message was sent. No deployment, commit, or push occurred.
