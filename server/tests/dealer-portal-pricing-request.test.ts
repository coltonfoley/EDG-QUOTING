import { describe, expect, it } from "vitest";

import {
  dealerPortalPricingRequestSchema,
  hashDealerPortalPricingRequest,
} from "../dealerPortalPricingRequest";

function fixture() {
  return {
    portalPricingRequestId: "55555555-5555-4555-8555-555555555555",
    portalCompanyId: "22222222-2222-4222-8222-222222222222",
    submittedAt: "2026-08-25T20:00:00.000Z",
    projectName: "Custom Sundance request",
    purchaseOrderNumber: null,
    company: {
      name: "Example Deck Company",
      billingEmail: "billing@example.com",
      billingPhone: "+1 312 555 0199",
      billingAddress: { line1: "100 Main", line2: null, city: "Chicago", region: "IL", postalCode: "60601", country: "US" },
    },
    product: {
      key: "sundance-freestanding",
      requestedLengthInches: 198,
      requestedWidthInches: 150,
      frameColor: "Black",
      louverColor: "Black",
      operation: "Motorized",
      rainSensor: "No",
      fulfillment: "Pickup",
      requestReason: "The requested finished size is not in the instant-order list.",
    },
    shippingAddress: null,
  };
}

describe("dealer portal pricing request contract", () => {
  it("accepts a materials-only request and hashes retries deterministically", () => {
    const first = dealerPortalPricingRequestSchema.parse(fixture());
    const second = dealerPortalPricingRequestSchema.parse({ ...fixture(), company: { ...fixture().company } });
    expect(hashDealerPortalPricingRequest(first)).toBe(hashDealerPortalPricingRequest(second));
  });

  it("requires a shipping address only for delivery", () => {
    expect(() => dealerPortalPricingRequestSchema.parse({
      ...fixture(),
      product: { ...fixture().product, fulfillment: "Delivery" },
    })).toThrow();
  });

  it("preserves fractional inches while keeping the same finite measurement bounds", () => {
    const request = { ...fixture(), product: { ...fixture().product, requestedLengthInches: 198.125, requestedWidthInches: 150.375 } };
    expect(dealerPortalPricingRequestSchema.parse(request).product).toMatchObject({ requestedLengthInches: 198.125, requestedWidthInches: 150.375 });
    for (const value of [NaN, Infinity, -Infinity, 11.999, 600.001]) {
      expect(() => dealerPortalPricingRequestSchema.parse({ ...request, product: { ...request.product, requestedLengthInches: value } })).toThrow();
      expect(() => dealerPortalPricingRequestSchema.parse({ ...request, product: { ...request.product, requestedWidthInches: value } })).toThrow();
    }
  });

  it("does not accept an impossible manual rain-sensor request", () => {
    expect(() => dealerPortalPricingRequestSchema.parse({
      ...fixture(),
      product: { ...fixture().product, operation: "Manual", rainSensor: "Yes" },
    })).toThrow();
  });
});
