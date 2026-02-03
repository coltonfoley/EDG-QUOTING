import jsPDF from 'jspdf';
import type { QuoteWithDetails, LineItem } from '@shared/schema';
import { barlowRegularBase64, barlowSemiBoldBase64 } from './fonts';
import { formatCurrency } from './utils';

interface BomLineItem extends LineItem {
  manufacturer?: string;
}

interface PdfGroup {
  id: string;
  title: string;
  position: number;
}

interface GenerateBomPDFOptions {
  quote: QuoteWithDetails;
  groups?: PdfGroup[];
}

interface BomRow {
  description: string;
  quantity: string;
  manufacturer: string;
  unitPrice: string;
  colors?: string;
  groupTitle?: string;
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

export async function generateBomPDF(options: GenerateBomPDFOptions): Promise<Blob> {
  const { quote, groups = [] } = options;

  const pdf = new jsPDF({ unit: 'mm', format: 'letter' });

  pdf.addFileToVFS('Barlow-Regular.ttf', barlowRegularBase64);
  pdf.addFont('Barlow-Regular.ttf', 'Barlow-Regular', 'normal');
  pdf.addFileToVFS('Barlow-SemiBold.ttf', barlowSemiBoldBase64);
  pdf.addFont('Barlow-SemiBold.ttf', 'Barlow-SemiBold', 'normal');

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 15;
  const contentW = pageW - (2 * margin);
  
  let y = margin;

  pdf.setFont('Barlow-SemiBold', 'normal');
  pdf.setFontSize(18);
  pdf.setTextColor(33, 33, 33);
  pdf.text('Bill of Materials', margin, y);
  y += 8;

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
    manufacturer: string;
    groupPosition: number;
    groupTitle: string;
    itemPosition: number;
  }
  
  const sortedItems: SortedItem[] = lineItems.map(item => {
    const manufacturer = item.manufacturer || 'Uncategorized';
    const group = item.groupId ? groupMap.get(item.groupId) : null;
    const groupPosition = group ? group.position : 999999;
    const groupTitle = group ? group.title : 'Ungrouped Items';
    
    return {
      item,
      manufacturer,
      groupPosition,
      groupTitle,
      itemPosition: item.position ?? 0
    };
  });

  sortedItems.sort((a, b) => {
    if (a.manufacturer !== b.manufacturer) {
      if (a.manufacturer === 'Uncategorized') return 1;
      if (b.manufacturer === 'Uncategorized') return -1;
      return a.manufacturer.localeCompare(b.manufacturer);
    }
    if (a.groupPosition !== b.groupPosition) {
      return a.groupPosition - b.groupPosition;
    }
    return a.itemPosition - b.itemPosition;
  });

  const colWidths = {
    qty: 18,
    manufacturer: 40,
    unitPrice: 25,
    description: contentW - 18 - 40 - 25
  };

  const headerHeight = 8;
  pdf.setFillColor(240, 240, 240);
  pdf.rect(margin, y - 2, contentW, headerHeight, 'F');
  
  pdf.setFont('Barlow-SemiBold', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(33, 33, 33);
  
  let colX = margin + 2;
  pdf.text('Qty', colX, y + 3);
  colX += colWidths.qty;
  pdf.text('Description', colX, y + 3);
  colX += colWidths.description;
  pdf.text('Manufacturer', colX, y + 3);
  colX += colWidths.manufacturer;
  pdf.text('Unit Price', colX, y + 3);
  
  y += headerHeight + 4;

  let currentManufacturer = '';
  let currentGroup = '';
  
  pdf.setFont('Barlow-Regular', 'normal');
  pdf.setFontSize(9);

  for (const sortedItem of sortedItems) {
    const { item, manufacturer, groupTitle } = sortedItem;
    
    if (manufacturer !== currentManufacturer) {
      if (currentManufacturer !== '') {
        y += 4;
      }
      
      if (y > pageH - 30) {
        pdf.addPage();
        y = margin;
      }
      
      pdf.setFont('Barlow-SemiBold', 'normal');
      pdf.setFontSize(11);
      pdf.setTextColor(66, 140, 120);
      pdf.text(manufacturer, margin, y);
      y += 6;
      
      currentManufacturer = manufacturer;
      currentGroup = '';
    }
    
    if (groupTitle !== currentGroup && groupTitle !== 'Ungrouped Items') {
      if (y > pageH - 30) {
        pdf.addPage();
        y = margin;
      }
      
      pdf.setFont('Barlow-SemiBold', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(100, 100, 100);
      pdf.text(`  ${groupTitle}`, margin, y);
      y += 5;
      
      currentGroup = groupTitle;
    }

    const configInfo = parseConfigData(item.configData);
    
    const qty = parseFloat(item.quantity).toString();
    const description = item.description;
    const unitPrice = formatCurrency(parseFloat(item.unitPrice));
    
    let descriptionWithColor = description;
    if (configInfo.colors) {
      descriptionWithColor = `${description} (${configInfo.colors})`;
    }

    const descMaxWidth = colWidths.description - 4;
    const descLines = pdf.splitTextToSize(descriptionWithColor, descMaxWidth);
    const rowHeight = Math.max(5, descLines.length * 4 + 2);

    if (y + rowHeight > pageH - 20) {
      pdf.addPage();
      y = margin;
      
      pdf.setFillColor(240, 240, 240);
      pdf.rect(margin, y - 2, contentW, headerHeight, 'F');
      
      pdf.setFont('Barlow-SemiBold', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(33, 33, 33);
      
      let hColX = margin + 2;
      pdf.text('Qty', hColX, y + 3);
      hColX += colWidths.qty;
      pdf.text('Description', hColX, y + 3);
      hColX += colWidths.description;
      pdf.text('Manufacturer', hColX, y + 3);
      hColX += colWidths.manufacturer;
      pdf.text('Unit Price', hColX, y + 3);
      
      y += headerHeight + 4;
    }

    pdf.setFont('Barlow-Regular', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(33, 33, 33);
    
    colX = margin + 2;
    pdf.text(qty, colX, y);
    colX += colWidths.qty;
    
    pdf.text(descLines, colX, y);
    colX += colWidths.description;
    
    pdf.setTextColor(100, 100, 100);
    pdf.text(manufacturer, colX, y);
    colX += colWidths.manufacturer;
    
    pdf.setTextColor(33, 33, 33);
    pdf.text(unitPrice, colX, y);
    
    y += rowHeight;

    pdf.setDrawColor(230, 230, 230);
    pdf.setLineWidth(0.2);
    pdf.line(margin, y - 1, pageW - margin, y - 1);
    y += 2;
  }

  y += 8;
  if (y > pageH - 25) {
    pdf.addPage();
    y = margin;
  }
  
  pdf.setFont('Barlow-SemiBold', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(33, 33, 33);
  pdf.text(`Total Line Items: ${lineItems.length}`, margin, y);

  const pageCount = pdf.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);
    pdf.setFont('Barlow-Regular', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(150, 150, 150);
    pdf.text(
      `Page ${i} of ${pageCount}`,
      pageW - margin,
      pageH - 10,
      { align: 'right' }
    );
    pdf.text(
      'Bill of Materials - For Operations Use',
      margin,
      pageH - 10
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
