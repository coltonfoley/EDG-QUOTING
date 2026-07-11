export type PricingDimensionUnit = "feet" | "inches" | "meters";

export type PricingBandValues = {
  lengthMin: string | number;
  lengthMax: string | number;
  widthMin: string | number;
  widthMax: string | number;
  retailPrice: string | number;
  basePrice: string | number;
};

export type NormalizedPricingBand = {
  lengthMin: string;
  lengthMax: string;
  widthMin: string;
  widthMax: string;
  retailPrice: string;
  basePrice: string;
};

export class PricingBandValidationError extends Error {
  readonly code = "PRICING_BANDS_INVALID";
  readonly status = 409;
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Pricing table validation failed: ${issues.join(" ")}`);
    this.name = "PricingBandValidationError";
    this.issues = issues;
  }
}

export class PricingManualReviewError extends Error {
  readonly code: "PRICING_NOT_CONFIGURED" | "PRICING_MANUAL_REVIEW" | "PRICING_AMBIGUOUS";
  readonly status: number;

  constructor(code: PricingManualReviewError["code"], message: string, status: number) {
    super(message);
    this.name = "PricingManualReviewError";
    this.code = code;
    this.status = status;
  }
}

function numberValue(value: string | number): number {
  return typeof value === "number" ? value : Number(value);
}

export function pricingUnitFactor(unit: PricingDimensionUnit): number {
  if (unit === "feet") return 12;
  if (unit === "meters") return 39.3701;
  return 1;
}

export function normalizePricingBand(
  band: PricingBandValues,
  sourceUnit: PricingDimensionUnit,
): NormalizedPricingBand {
  const factor = pricingUnitFactor(sourceUnit);
  return {
    lengthMin: (numberValue(band.lengthMin) * factor).toFixed(2),
    lengthMax: (numberValue(band.lengthMax) * factor).toFixed(2),
    widthMin: (numberValue(band.widthMin) * factor).toFixed(2),
    widthMax: (numberValue(band.widthMax) * factor).toFixed(2),
    retailPrice: numberValue(band.retailPrice).toFixed(2),
    basePrice: numberValue(band.basePrice).toFixed(2),
  };
}

function rangesOverlapInclusive(aMin: number, aMax: number, bMin: number, bMax: number): boolean {
  return aMin <= bMax && bMin <= aMax;
}

export function validatePricingBands(bands: PricingBandValues[]): void {
  const issues: string[] = [];
  const parsed = bands.map((band, index) => ({
    index,
    lengthMin: numberValue(band.lengthMin),
    lengthMax: numberValue(band.lengthMax),
    widthMin: numberValue(band.widthMin),
    widthMax: numberValue(band.widthMax),
    retailPrice: numberValue(band.retailPrice),
    basePrice: numberValue(band.basePrice),
  }));

  for (const band of parsed) {
    const values = [band.lengthMin, band.lengthMax, band.widthMin, band.widthMax, band.retailPrice, band.basePrice];
    if (values.some((value) => !Number.isFinite(value))) {
      issues.push(`Entry ${band.index + 1} contains a non-numeric value.`);
      continue;
    }
    if (band.lengthMin < 0 || band.widthMin < 0 || band.lengthMin >= band.lengthMax || band.widthMin >= band.widthMax) {
      issues.push(`Entry ${band.index + 1} has an invalid dimension range.`);
    }
    if (band.retailPrice < 0 || band.basePrice < 0) {
      issues.push(`Entry ${band.index + 1} has a negative price.`);
    }
  }

  for (let leftIndex = 0; leftIndex < parsed.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < parsed.length; rightIndex += 1) {
      const left = parsed[leftIndex];
      const right = parsed[rightIndex];
      if (
        rangesOverlapInclusive(left.lengthMin, left.lengthMax, right.lengthMin, right.lengthMax)
        && rangesOverlapInclusive(left.widthMin, left.widthMax, right.widthMin, right.widthMax)
      ) {
        issues.push(`Entries ${left.index + 1} and ${right.index + 1} overlap or share an inclusive boundary.`);
      }
    }
  }

  if (issues.length > 0) throw new PricingBandValidationError(issues);
}

export function selectPricingBand<T extends PricingBandValues>(bands: T[], lengthInches: number, widthInches: number): T {
  if (bands.length === 0) {
    throw new PricingManualReviewError("PRICING_NOT_CONFIGURED", "No dimensional pricing table is configured for this product.", 404);
  }
  validatePricingBands(bands);
  const matches = bands.filter((band) => (
    lengthInches >= numberValue(band.lengthMin)
    && lengthInches <= numberValue(band.lengthMax)
    && widthInches >= numberValue(band.widthMin)
    && widthInches <= numberValue(band.widthMax)
  ));
  if (matches.length === 0) {
    throw new PricingManualReviewError(
      "PRICING_MANUAL_REVIEW",
      "No exact pricing band covers these dimensions. Manual pricing review is required.",
      422,
    );
  }
  if (matches.length > 1) {
    throw new PricingManualReviewError(
      "PRICING_AMBIGUOUS",
      "More than one pricing band covers these dimensions. Correct the pricing table before quoting.",
      409,
    );
  }
  return matches[0];
}
