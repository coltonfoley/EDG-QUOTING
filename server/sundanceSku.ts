type SundanceProductLike = {
  name?: string | null;
  sku?: string | null;
  description?: string | null;
  manufacturer?: string | null;
};

const SPECIFIC_SUNDANCE_SKU_BY_NORMALIZED_NAME: Record<string, string> = {
  controlboxandpowersupply1permotor: "controlboxandpowersupply",
  controlboxandpowersupply: "controlboxandpowersupply",
  motor1perbay: "motor1perbay",
  timotionmotorcoverblack: "timotionmotorcoverblk",
  timotionmotorcoverinblack: "timotionmotorcoverblk",
};

const normalizeSundanceSkuCandidate = (value: unknown): string =>
  String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");

const firstCodeLikeToken = (value: unknown): string | null => {
  const [firstLine = ""] = String(value || "").trim().split(/\r?\n/);
  const [token = ""] = firstLine.trim().split(/\s+/);
  const normalized = normalizeSundanceSkuCandidate(token);

  if (!normalized || !/[a-z]/.test(normalized) || normalized.length < 3) {
    return null;
  }

  const tokenLooksLikeSku = /\d/.test(normalized) || /[_".-]/.test(token) || token === firstLine.trim();
  return tokenLooksLikeSku ? normalized : null;
};

export function isSundanceProduct(product: Pick<SundanceProductLike, "manufacturer">): boolean {
  return String(product.manufacturer || "").trim().toLowerCase() === "sundance";
}

export function deriveSundanceSku(product: SundanceProductLike): string | null {
  const existingSku = String(product.sku || "").trim();
  if (existingSku) return existingSku;

  if (!isSundanceProduct(product)) return null;

  const normalizedName = normalizeSundanceSkuCandidate(product.name);
  const normalizedDescription = normalizeSundanceSkuCandidate(product.description);
  const specificMatch =
    SPECIFIC_SUNDANCE_SKU_BY_NORMALIZED_NAME[normalizedName] ||
    SPECIFIC_SUNDANCE_SKU_BY_NORMALIZED_NAME[normalizedDescription];

  if (specificMatch) return specificMatch;

  return firstCodeLikeToken(product.name) || normalizedName || null;
}

export function applySundanceSkuDefault<T extends SundanceProductLike>(
  product: T,
  existingProduct?: SundanceProductLike,
): T {
  const mergedProduct = {
    ...existingProduct,
    ...product,
  };

  if (!isSundanceProduct(mergedProduct)) return product;

  const sku = deriveSundanceSku(mergedProduct);
  if (!sku) return product;

  return {
    ...product,
    sku,
  };
}
