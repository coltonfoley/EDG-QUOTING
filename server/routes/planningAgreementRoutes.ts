import type { Express } from "express";
import crypto from "crypto";
import { nanoid } from "nanoid";
import type { Account, InsertPlanningAgreementEvent, PlanningAgreement, QuoteWithDetails } from "@shared/schema";
import { storage } from "../storage";
import { isAuthenticated, requireAdmin } from "../auth";
import { buildAppUrl } from "../config";
import { deliverIdempotentEmail, EmailIdempotencyError, requireEmailIdempotencyKey } from "../emailDelivery";
import { redactedErrorType } from "../redactedLogging";
import {
  QuoteSignedLockedError,
  isCustomerApprovedQuote,
  sendQuoteSignedLockResponse,
} from "../quoteLock";
import {
  accountIdParamSchema,
  applyPlanningAgreementCreditSchema,
  confirmPlanningAgreementPaymentSchema,
  idParamSchema,
  markPlanningAgreementDeliveredSchema,
  markPlanningAgreementSignedSchema,
  planningAgreementSignatureTokenParamSchema,
  planningAgreementIdParamSchema,
  sendPlanningAgreementEmailSchema,
  submitSignatureSchema,
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

const COMPANY_INFO = {
  name: "EDG Patio & Shade",
  address: "1802 Holian Drive, Spring Grove, IL 60081",
  phone: "+1 (815) 581-0138",
  email: "info@edgpatioshade.com",
};

const tierLabels: Record<string, string> = {
  simple_layout: "Simple Layout",
  standard_design: "Standard Design",
  complex_planning: "Complex Planning",
  custom: "Custom",
};

const terminalAgreementStatuses = new Set(["waived", "canceled", "expired"]);
const paymentFinalizedAgreementStatuses = new Set(["paid_active", "delivered", "credited"]);
type PlanningAgreementStatus = NonNullable<InsertPlanningAgreementEvent["toStatus"]>;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/\n/g, "<br>");
}

function formatJobsiteAddress(quote?: Partial<QuoteWithDetails> | null): string | null {
  if (!quote) return null;
  const parts: string[] = [];

  if (quote.jobsiteStreetAddress) parts.push(quote.jobsiteStreetAddress);
  if (quote.jobsiteAddressLine2) parts.push(quote.jobsiteAddressLine2);

  const cityStateZip: string[] = [];
  if (quote.jobsiteCity) cityStateZip.push(quote.jobsiteCity);
  if (quote.jobsiteState) cityStateZip.push(quote.jobsiteState);
  if (quote.jobsiteZipCode) cityStateZip.push(quote.jobsiteZipCode);
  if (cityStateZip.length > 0) parts.push(cityStateZip.join(", "));
  if (quote.jobsiteCountry && quote.jobsiteCountry !== "United States") parts.push(quote.jobsiteCountry);

  return parts.length > 0 ? parts.join(", ") : null;
}

function formatMoney(value: unknown): string {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount)
    ? amount.toLocaleString("en-US", { style: "currency", currency: "USD" })
    : "$0.00";
}

function toIsoDate(value?: Date | string | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function getClientIp(req: any): string {
  const forwardedFor = req.headers["x-forwarded-for"];
  return Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : String(forwardedFor || req.socket.remoteAddress || "unknown").split(",")[0].trim();
}

function createDocumentFingerprint(snapshot: unknown): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(snapshot))
    .digest("hex");
}

function getAccountName(account?: Account | null): string {
  if (!account) return "Client";
  if (account.firstName || account.lastName) {
    const fullName = `${account.firstName || ""} ${account.lastName || ""}`.trim();
    if (fullName) return fullName;
  }
  return account.name || "Client";
}

