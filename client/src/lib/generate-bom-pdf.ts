import jsPDFDefault, { jsPDF as jsPDFNamed } from 'jspdf';
import type { jsPDF as JsPDFType } from 'jspdf';
import type { QuoteWithDetails, LineItem } from '@shared/schema';
import { barlowRegularBase64, barlowSemiBoldBase64 } from './fonts';
import { formatCurrency, calculateLineItemTotal } from './utils';
import { getBrandLogoPNG } from './pdf-brand-assets';

const JsPDF = jsPDFNamed || jsPDFDefault;

type BomLineItem = LineItem;

interface PdfGroup {
  id: string;
  title: string;
  position: number;
}

interface GenerateBomPDFOptions {
  quote: QuoteWithDetails;
  groups?: PdfGroup[];
  brandLogoDataUrl?: string;
}

function parseConfigData(configData: any): { colors?: string } {
  if (!configData) return {};
  
  let parsed = configData;
  if (typeof configData === 'string') {
    try {
      parsed = JSON.parse(configData);
    } catch {
      return {};
    }
  }
  
  if (parsed.colors && Array.isArray(parsed.colors)) {
    const colorNames = parsed.colors
      .filter((c: any) => c && c.name)
      .map((c: any) => c.name)
      .join(', ');
    return { colors: colorNames || undefined };
  }
  
  return {};
}

function calculateSellPrice(item: BomLineItem, quoteTariffRate: string | number): { unitSellPrice: number; lineTotal: number } {
  const qty = parseFloat(item.quantity) || 0;
  const lineTotal = calculateLineItemTotal(
    qty,
    item.unitPrice,
    item.markupType,
    item.markupValue,
    item.discountType || 'percentage',
    item.discountValue || '0',
    quoteTariffRate || '0',
    item.isTariffApplicable || false
  );
  const unitSellPrice = qty > 0 ? lineTotal / qty : 0;
  return { unitSellPrice, lineTotal };
}

