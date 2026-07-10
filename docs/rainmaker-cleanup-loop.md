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
- [ ] Rewrite the authoritative history in an isolated clone.
- [ ] Validate zero valid private keys, clean Git integrity, tests, type-check, build, asset audit, migration restore, and dependency audit.
- [ ] Update GitHub `main` to the validated cleaned history.
- [ ] Delete obsolete GitHub branches after the new `main` is healthy.
- [ ] Remove obsolete local branches and stale worktree registrations.
- [ ] Verify GitHub Actions, Vercel Ready, live health, live auth, and relevant browser workflows.

## Evidence

- Authoritative candidate branch: `codex/rainmaker-security-stabilization`
- Candidate commit before rewrite: `3562162`
- Candidate commits ahead of local `main`: `47`
- Verified backup: `Rainmaker Data Archive/EDG-QUOTING-before-history-cleanup-2026-07-09-2009.bundle`
- Backup SHA-256: `7490177f283ff6563801fde93ee321105ee19440c14541b8b42b6fb83799274a`
- Disposable rewrite result: `0` valid private keys, `0` missing Git objects, Git integrity passed.
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
