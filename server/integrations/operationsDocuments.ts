import { createHash } from "crypto";
import { jsPDF } from "jspdf";

type HandoffDocumentKind = "contract" | "bill_of_materials";

type HandoffDocument = {
  kind: HandoffDocumentKind;
  type: "Contract" | "Bill of Materials";
  fileName: string;
  contentType: "application/pdf";
  contentBase64: string;
  contentSha256: string;
  sourceDocumentKey: string;
  sourceQuoteId: string;
  sourceQuoteNumber: string | null;
  visibility: "internal";
  metadata: Record<string, unknown>;
};

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const parseDecimal = (value: unknown, fallback = 0): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "string") {
    const parsed = parseFloat(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
};

const sanitizeFilenamePart = (value: unknown, fallback: string): string => {
  const text = String(value || fallback).trim() || fallback;
  return text.replace(/[/\\]/g, "_").replace(/[^a-zA-Z0-9._ -]/g, "_").replace(/\s+/g, "_").slice(0, 80);
};

const getQuoteNumber = (quote: any): string | null =>
  quote.quoteNumber ? String(quote.quoteNumber) : null;

const getCustomerName = (quote: any): string =>
  quote.account?.company ||
  quote.account?.name ||
  quote.customer?.company ||
  quote.customer?.name ||
  "Customer";

const getJobsiteAddress = (quote: any): string | null => {
  if (quote.jobsiteAddress) return quote.jobsiteAddress;
  const street = [quote.jobsiteStreetAddress, quote.jobsiteAddressLine2].filter(Boolean).join(", ");
  const cityLine = [quote.jobsiteCity, quote.jobsiteState, quote.jobsiteZipCode].filter(Boolean).join(", ");
  return [street, cityLine].filter(Boolean).join(", ") || null;
};

const getLineTotal = (item: any, quote: any): number => {
  const quantity = Math.max(0, parseDecimal(item.quantity, 0));
  const unitPrice = Math.max(0, parseDecimal(item.unitPrice, 0));
  const markupValue = Math.max(0, parseDecimal(item.markupValue, 0));
  const discountValue = Math.max(0, parseDecimal(item.discountValue, 0));
  const tariffRate = Math.max(0, parseDecimal(quote.tariffRate, 0));
  const baseTotal = quantity * unitPrice;
  const discounted = item.discountType === "fixed"
    ? Math.max(0, baseTotal - discountValue)
    : baseTotal - (baseTotal * Math.min(discountValue, 100) / 100);
  const tariffed = item.isTariffApplicable
    ? discounted + (discounted * Math.min(tariffRate, 100) / 100)
    : discounted;
  const total = item.markupType === "fixed"
    ? tariffed + markupValue
    : tariffed + (tariffed * markupValue / 100);
  return Math.round(Math.max(0, total) * 100) / 100;
};

const addWrappedText = (pdf: jsPDF, text: string, x: number, y: number, width: number): number => {
  const lines = pdf.splitTextToSize(text, width);
  pdf.text(lines, x, y);
  return y + lines.length * 5;
};

const ensureSpace = (pdf: jsPDF, y: number, needed = 18): number => {
  if (y + needed < 265) return y;
  pdf.addPage();
  return 20;
};

const addFooter = (pdf: jsPDF) => {
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    pdf.setFontSize(8);
    pdf.setTextColor(120);
    pdf.text(`EDG Patio & Shade | Page ${page} of ${pages}`, 105, 275, { align: "center" });
  }
};

const toPdfBase64 = (pdf: jsPDF) => {
  addFooter(pdf);
  const buffer = Buffer.from(pdf.output("arraybuffer"));
  return {
    base64: buffer.toString("base64"),
    sha256: createHash("sha256").update(buffer).digest("hex"),
  };
};

const createPdf = (title: string): jsPDF => {
  const pdf = new jsPDF({ unit: "mm", format: "letter" });
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.text(title, 20, 20);
  pdf.setDrawColor(40);
  pdf.line(20, 25, 195, 25);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(30);
  return pdf;
};

