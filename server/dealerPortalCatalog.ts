import { createHash } from "node:crypto";

import { calculateCustomerUnitPrice } from "@shared/pricing";
import { getSundanceServiceBySku } from "./sundanceServices";

export type DealerPortalCatalogProduct = {
  id: number;
  sku: string | null;
  name: string;
  category: string | null;
  unit: string | null;
  costPrice: string;
  retailPrice?: string;
  manufacturer?: string;
  productType?: string;
};

export type DealerPortalCatalogPricing = {
  markupType: string;
  markupValue: string;
  updatedAt: Date | null;
};

export function buildDealerPortalCatalog(productRows: DealerPortalCatalogProduct[], pricing: DealerPortalCatalogPricing) {
  const skuCounts = new Map<string, number>();
  for (const product of productRows) {
    if (product.sku) {
      const sku = product.sku.toLowerCase();
      skuCounts.set(sku, (skuCounts.get(sku) ?? 0) + 1);
    }
  }
  const items = productRows.map((product) => {
    const service = getSundanceServiceBySku(product.sku);
    const cost = Number(product.costPrice);
    // Only the explicit, verified services use retail. Missing or contradictory
    // service records never fall back to cost markup or a hard-coded sale price.
    const servicePriceIsAvailable = Boolean(service
      && product.sku === service.sku
      && skuCounts.get(service.sku.toLowerCase()) === 1
      && product.manufacturer === "Sundance"
      && product.category === "Services"
      && product.productType === "simple"
      && product.unit === "each"
      && Number(product.retailPrice) === service.customerPrice);
    const priceIsAvailable = service ? servicePriceIsAvailable : Number.isFinite(cost) && cost > 0;
    return {
      rainmakerProductId: product.id,
      sku: product.sku,
      name: product.name,
      category: product.category,
      unit: product.unit || "each",
      priceStatus: priceIsAvailable ? "available" as const : "unavailable" as const,
      customerUnitPrice: priceIsAvailable
        ? service
          ? Number(product.retailPrice).toFixed(2)
          : calculateCustomerUnitPrice(cost, pricing.markupType, pricing.markupValue).toFixed(2)
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
