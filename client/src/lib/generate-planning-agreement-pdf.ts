import jsPDF from "jspdf";
import { barlowRegularBase64, barlowSemiBoldBase64 } from "./fonts";

export interface PlanningAgreementPublicData {
  id: number;
  agreementNumber: string;
  status: string;
  tierLabel?: string | null;
  amount: string | number;
  creditEligible: boolean;
  creditExpiresAt?: string | null;
  scopeSummary?: string | null;
  accountName: string;
  account?: {
    name?: string | null;
    company?: string | null;
    email?: string | null;
    phone?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  } | null;
  quote?: {
    id?: number;
    quoteNumber?: string | null;
    projectName?: string | null;
    jobsiteAddress?: string | null;
  } | null;
  projectName?: string | null;
  quoteNumber?: string | null;
  jobsiteAddress?: string | null;
  company?: {
    name: string;
    address: string;
    phone: string;
    email: string;
  };
  terms: string[];
  agreementSentAt?: string | null;
  agreementSignedAt?: string | null;
  paymentConfirmedAt?: string | null;
  customerSignatureData?: {
    type: "draw" | "type";
    imageData: string;
    name: string;
  } | null;
  customerSignedAt?: string | null;
  customerSignedIp?: string | null;
  signatureAuditTrail?: {
    documentFingerprint?: string;
    entries?: Array<{
      signerName?: string;
      signedAt?: string;
      documentFingerprint?: string;
    }>;
  } | null;
}

const DEFAULT_COMPANY = {
  name: "EDG Patio & Shade",
  address: "1802 Holian Drive, Spring Grove, IL 60081",
  phone: "+1 (815) 581-0138",
  email: "info@edgpatioshade.com",
};

function formatMoney(value: string | number): string {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed)
    ? parsed.toLocaleString("en-US", { style: "currency", currency: "USD" })
    : "$0.00";
}

function formatDate(value?: string | null): string {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : date.toLocaleString();
}

function cleanFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_").slice(0, 80);
}

function addWrappedText(pdf: jsPDF, text: string, x: number, y: number, maxWidth: number, lineHeight = 5): number {
  const lines = pdf.splitTextToSize(text, maxWidth);
  pdf.text(lines, x, y);
  return y + lines.length * lineHeight;
}

function ensureSpace(pdf: jsPDF, y: number, required: number): number {
  const pageHeight = pdf.internal.pageSize.getHeight();
  if (y + required <= pageHeight - 18) return y;
  pdf.addPage();
  return 18;
}

function sectionTitle(pdf: jsPDF, title: string, x: number, y: number): number {
  y = ensureSpace(pdf, y, 14);
  pdf.setFont("Barlow-SemiBold", "normal");
  pdf.setFontSize(12);
  pdf.setTextColor(20, 184, 166);
  pdf.text(title.toUpperCase(), x, y);
  pdf.setDrawColor(20, 184, 166);
  pdf.line(x, y + 2, 196, y + 2);
  pdf.setTextColor(24, 24, 27);
  return y + 9;
}

