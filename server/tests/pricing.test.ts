import { describe, expect, it } from "vitest";
import {
  calculateCustomerLineTotal,
  deriveProductCostFields,
  getProductPricingBreakdown,
  resolveProductCost,
} from "../../shared/pricing";
import { calculateQuoteTotals, calculateLineItemMargin, calculateGroupMargin, calculateGroupSubtotal, calculateGrossMargin } from "../../client/src/lib/utils";

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
    expect(totals.lineCost).toBe(389);
    expect(totals.grossProfit).toBe(75.55);
    expect(totals.netLineRevenue).toBe(464.55);
    expect(totals.margin).toBe(16.3);
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


describe("gross profit reporting", () => {
  const item = {
    quantity: "1", unitPrice: "1000", markupType: "percentage", markupValue: "50",
    discountType: "percentage", discountValue: "0", isTaxable: true, isTariffApplicable: false,
  };

  it.each([
    [0, 1500, 500, 33.3],
    [10, 1350, 350, 25.9],
    [50, 750, -250, -33.3],
    [100, 0, -1000, null],
  ])("subtracts a %s percent customer discount, including losses", (discount, revenue, profit, margin) => {
    const totals = calculateQuoteTotals([item], 0, discount);
    expect(totals.total).toBe(revenue);
    expect(totals.netLineRevenue).toBe(revenue);
    expect(totals.totalMarkup).toBe(500);
    expect(totals.lineCost).toBe(1000);
    expect(totals.grossProfit).toBe(profit);
    expect(totals.margin).toBe(margin);
  });

  it.each([
    ["percentage", "20"],
    ["dollar", "200"],
  ])("uses cost after the %s supplier discount", (discountType, discountValue) => {
    const totals = calculateQuoteTotals([{ ...item, discountType, discountValue }]);
    expect(totals.total).toBe(1200);
    expect(totals.lineCost).toBe(800);
    expect(totals.grossProfit).toBe(400);
    expect(totals.margin).toBe(33.3);
  });

  it("counts markup on tariff as profit, but not the tariff itself", () => {
    const rows = [{ ...item, isTariffApplicable: true }, item];
    const totals = calculateQuoteTotals(rows, 0, 10, 0, false, 10);
    expect(totals.subtotal).toBe(3150);
    expect(totals.total).toBe(2835);
    expect(totals.lineCost).toBe(2100);
    expect(totals.totalMarkup).toBe(1050);
    expect(totals.grossProfit).toBe(735);
    expect(totals.margin).toBe(25.9);
    expect(calculateLineItemMargin(1, 1000, "percentage", 50, "percentage", 0, 10, true)).toBe(550);
    expect(calculateGroupMargin(rows, 10)).toBe(totals.totalMarkup);
    expect(calculateGroupSubtotal(rows, 10)).toBe(totals.subtotal);
  });

  it("keeps fixed dollar markup per line and fractional quantity math unchanged", () => {
    const totals = calculateQuoteTotals([{ ...item, quantity: "2.5", unitPrice: "100", markupType: "dollar", markupValue: "50", discountType: "dollar", discountValue: "25", isTariffApplicable: true }], 0, 10, 0, false, 10);
    expect(totals.subtotal).toBe(297.5);
    expect(totals.lineCost).toBe(247.5);
    expect(totals.totalMarkup).toBe(50);
    expect(totals.total).toBe(267.75);
    expect(totals.grossProfit).toBe(20.25);
    expect(totals.margin).toBe(7.6);
  });

  it("excludes shipping and sales tax from profit without changing customer totals", () => {
    const totals = calculateQuoteTotals([item], 8, 10, 100, true);
    expect(totals.total).toBe(1566);
    expect(totals.taxAmount).toBe(116);
    expect(totals.grossProfit).toBe(350);
    expect(totals.margin).toBe(25.9);
    expect(calculateQuoteTotals([item], 8, 10, 100, false).total).toBe(1558);
  });

  it("handles zero revenue and zero entered cost explicitly", () => {
    expect(calculateQuoteTotals([])).toMatchObject({ grossProfit: 0, margin: null });
    expect(calculateQuoteTotals([{ ...item, markupValue: "0" }])).toMatchObject({ grossProfit: 0, margin: 0 });
    expect(calculateQuoteTotals([{ ...item, unitPrice: "0", markupType: "dollar", markupValue: "50" }])).toMatchObject({ grossProfit: 50, margin: 100 });
  });

  it("aggregates profit over revenue rather than averaging quote percentages", () => {
    const first = calculateQuoteTotals([item]);
    const second = calculateQuoteTotals([{ ...item, unitPrice: "100", markupValue: "100" }]);
    expect(calculateGrossMargin(first.grossProfit + second.grossProfit, first.netLineRevenue + second.netLineRevenue)).toBe(35.3);
  });

  it("reconciles rounded line costs, markup, and quote profit to cents", () => {
    const rows = [{ ...item, quantity: "1.33", unitPrice: "7.77", discountValue: "12.5", isTariffApplicable: true }];
    const totals = calculateQuoteTotals(rows, 8.25, 7.5, 12.34, true, 6.25);
    expect(totals.subtotal).toBe(14.41);
    expect(totals.lineCost).toBe(9.61);
    expect(totals.totalMarkup).toBe(4.8);
    expect(totals.discountAmount).toBe(1.08);
    expect(totals.netLineRevenue).toBe(13.33);
    expect(totals.grossProfit).toBe(3.72);
    expect(totals.total).toBe(27.79);
  });
});
