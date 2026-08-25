import { describe, expect, it } from "vitest";

import { buildDealerPortalCatalog } from "../dealerPortalCatalog";

describe("dealer portal catalog contract", () => {
  it("returns customer prices without exposing cost or markup", () => {
    const catalog = buildDealerPortalCatalog([
      { id: 10, sku: "fixture", name: "Fixture", category: "Test", unit: "each", costPrice: "50.00" },
    ], { markupType: "percentage", markupValue: "100", updatedAt: new Date("2026-08-25T12:00:00Z") });

    expect(catalog.items[0]).toMatchObject({ sku: "fixture", customerUnitPrice: "100.00", priceStatus: "available" });
    expect(JSON.stringify(catalog)).not.toContain("costPrice");
    expect(JSON.stringify(catalog)).not.toContain("markupValue");
    expect(catalog.catalogFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("marks zero or invalid cost as unavailable instead of publishing a zero price", () => {
    const catalog = buildDealerPortalCatalog([
      { id: 11, sku: "missing", name: "Missing", category: null, unit: null, costPrice: "0" },
    ], { markupType: "percentage", markupValue: "100", updatedAt: null });

    expect(catalog.items[0]).toMatchObject({ priceStatus: "unavailable", customerUnitPrice: null });
  });
});
