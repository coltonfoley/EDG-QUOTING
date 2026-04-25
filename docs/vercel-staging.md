# Rainmaker Vercel Staging

Rainmaker can now be tested on Vercel without changing the live Replit bridge.
The Replit app should remain production until the Vercel preview proves database,
storage, email, login, quote creation, PDFs, and lead intake.

## Current Status

As of 2026-04-25:

- EDG Vercel project `edgpatioshade/rainmaker` exists and is linked locally.
- The project is set to Node.js `22.x`.
- `npm run check` and `npm run build` pass locally.
- The Vercel prebuilt flow is the known-good deployment path: `vercel build --target=preview --yes`, `npm run vercel:bundle-function`, then `vercel deploy --prebuilt`.
- A Neon database named `rainmaker-staging` is connected to the Vercel `rainmaker` project for Preview and Development.
- The Neon connection creates `DATABASE_URL` and related encrypted database variables for Preview and Development only.
- Stable staging subdomain: `https://rainmaker-staging.edgpatioshade.com`.
- Latest verified staging deployment: `https://rainmaker-lseb4k9bw-edgpatioshade.vercel.app`.
- Staging health, login, leads, accounts, products, quotes, quote image uploads, Rainmaker-to-Ops closed-won handoff, and large PDF/AI quote import have all passed.

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
APP_BASE_URL=
DATABASE_URL=
SESSION_SECRET=
ADMIN_USERNAME=
ADMIN_PASSWORD=
ADMIN_EMAIL=
ADMIN_FIRST_NAME=
ADMIN_LAST_NAME=
ADMIN_ROLE=admin
ADMIN_UPDATE_PASSWORD=false
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
OPERATIONS_VERCEL_BYPASS_SECRET=
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
vercel build --target=preview --yes
npm run vercel:bundle-function
npm run storage:inventory
npm run storage:migrate-to-blob
```

After a fresh staging database is provisioned and migrated, create the first
staff login from environment variables instead of using the legacy hardcoded dev
admin:

```bash
ADMIN_ENV_FILE=.vercel/.env.preview.local npm run db:create-admin
```

To verify the Vercel-target variable set without real secrets, this shape should
pass:

```bash
NODE_ENV=production \
VERCEL_URL=rainmaker-git-preview-url.vercel.app \
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
8. Import a large OEM PDF quote through the browser-rendered vision path.
9. Send one smoke email from the preview sender.
10. Do not connect the production website to the Vercel preview until the above passes.

## Known Gaps Before Production Cutover

- Existing Replit-hosted quote image URLs still need to be copied into Vercel Blob after the final production DB copy.
- `npm run storage:inventory` was run against the real Rainmaker database on 2026-04-25. It found 9 quote cover photo rows and 234 product rendering rows, all stored as absolute Replit-hosted URLs.
- `npm run storage:migrate-to-blob` is ready for the final copied database. A dry run against production data with `MIGRATE_STORAGE_LIMIT=1` downloaded one cover photo and one product rendering successfully without changing any rows.
- Staging PDF import is verified with `OPENAI_API_KEY` using browser-side PDF rendering. Server-side PDF text/image conversion still hits Vercel canvas/Chrome limits and should not be the primary cutover path.
- Browser-direct image upload routes now support Vercel Blob client uploads on staging while preserving the Replit signed-upload path for live Replit.
- The first preview should use a staging database or reviewed clone, not an unreviewed destructive migration against production.
- Google Workspace staff OAuth is still a later consolidation step; local username/password auth remains the bridge.
