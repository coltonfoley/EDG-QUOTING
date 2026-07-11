# Phase 1B — retired Ops backend removal

**Date:** 2026-07-10
**State:** complete locally; not committed, pushed, previewed, or deployed

## Decision and evidence

EDG confirmed that the Ops Portal is retired and Rainmaker must no longer send to it. The production baseline found no `send-to-ops` event in the available 30-day Vercel log window and no dedicated persisted Ops job ID or request-log column. The later read-only preservation audit and ID-level review confirmed that historical internal notes, drawings, agreements, signed snapshots, documents, and stored assets must remain, but removing the callable Ops code does not require deleting any of that data.

## Removed locally

- `POST /api/quotes/:id/send-to-ops` and its server import.
- `server/integrations/operations.ts`.
- `server/integrations/operationsPayload.ts`.
- `server/integrations/operationsDocuments.ts`.
- The Ops environment template and environment-validator warning.
- Tests that built, guarded, or asserted the retired handoff.
- Ops-only approval-drawing payload tests; approval-drawing compatibility/readiness tests remain.

The authorization policy now explicitly asserts that no retired Ops endpoint or integration call remains.

## Preserved intentionally

- Customer, account, quote, and project records.
- Quote `internal_notes` and all other historical context.
- Existing planning-agreement and approval-drawing tables/records.
- Signed snapshots, signature history, document assets, image references, and Blob locators.
- Unrelated Neon inventory history about the former Ops database.

The two historical approval-drawing plans are retained with prominent warnings that their Ops instructions are obsolete and must not be revived.

## Production boundary

No production deployment, data write, environment-variable deletion, customer action, or Ops request occurred. The obsolete Ops variables currently stored in Vercel should be removed only after an approved Rainmaker release proves that production no longer contains the callable route.
