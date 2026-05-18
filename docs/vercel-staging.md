# Rainmaker Vercel Staging

Rainmaker can now be tested on Vercel without changing the live Replit bridge.
The Replit app should remain production until the Vercel preview proves database,
storage, email, login, quote creation, PDFs, and lead intake.

## Current Status

As of 2026-04-25:

- EDG Vercel project `edgpatioshade/rainmaker` exists and is linked locally.
- The Vercel project and repo are both pinned to Node.js `22.x`.
- Preview/staging should use the direct prebuilt flow: `npm run build`, `npm run vercel:bundle-function`, then `vercel deploy --prebuilt`.
- Production was redeployed through the Vercel REST API because the locally installed Vercel CLI is too old for the current production deploy endpoint.
- A Neon database named `rainmaker-staging` is connected to the Vercel `rainmaker` project for Preview and Development.
- The Neon connection creates `DATABASE_URL` and related encrypted database variables for Preview and Development only.
- Stable staging subdomain: `https://rainmaker-staging.edgpatioshade.com`.
- Latest verified staging deployment: `https://rainmaker-lseb4k9bw-edgpatioshade.vercel.app`.
- Staging health, login, leads, accounts, products, quote image uploads, and large PDF/AI quote import have all passed.

## Production Cutover

As of 2026-04-25:

- Live Vercel URL: `https://rainmaker.edgpatioshade.com`.
- Latest production deployment: `https://rainmaker-3tz8809yc-edgpatioshade.vercel.app`.
- Live production database: `rainmaker_cutover_20260425200501` in the EDG Neon cluster.
- The cutover database was built from the current Replit Rainmaker database, then merged with the real website lead that had already landed in the prior Vercel database.
- Final cutover counts: 93 accounts, 218 quotes, 1,819 line items, 62 groups, 1,147 products, 242 quote renderings, 9 cover photos, 5 users, and 2 API keys.
- The two synthetic smoke-test leads from the previous Vercel database were not copied into the cutover database.
- Live dashboard verification after reload showed 2 new leads, 155 active deals, and `$6,373,113.73` pipeline value.
- Live Leads page showed the two new leads: Christopher and david chang.
- Old Replit Rainmaker remained live at `https://edgquote.replit.app` and returned HTTP 200 after cutover.

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
EMAIL_PROVIDER=google-workspace-gmail
GOOGLE_WORKSPACE_EMAIL_FROM=sales@edgpatioshade.com
GOOGLE_WORKSPACE_EMAIL_FROM_NAME=EDG Patio & Shade
GOOGLE_WORKSPACE_EMAIL_REPLY_TO=sales@edgpatioshade.com
GOOGLE_SERVICE_ACCOUNT_KEY=
RAINMAKER_API_KEY=
VITE_GOOGLE_PLACES_API_KEY=
OPENAI_API_KEY=
GOOGLE_SERVICE_ACCOUNT_KEY=
```

## Local Readiness Checks

Run these before deploying a preview:

```bash
npm run env:check
npm run cutover:preflight
npm run check
npm run build
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
EMAIL_PROVIDER=google-workspace-gmail \
GOOGLE_WORKSPACE_EMAIL_FROM=sales@edgpatioshade.com \
GOOGLE_WORKSPACE_EMAIL_REPLY_TO=sales@edgpatioshade.com \
GOOGLE_SERVICE_ACCOUNT_KEY='{"client_email":"service@example.iam.gserviceaccount.com","private_key":"-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"}' \
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

- Existing Replit-hosted quote image URLs were copied into Vercel Blob after the final production DB copy.
- `npm run storage:migrate-to-blob` migrated 251 files on 2026-04-25 with 0 failures: 9 quote cover photos and 242 product renderings.
- The migrated quote image data is about 0.232 GB, which fits within the 0.5 GB free Vercel Blob storage allowance for now.
- Staging PDF import is verified with `OPENAI_API_KEY` using browser-side PDF rendering. Server-side PDF text/image conversion still hits Vercel canvas/Chrome limits and should not be the primary cutover path.
- Browser-direct image upload routes now support Vercel Blob client uploads on staging while preserving the Replit signed-upload path for live Replit.
- Google Workspace staff OAuth is configured for the Vercel app, while local username/password auth remains available as the bridge.
- Direct Rainmaker-to-Ops automation is paused while EDG rethinks the operations process from first principles.
- Keep the old Replit Rainmaker app live through the confidence window before removing any Replit resources.
