import crypto from "node:crypto";
import { sanitizeQuoteApprovalDrawingForPublic } from "@shared/approvalDrawing";

export function formatJobsiteAddress(quote: any): string | null {
  const parts: string[] = [];

  if (quote.jobsiteStreetAddress) parts.push(quote.jobsiteStreetAddress);
  if (quote.jobsiteAddressLine2) parts.push(quote.jobsiteAddressLine2);

  const cityStateZip: string[] = [];
  if (quote.jobsiteCity) cityStateZip.push(quote.jobsiteCity);
  if (quote.jobsiteState) cityStateZip.push(quote.jobsiteState);
  if (quote.jobsiteZipCode) cityStateZip.push(quote.jobsiteZipCode);
  if (cityStateZip.length > 0) parts.push(cityStateZip.join(", "));

  if (quote.jobsiteCountry && quote.jobsiteCountry !== "United States") {
    parts.push(quote.jobsiteCountry);
  }

  return parts.length > 0 ? parts.join(", ") : null;
}

function parseMoney(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value.replace(/[^0-9.-]/g, "")) : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function calculatePublicLineTotal(item: any, quote: any): number {
  const quantity = Math.max(0, parseMoney(item.quantity));
  const unitPrice = Math.max(0, parseMoney(item.unitPrice));
  const discountValue = Math.max(0, parseMoney(item.discountValue));
  const markupValue = Math.max(0, parseMoney(item.markupValue));
  const tariffRate = item.isTariffApplicable ? Math.max(0, parseMoney(quote.tariffRate)) : 0;

  let lineTotal = quantity * unitPrice;
  if ((item.discountType || "percentage") === "dollar") {
    lineTotal = Math.max(0, lineTotal - discountValue);
  } else if (discountValue > 0) {
    lineTotal = Math.max(0, lineTotal - (lineTotal * Math.min(discountValue, 100) / 100));
  }

  if (tariffRate > 0) {
    lineTotal += lineTotal * Math.min(tariffRate, 100) / 100;
  }

  if ((item.markupType || "percentage") === "dollar") {
    lineTotal += markupValue;
  } else if (markupValue > 0) {
    lineTotal += lineTotal * markupValue / 100;
  }

  return Math.round(lineTotal * 100) / 100;
}

export function shouldIncludeApprovalDrawingInPackage(quote: any): boolean {
  return Boolean(quote?.esigIncludeApprovalDrawing === true && quote?.approvalDrawing);
}

function signedSnapshotIncludesApprovalDrawing(snapshot: Record<string, any>): boolean {
  if (snapshot.esigIncludeApprovalDrawing === false) return false;
  if (snapshot.esigIncludeApprovalDrawing === true) return Boolean(snapshot.approvalDrawing);
  return Boolean(snapshot.approvalDrawing);
}

export function buildPublicSigningQuote(quote: any) {
  const includeApprovalDrawing = shouldIncludeApprovalDrawingInPackage(quote);
  const publicLineItems = (quote.lineItems || []).map((item: any) => {
    const quantity = Math.max(0, parseMoney(item.quantity));
    const lineTotal = calculatePublicLineTotal(item, quote);
    const publicUnitPrice = quantity > 0 ? lineTotal / quantity : lineTotal;

    return {
      id: item.id,
      quoteId: item.quoteId,
      productId: item.productId,
      description: item.description,
      quantity: item.quantity,
      unitPrice: publicUnitPrice.toFixed(2),
      markupType: "percentage",
      markupValue: "0",
      discountType: "percentage",
      discountValue: "0",
      isTaxable: item.isTaxable,
      groupId: item.groupId,
      position: item.position,
      sku: item.sku,
      manufacturer: item.manufacturer,
    };
  });

  const publicQuote = {
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
    accountName: quote.account?.name || quote.customer?.name || "Client",
    account: quote.account ? {
      name: quote.account.name,
      company: quote.account.company,
      email: quote.account.email,
      phone: quote.account.phone,
      firstName: quote.account.firstName,
      lastName: quote.account.lastName,
    } : undefined,
    customer: quote.account ? {
      name: quote.account.name,
      company: quote.account.company,
      email: quote.account.email,
      phone: quote.account.phone,
      firstName: quote.account.firstName,
      lastName: quote.account.lastName,
    } : undefined,
    lineItems: publicLineItems,
    taxRate: quote.taxRate,
    discount: quote.discount,
    shipping: quote.shipping,
    isShippingTaxable: quote.isShippingTaxable,
    contractTemplate: quote.esigIncludeContract ? quote.contractTemplate : undefined,
    customContractTerms: quote.esigIncludeContract ? quote.customContractTerms : null,
    notes: quote.esigIncludeContract ? quote.notes : null,
    clientSignatureData: quote.clientSignatureData,
    clientSignedAt: quote.clientSignedAt,
    clientSignedIp: quote.clientSignedIp,
    companySignatureData: quote.companySignatureData,
    companySignedAt: quote.companySignedAt,
    companySignedIp: quote.companySignedIp,
    signedDocumentSnapshot: quote.signedDocumentSnapshot,
    signatureAuditTrail: quote.signatureAuditTrail,
    esigIncludePricing: quote.esigIncludePricing ?? true,
    esigIncludeImages: quote.esigIncludeImages ?? false,
    esigIncludeContract: quote.esigIncludeContract ?? true,
    esigIncludeApprovalDrawing: includeApprovalDrawing,
    approvalDrawing: includeApprovalDrawing
      ? sanitizeQuoteApprovalDrawingForPublic(quote.approvalDrawing)
      : null,
  };

  if (quote.signedDocumentSnapshot) {
    const snapshot = quote.signedDocumentSnapshot as Record<string, any>;
    const snapshotIncludesApprovalDrawing = signedSnapshotIncludesApprovalDrawing(snapshot);

    return {
      ...snapshot,
      approvalDrawing: snapshotIncludesApprovalDrawing ? snapshot.approvalDrawing : null,
      esigIncludeApprovalDrawing: snapshotIncludesApprovalDrawing,
      clientSignatureData: quote.clientSignatureData,
      clientSignedAt: quote.clientSignedAt,
      clientSignedIp: quote.clientSignedIp,
      companySignatureData: quote.companySignatureData,
      companySignedAt: quote.companySignedAt,
      companySignedIp: quote.companySignedIp,
      signatureAuditTrail: quote.signatureAuditTrail,
    };
  }

  return publicQuote;
}

export function isArchivedQuoteVersion(quote: { isLatestVersion?: boolean | null }): boolean {
  return quote.isLatestVersion === false;
}

export function sendArchivedQuoteResponse(res: any, action: string, status = 409) {
  return res.status(status).json({
    message: `This quote version is archived. Make it the current version before you ${action}.`,
    code: "QUOTE_VERSION_ARCHIVED",
  });
}

export function createDocumentFingerprint(snapshot: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

export function getClientIp(req: any): string {
  const forwardedFor = req.headers["x-forwarded-for"];
  return Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : String(forwardedFor || req.socket.remoteAddress || "unknown").split(",")[0].trim();
}
