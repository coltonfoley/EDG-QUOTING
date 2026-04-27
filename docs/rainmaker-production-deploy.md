# Rainmaker Production Deploy

Use the npm script below for production deploys:

```bash
npm run deploy:prod
```

That command intentionally uses the prebuilt Vercel output path:

1. `npm run build`
2. `npm run vercel:bundle-function`
3. `npx vercel@latest deploy --prebuilt --prod --scope edgpatioshade --yes`
4. `npm run deploy:prod:verify`

Do not use plain `vercel deploy --prod` for Rainmaker. A plain source deploy can package `api/index.ts` incorrectly and fail at runtime with `ERR_MODULE_NOT_FOUND` for `server/app`. The prebuilt flow bundles the API function with `scripts/bundle-vercel-function.mjs`, which is the deployment shape verified on production.

## Dry Run

To see the commands without deploying:

```bash
npm run deploy:prod -- --dry-run
```

## Post-Deploy Checks

The deploy script automatically verifies:

- `https://rainmaker.edgpatioshade.com/health` returns `200`
- `https://edgquote.replit.app/health` returns `200`
- unauthenticated `/api/user` returns `401`
- a missing legacy `/quote-images/*` path returns `404`, not `500`

Then check recent production 500s:

```bash
npm run deploy:prod:logs
```

## Rollback

If production health fails after a deploy, immediately point the alias back to the last known-good deployment:

```bash
npx vercel@latest alias ls --scope edgpatioshade
npx vercel@latest alias set <last-good-rainmaker-deployment>.vercel.app rainmaker.edgpatioshade.com --scope edgpatioshade
```

Then verify:

```bash
npm run deploy:prod:verify
```

Keep Replit online as fallback until the confidence window is complete.
