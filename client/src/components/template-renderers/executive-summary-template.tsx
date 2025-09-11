import { formatCurrency, calculateQuoteTotals } from "@/lib/utils";
import type { QuoteWithDetails, ProposalTemplate, BrandingSettings, DefaultContent } from "@shared/schema";
import logoPath from "@assets/my-logo.png_1753970984943.jpg";

interface ExecutiveSummaryTemplateProps {
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

export function ExecutiveSummaryTemplate({ quote, template, companyInfo, quoteTerms }: ExecutiveSummaryTemplateProps) {
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
      {/* Executive Header */}
      <div className="text-center mb-10 border-b-4 pb-8" style={{ borderColor: branding.primaryColor }}>
        <img src={logoPath} alt={companyInfo.name} className="mx-auto h-14 mb-6" />
        <h1 className="text-3xl font-bold mb-2" style={{ color: branding.primaryColor }}>
          EXECUTIVE SUMMARY
        </h1>
        <div className="text-xl mb-4" style={{ color: branding.accentColor }}>
          {quote.projectName}
        </div>
        <div className="flex justify-center space-x-8 text-sm">
          <div>
            <span className="font-medium">Prepared for:</span> {companyInfo.customerName}
          </div>
          <div>
            <span className="font-medium">Date:</span> {new Date(quote.createdAt!).toLocaleDateString()}
          </div>
          <div>
            <span className="font-medium">Proposal #:</span> {quote.quoteNumber}
          </div>
        </div>
      </div>

      {/* Project Overview */}
      <div className="mb-10">
        <h2 className="text-2xl font-bold mb-6 pb-2 border-b-2" style={{ color: branding.primaryColor, borderColor: branding.accentColor }}>
          Project Overview
        </h2>
        <div className="bg-gray-50 p-6 rounded-lg mb-6">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold text-lg mb-3" style={{ color: branding.accentColor }}>Project Details</h3>
              <div className="space-y-2 text-sm">
                <div><strong>Location:</strong> {quote.projectAddress}</div>
                {quote.estimatedStartDate && (
                  <div><strong>Start Date:</strong> {new Date(quote.estimatedStartDate).toLocaleDateString()}</div>
                )}
                <div><strong>Duration:</strong> {content.timeline}</div>
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-lg mb-3" style={{ color: branding.accentColor }}>Key Deliverables</h3>
              <ul className="text-sm space-y-1">
                {quote.lineItems.slice(0, 4).map((item, index) => (
                  <li key={index} className="flex items-start">
                    <span className="w-2 h-2 rounded-full mt-1.5 mr-2 flex-shrink-0" 
                          style={{ backgroundColor: branding.primaryColor }}></span>
                    {item.description}
                  </li>
                ))}
                {quote.lineItems.length > 4 && (
                  <li className="text-gray-600 italic">+ {quote.lineItems.length - 4} additional components</li>
                )}
              </ul>
            </div>
          </div>
        </div>
        
        <div className="leading-relaxed">
          <p className="mb-4">{content.projectScope}</p>
          {quote.notes && (
            <div className="bg-blue-50 p-4 rounded border-l-4" style={{ borderColor: branding.primaryColor }}>
              <h4 className="font-semibold mb-2" style={{ color: branding.accentColor }}>Specific Requirements:</h4>
              <p className="text-sm whitespace-pre-wrap">{quote.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Investment Summary */}
      <div className="mb-10">
        <h2 className="text-2xl font-bold mb-6 pb-2 border-b-2" style={{ color: branding.primaryColor, borderColor: branding.accentColor }}>
          Investment Summary
        </h2>
        <div className="bg-gray-100 p-8 rounded-lg">
          <div className="text-center mb-6">
            <div className="text-4xl font-bold mb-2" style={{ color: branding.primaryColor }}>
              {formatCurrency(totals.total)}
            </div>
            <div className="text-lg text-gray-600">Total Project Investment</div>
          </div>
          
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="p-4 bg-white rounded">
              <div className="text-xl font-bold" style={{ color: branding.accentColor }}>
                {formatCurrency(totals.subtotal)}
              </div>
              <div className="text-sm text-gray-600">Materials & Labor</div>
            </div>
            <div className="p-4 bg-white rounded">
              <div className="text-xl font-bold" style={{ color: branding.accentColor }}>
                {formatCurrency(totals.taxAmount)}
              </div>
              <div className="text-sm text-gray-600">Tax ({quote.taxRate}%)</div>
            </div>
            <div className="p-4 bg-white rounded">
              <div className="text-xl font-bold" style={{ color: branding.primaryColor }}>
                {quote.lineItems.length}
              </div>
              <div className="text-sm text-gray-600">Project Components</div>
            </div>
          </div>
          
          {totals.discountAmount > 0 && (
            <div className="mt-4 text-center">
              <div className="inline-flex items-center px-4 py-2 bg-green-100 rounded-full">
                <span className="text-green-800 font-medium">
                  You Save: {formatCurrency(totals.discountAmount)} ({quote.discount}% discount applied)
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Value Proposition */}
      <div className="mb-10">
        <h2 className="text-2xl font-bold mb-6 pb-2 border-b-2" style={{ color: branding.primaryColor, borderColor: branding.accentColor }}>
          Value Proposition
        </h2>
        <div className="grid grid-cols-2 gap-8">
          <div>
            <h3 className="text-lg font-semibold mb-4" style={{ color: branding.accentColor }}>Why {companyInfo.name}?</h3>
            <ul className="space-y-3">
              <li className="flex items-start">
                <div className="w-6 h-6 rounded-full flex items-center justify-center mr-3 mt-0.5" 
                     style={{ backgroundColor: branding.primaryColor }}>
                  <span className="text-white text-xs font-bold">✓</span>
                </div>
                <span className="text-sm">Licensed, bonded, and fully insured contractor</span>
              </li>
              <li className="flex items-start">
                <div className="w-6 h-6 rounded-full flex items-center justify-center mr-3 mt-0.5" 
                     style={{ backgroundColor: branding.primaryColor }}>
                  <span className="text-white text-xs font-bold">✓</span>
                </div>
                <span className="text-sm">{content.warranty}</span>
              </li>
              <li className="flex items-start">
                <div className="w-6 h-6 rounded-full flex items-center justify-center mr-3 mt-0.5" 
                     style={{ backgroundColor: branding.primaryColor }}>
                  <span className="text-white text-xs font-bold">✓</span>
                </div>
                <span className="text-sm">Professional project management and communication</span>
              </li>
              <li className="flex items-start">
                <div className="w-6 h-6 rounded-full flex items-center justify-center mr-3 mt-0.5" 
                     style={{ backgroundColor: branding.primaryColor }}>
                  <span className="text-white text-xs font-bold">✓</span>
                </div>
                <span className="text-sm">Premium materials and expert craftsmanship</span>
              </li>
            </ul>
          </div>
          
          <div>
            <h3 className="text-lg font-semibold mb-4" style={{ color: branding.accentColor }}>Project Benefits</h3>
            <ul className="space-y-3">
              <li className="flex items-start">
                <div className="w-6 h-6 rounded-full flex items-center justify-center mr-3 mt-0.5" 
                     style={{ backgroundColor: branding.accentColor }}>
                  <span className="text-white text-xs font-bold">$</span>
                </div>
                <span className="text-sm">Increased property value and curb appeal</span>
              </li>
              <li className="flex items-start">
                <div className="w-6 h-6 rounded-full flex items-center justify-center mr-3 mt-0.5" 
                     style={{ backgroundColor: branding.accentColor }}>
                  <span className="text-white text-xs font-bold">★</span>
                </div>
                <span className="text-sm">Enhanced outdoor living experience</span>
              </li>
              <li className="flex items-start">
                <div className="w-6 h-6 rounded-full flex items-center justify-center mr-3 mt-0.5" 
                     style={{ backgroundColor: branding.accentColor }}>
                  <span className="text-white text-xs font-bold">⏱</span>
                </div>
                <span className="text-sm">Streamlined timeline with minimal disruption</span>
              </li>
              <li className="flex items-start">
                <div className="w-6 h-6 rounded-full flex items-center justify-center mr-3 mt-0.5" 
                     style={{ backgroundColor: branding.accentColor }}>
                  <span className="text-white text-xs font-bold">🛡</span>
                </div>
                <span className="text-sm">Long-term durability and low maintenance</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Timeline Summary */}
      <div className="mb-10">
        <h2 className="text-2xl font-bold mb-6 pb-2 border-b-2" style={{ color: branding.primaryColor, borderColor: branding.accentColor }}>
          Project Timeline
        </h2>
        <div className="relative">
          <div className="flex justify-between items-center">
            <div className="flex flex-col items-center text-center flex-1">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold mb-2" 
                   style={{ backgroundColor: branding.primaryColor }}>
                1
              </div>
              <div className="text-sm font-medium mb-1">Contract Signing</div>
              <div className="text-xs text-gray-600">Day 1</div>
            </div>
            
            <div className="flex-1 h-px" style={{ backgroundColor: branding.accentColor }}></div>
            
            <div className="flex flex-col items-center text-center flex-1">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold mb-2" 
                   style={{ backgroundColor: branding.primaryColor }}>
                2
              </div>
              <div className="text-sm font-medium mb-1">Project Start</div>
              <div className="text-xs text-gray-600">Week 1</div>
            </div>
            
            <div className="flex-1 h-px" style={{ backgroundColor: branding.accentColor }}></div>
            
            <div className="flex flex-col items-center text-center flex-1">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold mb-2" 
                   style={{ backgroundColor: branding.primaryColor }}>
                3
              </div>
              <div className="text-sm font-medium mb-1">Construction</div>
              <div className="text-xs text-gray-600">Week 2-3</div>
            </div>
            
            <div className="flex-1 h-px" style={{ backgroundColor: branding.accentColor }}></div>
            
            <div className="flex flex-col items-center text-center flex-1">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold mb-2" 
                   style={{ backgroundColor: branding.primaryColor }}>
                4
              </div>
              <div className="text-sm font-medium mb-1">Completion</div>
              <div className="text-xs text-gray-600">Week 4</div>
            </div>
          </div>
        </div>
        
        <div className="mt-6 bg-blue-50 p-4 rounded border-l-4" style={{ borderColor: branding.primaryColor }}>
          <p className="text-sm"><strong>Timeline Note:</strong> {content.timeline}</p>
        </div>
      </div>

      {/* Next Steps */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-6 pb-2 border-b-2" style={{ color: branding.primaryColor, borderColor: branding.accentColor }}>
          Next Steps
        </h2>
        <div className="bg-gray-50 p-8 rounded-lg">
          <div className="text-center mb-6">
            <h3 className="text-xl font-bold mb-2" style={{ color: branding.primaryColor }}>Ready to Begin?</h3>
            <p className="text-gray-600">This proposal is valid for {quoteTerms.validFor}</p>
          </div>
          
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h4 className="font-semibold mb-3" style={{ color: branding.accentColor }}>Approval Process</h4>
              <ol className="space-y-2 text-sm">
                <li className="flex items-center">
                  <span className="w-6 h-6 rounded-full flex items-center justify-center mr-3 text-xs font-bold text-white" 
                        style={{ backgroundColor: branding.primaryColor }}>1</span>
                  Review and approve this proposal
                </li>
                <li className="flex items-center">
                  <span className="w-6 h-6 rounded-full flex items-center justify-center mr-3 text-xs font-bold text-white" 
                        style={{ backgroundColor: branding.primaryColor }}>2</span>
                  Sign the service agreement
                </li>
                <li className="flex items-center">
                  <span className="w-6 h-6 rounded-full flex items-center justify-center mr-3 text-xs font-bold text-white" 
                        style={{ backgroundColor: branding.primaryColor }}>3</span>
                  Submit initial payment
                </li>
                <li className="flex items-center">
                  <span className="w-6 h-6 rounded-full flex items-center justify-center mr-3 text-xs font-bold text-white" 
                        style={{ backgroundColor: branding.primaryColor }}>4</span>
                  Project begins as scheduled
                </li>
              </ol>
            </div>
            
            <div>
              <h4 className="font-semibold mb-3" style={{ color: branding.accentColor }}>Payment Terms</h4>
              <div className="bg-white p-4 rounded border">
                <p className="text-sm mb-2"><strong>Schedule:</strong> {content.paymentTerms}</p>
                <p className="text-sm"><strong>Methods:</strong> Check, ACH, or credit card accepted</p>
              </div>
              
              <div className="mt-4">
                <h5 className="font-medium mb-2">Contact Information</h5>
                <div className="text-sm space-y-1">
                  <div><strong>Phone:</strong> {companyInfo.phone}</div>
                  <div><strong>Email:</strong> {companyInfo.email}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}