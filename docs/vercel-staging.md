# Rainmaker Vercel Staging

Rainmaker can now be tested on Vercel without changing the live Replit bridge.
The Replit app should remain production until the Vercel preview proves database,
storage, email, login, quote creation, PDFs, and lead intake.

## Current Status

As of 2026-04-24:

- EDG Vercel project `edgpatioshade/rainmaker` exists and is linked locally.
- The project is set to Node.js `22.x`.
- `vercel build --yes` passes locally when placeholder Vercel-target env vars are supplied.
- No real Preview/Production environment variables have been added to the Vercel project yet.
- No Vercel preview deployment has been created yet.

## Runtime Shape

- `server/app.ts` builds the Express app without calling `listen()`.
- `server/index.ts` still runs the normal long-lived Express server for Replit and local development.
- `api/index.ts` adapts the same Express app to a Vercel Function for preview testing.
- `vercel.json` serves the Vite build from `dist/public` and routes API/object image requests into the Vercel Function.

## Vercel Project

Use a lowercase project name. The repo folder is `EDG-QUOTING`, which is not a
safe Vercel project name.

```bash
vercel link --scope edgpatioshade --project rainmaker --yes
```

Keep `.vercel/` local-only. It identifies the linked Vercel project and should
not be committed.

## Preview Environment

Set these in the Rainmaker Vercel project for Preview first:

```env
NODE_ENV=production
APP_BASE_URL=https://rainmaker-git-preview-url.vercel.app
DATABASE_URL=
SESSION_SECRET=
OBJECT_STORAGE_PROVIDER=vercel-blob
BLOB_READ_WRITE_TOKEN=
EMAIL_PROVIDER=resend
RESEND_API_KEY=
EMAIL_FROM=quotes@email.edgpatioshade.com
EMAIL_FROM_NAME=EDG Patio & Shade
RAINMAKER_API_KEY=
VITE_GOOGLE_PLACES_API_KEY=
OPENAI_API_KEY=
GOOGLE_SERVICE_ACCOUNT_KEY=
OPERATIONS_IMPORT_ON_CLOSED_WON=false
OPERATIONS_IMPORT_URL=
OPERATIONS_BASE_URL=
OPERATIONS_IMPORT_TOKEN=
OPERATIONS_IMPORT_TIMEOUT_MS=
QB_CLIENT_ID=
QB_CLIENT_SECRET=
QB_REDIRECT_URI=
QB_ENVIRONMENT=sandbox
```

Leave QuickBooks disabled in the first Vercel preview unless Jacob specifically
needs to test QuickBooks there.

## Local Readiness Checks

Run these before deploying a preview:

```bash
npm run env:check
npm run check
npm run build
npm run storage:inventory
```

To verify the Vercel-target variable set without real secrets, this shape should
pass:

```bash
NODE_ENV=production \
APP_BASE_URL=https://rainmaker-staging.edgpatioshade.com \
DATABASE_URL=postgres://user:pass@localhost:5432/edg \
SESSION_SECRET=dev-session-secret \
OBJECT_STORAGE_PROVIDER=vercel-blob \
BLOB_READ_WRITE_TOKEN=vercel_blob_test_token \
EMAIL_PROVIDER=resend \
RESEND_API_KEY=re_test \
EMAIL_FROM=quotes@email.edgpatioshade.com \
RAINMAKER_API_KEY=rainmaker_test_key \
VITE_GOOGLE_PLACES_API_KEY=places_test_key \
npm run env:check
```

## Preview Verification

After the first preview deploy:

1. Log in with a staff account.
2. Open Leads and confirm the inbox loads.
3. Submit a lead-intake smoke test against the preview.
4. Confirm the lead appears as `new` and no quote is created.
5. Create a quote manually from an existing test account.
6. Upload a cover photo and product rendering with Vercel Blob enabled.
7. Generate proposal/PDF output.
8. Send one smoke email from the preview sender.
9. Do not connect the production website to the Vercel preview until the above passes.

## Known Gaps Before Production Cutover

- Existing Replit object storage files still need an export/import plan.
- `npm run storage:inventory` should be run against the real Rainmaker database before storage cutover to count quote image references. Add `STORAGE_INVENTORY_INCLUDE_SAMPLES=true` only when file-path samples are needed.
- Browser-direct image upload routes still rely on Replit-style signed upload URLs; server-side quote image uploads have the first Vercel Blob path.
- The first preview should use a staging database or reviewed clone, not an unreviewed destructive migration against production.
- Google Workspace staff OAuth is still a later consolidation step; local username/password auth remains the bridge.
