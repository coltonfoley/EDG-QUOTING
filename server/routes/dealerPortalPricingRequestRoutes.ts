import type { Express } from "express";
import { eq, sql } from "drizzle-orm";

import {
  accounts,
  dealerPortalCompanyMappings,
  dealerPortalPricingRequests,
  quotes,
} from "@shared/schema";
import { db } from "../db";
import {
  dealerPortalPricingRequestSchema,
  hashDealerPortalPricingRequest,
} from "../dealerPortalPricingRequest";
import { isDealerPortalOrderKeyValid } from "../dealerPortalOrder";
import { redactedErrorType, validationIssueSummary } from "../redactedLogging";

function bearerToken(header: string | undefined) {
  return header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
}

function formattedAddress(address: { line1: string; line2: string | null; city: string; region: string; postalCode: string; country: string }) {
  return [address.line1, address.line2, `${address.city}, ${address.region} ${address.postalCode}`, address.country]
    .filter(Boolean)
    .join(" · ");
}

export function registerDealerPortalPricingRequestRoutes(app: Express) {
  app.post("/api/integrations/dealer-portal/pricing-requests", async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    if (!isDealerPortalOrderKeyValid(bearerToken(req.headers.authorization), process.env.DEALER_PORTAL_INTEGRATION_KEY)) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const parsed = dealerPortalPricingRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      console.error("Dealer portal pricing request validation failed", validationIssueSummary(parsed.error));
      return res.status(400).json({ message: "Invalid dealer portal pricing request" });
    }
    const request = parsed.data;
    const requestHash = hashDealerPortalPricingRequest(request);

    try {
      const result = await db.transaction(async (transaction) => {
        await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${request.portalCompanyId}))`);
        await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${request.portalPricingRequestId}))`);

        const [existing] = await transaction.select().from(dealerPortalPricingRequests)
          .where(eq(dealerPortalPricingRequests.portalPricingRequestId, request.portalPricingRequestId)).limit(1);
        if (existing) {
          if (existing.requestHash !== requestHash) return { outcome: "conflict" as const };
          if (!existing.quoteId) throw new Error("Dealer portal pricing request is incomplete.");
          return { outcome: "existing" as const, quoteId: existing.quoteId };
        }

        let [mapping] = await transaction.select().from(dealerPortalCompanyMappings)
          .where(eq(dealerPortalCompanyMappings.portalCompanyId, request.portalCompanyId)).limit(1);
        if (!mapping) {
          const billing = request.company.billingAddress;
          const [account] = await transaction.insert(accounts).values({
            name: request.company.name,
            company: request.company.name,
            email: request.company.billingEmail,
            phone: request.company.billingPhone,
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
            portalCompanyId: request.portalCompanyId,
            accountId: account.id,
          }).returning();
        }

        const product = request.product;
        const requestedSize = `${product.requestedLengthInches / 12}' × ${product.requestedWidthInches / 12}' outside-to-outside`;
        const shipTo = request.shippingAddress ? formattedAddress(request.shippingAddress) : "Not supplied";
        const now = new Date();
        const [quote] = await transaction.insert(quotes).values({
          quoteNumber: `DPR-${request.portalPricingRequestId}`,
          accountId: mapping.accountId,
          projectName: request.projectName,
          notes: "Dealer pricing request for a Sundance materials package. No BOM, price, engineering, installation, footings, permits, or site work has been approved by this request.",
          internalNotes: [
            `Dealer Portal pricing request ${request.portalPricingRequestId}`,
            `Requested size: ${requestedSize}`,
            `Frame/louvers: ${product.frameColor} / ${product.louverColor}`,
            `Operation: ${product.operation}; rain sensor: ${product.rainSensor}`,
            `Fulfillment: ${product.fulfillment}; ship-to: ${shipTo}`,
            `Reason: ${product.requestReason}`,
          ].join("\n"),
          taxRate: "0",
          tariffRate: "0",
          discount: "0",
          shipping: "0",
          isShippingTaxable: false,
          dealStage: "building_estimate",
          dealStageChangedAt: now,
          enableESignature: false,
          esigIncludeApprovalDrawing: false,
        }).returning();

        await transaction.insert(dealerPortalPricingRequests).values({
          portalPricingRequestId: request.portalPricingRequestId,
          portalCompanyId: request.portalCompanyId,
          requestHash,
          accountId: mapping.accountId,
          quoteId: quote.id,
          payload: request,
          completedAt: now,
        });
        return { outcome: "created" as const, quoteId: quote.id };
      });

      if (result.outcome === "conflict") {
        return res.status(409).json({ message: "Portal pricing request identity conflicts with existing evidence" });
      }
      return res.status(result.outcome === "created" ? 201 : 200).json({
        source: "rainmaker",
        outcome: result.outcome,
        rainmakerQuoteId: result.quoteId,
      });
    } catch (error) {
      console.error("Dealer portal pricing request creation failed", { errorType: redactedErrorType(error) });
      return res.status(422).json({ message: "Dealer portal pricing request could not be created" });
    }
  });
}