function drawTableHeader(pdf: JsPDFType, y: number, margin: number, colWidths: Record<string, number>) {
  const contentW = Object.values(colWidths).reduce((sum, w) => sum + w, 0);
  const headerHeight = 8;
  
  pdf.setFillColor(240, 240, 240);
  pdf.rect(margin, y - 2, contentW, headerHeight, 'F');
  
  pdf.setFont('Barlow-SemiBold', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(33, 33, 33);
  
  let colX = margin + 2;
  pdf.text('Description', colX, y + 3);
  colX += colWidths.description;
  pdf.text('SKU', colX, y + 3);
  colX += colWidths.sku;
  pdf.text('Qty', colX, y + 3);
  colX += colWidths.qty;
  pdf.text('Customer Unit', colX, y + 3);
  colX += colWidths.unitPrice;
  pdf.text('Total', colX, y + 3);
  
  return headerHeight;
}

export async function generateBomPDF(options: GenerateBomPDFOptions): Promise<Blob> {
  const { quote, groups = [], brandLogoDataUrl } = options;

  const BRAND_LOGO_PNG = brandLogoDataUrl || await getBrandLogoPNG();

  const pdf = new JsPDF({ unit: 'mm', format: 'letter' });

  pdf.addFileToVFS('Barlow-Regular.ttf', barlowRegularBase64);
  pdf.addFont('Barlow-Regular.ttf', 'Barlow-Regular', 'normal');
  pdf.addFileToVFS('Barlow-SemiBold.ttf', barlowSemiBoldBase64);
  pdf.addFont('Barlow-SemiBold.ttf', 'Barlow-SemiBold', 'normal');

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 15;
  const contentW = pageW - (2 * margin);
  
  const company = {
    name: 'EDG Patio & Shade',
    address: 'Scottsdale, AZ',
    phone: '(815) 581-0138',
    email: 'info@edgpatioshade.com',
  };

  const footerReserve = 30;

  let y = margin;

  const logoW = 35;
  const logoH = 14;
  pdf.addImage(BRAND_LOGO_PNG, 'PNG', margin, y - 4, logoW, logoH);

  pdf.setFont('Barlow-SemiBold', 'normal');
  pdf.setFontSize(18);
  pdf.setTextColor(33, 33, 33);
  pdf.text('Bill of Materials', margin + logoW + 6, y + 5);
  y += logoH + 4;

  pdf.setFont('Barlow-Regular', 'normal');
  pdf.setFontSize(11);
  pdf.setTextColor(80, 80, 80);
  
  const projectName = quote.projectName || 'Project';
  const quoteNumber = quote.quoteNumber || '';
  pdf.text(`Project: ${projectName}`, margin, y);
  y += 5;
  pdf.text(`Quote #: ${quoteNumber}`, margin, y);
  y += 5;
  
  const customerName = quote.account?.company || quote.account?.name || '';
  if (customerName) {
    pdf.text(`Customer: ${customerName}`, margin, y);
    y += 5;
  }
  
  const date = new Date().toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  pdf.text(`Date: ${date}`, margin, y);
  y += 10;

  pdf.setDrawColor(66, 255, 193);
  pdf.setLineWidth(1);
  pdf.line(margin, y, pageW - margin, y);
  y += 8;

  const lineItems = quote.lineItems as BomLineItem[];
  
  const groupMap = new Map(groups.map(g => [g.id, g]));
  
  interface SortedItem {
    item: BomLineItem;
    groupPosition: number;
    groupTitle: string;
    itemPosition: number;
  }
  
  const sortedItems: SortedItem[] = lineItems.map(item => {
    const group = item.groupId ? groupMap.get(item.groupId) : null;
    const groupPosition = group ? group.position : 999999;
    const groupTitle = group ? group.title : 'Ungrouped Items';
    
    return {
      item,
      groupPosition,
      groupTitle,
      itemPosition: item.position ?? 0
    };
  });

  sortedItems.sort((a, b) => {
    if (a.groupPosition !== b.groupPosition) {
      return a.groupPosition - b.groupPosition;
    }
    return a.itemPosition - b.itemPosition;
  });

  const colWidths = {
    description: contentW - 30 - 15 - 28 - 28,
    sku: 30,
    qty: 15,
    unitPrice: 28,
    total: 28,
  };

  const headerHeight = drawTableHeader(pdf, y, margin, colWidths);
  y += headerHeight + 4;

  let currentGroup = '';
  let grandTotal = 0;
  
  pdf.setFont('Barlow-Regular', 'normal');
  pdf.setFontSize(9);

  for (const sortedItem of sortedItems) {
    const { item, groupTitle } = sortedItem;
    
    if (groupTitle !== currentGroup && groupTitle !== 'Ungrouped Items') {
      if (currentGroup !== '') {
        y += 4;
      }
      
      if (y > pageH - footerReserve) {
        pdf.addPage();
        y = margin;
        const hh = drawTableHeader(pdf, y, margin, colWidths);
        y += hh + 4;
      }
      
      pdf.setFont('Barlow-SemiBold', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(66, 140, 120);
      pdf.text(groupTitle, margin, y);
      y += 5;
      
      currentGroup = groupTitle;
    }

    const configInfo = parseConfigData(item.configData);
    
    const qty = parseFloat(item.quantity).toString();
    const sku = item.sku || '';
    const { unitSellPrice, lineTotal } = calculateSellPrice(item, quote.tariffRate || '0');
    grandTotal += lineTotal;
    
    let descriptionWithColor = item.description;
    if (configInfo.colors) {
      descriptionWithColor = `${item.description} (${configInfo.colors})`;
    }

    const descMaxWidth = colWidths.description - 4;
    const descLines = pdf.splitTextToSize(descriptionWithColor, descMaxWidth);
    const rowHeight = Math.max(5, descLines.length * 4 + 2);

    if (y + rowHeight > pageH - footerReserve) {
      pdf.addPage();
      y = margin;
      const hh = drawTableHeader(pdf, y, margin, colWidths);
      y += hh + 4;
    }

    pdf.setFont('Barlow-Regular', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(33, 33, 33);
    
    let colX = margin + 2;
    pdf.text(descLines, colX, y);
    colX += colWidths.description;
    
    pdf.setTextColor(100, 100, 100);
    pdf.text(sku, colX, y);
    colX += colWidths.sku;
    
    pdf.setTextColor(33, 33, 33);
    pdf.text(qty, colX, y);
    colX += colWidths.qty;
    
    pdf.text(formatCurrency(unitSellPrice), colX, y);
    colX += colWidths.unitPrice;
    
    pdf.text(formatCurrency(lineTotal), colX, y);
    
    y += rowHeight;

    pdf.setDrawColor(230, 230, 230);
    pdf.setLineWidth(0.2);
    pdf.line(margin, y - 1, pageW - margin, y - 1);
    y += 2;
  }

  y += 8;
  if (y > pageH - footerReserve) {
    pdf.addPage();
    y = margin;
  }
  
  pdf.setFont('Barlow-SemiBold', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(33, 33, 33);
  pdf.text(`Total Line Items: ${lineItems.length}`, margin, y);
  y += 6;
  pdf.text(`Grand Total: ${formatCurrency(grandTotal)}`, margin, y);

  const pageCount = pdf.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);

    const footerY = pageH - 15;
    const lineY = footerY - 8;

    pdf.setDrawColor(66, 255, 193);
    pdf.setLineWidth(1);
    pdf.line(margin, lineY, pageW - margin, lineY);

    const fLogoW = 22;
    const fLogoH = 9;
    pdf.addImage(BRAND_LOGO_PNG, 'PNG', margin, footerY - fLogoH + 2, fLogoW, fLogoH);

    pdf.setFont('Barlow-Regular', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(100, 100, 100);
    const infoText = `${company.name} | ${company.phone} | ${company.email}`;
    pdf.text(infoText, pageW / 2, footerY, { align: 'center' });

    pdf.text(
      `Page ${i} of ${pageCount}`,
      pageW - margin,
      footerY,
      { align: 'right' }
    );
  }

  return pdf.output('blob');
}

export function downloadBomPDF(pdfBlob: Blob, quote: QuoteWithDetails) {
  const timestamp = new Date().toISOString().slice(0, 10);
  const projectName = quote.projectName || 'Project';
  const quoteNumber = quote.quoteNumber || 'Quote';
  const filename = `${projectName.replace(/[^a-zA-Z0-9]/g, '_')}_${quoteNumber}_BOM_${timestamp}.pdf`;

  const url = URL.createObjectURL(pdfBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
