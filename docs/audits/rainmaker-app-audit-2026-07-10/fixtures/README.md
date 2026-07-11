# Fictional customer-document fixture

This directory contains a generated, test-only signed quote used to preserve the Phase 0 document baseline. Every customer/project value is synthetic and visibly marked `TEST ONLY`.

Regenerate the PDF with:

`npm run fixture:pdf`

Render the five letter-sized pages with:

`pdftoppm -png -r 120 fictional-signed-quote.pdf fictional-signed-quote-page`

Source data: `server/tests/fixtures/fictional-signed-quote.ts`
Generator: `scripts/generate-fictional-pdf-fixture.ts`

## Baseline visual findings

- Cover and back pages render cleanly and are unmistakably test-only.
- Project details are legible, but the page is mostly empty and its hierarchy feels unfinished.
- Line-item totals, discount, shipping, tax, and grand total render without clipping.
- The typed client signature overlaps the `Print Name` and `Date` labels/rules.
- The terms page repeats client acceptance and both typed signatures overlap their labels/rules.
- The line-item page disclaimer/footer is visually crowded at the bottom.
- The PDF is five unencrypted US-letter pages with no embedded JavaScript.

These are deliberate baseline captures, not approved customer-facing output. Phase 2 should repair the layout and then regenerate/review the same fixture as a visual regression target.
