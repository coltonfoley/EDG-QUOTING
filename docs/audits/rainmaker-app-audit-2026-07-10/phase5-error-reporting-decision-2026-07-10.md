# Phase 5 error-reporting decision gate

**Date:** 2026-07-10
**Status:** Vercel-only review approved; no reporter, drain, webhook, account, environment variable, alert, or production setting was created
**Current truth:** Rainmaker emits redacted request-correlated runtime logs, but no external service or person is automatically notified

## Approved operating decision

EDG selected Vercel Runtime Logs/Observability only. Codex is the designated reviewer when Colton asks for a Rainmaker error check and during an approved release verification. Colton remains the human escalation and approval owner.

This is an on-demand review process, not autonomous monitoring: Codex cannot receive alerts or continuously watch production between tasks. The UI must therefore never claim that an error was automatically reported or that someone was notified. If EDG later needs proactive alerts, that requires a separately approved monitoring destination, human recipient, retention policy, and privacy review.

## Options

### A. Vercel-only runtime logs

Keep the current redacted structured logs and use Vercel's Runtime Logs/Observability as the only diagnostic surface.

- Lowest implementation and data-sharing burden.
- Available without adding a third-party SDK.
- Request IDs already let an operator correlate the customer-visible error with server logs.
- Requires a named person and a recurring/manual review process; it is not proactive exception notification.
- Retention depends on the Vercel plan. Vercel currently documents runtime-log retention ranging from one hour on Hobby to one day on Pro, with longer windows on Observability Plus/Enterprise.

Choose this only if EDG explicitly accepts that the UI must never say “we were notified” and that errors may remain unseen until someone checks.

### B. Sentry for browser and server exceptions — recommended if proactive alerts are required

Add an approved Sentry project and report sanitized unhandled browser/server exceptions with Rainmaker request ID, route family, release/commit, and environment.

- Best fit for issue grouping, stack traces, release correlation, ownership, and alerts across the React client and Express/Vercel server.
- Adds a third-party processor, account/DSN, SDK weight, source-map handling, access management, and retention decisions.
- Must default to no customer identity or content: no request/response body, cookies, authorization headers, signing tokens, email, names, addresses, filenames, dimensions, prices, signatures, account/quote payloads, or IP addresses.
- Disable default PII; apply client `beforeSend` and server scrubbers; turn off session replay, screenshots, attachments, AI input/output capture, and broad breadcrumbs for the first release.
- Start with exceptions only and no performance tracing until the sanitized payload is inspected in a non-production project.

This option requires EDG to provide or approve the Sentry organization/project, the alert recipient/owner, retention period, and access list before code is added.

### C. Vercel Log Drain to an existing approved vendor

Forward production runtime logs to a vendor EDG already uses.

- Appropriate when EDG already has an approved logging/observability destination and responsible owner.
- Vercel currently limits Drains to Pro/Enterprise and supports environment/source filters and sampling.
- A drain forwards log records; it does not replace application-level scrubbing. The current redacted logging contract must remain.
- Requires destination credentials, vendor retention/access policy, cost approval, and drain health monitoring.

Do not create a custom webhook or new vendor solely to avoid choosing an owner.

## Recommendation

If EDG wants proactive alerting, choose **B: Sentry exceptions-only** with strict privacy controls and one named owner. If EDG does not want another vendor, formally choose **A: Vercel-only**, document the manual review cadence, and accept that there is no automatic notification.

A Log Drain is preferable only if EDG already has an approved destination.

## Questions only if proactive monitoring is added later

1. **Destination:** Sentry or an existing named drain vendor?
2. **Primary human owner:** Who receives/triages Rainmaker production alerts?
3. **Backup owner:** Who covers absences?
4. **Alert threshold:** Every new production issue, repeated issue, or only error-rate/availability thresholds?
5. **Retention:** How long may sanitized events be stored?
6. **Access:** Which EDG accounts can view events?
7. **Environment:** Production only, or preview and production separated?
8. **Data policy:** Confirm the prohibited fields above and whether IP collection must be disabled.

## Acceptance criteria for any later proactive reporter

- Reporter initialization remains serverless-safe and does not make `/health` depend on a third party.
- Reporting failure never blocks a quote, signature, email, pricing, import, or lead action.
- Browser and server events contain only the allowlisted context.
- A fixture exception is captured in a non-production reporter project and the exact payload is inspected.
- The owner receives a test alert and can correlate it to the Rainmaker request ID.
- The error boundary still uses truthful language; notification wording is added only after end-to-end alert proof.
- Production enablement remains a separate explicit approval and deployment-proof step.

## Current official references

- [Vercel Runtime Logs](https://vercel.com/docs/logs/runtime)
- [Vercel Observability](https://vercel.com/docs/observability)
- [Vercel Drains](https://vercel.com/docs/drains/using-drains)
- [Sentry organization privacy and data-scrubbing controls](https://docs.sentry.io/api/organizations/update-an-organization/)

## Safety

This is an operating decision record only. The Vercel project and encrypted variable names were inspected read-only while preparing the release; no runtime customer log content, Vercel setting, drain, Sentry account, SDK, secret, alert, or customer data was accessed or changed.
