# Phase 5C local evidence — redacted routine logging

**Date:** 2026-07-10
**Status:** Initial Phase 5C slice implemented and verified locally; not committed, pushed, deployed, or connected to production reporting
**Scope:** Remove routine customer-content logging, add safe request correlation, redact public tokens, and correct the unimplemented error-reporting claim

## Outcome

Rainmaker no longer deliberately echoes routine account, client, quote, line-item, search, upload, image-proxy, signature-email content, or public signing tokens into server/browser logs in the paths changed here. Logs retain operation names, safe result counts, record IDs where useful, file type/size, error class names, and an opaque request ID.

This is a redaction baseline, not a complete observability system. A real error-reporting destination, ownership/alerting, broader durable business events, and production reporting remain open Phase 5 work. Request IDs were completed in this slice; signature-request retry safety is documented separately in [phase5-email-delivery-evidence-2026-07-10.md](phase5-email-delivery-evidence-2026-07-10.md). The separate initial readiness slice is documented in [phase5-schema-readiness-2026-07-10.md](phase5-schema-readiness-2026-07-10.md).

## Changes

- `server/redactedLogging.ts` provides:
  - `redactedErrorType`, which returns only an error class name;
  - `validationIssueSummary`, which reports issue count, validation codes, and field paths without rejected values or messages.
- `server/routes/accountRoutes.ts` no longer logs search text, account/client request bodies, stack traces, or internal error messages returned by search endpoints.
- `server/routes/quoteRoutes.ts` no longer logs quote update bodies, customer emails, account hint objects, or uploaded PDF filenames. Email results use quote IDs, and error logs use error classes.
- `server/routes/lineItemRoutes.ts` no longer logs line-item bodies; validation logs contain only field paths/codes.
- `server/routes.ts` no longer logs product-import filenames, column labels, or bulk-update bodies.
- `server/routes/imageRoutes.ts` no longer logs proxied source URLs.
- `server/storage.ts` no longer logs account search terms.
- `client/src/components/client-combobox-with-create.tsx` no longer prints customer search results to the browser console.
- `server/openai.ts` reports only whether a manufacturer was inferred, not the filename-derived manufacturer string.
- `client/src/components/error-boundary.tsx` no longer claims “We've been notified.” Production console output is limited to the error name; full debugging detail remains development-only.
- `server/requestLogging.ts` creates opaque UUID request IDs and replaces quote/planning public signing tokens with `:token` before routine request logging.
- `server/app.ts` exposes `X-Request-Id`, includes it in routine request and unhandled-error logs, and returns generic HTTP 500 messages with the request ID instead of internal exception text.
- `api/index.ts` and `server/vercelHandler.ts` add request IDs to the lightweight direct liveness response without loading the application.

## Verification

- `server/tests/redacted-logging.test.ts` proves an error message containing a fictional email cannot pass through the redacted error helper and validation summaries contain no rejected value/message.
- `server/tests/authorization-policy.test.ts` asserts the changed account/quote/line-item routes contain no routine request-body/search-term logging, quote logs contain no email or upload filename interpolation, and the error boundary contains no notification claim.
- `server/tests/request-logging.test.ts` proves request IDs are opaque/unique, both public token families are redacted, and ordinary route paths remain intact.
- At the time of this slice, TypeScript, focused route/policy tests, `git diff --check`, and the subsequent full verification suite passed (153 ordinary tests and 42 isolated database tests). Later Phase 5 evidence records the expanded current totals.

## Boundaries and remaining risks

- Some older catch blocks elsewhere still pass raw error objects to `console.error`; they require route-by-route classification because database/provider errors can contain operationally useful but potentially sensitive text.
- No third-party error reporter was installed or configured.
- No log drain, alert, dashboard, cross-service trace propagation, or retention policy was changed.
- No customer email was sent and no production logs were opened or altered.
- This slice does not claim compliance certification; it removes known direct content logging and establishes a testable pattern.
