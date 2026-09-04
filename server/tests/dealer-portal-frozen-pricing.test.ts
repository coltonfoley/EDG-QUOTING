import { describe, expect, it } from "vitest";
import { getDealerPortalFrozenPrice } from "../../shared/pricing";
import { calculateLineItemTotal, calculateLineItemMargin, calculateQuoteTotals, calculateGroupSubtotal, calculateGroupMargin } from "../../client/src/lib/utils";
import { calculateLineItemsValue } from "../../client/src/lib/quote-value";

import { frozenLine } from "./fixtures/dealer-portal-frozen-line";

describe("frozen portal prices across quote calculations", () => {
  it.each(["20.00", "25.00", "60.00"])("keeps accepted sales and actual %s cost, including gross losses", (cost) => {
    const line = frozenLine(cost);
    const expectedProfit = 100 - 2 * Number(cost);
    expect(calculateLineItemTotal(line.quantity, line.unitPrice, line.markupType, line.markupValue, "percentage", 0, 0, false, line)).toBe(100);
    expect(calculateLineItemMargin(line.quantity, line.unitPrice, line.markupType, line.markupValue, "percentage", 0, 0, false, line)).toBe(expectedProfit);
    expect(calculateQuoteTotals([line])).toMatchObject({ subtotal: 100, total: 100, lineCost: 2 * Number(cost), grossProfit: expectedProfit });
    expect(calculateGroupSubtotal([line])).toBe(100);
    expect(calculateGroupMargin([line])).toBe(expectedProfit);
    expect(calculateLineItemsValue([line])).toBe(100);
  });

  it("uses exact accepted unit cents times quantity without per-line markup or rounding drift", () => {
    const line = { ...frozenLine("3.11", 3, 501), markupType: "dollar", markupValue: "777" };
    expect(calculateQuoteTotals([line])).toMatchObject({ subtotal: 15.03, lineCost: 9.33, grossProfit: 5.7 });
    expect(getDealerPortalFrozenPrice(line, line.quantity)).toEqual({ unitPrice: 5.01, lineTotal: 15.03 });
  });

  it("keeps ordinary row pricing and quote-level discount, tax and shipping semantics", () => {
    const ordinary = { ...frozenLine("20.00"), priceSource: "catalog_cost", discountType: "percentage", discountValue: "10" };
    expect(getDealerPortalFrozenPrice(ordinary, ordinary.quantity)).toBeNull();
    expect(calculateQuoteTotals([ordinary])).toMatchObject({ subtotal: 72, lineCost: 36, grossProfit: 36 });
    expect(calculateQuoteTotals([frozenLine("20.00")], 10, 10, 5)).toMatchObject({ subtotal: 100, discountAmount: 10, taxAmount: 9, total: 104, grossProfit: 50 });
  });

  it.each([
    { sourceMetadata: null },
    { retailPrice: "49.00" },
    { quantity: "3" },
    { quantity: "2x" },
    { sourceMetadata: { ...frozenLine().sourceMetadata, snapshotHash: "bad" } },
    { sourceMetadata: { ...frozenLine().sourceMetadata, customerLineTotalCents: 9999 } },
    { sourceMetadata: { ...frozenLine().sourceMetadata, customerUnitPriceCents: "5000" } },
  ])("fails closed on inconsistent frozen evidence %j", (changes) => {
    const line = { ...frozenLine(), ...changes };
    expect(() => calculateQuoteTotals([line])).toThrow("frozen price evidence");
    expect(() => calculateGroupSubtotal([line])).toThrow("frozen price evidence");
    expect(() => calculateLineItemsValue([line])).toThrow("frozen price evidence");
  });
});
