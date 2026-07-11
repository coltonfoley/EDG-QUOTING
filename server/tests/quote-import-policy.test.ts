import { describe, expect, it } from "vitest";
import { vi } from "vitest";

vi.mock("../db", () => ({ db: {} }));

import { quoteImportRequestSchema } from "../quoteImport";

const extractedQuote = {
  pdfId: "fixture-pdf",
  filename: "fixture.pdf",
  customer: {},
  quoteNumber: "FIXTURE-IMPORT",
  lineItems: [{ description: "Fixture line", quantity: 1, price: 100, total: 100, unit: "each" }],
};

describe("quote import policy", () => {
  it("requires an exact quote target when adding imported lines", () => {
    const result = quoteImportRequestSchema.safeParse({
      importOptions: {
        createNewQuote: false,
        combineIntoSingleQuote: false,
        attachCustomer: "none",
        priceMeaning: "customer_unit_price",
        defaultMarkupPercent: 0,
      },
      extractedQuotes: [extractedQuote],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: ["importOptions", "existingQuoteId"] }),
    ]));
  });

  it("rejects incomplete lines before opening the import transaction", () => {
    const result = quoteImportRequestSchema.safeParse({
      importOptions: {
        createNewQuote: true,
        combineIntoSingleQuote: false,
        attachCustomer: "auto",
        priceMeaning: "edg_cost",
        defaultMarkupPercent: 30,
      },
      extractedQuotes: [{
        ...extractedQuote,
        lineItems: [{ description: "", quantity: 0, price: -1, unit: "each" }],
      }],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.length).toBeGreaterThanOrEqual(3);
  });
});
