import { eq } from "drizzle-orm";
import { z } from "zod";
import { businessEvents, products } from "@shared/schema";
import { deriveProductCostFields } from "@shared/pricing";
import { appendBusinessEvent } from "./businessEvents";
import { db, ensureProductCatalogColumns } from "./db";
import { applySundanceSkuDefault, deriveSundanceSku } from "./sundanceSku";

const optionalText = z.string().trim().max(10_000).nullable().optional();

const importedProductSchema = z.object({
  name: z.string().trim().min(1).max(500),
  sku: z.string().trim().max(200).nullable().optional(),
  manufacturer: z.string().trim().min(1).max(500).optional(),
  category: optionalText,
  unit: z.string().trim().max(100).nullable().optional(),
  description: optionalText,
  retailPrice: z.number().finite().nonnegative(),
  cost: z.number().finite().nonnegative(),
});

export const productCatalogImportRequestSchema = z.object({
  importRequestId: z.string().uuid(),
  products: z.array(importedProductSchema).min(1).max(5_000),
});

export type ProductCatalogImportRequest = z.infer<typeof productCatalogImportRequestSchema>;

export type ProductCatalogImportResult = {
  created: number;
  updated: number;
  errors: string[];
  total: number;
  replayed: boolean;
};

export async function executeProductCatalogImport(
  input: ProductCatalogImportRequest,
  actorUserId?: number | null,
): Promise<ProductCatalogImportResult> {
  const data = productCatalogImportRequestSchema.parse(input);
  await ensureProductCatalogColumns();
  const eventKey = `product_catalog_import_completed:${data.importRequestId}`;

  return db.transaction(async (tx) => {
    const [completedAttempt] = await tx
      .select({ id: businessEvents.id })
      .from(businessEvents)
      .where(eq(businessEvents.eventKey, eventKey))
      .limit(1);
    if (completedAttempt) {
      return { created: 0, updated: 0, errors: [], total: data.products.length, replayed: true };
    }

    const allProducts = await tx.select().from(products);
    const productLookupByName = new Map(allProducts.map((product) => [product.name.toLowerCase().trim(), product]));
    const productLookupBySku = new Map<string, typeof allProducts[number]>();
    const skuRegex = /\(([A-Z0-9][A-Z0-9\-]+)\)\s*$/i;
    for (const product of allProducts) {
      const lookupSku = deriveSundanceSku(product) || product.sku;
      if (lookupSku) productLookupBySku.set(lookupSku.toUpperCase().trim(), product);
      const skuMatch = product.name.match(skuRegex);
      if (skuMatch) productLookupBySku.set(skuMatch[1].toUpperCase(), product);
    }

    let created = 0;
    let updated = 0;
    for (const imported of data.products) {
      const sku = deriveSundanceSku(imported) || imported.sku;
      const normalizedCost = imported.cost > 0 ? imported.cost : imported.retailPrice;
      const pricingFields = deriveProductCostFields(imported.retailPrice, normalizedCost);
      let existing = productLookupByName.get(imported.name.toLowerCase().trim());
      if (!existing && sku) existing = productLookupBySku.get(sku.toUpperCase().trim());

      if (existing) {
        const [saved] = await tx
          .update(products)
          .set(applySundanceSkuDefault({
            retailPrice: imported.retailPrice.toString(),
            defaultUnitPrice: imported.retailPrice.toString(),
            costPrice: pricingFields.costPrice,
            defaultDiscountType: pricingFields.defaultDiscountType,
            defaultDiscountValue: pricingFields.defaultDiscountValue,
            ...(sku !== undefined ? { sku: sku ? sku.trim() : null } : {}),
            ...(imported.manufacturer !== undefined ? { manufacturer: imported.manufacturer } : {}),
            ...(imported.category !== undefined ? { category: imported.category } : {}),
            ...(imported.unit !== undefined ? { unit: imported.unit } : {}),
            ...(imported.description !== undefined ? { description: imported.description } : {}),
          }, existing))
          .where(eq(products.id, existing.id))
          .returning();
        productLookupByName.set(saved.name.toLowerCase().trim(), saved);
        if (saved.sku) productLookupBySku.set(saved.sku.toUpperCase().trim(), saved);
        updated += 1;
        continue;
      }

      const productData = applySundanceSkuDefault({
        name: imported.name,
        sku: sku ? sku.trim() : null,
        description: imported.description || "",
        manufacturer: imported.manufacturer || "Imported",
        category: imported.category || null,
        retailPrice: imported.retailPrice.toString(),
        defaultUnitPrice: imported.retailPrice.toString(),
        costPrice: pricingFields.costPrice,
        defaultDiscountType: pricingFields.defaultDiscountType,
        defaultDiscountValue: pricingFields.defaultDiscountValue,
        unit: imported.unit || "each",
      });
      const [saved] = await tx.insert(products).values(productData).returning();
      productLookupByName.set(saved.name.toLowerCase().trim(), saved);
      if (saved.sku) productLookupBySku.set(saved.sku.toUpperCase().trim(), saved);
      created += 1;
    }

    await appendBusinessEvent(tx, {
      eventType: "product_catalog_import_completed",
      eventKey,
      actorUserId,
    });

    return { created, updated, errors: [], total: data.products.length, replayed: false };
  });
}
