# Rainmaker improvement-plan completion audit

**Date:** 2026-07-11
**Scope:** Release candidate `dc93bc1` plus the current migration-review follow-up against `IMPROVEMENT-PLAN.md`
**Verdict:** The planned product-correctness work is implemented and verified in the private release candidate, the read-only preservation/historical-record/pricing/attachment reviews are complete, the retired Ops backend is removed from the candidate, and EDG has approved the two-role capability policy plus Vercel-only on-demand error review. The program is not production-complete because manual assistive-technology checks and release authorization remain outstanding.

## Status definitions

- **Complete locally:** implemented in this worktree and covered by proportionate local verification.
- **Complete with a manual gap:** the automatable scope is complete; a named human/tool validation remains.
- **Decision required:** code should not choose the business policy.
- **Production-gated:** requires read-only production evidence, backup proof, credentials, or release approval.
- **Intentionally preserved:** retained compatibility/data path under the audit's preservation rule.

## Completion matrix

| Plan area | Status | Evidence | Remaining requirement |
|---|---|---|---|
| 0.1 production truth | Complete for the audit snapshot | `production-baseline-2026-07-10.md` | Refresh commit/deployment/health proof immediately before any release. |
| 0.2 preservation-first data checks | **Complete for additive release; cleanup remains gated** | `production-preservation-report-2026-07-10.md`; `production-record-review-2026-07-10.md`; `preservation-inventory-2026-07-10.md` | Read-only aggregate/ID review, credential rotation, managed connection, and backup-window proof are complete. Create a named child branch from current `main` as the manual restore checkpoint before migration. Preserve the classified historical records; a private locator export remains required before any later object cleanup. |
| 0.3 dependable test baseline | Complete locally | `test-baseline-2026-07-10.md`; isolated PGlite harness; CI workflow | Neon-specific preflight is optional for ordinary tests but advisable before high-risk production migrations. |
| 1A dead visible controls | Complete locally | `phase1-ui-cleanup-2026-07-10.md`; synthetic admin/sales/mobile browser fixtures | Production release only. |
| 1B Ops backend retirement | Complete locally | `phase1b-ops-backend-retirement-2026-07-10.md`; no callable route/integration or active repo configuration remains | Production release and later removal of obsolete Vercel Ops variables. Historical data/compatibility records remain preserved. |
| 1C high-confidence safety fixes | Complete locally | `phase1-safety-fixes-2026-07-10.md`; focused tests | Production release only. |
| 2A signed-version immutability | Complete locally | `phase2-signed-lock-boundary-2026-07-10.md`; `phase2-signed-immutability-2026-07-10.md`; database tests | Preservation audit, migration approval, production rollout. |
| 2B authoritative customer package | Complete locally | `phase2-customer-package-2026-07-10.md`; public-package/snapshot tests; fictional PDF | Approved production release and post-release package comparison. |
| 2C package consolidation | Complete locally | `phase2-package-consolidation-2026-07-10.md`; removed duplicate generator | Production release only. |
| 3A catalog/group source identity | Complete locally | `phase3-catalog-source-identity-2026-07-10.md`; migration and database tests | Migration approval and rollout. |
| 3B exact dimensional pricing | Complete locally and production-preflighted | `phase3-dimensional-pricing-2026-07-10.md`; `production-migration-review-2026-07-11.md`; exact-band and transactional-replacement tests | Read-only production check found 912 bands across both configurable products, with zero missing tables, invalid ranges, negative prices, or inclusive overlaps. Production rollout only. |
| 3C transactional quote/PDF import | Complete locally | `phase3-transactional-quote-import-2026-07-10.md`; rollback/target/provenance tests; chooser-capable fictional-PDF browser rehearsal | Production rollout only; the rehearsal proves editable values and target/price guards while observing zero `/api/quotes/import-batch` requests. |
| 4A inquiry history preservation | Complete locally and production-preflighted | `phase4-lead-client-workflow-2026-07-10.md`; `production-migration-review-2026-07-11.md`; migration and repeat-inquiry tests | The single active attachment retains its account and Blob references. Its historical submission ID predates the retry ledger and is intentionally preserved; migration `0027` keeps account-level attachment compatibility. Production rollout only. |
| 4B lead-to-quote conversion | Complete locally | same Phase 4 report; in-app prefill proof; one-inquiry/one-quote transaction test | Production rollout. |
| 4C account/dashboard truth | Complete locally | same Phase 4 report; browser fixtures and policy tests | Read-only production aggregate comparison after migration. |
| 4D responsive/accessibility automation | Complete locally | `phase4d-usability-accessibility-2026-07-10.md`; 59 route/viewport states, 14 dialog/theme states, and full keyboard/no-write rehearsals | Keep the gate in CI. |
| 4D whole-app theme decision | Complete locally | authenticated core-route dark pass; 14 high-value dialog/theme states; compact Products/Pipeline proof; public signer light isolation | Truly rare legacy-only surfaces are not claimed as exhaustively opened. |
| 4D full keyboard/assistive validation | **Manual gap narrowed** | 59-case gate; six forced-colors and nine 200%-scale-equivalent surfaces; native accessibility-tree signing order; zero sampled invisible/unnamed focus stops; visible in-app focus-ring spot check; separate keyboard drag handle; full ephemeral local-fixture keyboard approval/new-quote/existing-edit flows pass | Complete a human VoiceOver/NVDA interpretation pass and actual browser-zoom spot check. |
| 4D recovery/undo consistency | Complete locally | destructive confirmations; visible load/save errors; optimistic rollback; Pipeline stage Undo; signed-version recovery boundary | Reversible stage moves have explicit Undo; text remains directly correctable; signed changes require versions; destructive actions remain confirmation-gated. Production rollout only. |
| 5A permissions baseline | **Complete locally; owner-approved** | `phase5-permissions-baseline-2026-07-10.md`; authorization policy tests | Two roles only; shared quote workspace; User may create/edit unsigned quotes, create versions, and send approval links; Admin-only version override, catalog/settings, whole-record deletion, and retained legacy resolution. Production release only. |
| 5B migration-only schema/readiness | Complete locally | `phase5-schema-readiness-2026-07-10.md`; fresh restore; `/ready` checks | Production database/readiness proof after approved connection and migration. |
| 5C redacted logs and request correlation | Complete locally | `phase5-redacted-logging-2026-07-10.md`; redaction/request tests | Production log review after release. |
| 5C email delivery evidence/recovery | Complete locally | delivery, reconciliation, and confirmation-recovery reports; ledger tests | Provider-backed production evidence after release; no live email was sent in this work. |
| 5C adoption evidence | Complete for instrumented server events | adoption report plus `phase5-product-workflow-evidence-2026-07-10.md`; minimized event, atomic import/configurator, and admin-summary tests | Product import and Sundance insertion now have authoritative completion points. Weaker client-only clicks remain intentionally unmeasured; counts begin only after deployment. |
| 5C error reporting | **Operating decision complete** | `phase5-error-reporting-decision-2026-07-10.md` | Vercel-only; Codex reviews on request and during approved releases, with Colton as human escalation/approval owner. This is not autonomous monitoring or proactive alerting. |
| 5D targeted decomposition | Complete locally | `phase5d-targeted-decomposition-2026-07-10.md`; bounded policy/service modules | Broader splitting is deliberately deferred until a behavior change supplies a stable boundary. |
| Production release | **Not authorized** | Full local verification passes | Approve preservation audit, migration/release scope, commit/push/CI/Vercel, health/readiness/auth/browser proof, rollback checkpoint, and post-release review. |

