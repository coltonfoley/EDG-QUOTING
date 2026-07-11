import { describe, expect, it } from "vitest";
import {
  normalizePricingBand,
  PricingBandValidationError,
  PricingManualReviewError,
  selectPricingBand,
  validatePricingBands,
} from "../pricingBands";

const band = (overrides: Partial<{
  lengthMin: string;
  lengthMax: string;
  widthMin: string;
  widthMax: string;
  retailPrice: string;
  basePrice: string;
}> = {}) => ({
  lengthMin: "120",
  lengthMax: "143.99",
  widthMin: "96",
  widthMax: "119.99",
  retailPrice: "1000",
  basePrice: "700",
  ...overrides,
});

describe("dimensional pricing bands", () => {
  it("normalizes declared input units to stored inches", () => {
    expect(normalizePricingBand({
      lengthMin: 10,
      lengthMax: 12,
      widthMin: 8,
      widthMax: 10,
      retailPrice: 1000,
      basePrice: 700,
    }, "feet")).toEqual({
      lengthMin: "120.00",
      lengthMax: "144.00",
      widthMin: "96.00",
      widthMax: "120.00",
      retailPrice: "1000.00",
      basePrice: "700.00",
    });
  });

  it("rejects inverted, negative, duplicate, overlapping, and shared-boundary bands", () => {
    expect(() => validatePricingBands([band({ lengthMax: "100" })])).toThrow(PricingBandValidationError);
    expect(() => validatePricingBands([band({ basePrice: "-1" })])).toThrow(PricingBandValidationError);
    expect(() => validatePricingBands([band(), band()])).toThrow(PricingBandValidationError);
    expect(() => validatePricingBands([
      band(),
      band({ lengthMin: "143.99", lengthMax: "160", widthMin: "100", widthMax: "130" }),
    ])).toThrow(/share an inclusive boundary/);
  });

  it("returns exactly one matching band and fails closed for gaps", () => {
    const bands = [
      band(),
      band({ lengthMin: "144", lengthMax: "168", basePrice: "900" }),
    ];
    expect(selectPricingBand(bands, 130, 100).basePrice).toBe("700");
    expect(() => selectPricingBand(bands, 200, 100)).toThrow(PricingManualReviewError);
    try {
      selectPricingBand(bands, 200, 100);
    } catch (error) {
      expect(error).toEqual(expect.objectContaining({ code: "PRICING_MANUAL_REVIEW", status: 422 }));
    }
  });
});
