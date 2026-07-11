import type { Express } from "express";
import { isAuthenticated, requireAdmin } from "../auth";
import { buildAppUrl } from "../config";
import { deliverQuoteSignatureConfirmation } from "../quoteSignatureConfirmation";
import { redactedErrorType } from "../redactedLogging";
import { storage } from "../storage";
import { idParamSchema } from "../validation-schemas";

export function registerEmailDeliveryRoutes(app: Express) {
  app.get("/api/admin/email-delivery-health", isAuthenticated, requireAdmin, async (_req, res) => {
    try {
      const health = await storage.getEmailDeliveryHealth({
        staleAfterMinutes: 15,
        limit: 50,
      });
      res.json(health);
    } catch (error) {
      console.error("Error fetching email delivery health", {
        errorType: redactedErrorType(error),
      });
      res.status(500).json({ message: "Failed to fetch email delivery health" });
    }
  });

  app.post("/api/admin/email-delivery-attempts/:id/retry-confirmation", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) return res.status(400).json({ message: "Invalid delivery record" });

      const attempt = await storage.getEmailDeliveryAttempt(params.data.id);
      if (!attempt) return res.status(404).json({ message: "Delivery record not found" });
      if (
        attempt.messageType !== "quote_signature_confirmation"
        || attempt.status !== "failed"
        || !attempt.quoteId
      ) {
        return res.status(409).json({
          message: "Only a failed quote confirmation receipt can be retried from this action.",
        });
      }

      const quote = await storage.getQuoteWithDetails(attempt.quoteId);
      const documentFingerprint = (quote?.signatureAuditTrail as any)?.documentFingerprint;
      if (
        !quote?.clientSignedAt
        || !quote.signingToken
        || !quote.account?.email
        || typeof documentFingerprint !== "string"
        || !documentFingerprint
      ) {
        return res.status(409).json({
          message: "The signed quote is missing the information required to retry its confirmation receipt.",
        });
      }

      const expectedKey = `quote-signature-confirmation:${quote.id}:${documentFingerprint}`;
      if (attempt.idempotencyKey !== expectedKey) {
        return res.status(409).json({ message: "The delivery record does not match the signed document." });
      }

      const customerName = quote.account.firstName
        ? `${quote.account.firstName} ${quote.account.lastName || ""}`.trim()
        : quote.account.name || "Client";
      const downloadUrl = buildAppUrl(`/sign/${quote.signingToken}`, req);
      const delivery = await deliverQuoteSignatureConfirmation({
        ledger: storage,
        quote,
        recipient: quote.account.email,
        customerName,
        signedAt: new Date(quote.clientSignedAt),
        documentFingerprint,
        downloadUrl,
        replacement: true,
      });

      if (delivery.outcome === "sent" || delivery.outcome === "replayed") {
        return res.json({ success: true, message: "The signature confirmation receipt was accepted by the email provider." });
      }
      const status = delivery.outcome === "failed" ? 502 : 409;
      return res.status(status).json({
        message: delivery.outcome === "failed"
          ? "The email provider did not accept the confirmation receipt. The failed record remains available for review."
          : "The confirmation receipt could not be safely retried. Review the delivery record before taking another action.",
      });
    } catch (error) {
      console.error("Error retrying signature confirmation", { errorType: redactedErrorType(error) });
      res.status(500).json({ message: "Failed to retry signature confirmation" });
    }
  });
}
