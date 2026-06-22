import { createHash } from "crypto";
import { jsPDF } from "jspdf";
import {
  formatApprovalDrawingLightLabel,
  formatApprovalDrawingSideFeatureType,
  formatDimension,
  getApprovalDrawingSideFeatures,
  normalizeApprovalDrawingData,
  sanitizeQuoteApprovalDrawingForPublic,
} from "@shared/approvalDrawing";

type HandoffDocumentKind = "contract" | "bill_of_materials";

export type HandoffDocument = {
  kind: HandoffDocumentKind;
  type: "Proposal PDF" | "Bill of Materials";
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

type QuoteTotals = {
  subtotal?: number;
  discountAmount?: number;
  shippingAmount?: number;
  taxAmount?: number;
  total?: number;
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

const roundCurrency = (value: number): number => Math.round(value * 100) / 100;

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
  return roundCurrency(Math.max(0, total));
};

const addWrappedText = (pdf: jsPDF, text: string, x: number, y: number, width: number): number => {
  const lines = pdf.splitTextToSize(text || "", width);
  pdf.text(lines, x, y);
  return y + lines.length * 5;
};

const ensureSpace = (pdf: jsPDF, y: number, needed = 18): number => {
  if (y + needed < 265) return y;
  pdf.addPage();
  return 20;
};

const addLabeledRow = (pdf: jsPDF, label: string, value: string, y: number): number => {
  pdf.setFont("helvetica", "bold");
  pdf.text(`${label}:`, 20, y);
  pdf.setFont("helvetica", "normal");
  return addWrappedText(pdf, value, 58, y, 132) + 2;
};

const getApprovalDrawingLines = (quote: any): string[] => {
  const publicDrawing = sanitizeQuoteApprovalDrawingForPublic(quote.approvalDrawing) as any;
  if (!publicDrawing) return [];

  const data = normalizeApprovalDrawingData(publicDrawing.drawingData);
  const sideLines = data.sides.map((side) => {
    const features = getApprovalDrawingSideFeatures(side);
    const enclosure = features.length
      ? features.map((feature) => formatApprovalDrawingSideFeatureType(feature.type)).join(" + ")
      : "none";
    const span = formatDimension(side.enclosureSpan || side.length);
    const height = formatDimension(side.enclosureHeight || side.openingHeight);
    return `Side ${side.side}: ${enclosure}${span ? `, span ${span}` : ""}${height ? `, height/opening ${height}` : ""}`;
  });

  return [
    `${publicDrawing.title || "Order Approval Drawing"}${publicDrawing.revisionLabel ? ` (${publicDrawing.revisionLabel})` : ""}`,
    `Status: ${publicDrawing.status || "draft"} | Internal order status: ${quote.approvalDrawing?.orderStatus || "not_reviewed"}`,
    `Manufacturer/System: ${[publicDrawing.manufacturer, publicDrawing.productSystem].filter(Boolean).join(" / ") || "Not specified"}`,
    `Dimensions: ${formatDimension(data.layout.overallLength) || "not set"} length x ${formatDimension(data.layout.overallProjection) || "not set"} projection/depth`,
    `Mount/Reference: ${data.layout.mountType}; ${data.orientation.referenceSide} = ${data.orientation.referenceSideLabel || "reference side"}`,
    `Height: ${formatDimension(data.layout.finishedHeight) || formatDimension(data.layout.clearanceHeight) || "see post labels"}`,
    `Colors: frame ${data.colors.frameColor || "not set"}; louvers ${data.colors.louverColor || "not set"}${data.colors.postTrimGutterColor ? `; post/trim/gutter ${data.colors.postTrimGutterColor}` : ""}`,
    ...sideLines,
    data.lights.length ? `Lights/accessories: ${data.lights.map(formatApprovalDrawingLightLabel).join("; ")}` : "Lights/accessories: none listed",
    publicDrawing.customerNotes ? `Customer notes: ${publicDrawing.customerNotes}` : "Customer notes: none",
    publicDrawing.disclaimer || "",
  ].filter(Boolean);
};

const addApprovalDrawingSection = (pdf: jsPDF, quote: any, y: number): number => {
  const lines = getApprovalDrawingLines(quote);
  if (!lines.length) return y;

  y = ensureSpace(pdf, y, 38);
  pdf.setFont("helvetica", "bold");
  pdf.text("Order Approval Drawing", 20, y);
  y += 7;
  pdf.setFont("helvetica", "normal");
  for (const line of lines) {
    y = ensureSpace(pdf, y, 12);
    y = addWrappedText(pdf, line, 20, y, 175) + 2;
  }
  return y + 2;
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

const toPdfPayload = (pdf: jsPDF) => {
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
  pdf.setTextColor(30);
  pdf.text(title, 20, 20);
  pdf.setDrawColor(66, 180, 145);
  pdf.setLineWidth(0.8);
  pdf.line(20, 25, 195, 25);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(30);
  return pdf;
};

const buildProposalPdf = (quote: any, totals?: QuoteTotals) => {
  const pdf = createPdf("Proposal PDF");
  let y = 35;
  const quoteNumber = getQuoteNumber(quote);
  const rows = [
    ["Project", quote.projectName || "Project"],
    ["Quote", quoteNumber || String(quote.id)],
    ["Customer", getCustomerName(quote)],
    ["Jobsite", getJobsiteAddress(quote) || "Not provided"],
    ["Generated", new Date().toLocaleDateString("en-US")],
    ["Proposal Total", currency.format(parseDecimal(totals?.total, 0))],
  ];

  for (const [label, value] of rows) {
    y = addLabeledRow(pdf, label, String(value), y);
  }

  y = addApprovalDrawingSection(pdf, quote, y + 4);

  const contractText = [quote.notes, quote.customContractTerms || quote.contractTemplate?.terms]
    .filter((part) => typeof part === "string" && part.trim())
    .join("\n\n");

  if (contractText) {
    y = ensureSpace(pdf, y, 30);
    pdf.setFont("helvetica", "bold");
    pdf.text("Proposal Notes", 20, y);
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
    const line = `${parseDecimal(item.quantity, 1)} x ${item.description || "Line item"}${item.sku ? ` (${item.sku})` : ""} - ${currency.format(getLineTotal(item, quote))}`;
    y = addWrappedText(pdf, line, 20, y, 175) + 2;
  }

  if (totals) {
    y = ensureSpace(pdf, y, 34);
    pdf.setFont("helvetica", "bold");
    pdf.text("Totals", 20, y);
    y += 7;
    pdf.setFont("helvetica", "normal");
    const totalRows = [
      ["Subtotal", totals.subtotal],
      ["Discount", totals.discountAmount ? -totals.discountAmount : 0],
      ["Shipping", totals.shippingAmount],
      ["Tax", totals.taxAmount],
      ["Total", totals.total],
    ];
    for (const [label, value] of totalRows) {
      if (value === undefined || value === null) continue;
      y = addLabeledRow(pdf, String(label), currency.format(parseDecimal(value, 0)), y);
    }
  }

  return toPdfPayload(pdf);
};

const buildBomPdf = (quote: any) => {
  const pdf = createPdf("Bill of Materials");
  let y = 35;
  y = addLabeledRow(pdf, "Project", quote.projectName || "Project", y);
  y = addLabeledRow(pdf, "Quote", getQuoteNumber(quote) || String(quote.id), y + 4);

  y = addApprovalDrawingSection(pdf, quote, y + 4);

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

  return toPdfPayload(pdf);
};

const createSourceDocumentKey = (
  quote: any,
  kind: HandoffDocumentKind,
): string => kind === "contract"
  ? `EDG-QUOTING:quote:${quote.id}:rainmaker_proposal_pdf`
  : `EDG-QUOTING:quote:${quote.id}:rainmaker_bom_pdf`;

export async function buildOperationsDocuments(quote: any, totals?: QuoteTotals): Promise<HandoffDocument[]> {
  const quoteNumber = getQuoteNumber(quote);
  const quoteId = String(quote.id);
  const filenameQuotePart = sanitizeFilenamePart(quoteNumber || quoteId, "Quote");

  const proposal = buildProposalPdf(quote, totals);
  const bom = buildBomPdf(quote);

  return [
    {
      kind: "contract",
      type: "Proposal PDF",
      fileName: `Quote-${filenameQuotePart}-Proposal.pdf`,
      contentType: "application/pdf",
      contentBase64: proposal.base64,
      contentSha256: proposal.sha256,
      sourceDocumentKey: createSourceDocumentKey(quote, "contract"),
      sourceQuoteId: quoteId,
      sourceQuoteNumber: quoteNumber,
      visibility: "internal",
      metadata: {
        generatedFrom: "rainmaker_server_safe_proposal_pdf",
        quoteVersion: quote.versionNumber ?? null,
        customerSignedAt: quote.clientSignedAt ?? null,
        companySignedAt: quote.companySignedAt ?? null,
        documentFingerprint: quote.signatureAuditTrail?.documentFingerprint ?? null,
        temporaryRenderer: true,
      },
    },
    {
      kind: "bill_of_materials",
      type: "Bill of Materials",
      fileName: `Quote-${filenameQuotePart}-BOM.pdf`,
      contentType: "application/pdf",
      contentBase64: bom.base64,
      contentSha256: bom.sha256,
      sourceDocumentKey: createSourceDocumentKey(quote, "bill_of_materials"),
      sourceQuoteId: quoteId,
      sourceQuoteNumber: quoteNumber,
      visibility: "internal",
      metadata: {
        generatedFrom: "rainmaker_server_safe_bom_pdf",
        quoteVersion: quote.versionNumber ?? null,
        lineItemCount: quote.lineItems?.length ?? 0,
        temporaryRenderer: true,
      },
    },
  ];
}
