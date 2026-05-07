import { storage } from "../storage";

type OperationsImportData = {
  imported?: boolean;
  existing?: boolean;
  dryRun?: boolean;
  job?: {
    id?: string | number;
    title?: string | null;
    projectCode?: string | null;
    jobNumber?: string | null;
  } | null;
  oemImportPacket?: {
    importMode?: string;
    summary?: Record<string, unknown>;
  };
  preview?: {
    importMode?: string;
    importSummary?: Record<string, unknown>;
  };
  message?: string;
};

type OperationsImportResult = {
  success: boolean;
  skipped?: boolean;
  status?: number;
  message?: string;
  data?: OperationsImportData | unknown;
  opsJobUrl?: string | null;
};

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

const getOperationsImportUrl = (): string | null => {
  if (process.env.OPERATIONS_IMPORT_URL?.trim()) {
    return process.env.OPERATIONS_IMPORT_URL.trim();
  }

  if (!process.env.OPERATIONS_BASE_URL?.trim()) {
    return null;
  }

  return `${process.env.OPERATIONS_BASE_URL.trim().replace(/\/$/, "")}/api/integrations/quotes/import`;
};

const getOperationsBaseUrl = (): string | null => {
  if (process.env.OPERATIONS_BASE_URL?.trim()) {
    return process.env.OPERATIONS_BASE_URL.trim().replace(/\/$/, "");
  }

  const importUrl = getOperationsImportUrl();
  if (!importUrl) return null;

  try {
    const parsed = new URL(importUrl);
    return parsed.origin;
  } catch {
    return null;
  }
};

const getOperationsVercelBypassSecret = (): string | null => {
  const secret =
    process.env.OPERATIONS_VERCEL_BYPASS_SECRET ||
    process.env.OPERATIONS_VERCEL_PROTECTION_BYPASS;

  return secret?.trim() || null;
};

const buildOpsJobUrl = (data: OperationsImportData | unknown): string | null => {
  if (!data || typeof data !== "object") return null;

  const job = (data as OperationsImportData).job;
  const jobId = job?.id;
  if (!jobId) return null;

  const baseUrl = getOperationsBaseUrl();
  return baseUrl ? `${baseUrl}/jobs/${encodeURIComponent(String(jobId))}` : null;
};

export const buildOperationsPayload = (quote: any, dryRun = false) => {
  const totals = calculateQuoteTotals(quote);

  return {
    sourceSystem: "EDG-QUOTING",
    sentAt: new Date().toISOString(),
    dryRun,
    quote: {
      id: quote.id,
      quoteNumber: quote.quoteNumber,
      versionNumber: quote.versionNumber,
      parentQuoteId: quote.parentQuoteId,
      projectName: quote.projectName,
      jobsiteAddress: formatJobsiteAddress(quote),
      estimatedStartDate: quote.estimatedStartDate,
      notes: quote.notes,
      totals,
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

export async function sendQuoteToOperations(
  quoteId: number,
  options: { dryRun?: boolean } = {},
): Promise<OperationsImportResult> {
  const importUrl = getOperationsImportUrl();
  const token = process.env.OPERATIONS_IMPORT_TOKEN?.trim();

  if (!importUrl || !token) {
    return {
      success: false,
      skipped: true,
      status: 503,
      message: "Operations import is not configured. Set OPERATIONS_IMPORT_URL or OPERATIONS_BASE_URL, plus OPERATIONS_IMPORT_TOKEN.",
    };
  }

  const quote = await storage.getQuoteWithDetails(quoteId);
  if (!quote) {
    return { success: false, status: 404, message: `Quote ${quoteId} was not found.` };
  }

  if (!quote.lineItems?.length) {
    return {
      success: false,
      status: 400,
      message: "Add at least one quote line item before sending this quote to Ops.",
    };
  }

  const timeoutMs = Math.max(1000, parseInt(process.env.OPERATIONS_IMPORT_TIMEOUT_MS || "15000", 10));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      "X-Integration-Token": token,
    };
    const vercelBypassSecret = getOperationsVercelBypassSecret();
    if (vercelBypassSecret) {
      headers["x-vercel-protection-bypass"] = vercelBypassSecret;
    }

    const response = await fetch(importUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(buildOperationsPayload(quote, Boolean(options.dryRun))),
      signal: controller.signal,
    });

    const responseText = await response.text();
    let data: OperationsImportData | unknown = responseText;
    try {
      data = responseText ? JSON.parse(responseText) : null;
    } catch {
      // Keep plain text response for diagnostics.
    }

    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        message: `Operations import failed with status ${response.status}.`,
        data,
      };
    }

    return {
      success: true,
      status: response.status,
      data,
      opsJobUrl: buildOpsJobUrl(data),
    };
  } catch (error: any) {
    return {
      success: false,
      message: error?.name === "AbortError"
        ? `Operations import timed out after ${timeoutMs}ms.`
        : error?.message || "Operations import failed.",
    };
  } finally {
    clearTimeout(timeout);
  }
}
