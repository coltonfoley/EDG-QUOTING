import { describe, expect, it } from "vitest";
import { buildOperationsPayload } from "../integrations/operationsPayload";

describe("operations payload planning agreement handling", () => {
  it("includes planning agreement summary without adding a line item", () => {
    const payload = buildOperationsPayload({
      id: 100,
      quoteNumber: "QT-PLANNING-1",
      projectName: "Planning Credit Test",
      taxRate: "0",
      discount: "0",
      shipping: "0",
      tariffRate: "0",
      lineItems: [
        {
          id: 1,
          productId: null,
          description: "Pergola",
          quantity: "1",
          unitPrice: "1000.00",
          retailPrice: "1000.00",
          markupType: "percentage",
          markupValue: "0",
          discountType: "percentage",
          discountValue: "0",
          isTaxable: true,
          isTariffApplicable: false,
        },
      ],
      planningAgreement: {
        id: 7,
        status: "credited",
        tier: "standard_design",
        amount: "1500.00",
        creditEligible: true,
        appliedCreditAmount: "1500.00",
      },
    }, true) as any;

    expect(payload.quote.lineItems).toHaveLength(1);
    expect(payload.quote.planningAgreement).toEqual(expect.objectContaining({
      id: 7,
      status: "credited",
      appliedCreditAmount: "1500.00",
    }));
    expect(payload.quote.totals.total).toBe(1000);
  });
});
