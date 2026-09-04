import { describe, expect, it } from "vitest";

import {
  dealerPortalOrderSchema,
  hashDealerPortalOrder,
  isDealerPortalOrderKeyValid,
  validateDealerPortalCatalogMatch,
  dealerPortalFrozenPricingFields,
} from "../dealerPortalOrder";

function fixture() {
  return {
    portalOrderId: "109566de-79ce-4f46-825d-2e24bdb5b89e",
    portalCompanyId: "0e8d5a20-dcf3-4355-a522-1f38dbbb03f9",
    snapshotHash: "a".repeat(64),
    rulesVersion: "2026-08-26.1" as const,
    projectName: "Dealer materials order",
    purchaseOrderNumber: "PO-100",
    company: {
      name: "Example Deck Company",
      billingEmail: "billing@example.com",
      billingPhone: "+1 312 555 0199",
      billingAddress: { line1: "100 Main", line2: null, city: "Chicago", region: "IL", postalCode: "60601", country: "US" as const },
    },
    fulfillment: "Pickup" as const,
    shippingAddress: null,
    agreement: { version: "2026-08-25.1", signerName: "Dealer Signer", acceptedAt: "2026-08-25T18:00:00.000Z" },
    quickBooks: { invoiceId: "invoice-1", invoiceNumber: "EDG-ORDER-OC", depositPaidAt: "2026-08-25T19:00:00.000Z", depositAmountCents: 5000 },
    materials: {
      currency: "USD" as const,
      customerTotalCents: 10000,
      lines: [{ role: "beam-2x8-16", sku: "beam16", description: "2 x 8 beam", quantity: 2, color: "Black", customerUnitPriceCents: 5000, customerLineTotalCents: 10000 }],
    },
  };
}

describe("dealer portal paid-order contract", () => {
  it("requires the exact configured integration key", () => {
    const configured = "0123456789abcdefghijklmnopqrstuvwxyz";
    expect(isDealerPortalOrderKeyValid(configured, configured)).toBe(true);
    expect(isDealerPortalOrderKeyValid("wrong", configured)).toBe(false);
    expect(isDealerPortalOrderKeyValid(configured, undefined)).toBe(false);
  });
  it("accepts coherent 2 x 8 materials-only evidence and hashes it deterministically", () => {
    const first = dealerPortalOrderSchema.parse(fixture());
    const second = dealerPortalOrderSchema.parse({ ...fixture(), company: { ...fixture().company } });
    expect(hashDealerPortalOrder(first)).toBe(hashDealerPortalOrder(second));
  });

  it("rejects 3 x 10 beams, invented shipping, and contradictory money", () => {
    expect(() => dealerPortalOrderSchema.parse({
      ...fixture(),
      shippingAddress: fixture().company.billingAddress,
      materials: {
        ...fixture().materials,
        lines: [{ ...fixture().materials.lines[0], role: "beam-3x10-16", customerLineTotalCents: 9999 }],
      },
    })).toThrow();
  });

  it.each(["2026-08-25.3", "2026-08-26.1"])("accepts only the released 2 x 8 contract %s", (rulesVersion) => {
    expect(dealerPortalOrderSchema.parse({ ...fixture(), rulesVersion }).rulesVersion).toBe(rulesVersion);
  });

  it.each(["2026-08-27.3x10-working.1", "2026-08-31.3x10-quote.1", "edg-kit-settings.1", "unknown"])("blocks unreleased rules %s even with coherent money", (rulesVersion) => {
    expect(() => dealerPortalOrderSchema.parse({ ...fixture(), rulesVersion })).toThrow();
  });

  it.each(["20.00", "25.00", "60.00"])("keeps accepted revenue when current cost changes to %s", (costPrice) => {
    const order = dealerPortalOrderSchema.parse(fixture());
    const [matched] = validateDealerPortalCatalogMatch(order, [{
      id: 1,
      sku: "beam16",
      name: "Beam",
      manufacturer: "Sundance",
      unit: "each",
      costPrice,
    }]);
    expect(matched.product.id).toBe(1);
    expect(dealerPortalFrozenPricingFields(order, matched.line, matched.cost)).toMatchObject({
      retailPrice: "50.00", unitPrice: costPrice, markupType: "percentage", markupValue: "0",
      priceSource: "dealer_portal_frozen_catalog",
      sourceMetadata: { customerUnitPriceCents: 5000, customerLineTotalCents: 10000, snapshotHash: order.snapshotHash },
    });
  });

  it("still rejects missing products, foreign manufacturers and invalid costs", () => {
    const order = dealerPortalOrderSchema.parse(fixture());
    const product = { id: 1, sku: "beam16", name: "Beam", manufacturer: "Sundance", unit: "each", costPrice: "20.00" };
    expect(() => validateDealerPortalCatalogMatch(order, [])).toThrow("missing");
    expect(() => validateDealerPortalCatalogMatch(order, [{ ...product, manufacturer: "Other" }])).toThrow("not Sundance");
    for (const costPrice of ["0", "-1", "not-a-price"]) {
      expect(() => validateDealerPortalCatalogMatch(order, [{ ...product, costPrice }])).toThrow("valid cost");
    }
  });
});
