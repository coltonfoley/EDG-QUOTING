import { describe, expect, it } from "vitest";
import { omitQuoteSummaryFields } from "@shared/quoteSavePayload";

describe("quote save payload", () => {
  it("does not let the header save overwrite quote summary values", () => {
    const payload = omitQuoteSummaryFields({
      projectName: "Patio shade project",
      accountId: 42,
      jobsiteCity: "Spring Grove",
      taxRate: "8.5",
      tariffRate: "4",
      discount: "2",
      shipping: "250",
      isShippingTaxable: true,
    });

    expect(payload).toEqual({
      projectName: "Patio shade project",
      accountId: 42,
      jobsiteCity: "Spring Grove",
    });
  });
});
