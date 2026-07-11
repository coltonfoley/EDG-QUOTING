# Rainmaker private-preview scope

**Date:** 2026-07-10
**Branch:** `codex/rainmaker-improvement-plan`
**State:** published to an isolated private preview; production remains unchanged

## Purpose

The private preview is intended to let EDG review the complete Rainmaker improvement release without changing the production application or production database. Vercel is configured so future Preview deployments receive isolated Neon branches. Development no longer receives the live database connection.

## Intended preview contents

1. Removal of retired or misleading UI, including Send to Ops, Bell, Rep affordances, stale Templates navigation, and duplicate proposal configuration.
2. Retirement of the callable Ops backend, integration modules, repo environment configuration, and obsolete send-behavior tests.
3. Signed-version immutability, transactional quote versions, and audit events.
4. One authoritative customer package for preview, signing, stored snapshot, and receipt PDF.
5. Catalog source identity, exact dimensional pricing, and transactional catalog/quote imports.
6. Returning-inquiry history, lead-to-quote conversion, account truth, pipeline recovery, and clearer daily navigation.
7. Owner-approved user/admin permissions, migration-only schema readiness, redacted request/error logs, email-delivery evidence, and minimized adoption events.
8. Additive migrations `0023` through `0030`, isolated-database test tooling, browser/accessibility fixtures, and the durable audit reports.
9. The production database logging hotfix and its regression test, preserved when the branch is synchronized with current `main`.

## Intentional deletions

- `client/src/components/simple-proposal-generator.tsx`, replaced by the single Customer Package Builder.
- `client/src/components/planning-agreement-panel.tsx`, an unmounted legacy creation panel.
- `client/src/components/quote-approval-drawing-panel.tsx`, an unmounted legacy creation panel.
- `server/integrations/operations.ts`.
- `server/integrations/operationsDocuments.ts`.
- `server/integrations/operationsPayload.ts`.
- `server/tests/operations.test.ts`.
- `server/tests/operations-guards.test.ts`.

No customer record, project record, quote history, signed snapshot, planning agreement, approval drawing, document, image, Blob locator, QuickBooks compatibility field, or internal note is deleted.

## Synchronization requirement

The working branch began before production hotfix commit `e3664f7`. Before publication, the intended local scope must be committed and then synchronized with current `origin/main`. The database logging regression test currently exists as a local untracked file because it was introduced on `main` after the branch point; it must be included so the larger release cannot regress the credential-safe logging behavior.

This requirement is now complete. The review branch was rebased onto `e3664f7`, pushed, and opened as draft pull request #12. The first review commit is `313e71a`; the public-sign keyboard follow-up is `b4e3b72`.

## Isolated preview database evidence

- Neon created child branch `preview/codex/rainmaker-improvement-plan` (`br-fragrant-hat-an9iuwdg`) from `main` for this review branch.
- The additive migrations `0023` through `0030` were run only on that child branch in one transaction. The final metadata-only proof confirmed `quote_version_events`, `lead_inquiries`, `email_delivery_attempts`, and `business_events` are present.
- Production schema and customer records were not migrated or changed.
- Vercel's integration-created preview connection did not override the project's older general `DATABASE_URL` for the already-created deployment. A sensitive `DATABASE_URL` override was therefore added for `Preview (codex/rainmaker-improvement-plan)` only. Production's environment setting was not changed.
- A fresh preview deployment is required after that branch-only environment change; the prior deployment's `/ready` response is not release evidence.

## Current verification

- 183 ordinary tests pass; 47 database cases are skipped in that command and pass separately against the isolated migrated database, including the new production-schema-drift case.
- Focused retired-route, approval-drawing, permissions, request-redaction, and database-logging set: 82 tests pass.
- TypeScript check passes.
- Production build and Vercel bundle pass; the existing large-fonts-chunk warning remains.
- Secrets audit passes with no findings.
- Patch-format check passes.
- The previously completed 59-case responsive/accessibility gate and 14 dialog/theme states remain the visual baseline; the Ops cleanup changed no UI.

## Not authorized by preview approval

A private preview does not authorize production deployment, production migrations, customer email, signature requests, quote changes, stored-data cleanup, Ops calls, or removal of compatibility records. A named Neon child branch from current `main`, created immediately before migration as the manual restore checkpoint, and separate explicit approval are required before production migrations or deployment.
