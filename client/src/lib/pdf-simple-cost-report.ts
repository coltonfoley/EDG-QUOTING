import jsPDF from 'jspdf';

interface SimpleCostReportOptions {
  quote: any;
  company: any;
}

export function generateSimpleCostReport({ quote, company }: SimpleCostReportOptions) {
  const pdf = new jsPDF({
    unit: 'mm',
    format: 'letter',
  });

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 15;
  const contentW = pageW - 2 * margin;
  
  let y = margin;

  // Header
  pdf.setFontSize(20);
  pdf.setFont('helvetica', 'bold');
  pdf.text('COST BREAKDOWN', margin, y);
  y += 10;

  // Quote info
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Quote #: ${quote.quoteNumber || 'N/A'}`, margin, y);
  y += 5;
  pdf.text(`Project: ${quote.projectName || 'Untitled Project'}`, margin, y);
  y += 5;
  pdf.text(`Date: ${new Date().toLocaleDateString()}`, margin, y);
  y += 10;

  // Table header
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  
  const colX = {
    description: margin,
    qty: margin + contentW * 0.6,
    unitCost: margin + contentW * 0.75,
    total: margin + contentW * 0.87,
  };

  // Draw header row background
  pdf.setFillColor(240, 240, 240);
  pdf.rect(margin, y - 4, contentW, 7, 'F');
  
  pdf.text('Description', colX.description + 2, y);
  pdf.text('Qty', colX.qty, y);
  pdf.text('Unit Cost', colX.unitCost, y);
  pdf.text('Total', colX.total, y);
  y += 8;

  // Line items
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);

  const lineItems = quote.lineItems || [];
  let subtotal = 0;
  let taxableSubtotal = 0;

  lineItems.forEach((item: any, index: number) => {
    // Check if we need a new page
    if (y > pageH - 40) {
      pdf.addPage();
      y = margin;
    }

    const quantity = parseFloat(item.quantity || '0');
    const unitCost = parseFloat(item.unitPrice || '0');
    const total = quantity * unitCost;
    
    subtotal += total;
    if (item.isTaxable !== false) {
      taxableSubtotal += total;
    }

    // Alternate row background
    if (index % 2 === 0) {
      pdf.setFillColor(250, 250, 250);
      pdf.rect(margin, y - 4, contentW, 6, 'F');
    }

    // Description (wrap if too long)
    const description = item.description || 'Unnamed Item';
    const maxDescWidth = contentW * 0.55;
    const descLines = pdf.splitTextToSize(description, maxDescWidth);
    
    pdf.text(descLines[0], colX.description + 2, y);
    pdf.text(quantity.toFixed(2), colX.qty, y);
    pdf.text(`$${unitCost.toFixed(2)}`, colX.unitCost, y);
    pdf.text(`$${total.toFixed(2)}`, colX.total, y);
    
    y += 6;

    // If description wrapped, add extra lines
    if (descLines.length > 1) {
      for (let i = 1; i < descLines.length; i++) {
        if (y > pageH - 40) {
          pdf.addPage();
          y = margin;
        }
        pdf.text(descLines[i], colX.description + 2, y);
        y += 5;
      }
    }
  });

  // Draw line above totals
  y += 5;
  pdf.setDrawColor(200, 200, 200);
  pdf.line(margin + contentW * 0.7, y, margin + contentW, y);
  y += 8;

  // Calculate totals
  const taxRate = parseFloat(quote.taxRate || '0');
  const shipping = parseFloat(quote.shipping || '0');
  
  // Only include shipping in taxable amount if it's taxable (default to false to match calculateQuoteTotals)
  const isShippingTaxable = quote.isShippingTaxable === true;
  const taxableAmount = taxableSubtotal + (isShippingTaxable ? shipping : 0);
  const tax = (taxableAmount * taxRate) / 100;
  const total = subtotal + shipping + tax;

  // Totals section
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  
  const totalsX = margin + contentW * 0.75;
  const valuesX = margin + contentW * 0.87;

  pdf.text('Subtotal:', totalsX, y);
  pdf.text(`$${subtotal.toFixed(2)}`, valuesX, y);
  y += 6;

  if (shipping > 0) {
    pdf.text('Shipping:', totalsX, y);
    pdf.text(`$${shipping.toFixed(2)}`, valuesX, y);
    y += 6;
  }

  if (tax > 0) {
    pdf.text(`Tax (${taxRate}%):`, totalsX, y);
    pdf.text(`$${tax.toFixed(2)}`, valuesX, y);
    y += 6;
  }

  // Total
  y += 2;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.text('Total Cost:', totalsX, y);
  pdf.text(`$${total.toFixed(2)}`, valuesX, y);

  // Save
  const fileName = `${quote.quoteNumber || 'quote'}-costs.pdf`;
  pdf.save(fileName);
}
