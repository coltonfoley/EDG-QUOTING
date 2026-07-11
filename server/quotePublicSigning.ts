import crypto from "node:crypto";
import { sanitizeQuoteApprovalDrawingForPublic } from "@shared/approvalDrawing";

export const CUSTOMER_PACKAGE_VERSION = 1;

export type CustomerPackageIssue = {
  code: "NO_LINE_ITEMS" | "MISSING_CONTRACT_CONTENT" | "MISSING_VISUALS" | "INVALID_VISUAL_SOURCE";
  message: string;
};

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

function getDocumentRevision(quote: any): string | null {
  if (!quote?.updatedAt) return null;
  const revision = new Date(quote.updatedAt);
  return Number.isNaN(revision.getTime()) ? null : revision.toISOString();
}

function hasContractContent(quote: any): boolean {
  return Boolean(
    quote?.notes?.trim?.()
    || quote?.customContractTerms?.trim?.()
    || quote?.contractTemplate?.terms?.trim?.(),
  );
}

export function getCustomerPackageIssues(quote: any): CustomerPackageIssue[] {
  const issues: CustomerPackageIssue[] = [];
  const lineItems = Array.isArray(quote?.lineItems) ? quote.lineItems : [];
  const renderings = Array.isArray(quote?.productRenderings) ? quote.productRenderings : [];

  if (lineItems.length === 0) {
    issues.push({
      code: "NO_LINE_ITEMS",
      message: "This proposal has no line items. Add scope before preparing it for customer approval.",
    });
  }

  if (quote?.esigIncludeContract === true && !hasContractContent(quote)) {
    issues.push({
      code: "MISSING_CONTRACT_CONTENT",
      message: "Contract notes and terms are included, but no customer-facing contract content is available.",
    });
  }

  if (quote?.esigIncludeImages === true && renderings.length === 0) {
    issues.push({
      code: "MISSING_VISUALS",
      message: "Visuals are included, but no proposal visuals are attached.",
    });
  }

  if (
    quote?.esigIncludeImages === true
    && renderings.some((rendering: any) => typeof rendering?.storageUrl !== "string" || rendering.storageUrl.trim().length === 0)
  ) {
    issues.push({
      code: "INVALID_VISUAL_SOURCE",
      message: "At least one included visual has no usable file source.",
    });
  }

  return issues;
}

function sanitizeContractTemplate(template: any) {
  if (!template) return undefined;
  return {
    id: template.id,
    name: template.name,
    title: template.title,
    terms: template.terms,
  };
}

function sanitizePublicGroups(groups: any[]) {
  return [...groups]
    .sort((left, right) => Number(left.position || 0) - Number(right.position || 0))
    .map((group: any) => ({
      id: group.id,
      title: group.title,
      position: group.position,
    }));
}

function sanitizePublicVisuals(renderings: any[]) {
  return [...renderings]
    .sort((left, right) => Number(left.displayOrder || 0) - Number(right.displayOrder || 0))
    .map((rendering: any) => ({
      id: rendering.id,
      storageUrl: rendering.storageUrl,
      filename: rendering.filename,
      originalName: rendering.originalName,
      mimeType: rendering.mimeType,
      displayOrder: rendering.displayOrder,
    }));
}

function sanitizePublicCoverPhoto(photo: any) {
  if (!photo) return undefined;
  return {
    id: photo.id,
    storageUrl: photo.storageUrl,
    filename: photo.filename,
    originalName: photo.originalName,
    mimeType: photo.mimeType,
  };
}

function createCustomerPackageFingerprint(packageData: Record<string, any>): string {
  const {
    customerPackageFingerprint: _customerPackageFingerprint,
    documentRevision: _documentRevision,
    packageIssues: _packageIssues,
    clientSignatureData: _clientSignatureData,
    clientSignedAt: _clientSignedAt,
    clientSignedIp: _clientSignedIp,
    companySignatureData: _companySignatureData,
    companySignedAt: _companySignedAt,
    companySignedIp: _companySignedIp,
    signedDocumentSnapshot: _signedDocumentSnapshot,
    signatureAuditTrail: _signatureAuditTrail,
    ...reviewedPackage
  } = packageData;
  return createDocumentFingerprint(reviewedPackage);
}

export function buildPublicSigningQuote(quote: any) {
  const includeApprovalDrawing = shouldIncludeApprovalDrawingInPackage(quote);
  const includeImages = quote.esigIncludeImages ?? false;
  const quoteGroups = Array.isArray(quote.groups) ? quote.groups : [];
  const productRenderings = Array.isArray(quote.productRenderings) ? quote.productRenderings : [];
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
      unit: item.unit,
    };
  });

  const publicQuote = {
    customerPackageVersion: CUSTOMER_PACKAGE_VERSION,
    documentRevision: getDocumentRevision(quote),
    packageIssues: getCustomerPackageIssues(quote),
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
    groups: sanitizePublicGroups(quoteGroups),
    productRenderings: includeImages ? sanitizePublicVisuals(productRenderings) : [],
    coverPhoto: includeImages ? sanitizePublicCoverPhoto(quote.coverPhoto) : undefined,
    taxRate: quote.taxRate,
    discount: quote.discount,
    shipping: quote.shipping,
    isShippingTaxable: quote.isShippingTaxable,
    contractTemplate: quote.esigIncludeContract ? sanitizeContractTemplate(quote.contractTemplate) : undefined,
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
    esigIncludeImages: includeImages,
    esigIncludeContract: quote.esigIncludeContract ?? true,
    esigIncludeApprovalDrawing: includeApprovalDrawing,
    approvalDrawing: includeApprovalDrawing
      ? sanitizeQuoteApprovalDrawingForPublic(quote.approvalDrawing)
      : null,
  };
  const packageWithFingerprint = {
    ...publicQuote,
    customerPackageFingerprint: createCustomerPackageFingerprint(publicQuote),
  };

  if (quote.signedDocumentSnapshot) {
    const snapshot = quote.signedDocumentSnapshot as Record<string, any>;
    const snapshotIncludesApprovalDrawing = signedSnapshotIncludesApprovalDrawing(snapshot);

    return {
      ...snapshot,
      customerPackageVersion: snapshot.customerPackageVersion ?? 0,
      customerPackageFingerprint: snapshot.customerPackageFingerprint ?? null,
      packageIssues: Array.isArray(snapshot.packageIssues) ? snapshot.packageIssues : [],
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

  return packageWithFingerprint;
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
