import type { Express } from "express";
import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { storage } from "../storage";
import { quotes as quotesTable, type QuoteWithDetails } from "@shared/schema";

const deliveryBomQuerySchema = z.object({
  reference: z.string().trim().min(1).max(120),
});

export function isDeliveryIntegrationKeyValid(
  provided: string | undefined,
  configured: string | undefined,
) {
  if (!provided || !configured || configured.length < 24) return false;
  const providedBytes = Buffer.from(provided);
  const configuredBytes = Buffer.from(configured);
  return (
    providedBytes.length === configuredBytes.length &&
    timingSafeEqual(providedBytes, configuredBytes)
  );
}

function formatJobsiteAddress(quote: QuoteWithDetails) {
  const structured = [
    quote.jobsiteStreetAddress,
    quote.jobsiteAddressLine2,
    [quote.jobsiteCity, quote.jobsiteState].filter(Boolean).join(", "),
    quote.jobsiteZipCode,
  ].filter(Boolean);
  return structured.length > 0 ? structured.join(" · ") : quote.jobsiteAddress || null;
}

export function buildDeliveryBomPayload(quote: QuoteWithDetails) {
  const groups = new Map(
    (quote.groups || []).map((group) => [
      group.id,
      { title: group.title, position: group.position },
    ]),
  );
  const account = quote.account || quote.customer;
  const customerName =
    account?.company?.trim() || account?.name?.trim() || "Customer";

  return {
    quote: {
      id: quote.id,
      quoteNumber: quote.quoteNumber,
      versionNumber: quote.versionNumber,
      isLatestVersion: quote.isLatestVersion,
      updatedAt: quote.updatedAt?.toISOString?.() || quote.updatedAt || null,
      projectName: quote.projectName?.trim() || customerName,
      customerName,
      customerEmail: account?.email?.trim() || null,
      jobsiteAddress: formatJobsiteAddress(quote),
      dealStage: quote.dealStage,
    },
    items: [...quote.lineItems]
      .sort((left, right) => {
        const leftGroup = left.groupId ? groups.get(left.groupId) : undefined;
        const rightGroup = right.groupId ? groups.get(right.groupId) : undefined;
        const groupDifference =
          (leftGroup?.position ?? Number.MAX_SAFE_INTEGER) -
          (rightGroup?.position ?? Number.MAX_SAFE_INTEGER);
        return groupDifference || (left.position ?? 0) - (right.position ?? 0);
      })
      .map((item) => ({
        id: item.id,
        description: item.description,
        sku: item.sku || null,
        manufacturer: item.manufacturer || null,
        quantity: item.quantity,
        unit: item.unit || null,
        groupTitle: item.groupId ? groups.get(item.groupId)?.title || null : null,
        position: item.position ?? 0,
      })),
  };
}

export function registerDeliveryIntegrationRoutes(app: Express) {
  app.get("/api/integrations/delivery-bom", async (req, res) => {
    if (
      !isDeliveryIntegrationKeyValid(
        req.get("x-edg-integration-key"),
        process.env.DELIVERY_CHECK_INTEGRATION_KEY,
      )
    ) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const parsed = deliveryBomQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: "A valid quote reference is required." });
    }

    try {
      const reference = parsed.data.reference;
      let quoteId: number | undefined;

      if (/^\d+$/.test(reference)) {
        quoteId = Number(reference);
      } else {
        const [match] = await db
          .select({ id: quotesTable.id })
          .from(quotesTable)
          .where(eq(quotesTable.quoteNumber, reference))
          .limit(1);
        quoteId = match?.id;
      }

      if (!quoteId) {
        return res.status(404).json({ message: "Rainmaker quote not found." });
      }

      const quote = await storage.getQuoteWithDetails(quoteId);
      if (!quote) {
        return res.status(404).json({ message: "Rainmaker quote not found." });
      }

      res.setHeader("Cache-Control", "no-store");
      return res.json(buildDeliveryBomPayload(quote));
    } catch (error) {
      console.error("Delivery BOM integration lookup failed", {
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
      return res.status(500).json({ message: "Rainmaker BOM lookup failed." });
    }
  });
}