async function getPlanningAgreementContext(agreement: PlanningAgreement): Promise<{
  quote?: QuoteWithDetails;
  account?: Account;
}> {
  const quote = agreement.quoteId
    ? await storage.getQuoteWithDetails(agreement.quoteId)
    : undefined;
  const account = quote?.account
    ?? (agreement.accountId ? await storage.getAccount(agreement.accountId) : undefined);

  return { quote, account };
}

function buildAgreementTerms(agreement: PlanningAgreement): string[] {
  const amount = formatMoney(agreement.amount);
  const creditTerms = agreement.creditEligible
    ? `The ${amount} planning fee may be credited toward the final project proposal within the same quote family if EDG proceeds with the work${agreement.creditExpiresAt ? ` before ${new Date(agreement.creditExpiresAt).toLocaleDateString("en-US")}` : ""}. The planning fee is not a cash refund.`
    : `The ${amount} planning fee is not credit eligible unless EDG documents a later exception in writing.`;

  return [
    "This Design + Planning Agreement authorizes EDG Patio & Shade to perform pre-construction planning, layout, drawing, estimating, coordination, or design review work for the referenced project.",
    `The planning fee for this agreement is ${amount}. Payment is handled outside this signing page and must be confirmed by EDG before the agreement is treated as paid and active.`,
    creditTerms,
    "This agreement is not a final construction contract, installation authorization, permit approval, engineering certification, or fabrication release.",
    "Final project pricing, product scope, engineering, permitting, production timing, and installation details remain subject to later review and written approval.",
    "If the customer changes scope, site conditions, product selection, or project requirements, EDG may revise the planning scope, project proposal, or final project pricing.",
    "Electronic signatures are accepted as legally binding signatures for this agreement.",
  ];
}

function buildPublicPlanningAgreement(
  agreement: PlanningAgreement,
  quote?: QuoteWithDetails,
  account?: Account,
): any {
  if (agreement.signedDocumentSnapshot) {
    return {
      ...(agreement.signedDocumentSnapshot as object),
      status: agreement.status,
      agreementSignedAt: toIsoDate(agreement.agreementSignedAt),
      customerSignatureData: agreement.customerSignatureData,
      customerSignedAt: toIsoDate(agreement.customerSignedAt),
      customerSignedIp: agreement.customerSignedIp,
      signatureAuditTrail: agreement.signatureAuditTrail,
    };
  }

  const customer = account
    ? {
        name: account.name,
        company: account.company,
        email: account.email,
        phone: account.phone,
        firstName: account.firstName,
        lastName: account.lastName,
      }
    : null;

  return {
    documentType: "design_planning_agreement",
    id: agreement.id,
    agreementNumber: `DPA-${String(agreement.id).padStart(5, "0")}`,
    status: agreement.status,
    tier: agreement.tier,
    tierLabel: tierLabels[agreement.tier] ?? agreement.tier,
    amount: agreement.amount,
    creditEligible: agreement.creditEligible,
    creditExpiresAt: toIsoDate(agreement.creditExpiresAt),
    scopeSummary: agreement.scopeSummary,
    accountName: getAccountName(account),
    account: customer,
    customer,
    quote: quote
      ? {
          id: quote.id,
          quoteNumber: quote.quoteNumber,
          projectName: quote.projectName,
          jobsiteAddress: formatJobsiteAddress(quote),
          jobsiteStreetAddress: quote.jobsiteStreetAddress,
          jobsiteAddressLine2: quote.jobsiteAddressLine2,
          jobsiteCity: quote.jobsiteCity,
          jobsiteState: quote.jobsiteState,
          jobsiteZipCode: quote.jobsiteZipCode,
          jobsiteCountry: quote.jobsiteCountry,
        }
      : null,
    projectName: quote?.projectName ?? null,
    quoteNumber: quote?.quoteNumber ?? null,
    jobsiteAddress: formatJobsiteAddress(quote),
    company: COMPANY_INFO,
    terms: buildAgreementTerms(agreement),
    agreementSentAt: toIsoDate(agreement.agreementSentAt),
    agreementSignedAt: toIsoDate(agreement.agreementSignedAt),
    paymentConfirmedAt: toIsoDate(agreement.paymentConfirmedAt),
    customerSignatureData: agreement.customerSignatureData,
    customerSignedAt: toIsoDate(agreement.customerSignedAt),
    customerSignedIp: agreement.customerSignedIp,
    signatureAuditTrail: agreement.signatureAuditTrail,
    createdAt: toIsoDate(agreement.createdAt),
  };
}

