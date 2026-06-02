import type { Express } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../replitAuth";
import {
  accountIdParamSchema,
  applyPlanningAgreementCreditSchema,
  confirmPlanningAgreementPaymentSchema,
  createPlanningAgreementSchema,
  idParamSchema,
  markPlanningAgreementDeliveredSchema,
  markPlanningAgreementSignedSchema,
  planningAgreementIdParamSchema,
  updatePlanningAgreementSchema,
  waivePlanningAgreementSchema,
} from "../validation-schemas";

const getActorUserId = (req: any): number | null => {
  const parsed = Number(req.user?.id);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const getRequestErrors = (errors: unknown) => ({
  message: "Invalid request data",
  errors,
});

export function registerPlanningAgreementRoutes(app: Express) {
  app.get("/api/accounts/:accountId/planning-agreements", isAuthenticated, async (req, res) => {
    try {
      const params = accountIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json(getRequestErrors(params.error.errors));
      }

      const agreements = await storage.getPlanningAgreementsByAccountId(params.data.accountId);
      res.json(agreements);
    } catch (error) {
      console.error("Error fetching account planning agreements:", error);
      res.status(500).json({ message: "Failed to fetch planning agreements" });
    }
  });

  app.get("/api/quotes/:id/planning-agreement", isAuthenticated, async (req, res) => {
    try {
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json(getRequestErrors(params.error.errors));
      }

      const agreement = await storage.getPlanningAgreementByQuoteId(params.data.id);
      res.json(agreement ?? null);
    } catch (error) {
      console.error("Error fetching quote planning agreement:", error);
      res.status(500).json({ message: "Failed to fetch planning agreement" });
    }
  });

  app.get("/api/planning-agreements/:id/events", isAuthenticated, async (req, res) => {
    try {
      const params = planningAgreementIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json(getRequestErrors(params.error.errors));
      }

      const events = await storage.getPlanningAgreementEvents(params.data.id);
      res.json(events);
    } catch (error) {
      console.error("Error fetching planning agreement events:", error);
      res.status(500).json({ message: "Failed to fetch planning agreement events" });
    }
  });

  app.post("/api/quotes/:id/planning-agreement", isAuthenticated, async (req: any, res) => {
    try {
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json(getRequestErrors(params.error.errors));
      }

      const body = createPlanningAgreementSchema.safeParse(req.body);
      if (!body.success) {
        return res.status(400).json(getRequestErrors(body.error.errors));
      }

      const quote = await storage.getQuote(params.data.id);
      if (!quote) {
        return res.status(404).json({ message: "Quote not found" });
      }

      const existingAgreement = await storage.getPlanningAgreementByQuoteId(quote.id);
      if (existingAgreement) {
        return res.status(409).json({
          message: "This quote family already has a Design + Planning Agreement.",
          planningAgreement: existingAgreement,
        });
      }

      const agreement = await storage.createPlanningAgreement({
        ...body.data,
        status: "required",
        quoteId: quote.id,
        quoteFamilyRootId: quote.parentQuoteId || quote.id,
        accountId: quote.accountId,
      }, getActorUserId(req));

      res.status(201).json(agreement);
    } catch (error) {
      console.error("Error creating planning agreement:", error);
      res.status(500).json({ message: "Failed to create planning agreement" });
    }
  });

  app.patch("/api/planning-agreements/:id", isAuthenticated, async (req: any, res) => {
    try {
      const params = planningAgreementIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json(getRequestErrors(params.error.errors));
      }

      const body = updatePlanningAgreementSchema.safeParse(req.body);
      if (!body.success) {
        return res.status(400).json(getRequestErrors(body.error.errors));
      }

      const agreement = await storage.updatePlanningAgreement(
        params.data.id,
        body.data,
        getActorUserId(req),
        "updated",
      );
      if (!agreement) {
        return res.status(404).json({ message: "Planning agreement not found" });
      }

      res.json(agreement);
    } catch (error) {
      console.error("Error updating planning agreement:", error);
      res.status(500).json({ message: "Failed to update planning agreement" });
    }
  });

  app.post("/api/planning-agreements/:id/send", isAuthenticated, async (req: any, res) => {
    try {
      const params = planningAgreementIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json(getRequestErrors(params.error.errors));
      }

      const agreement = await storage.updatePlanningAgreement(
        params.data.id,
        { status: "sent", agreementSentAt: new Date() },
        getActorUserId(req),
        "sent",
      );
      if (!agreement) {
        return res.status(404).json({ message: "Planning agreement not found" });
      }

      res.json(agreement);
    } catch (error) {
      console.error("Error marking planning agreement sent:", error);
      res.status(500).json({ message: "Failed to mark planning agreement sent" });
    }
  });

  app.post("/api/planning-agreements/:id/mark-signed", isAuthenticated, async (req: any, res) => {
    try {
      const params = planningAgreementIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json(getRequestErrors(params.error.errors));
      }

      const body = markPlanningAgreementSignedSchema.safeParse(req.body ?? {});
      if (!body.success) {
        return res.status(400).json(getRequestErrors(body.error.errors));
      }

      const signedAt = body.data.agreementSignedAt ?? new Date();
      const agreement = await storage.updatePlanningAgreement(
        params.data.id,
        { status: "signed_awaiting_payment", agreementSignedAt: signedAt },
        getActorUserId(req),
        "signed",
      );
      if (!agreement) {
        return res.status(404).json({ message: "Planning agreement not found" });
      }

      res.json(agreement);
    } catch (error) {
      console.error("Error marking planning agreement signed:", error);
      res.status(500).json({ message: "Failed to mark planning agreement signed" });
    }
  });

  app.post("/api/planning-agreements/:id/confirm-payment", isAuthenticated, async (req: any, res) => {
    try {
      const params = planningAgreementIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json(getRequestErrors(params.error.errors));
      }

      const body = confirmPlanningAgreementPaymentSchema.safeParse(req.body);
      if (!body.success) {
        return res.status(400).json(getRequestErrors(body.error.errors));
      }

      const agreement = await storage.getPlanningAgreement(params.data.id);
      if (!agreement) {
        return res.status(404).json({ message: "Planning agreement not found" });
      }

      const actorUserId = getActorUserId(req);
      const confirmedAt = body.data.paymentConfirmedAt ?? new Date();
      const updatedAgreement = await storage.updatePlanningAgreement(
        agreement.id,
        {
          status: "paid_active",
          amount: body.data.amount ?? agreement.amount,
          paymentConfirmedAt: confirmedAt,
          paymentConfirmedBy: actorUserId,
          paymentMethod: body.data.paymentMethod,
          paymentReference: body.data.paymentReference,
          paymentNotes: body.data.paymentNotes,
        },
        actorUserId,
        "payment_confirmed",
        {
          amount: body.data.amount ?? agreement.amount,
          paymentMethod: body.data.paymentMethod,
          paymentReference: body.data.paymentReference,
          verified: body.data.verified,
        },
      );

      res.json(updatedAgreement);
    } catch (error) {
      console.error("Error confirming planning agreement payment:", error);
      res.status(500).json({ message: "Failed to confirm planning agreement payment" });
    }
  });

  app.post("/api/planning-agreements/:id/waive", isAuthenticated, async (req: any, res) => {
    try {
      const params = planningAgreementIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json(getRequestErrors(params.error.errors));
      }

      const body = waivePlanningAgreementSchema.safeParse(req.body);
      if (!body.success) {
        return res.status(400).json(getRequestErrors(body.error.errors));
      }

      const actorUserId = getActorUserId(req);
      const agreement = await storage.updatePlanningAgreement(
        params.data.id,
        {
          status: "waived",
          waivedAt: new Date(),
          waivedBy: actorUserId,
          waiverReason: body.data.waiverReason,
        },
        actorUserId,
        "waived",
      );
      if (!agreement) {
        return res.status(404).json({ message: "Planning agreement not found" });
      }

      res.json(agreement);
    } catch (error) {
      console.error("Error waiving planning agreement:", error);
      res.status(500).json({ message: "Failed to waive planning agreement" });
    }
  });

  app.post("/api/planning-agreements/:id/mark-delivered", isAuthenticated, async (req: any, res) => {
    try {
      const params = planningAgreementIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json(getRequestErrors(params.error.errors));
      }

      const body = markPlanningAgreementDeliveredSchema.safeParse(req.body ?? {});
      if (!body.success) {
        return res.status(400).json(getRequestErrors(body.error.errors));
      }

      const actorUserId = getActorUserId(req);
      const agreement = await storage.updatePlanningAgreement(
        params.data.id,
        {
          status: "delivered",
          deliveredAt: body.data.deliveredAt ?? new Date(),
          deliveredBy: actorUserId,
        },
        actorUserId,
        "delivered",
      );
      if (!agreement) {
        return res.status(404).json({ message: "Planning agreement not found" });
      }

      res.json(agreement);
    } catch (error) {
      console.error("Error marking planning agreement delivered:", error);
      res.status(500).json({ message: "Failed to mark planning agreement delivered" });
    }
  });

  app.post("/api/planning-agreements/:id/apply-credit", isAuthenticated, async (req: any, res) => {
    try {
      const params = planningAgreementIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json(getRequestErrors(params.error.errors));
      }

      const body = applyPlanningAgreementCreditSchema.safeParse(req.body);
      if (!body.success) {
        return res.status(400).json(getRequestErrors(body.error.errors));
      }

      const agreement = await storage.getPlanningAgreement(params.data.id);
      if (!agreement) {
        return res.status(404).json({ message: "Planning agreement not found" });
      }

      if (!agreement.creditEligible) {
        return res.status(400).json({ message: "This planning agreement is not credit eligible." });
      }

      if (!agreement.paymentConfirmedAt && agreement.status !== "paid_active" && agreement.status !== "delivered") {
        return res.status(400).json({ message: "Confirm payment before applying a planning credit." });
      }

      if (agreement.creditExpiresAt && new Date(agreement.creditExpiresAt) < new Date()) {
        await storage.createPlanningAgreementEvent({
          planningAgreementId: agreement.id,
          eventType: "expired",
          actorUserId: getActorUserId(req),
          fromStatus: agreement.status,
          toStatus: agreement.status,
          payload: {
            creditExpiresAt: agreement.creditExpiresAt,
            attemptedQuoteId: body.data.quoteId,
          },
        });
        return res.status(400).json({
          message: "This planning credit is expired.",
          planningAgreement: agreement,
        });
      }

      const targetQuote = await storage.getQuote(body.data.quoteId);
      if (!targetQuote) {
        return res.status(404).json({ message: "Target quote not found" });
      }

      const targetRootId = targetQuote.parentQuoteId || targetQuote.id;
      if (agreement.quoteFamilyRootId && agreement.quoteFamilyRootId !== targetRootId) {
        return res.status(400).json({ message: "Planning credits can only be applied within the same quote family." });
      }

      const amount = Number(body.data.amount);
      const feeAmount = Number(agreement.amount);
      if (Number.isFinite(feeAmount) && amount > feeAmount) {
        return res.status(400).json({ message: "Planning credit cannot exceed the confirmed planning fee." });
      }

      const updatedAgreement = await storage.updatePlanningAgreement(
        agreement.id,
        {
          status: "credited",
          creditedQuoteId: targetQuote.id,
          creditedAt: new Date(),
          appliedCreditAmount: body.data.amount,
        },
        getActorUserId(req),
        "credit_applied",
        {
          creditedQuoteId: targetQuote.id,
          appliedCreditAmount: body.data.amount,
        },
      );

      res.json(updatedAgreement);
    } catch (error) {
      console.error("Error applying planning agreement credit:", error);
      res.status(500).json({ message: "Failed to apply planning agreement credit" });
    }
  });
}