function buildContractPdf(quote: any, totals: any) {
  const pdf = createPdf("Contract");
  let y = 35;
  const quoteNumber = getQuoteNumber(quote);
  const rows = [
    ["Project", quote.projectName || "Project"],
    ["Quote", quoteNumber || String(quote.id)],
    ["Customer", getCustomerName(quote)],
    ["Jobsite", getJobsiteAddress(quote) || "Not provided"],
    ["Generated", new Date().toLocaleDateString("en-US")],
    ["Contract Value", currency.format(parseDecimal(totals?.total, 0))],
  ];

  for (const [label, value] of rows) {
    pdf.setFont("helvetica", "bold");
    pdf.text(`${label}:`, 20, y);
    pdf.setFont("helvetica", "normal");
    y = addWrappedText(pdf, String(value), 55, y, 135) + 2;
  }

  const contractText = [quote.notes, quote.customContractTerms || quote.contractTemplate?.terms]
    .filter((part) => typeof part === "string" && part.trim())
    .join("\n\n");

  if (contractText) {
    y = ensureSpace(pdf, y, 30);
    pdf.setFont("helvetica", "bold");
    pdf.text("Contract Notes", 20, y);
    y += 7;
    pdf.setFont("helvetica", "normal");
    y = addWrappedText(pdf, contractText, 20, y, 175) + 4;
  }

  y = ensureSpace(pdf, y, 24);
  pdf.setFont("helvetica", "bold");
  pdf.text("Sold Scope", 20, y);
  y += 7;
  pdf.setFont("helvetica", "normal");
  for (const item of quote.lineItems || []) {
    y = ensureSpace(pdf, y, 14);
    const line = `${parseDecimal(item.quantity, 1)} x ${item.description}${item.sku ? ` (${item.sku})` : ""} - ${currency.format(getLineTotal(item, quote))}`;
    y = addWrappedText(pdf, line, 20, y, 175) + 2;
  }

  return toPdfBase64(pdf);
}

function buildBomPdf(quote: any) {
  const pdf = createPdf("Bill of Materials");
  let y = 35;
  pdf.text(`Project: ${quote.projectName || "Project"}`, 20, y);
  y += 6;
  pdf.text(`Quote: ${getQuoteNumber(quote) || String(quote.id)}`, 20, y);
  y += 10;

  for (const item of quote.lineItems || []) {
    y = ensureSpace(pdf, y, 18);
    const parts = [
      item.sku ? `SKU: ${item.sku}` : null,
      item.manufacturer ? `Manufacturer: ${item.manufacturer}` : null,
      `Qty: ${parseDecimal(item.quantity, 1)}`,
      `Unit: ${item.unit || "ea"}`,
    ].filter(Boolean);
    y = addWrappedText(pdf, item.description || "Line item", 20, y, 175);
    pdf.setTextColor(90);
    y = addWrappedText(pdf, parts.join(" | "), 24, y, 170) + 3;
    pdf.setTextColor(30);
  }

  return toPdfBase64(pdf);
}

const createSourceDocumentKey = (
  quote: any,
  kind: HandoffDocumentKind,
  contentSha256: string,
): string => `EDG-QUOTING:quote:${quote.id}:${kind}:${contentSha256.slice(0, 20)}`;

export function buildOperationsDocuments(quote: any, totals: any): HandoffDocument[] {
  const quoteNumber = getQuoteNumber(quote);
  const quoteId = String(quote.id);
  const filenameQuotePart = sanitizeFilenamePart(quoteNumber || quoteId, "Quote");

  const contract = buildContractPdf(quote, totals);
  const bom = buildBomPdf(quote);

  return [
    {
      kind: "contract",
      type: "Contract",
      fileName: `Quote-${filenameQuotePart}-Contract.pdf`,
      contentType: "application/pdf",
      contentBase64: contract.base64,
      contentSha256: contract.sha256,
      sourceDocumentKey: createSourceDocumentKey(quote, "contract", contract.sha256),
      sourceQuoteId: quoteId,
      sourceQuoteNumber: quoteNumber,
      visibility: "internal",
      metadata: {
        generatedFrom: "rainmaker_quote",
        quoteVersion: quote.versionNumber ?? null,
        customerSignedAt: quote.clientSignedAt ?? null,
        companySignedAt: quote.companySignedAt ?? null,
        documentFingerprint: quote.signatureAuditTrail?.documentFingerprint ?? null,
      },
    },
    {
      kind: "bill_of_materials",
      type: "Bill of Materials",
      fileName: `Quote-${filenameQuotePart}-BOM.pdf`,
      contentType: "application/pdf",
      contentBase64: bom.base64,
      contentSha256: bom.sha256,
      sourceDocumentKey: createSourceDocumentKey(quote, "bill_of_materials", bom.sha256),
      sourceQuoteId: quoteId,
      sourceQuoteNumber: quoteNumber,
      visibility: "internal",
      metadata: {
        generatedFrom: "rainmaker_quote",
        quoteVersion: quote.versionNumber ?? null,
        lineItemCount: quote.lineItems?.length ?? 0,
      },
    },
  ];
}
