# Phase 5C local evidence — email delivery reconciliation

**Date:** 2026-07-10
**Status:** Read-only reconciliation implemented and verified locally; not committed, pushed, deployed, or connected to production data/provider logs
**Depends on:** [Idempotent signature-email delivery](phase5-email-delivery-evidence-2026-07-10.md)

> **Current-state note:** This report preserves the initial read-only reconciliation slice. The later [signature confirmation recovery](phase5-confirmation-recovery-2026-07-10.md) slice adds one narrowly guarded action for a failed quote confirmation receipt. Approval requests, pending/ambiguous records, sent records, and retained planning confirmations still have no retry action.

## Outcome

Rainmaker administrators now have a read-only **Signature-email delivery** panel that distinguishes provider-accepted, pending, stale-pending, and failed signature-request attempts. It makes ambiguous delivery evidence visible without creating a second send path.

The panel deliberately cannot send or resend email. It contains no recipient address, message content, idempotency key, or customer/project content. An administrator can refresh the evidence and open the referenced quote, then check the quote and Gmail/provider logs before deciding whether a new deliberate send action is appropriate.

## Operational rule

A pending delivery attempt becomes **needs review** after 15 minutes. This local default is a conservative operator threshold, not proof that delivery failed:

- Gmail may have accepted the message before Rainmaker failed to finalize its ledger record.
- Automatically retrying that ambiguous state could duplicate customer email.
- Rainmaker therefore leaves the attempt pending, blocks idempotent replay, and surfaces it for human reconciliation.

Failed attempts also remain visible until the original action key is retried and reaches `sent`. Sent attempts are counted but are not listed as attention items.

## Data flow and minimization

- `server/storage.ts:getEmailDeliveryHealth` calculates status totals, sent-in-last-24-hours, stale pending count, and the oldest 50 failed/stale records directly from `email_delivery_attempts`.
- `server/storageContract.ts:EmailDeliveryHealth` limits attention records to:
  - ledger record ID;
  - message type;
  - quote or retained planning-agreement ID;
  - status and attempt count;
  - redacted error class;
  - created/updated timestamps.
- `server/routes/emailDeliveryRoutes.ts` exposes only `GET /api/admin/email-delivery-health`, guarded by both authentication and the admin role. There is no POST, PATCH, DELETE, retry, or resend route in this module.
- `client/src/components/email-delivery-health-card.tsx` renders status counts, a safe quote link, attention rows, a refresh action, and explicit ambiguity guidance.
- `client/src/pages/admin.tsx` mounts the card only on the existing admin page. The adjacent non-functional Users & Access button is now a current-page label, and team-member icon actions have accessible names.

## Verified states

### Populated state

The in-app Browser rendered the fictional Admin page at 390 and 1024 pixels:

- document width matched the viewport with no page overflow;
- one `main` and one `h1` were present;
- the 1024-pixel summary rendered four columns;
- two fictional attention rows rendered: one failed quote attempt and one stale retained-planning attempt;
- the panel contained exactly one button, **Refresh**;
- the only panel link was the safe fictional quote reference;
- scoped panel text contained no email address, idempotency key, or message body.

### Failure state

The fictional `admin-data-error` scenario returned HTTP 503 only for the delivery-health endpoint. The Admin page remained usable and showed:

> Email delivery evidence unavailable. Rainmaker could not read the delivery ledger. No email action was taken.

The state offered **Try Again** and did not render stale counts as zero or imply that delivery was healthy.

## Verification

- `server/tests/email-delivery-routes.test.ts` proves unauthenticated requests return 401, normal users return 403, administrators receive only the redacted contract, and storage failures return a generic error.
- `server/tests/quotes.test.ts` uses the isolated migrated database to prove stale-pending and failed classification, summary counts, truncation, and omission of action/provider/customer fields.
- `server/tests/authorization-policy.test.ts` pins the read-only admin route, storage threshold, mounted panel, and absence of resend/email-provider behavior.
- `scripts/serve-browser-fixtures.mjs` provides fictional populated and failure responses without reading a provider or production database.
- `npm run audit:browser:a11y` passes 15 route/viewport combinations: populated Admin, Admin error, Lead Inbox, Quote Editor, and Public Approval at 390, 768, and 1024 pixels, with zero document overflow, critical/serious axe violations, or unnamed sampled focus stops.
- Full local verification passes: 166 ordinary tests, 44 isolated database tests, TypeScript, production build, asset audit, secret audit, dependency gates, and `git diff --check`.

## Remaining boundaries

- The panel cannot confirm inbox delivery; `sent` means the configured provider accepted the request.
- Provider logs are not integrated into Rainmaker.
- There is no automatic stale-attempt resolution, override, deletion, or resend.
- Confirmation-email recovery after a customer signature remains outside this ledger.
- A true transactional outbox/worker remains optional future work if EDG requires guaranteed eventual delivery independent of the web request.
- The 15-minute review threshold should be validated with real non-production provider timing before release.

## Safety

No production database, Gmail/provider log, customer email, signature, quote, planning agreement, or production configuration was read or changed. No deployment, commit, or push occurred.
