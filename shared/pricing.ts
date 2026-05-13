export type PricingDiscountType = "percentage" | "dollar";
export type PricingMarkupType = "percentage" | "dollar";

const MONEY_MAX = 10000000;

export function parsePricingNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = typeof value === "string"
    ? Number(value.replace(/[^0-9.-]/g, ""))
    : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function clampMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), MONEY_MAX);
}

export function formatMoneyString(value: number): string {
  return clampMoney(roundMoney(value)).toFixed(2);
}

export function calculateCostFromMsrpAndDiscount(
  manufacturerMsrpValue: unknown,
  discountTypeValue: unknown = "dollar",
  discountValueInput: unknown = 0
): number {
  const manufacturerMsrp = clampMoney(parsePricingNumber(manufacturerMsrpValue));
  const discountValue = Math.max(0, parsePricingNumber(discountValueInput));
  const discountType = discountTypeValue === "percentage" ? "percentage" : "dollar";

  if (discountType === "percentage") {
    const safePercent = Math.min(discountValue, 100);
    return roundMoney(manufacturerMsrp * (1 - safePercent / 100));
  }

  return roundMoney(Math.max(0, manufacturerMsrp - discountValue));
}

export function resolveProductCost(product: {
  retailPrice?: unknown;
  costPrice?: unknown;
  defaultDiscountType?: unknown;
  defaultDiscountValue?: unknown;
}): number {
  const costPriceProvided =
    product.costPrice !== null &&
    product.costPrice !== undefined &&
    product.costPrice !== "";

  if (costPriceProvided) {
    return roundMoney(clampMoney(parsePricingNumber(product.costPrice)));
  }

  return calculateCostFromMsrpAndDiscount(
    product.retailPrice,
    product.defaultDiscountType,
    product.defaultDiscountValue
  );
}

export function deriveProductCostFields(manufacturerMsrpValue: unknown, costValue: unknown) {
  const manufacturerMsrp = clampMoney(parsePricingNumber(manufacturerMsrpValue));
  const edgCost = clampMoney(parsePricingNumber(costValue, manufacturerMsrp));
  const supplierDiscountAmount = roundMoney(Math.max(0, manufacturerMsrp - edgCost));
  const supplierDiscountPercent = manufacturerMsrp > 0
    ? roundMoney((supplierDiscountAmount / manufacturerMsrp) * 100)
    : 0;

  return {
    costPrice: formatMoneyString(edgCost),
    defaultDiscountType: "dollar" as const,
    defaultDiscountValue: formatMoneyString(supplierDiscountAmount),
    supplierDiscountAmount,
    supplierDiscountPercent,
  };
}

export function getProductPricingBreakdown(product: {
  retailPrice?: unknown;
  costPrice?: unknown;
  defaultDiscountType?: unknown;
  defaultDiscountValue?: unknown;
}) {
  const manufacturerMsrp = clampMoney(parsePricingNumber(product.retailPrice));
  const edgCost = resolveProductCost(product);
  const supplierDiscountAmount = roundMoney(Math.max(0, manufacturerMsrp - edgCost));
  const supplierDiscountPercent = manufacturerMsrp > 0
    ? roundMoney((supplierDiscountAmount / manufacturerMsrp) * 100)
    : 0;

  return {
    manufacturerMsrp,
    edgCost,
    supplierDiscountAmount,
    supplierDiscountPercent,
  };
}

export function calculateCustomerUnitPrice(
  edgCostValue: unknown,
  markupTypeValue: unknown = "percentage",
  markupValueInput: unknown = 0
): number {
  const edgCost = clampMoney(parsePricingNumber(edgCostValue));
  const markupValue = Math.max(0, parsePricingNumber(markupValueInput));
  const markupType = markupTypeValue === "dollar" ? "dollar" : "percentage";

  if (markupType === "dollar") {
    return roundMoney(edgCost + markupValue);
  }

  return roundMoney(edgCost + (edgCost * markupValue / 100));
}

export function calculateCustomerLineTotal(
  quantityValue: unknown,
  edgCostValue: unknown,
  markupTypeValue: unknown = "percentage",
  markupValueInput: unknown = 0
): number {
  const quantity = Math.max(0, parsePricingNumber(quantityValue));
  return roundMoney(quantity * calculateCustomerUnitPrice(edgCostValue, markupTypeValue, markupValueInput));
}
