# Phase 5B local evidence — migration-only schema and readiness

**Date:** 2026-07-10
**Status:** Initial Phase 5B slice implemented and verified locally; not committed, pushed, deployed, or run against production data
**Scope:** Remove request-time schema writes and distinguish liveness from database/schema readiness

## Outcome

Ordinary Rainmaker requests no longer execute `CREATE TABLE`, `ALTER TABLE`, data backfills, or index creation through `server/db.ts`. The former `ensure*` compatibility entry points now perform one cached, read-only schema assertion. The authoritative schema changes remain the 29 ordered SQL files in `migrations/manifest.json`, which restore successfully into an isolated PostgreSQL-compatible database.

`/health` remains a lightweight liveness response. A separate `/ready` route now loads the application, connects to the database, compares every Drizzle-declared table and column with `information_schema.columns`, and returns HTTP 503 without internal schema details when the database is unavailable or incomplete.

## Changes

- `server/db.ts`
  - removes all request-time DDL and data backfills;
  - adds `checkDatabaseReadiness`, a read-only declared-schema comparison;
  - adds `DatabaseReadinessError` and a cached `assertDatabaseSchemaReady` compatibility boundary;
  - redacts unexpected pool errors to the error class rather than logging the provider error object.
- `server/app.ts` adds `/ready`, returning `ready` only after the database/schema check succeeds.
- `vercel.json` and `scripts/bundle-vercel-function.mjs` route `/ready` to the serverless application while preserving the direct lightweight `/health` path.
- `scripts/verify-production-deploy.mjs` requires both liveness and readiness in any future production proof chain.
- `server/tests/authorization-policy.test.ts` prevents DDL from returning to `server/db.ts` and locks the readiness routing/deployment checks in place.

## Verification

| Check | Result |
|---|---|
| Ordinary unit/policy suite | Pass — 145 tests; 42 database tests skipped in this command |
| Isolated migrated database suite | Pass — 42 tests |
| Fresh migration/schema audit | Pass — 29 files, 29 manifest entries, no missing files or duplicate prefixes |
| TypeScript | Pass |
| Production build | Pass |
| Asset audit | Pass |
| Secret audit | Pass |
| Patch formatting | Pass |

The production build still reports the previously known large-chunk warning; this slice does not claim a performance fix.

## Boundaries and deployment gate

- No migration ran against production, and no production database connection was opened.
- Production readiness is **not** proven. The repository-only schema audit reports `database: null` because a usable read-only production connection and backup/reference evidence are still unavailable.
- The compatibility aliases remain temporarily so this safety change does not combine a broad storage-layer rename with migration behavior. They are read-only assertions, not schema repair functions.
- A future deployment must apply and verify the reviewed migrations before application promotion; `/ready` is intentionally expected to fail when the database schema is incomplete.
- No legacy table, column, attachment path, planning-agreement record, approval-drawing record, or Ops compatibility data was removed.