## Current verification snapshot

The final local sequence passed:

- TypeScript check.
- 183 ordinary unit/policy tests, with 47 database cases intentionally skipped in that command. Seven obsolete Ops-only tests were removed with the retired integration.
- 47 isolated migrated database tests.
- Production frontend/server/Vercel bundle build; the existing large fonts-chunk warning remains.
- 59 responsive light/dark/public-edge/forced-colors/zoom-equivalent cases and 14 dialog/theme states with no critical/serious axe violations, document overflow, unnamed sampled focus stops, or theme mismatches, plus keyboard approval/new-quote/existing-edit, fictional product-import, and Sundance insertion proof.
- Asset audit, secret audit, and patch-format audit.
- In-app Browser dark-theme inspection of authenticated core routes, compact Products/Pipeline, and light-theme isolation for public signing.
- Git-connected private preview readiness: `/health` 200, `/ready` 200 with 25 tables and 370 expected columns, and signed-out `/api/user` 401.

No production database, customer record, signature, email, deployment, Ops endpoint, or compatibility record was changed.

## Exact next gates

1. **Preservation release gate:** the read-only aggregate and ID-level reviews, live pricing/attachment preflight, credential rotation, managed connection, six-hour PITR proof, and historical-record preservation decisions are complete. Create a named Neon child branch from current `main` immediately before an approved migration as the manual restore checkpoint. A private Blob locator export is required only before any later object cleanup.
2. **Manual UX gate:** complete a human VoiceOver/NVDA interpretation pass and visual focus/browser-zoom spot checks. Native accessibility-tree signing order, computed focus-indicator checks, the chooser-capable PDF review, full ephemeral keyboard public-approval/new-quote/existing-edit flows, forced-colors, and 200% effective-scale reflow are automated.
3. **Release gate:** explicitly authorize the intended local change set, migrations, commit/push, CI, Vercel deployment, live `/health`, `/ready`, authenticated `/api/user`, core browser journeys, rollback checkpoint, and post-release error/email review.
4. **Ops production cleanup gate:** the retired backend/configuration is removed locally. After an approved release proves no callable path remains, remove the obsolete Vercel Ops variables separately. Stored customer/project/legacy records remain untouched.

## Completion decision

Do not mark the overall goal complete yet. The local engineering plan has reached a reviewable release candidate, but the program's own completion criteria still require the manual validation gaps and an authorized production proof chain. Those are explicit gates, not reasons to weaken the preservation or no-deploy constraints.
