# Rainmaker production baseline — 2026-07-10

This is the read-only Phase 0 production baseline. It separates local, GitHub, Vercel, live HTTP, and authenticated browser evidence. No application data was changed and no deployment was performed.

## Baseline verdict

Local `main`, GitHub `main`, the successful GitHub Actions run, and the active Vercel production deployment all resolve to commit `154988e0656c3cfe58cac88c6c661f332a912ae3`.

The live health endpoint returned HTTP 200, an unauthenticated `/api/user` request returned HTTP 401, and an authenticated in-app Browser session rendered all seven core staff screens without a visible route error.

## Source-of-truth chain

| Surface | Read-only result | Evidence |
|---|---|---|
| Local repository | Root is this repository; branch `main`; `HEAD` is `154988e…`; only audit artifacts are untracked | Local Git inspection, 2026-07-10 |
| GitHub | `origin/main` is `154988e…` | Git remote plus GitHub CLI |
| GitHub Actions | Run `29090675671` succeeded for `154988e…`; title `Remove unused issue reporting feature` | <https://github.com/coltonfoley/EDG-QUOTING/actions/runs/29090675671> |
| Vercel | Deployment `dpl_4NjqoVmrT9k8GH53XhYV8rhvGbrU` is `READY`, target `production`, commit `154988e…` | Vercel deployment API/CLI |
| Production alias | `https://rainmaker.edgpatioshade.com` points to the ready deployment | Vercel alias metadata |
| Live liveness | `/health` returned HTTP 200 with status `ok` | Direct read-only HTTP check |
| Live auth boundary | Unauthenticated `/api/user` returned HTTP 401 | Direct read-only HTTP check |
| Authenticated UI | Production rendered the signed-in shell and Admin navigation | Codex in-app Browser, read-only |

Vercel created the active deployment on 2026-07-10 at 06:52:45 CDT. GitHub records the deployed commit at 2026-07-10 11:50:35 UTC.

## Authenticated core-route check

Each route was opened directly in the authenticated production session and allowed to finish loading. The check inspected headings, navigation presence, and visible error indicators only.

| Route | Loaded heading | Navigation | Visible error indicator |
|---|---|---:|---:|
| `/` | CRM Dashboard | Yes | 0 |
| `/leads` | Website Leads | Yes | 0 |
| `/accounts` | Client Management | Yes | 0 |
| `/quotes` | Project Quotes | Yes | 0 |
| `/pipeline` | Sales Pipeline | Yes | 0 |
| `/products` | Products | Yes | 0 |
| `/admin` | Administration | Yes | 0 |

This proves availability and authenticated rendering, not correctness of every record or action. The fuller UI evidence remains in the [main audit](README.md) and `screenshots/` directory.

## Route and API inventory

The browser router exposes:

- Public: `/sign/:token`, `/planning-agreements/sign/:token`, `/auth`.
- Authenticated staff: `/`, `/accounts`, `/accounts/:id`, `/leads`, `/quotes`, `/pipeline`, `/quotes/new`, `/quotes/:id/edit`, `/products`, `/contracts`, `/admin`, `/admin/contracts`.
- Catch-all: not-found screen.

Source: `client/src/App.tsx:87-117`.

There are 140 declared server handlers including `/health`:

| Area | Handlers | Source |
|---|---:|---|
| Core user/admin/contracts/pricing defaults | 17 | `server/routes.ts` |
| Google authentication/logout | 4 | `server/auth.ts` |
| Accounts/customers/clients compatibility | 18 | `server/routes/accountRoutes.ts` |
| Website leads and attachments | 4 | `server/routes/leadIntakeRoutes.ts` |
| Quotes/import/versioning/signing/documents/Ops | 38 | `server/routes/quoteRoutes.ts` |
| Quote groups and line items | 14 | `server/routes/lineItemRoutes.ts` |
| Products/pricing/colors | 22 | `server/routes/productRoutes.ts` |
| Planning agreements | 16 | `server/routes/planningAgreementRoutes.ts` |
| Image/object/brand asset access | 6 | `server/routes/imageRoutes.ts` |
| Health | 1 | `server/app.ts:26` |

The account/customer/client duplication is compatibility today; it must not be removed until production reference counts and consumers are known.

## Production environment-name inventory

Only names were retained. Values were not printed or copied into this report.

Application-specific production names include `APP_BASE_URL`, `BLOB_READ_WRITE_TOKEN`, `DATABASE_URL`, email configuration, Google authentication/workspace configuration, `OBJECT_STORAGE_PROVIDER`, `OPENAI_API_KEY`, `OPERATIONS_BASE_URL`, `OPERATIONS_IMPORT_TOKEN`, QuickBooks configuration, `RAINMAKER_API_KEY`, `RESEND_API_KEY`, `SESSION_SECRET`, and `VITE_GOOGLE_PLACES_API_KEY`.

The production environment still contains retired Ops names `OPERATIONS_BASE_URL` and `OPERATIONS_IMPORT_TOKEN`. Preview also lists additional Ops configuration. Remove these only with the controlled backend retirement, after the final data/reference check.

Vercel's production environment pull returned `DATABASE_URL` as present but non-exportable/empty, consistent with a sensitive value. No credential was exposed.

## Retired Ops dependency result

### Confirmed

- The owner states that Ops Portal is retired and Rainmaker must no longer send to it.
- The production UI still exposes `Send to Ops` in `client/src/components/quote-header.tsx:210` and `:521-552`.
- The backend endpoint remains at `server/routes/quoteRoutes.ts:1317`.
- The outbound integration remains in `server/integrations/operations.ts` and `server/integrations/operationsPayload.ts`.
- Environment validation still asks for Ops configuration in `scripts/validate-env.mjs:142-144` and `.env.example:43-46`.
- Tests still protect the old behavior in `server/tests/operations.test.ts`, `server/tests/operations-guards.test.ts`, `server/tests/approval-drawing.test.ts`, and `server/tests/authorization-policy.test.ts:78`.
- GitHub code search across the authenticated `coltonfoley` scope found the outbound endpoint/configuration references only in `EDG-QUOTING`.
- A redacted Vercel production-log query for `send-to-ops` found zero events in the preceding 30 days. This is supporting evidence only; retention and search coverage are not guaranteed.
- The Rainmaker schema has no dedicated persisted Ops job ID or request-log column.

### Not yet proven

- Historical Ops requests outside the available Vercel log window.
- Whether an external automation calls the endpoint without searchable log text.
- Whether legacy records depend on notes, drawing states, or agreement states formerly used during handoff.

### Decision

Treat Ops as retired and remove it as one bounded package after the preservation inventory runs. Remove the UI, endpoint, integration modules, Ops-only validation/configuration, and tests that assert sending behavior. Preserve customer/project records, `internal_notes`, signed snapshots, drawings, agreements, and document assets unless the data audit separately proves a field is safe to retire.

## Limitations

- A standalone authenticated `/api/user` tab was blocked by the browser client. The authenticated app shell and Admin route rendered successfully, providing session evidence for the UI baseline.
- No production mutation, signature request, email, import, delete, stage change, or Ops handoff was attempted.
- Aggregate database integrity is covered separately in [preservation-inventory-2026-07-10.md](preservation-inventory-2026-07-10.md).
