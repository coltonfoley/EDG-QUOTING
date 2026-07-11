# Phase 5D local evidence — targeted decomposition

**Date:** 2026-07-10
**Status:** Targeted extraction complete locally; broad file splitting intentionally deferred
**Safety:** No production access, customer action, commit, push, or deployment

## Outcome

Rainmaker's highest-risk behavior is now protected behind small domain modules that were extracted only when a focused test contract existed. The work does not claim that `server/storage.ts` or `server/routes/quoteRoutes.ts` is small; it establishes bounded seams so future changes do not require editing every lifecycle concern inside those files.

The deliberate decision is to stop here rather than split large files by line count alone. Repository modules should be extracted when a real behavior change needs the boundary and tests can prove the move, not as a broad cosmetic rewrite.

## Protected seams

| Boundary | Module | Behavior protected by |
|---|---|---|
| Signed quote mutation policy | `server/quoteLock.ts` | quote-lock unit tests, route policy tests, isolated signature/version tests |
| Public customer package/snapshot | `server/quotePublicSigning.ts` and `client/src/lib/customer-package.ts` | public projection, fingerprint, signed snapshot, client package tests |
| Transactional quote/PDF import | `server/quoteImport.ts` | import policy tests and isolated all-or-nothing database tests |
| Dimensional pricing validation | `server/pricingBands.ts` | pricing-band unit tests, route tests, isolated replacement/lookup tests |
| Lead inquiry conversion | `server/inquiryConversion.ts` | route policy and isolated one-inquiry/one-quote conversion tests |
| Email idempotency lifecycle | `server/emailDelivery.ts` | unit tests, route tests, isolated ledger lifecycle/reconciliation tests |
| Quote confirmation construction/delivery | `server/quoteSignatureConfirmation.ts` | HTML escaping, fingerprint key, provider replay/failure, public signing, and admin recovery tests |
| Minimized adoption events | `server/businessEvents.ts` | policy, route, successful-action, and isolated idempotency tests |
| Atomic product catalog import | `server/productCatalogImport.ts` | whole-batch validation, replay, compatibility-pricing, event, and isolated database tests |
| Atomic configured package insertion | `server/configuredProductInsertion.ts` | quote lock, catalog re-resolution, deterministic replay, group/line/event transaction, and isolated database tests |
| Request correlation/redaction | `server/requestLogging.ts` and `server/redactedLogging.ts` | focused logging tests and route policy tests |

## Latest extraction

Automatic quote confirmation and admin failed-receipt recovery previously constructed separate email bodies and delivery calls in route modules. Both now call `deliverQuoteSignatureConfirmation`, which owns:

- the signed-document idempotency key;
- customer/project HTML escaping;
- automatic versus replacement receipt wording;
- recorded signature timestamp and shortened document ID;
- the secure signed-document link;
- the provider/ledger boundary.

The service keeps the provider import dynamic. This preserves Rainmaker's serverless-startup safety rule: route registration does not eagerly import provider/backend email dependencies.

## What remains intentionally large

Current approximate sizes are 3,267 lines for `server/storage.ts`, 2,256 lines for `server/routes/quoteRoutes.ts`, and 709 lines for `client/src/pages/quote-builder.tsx`. These remain maintainability concerns, but a repository split now would create wide merge and regression risk without changing user behavior.

Recommended future extraction triggers:

- move a storage repository only when a new schema/lifecycle change needs that bounded transaction;
- move another quote route family only when its input/output and authorization contract has focused tests;
- split QuoteBuilder only around a user-visible section with browser and mutation tests;
- do not create generic service/repository layers that merely rename existing calls.

## Verification

- `server/tests/quote-signature-confirmation.test.ts` proves exact idempotency, HTML escaping, replacement wording, and replay without a provider call.
- Existing email, signing, authorization, import, pricing, lead-conversion, and database tests prove the extracted seams through their real callers.
- TypeScript and production bundling confirm the dynamic provider boundary remains valid.
- The Phase 5 admin browser/accessibility matrix continues to pass after the extraction.

## Decision

Phase 5D is complete as a targeted decomposition package. Further splitting is deferred until an actual change provides a smaller behavioral scope and an independent verification contract.
