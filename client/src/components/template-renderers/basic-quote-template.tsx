import { formatCurrency, calculateQuoteTotals } from "@/lib/utils";
import type { QuoteWithDetails, ProposalTemplate, BrandingSettings, DefaultContent } from "@shared/schema";
import logoPath from "@assets/my-logo.png_1753970984943.jpg";
import { 
  ProfessionalImage,
  getBestImage,
  getCompanyLogo 
} from "@/components/image-components";

interface BasicQuoteTemplateProps {
  quote: QuoteWithDetails;
  template: ProposalTemplate;
  companyInfo: {
    name: string;
    address: string;
    phone: string;
    email: string;
    license: string;
    customerName: string;
    customerCompany: string;
    customerEmail: string;
    customerPhone: string;
  };
  quoteTerms: {
    validFor: string;
    paymentTerms: string;
    warranty: string;
    additionalNotes: string;
  };
}

export function BasicQuoteTemplate({ quote, template, companyInfo, quoteTerms }: BasicQuoteTemplateProps) {
  const branding = template.brandingSettings as BrandingSettings;
  const content = template.defaultContent as DefaultContent;
  
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

  // Extract and organize images from quote data
  const projectImages = quote.projectImages ? JSON.parse(JSON.stringify(quote.projectImages)) : [];
  const portfolioImages = quote.portfolioImages ? JSON.parse(JSON.stringify(quote.portfolioImages)) : [];
  const companyImages = quote.companyImages ? JSON.parse(JSON.stringify(quote.companyImages)) : [];
  
  // Get best images for simple display
  const keyProjectImage = getBestImage([...projectImages, ...portfolioImages], ['featured', 'before', 'after']);
  const companyLogo = getCompanyLogo(companyImages);

  return (
    <div className="bg-white text-black" style={{ fontFamily: 'system-ui, sans-serif' }}>
      {/* Simple Header */}
      <div className="flex justify-between items-start mb-8 border-b-2 pb-6" style={{ borderColor: branding.primaryColor }}>
        <div className="flex items-start space-x-4">
          {/* Use company logo if available, fallback to asset logo */}
          {companyLogo ? (
            <img 
              src={companyLogo.url} 
              alt={companyLogo.altText || companyInfo.name}
              className="h-10 w-auto object-contain" 
            />
          ) : (
            <img src={logoPath} alt={companyInfo.name} className="h-10" />
          )}
          <div>
            <h1 className="text-2xl font-bold mb-1" style={{ color: branding.accentColor }}>
              {companyInfo.name}
            </h1>
            <div className="text-sm text-gray-600 space-y-1">
              <div>{companyInfo.address}</div>
              <div>Phone: {companyInfo.phone} | Email: {companyInfo.email}</div>
              <div>{companyInfo.license}</div>
            </div>
          </div>
        </div>
        <div className="text-right">
          <h2 className="text-xl font-bold mb-2" style={{ color: branding.accentColor }}>QUOTE</h2>
          <div className="text-sm space-y-1">
            <div><strong>Quote #:</strong> {quote.quoteNumber}</div>
            <div><strong>Date:</strong> {new Date(quote.createdAt!).toLocaleDateString()}</div>
            <div><strong>Valid For:</strong> {quoteTerms.validFor}</div>
          </div>
        </div>
      </div>

      {/* Customer & Project Info */}
      <div className="grid grid-cols-2 gap-8 mb-8">
        <div>
          <h3 className="text-base font-semibold mb-3" style={{ color: branding.accentColor }}>Bill To:</h3>
          <div className="space-y-1 text-sm">
            <div className="font-medium">{companyInfo.customerName}</div>
            {companyInfo.customerCompany && (
              <div className="text-gray-600">{companyInfo.customerCompany}</div>
            )}
            <div>{companyInfo.customerEmail}</div>
            {companyInfo.customerPhone && <div>{companyInfo.customerPhone}</div>}
          </div>
        </div>
        <div>
          <h3 className="text-base font-semibold mb-3" style={{ color: branding.accentColor }}>Project:</h3>
          <div className="space-y-1 text-sm">
            <div><strong>Name:</strong> {quote.projectName}</div>
            <div><strong>Location:</strong> {quote.projectAddress}</div>
            {quote.estimatedStartDate && (
              <div><strong>Est. Start:</strong> {new Date(quote.estimatedStartDate).toLocaleDateString()}</div>
            )}
          </div>
        </div>
      </div>
      
      {/* Optional Project Visual - Clean and Simple */}
      {keyProjectImage && (
        <div className="mb-8 text-center">
          <ProfessionalImage 
            src={keyProjectImage.url}
            alt={keyProjectImage.altText || quote.projectName || 'Project visualization'}
            caption={keyProjectImage.caption}
            className="rounded-lg shadow-sm border border-gray-200"
            style={{ maxHeight: '200px', maxWidth: '400px', margin: '0 auto' }}
          />
        </div>
      )}

      {/* Line Items Table */}
      <div className="mb-6">
        <table className="w-full border-collapse border border-gray-300 text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th className="border border-gray-300 px-3 py-2 text-left">Description</th>
              <th className="border border-gray-300 px-3 py-2 text-center">Qty</th>
              <th className="border border-gray-300 px-3 py-2 text-right">Rate</th>
              <th className="border border-gray-300 px-3 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {quote.lineItems.map((item, index) => {
              const qty = parseFloat(item.quantity.toString());
              const price = parseFloat(item.unitPrice.toString());
              const markup = parseFloat(item.markupValue.toString());
              const baseTotal = qty * price;
              const total = item.markupType === 'percentage' 
                ? baseTotal + (baseTotal * (markup / 100))
                : baseTotal + markup;
              const rateWithMarkup = total / qty;

              return (
                <tr key={index}>
                  <td className="border border-gray-300 px-3 py-2">{item.description}</td>
                  <td className="border border-gray-300 px-3 py-2 text-center">{item.quantity}</td>
                  <td className="border border-gray-300 px-3 py-2 text-right">{formatCurrency(rateWithMarkup)}</td>
                  <td className="border border-gray-300 px-3 py-2 text-right font-medium">
                    {formatCurrency(total)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="flex justify-end mb-8">
        <div className="w-64">
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>{formatCurrency(totals.subtotal)}</span>
            </div>
            {totals.discountAmount > 0 && (
              <div className="flex justify-between text-red-600">
                <span>Discount ({quote.discount}%):</span>
                <span>-{formatCurrency(totals.discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Tax ({quote.taxRate}%):</span>
              <span>{formatCurrency(totals.taxAmount)}</span>
            </div>
            <div className="border-t border-gray-300 pt-1">
              <div className="flex justify-between text-base font-bold" style={{ color: branding.accentColor }}>
                <span>Total:</span>
                <span>{formatCurrency(totals.total)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Terms */}
      <div className="space-y-4 text-sm">
        {quote.notes && (
          <div>
            <h3 className="font-semibold mb-2" style={{ color: branding.accentColor }}>Notes:</h3>
            <p className="whitespace-pre-wrap">{quote.notes}</p>
          </div>
        )}
        
        <div>
          <h3 className="font-semibold mb-2" style={{ color: branding.accentColor }}>Terms & Conditions:</h3>
          <div className="space-y-1">
            <div><strong>Payment:</strong> {quoteTerms.paymentTerms}</div>
            <div><strong>Warranty:</strong> {quoteTerms.warranty}</div>
            <div><strong>Additional:</strong> {quoteTerms.additionalNotes}</div>
          </div>
        </div>
      </div>
    </div>
  );
}