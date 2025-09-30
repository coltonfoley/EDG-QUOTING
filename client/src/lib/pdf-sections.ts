import jsPDF from 'jspdf';
import { ensureSpace, measureAcceptanceBlock } from '@/lib/pdf-utils';
import { formatCurrency, calculateLineItemTotal } from '@/lib/utils';

const EDG_TEAL = [66, 255, 193] as const;

interface DrawStandardCoverOpts {
  coverDataUrl: string;
  logoDataUrl: string;
  company: { name: string; address: string; phone: string; email: string };
  title: string;
  subtitle: string;
  pageW: number;
  pageH: number;
}

interface DrawProjectDetailsPageOpts {
  company: { name: string; address: string; phone: string; email: string };
  quote: any;
  coverDataUrl: string;
  margin: number;
  contentW: number;
  pageW: number;
  pageH: number;
  showPricing: boolean;
}

interface DrawRenderingsPagesOpts {
  images: Array<{ dataUrl: string; format: string }>;
  margin: number;
  contentW: number;
  pageW: number;
  pageH: number;
}

interface DrawLineItemsSectionOpts {
  quote: any;
  showPricing: boolean;
  margin: number;
  contentW: number;
  pageW: number;
  pageH: number;
}

interface DrawContractSectionOpts {
  contractText: string;
  margin: number;
  contentW: number;
  pageW: number;
  pageH: number;
}

interface DrawBrandedBackPageOpts {
  company: { name: string; address: string; phone: string; email: string };
  logoDataUrl: string;
  pageW: number;
  pageH: number;
  margin: number;
}

export function drawStandardCover(pdf: jsPDF, opts: DrawStandardCoverOpts): void {
  const { coverDataUrl, pageW, pageH } = opts;

  // Add the cover image as a full-page background
  pdf.addImage(coverDataUrl, 'PNG', 0, 0, pageW, pageH);
}

