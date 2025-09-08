import type { QuoteWithDetails } from '@shared/schema';
import { formatCurrency, calculateQuoteTotals } from '../client/src/lib/utils';

// Simple PDF content generator that creates HTML that can be converted to PDF
export function generateQuotePDFContent(quote: QuoteWithDetails): string {
  const companyInfo = {
    name: "EDG Patio & Shade",
    address: "123 Patio Drive, Shade City, SC 12345",
    phone: "(555) 123-4567",
    email: "info@edgpatioandshade.com",
    license: "License #SC-12345",
  };

  const terms = {
    validFor: "30 days",
    paymentTerms: "50% deposit, 50% on completion",
    warranty: "1 year limited warranty on workmanship",
    additionalNotes: "Materials subject to availability. Permit costs not included.",
  };

  const totals = calculateQuoteTotals(
    quote.lineItems.map(item => ({
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      markupType: item.markupType,
      markupValue: item.markupValue,
    })),
    quote.taxRate ?? 0,
    quote.discount ?? 0
  );

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Quote-${quote.quoteNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.4;
      color: #000;
      background: white;
      padding: 30px;
    }
    
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 30px;
      border-bottom: 2px solid #0F766E;
      padding-bottom: 15px;
    }
    
    .company-info h1 {
      font-size: 24px;
      color: #0F766E;
      margin-bottom: 10px;
    }
    
    .company-info p {
      margin: 3px 0;
    }
    
    .quote-info {
      text-align: right;
    }
    
    .quote-info h2 {
      font-size: 20px;
      margin-bottom: 10px;
    }
    
    .title {
      text-align: center;
      font-size: 28px;
      font-weight: bold;
      margin: 30px 0;
      color: #0F766E;
    }
    
    .customer-section {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
      margin-bottom: 30px;
    }
    
    .section-title {
      font-size: 16px;
      font-weight: bold;
      color: #0F766E;
      margin-bottom: 10px;
      border-bottom: 1px solid #E5E7EB;
      padding-bottom: 5px;
    }
    
    .customer-info p, .project-info p {
      margin: 5px 0;
    }
    
    .line-items-table {
      width: 100%;
      border-collapse: collapse;
      margin: 30px 0;
    }
    
    .line-items-table th,
    .line-items-table td {
      border: 1px solid #E5E7EB;
      padding: 12px;
      text-align: left;
    }
    
    .line-items-table th {
      background-color: #F0F9FF;
      font-weight: bold;
      color: #0F766E;
    }
    
    .line-items-table td:nth-child(2),
    .line-items-table td:nth-child(4),
    .line-items-table td:nth-child(5) {
      text-align: right;
    }
    
    .totals-section {
      display: flex;
      justify-content: flex-end;
      margin: 30px 0;
    }
    
    .totals-table {
      width: 300px;
    }
    
    .totals-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #F3F4F6;
    }
    
    .totals-final {
      display: flex;
      justify-content: space-between;
      padding: 12px 0;
      border-top: 2px solid #000;
      font-weight: bold;
      font-size: 16px;
    }
    
    .terms-section {
      margin-top: 40px;
      border-top: 2px solid #E5E7EB;
      padding-top: 20px;
    }
    
    .terms-section h3 {
      color: #0F766E;
      margin-bottom: 15px;
    }
    
    .terms-section p {
      margin: 10px 0;
      line-height: 1.6;
    }
    
    .terms-label {
      font-weight: bold;
    }
    
    .footer-note {
      margin-top: 20px;
      font-size: 12px;
      color: #666;
      font-style: italic;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="company-info">
      <h1>${companyInfo.name}</h1>
      <p>${companyInfo.address}</p>
      <p>${companyInfo.phone}</p>
      <p>${companyInfo.email}</p>
      <p>${companyInfo.license}</p>
    </div>
    <div class="quote-info">
      <h2>QUOTE</h2>
      <p><strong>#${quote.quoteNumber}</strong></p>
      <p>Date: ${new Date(quote.createdAt).toLocaleDateString()}</p>
    </div>
  </div>

  <h2 class="title">Project Estimate</h2>

  <div class="customer-section">
    <div class="customer-info">
      <h3 class="section-title">Bill To:</h3>
      <p><strong>${quote.customer.name}</strong></p>
      ${quote.customer.company ? `<p>${quote.customer.company}</p>` : ''}
      <p>${quote.customer.email}</p>
      <p>${quote.customer.phone}</p>
    </div>
    <div class="project-info">
      <h3 class="section-title">Project Details:</h3>
      <p><strong>Project:</strong> ${quote.projectName}</p>
      <p><strong>Location:</strong> ${quote.projectAddress}</p>
      ${quote.projectDescription ? `<p><strong>Description:</strong> ${quote.projectDescription}</p>` : ''}
    </div>
  </div>

  <table class="line-items-table">
    <thead>
      <tr>
        <th>Description</th>
        <th>Qty</th>
        <th>Unit</th>
        <th>Rate</th>
        <th>Total</th>
      </tr>
    </thead>
    <tbody>
      ${quote.lineItems.map(item => {
        const lineTotal = item.quantity * item.unitPrice;
        return `
          <tr>
            <td>${item.description}</td>
            <td>${item.quantity}</td>
            <td>${item.unit || 'ea'}</td>
            <td>${formatCurrency(item.unitPrice)}</td>
            <td>${formatCurrency(lineTotal)}</td>
          </tr>
        `;
      }).join('')}
    </tbody>
  </table>

  <div class="totals-section">
    <div class="totals-table">
      <div class="totals-row">
        <span>Subtotal:</span>
        <span>${formatCurrency(totals.subtotal)}</span>
      </div>
      
      ${quote.discount && quote.discount > 0 ? `
        <div class="totals-row">
          <span>Discount:</span>
          <span>-${formatCurrency(totals.discount)}</span>
        </div>
      ` : ''}
      
      ${quote.taxRate && quote.taxRate > 0 ? `
        <div class="totals-row">
          <span>Tax (${(quote.taxRate * 100).toFixed(1)}%):</span>
          <span>${formatCurrency(totals.tax)}</span>
        </div>
      ` : ''}
      
      <div class="totals-final">
        <span>Total:</span>
        <span>${formatCurrency(totals.total)}</span>
      </div>
    </div>
  </div>

  <div class="terms-section">
    <h3>Terms & Conditions</h3>
    <p><span class="terms-label">Valid For:</span> ${terms.validFor}</p>
    <p><span class="terms-label">Payment Terms:</span> ${terms.paymentTerms}</p>
    <p><span class="terms-label">Warranty:</span> ${terms.warranty}</p>
    ${terms.additionalNotes ? `<p><span class="terms-label">Additional Notes:</span> ${terms.additionalNotes}</p>` : ''}
    
    <p class="footer-note">
      This quote is subject to our standard terms and conditions. 
      All work will be performed in a professional manner in accordance with industry standards.
    </p>
  </div>
</body>
</html>
  `;
}

// For now, we'll return a placeholder base64 string
// In a production environment, you would use a library like Puppeteer to convert HTML to PDF
export async function generateQuotePDF(quote: QuoteWithDetails): Promise<string> {
  try {
    const htmlContent = generateQuotePDFContent(quote);
    
    // For now, we'll create a simple base64 encoded string of the HTML content
    // This is a placeholder - in production, you'd want to use Puppeteer or similar
    // to convert the HTML to actual PDF binary content
    const base64Content = Buffer.from(htmlContent, 'utf-8').toString('base64');
    
    // This is not a real PDF - it's HTML encoded as base64
    // For DocuSign to work properly, you'd need actual PDF binary content
    return base64Content;
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw new Error('Failed to generate PDF: ' + (error as Error).message);
  }
}