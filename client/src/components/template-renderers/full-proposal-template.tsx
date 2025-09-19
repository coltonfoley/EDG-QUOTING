import { formatCurrency, calculateQuoteTotals } from "@/lib/utils";
import type { QuoteWithDetails, ProposalTemplate, BrandingSettings, DefaultContent, PortfolioImage, CompanyImage } from "@shared/schema";
import logoPath from "@assets/my-logo.png_1753970984943.jpg";
import { 
  HeroImage, 
  ImageGrid, 
  TechnicalDiagramDisplay, 
  CompanyImageDisplay, 
  ProfessionalImage,
  getBestImage,
  getCompanyLogo 
} from "@/components/image-components";

interface FullProposalTemplateProps {
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

export function FullProposalTemplate({ quote, template, companyInfo, quoteTerms }: FullProposalTemplateProps) {
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
  const projectImages: any[] = []; // Project images removed
  const portfolioImages = quote.portfolioImages ? JSON.parse(JSON.stringify(quote.portfolioImages)) : [];
  const technicalDiagrams = quote.technicalDiagrams ? JSON.parse(JSON.stringify(quote.technicalDiagrams)) : [];
  const companyImages = quote.companyImages ? JSON.parse(JSON.stringify(quote.companyImages)) : [];
  
  // Get best images for different purposes
  const heroImage = getBestImage([...portfolioImages], ['featured', 'before', 'after']);
  const companyLogo = getCompanyLogo(companyImages);

  return (
    <div className="bg-white text-black" style={{ fontFamily: 'system-ui, sans-serif', color: branding.textColor }}>
      {/* Cover Page */}
      <div className="text-center mb-12 page-break-after">
        {/* Hero Image Section */}
        {heroImage && (
          <div className="mb-8">
            <HeroImage 
              image={heroImage}
              title={quote.projectName || undefined}
              subtitle={`Proposal for ${companyInfo.customerName}`}
              overlay={true}
              height="400px"
            />
          </div>
        )}
        
        <div className="mb-8">
          {/* Use company logo if available, fallback to asset logo */}
          {companyLogo ? (
            <CompanyImageDisplay 
              images={companyImages}
              type="logo"
              layout="inline"
            />
          ) : (
            <img src={logoPath} alt={companyInfo.name} className="mx-auto h-16 mb-6" />
          )}
          <h1 className="text-4xl font-bold mb-4" style={{ color: branding.primaryColor }}>
            PROJECT PROPOSAL
          </h1>
          <div className="text-xl mb-6" style={{ color: branding.accentColor }}>
            {quote.projectName}
          </div>
        </div>
        
        <div className="border-t-2 border-b-2 py-8 mb-8" style={{ borderColor: branding.primaryColor }}>
          <div className="text-lg mb-2">Prepared for:</div>
          <div className="text-2xl font-bold mb-1" style={{ color: branding.accentColor }}>
            {companyInfo.customerName}
          </div>
          {companyInfo.customerCompany && (
            <div className="text-lg text-gray-600">{companyInfo.customerCompany}</div>
          )}
        </div>
        
        <div>
          <div className="text-lg mb-2">Prepared by:</div>
          <div className="text-xl font-bold mb-2" style={{ color: branding.accentColor }}>
            {companyInfo.name}
          </div>
          <div className="text-sm space-y-1">
            <div>{companyInfo.address}</div>
            <div>Phone: {companyInfo.phone} | Email: {companyInfo.email}</div>
            <div>{companyInfo.license}</div>
          </div>
        </div>
        
        <div className="mt-12">
          <div className="text-lg">Date: {new Date(quote.createdAt!).toLocaleDateString()}</div>
          <div className="text-lg">Proposal #: {quote.quoteNumber}</div>
        </div>
      </div>

      {/* Executive Summary */}
      <div className="mb-8 page-break-before">
        <h2 className="text-2xl font-bold mb-4 border-b-2 pb-2" style={{ color: branding.primaryColor, borderColor: branding.primaryColor }}>
          Executive Summary
        </h2>
        <div className="space-y-4 leading-relaxed">
          <p>
            We are pleased to present this comprehensive proposal for your {quote.projectName} project. 
            {content.companyDescription}
          </p>
          <p>
            <strong>Project Investment:</strong> {formatCurrency(totals.total)}
          </p>
          <p>
            <strong>Timeline:</strong> {(quote.estimatedStartDate && `Project start date: ${quote.estimatedStartDate}`) || content.timeline}
          </p>
          <p>
            This proposal outlines our approach, timeline, and investment required to deliver exceptional results 
            that exceed your expectations while providing long-term value for your property.
          </p>
        </div>
      </div>

      {/* Project Scope & Overview */}
      <div className="mb-8 page-break-before">
        <h2 className="text-2xl font-bold mb-4 border-b-2 pb-2" style={{ color: branding.primaryColor, borderColor: branding.primaryColor }}>
          Project Scope & Overview
        </h2>
        <div className="space-y-4 leading-relaxed">
          <div>
            <h3 className="text-lg font-semibold mb-2" style={{ color: branding.accentColor }}>Project Location</h3>
            <p>{quote.projectAddress}</p>
          </div>
          
          <div>
            <h3 className="text-lg font-semibold mb-2" style={{ color: branding.accentColor }}>Project Description</h3>
            <div className="whitespace-pre-wrap">{content.projectScope}</div>
            {quote.notes && (
              <div className="mt-3">
                <p><strong>Additional Requirements:</strong></p>
                <p className="whitespace-pre-wrap">{quote.notes}</p>
              </div>
            )}
          </div>

          {/* Project Images Section */}
          {/* Project visuals section removed with projects module */}

          <div>
            <h3 className="text-lg font-semibold mb-2" style={{ color: branding.accentColor }}>Deliverables Include:</h3>
            <ul className="list-disc list-inside space-y-1">
              {quote.lineItems.slice(0, 5).map((item, index) => (
                <li key={index}>{item.description}</li>
              ))}
              {quote.lineItems.length > 5 && (
                <li><em>And {quote.lineItems.length - 5} additional components (detailed in line items section)</em></li>
              )}
            </ul>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-4 border-b-2 pb-2" style={{ color: branding.primaryColor, borderColor: branding.primaryColor }}>
          Project Timeline
        </h2>
        <div className="space-y-4">
          {/* Technical Diagrams for Timeline Visualization */}
          {technicalDiagrams.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-4" style={{ color: branding.accentColor }}>Project Plans & Specifications</h3>
              <TechnicalDiagramDisplay 
                diagrams={technicalDiagrams} 
                layout={"grid"}
                showLabels={true}
              />
            </div>
          )}
          
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 border rounded" style={{ borderColor: branding.primaryColor }}>
              <div className="font-bold text-lg mb-2" style={{ color: branding.primaryColor }}>Week 1</div>
              <div className="text-sm">Permits & Site Preparation</div>
            </div>
            <div className="text-center p-4 border rounded" style={{ borderColor: branding.primaryColor }}>
              <div className="font-bold text-lg mb-2" style={{ color: branding.primaryColor }}>Week 2-3</div>
              <div className="text-sm">Construction & Installation</div>
            </div>
            <div className="text-center p-4 border rounded" style={{ borderColor: branding.primaryColor }}>
              <div className="font-bold text-lg mb-2" style={{ color: branding.primaryColor }}>Week 4</div>
              <div className="text-sm">Final Inspection & Completion</div>
            </div>
          </div>
          
          {quote.estimatedStartDate && (
            <div className="mt-4">
              <p><strong>Estimated Start Date:</strong> {new Date(quote.estimatedStartDate).toLocaleDateString()}</p>
            </div>
          )}
          
          <div className="bg-gray-50 p-4 rounded">
            <p className="text-sm"><strong>Note:</strong> {content.timeline}</p>
          </div>
        </div>
      </div>

      {/* Detailed Line Items */}
      <div className="mb-8 page-break-avoid">
        <h2 className="text-2xl font-bold mb-4 border-b-2 pb-2" style={{ color: branding.primaryColor, borderColor: branding.primaryColor }}>
          Detailed Investment Breakdown
        </h2>
        <table className="w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-4 py-3 text-left">Component Description</th>
              <th className="border border-gray-300 px-4 py-3 text-left">Manufacturer</th>
              <th className="border border-gray-300 px-4 py-3 text-center">Quantity</th>
              <th className="border border-gray-300 px-4 py-3 text-right">Rate</th>
              <th className="border border-gray-300 px-4 py-3 text-right">Investment</th>
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

              // Use actual manufacturer data from line item (includes fallback logic from backend)
              const manufacturer = item.manufacturer || "Uncategorized";

              return (
                <tr key={index}>
                  <td className="border border-gray-300 px-4 py-3">{item.description}</td>
                  <td className="border border-gray-300 px-4 py-3">{manufacturer}</td>
                  <td className="border border-gray-300 px-4 py-3 text-center">{item.quantity}</td>
                  <td className="border border-gray-300 px-4 py-3 text-right">{formatCurrency(rateWithMarkup)}</td>
                  <td className="border border-gray-300 px-4 py-3 text-right font-medium">
                    {formatCurrency(total)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="flex justify-end mt-4">
          <div className="w-80 space-y-2">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>{formatCurrency(totals.subtotal)}</span>
            </div>
            {totals.discountAmount > 0 && (
              <div className="flex justify-between text-red-600">
                <span>Project Discount ({quote.discount}%):</span>
                <span>-{formatCurrency(totals.discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Tax ({quote.taxRate}%):</span>
              <span>{formatCurrency(totals.taxAmount)}</span>
            </div>
            <div className="border-t-2 pt-2" style={{ borderColor: branding.primaryColor }}>
              <div className="flex justify-between text-xl font-bold" style={{ color: branding.primaryColor }}>
                <span>Total Investment:</span>
                <span>{formatCurrency(totals.total)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Company Profile */}
      <div className="mb-8 page-break-before">
        <h2 className="text-2xl font-bold mb-4 border-b-2 pb-2" style={{ color: branding.primaryColor, borderColor: branding.primaryColor }}>
          About {companyInfo.name}
        </h2>
        <div className="space-y-4 leading-relaxed">
          <p>{content.companyDescription}</p>
          
          {/* Portfolio Images Section */}
          {portfolioImages.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-4" style={{ color: branding.accentColor }}>Our Recent Projects</h3>
              <ImageGrid 
                images={portfolioImages.filter((img: PortfolioImage) => img.featured || portfolioImages.length <= 12)} 
                columns={3} 
                maxImages={12}
                showCaptions={true}
              />
            </div>
          )}
          
          <div>
            <h3 className="text-lg font-semibold mb-2" style={{ color: branding.accentColor }}>Our Credentials</h3>
            <p>{content.credentials}</p>
            
            {/* Company Certification Images */}
            {companyImages.some((img: CompanyImage) => img.imageType === 'certification') && (
              <div className="mt-4">
                <CompanyImageDisplay 
                  images={companyImages}
                  type="certification"
                  layout="banner"
                />
              </div>
            )}
          </div>
          
          {/* Team Images */}
          {companyImages.some((img: CompanyImage) => img.imageType === 'team') && (
            <div>
              <h3 className="text-lg font-semibold mb-4" style={{ color: branding.accentColor }}>Our Professional Team</h3>
              <CompanyImageDisplay 
                images={companyImages}
                type="team"
                layout="grid"
              />
            </div>
          )}
          
          <div>
            <h3 className="text-lg font-semibold mb-2" style={{ color: branding.accentColor }}>Why Choose Us</h3>
            <ul className="list-disc list-inside space-y-1">
              <li>Licensed, bonded, and fully insured</li>
              <li>Comprehensive warranty coverage</li>
              <li>Professional project management</li>
              <li>Quality materials and workmanship</li>
              <li>Transparent communication throughout</li>
            </ul>
          </div>
          
          {/* Facility Images */}
          {companyImages.some((img: CompanyImage) => img.imageType === 'facility') && (
            <div>
              <h3 className="text-lg font-semibold mb-4" style={{ color: branding.accentColor }}>Our Facilities</h3>
              <CompanyImageDisplay 
                images={companyImages}
                type="facility"
                layout="grid"
              />
            </div>
          )}
        </div>
      </div>

      {/* Warranty & Service */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-4 border-b-2 pb-2" style={{ color: branding.primaryColor, borderColor: branding.primaryColor }}>
          Warranty & Service Commitment
        </h2>
        <div className="space-y-4 leading-relaxed">
          <div className="bg-gray-50 p-6 rounded">
            <h3 className="text-lg font-semibold mb-3" style={{ color: branding.primaryColor }}>
              Comprehensive Warranty Coverage
            </h3>
            <p>{content.warranty}</p>
          </div>
          
          <div>
            <h3 className="text-lg font-semibold mb-2" style={{ color: branding.accentColor }}>Service Commitment</h3>
            <p>We stand behind our work with ongoing support and maintenance services to ensure your complete satisfaction.</p>
          </div>
        </div>
      </div>

      {/* Investment Terms */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-4 border-b-2 pb-2" style={{ color: branding.primaryColor, borderColor: branding.primaryColor }}>
          Investment Terms
        </h2>
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold mb-2" style={{ color: branding.accentColor }}>Payment Schedule</h3>
            <p>{content.paymentTerms}</p>
          </div>
          
          <div>
            <h3 className="text-lg font-semibold mb-2" style={{ color: branding.accentColor }}>Proposal Validity</h3>
            <p>This proposal is valid for {quoteTerms.validFor} from the date above.</p>
          </div>
          
          <div>
            <h3 className="text-lg font-semibold mb-2" style={{ color: branding.accentColor }}>Additional Terms</h3>
            <p>{quoteTerms.additionalNotes}</p>
          </div>
        </div>
      </div>

      {/* Next Steps */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-4 border-b-2 pb-2" style={{ color: branding.primaryColor, borderColor: branding.primaryColor }}>
          Next Steps
        </h2>
        <div className="space-y-4">
          <div className="bg-gray-50 p-6 rounded">
            <h3 className="text-lg font-semibold mb-3" style={{ color: branding.primaryColor }}>
              Ready to Get Started?
            </h3>
            <ol className="list-decimal list-inside space-y-2">
              <li>Review this proposal thoroughly</li>
              <li>Contact us with any questions or modifications</li>
              <li>Sign the contract to secure your project dates</li>
              <li>Submit the initial payment to begin work</li>
            </ol>
          </div>
          
          <div className="text-center">
            <p className="text-lg mb-2">Ready to transform your outdoor space?</p>
            <p>Contact us today: <strong>{companyInfo.phone}</strong> | <strong>{companyInfo.email}</strong></p>
          </div>
        </div>
      </div>
    </div>
  );
}