export function drawProjectDetailsPage(pdf: jsPDF, opts: DrawProjectDetailsPageOpts): void {
  const { company, quote, coverDataUrl, margin, contentW, pageW, pageH, showPricing } = opts;

  pdf.addPage();
  let y = margin;

  pdf.setFont('Barlow-SemiBold', 'normal');
  pdf.setFontSize(18);
  pdf.setTextColor(0, 0, 0);
  pdf.text('Project Details', margin, y);
  y += 15;

  const colW = contentW / 2 - 5;
  const col1X = margin;
  const col2X = margin + colW + 10;

  pdf.setFont('Barlow-Regular', 'normal');
  pdf.setFontSize(11);

  pdf.setFont('Barlow-SemiBold', 'normal');
  pdf.text('Client', col1X, y);
  pdf.setFont('Barlow-Regular', 'normal');
  pdf.text(quote.account?.name || 'N/A', col1X, y + 5);

  pdf.setFont('Barlow-SemiBold', 'normal');
  pdf.text('Date', col2X, y);
  pdf.setFont('Barlow-Regular', 'normal');
  const dateStr = quote.createdAt ? new Date(quote.createdAt).toLocaleDateString() : 'N/A';
  pdf.text(dateStr, col2X, y + 5);

  y += 15;

  pdf.setFont('Barlow-SemiBold', 'normal');
  pdf.text('Project', col1X, y);
  pdf.setFont('Barlow-Regular', 'normal');
  pdf.text(quote.projectName || 'N/A', col1X, y + 5);

  pdf.setFont('Barlow-SemiBold', 'normal');
  pdf.text('Representative', col2X, y);
  pdf.setFont('Barlow-Regular', 'normal');
  pdf.text(company.name, col2X, y + 5);

  y += 15;

  pdf.setFont('Barlow-SemiBold', 'normal');
  pdf.text('Address', col1X, y);
  pdf.setFont('Barlow-Regular', 'normal');
  const addressLines = pdf.splitTextToSize(quote.projectAddress || 'N/A', colW);
  pdf.text(addressLines, col1X, y + 5);

  pdf.setFont('Barlow-SemiBold', 'normal');
  pdf.text('Email', col2X, y);
  pdf.setFont('Barlow-Regular', 'normal');
  pdf.text(company.email, col2X, y + 5);

  y += Math.max(5 + addressLines.length * 5, 15);

  y += 10;
  
  // Add client logo image
  const imgW = contentW;
  const imgH = imgW * 0.6;
  pdf.addImage(coverDataUrl, 'PNG', margin, y, imgW, imgH);
  y += imgH;

  // Investment Summary - Always visible (per spec)
  y += 10;
  pdf.setFont('Barlow-SemiBold', 'normal');
  pdf.setFontSize(14);
  pdf.text('Investment Summary', margin, y);
  y += 8;

  const totals = calculateInvestmentTotals(quote);

  pdf.setFont('Barlow-Regular', 'normal');
  pdf.setFontSize(11);

  const summaryItems = [
    { label: 'Subtotal', value: totals.subtotal },
    { label: 'Tax', value: totals.tax },
    { label: 'Shipping', value: totals.shipping },
  ];

  summaryItems.forEach(item => {
    pdf.text(item.label, margin, y);
    pdf.text(formatCurrency(item.value), margin + contentW - 30, y, { align: 'right' });
    y += 6;
  });

  y += 2;
  pdf.setFont('Barlow-SemiBold', 'normal');
  pdf.setFontSize(12);
  pdf.text('Total', margin, y);
  pdf.text(formatCurrency(totals.total), margin + contentW - 30, y, { align: 'right' });
  y += 10;

  const acceptanceH = measureAcceptanceBlock(pdf, {
    heading: 'CLIENT ACCEPTANCE',
    width: contentW,
    headingFontSizePt: 14,
    bodyFontSizePt: 11,
    spacingTop: 10,
    spacingAfterHeading: 8,
    fieldGap: 8,
    labelGap: 2,
    bottomPadding: 5,
    fields: [
      { label: 'Signature', lineWidthMm: contentW * 0.6 },
      { label: 'Print Name', lineWidthMm: contentW * 0.6 },
      { label: 'Date', lineWidthMm: 50 },
    ],
  });

  y = ensureSpace(pdf, y, acceptanceH, {
    marginTop: margin,
    marginBottom: margin,
    footerReserve: 0,
  });

  drawAcceptanceBlock(pdf, margin, y, contentW);

  // Add disclaimer text at the bottom of the page
  const disclaimerText = 'This quote is for estimation purposes and is not a guarantee of cost for services. Quote is based on current information from manufacturer about the project requirements. Actual cost may change once project elements are finalized. Client will be notified of any changes in cost prior to them being incurred.';
  
  const bottomMargin = 10;
  const disclaimerY = pageH - bottomMargin;
  
  pdf.setFont('Barlow-Regular', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(120, 120, 120); // Gray color for subtlety
  
  const lines = pdf.splitTextToSize(disclaimerText, contentW);
  const textHeight = lines.length * 3;
  pdf.text(lines, pageW / 2, disclaimerY - textHeight, { align: 'center' });
}

function calculateInvestmentTotals(quote: any) {
  const lineItems = quote.lineItems || [];
  let subtotal = 0;

  lineItems.forEach((item: any) => {
    const total = calculateLineItemTotal(
      item.quantity,
      item.unitPrice,
      item.markupType,
      item.markupValue,
      item.discountType || 'percentage',
      item.discountValue || 0
    );
    subtotal += total;
  });

  const taxRate = parseFloat(quote.taxRate || '0');
  const shipping = parseFloat(quote.shipping || '0');
  const tax = (subtotal * taxRate) / 100;
  const total = subtotal + tax + shipping;

  return { subtotal, tax, shipping, total };
}

function drawAcceptanceBlock(pdf: jsPDF, x: number, y: number, width: number): void {
  pdf.setFont('Barlow-SemiBold', 'normal');
  pdf.setFontSize(14);
  pdf.text('CLIENT ACCEPTANCE', x, y);
  y += 8;

  pdf.setFont('Barlow-Regular', 'normal');
  pdf.setFontSize(11);

  const fields = [
    { label: 'Signature', lineWidth: width * 0.6 },
    { label: 'Print Name', lineWidth: width * 0.6 },
    { label: 'Date', lineWidth: 50 },
  ];

  fields.forEach(field => {
    pdf.text(field.label, x, y);
    y += 3;
    pdf.line(x, y, x + field.lineWidth, y);
    y += 10;
  });
}

export function drawRenderingsPages(pdf: jsPDF, opts: DrawRenderingsPagesOpts): void {
  const { images, margin, contentW, pageW, pageH } = opts;

  if (images.length === 0) return;

  pdf.addPage();
  let y = margin;

  pdf.setFont('Barlow-SemiBold', 'normal');
  pdf.setFontSize(18);
  pdf.setTextColor(0, 0, 0);
  pdf.text('Visuals & Details', margin, y);
  y += 15;

  const imagesPerPage = 2;
  const gap = 10;
  const imgW = contentW;
  const imgH = imgW * 0.6; // Slightly wider aspect ratio for larger display

  let currentPage = 0;
  let imgIndex = 0;

  while (imgIndex < images.length) {
    if (imgIndex > 0 && imgIndex % imagesPerPage === 0) {
      pdf.addPage();
      y = margin;

      pdf.setFont('Barlow-SemiBold', 'normal');
      pdf.setFontSize(18);
      pdf.text('Visuals & Details (cont.)', margin, y);
      y += 15;
      currentPage++;
    }

    const pageStartIndex = currentPage * imagesPerPage;
    const relativeIndex = imgIndex - pageStartIndex;

    const imgX = margin;
    const imgY = y + relativeIndex * (imgH + gap);

    const img = images[imgIndex];
    const format = detectImageFormat(img.dataUrl);

    pdf.addImage(img.dataUrl, format, imgX, imgY, imgW, imgH);

    imgIndex++;
  }
}

function detectImageFormat(dataUrl: string): 'PNG' | 'JPEG' {
  if (dataUrl.startsWith('data:image/png')) return 'PNG';
  return 'JPEG';
}

export function drawLineItemsSection(pdf: jsPDF, opts: DrawLineItemsSectionOpts): void {
  const { quote, showPricing, margin, contentW, pageW, pageH } = opts;

  const lineItems = quote.lineItems || [];
  if (lineItems.length === 0) return;

  pdf.addPage();
  let y = margin;

  const drawHeader = (title: string) => {
    pdf.setFont('Barlow-SemiBold', 'normal');
    pdf.setFontSize(18);
    pdf.setTextColor(0, 0, 0);
    pdf.text(title, margin, y);
    y += 12;

    pdf.setFontSize(11);
    pdf.setDrawColor(200, 200, 200);

    if (showPricing) {
      const descW = contentW * 0.5;
      const qtyW = contentW * 0.15;
      const priceW = contentW * 0.17;
      const totalW = contentW * 0.18;

      pdf.text('Description', margin, y);
      pdf.text('Qty', margin + descW, y);
      pdf.text('Price', margin + descW + qtyW, y);
      pdf.text('Total', margin + descW + qtyW + priceW, y);

      y += 2;
      pdf.line(margin, y, margin + contentW, y);
      y += 5;
    } else {
      const descW = contentW * 0.75;
      const qtyW = contentW * 0.25;

      pdf.text('Description', margin, y);
      pdf.text('Qty', margin + descW, y);

      y += 2;
      pdf.line(margin, y, margin + contentW, y);
      y += 5;
    }
  };

  drawHeader('Line Items');

  pdf.setFont('Barlow-Regular', 'normal');
  pdf.setFontSize(10);

  lineItems.forEach((item: any, index: number) => {
    const descLines = pdf.splitTextToSize(item.description || '', contentW * 0.48);
    const rowHeight = Math.max(descLines.length * 5, 8);

    y = ensureSpace(pdf, y, rowHeight, {
      marginTop: margin,
      marginBottom: margin,
      footerReserve: 0,
      onNewPage: () => {
        y = margin;
        drawHeader('Line Items (cont.)');
      },
    });

    if (showPricing) {
      const descW = contentW * 0.5;
      const qtyW = contentW * 0.15;
      const priceW = contentW * 0.17;

      pdf.text(descLines, margin, y);

      const qty = parseFloat(item.quantity || '0');
      const total = calculateLineItemTotal(
        item.quantity,
        item.unitPrice,
        item.markupType,
        item.markupValue,
        item.discountType || 'percentage',
        item.discountValue || 0
      );
      const unitPrice = qty > 0 ? total / qty : 0;

      pdf.text(qty.toString(), margin + descW, y);
      pdf.text(formatCurrency(unitPrice), margin + descW + qtyW, y);
      pdf.text(formatCurrency(total), margin + descW + qtyW + priceW, y);
    } else {
      const descW = contentW * 0.75;

      pdf.text(descLines, margin, y);
      pdf.text(parseFloat(item.quantity || '0').toString(), margin + descW, y);
    }

    y += rowHeight + 2;
  });
}

export function drawContractSection(pdf: jsPDF, opts: DrawContractSectionOpts): void {
  const { contractText, margin, contentW, pageW, pageH } = opts;

  if (!contractText || contractText.trim() === '') return;

  pdf.addPage();
  let y = margin;

  const drawHeader = (title: string) => {
    pdf.setFont('Barlow-SemiBold', 'normal');
    pdf.setFontSize(18);
    pdf.setTextColor(0, 0, 0);
    pdf.text(title, margin, y);
    y += 12;
  };

  drawHeader('Terms & Conditions');

  pdf.setFont('Barlow-Regular', 'normal');
  pdf.setFontSize(10);

  const paragraphs = contractText.split(/\n\s*\n/);

  paragraphs.forEach(para => {
    const trimmed = para.trim();
    if (!trimmed) return;

    const lines = pdf.splitTextToSize(trimmed, contentW);
    const paraHeight = lines.length * 5 + 5;

    y = ensureSpace(pdf, y, paraHeight, {
      marginTop: margin,
      marginBottom: margin,
      footerReserve: 0,
      onNewPage: () => {
        y = margin;
        pdf.setFont('Barlow-SemiBold', 'normal');
        pdf.setFontSize(18);
        pdf.text('Terms & Conditions (cont.)', margin, y);
        y += 12;
        pdf.setFont('Barlow-Regular', 'normal');
        pdf.setFontSize(10);
      },
    });

    pdf.text(lines, margin, y);
    y += lines.length * 5 + 5;
  });
}

export function drawBrandedBackPage(pdf: jsPDF, opts: DrawBrandedBackPageOpts): void {
  const { company, logoDataUrl, pageW, pageH, margin } = opts;

  pdf.addPage();

  pdf.setFillColor(26, 26, 26);
  pdf.rect(0, 0, pageW, pageH, 'F');

  const logoW = 60;
  const logoH = 25;
  const logoX = (pageW - logoW) / 2;
  const logoY = pageH / 2 - 40;

  pdf.addImage(logoDataUrl, 'PNG', logoX, logoY, logoW, logoH);

  let y = logoY + logoH + 20;

  pdf.setFont('Barlow-SemiBold', 'normal');
  pdf.setFontSize(16);
  pdf.setTextColor(255, 255, 255);
  pdf.text(company.name, pageW / 2, y, { align: 'center' });
  y += 10;

  pdf.setFont('Barlow-Regular', 'normal');
  pdf.setFontSize(11);
  pdf.text(company.address, pageW / 2, y, { align: 'center' });
  y += 7;

  pdf.text(company.phone, pageW / 2, y, { align: 'center' });
  y += 7;

  pdf.text(company.email, pageW / 2, y, { align: 'center' });
}
