import type { Express } from "express";
import { timingSafeEqual } from "node:crypto";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { storage } from "../storage";
import {
  accounts as accountsTable,
  lineItems as lineItemsTable,
  quotes as quotesTable,
  type QuoteWithDetails,
} from "@shared/schema";

const deliveryBomQuerySchema = z.object({
  reference: z.string().trim().min(1).max(120),
});

const deliverySearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(120),
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

type DeliverySearchRow = {
  id: number;
  quoteNumber: string;
  versionNumber: number;
  projectName: string | null;
  jobsiteAddress: string | null;
  jobsiteStreetAddress: string | null;
  jobsiteAddressLine2: string | null;
  jobsiteCity: string | null;
  jobsiteState: string | null;
  jobsiteZipCode: string | null;
  dealStage: string;
  updatedAt: Date | null;
  accountName: string | null;
  accountCompany: string | null;
};

export function buildDeliverySearchResult(row: DeliverySearchRow) {
  const customerName =
    row.accountCompany?.trim() || row.accountName?.trim() || "Customer";
  const structuredAddress = [
    row.jobsiteStreetAddress,
    row.jobsiteAddressLine2,
    [row.jobsiteCity, row.jobsiteState].filter(Boolean).join(", "),
    row.jobsiteZipCode,
  ].filter(Boolean);

  return {
    id: row.id,
    quoteNumber: row.quoteNumber,
    versionNumber: row.versionNumber,
    projectName: row.projectName?.trim() || customerName,
    customerName,
    jobsiteAddress:
      structuredAddress.length > 0
        ? structuredAddress.join(" · ")
        : row.jobsiteAddress || null,
    dealStage: row.dealStage,
    updatedAt: row.updatedAt?.toISOString?.() || row.updatedAt || null,
  };
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
  app.get("/api/integrations/delivery-search", async (req, res) => {
    if (
      !isDeliveryIntegrationKeyValid(
        req.get("x-edg-integration-key"),
        process.env.DELIVERY_CHECK_INTEGRATION_KEY,
      )
    ) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const parsed = deliverySearchQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ message: "Enter at least two characters to search Rainmaker." });
    }

    try {
      const escaped = parsed.data.q.replace(/[\\%_]/g, "\\$&");
      const pattern = `%${escaped}%`;
      const results = await db
        .select({
          id: quotesTable.id,
          quoteNumber: quotesTable.quoteNumber,
          versionNumber: quotesTable.versionNumber,
          projectName: quotesTable.projectName,
          jobsiteAddress: quotesTable.jobsiteAddress,
          jobsiteStreetAddress: quotesTable.jobsiteStreetAddress,
          jobsiteAddressLine2: quotesTable.jobsiteAddressLine2,
          jobsiteCity: quotesTable.jobsiteCity,
          jobsiteState: quotesTable.jobsiteState,
          jobsiteZipCode: quotesTable.jobsiteZipCode,
          dealStage: quotesTable.dealStage,
          updatedAt: quotesTable.updatedAt,
          accountName: accountsTable.name,
          accountCompany: accountsTable.company,
        })
        .from(quotesTable)
        .leftJoin(accountsTable, eq(quotesTable.accountId, accountsTable.id))
        .where(
          and(
            eq(quotesTable.isLatestVersion, true),
            sql`exists (
              select 1
              from ${lineItemsTable}
              where ${lineItemsTable.quoteId} = ${quotesTable.id}
                and ${lineItemsTable.manufacturer} ilike '%sundance%'
            )`,
            or(
              ilike(quotesTable.quoteNumber, pattern),
              ilike(quotesTable.projectName, pattern),
              ilike(quotesTable.jobsiteAddress, pattern),
              ilike(quotesTable.jobsiteStreetAddress, pattern),
              ilike(quotesTable.jobsiteCity, pattern),
              ilike(quotesTable.jobsiteZipCode, pattern),
              ilike(accountsTable.name, pattern),
              ilike(accountsTable.company, pattern),
              ilike(accountsTable.email, pattern),
            ),
          ),
        )
        .orderBy(desc(quotesTable.updatedAt), desc(quotesTable.id))
        .limit(10);

      res.setHeader("Cache-Control", "no-store");
      return res.json({ results: results.map(buildDeliverySearchResult) });
    } catch (error) {
      console.error("Delivery search integration failed", {
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
      return res.status(500).json({ message: "Rainmaker job search failed." });
    }
  });

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
