import { timingSafeEqual } from "node:crypto";
import type { Express } from "express";
import { asc, eq } from "drizzle-orm";

import { pricingDefaults, products } from "@shared/schema";
import { db, ensureProductCatalogColumns } from "../db";
import { buildDealerPortalCatalog } from "../dealerPortalCatalog";
import { redactedErrorType } from "../redactedLogging";

function isAuthorized(req: { headers: { authorization?: string } }) {
  const configuredKey = process.env.DEALER_PORTAL_INTEGRATION_KEY;
  const authHeader = req.headers.authorization;
  if (!configuredKey || !authHeader?.startsWith("Bearer ")) return false;

  const suppliedKey = authHeader.slice("Bearer ".length);
  const configuredBuffer = Buffer.from(configuredKey);
  const suppliedBuffer = Buffer.from(suppliedKey);
  return configuredBuffer.length === suppliedBuffer.length && timingSafeEqual(configuredBuffer, suppliedBuffer);
}

export function registerDealerPortalCatalogRoutes(app: Express) {
  app.get("/api/integrations/dealer-portal/sundance-catalog", async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    if (!isAuthorized(req)) return res.status(401).json({ message: "Unauthorized" });

    try {
      await ensureProductCatalogColumns();
      const [productRows, pricingRows] = await Promise.all([
        db.select({
          id: products.id,
          sku: products.sku,
          name: products.name,
          category: products.category,
          unit: products.unit,
          costPrice: products.costPrice,
        }).from(products).where(eq(products.manufacturer, "Sundance")).orderBy(asc(products.sku), asc(products.id)),
        db.select({
          markupType: pricingDefaults.markupType,
          markupValue: pricingDefaults.markupValue,
          updatedAt: pricingDefaults.updatedAt,
        }).from(pricingDefaults).where(eq(pricingDefaults.scope, "sundance")).limit(1),
      ]);
      const pricing = pricingRows[0] ?? { markupType: "percentage", markupValue: "100", updatedAt: null };
      return res.json(buildDealerPortalCatalog(productRows, pricing));
    } catch (error) {
      console.error("Dealer portal catalog read failed", { errorType: redactedErrorType(error) });
      return res.status(500).json({ message: "Catalog temporarily unavailable" });
    }
  });
}
