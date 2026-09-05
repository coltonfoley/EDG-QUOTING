import { describe, expect, it } from "vitest";

import { buildDealerPortalCatalog } from "../dealerPortalCatalog";
import { SUNDANCE_SERVICE_CATALOG_ROWS } from "../sundanceServices";

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

  it("uses the confirmed customer retail for each explicit service without cost markup", () => {
    const catalog = buildDealerPortalCatalog(SUNDANCE_SERVICE_CATALOG_ROWS.map((row, index) => ({ ...row, id: index + 1 })),
      { markupType: "percentage", markupValue: "200", updatedAt: null });
    expect(catalog.items.map((item) => [item.sku, item.customerUnitPrice, item.priceStatus])).toEqual([
      ["EDG-SD-DRAWINGS", "500.00", "available"],
      ["EDG-SD-ENGINEERING", "3000.00", "available"],
      ["EDG-SD-DRAWINGS-ENGINEERING", "3500.00", "available"],
    ]);
    expect(JSON.stringify(catalog)).not.toContain("costPrice");
    expect(JSON.stringify(catalog)).not.toContain("markupValue");
  });

  it.each([
    { retailPrice: undefined }, { retailPrice: "0" }, { retailPrice: "499.99" }, { retailPrice: "1000" },
    { retailPrice: "invalid" }, { manufacturer: "Other" }, { category: "Extrusions" },
    { unit: "linear ft" }, { productType: "configurable" }, { sku: "edg-sd-drawings" },
  ])("fails closed for an inconsistent service row %j even when it has a cost", (override) => {
    const catalog = buildDealerPortalCatalog([{ ...SUNDANCE_SERVICE_CATALOG_ROWS[0], id: 1, costPrice: "250.00", ...override }],
      { markupType: "percentage", markupValue: "100", updatedAt: null });
    expect(catalog.items[0]).toMatchObject({ priceStatus: "unavailable", customerUnitPrice: null });
  });

  it("does not invent missing services or derive an unknown zero-cost item's price from retail", () => {
    const catalog = buildDealerPortalCatalog([{ id: 9, sku: "unconfirmed-service", name: "Unconfirmed", unit: "each", category: "Services", costPrice: "0", retailPrice: "500" }],
      { markupType: "percentage", markupValue: "100", updatedAt: null });
    expect(catalog.items).toHaveLength(1);
    expect(catalog.items[0].priceStatus).toBe("unavailable");
  });

  it("rejects duplicate service identities", () => {
    const catalog = buildDealerPortalCatalog([1, 2].map((id) => ({ ...SUNDANCE_SERVICE_CATALOG_ROWS[0], id })),
      { markupType: "percentage", markupValue: "100", updatedAt: null });
    expect(catalog.items.every((item) => item.priceStatus === "unavailable")).toBe(true);
  });
});
