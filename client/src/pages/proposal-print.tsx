import { useEffect, useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import type { QuoteWithDetails, QuoteCoverPhoto, QuoteProductRendering, QuotePartnerLogo } from '@shared/schema';
import { calculateQuoteTotals, formatCurrency } from '@/lib/utils';
import { getProxiedImageUrl } from '@/lib/image-utils';
import { COMPANY_INFO } from '@shared/companyConfig';
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

  // Fetch partner logo
  const { data: partnerLogo } = useQuery<QuotePartnerLogo>({
    queryKey: [`/api/quotes/${id}/partner-logo`],
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

  // Image loading tracking for 5-page proposal
  useEffect(() => {
    const images: string[] = [];
    
    // Add static cover and final page images
    if (COMPANY_INFO.proposalCoverImageUrl) {
      images.push(COMPANY_INFO.proposalCoverImageUrl);
    }
    if (COMPANY_INFO.proposalFinalImageUrl) {
      images.push(COMPANY_INFO.proposalFinalImageUrl);
    }
    
    // Add logo as fallback
    images.push(logoPath);
    
    // Add partner logo if present
    if (partnerLogo && partnerLogo.isActive) {
      images.push(getProxiedImageUrl(partnerLogo.storageUrl));
    }
    
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

    // Preload images with enhanced debugging
    images.forEach((src, index) => {
      console.log(`📸 Preloading image ${index + 1}/${images.length}: ${src}`);
      const img = new Image();
      img.onload = () => {
        console.log(`✅ Image loaded successfully: ${src}`);
        setImagesLoaded(prev => prev + 1);
      };
      img.onerror = () => {
        console.log(`❌ Image failed to load: ${src}`);
        setImagesLoaded(prev => prev + 1); // Count errors as loaded to not hang
      };
      img.src = src;
    });
  }, [showCover, activeCoverPhoto, activeRenderings, quote]);

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
    console.log(`📸 Image loading: ${imagesLoaded}/${totalImages}, fonts: ${fontsReady}, ready: ${isReady}`);
    if (isReady) {
      console.log('✅ Setting PDF ready signal');
      // Add readiness signal for Puppeteer
      document.body.setAttribute('data-pdf-ready', 'true');
    }
  }, [isReady, imagesLoaded, totalImages, fontsReady]);

  // Fallback timeout to prevent infinite hanging
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isReady) {
        console.log('⏰ Timeout fallback - forcing PDF ready signal');
        document.body.setAttribute('data-pdf-ready', 'true');
      }
    }, 10000); // 10 second fallback

    return () => clearTimeout(timer);
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
    <div className="five-page-proposal">
      {/* Page 1: Cover Page */}
      <div className="page cover-page">
        <div className="cover-image-container">
          <img 
            src={COMPANY_INFO.proposalCoverImageUrl || logoPath}
            alt="Company Cover"
            className="cover-image"
          />
        </div>
      </div>

      {/* Page 2: Information Page */}
      <div className="page info-page">
        <div className="page-content">
          {/* Project Header */}
          <div className="project-header">
            <h1 className="project-title">
              {quote.projectName || (customer.name ? customer.name.toUpperCase() + ' PROJECT' : 'OUTDOOR LIVING PROJECT')}
            </h1>
            <h2 className="project-location">
              {quote.projectAddress || customer.billingAddress || 'PROJECT LOCATION'}
            </h2>
            <div className="project-date">
              {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase()}
            </div>
          </div>

          {/* Additional Notes */}
          {quote.notes && (
            <div className="additional-notes">
              <h3>Additional Notes:</h3>
              <div className="notes-content">{quote.notes}</div>
            </div>
          )}

          {/* Partner Logo */}
          {partnerLogo && partnerLogo.isActive && (
            <div className="partner-logo-section">
              <h3>In Partnership With:</h3>
              <img 
                src={getProxiedImageUrl(partnerLogo.storageUrl)}
                alt="Partner Logo"
                className="partner-logo"
              />
            </div>
          )}

          {/* Company Info */}
          <div className="company-info">
            <div className="company-name">{COMPANY_INFO.name}</div>
            <div className="company-contact">
              <div>{COMPANY_INFO.address}</div>
              <div>{COMPANY_INFO.phone}</div>
              <div>{COMPANY_INFO.email}</div>
            </div>
          </div>

          {/* Disclaimer at Bottom */}
          <div className="disclaimer">
            This quote is for estimation purposes and is not a guarantee of cost for services. Quote is based on current information 
            from manufacturer about the project requirements. Actual cost may change once project elements are finalized. Client 
            will be notified of any changes in cost prior to them being incurred.
          </div>
        </div>
      </div>

      {/* Page 3: Gallery Page */}
      <div className="page gallery-page">
        <div className="page-content">
          <h2 className="page-title">Project Gallery</h2>
          
          {/* Layout Section */}
          {showCover && activeCoverPhoto && (
            <div className="gallery-section">
              <h3 className="section-title">Layout Design:</h3>
              <div className="gallery-image">
                <img 
                  src={getProxiedImageUrl(activeCoverPhoto.storageUrl)}
                  alt="Project Layout"
                  className="gallery-photo"
                />
              </div>
            </div>
          )}

          {/* Product Renderings */}
          {activeRenderings && activeRenderings.length > 0 && (
            <div className="gallery-section">
              <h3 className="section-title">Product Renderings:</h3>
              <div className="gallery-grid">
                {activeRenderings.slice(0, 6).map((rendering, index) => (
                  <div key={rendering.id} className="gallery-image">
                    <img 
                      src={getProxiedImageUrl(rendering.storageUrl)}
                      alt={`Rendering ${index + 1}`}
                      className="gallery-photo"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Page 4: Pricing Page */}
      <div className="page pricing-page">
        <div className="page-content">
          <h2 className="page-title">Project Investment</h2>
          
          {showPricing && totals && (
            <div className="pricing-section">
              <table className="pricing-table">
                <thead>
                  <tr>
                    <th className="product-col">PRODUCT</th>
                    <th className="qty-col">QTY</th>
                    <th className="total-col">TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {quote.lineItems.map((item) => {
                    const qty = parseFloat(item.quantity.toString());
                    const price = parseFloat(item.unitPrice.toString());
                    const markup = parseFloat(item.markupValue.toString());
                    const baseTotal = qty * price;
                    const total = item.markupType === 'percentage' 
                      ? baseTotal + (baseTotal * (markup / 100))
                      : baseTotal + markup;

                    return (
                      <tr key={item.id}>
                        <td className="product-name">{item.description}</td>
                        <td className="quantity">{qty}</td>
                        <td className="amount">{formatCurrency(total)}</td>
                      </tr>
                    );
                  })}
                  
                  {/* Additional costs */}
                  {totals.shippingAmount > 0 && (
                    <tr>
                      <td className="product-name">Shipping & Handling</td>
                      <td className="quantity">1</td>
                      <td className="amount">{formatCurrency(totals.shippingAmount)}</td>
                    </tr>
                  )}
                  
                  {totals.taxAmount > 0 && (
                    <tr>
                      <td className="product-name">Sales Tax</td>
                      <td className="quantity"></td>
                      <td className="amount">{formatCurrency(totals.taxAmount)}</td>
                    </tr>
                  )}

                  <tr className="total-row">
                    <td className="product-name"><strong>TOTAL PROJECT INVESTMENT</strong></td>
                    <td className="quantity"></td>
                    <td className="amount"><strong>{formatCurrency(totals.total)}</strong></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Page 5: Final Page */}
      <div className="page final-page">
        <div className="final-image-container">
          <img 
            src={COMPANY_INFO.proposalFinalImageUrl || logoPath}
            alt="Company Final"
            className="final-image"
          />
        </div>
        <div className="final-contact">
          <div className="final-company-name">{COMPANY_INFO.name}</div>
          <div className="final-contact-info">
            <div>{COMPANY_INFO.phone}</div>
            <div>{COMPANY_INFO.email}</div>
          </div>
        </div>
      </div>

      {/* Contract Terms (if enabled) */}
      {showContract && (quote.contractTemplate?.terms || quote.customContractTerms) && (
        <div className="page contract-page">
          <div className="page-content">
            <h2 className="page-title">Terms & Conditions</h2>
            <div className="contract-content">
              {(quote.contractTemplate?.terms || quote.customContractTerms || '').split('\n').map((line, index) => {
                const trimmedLine = line.trim();
                if (!trimmedLine) return <div key={index} className="contract-spacer"></div>;
                
                return (
                  <div key={index} className="contract-line">
                    {trimmedLine}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}