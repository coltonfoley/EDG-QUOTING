import { storage } from "../storage";
import { buildOperationsPayload, isApprovalDrawingClearForOps, isPlanningAgreementClearForOps } from "./operationsPayload";

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

export { buildOperationsPayload };

export async function sendQuoteToOperations(
  quoteId: number,
  options: { dryRun?: boolean } = {},
): Promise<OperationsImportResult> {
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

  if (!isPlanningAgreementClearForOps(quote.planningAgreement)) {
    return {
      success: false,
      status: 400,
      message: "Confirm or waive the Design + Planning Agreement before sending this quote to Ops.",
      data: {
        planningAgreement: quote.planningAgreement,
      },
    };
  }

  if (quote.esigIncludeApprovalDrawing === true && !isApprovalDrawingClearForOps(quote.approvalDrawing)) {
    return {
      success: false,
      status: 400,
      message: "Confirm the signed order approval drawing is internally order-ready before sending this quote to Ops.",
      data: {
        approvalDrawing: quote.approvalDrawing,
      },
    };
  }

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
      body: JSON.stringify(await buildOperationsPayload(quote, Boolean(options.dryRun))),
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
