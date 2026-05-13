import { describe, expect, it } from "vitest";
import {
  calculateCustomerLineTotal,
  deriveProductCostFields,
  getProductPricingBreakdown,
  resolveProductCost,
} from "../../shared/pricing";
import { calculateQuoteTotals } from "../../client/src/lib/utils";

describe("pricing safety", () => {
  it("keeps existing quote line total math stable", () => {
    const totals = calculateQuoteTotals(
      [
        {
          quantity: "2",
          unitPrice: "100",
          markupType: "percentage",
          markupValue: "25",
          discountType: "percentage",
          discountValue: "0",
          isTaxable: true,
          isTariffApplicable: false,
        },
        {
          quantity: "1",
          unitPrice: "200",
          markupType: "dollar",
          markupValue: "50",
          discountType: "percentage",
          discountValue: "10",
          isTaxable: false,
          isTariffApplicable: true,
        },
      ],
      8,
      5,
      25,
      false,
      5
    );

    expect(totals.subtotal).toBe(489);
    expect(totals.discountAmount).toBe(24.45);
    expect(totals.taxAmount).toBe(19);
    expect(totals.total).toBe(508.55);
    expect(totals.totalMarkup).toBe(100);
    expect(totals.margin).toBe(25);
  });

  it("derives EDG cost and supplier discount from product MSRP and cost", () => {
    const fields = deriveProductCostFields("100.00", "70.00");

    expect(fields.costPrice).toBe("70.00");
    expect(fields.defaultDiscountType).toBe("dollar");
    expect(fields.defaultDiscountValue).toBe("30.00");
    expect(fields.supplierDiscountPercent).toBe(30);
  });

  it("falls back to legacy product discount fields when explicit EDG cost is missing", () => {
    const cost = resolveProductCost({
      retailPrice: "250.00",
      defaultDiscountType: "percentage",
      defaultDiscountValue: "20",
    });

    expect(cost).toBe(200);
  });

  it("uses explicit EDG cost when available", () => {
    const pricing = getProductPricingBreakdown({
      retailPrice: "250.00",
      costPrice: "175.00",
      defaultDiscountType: "percentage",
      defaultDiscountValue: "20",
    });

    expect(pricing.manufacturerMsrp).toBe(250);
    expect(pricing.edgCost).toBe(175);
    expect(pricing.supplierDiscountAmount).toBe(75);
    expect(pricing.supplierDiscountPercent).toBe(30);
  });

  it("calculates new Sundance-style customer totals from EDG cost plus markup", () => {
    expect(calculateCustomerLineTotal(3, "50.00", "percentage", "100")).toBe(300);
  });
});
