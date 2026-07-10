# Rainmaker cleanup loop

## Outcome

Keep one authoritative Git branch (`main`), remove reachable private-key material from Git history, preserve every pre-cleanup ref in a verified offline bundle, and prove the cleaned application through local checks, GitHub Actions, Vercel, and live read-only checks.

## Safety rules

- Do not modify live customer or business data.
- Do not send customer communications.
- Preserve the complete pre-cleanup repository before rewriting or deleting refs.
- Perform and validate the rewrite in an isolated clone before updating GitHub.
- Stop if key removal, Git integrity, tests, build, CI, deployment, or live verification fails.

## Loop checklist

- [x] Current-tree secret audit passes.
- [x] Reachable-history audit identifies three valid key blobs representing two unique RSA keys.
- [x] Disposable rewrite removes all valid key blobs and passes Git integrity checks.
- [x] Complete pre-cleanup Git bundle created and verified.
- [x] Inventory local branches, remote branches, linked worktrees, and open pull requests.
- [x] Confirm which branch tip contains the authoritative application state.
- [x] Rewrite the authoritative history in an isolated clone.
- [x] Validate zero valid private keys, clean Git integrity, tests, type-check, build, asset audit, migration restore, and dependency audit.
- [x] Update GitHub `main` to the validated cleaned history.
- [x] Delete obsolete GitHub branches after the new `main` is healthy.
- [x] Remove obsolete local branches and stale worktree registrations.
- [x] Verify GitHub Actions, Vercel Ready, live health, live auth, and relevant browser workflows.

## Evidence

- Authoritative candidate branch: `codex/rainmaker-security-stabilization`
- Candidate commit before rewrite: `3562162`
- Candidate commits ahead of local `main`: `47`
- Verified backup: `Rainmaker Data Archive/EDG-QUOTING-before-history-cleanup-2026-07-09-2009.bundle`
- Backup SHA-256: `7490177f283ff6563801fde93ee321105ee19440c14541b8b42b6fb83799274a`
- Final full pre-rewrite backup: `Rainmaker Data Archive/EDG-QUOTING-full-pre-rewrite-2026-07-09-2015.bundle`
- Final backup SHA-256: `e788fd0a84cc0f2a754fa31c177dac103bee71d34895b138b07210d7736cea5b`
- Disposable rewrite result: `0` valid private keys, `0` missing Git objects, Git integrity passed.
- Cleaned authoritative branch: `main` at `aa83ab9` before the evidence-log commit.
- Cleaned local validation: 96 tests passed; type-check, production build, current secret audit, history secret audit, asset audit, migration audit, Git integrity, and production dependency audit passed.
- Published cleaned commit: `dcf798a0038b789e653a9a7a880b9b5f2469439c`.
- GitHub Actions: CI run `29065676704` passed every gate.
- Vercel production deployment: `rainmaker-5gwfxpf3u-edgpatioshade.vercel.app` reached `Ready`.
- Live API verification: `/health` returned `200`, unauthenticated `/api/user` returned `401`, and a missing quote image returned `404`.
- Live auth verification: `/api/auth/google/status` returned `{"enabled":true}`.
- Live CSP verification: scripts allow only self and Google Maps; unsafe eval, unsafe inline scripts, retired Replit origins, OpenAI browser access, and unrestricted WebSockets are absent.
- Live browser verification: only “Continue with Google Workspace” is present; there are zero password/text login fields and no AI assistant UI.
- Final branch state: one local branch (`main`), one GitHub branch (`main`), one local worktree, and zero open pull requests.
- Final reachable-history audit: zero valid private keys and zero missing Git objects.
- GitHub default branch: `main`; branch protection is not configured.
- Open pull requests: PR `#11` only (`codex/rainmaker-replit-cleanup` -> `main`).
- Branch containment: all local branches except `codex/rainmaker-replit-cleanup` are ancestors of the authoritative candidate.
- Superseded branch: `codex/rainmaker-replit-cleanup` has two unique commits; its cleanup and approval-drawing outcomes are superseded in the newer candidate tree and preserved in the bundle.
- Stale linked worktrees: `/private/tmp/rainmaker-sales-reply-to` and `/private/tmp/rainmaker-sku-release`; both registrations are prunable because their directories no longer exist.

## Progress log

- 2026-07-09: User authorized repository simplification, history cleanup, and a tracked execution loop.
- 2026-07-09: Created this tracker before changing branches or remote history.
- 2026-07-09: Confirmed GitHub `main` is the default branch, CI is active, and only obsolete PR #11 remains open.
- 2026-07-09: Selected `codex/rainmaker-security-stabilization` as the authoritative tree; all other work remains recoverable from the verified bundle.
- 2026-07-09: Rewrote the authoritative history in `/tmp/edg-quoting-clean-main`, removed all three valid private-key blobs, and collapsed the clone to one `main` branch.
- 2026-07-09: Completed the full local validation gate on the cleaned branch; all required checks passed.
- 2026-07-09: Force-updated GitHub `main` with an exact lease, then confirmed CI and the resulting Vercel production deployment passed.
- 2026-07-09: Closed superseded PR #11 and deleted every remote branch except `main`.
- 2026-07-09: Aligned the workspace to cleaned `main`, deleted all obsolete local branches, pruned stale worktrees, expired old reflogs, garbage-collected unreachable history, and revalidated zero reachable private keys.
