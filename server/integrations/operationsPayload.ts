import {
  getApprovalDrawingReadiness,
  sanitizeQuoteApprovalDrawingForPublic,
} from "@shared/approvalDrawing";

const parseDecimal = (value: unknown, fallback = 0): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "string") {
    const parsed = parseFloat(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
};

const roundCurrency = (value: number): number => Math.round(value * 100) / 100;

const calculateLineItemTotal = (item: any, tariffRate: unknown): number => {
  const quantity = Math.max(0, parseDecimal(item.quantity, 0));
  const unitPrice = Math.max(0, parseDecimal(item.unitPrice, 0));
  const markupValue = Math.max(0, parseDecimal(item.markupValue, 0));
  const discountValue = Math.max(0, parseDecimal(item.discountValue, 0));
  const tariff = Math.max(0, parseDecimal(tariffRate, 0));
  const discountType = item.discountType || "percentage";
  const markupType = item.markupType || "percentage";

  const baseTotal = quantity * unitPrice;
  const afterDiscount = discountType === "percentage"
    ? baseTotal - (baseTotal * Math.min(discountValue, 100) / 100)
    : Math.max(0, baseTotal - discountValue);

  const afterTariff = item.isTariffApplicable
    ? afterDiscount + (afterDiscount * Math.min(tariff, 100) / 100)
    : afterDiscount;

  const finalTotal = markupType === "percentage"
    ? afterTariff + (afterTariff * markupValue / 100)
    : afterTariff + markupValue;

  return roundCurrency(Math.max(0, finalTotal));
};

const calculateQuoteTotals = (quote: any) => {
  const taxRate = Math.max(0, parseDecimal(quote.taxRate, 0));
  const quoteDiscount = Math.max(0, parseDecimal(quote.discount, 0));
  const shipping = Math.max(0, parseDecimal(quote.shipping, 0));
  const lineItems = quote.lineItems || [];

  let subtotal = 0;
  let taxableSubtotal = 0;

  for (const item of lineItems) {
    const lineTotal = calculateLineItemTotal(item, quote.tariffRate);
    subtotal += lineTotal;
    if (item.isTaxable !== false) {
      taxableSubtotal += lineTotal;
    }
  }

  const discountAmount = subtotal * Math.min(quoteDiscount, 100) / 100;
  const taxableDiscountRatio = subtotal > 0 ? taxableSubtotal / subtotal : 0;
  const taxableAfterDiscount = Math.max(0, taxableSubtotal - (discountAmount * taxableDiscountRatio));
  const taxableShipping = quote.isShippingTaxable ? shipping : 0;
  const taxAmount = (taxableAfterDiscount + taxableShipping) * Math.min(taxRate, 100) / 100;
  const total = Math.max(0, subtotal - discountAmount + shipping + taxAmount);

  return {
    subtotal: roundCurrency(subtotal),
    discountAmount: roundCurrency(discountAmount),
    shippingAmount: roundCurrency(shipping),
    taxAmount: roundCurrency(taxAmount),
    total: roundCurrency(total),
  };
};

const formatJobsiteAddress = (quote: any): string | null => {
  if (quote.jobsiteAddress) return quote.jobsiteAddress;

  const parts: string[] = [];
  if (quote.jobsiteStreetAddress) parts.push(quote.jobsiteStreetAddress);
  if (quote.jobsiteAddressLine2) parts.push(quote.jobsiteAddressLine2);

  const cityStateZip = [
    quote.jobsiteCity,
    quote.jobsiteState,
    quote.jobsiteZipCode,
  ].filter(Boolean).join(", ");
  if (cityStateZip) parts.push(cityStateZip);
  if (quote.jobsiteCountry && quote.jobsiteCountry !== "United States") parts.push(quote.jobsiteCountry);

  return parts.length > 0 ? parts.join(", ") : null;
};

const normalizeConfigData = (value: unknown): unknown => {
  if (typeof value !== "string") return value;

  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
};

export const isPlanningAgreementClearForOps = (planningAgreement: any): boolean => {
  if (!planningAgreement) return true;
  return ["paid_active", "delivered", "credited", "waived"].includes(planningAgreement.status);
};

export const isApprovalDrawingClearForOps = (approvalDrawing: any): boolean => {
  if (!approvalDrawing) return true;
  if (approvalDrawing.status !== "signed_locked") return false;
  if (!approvalDrawing.signedLockedAt) return false;
  if (!approvalDrawing.publicSnapshot || typeof approvalDrawing.publicSnapshot !== "object") return false;
  if (approvalDrawing.orderStatus !== "order_ready" && approvalDrawing.orderStatus !== "override_released") return false;
  const publicDrawing = sanitizeQuoteApprovalDrawingForPublic(approvalDrawing) as any;
  return getApprovalDrawingReadiness(publicDrawing?.drawingData ?? approvalDrawing.drawingData).ready;
};

const buildApprovalDrawingSummary = (approvalDrawing: any, signatureAuditTrail: any) => {
  if (!approvalDrawing) return null;
  const publicDrawing = sanitizeQuoteApprovalDrawingForPublic(approvalDrawing) as any;
  const readiness = getApprovalDrawingReadiness(approvalDrawing.drawingData);

  return {
    id: approvalDrawing.id,
    quoteId: approvalDrawing.quoteId,
    status: approvalDrawing.status,
    orderStatus: approvalDrawing.orderStatus,
    orderReadyOverrideReason: approvalDrawing.orderReadyOverrideReason ?? null,
    signedLockedAt: approvalDrawing.signedLockedAt ?? null,
    orderReviewedAt: approvalDrawing.orderReviewedAt ?? null,
    orderReadyAt: approvalDrawing.orderReadyAt ?? null,
    documentFingerprint: signatureAuditTrail?.documentFingerprint ?? null,
    manufacturer: approvalDrawing.manufacturer ?? null,
    productSystem: approvalDrawing.productSystem ?? null,
    title: publicDrawing?.title ?? "Order Approval Drawing",
    revisionLabel: approvalDrawing.revisionLabel ?? null,
    drawingData: publicDrawing?.drawingData ?? approvalDrawing.drawingData,
    customerNotes: approvalDrawing.customerNotes ?? null,
    disclaimer: publicDrawing?.disclaimer ?? null,
    readiness,
  };
};

type BuildOperationsPayloadOptions = {
  buildDocuments?: (quote: any, totals: ReturnType<typeof calculateQuoteTotals>) => Promise<any[]> | any[];
};

const buildDefaultOperationsDocuments = async (
  quote: any,
  totals: ReturnType<typeof calculateQuoteTotals>,
): Promise<any[]> => {
  const { buildOperationsDocuments } = await import("./operationsDocuments");
  return buildOperationsDocuments(quote, totals);
};

export const buildOperationsPayload = async (
  quote: any,
  dryRun = false,
  options: BuildOperationsPayloadOptions = {},
) => {
  const totals = calculateQuoteTotals(quote);
  const buildDocuments = options.buildDocuments || buildDefaultOperationsDocuments;
  const handoffDocuments = await buildDocuments(quote, totals);
  const planningAgreement = quote.planningAgreement
    ? {
        id: quote.planningAgreement.id,
        status: quote.planningAgreement.status,
        tier: quote.planningAgreement.tier,
        amount: quote.planningAgreement.amount,
        creditEligible: quote.planningAgreement.creditEligible,
        creditExpiresAt: quote.planningAgreement.creditExpiresAt,
        creditedQuoteId: quote.planningAgreement.creditedQuoteId,
        creditedAt: quote.planningAgreement.creditedAt,
        appliedCreditAmount: quote.planningAgreement.appliedCreditAmount,
      }
    : null;
  const approvalDrawing = quote.esigIncludeApprovalDrawing === true
    ? buildApprovalDrawingSummary(quote.approvalDrawing, quote.signatureAuditTrail)
    : null;

  return {
    sourceSystem: "EDG-QUOTING",
    sentAt: new Date().toISOString(),
    dryRun,
    handoffDocuments,
    quote: {
      id: quote.id,
      quoteNumber: quote.quoteNumber,
      versionNumber: quote.versionNumber,
      parentQuoteId: quote.parentQuoteId,
      projectName: quote.projectName,
      jobsiteAddress: formatJobsiteAddress(quote),
      estimatedStartDate: quote.estimatedStartDate,
      notes: quote.notes,
      contractNotes: quote.notes,
      internalNotes: quote.internalNotes,
      totals,
      planningAgreement,
      approvalDrawing,
      account: quote.account || quote.customer || null,
      lineItems: (quote.lineItems || []).map((item: any) => ({
        id: item.id,
        sourceLineItemId: item.id,
        productId: item.productId,
        sku: item.sku,
        description: item.description,
        quantity: parseDecimal(item.quantity, 1),
        unit: item.unit,
        unitPrice: parseDecimal(item.unitPrice, 0),
        retailPrice: parseDecimal(item.retailPrice, 0),
        markupType: item.markupType,
        markupValue: parseDecimal(item.markupValue, 0),
        discountType: item.discountType,
        discountValue: parseDecimal(item.discountValue, 0),
        isTaxable: item.isTaxable,
        isTariffApplicable: item.isTariffApplicable,
        manufacturer: item.manufacturer,
        configData: normalizeConfigData(item.configData),
        total: calculateLineItemTotal(item, quote.tariffRate),
      })),
    },
  };
};
