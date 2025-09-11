import { formatCurrency, calculateQuoteTotals } from "@/lib/utils";
import type { QuoteWithDetails, ProposalTemplate, BrandingSettings, DefaultContent } from "@shared/schema";
import logoPath from "@assets/my-logo.png_1753970984943.jpg";

interface TechnicalSpecTemplateProps {
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

export function TechnicalSpecTemplate({ quote, template, companyInfo, quoteTerms }: TechnicalSpecTemplateProps) {
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

  return (
    <div className="bg-white text-black" style={{ fontFamily: 'system-ui, sans-serif', color: branding.textColor }}>
      {/* Technical Header */}
      <div className="flex justify-between items-start mb-8 border-b-2 pb-6" style={{ borderColor: branding.primaryColor }}>
        <div className="flex items-start space-x-4">
          <img src={logoPath} alt={companyInfo.name} className="h-8" />
          <div>
            <h1 className="text-2xl font-bold mb-1" style={{ color: branding.accentColor }}>
              TECHNICAL SPECIFICATIONS
            </h1>
            <div className="text-sm space-y-1">
              <div><strong>Project:</strong> {quote.projectName}</div>
              <div><strong>Location:</strong> {quote.projectAddress}</div>
              <div><strong>Contractor:</strong> {companyInfo.name} | {companyInfo.license}</div>
            </div>
          </div>
        </div>
        <div className="text-right text-sm">
          <div><strong>Spec #:</strong> {quote.quoteNumber}</div>
          <div><strong>Date:</strong> {new Date(quote.createdAt!).toLocaleDateString()}</div>
          <div><strong>Revision:</strong> 1.0</div>
        </div>
      </div>

      {/* Project Specifications */}
      <div className="mb-8">
        <h2 className="text-lg font-bold mb-4 border-b pb-2" style={{ color: branding.primaryColor, borderColor: branding.accentColor }}>
          1. PROJECT SPECIFICATIONS
        </h2>
        <div className="grid grid-cols-2 gap-6 text-sm">
          <div>
            <h3 className="font-semibold mb-2" style={{ color: branding.accentColor }}>Site Information</h3>
            <table className="w-full text-xs">
              <tbody>
                <tr><td className="py-1 font-medium">Address:</td><td>{quote.projectAddress}</td></tr>
                <tr><td className="py-1 font-medium">Project Type:</td><td>Outdoor Construction</td></tr>
                {quote.estimatedStartDate && (
                  <tr><td className="py-1 font-medium">Start Date:</td><td>{new Date(quote.estimatedStartDate).toLocaleDateString()}</td></tr>
                )}
                <tr><td className="py-1 font-medium">Duration:</td><td>2-4 weeks</td></tr>
              </tbody>
            </table>
          </div>
          <div>
            <h3 className="font-semibold mb-2" style={{ color: branding.accentColor }}>Contact Information</h3>
            <table className="w-full text-xs">
              <tbody>
                <tr><td className="py-1 font-medium">Client:</td><td>{companyInfo.customerName}</td></tr>
                <tr><td className="py-1 font-medium">Email:</td><td>{companyInfo.customerEmail}</td></tr>
                <tr><td className="py-1 font-medium">Phone:</td><td>{companyInfo.customerPhone}</td></tr>
                <tr><td className="py-1 font-medium">Contractor:</td><td>{companyInfo.phone}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
        
        {quote.notes && (
          <div className="mt-4 p-4 border border-gray-300 rounded">
            <h3 className="font-semibold mb-2 text-sm" style={{ color: branding.accentColor }}>Special Requirements</h3>
            <p className="text-xs whitespace-pre-wrap">{quote.notes}</p>
          </div>
        )}
      </div>

      {/* Materials & Components */}
      <div className="mb-8">
        <h2 className="text-lg font-bold mb-4 border-b pb-2" style={{ color: branding.primaryColor, borderColor: branding.accentColor }}>
          2. MATERIALS & COMPONENTS
        </h2>
        <table className="w-full border-collapse border border-gray-400 text-xs">
          <thead>
            <tr className="bg-gray-200">
              <th className="border border-gray-400 px-2 py-2 text-left">Item #</th>
              <th className="border border-gray-400 px-2 py-2 text-left">Component Description</th>
              <th className="border border-gray-400 px-2 py-2 text-center">Quantity</th>
              <th className="border border-gray-400 px-2 py-2 text-left">Specifications</th>
              <th className="border border-gray-400 px-2 py-2 text-right">Unit Cost</th>
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
                <tr key={index} className={index % 2 === 0 ? 'bg-gray-50' : ''}>
                  <td className="border border-gray-400 px-2 py-2 font-medium">{String(index + 1).padStart(3, '0')}</td>
                  <td className="border border-gray-400 px-2 py-2">{item.description}</td>
                  <td className="border border-gray-400 px-2 py-2 text-center">{item.quantity}</td>
                  <td className="border border-gray-400 px-2 py-2">Professional grade, code compliant</td>
                  <td className="border border-gray-400 px-2 py-2 text-right">{formatCurrency(rateWithMarkup)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Installation Details */}
      <div className="mb-8">
        <h2 className="text-lg font-bold mb-4 border-b pb-2" style={{ color: branding.primaryColor, borderColor: branding.accentColor }}>
          3. INSTALLATION DETAILS
        </h2>
        <div className="space-y-4 text-sm">
          <div>
            <h3 className="font-semibold mb-2" style={{ color: branding.accentColor }}>3.1 Preparation Work</h3>
            <ul className="list-disc list-inside space-y-1 text-xs ml-4">
              <li>Site survey and measurement verification</li>
              <li>Utility location and marking (811 call)</li>
              <li>Permit acquisition and approvals</li>
              <li>Site protection and safety setup</li>
            </ul>
          </div>
          
          <div>
            <h3 className="font-semibold mb-2" style={{ color: branding.accentColor }}>3.2 Construction Process</h3>
            <ul className="list-disc list-inside space-y-1 text-xs ml-4">
              <li>Excavation and foundation preparation per manufacturer specifications</li>
              <li>Structural assembly following engineering requirements</li>
              <li>Professional installation by certified technicians</li>
              <li>Quality control inspections at each phase</li>
            </ul>
          </div>
          
          <div>
            <h3 className="font-semibold mb-2" style={{ color: branding.accentColor }}>3.3 Finishing Work</h3>
            <ul className="list-disc list-inside space-y-1 text-xs ml-4">
              <li>Final assembly and adjustment</li>
              <li>Cleanup and site restoration</li>
              <li>Client walkthrough and operation training</li>
              <li>Documentation and warranty registration</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Code Compliance */}
      <div className="mb-8">
        <h2 className="text-lg font-bold mb-4 border-b pb-2" style={{ color: branding.primaryColor, borderColor: branding.accentColor }}>
          4. CODE COMPLIANCE & STANDARDS
        </h2>
        <div className="grid grid-cols-2 gap-6 text-sm">
          <div>
            <h3 className="font-semibold mb-2" style={{ color: branding.accentColor }}>Building Codes</h3>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>International Building Code (IBC) compliance</li>
              <li>Local municipal building requirements</li>
              <li>ADA accessibility standards (where applicable)</li>
              <li>Wind load and seismic considerations</li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold mb-2" style={{ color: branding.accentColor }}>Safety Standards</h3>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>OSHA safety protocols during installation</li>
              <li>Electrical work per NEC standards</li>
              <li>Structural engineering certifications</li>
              <li>Manufacturer warranty compliance</li>
            </ul>
          </div>
        </div>
        
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-300 rounded">
          <p className="text-xs"><strong>Note:</strong> All work will be performed in accordance with applicable codes and standards. Required permits will be obtained prior to construction.</p>
        </div>
      </div>

      {/* Detailed Line Items */}
      <div className="mb-8 page-break-avoid">
        <h2 className="text-lg font-bold mb-4 border-b pb-2" style={{ color: branding.primaryColor, borderColor: branding.accentColor }}>
          5. COST BREAKDOWN
        </h2>
        <table className="w-full border-collapse border border-gray-400 text-xs">
          <thead>
            <tr className="bg-gray-200">
              <th className="border border-gray-400 px-2 py-2 text-left">Category</th>
              <th className="border border-gray-400 px-2 py-2 text-left">Description</th>
              <th className="border border-gray-400 px-2 py-2 text-center">Qty</th>
              <th className="border border-gray-400 px-2 py-2 text-right">Unit Price</th>
              <th className="border border-gray-400 px-2 py-2 text-right">Total</th>
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
                <tr key={index} className={index % 2 === 0 ? 'bg-gray-50' : ''}>
                  <td className="border border-gray-400 px-2 py-2 font-medium">
                    {index < 3 ? 'Materials' : index < 6 ? 'Labor' : 'Hardware'}
                  </td>
                  <td className="border border-gray-400 px-2 py-2">{item.description}</td>
                  <td className="border border-gray-400 px-2 py-2 text-center">{item.quantity}</td>
                  <td className="border border-gray-400 px-2 py-2 text-right">{formatCurrency(rateWithMarkup)}</td>
                  <td className="border border-gray-400 px-2 py-2 text-right font-medium">
                    {formatCurrency(total)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-gray-100 font-medium">
              <td colSpan={4} className="border border-gray-400 px-2 py-2 text-right">Subtotal:</td>
              <td className="border border-gray-400 px-2 py-2 text-right">{formatCurrency(totals.subtotal)}</td>
            </tr>
            {totals.discountAmount > 0 && (
              <tr className="bg-gray-100">
                <td colSpan={4} className="border border-gray-400 px-2 py-2 text-right">Discount ({quote.discount}%):</td>
                <td className="border border-gray-400 px-2 py-2 text-right text-red-600">-{formatCurrency(totals.discountAmount)}</td>
              </tr>
            )}
            <tr className="bg-gray-100">
              <td colSpan={4} className="border border-gray-400 px-2 py-2 text-right">Tax ({quote.taxRate}%):</td>
              <td className="border border-gray-400 px-2 py-2 text-right">{formatCurrency(totals.taxAmount)}</td>
            </tr>
            <tr className="bg-gray-200 font-bold">
              <td colSpan={4} className="border border-gray-400 px-2 py-2 text-right">Total Project Cost:</td>
              <td className="border border-gray-400 px-2 py-2 text-right" style={{ color: branding.primaryColor }}>
                {formatCurrency(totals.total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Technical Notes */}
      <div className="mb-8">
        <h2 className="text-lg font-bold mb-4 border-b pb-2" style={{ color: branding.primaryColor, borderColor: branding.accentColor }}>
          6. TECHNICAL NOTES
        </h2>
        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold mb-2" style={{ color: branding.accentColor }}>Warranty Terms</h3>
              <div className="border border-gray-300 p-3 rounded">
                <p>{content.warranty}</p>
                <p className="mt-2">Manufacturer warranties apply to all materials per their standard terms.</p>
              </div>
            </div>
            <div>
              <h3 className="font-semibold mb-2" style={{ color: branding.accentColor }}>Important Conditions</h3>
              <div className="border border-gray-300 p-3 rounded">
                <p>{quoteTerms.additionalNotes}</p>
                <p className="mt-2">Weather delays may affect timeline. Client will be notified of any changes.</p>
              </div>
            </div>
          </div>
          
          <div>
            <h3 className="font-semibold mb-2" style={{ color: branding.accentColor }}>Scope Exclusions</h3>
            <div className="border border-gray-300 p-3 rounded">
              <ul className="list-disc list-inside space-y-1">
                <li>Utility connections beyond 50 feet from main structure</li>
                <li>Landscape restoration beyond immediate work area</li>
                <li>Unforeseen underground utilities or obstructions</li>
                <li>Changes in local code requirements after permit approval</li>
                <li>Additional permits for modifications outside original scope</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t-2 pt-4 text-center text-xs" style={{ borderColor: branding.primaryColor }}>
        <div className="flex justify-between items-center">
          <div>
            <strong>{companyInfo.name}</strong> | {companyInfo.license}
          </div>
          <div>
            Technical Specifications v1.0 | Page 1 of 1
          </div>
          <div>
            {companyInfo.phone} | {companyInfo.email}
          </div>
        </div>
      </div>
    </div>
  );
}