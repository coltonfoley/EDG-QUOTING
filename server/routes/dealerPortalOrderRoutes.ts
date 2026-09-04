import type { Express } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import {
  accounts,
  dealerPortalCompanyMappings,
  dealerPortalOrderSubmissions,
  lineItems,
  products,
  quotes,
} from "@shared/schema";
import { db } from "../db";
import {
  dealerPortalOrderSchema,
  hashDealerPortalOrder,
  isDealerPortalOrderKeyValid,
  validateDealerPortalCatalogMatch,
  dealerPortalFrozenPricingFields,
} from "../dealerPortalOrder";
import { redactedErrorType, validationIssueSummary } from "../redactedLogging";

function bearerToken(header: string | undefined) {
  return header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
}

function formattedAddress(address: {
  line1: string;
  line2: string | null;
  city: string;
  region: string;
  postalCode: string;
  country: string;
}) {
  return [address.line1, address.line2, `${address.city}, ${address.region} ${address.postalCode}`, address.country]
    .filter(Boolean)
    .join(" · ");
}

export function registerDealerPortalOrderRoutes(app: Express) {
  app.post("/api/integrations/dealer-portal/orders", async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    if (!isDealerPortalOrderKeyValid(
      bearerToken(req.headers.authorization),
      process.env.DEALER_PORTAL_INTEGRATION_KEY,
    )) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const parsed = dealerPortalOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      console.error("Dealer portal order validation failed", validationIssueSummary(parsed.error));
      return res.status(400).json({ message: "Invalid dealer portal order" });
    }
    const order = parsed.data;
    const requestHash = hashDealerPortalOrder(order);

    try {
      const result = await db.transaction(async (transaction) => {
        await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${order.portalCompanyId}))`);
        await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${order.portalOrderId}))`);

        const [existingSubmission] = await transaction
          .select()
          .from(dealerPortalOrderSubmissions)
          .where(eq(dealerPortalOrderSubmissions.portalOrderId, order.portalOrderId))
          .limit(1);
        if (existingSubmission) {
          if (
            existingSubmission.requestHash !== requestHash ||
            existingSubmission.snapshotHash !== order.snapshotHash
          ) return { outcome: "conflict" as const };
          if (!existingSubmission.quoteId) throw new Error("Dealer portal order is incomplete.");
          return {
            outcome: "existing" as const,
            quoteId: existingSubmission.quoteId,
          };
        }

        let [mapping] = await transaction
          .select()
          .from(dealerPortalCompanyMappings)
          .where(eq(dealerPortalCompanyMappings.portalCompanyId, order.portalCompanyId))
          .limit(1);
        if (!mapping) {
          const billing = order.company.billingAddress;
          const [account] = await transaction.insert(accounts).values({
            name: order.company.name,
            company: order.company.name,
            email: order.company.billingEmail,
            phone: order.company.billingPhone,
            accountType: "general_contractor",
            paymentTerms: "due_on_receipt",
            billingAddress: formattedAddress(billing),
            streetAddress: billing.line1,
            addressLine2: billing.line2,
            city: billing.city,
            state: billing.region,
            zipCode: billing.postalCode,
            country: billing.country,
          }).returning();
          [mapping] = await transaction.insert(dealerPortalCompanyMappings).values({
            portalCompanyId: order.portalCompanyId,
            accountId: account.id,
          }).returning();
        }

        const skus = [...new Set(order.materials.lines.map((line) => line.sku))];
        const productRows = await transaction.select({
            id: products.id,
            sku: products.sku,
            name: products.name,
            manufacturer: products.manufacturer,
            unit: products.unit,
            costPrice: products.costPrice,
          }).from(products).where(inArray(products.sku, skus));
        const matchedLines = validateDealerPortalCatalogMatch(order, productRows);
        const now = new Date();
        const quoteNumber = `DP-${order.portalOrderId}`;
        const [quote] = await transaction.insert(quotes).values({
          quoteNumber,
          accountId: mapping.accountId,
          projectName: order.projectName,
          notes: "Sundance materials package supplied by EDG. Installation, design, permits, engineering, footings, and site work are excluded.",
          internalNotes: `Dealer Portal order ${order.portalOrderId}; snapshot ${order.snapshotHash}; QuickBooks invoice ${order.quickBooks.invoiceNumber}; first payment confirmed ${order.quickBooks.depositPaidAt}.`,
          taxRate: "0",
          tariffRate: "0",
          discount: "0",
          shipping: "0",
          isShippingTaxable: false,
          dealStage: "closed_won",
          dealStageChangedAt: now,
          enableESignature: false,
          esigIncludeApprovalDrawing: false,
        }).returning();

        await transaction.insert(lineItems).values(matchedLines.map(({ line, product, cost }, position) => ({
          quoteId: quote.id,
          productId: product.id,
          sku: product.sku,
          manufacturer: product.manufacturer,
          unit: product.unit ?? "each",
          ...dealerPortalFrozenPricingFields(order, line, cost),
          description: line.description,
          quantity: line.quantity.toString(),
          configData: { role: line.role, color: line.color },
          isAccessory: false,
          isTaxable: true,
          isTariffApplicable: false,
          position,
        })));

        await transaction.insert(dealerPortalOrderSubmissions).values({
          portalOrderId: order.portalOrderId,
          portalCompanyId: order.portalCompanyId,
          requestHash,
          snapshotHash: order.snapshotHash,
          accountId: mapping.accountId,
          quoteId: quote.id,
          payload: order,
          completedAt: now,
        });
        return { outcome: "created" as const, quoteId: quote.id };
      });

      if (result.outcome === "conflict") {
        return res.status(409).json({ message: "Portal order identity conflicts with existing Rainmaker evidence" });
      }
      return res.status(result.outcome === "created" ? 201 : 200).json({
        source: "rainmaker",
        outcome: result.outcome,
        rainmakerOrderId: result.quoteId,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid dealer portal order" });
      }
      console.error("Dealer portal order creation failed", { errorType: redactedErrorType(error) });
      return res.status(422).json({ message: "Dealer portal order could not be created from the supplied evidence" });
    }
  });
}
