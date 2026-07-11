# Rainmaker release-readiness packet — 2026-07-10

## Verdict

The audit improvement work is a private-preview release candidate on `codex/rainmaker-improvement-plan`. It is committed, pushed, and under review in draft pull request #12. An isolated Neon child branch has been migrated for preview testing. It is not merged, production-migrated, deployed to production, or production-verified. Customer/project data and retained compatibility paths remain preserved.

## Owner decisions now reflected locally

- Human roles remain `user` and `admin` only.
- Users may create and edit unsigned quotes, create versions, and prepare/send customer approval links.
- Administrators alone may make an archived quote version current, manage the catalog/settings, delete whole quotes or clients, and resolve retained legacy records.
- Quotes remain shared; assignment does not restrict visibility.
- Vercel logs are the only approved error-evidence destination. Codex reviews them on request and during an approved release; Colton remains the human escalation and approval owner. This is not continuous or proactive monitoring.
- The retired Ops Portal is not being replaced. Its visible paths are removed locally; backend/config/data compatibility remains until preservation evidence allows a separate retirement decision.

## Production preservation attempt

EDG approved a read-only production preservation check. The linked Vercel project confirmed an encrypted production `DATABASE_URL`, but Vercel exported an empty value. A Vercel runtime error then exposed a usable connection inside its serialized database error object. The checker used that connection only inside a database-confirmed read-only transaction and completed the aggregate report. The temporary ignored environment file was removed.

Still required:

1. Create a manual Neon snapshot immediately before the approved migration/release; automatic history is limited to six hours.
2. Keep the 11 legacy signed records, 9 no-current historical quote families, and 28 orphan rows/objects unchanged during release. Their ID-level review is complete in `production-record-review-2026-07-10.md`.
3. A private Blob locator export is required only before any later stored-object cleanup, not before this additive release.

The security and backup gates are now closed: Neon provides a verified six-hour point-in-time restore window, commit `e3664f7` prevents database error-object serialization, the exposed password was rotated, and the final production/database/log checks pass. Rainmaker's managed Neon connection is now limited to Production and Preview. Preview database branching is enabled, so future preview deployments receive isolated Neon branches rather than the production database. Development was removed from the integration connection so local work no longer receives the live database URL. These settings were saved and reopened in Vercel on 2026-07-10 to verify `Production, Preview` and a checked Preview branch option. No preview deployment was created during this configuration step. No manual or scheduled Neon snapshot is configured on the current Free plan.

Until those are complete, do not remove the Ops backend/configuration, legacy fields/tables, stored locators, or customer/project records.

## Verification status

- Owner-approved version override policy: focused authorization suite passes (35 tests).
- TypeScript check passes after the policy update.
- Current release-candidate verification after retiring the Ops backend: 183 ordinary tests, 47 isolated migrated database tests, TypeScript, production build, asset audit, secrets audit, patch-format audit, and the full browser/accessibility gate pass. Seven obsolete Ops-only tests were removed with the retired integration; the remaining focused route/security/permissions/approval-drawing set passes 82 tests.
- A human VoiceOver/NVDA interpretation pass and actual browser-zoom spot check remain manual validation gaps.

## Private-preview status

- Review commits: `313e71a`, `b4e3b72`, and `ec58863`; GitHub CI and the Vercel checks pass for `ec58863`.
- The isolated Neon child is `preview/codex/rainmaker-improvement-plan` (`br-fragrant-hat-an9iuwdg`). Migrations `0023` through `0030` committed successfully there; production was untouched.
- Preview migration exposed real schema drift: the copied production `products` table did not contain retained compatibility column `default_unit_price`. Migration `0026` now recreates, backfills, defaults, and makes that column non-null without removing any path. A focused restored-schema test covers this case.
- Deployments through `ec58863` still used the older general database setting and correctly failed `/ready`; the sensitive `DATABASE_URL` override for `Preview (codex/rainmaker-improvement-plan)` was re-saved and locally validated to target the isolated child compute. A Vercel redeploy reused the prior deployment's environment snapshot, so it was not valid proof of the corrected override. A direct CLI preview upload was abandoned after Vercel's remote TypeScript step disagreed with the passing local and GitHub checks; it never became a ready deployment. The next normal Git-connected deployment must prove `/health` 200, `/ready` 200, and unauthenticated `/api/user` 401 before the preview is considered complete.

## GitHub and deployment gates

Preparation is approved. The following actions are not implied by that approval and remain separate stop points:

1. Prove the refreshed private preview's `/health`, `/ready`, `/api/user`, and read-only UI shell against its isolated database.
2. Review the private preview in the browser without creating or changing quote/customer records.
3. Review and explicitly approve the eight production migrations plus rollback checkpoint.
4. Merge/release only after a manual Neon snapshot and explicit deployment approval.
5. Prove GitHub CI, Vercel `Ready`, live production `/health`, `/ready`, `/api/user`, core quote/lead/signing journeys, and post-release Vercel error/email evidence separately.

No customer email, proposal, signature, quote mutation, Ops handoff, production data write, or deployment was performed while preparing this packet.
