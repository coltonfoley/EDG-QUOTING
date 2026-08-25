import { createHash } from "node:crypto";

import { calculateCustomerUnitPrice } from "@shared/pricing";

export type DealerPortalCatalogProduct = {
  id: number;
  sku: string | null;
  name: string;
  category: string | null;
  unit: string | null;
  costPrice: string;
};

export type DealerPortalCatalogPricing = {
  markupType: string;
  markupValue: string;
  updatedAt: Date | null;
};

export function buildDealerPortalCatalog(productRows: DealerPortalCatalogProduct[], pricing: DealerPortalCatalogPricing) {
  const items = productRows.map((product) => {
    const cost = Number(product.costPrice);
    const priceIsAvailable = Number.isFinite(cost) && cost > 0;
    return {
      rainmakerProductId: product.id,
      sku: product.sku,
      name: product.name,
      category: product.category,
      unit: product.unit || "each",
      priceStatus: priceIsAvailable ? "available" as const : "unavailable" as const,
      customerUnitPrice: priceIsAvailable
        ? calculateCustomerUnitPrice(cost, pricing.markupType, pricing.markupValue).toFixed(2)
        : null,
    };
  });
  const catalogFingerprint = createHash("sha256").update(JSON.stringify(items)).digest("hex");
  return {
    source: "rainmaker" as const,
    manufacturer: "Sundance" as const,
    currency: "USD" as const,
    catalogFingerprint,
    pricingUpdatedAt: pricing.updatedAt?.toISOString() ?? null,
    items,
  };
}
