import jsPDF from 'jspdf';
import { calculateLineItemTotal } from './utils';

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
  
  // Add address if available (jobsiteAddress takes precedence over projectAddress)
  const address = quote.jobsiteAddress || quote.projectAddress;
  if (address && address.trim()) {
    pdf.text(`Address: ${address}`, margin, y);
    y += 5;
  }
  
  pdf.text(`Date: ${new Date().toLocaleDateString()}`, margin, y);
  y += 10;

  // Table header with 6 columns
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'bold');
  
  const colX = {
    description: margin,
    qty: margin + contentW * 0.43,
    unitCost: margin + contentW * 0.54,
    unitPrice: margin + contentW * 0.66,
    costTotal: margin + contentW * 0.78,
    priceTotal: margin + contentW * 0.90,
  };

  // Draw header row background
  pdf.setFillColor(240, 240, 240);
  pdf.rect(margin, y - 4, contentW, 7, 'F');
  
  pdf.text('Description', colX.description + 2, y);
  pdf.text('Qty', colX.qty, y);
  pdf.text('Unit Cost', colX.unitCost, y);
  pdf.text('Unit Price', colX.unitPrice, y);
  pdf.text('Total Cost', colX.costTotal, y);
  pdf.text('Total Price', colX.priceTotal, y);
  y += 8;

  // Line items
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);

  const lineItems = quote.lineItems || [];
  let costSubtotal = 0;
  let priceSubtotal = 0;
  let taxableCostSubtotal = 0;
  let taxablePriceSubtotal = 0;

  lineItems.forEach((item: any, index: number) => {
    // Check if we need a new page
    if (y > pageH - 40) {
      pdf.addPage();
      y = margin;
    }

    const quantity = parseFloat(item.quantity || '0');
    const unitCost = parseFloat(item.unitPrice || '0');
    const costTotal = quantity * unitCost;
    
    // Calculate price with markup/discount
    const priceTotal = calculateLineItemTotal(
      item.quantity,
      item.unitPrice,
      item.markupType,
      item.markupValue,
      item.discountType || 'percentage',
      item.discountValue || 0,
      quote.tariffRate || 0,
      item.isTariffApplicable || false
    );
    const unitPrice = quantity > 0 ? priceTotal / quantity : 0;
    
    costSubtotal += costTotal;
    priceSubtotal += priceTotal;
    
    if (item.isTaxable !== false) {
      taxableCostSubtotal += costTotal;
      taxablePriceSubtotal += priceTotal;
    }

    // Alternate row background
    if (index % 2 === 0) {
      pdf.setFillColor(250, 250, 250);
      pdf.rect(margin, y - 4, contentW, 6, 'F');
    }

    // Description (wrap if too long)
    const description = item.description || 'Unnamed Item';
    const maxDescWidth = contentW * 0.38;
    const descLines = pdf.splitTextToSize(description, maxDescWidth);
    
    pdf.text(descLines[0], colX.description + 2, y);
    pdf.text(quantity.toFixed(2), colX.qty, y);
    pdf.text(`$${unitCost.toFixed(2)}`, colX.unitCost, y);
    pdf.text(`$${unitPrice.toFixed(2)}`, colX.unitPrice, y);
    pdf.text(`$${costTotal.toFixed(2)}`, colX.costTotal, y);
    pdf.text(`$${priceTotal.toFixed(2)}`, colX.priceTotal, y);
    
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
  pdf.line(margin + contentW * 0.5, y, margin + contentW, y);
  y += 8;

  // Calculate totals
  const taxRate = parseFloat(quote.taxRate || '0');
  const shipping = parseFloat(quote.shipping || '0');
  
  // Only include shipping in taxable amount if it's taxable (default to false to match calculateQuoteTotals)
  const isShippingTaxable = quote.isShippingTaxable === true;
  const costTaxableAmount = taxableCostSubtotal + (isShippingTaxable ? shipping : 0);
  const priceTaxableAmount = taxablePriceSubtotal + (isShippingTaxable ? shipping : 0);
  const costTax = (costTaxableAmount * taxRate) / 100;
  const priceTax = (priceTaxableAmount * taxRate) / 100;
  const costTotal = costSubtotal + shipping + costTax;
  const priceTotal = priceSubtotal + shipping + priceTax;

  // Totals section - two columns for cost and price
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  
  const labelX = margin + contentW * 0.60;
  const costValuesX = margin + contentW * 0.78;
  const priceValuesX = margin + contentW * 0.90;

  // Column headers
  pdf.setFont('helvetica', 'bold');
  pdf.text('Cost', costValuesX, y);
  pdf.text('Price', priceValuesX, y);
  y += 6;
  pdf.setFont('helvetica', 'normal');

  pdf.text('Subtotal:', labelX, y);
  pdf.text(`$${costSubtotal.toFixed(2)}`, costValuesX, y);
  pdf.text(`$${priceSubtotal.toFixed(2)}`, priceValuesX, y);
  y += 6;

  if (shipping > 0) {
    pdf.text('Shipping:', labelX, y);
    pdf.text(`$${shipping.toFixed(2)}`, costValuesX, y);
    pdf.text(`$${shipping.toFixed(2)}`, priceValuesX, y);
    y += 6;
  }

  if (costTax > 0 || priceTax > 0) {
    pdf.text(`Tax (${taxRate}%):`, labelX, y);
    pdf.text(`$${costTax.toFixed(2)}`, costValuesX, y);
    pdf.text(`$${priceTax.toFixed(2)}`, priceValuesX, y);
    y += 6;
  }

  // Total
  y += 2;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.text('Total:', labelX, y);
  pdf.text(`$${costTotal.toFixed(2)}`, costValuesX, y);
  pdf.text(`$${priceTotal.toFixed(2)}`, priceValuesX, y);

  // Save
  const fileName = `${quote.quoteNumber || 'quote'}-costs.pdf`;
  pdf.save(fileName);
}