function addKeyValue(pdf: jsPDF, label: string, value: string, x: number, y: number, width = 86): number {
  pdf.setFont("Barlow-SemiBold", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(113, 113, 122);
  pdf.text(label.toUpperCase(), x, y);
  pdf.setFont("Barlow-Regular", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(24, 24, 27);
  return addWrappedText(pdf, value || "N/A", x, y + 5, width, 5) + 2;
}

function addFooter(pdf: jsPDF, companyName: string) {
  const pageCount = pdf.getNumberOfPages();
  const width = pdf.internal.pageSize.getWidth();
  const height = pdf.internal.pageSize.getHeight();

  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page);
    pdf.setDrawColor(229, 231, 235);
    pdf.line(14, height - 14, width - 14, height - 14);
    pdf.setFont("Barlow-Regular", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(113, 113, 122);
    pdf.text(companyName, 14, height - 8);
    pdf.text(`Page ${page} of ${pageCount}`, width - 14, height - 8, { align: "right" });
  }
}

export async function generatePlanningAgreementPDF(agreement: PlanningAgreementPublicData): Promise<Blob> {
  const company = agreement.company || DEFAULT_COMPANY;
  const pdf = new jsPDF({ unit: "mm", format: "letter", compress: true });

  pdf.addFileToVFS("Barlow-Regular.ttf", barlowRegularBase64);
  pdf.addFont("Barlow-Regular.ttf", "Barlow-Regular", "normal");
  pdf.addFileToVFS("Barlow-SemiBold.ttf", barlowSemiBoldBase64);
  pdf.addFont("Barlow-SemiBold.ttf", "Barlow-SemiBold", "normal");

  const margin = 14;
  let y = 16;

  pdf.setFillColor(0, 0, 0);
  pdf.rect(0, 0, 216, 34, "F");
  pdf.setFillColor(20, 184, 166);
  pdf.rect(0, 34, 216, 2.5, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("Barlow-SemiBold", "normal");
  pdf.setFontSize(18);
  pdf.text(company.name, margin, y);
  pdf.setFont("Barlow-Regular", "normal");
  pdf.setFontSize(9);
  pdf.text(`${company.address} | ${company.phone} | ${company.email}`, margin, y + 7);
  pdf.setFont("Barlow-SemiBold", "normal");
  pdf.setFontSize(11);
  pdf.text("Design + Planning Agreement", 202, y, { align: "right" });
  pdf.setFont("Barlow-Regular", "normal");
  pdf.text(agreement.agreementNumber, 202, y + 7, { align: "right" });

  y = 48;
  pdf.setTextColor(24, 24, 27);
  pdf.setFont("Barlow-SemiBold", "normal");
  pdf.setFontSize(17);
  pdf.text(agreement.projectName || agreement.quoteNumber || "Design + Planning Services", margin, y);
  y += 8;
  pdf.setFont("Barlow-Regular", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(82, 82, 91);
  y = addWrappedText(
    pdf,
    "This agreement documents paid pre-construction design and planning work before final proposal approval, construction authorization, permitting, engineering, fabrication, or installation release.",
    margin,
    y,
    188,
    5,
  ) + 4;

  y = sectionTitle(pdf, "Agreement Summary", margin, y);
  const leftStart = y;
  const rightStart = y;
  const leftEnd = [
    ["Customer", agreement.accountName],
    ["Fee", formatMoney(agreement.amount)],
    ["Planning Tier", agreement.tierLabel || "Design + Planning"],
  ].reduce((currentY, [label, value]) => addKeyValue(pdf, label, value, margin, currentY), leftStart);

  const rightEnd = [
    ["Project", agreement.projectName || agreement.quoteNumber || "N/A"],
    ["Jobsite", agreement.jobsiteAddress || agreement.quote?.jobsiteAddress || "N/A"],
    ["Credit", agreement.creditEligible ? `Eligible${agreement.creditExpiresAt ? ` until ${new Date(agreement.creditExpiresAt).toLocaleDateString()}` : ""}` : "Not credit eligible"],
  ].reduce((currentY, [label, value]) => addKeyValue(pdf, label, value, 112, currentY, 88), rightStart);
  y = Math.max(leftEnd, rightEnd) + 2;

  if (agreement.scopeSummary) {
    y = sectionTitle(pdf, "Planning Scope", margin, y);
    pdf.setFont("Barlow-Regular", "normal");
    pdf.setFontSize(10);
    y = addWrappedText(pdf, agreement.scopeSummary, margin, y, 188, 5) + 3;
  }

  y = sectionTitle(pdf, "Terms", margin, y);
  pdf.setFont("Barlow-Regular", "normal");
  pdf.setFontSize(9.5);
  agreement.terms.forEach((term, index) => {
    y = ensureSpace(pdf, y, 16);
    pdf.setFont("Barlow-SemiBold", "normal");
    pdf.text(`${index + 1}.`, margin, y);
    pdf.setFont("Barlow-Regular", "normal");
    y = addWrappedText(pdf, term, margin + 8, y, 180, 4.8) + 2;
  });

  y = sectionTitle(pdf, "Signature", margin, y + 2);
  pdf.setFont("Barlow-Regular", "normal");
  pdf.setFontSize(10);
  const signature = agreement.customerSignatureData;
  const signatureBoxY = ensureSpace(pdf, y, 48);
  y = signatureBoxY;
  pdf.setDrawColor(209, 213, 219);
  pdf.roundedRect(margin, y, 188, 38, 2, 2);

  if (signature?.imageData) {
    try {
      pdf.addImage(signature.imageData, "PNG", margin + 4, y + 5, 72, 18);
    } catch {
      pdf.text(signature.name || "Signed", margin + 4, y + 16);
    }
  } else {
    pdf.setTextColor(113, 113, 122);
    pdf.text("Customer signature will appear here after signing.", margin + 4, y + 16);
  }

  pdf.setTextColor(24, 24, 27);
  pdf.line(margin + 4, y + 25, margin + 84, y + 25);
  pdf.setFont("Barlow-SemiBold", "normal");
  pdf.setFontSize(9);
  pdf.text(signature?.name || agreement.accountName || "Customer", margin + 4, y + 31);
  pdf.setFont("Barlow-Regular", "normal");
  pdf.text(`Signed: ${formatDate(agreement.customerSignedAt || agreement.agreementSignedAt)}`, 112, y + 13);
  pdf.text(`IP: ${agreement.customerSignedIp || "Not recorded"}`, 112, y + 20);
  pdf.text(`Document ID: ${agreement.signatureAuditTrail?.documentFingerprint?.slice(0, 16) || "Generated at signing"}`, 112, y + 27);

  y += 46;
  y = ensureSpace(pdf, y, 20);
  pdf.setFont("Barlow-Regular", "normal");
  pdf.setFontSize(8.5);
  pdf.setTextColor(82, 82, 91);
  pdf.text("Electronic signature consent:", margin, y);
  y = addWrappedText(
    pdf,
    "The customer confirms that they reviewed this Design + Planning Agreement and agree to be legally bound by its terms. The electronic signature carries the same legal weight as a handwritten signature.",
    margin,
    y + 5,
    188,
    4,
  );

  addFooter(pdf, company.name);
  return pdf.output("blob");
}

export function downloadPlanningAgreementPDF(pdfBlob: Blob, agreement: PlanningAgreementPublicData) {
  const date = new Date().toISOString().slice(0, 10);
  const filename = `${cleanFilename(agreement.agreementNumber || `Planning_Agreement_${agreement.id}`)}_Signed_${date}.pdf`;
  const url = URL.createObjectURL(pdfBlob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