async function ensureAgreementSigningRecord(
  agreement: PlanningAgreement,
  actorUserId?: number | null,
): Promise<{ agreement: PlanningAgreement; snapshot: ReturnType<typeof buildPublicPlanningAgreement>; signingToken: string }> {
  const signingToken = agreement.signingToken || nanoid(32);
  const { quote, account } = await getPlanningAgreementContext(agreement);
  const snapshot = buildPublicPlanningAgreement({ ...agreement, signingToken }, quote, account);
  const existingSnapshot = agreement.agreementDocumentSnapshot
    ? JSON.stringify(agreement.agreementDocumentSnapshot)
    : null;
  const preparedSnapshot = JSON.stringify(snapshot);

  const needsUpdate = !agreement.signingToken
    || !agreement.agreementDocumentSnapshot
    || (!agreement.customerSignedAt && existingSnapshot !== preparedSnapshot);

  if (!needsUpdate) {
    return { agreement, snapshot, signingToken };
  }

  const updatedAgreement = await storage.updatePlanningAgreement(
    agreement.id,
    {
      signingToken,
      agreementDocumentSnapshot: snapshot,
    },
    actorUserId,
    "updated",
    {
      signingTokenLast6: signingToken.slice(-6),
      documentPrepared: true,
    },
  );

  return {
    agreement: updatedAgreement ?? agreement,
    snapshot,
    signingToken,
  };
}

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

      res.status(410).json({
        message: "Design + Planning Agreement creation has been removed from the quote workflow.",
        code: "PLANNING_AGREEMENT_REMOVED",
      });
    } catch (error) {
      console.error("Error creating planning agreement:", error);
      res.status(500).json({ message: "Failed to create planning agreement" });
    }
  });

  app.patch("/api/planning-agreements/:id", isAuthenticated, requireAdmin, async (req: any, res) => {
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

  app.post("/api/planning-agreements/:id/prepare-signing", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const params = planningAgreementIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json(getRequestErrors(params.error.errors));
      }

      const agreement = await storage.getPlanningAgreement(params.data.id);
      if (!agreement) {
        return res.status(404).json({ message: "Planning agreement not found" });
      }

      if (terminalAgreementStatuses.has(agreement.status)) {
        return res.status(409).json({ message: "This agreement is not active and cannot be sent for signature." });
      }

      const prepared = await ensureAgreementSigningRecord(agreement, getActorUserId(req));
      res.json({
        agreement: prepared.agreement,
        signingToken: prepared.signingToken,
        signingUrl: `/planning-agreements/sign/${prepared.signingToken}`,
        absoluteSigningUrl: buildAppUrl(`/planning-agreements/sign/${prepared.signingToken}`, req),
        document: prepared.snapshot,
      });
    } catch (error) {
      console.error("Error preparing planning agreement signing link:", error);
      res.status(500).json({ message: "Failed to prepare signing link" });
    }
  });

  app.post("/api/planning-agreements/:id/send-signature-email", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const params = planningAgreementIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json(getRequestErrors(params.error.errors));
      }
      const idempotencyKey = requireEmailIdempotencyKey(req.get("Idempotency-Key"));

      const body = sendPlanningAgreementEmailSchema.safeParse(req.body ?? {});
      if (!body.success) {
        return res.status(400).json(getRequestErrors(body.error.errors));
      }

      const agreement = await storage.getPlanningAgreement(params.data.id);
      if (!agreement) {
        return res.status(404).json({ message: "Planning agreement not found" });
      }

      if (terminalAgreementStatuses.has(agreement.status)) {
        return res.status(409).json({ message: "This agreement is not active and cannot be sent for signature." });
      }

      const prepared = await ensureAgreementSigningRecord(agreement, getActorUserId(req));
      const { quote, account } = await getPlanningAgreementContext(prepared.agreement);
      if (!account?.email) {
        return res.status(400).json({ message: "Customer email not found" });
      }

      const deliveryClaim = await storage.claimEmailDelivery({
        idempotencyKey,
        messageType: "planning_signature_request",
        planningAgreementId: prepared.agreement.id,
      });
      if (deliveryClaim.outcome === "conflict") {
        throw new EmailIdempotencyError(
          409,
          "EMAIL_IDEMPOTENCY_CONFLICT",
          "That email action key was already used for a different operation. Refresh Rainmaker and try again.",
        );
      }
      if (deliveryClaim.outcome === "in_progress") {
        throw new EmailIdempotencyError(
          409,
          "EMAIL_DELIVERY_IN_PROGRESS",
          "This email action is already being processed. Check the agreement before trying again.",
        );
      }
      if (deliveryClaim.outcome === "sent") {
        const sentAt = deliveryClaim.attempt?.sentAt ?? prepared.agreement.signatureEmailSentAt ?? new Date();
        return res.json({
          agreement: prepared.agreement,
          signingToken: prepared.signingToken,
          signingUrl: `/planning-agreements/sign/${prepared.signingToken}`,
          absoluteSigningUrl: buildAppUrl(`/planning-agreements/sign/${prepared.signingToken}`, req),
          message: `Design + Planning Agreement was already sent to ${account.email}`,
          sentAt: sentAt.toISOString(),
          replayed: true,
        });
      }
      if (!deliveryClaim.attempt) {
        throw new Error("Email delivery claim did not return an attempt record");
      }

      const { sendEmail } = await import("../email");

      const personalizedMessage = body.data.message?.trim() || "";
      const safePersonalizedMessage = personalizedMessage ? escapeHtml(personalizedMessage) : "";
      const signingUrl = buildAppUrl(`/planning-agreements/sign/${prepared.signingToken}`, req);
      const logoUrl = buildAppUrl("/api/brand-assets/brand-logo.png?raw=1", req);
      const customerName = getAccountName(account);
      const projectLabel = quote?.projectName || quote?.quoteNumber || `Design + Planning Agreement #${prepared.agreement.id}`;
      const personalizedMessageHtml = safePersonalizedMessage ? `
        <div style="background-color: #fff7ed; border-left: 4px solid #f97316; border-radius: 4px; padding: 20px; margin: 20px 0;">
          <p style="margin: 0; font-size: 14px; color: #1a1a1a; font-style: italic;">"${safePersonalizedMessage}"</p>
        </div>
      ` : "";

      const htmlBody = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Your Design + Planning Agreement</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
          <div style="background-color: #000000; border-radius: 8px 8px 0 0; border-bottom: 4px solid #14b8a6; padding: 30px; margin-bottom: 20px; text-align: center;">
            <img src="${logoUrl}" alt="EDG Patio & Shade" width="200" style="display: block; max-width: 200px; width: 200px; height: auto; margin: 0 auto 20px auto; border: 0; outline: none; text-decoration: none;" />
            <h1 style="color: #ffffff; margin-top: 0; font-size: 24px;">Design + Planning Agreement</h1>
            <p style="color: #ffffff; margin-bottom: 0;">Hello ${escapeHtml(customerName)},</p>
            <p style="color: #f0f0f0;">Your agreement for <strong>${escapeHtml(projectLabel)}</strong> is ready to review and sign.</p>
          </div>
          ${personalizedMessageHtml}
          <div style="background-color: #ffffff; border: 2px solid #e5e7eb; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
            <h2 style="color: #000000; margin-top: 0; font-size: 20px; border-bottom: 2px solid #14b8a6; padding-bottom: 10px;">Agreement Details</h2>
            <p style="color: #1a1a1a;"><strong>Agreement:</strong> ${escapeHtml(prepared.snapshot.agreementNumber)}</p>
            <p style="color: #1a1a1a;"><strong>Fee:</strong> ${formatMoney(prepared.agreement.amount)}</p>
            <p style="color: #1a1a1a;"><strong>Tier:</strong> ${escapeHtml(tierLabels[prepared.agreement.tier] ?? prepared.agreement.tier)}</p>
            ${quote?.quoteNumber ? `<p style="color: #1a1a1a;"><strong>Quote:</strong> #${escapeHtml(quote.quoteNumber)}</p>` : ""}
            ${formatJobsiteAddress(quote) ? `<p style="color: #1a1a1a;"><strong>Jobsite:</strong> ${escapeHtml(formatJobsiteAddress(quote) || "")}</p>` : ""}
          </div>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${signingUrl}" style="display: inline-block; background-color: #14b8a6; color: #ffffff; padding: 16px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; box-shadow: 0 2px 4px rgba(20, 184, 166, 0.3);">Review and Sign Agreement</a>
          </div>
          <div style="background-color: #f0fdfa; border-left: 4px solid #14b8a6; border-radius: 4px; padding: 20px; margin-top: 20px;">
            <p style="margin: 0; font-size: 14px; color: #115e59;">This agreement covers pre-construction design and planning work. It is not a final construction contract or fabrication release.</p>
          </div>
          <div style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #14b8a6; text-align: center; color: #6b7280; font-size: 12px;">
            <p style="margin: 5px 0; font-weight: 600; color: #1a1a1a;">EDG Patio & Shade</p>
            <p style="margin: 5px 0;">1802 Holian Drive, Spring Grove, IL 60081</p>
            <p style="margin: 5px 0;">Phone: +1 (815) 581-0138 | Email: info@edgpatioshade.com</p>
          </div>
        </body>
        </html>
      `;

      let providerResult: Awaited<ReturnType<typeof sendEmail>>;
      try {
        providerResult = await sendEmail({
          to: account.email,
          subject: `EDG Patio & Shade - Design + Planning Agreement for ${projectLabel}`,
          htmlBody,
        });
      } catch (emailError) {
        try {
          await storage.markEmailDeliveryFailed(deliveryClaim.attempt.id, redactedErrorType(emailError));
        } catch (deliveryError) {
          console.error("Could not record failed planning agreement email delivery", {
            planningAgreementId: prepared.agreement.id,
            errorType: redactedErrorType(deliveryError),
          });
        }
        throw emailError;
      }

      const sentAt = new Date();
      const finalizedDelivery = await storage.markEmailDeliverySent(
        deliveryClaim.attempt.id,
        sentAt,
        providerResult?.id ?? null,
      );
      if (!finalizedDelivery) {
        throw new Error("Email delivery record could not be finalized");
      }
      const nextStatus: PlanningAgreementStatus = prepared.agreement.status === "required"
        ? "sent"
        : prepared.agreement.status as PlanningAgreementStatus;
      const updatedAgreement = await storage.updatePlanningAgreement(
        prepared.agreement.id,
        {
          status: nextStatus,
          agreementSentAt: prepared.agreement.agreementSentAt ?? sentAt,
          signatureEmailSentAt: sentAt,
          signatureEmailMessage: personalizedMessage || null,
          signingToken: prepared.signingToken,
          agreementDocumentSnapshot: prepared.snapshot,
        },
        getActorUserId(req),
        "sent",
        {
          customerEmail: account.email,
          signingTokenLast6: prepared.signingToken.slice(-6),
          personalizedMessage: personalizedMessage || null,
        },
      );

      res.json({
        agreement: updatedAgreement,
        signingToken: prepared.signingToken,
        signingUrl: `/planning-agreements/sign/${prepared.signingToken}`,
        absoluteSigningUrl: signingUrl,
        message: `Design + Planning Agreement sent to ${account.email}`,
        sentAt: sentAt.toISOString(),
        replayed: false,
      });
    } catch (error) {
      if (error instanceof EmailIdempotencyError) {
        return res.status(error.status).json({ message: error.message, code: error.code });
      }
      console.error("Error sending planning agreement signature email", {
        errorType: redactedErrorType(error),
      });
      res.status(500).json({ message: "Failed to send agreement email" });
    }
  });

  app.get("/api/planning-agreements/:id/document", isAuthenticated, async (req, res) => {
    try {
      const params = planningAgreementIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json(getRequestErrors(params.error.errors));
      }

      const agreement = await storage.getPlanningAgreement(params.data.id);
      if (!agreement) {
        return res.status(404).json({ message: "Planning agreement not found" });
      }

      const { quote, account } = await getPlanningAgreementContext(agreement);
      res.json(buildPublicPlanningAgreement(agreement, quote, account));
    } catch (error) {
      console.error("Error fetching planning agreement document:", error);
      res.status(500).json({ message: "Failed to fetch planning agreement document" });
    }
  });

  app.get("/api/planning-agreement-signatures/:token/full", async (req, res) => {
    try {
      const params = planningAgreementSignatureTokenParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json(getRequestErrors(params.error.errors));
      }

      const agreement = await storage.getPlanningAgreementBySigningToken(params.data.token);
      if (!agreement) {
        return res.status(404).json({ message: "Invalid or expired signing link" });
      }

      if (terminalAgreementStatuses.has(agreement.status) && !agreement.customerSignedAt) {
        return res.status(410).json({ message: "This agreement is no longer active. Please contact EDG for a current agreement." });
      }

      const { quote, account } = await getPlanningAgreementContext(agreement);
      res.json(buildPublicPlanningAgreement(agreement, quote, account));
    } catch (error) {
      console.error("Error fetching public planning agreement:", error);
      res.status(500).json({ message: "Failed to fetch planning agreement" });
    }
  });

  app.post("/api/planning-agreement-signatures/:token/sign", async (req, res) => {
    try {
      const params = planningAgreementSignatureTokenParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json(getRequestErrors(params.error.errors));
      }

      const bodyValidation = submitSignatureSchema.safeParse(req.body);
      if (!bodyValidation.success) {
        return res.status(400).json(getRequestErrors(bodyValidation.error.errors));
      }

      const { signatureData, signerType } = bodyValidation.data;
      if (signerType !== "client") {
        return res.status(403).json({ message: "Only customer signatures are accepted on this link." });
      }

      const agreement = await storage.getPlanningAgreementBySigningToken(params.data.token);
      if (!agreement) {
        return res.status(404).json({ message: "Invalid or expired signing link" });
      }

      if (terminalAgreementStatuses.has(agreement.status)) {
        return res.status(410).json({ message: "This agreement is no longer active. Please contact EDG for a current agreement." });
      }

      if (agreement.customerSignedAt) {
        return res.status(409).json({ message: "Customer signature has already been recorded" });
      }

      const { quote, account } = await getPlanningAgreementContext(agreement);
      const signedAt = new Date();
      const clientIp = getClientIp(req);
      const nextStatus: PlanningAgreementStatus = agreement.paymentConfirmedAt ? "paid_active" : "signed_awaiting_payment";
      const snapshotAgreement: PlanningAgreement = {
        ...agreement,
        status: nextStatus,
        agreementSignedAt: signedAt,
        customerSignatureData: signatureData,
        customerSignedAt: signedAt,
        customerSignedIp: clientIp,
      };
      const snapshot = buildPublicPlanningAgreement(snapshotAgreement, quote, account);
      const documentFingerprint = createDocumentFingerprint(snapshot);
      const auditEntry = {
        event: "customer_signed",
        signerType: "client",
        signerName: signatureData.name,
        signerEmail: account?.email || null,
        signedAt: signedAt.toISOString(),
        ipAddress: clientIp,
        userAgent: req.get("user-agent") || null,
        agreementId: agreement.id,
        agreementNumber: snapshot.agreementNumber,
        quoteId: quote?.id ?? null,
        quoteNumber: quote?.quoteNumber ?? null,
        signingTokenLast6: params.data.token.slice(-6),
        consentText: "I confirm that I have reviewed this Design + Planning Agreement and agree to be legally bound by its terms. I understand that my electronic signature carries the same legal weight as a handwritten signature.",
        documentFingerprint,
      };
      const existingAudit = agreement.signatureAuditTrail as any;

      await storage.updatePlanningAgreement(
        agreement.id,
        {
          status: nextStatus,
          agreementSignedAt: signedAt,
          customerSignatureData: signatureData,
          customerSignedAt: signedAt,
          customerSignedIp: clientIp,
          agreementDocumentSnapshot: agreement.agreementDocumentSnapshot ?? snapshot,
          signedDocumentSnapshot: snapshot,
          signatureAuditTrail: {
            documentFingerprint,
            entries: [
              ...(existingAudit?.entries || []),
              auditEntry,
            ],
          },
        },
        null,
        "signed",
        {
          signerName: signatureData.name,
          signerEmail: account?.email || null,
          documentFingerprint,
          signingTokenLast6: params.data.token.slice(-6),
        },
      );

      let emailSent = false;
      if (account?.email) {
        try {
          const { sendEmail } = await import("../email");
          const downloadUrl = buildAppUrl(`/planning-agreements/sign/${params.data.token}`, req);
          const signedDate = signedAt.toLocaleString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
            timeZoneName: "short",
          });

          const htmlBody = `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Design + Planning Agreement Signed</title>
            </head>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
              <div style="background-color: #059669; border-radius: 8px 8px 0 0; padding: 30px; margin-bottom: 0; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Agreement Signed Successfully</h1>
              </div>
              <div style="background-color: #ffffff; border: 1px solid #e5e7eb; border-top: none; padding: 30px; margin-bottom: 20px;">
                <p style="color: #1a1a1a; margin-top: 0;">Hello ${escapeHtml(getAccountName(account))},</p>
                <p style="color: #4b5563;">This email confirms that your Design + Planning Agreement signature has been recorded.</p>
                <div style="background-color: #f3f4f6; border-radius: 8px; padding: 20px; margin: 20px 0;">
                  <p style="margin: 5px 0;"><strong>Agreement:</strong> ${escapeHtml(snapshot.agreementNumber)}</p>
                  <p style="margin: 5px 0;"><strong>Project:</strong> ${escapeHtml(snapshot.projectName || snapshot.quoteNumber || "Design + Planning")}</p>
                  <p style="margin: 5px 0;"><strong>Signed On:</strong> ${escapeHtml(signedDate)}</p>
                  <p style="margin: 5px 0;"><strong>Document ID:</strong> ${escapeHtml(documentFingerprint.slice(0, 16))}</p>
                </div>
                <div style="text-align: center; margin: 25px 0;">
                  <a href="${downloadUrl}" style="display: inline-block; background-color: #000000; color: #ffffff; text-decoration: none; padding: 14px 30px; border-radius: 6px; font-weight: 600; font-size: 14px;">Download Signed Agreement</a>
                </div>
              </div>
              <div style="text-align: center; color: #6b7280; font-size: 12px; padding-top: 20px;">
                <p style="margin: 5px 0; font-weight: 600; color: #1a1a1a;">EDG Patio & Shade</p>
                <p style="margin: 5px 0;">1802 Holian Drive, Spring Grove, IL 60081</p>
                <p style="margin: 5px 0;">Phone: +1 (815) 581-0138 | Email: info@edgpatioshade.com</p>
              </div>
            </body>
            </html>
          `;

          const delivery = await deliverIdempotentEmail({
            ledger: storage,
            idempotencyKey: `planning-signature-confirmation:${agreement.id}:${documentFingerprint}`,
            messageType: "planning_signature_confirmation",
            planningAgreementId: agreement.id,
            send: () => sendEmail({
              to: account.email,
              subject: `Signature Confirmed: Design + Planning Agreement ${snapshot.agreementNumber}`,
              htmlBody,
            }),
          });
          emailSent = delivery.outcome === "sent" || delivery.outcome === "replayed";
          if (!emailSent) {
            console.warn("Planning agreement confirmation email needs review", {
              planningAgreementId: agreement.id,
              outcome: delivery.outcome,
              errorType: delivery.errorType ?? null,
            });
          }
        } catch (emailError) {
          console.error("Failed to send planning agreement confirmation email", {
            planningAgreementId: agreement.id,
            errorType: redactedErrorType(emailError),
          });
        }
      }

      res.json({
        success: true,
        message: "Agreement signature captured successfully",
        emailSent,
      });
    } catch (error) {
      console.error("Error submitting planning agreement signature:", error);
      res.status(500).json({ message: "Failed to submit agreement signature" });
    }
  });

  app.post("/api/planning-agreements/:id/send", isAuthenticated, requireAdmin, async (req: any, res) => {
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

  app.post("/api/planning-agreements/:id/mark-signed", isAuthenticated, requireAdmin, async (req: any, res) => {
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

  app.post("/api/planning-agreements/:id/confirm-payment", isAuthenticated, requireAdmin, async (req: any, res) => {
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

      if (terminalAgreementStatuses.has(agreement.status)) {
        return res.status(409).json({ message: "Payment cannot be confirmed for an inactive planning agreement." });
      }

      if (agreement.paymentConfirmedAt || paymentFinalizedAgreementStatuses.has(agreement.status)) {
        return res.status(409).json({ message: "Payment has already been confirmed for this planning agreement." });
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

  app.post("/api/planning-agreements/:id/waive", isAuthenticated, requireAdmin, async (req: any, res) => {
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

  app.post("/api/planning-agreements/:id/mark-delivered", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const params = planningAgreementIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json(getRequestErrors(params.error.errors));
      }

      const body = markPlanningAgreementDeliveredSchema.safeParse(req.body ?? {});
      if (!body.success) {
        return res.status(400).json(getRequestErrors(body.error.errors));
      }

      const currentAgreement = await storage.getPlanningAgreement(params.data.id);
      if (!currentAgreement) {
        return res.status(404).json({ message: "Planning agreement not found" });
      }

      if (currentAgreement.status !== "paid_active" || !currentAgreement.paymentConfirmedAt) {
        return res.status(409).json({ message: "Confirm payment before marking planning work delivered." });
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

  app.post("/api/planning-agreements/:id/apply-credit", isAuthenticated, requireAdmin, async (req: any, res) => {
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
        const currentStatus = agreement.status as InsertPlanningAgreementEvent["fromStatus"];
        await storage.createPlanningAgreementEvent({
          planningAgreementId: agreement.id,
          eventType: "expired",
          actorUserId: getActorUserId(req),
          fromStatus: currentStatus,
          toStatus: currentStatus,
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
      if (isCustomerApprovedQuote(targetQuote)) {
        return sendQuoteSignedLockResponse(res, new QuoteSignedLockedError(targetQuote.id));
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

      const updatedAgreement = await storage.applyPlanningAgreementCredit(
        agreement.id,
        targetQuote.id,
        body.data.amount,
        getActorUserId(req),
      );

      res.json(updatedAgreement);
    } catch (error) {
      if (sendQuoteSignedLockResponse(res, error)) return;
      console.error("Error applying planning agreement credit:", error);
      res.status(500).json({ message: "Failed to apply planning agreement credit" });
    }
  });
}
