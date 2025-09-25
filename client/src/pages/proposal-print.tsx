import { useEffect, useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import type { QuoteWithDetails, QuoteCoverPhoto, QuoteProductRendering } from '@shared/schema';
import { calculateQuoteTotals, formatCurrency } from '@/lib/utils';
import { getProxiedImageUrl } from '@/lib/image-utils';
import logoPath from '@assets/Logo_Full Color_Black_1758731429139.png';

export default function ProposalPrint() {
  const { id } = useParams<{ id: string }>();
  const [location] = useLocation();
  const [imagesLoaded, setImagesLoaded] = useState(0);
  const [totalImages, setTotalImages] = useState(0);
  const [fontsReady, setFontsReady] = useState(false);

  // Parse query parameters
  const urlParams = new URLSearchParams(location.split('?')[1]);
  const showCover = urlParams.get('cover') === '1';
  const showPricing = urlParams.get('pricing') !== '0'; // Default to true
  const showContract = urlParams.get('contract') === '1';

  // Fetch quote data
  const { data: quote, isLoading, error } = useQuery<QuoteWithDetails>({
    queryKey: [`/api/quotes/${id}?include=account,lineItems,contractTemplate,contacts`],
    enabled: !!id,
  });

  // Fetch cover photos
  const { data: coverPhotos } = useQuery<QuoteCoverPhoto[]>({
    queryKey: [`/api/quotes/${id}/cover-photos`],
    enabled: !!id,
  });

  // Fetch product renderings
  const { data: productRenderings } = useQuery<QuoteProductRendering[]>({
    queryKey: [`/api/quotes/${id}/product-renderings`],
    enabled: !!id,
  });

  // Get active images
  const activeCoverPhoto = coverPhotos?.find(photo => photo.isActive);
  const activeRenderings = productRenderings?.filter(rendering => rendering.isActive)
    .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

  // Calculate totals
  const totals = quote ? calculateQuoteTotals(
    quote.lineItems.map(item => ({
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      markupType: item.markupType,
      markupValue: item.markupValue,
    })),
    parseFloat(quote.taxRate || '0'),
    parseFloat(quote.discount || '0'),
    parseFloat(quote.shipping || '0')
  ) : null;

  // Company information
  const company = {
    name: 'EDG Patio & Shade',
    address1: '1802 Holian Drive',
    address2: 'Spring Grove, IL 60081',
    email: 'info@edgpatioshade.com',
    phone: '+1 (815) 581-0138',
    website: 'www.edgpatioshade.com'
  };

  // Image loading tracking
  useEffect(() => {
    const images: string[] = [];
    
    // Add logo
    images.push(logoPath);
    
    // Add cover photo if enabled
    if (showCover && activeCoverPhoto) {
      images.push(getProxiedImageUrl(activeCoverPhoto.storageUrl));
    }
    
    // Add product renderings
    if (activeRenderings && activeRenderings.length > 0) {
      activeRenderings.forEach(rendering => {
        images.push(getProxiedImageUrl(rendering.storageUrl));
      });
    }

    setTotalImages(images.length);
    setImagesLoaded(0);

    // Preload images
    images.forEach(src => {
      const img = new Image();
      img.onload = () => {
        setImagesLoaded(prev => prev + 1);
      };
      img.onerror = () => {
        setImagesLoaded(prev => prev + 1); // Count errors as loaded to not hang
      };
      img.src = src;
    });
  }, [showCover, activeCoverPhoto, activeRenderings]);

  // Font loading tracking
  useEffect(() => {
    if (document.fonts) {
      document.fonts.ready.then(() => {
        setFontsReady(true);
      });
    } else {
      // Fallback for browsers without font loading API
      setTimeout(() => setFontsReady(true), 1000);
    }
  }, []);

  // Set ready signal when all assets are loaded
  const isReady = fontsReady && imagesLoaded >= totalImages && quote && !isLoading;

  useEffect(() => {
    if (isReady) {
      // Add readiness signal for Puppeteer
      document.body.setAttribute('data-pdf-ready', 'true');
    }
  }, [isReady]);

  if (isLoading || !quote) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="text-gray-600">Loading proposal...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="text-red-600">Error loading proposal data</div>
      </div>
    );
  }

  const customer = quote.account;

  return (
    <div className="print-proposal bg-white">
      {/* Cover Page */}
      {showCover && (
        <div className="cover-page page-break-after">
          {/* Header Brand Bar */}
          <div className="brand-header">
            <div className="brand-content">
              <img src={logoPath} alt={company.name} className="company-logo" />
              <div className="contact-info">
                <div>{company.website}</div>
                <div>{company.phone}</div>
                <div>{company.email}</div>
              </div>
            </div>
          </div>

          {/* Title Section */}
          <div className="title-section">
            <h1 className="main-title">PROJECT PROPOSAL</h1>
            <div className="title-accent"></div>
            <h2 className="project-name">{quote.projectName || 'OUTDOOR LIVING PROJECT'}</h2>
          </div>

          {/* Hero Image */}
          {activeCoverPhoto && (
            <div className="hero-image-container">
              <img 
                src={getProxiedImageUrl(activeCoverPhoto.storageUrl)}
                alt="Project Cover"
                className="hero-image"
              />
            </div>
          )}

          {/* Metadata Panel */}
          <div className="metadata-panel">
            <div className="metadata-item">
              <div className="metadata-label">PROPOSAL NUMBER</div>
              <div className="metadata-value">{quote.quoteNumber || 'PROP-001'}</div>
            </div>
            <div className="metadata-item">
              <div className="metadata-label">DATE PREPARED</div>
              <div className="metadata-value">
                {new Date().toLocaleDateString('en-US', { 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </div>
            </div>
            <div className="metadata-item">
              <div className="metadata-label">PREPARED FOR</div>
              <div className="metadata-value">
                <div>{customer.name}</div>
                {quote.projectAddress && <div className="address">{quote.projectAddress}</div>}
                {customer.email && <div className="email">{customer.email}</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Page */}
      <div className="content-page">
        {/* Header */}
        <div className="page-header">
          <div className="header-brand">
            <div className="company-name">{company.name}</div>
            <div className="company-address">{company.address1} • {company.address2}</div>
          </div>
          <div className="header-contact">
            <div className="phone">{company.phone}</div>
            <div className="email-website">{company.email} • {company.website}</div>
          </div>
        </div>

        {/* Proposal Header */}
        <div className="section-header">
          <h2>PROFESSIONAL ESTIMATE</h2>
        </div>

        {/* Addresses Section */}
        <div className="addresses-section">
          <div className="address-column">
            <h3>Bill To</h3>
            <div className="address-content">
              <div>{customer.name}</div>
              {customer.company && <div>{customer.company}</div>}
              {customer.billingAddress && <div className="address">{customer.billingAddress}</div>}
            </div>
          </div>
          <div className="address-column">
            <h3>Ship To</h3>
            <div className="address-content">
              <div>{customer.name}</div>
              {quote.projectAddress && <div className="address">{quote.projectAddress}</div>}
            </div>
          </div>
        </div>

        {/* Estimate Details */}
        <div className="estimate-details">
          <h3>Estimate Details</h3>
          <div className="details-grid">
            <div><strong>Estimate no.:</strong> {quote.id}</div>
            <div><strong>Estimate date:</strong> {new Date().toLocaleDateString('en-US')}</div>
          </div>
        </div>

        {/* Project Overview */}
        <div className="project-overview-section avoid-break">
          <div className="section-header">
            <h2>PROJECT OVERVIEW</h2>
          </div>
          <div className="project-overview-content">
            <div className="overview-intro">
              <p>
                <strong>Transform your outdoor living experience</strong> with our premium patio and shade solutions. 
                This comprehensive proposal outlines a complete outdoor comfort system designed specifically for your space, 
                featuring state-of-the-art motorized screens and professional-grade shade structures.
              </p>
            </div>
            
            <div className="overview-benefits">
              <div className="benefit-columns">
                <div className="benefit-column">
                  <h4>🏡 Enhanced Living Space</h4>
                  <ul>
                    <li>Extended outdoor seasons</li>
                    <li>Protection from sun, wind & insects</li>
                    <li>Increased property value</li>
                  </ul>
                </div>
                <div className="benefit-column">
                  <h4>⚙️ Premium Technology</h4>
                  <ul>
                    <li>Motorized operation with remote control</li>
                    <li>Weather-resistant construction</li>
                    <li>Professional installation & warranty</li>
                  </ul>
                </div>
                <div className="benefit-column">
                  <h4>🎯 Custom Solution</h4>
                  <ul>
                    <li>Tailored to your specific needs</li>
                    <li>Quality materials & craftsmanship</li>
                    <li>Full-service project management</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="overview-commitment">
              <p>
                <em>Our commitment: Delivering exceptional outdoor solutions with professional installation, 
                comprehensive warranty coverage, and ongoing support to ensure your complete satisfaction.</em>
              </p>
            </div>
          </div>
        </div>

        {/* Product Renderings */}
        {activeRenderings && activeRenderings.length > 0 && (
          <div className="renderings-section avoid-break">
            <div className="section-header">
              <h2>PRODUCT RENDERINGS</h2>
            </div>
            <div className="renderings-grid">
              {activeRenderings.slice(0, 6).map((rendering) => (
                <div key={rendering.id} className="rendering-item">
                  <img 
                    src={getProxiedImageUrl(rendering.storageUrl)}
                    alt={rendering.originalName}
                    className="rendering-image"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Line Items Table */}
        <div className="line-items-section avoid-break">
          <table className="line-items-table">
            <thead>
              <tr className="table-header">
                <th>#</th>
                <th>Product/Service</th>
                <th>Description</th>
                <th>Qty</th>
                {showPricing && <th>Rate</th>}
                {showPricing && <th>Amount</th>}
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

                return (
                  <tr key={item.id} className="table-row">
                    <td className="item-number">{index + 1}</td>
                    <td className="product-name">{item.description.split(' ').slice(0, 3).join(' ')}</td>
                    <td className="description">{item.description}</td>
                    <td className="quantity">{qty}</td>
                    {showPricing && <td className="rate">{formatCurrency(price)}</td>}
                    {showPricing && <td className="amount">{formatCurrency(total)}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Totals Section */}
        {showPricing && totals && (
          <div className="totals-section">
            <div className="totals-content">
              {totals.subtotal !== totals.total && (
                <>
                  <div className="total-line">
                    <span>Subtotal:</span>
                    <span>{formatCurrency(totals.subtotal)}</span>
                  </div>
                  {totals.discountAmount > 0 && (
                    <div className="total-line">
                      <span>Discount:</span>
                      <span>-{formatCurrency(totals.discountAmount)}</span>
                    </div>
                  )}
                  {totals.shippingAmount > 0 && (
                    <div className="total-line">
                      <span>Shipping:</span>
                      <span>{formatCurrency(totals.shippingAmount)}</span>
                    </div>
                  )}
                  {totals.taxAmount > 0 && (
                    <div className="total-line">
                      <span>Tax:</span>
                      <span>{formatCurrency(totals.taxAmount)}</span>
                    </div>
                  )}
                </>
              )}
              <div className="total-line total-final">
                <span>TOTAL:</span>
                <span>{formatCurrency(totals.total)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Signature Section */}
        <div className="signature-section avoid-break">
          <div className="section-header">
            <h2>CLIENT ACCEPTANCE</h2>
          </div>
          <div className="signature-boxes">
            <div className="signature-box">
              <div className="signature-label">ACCEPTED DATE</div>
              <div className="signature-line">Date: _______________</div>
            </div>
            <div className="signature-box">
              <div className="signature-label">CLIENT SIGNATURE</div>
              <div className="signature-line">Signature: _______________</div>
              <div className="signature-line">Print Name: _______________</div>
            </div>
          </div>
        </div>

        {/* Contract Terms */}
        {showContract && (quote.contractTemplate?.terms || quote.customContractTerms) && (
          <div className="contract-section page-break-before">
            <div className="section-header">
              <h2>CONTRACT TERMS & CONDITIONS</h2>
            </div>
            <div className="contract-content">
              {(quote.contractTemplate?.terms || quote.customContractTerms || '').split('\n').map((line, index) => {
                const trimmedLine = line.trim();
                if (!trimmedLine) return <div key={index} className="contract-spacer"></div>;
                
                const isSectionStart = /^\d+\.(\s|$)/.test(trimmedLine);
                return (
                  <div key={index} className={`contract-line ${isSectionStart ? 'section-start' : ''}`}>
                    {trimmedLine}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="page-footer no-print">
          <div className="footer-content">
            <div className="footer-company">{company.name}</div>
            <div className="footer-contact">{company.phone} • {company.email}</div>
          </div>
        </div>
      </div>
    </div>
  );
}