import { describe, expect, it } from "vitest";
import { assertNativeQuoteSkuSupported, isPortalOnlySundanceService, PORTAL_ONLY_SUNDANCE_SERVICE_SKUS } from "../../shared/sundanceServiceQuotePolicy";
import { SUNDANCE_SERVICE_CATALOG_ROWS } from "../sundanceServices";
import { buildDealerPortalCatalog } from "../dealerPortalCatalog";

describe("portal service quote boundary", () => {
  it("restricts exactly the three confirmed service identities", () => {
    expect(PORTAL_ONLY_SUNDANCE_SERVICE_SKUS).toEqual(SUNDANCE_SERVICE_CATALOG_ROWS.map(service => service.sku));
    for (const service of SUNDANCE_SERVICE_CATALOG_ROWS) {
      expect(isPortalOnlySundanceService(` ${service.sku.toLowerCase()} `)).toBe(true);
      expect(() => assertNativeQuoteSkuSupported(service.sku)).toThrow("Internal costs and service fulfillment need review");
    }
    for (const sku of [null, undefined, "beam3x10x16black", "engineering", "EDG-SD-DRAWINGS-OTHER"]) {
      expect(isPortalOnlySundanceService(sku)).toBe(false);
      expect(() => assertNativeQuoteSkuSupported(sku)).not.toThrow();
    }
  });

  it("retains confirmed portal sale prices while supplier costs remain unknown", () => {
    const items = buildDealerPortalCatalog(SUNDANCE_SERVICE_CATALOG_ROWS.map((row, index) => ({ ...row, id: index + 1 })), { markupType: "percentage", markupValue: "200", updatedAt: null }).items;
    expect(items.map(item => item.customerUnitPrice)).toEqual(["500.00", "3000.00", "3500.00"]);
    expect(SUNDANCE_SERVICE_CATALOG_ROWS.map(row => row.costPrice)).toEqual(["0.00", "0.00", "0.00"]);
  });
});
