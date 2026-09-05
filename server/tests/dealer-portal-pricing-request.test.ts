import { describe, expect, it } from "vitest";

import {
  dealerPortalPricingRequestSchema,
  dealerPortalPricingRequestNotes,
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
    expect(hashDealerPortalPricingRequest(first)).toBe("347a1f2c3188f3e419e654ba8e7389d5cff8290ce4c9f4aad318432f4d4e9e97");
    expect(first.product).not.toHaveProperty("options");
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

  it("retains all requested option details and distinguishes changed evidence", () => {
    const options = {
      lighting: { mode: "rgb", sides: ["B1", "B3"] },
      service: "drawings-and-engineering",
      cantilever: { b3EndOverhangInches: 18.25, b4EndOverhangInches: 36 },
      screens: [
        { side: "B1", widthInches: 170.5, heightInches: 96, purpose: "weather", mount: "face", finish: "custom-ral", ralCode: "RAL 7016" },
        { side: "B4", purpose: "privacy", mount: "review", finish: "standard", standardColor: "Bronze" },
      ],
    };
    const request = dealerPortalPricingRequestSchema.parse({ ...fixture(), product: { ...fixture().product, options } });
    expect(request.product.options).toEqual(options);
    const notes = dealerPortalPricingRequestNotes(request.product);
    expect(notes.internalOptionNotes.join("\n")).toContain("RGB lighting requested on B1, B3");
    expect(notes.internalOptionNotes.join("\n")).toContain("$3,500 service price");
    expect(notes.internalOptionNotes.join("\n")).toContain("B3 end 18.25 in; B4 end 36 in");
    expect(notes.internalOptionNotes.join("\n")).toContain("170.5 in clear width × 96 in clear height; weather; face; finish custom RAL RAL 7016");
    expect(notes.internalOptionNotes.join("\n")).toContain("Screen B4: unmeasured in clear width × unmeasured in clear height; privacy; review; finish Bronze");
    expect(notes.publicNotes).toContain("requested drawing or engineering service");
    expect(notes.publicNotes).toContain("require EDG confirmation");
    expect(hashDealerPortalPricingRequest(request)).not.toBe(hashDealerPortalPricingRequest(dealerPortalPricingRequestSchema.parse(fixture())));
    const changed = dealerPortalPricingRequestSchema.parse({ ...request, product: { ...request.product, options: { ...options, service: "drawings" } } });
    expect(hashDealerPortalPricingRequest(changed)).not.toBe(hashDealerPortalPricingRequest(request));
    const reorderedKeys = dealerPortalPricingRequestSchema.parse({ ...request, product: { ...request.product, options: { screens: options.screens, cantilever: options.cantilever, service: options.service, lighting: options.lighting } } });
    expect(hashDealerPortalPricingRequest(reorderedKeys)).toBe(hashDealerPortalPricingRequest(request));
  });

  it("accepts an unmeasured screen with the portal defaults and an unconfirmed finish", () => {
    const request = dealerPortalPricingRequestSchema.parse({ ...fixture(), product: { ...fixture().product, options: { screens: [{ side: "B1" }, { side: "B2", finish: "standard" }, { side: "B3", finish: "custom-ral", ralCode: " " }] } } });
    expect(request.product.options?.screens?.[0]).toEqual({ side: "B1", purpose: "solar", mount: "review", finish: "match-frame" });
    const notes = dealerPortalPricingRequestNotes(request.product).internalOptionNotes.join("\n");
    expect(notes).toContain("match frame subject to physical sample review");
    expect(notes).toContain("standard color to confirm");
    expect(notes).toContain("custom RAL to confirm");
  });

  it.each([
    { unknown: true },
    { service: "permit" },
    { lighting: { mode: "rgb", sides: ["B1"], controller: "automatic" } },
    { lighting: { mode: "rgb", sides: [] } },
    { lighting: { mode: "rgb", sides: ["B1", "B1"] } },
    { lighting: { mode: "white", sides: ["B1"] } },
    { cantilever: { b3EndOverhangInches: 36.01, b4EndOverhangInches: 0 } },
    { cantilever: { b3EndOverhangInches: 0, b4EndOverhangInches: -1 } },
    { cantilever: { b3EndOverhangInches: 0, b4EndOverhangInches: 0, approved: true } },
    { screens: [{ side: "B1", widthInches: 601 }] },
    { screens: [{ side: "B1", heightInches: 241 }] },
    { screens: [{ side: "B1", finish: "standard", standardColor: "Adobe" }] },
    { screens: [{ side: "B1", finish: "custom-ral", ralCode: "1".repeat(41) }] },
    { screens: [{ side: "B1", motor: "Somfy" }] },
    { screens: [{ side: "B1" }, { side: "B1" }] },
  ])("rejects unsupported option evidence instead of silently dropping it: %j", (options) => {
    expect(() => dealerPortalPricingRequestSchema.parse({ ...fixture(), product: { ...fixture().product, options } })).toThrow();
  });
});
