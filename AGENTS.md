# Rainmaker EDG Quoting Agent Guide

## Project

- Real Codex project folder: `/Users/coltonfoley/Documents/Codex Projects/Rainmaker EDG Quoting/EDG-QUOTING`
- Production URL: `https://rainmaker.edgpatioshade.com`
- Health check: `https://rainmaker.edgpatioshade.com/health`
- Useful auth check: `https://rainmaker.edgpatioshade.com/api/user`
- GitHub remote: `https://github.com/coltonfoley/EDG-QUOTING.git`
- Normal branch: `main`

Rainmaker is the sales, lead, quote, proposal, contract, and handoff source of
truth before a sold job moves to Ops Portal.

## Safe Update Process

Before making changes:

- Confirm the working folder, branch, and current commit.
- Check whether there are existing local edits; preserve unrelated work.
- Inspect the real quote, lead, contract, PDF, or handoff path before changing behavior.
- For quote-entry or customer-facing workflows, create a plan first and wait for user approval before writing live data.

Implementation boundaries:

- Do not send customer emails, proposals, Ops handoffs, vendor orders, pricing changes, payment confirmations, or customer-visible actions unless explicitly approved.
- Keep Rainmaker quote truth separate from Ops Portal post-sale status truth.
- Handoff changes must be idempotent and auditable.

Known fragile areas:

- Serverless startup can fail if API startup imports heavy browser/PDF/backend code too early.
- Be careful around `api/index.ts`, `server/vercelHandler.ts`, `server/integrations/operationsPayload.ts`, and document/PDF generation paths.
- Do not import browser-oriented PDF helpers directly into server startup or serverless request paths without proving they are server-safe.
- If `/health` fails, debug startup imports before chasing deeper UI behavior.

Verification:

- Broad local `npm run check` / `npm run build` can waste time or stall in this checkout. Use targeted checks first.
- Useful scripts include:
  - `npm run smoke:lead-intake`
  - `npm run deploy:prod:verify`
  - `npm run deploy:prod:logs`
- For production work, the reliable proof chain is:
  1. exact commit hash
  2. GitHub Actions success
  3. Vercel deployment `Ready`
  4. live `/health` response
  5. live `/api/user` response when auth/session behavior matters
  6. browser verification for the quote/lead/handoff flow when relevant

Deployment:

- Do not call a change live until commit, push, CI, Vercel, live health, and browser proof are reported separately.
- If the app shows `Loading application...`, check live `/health` and Vercel function logs before assuming a frontend bug.
- If local-only edits exist, do not mentally group them with pushed or deployed code.

