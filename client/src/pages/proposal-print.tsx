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
    <div className="clean-proposal">
      {/* Main Proposal */}
      <div className="proposal-header">
        <h1 className="project-title">{quote.projectName || (customer.name ? customer.name.toUpperCase() + ' PROJECT' : 'BACK PATIO COVER')}</h1>
        <h2 className="project-location">{quote.projectAddress || customer.billingAddress || 'PROJECT LOCATION'}</h2>
        <h3 className="proposal-type">OUTDOOR LIVING PROPOSAL</h3>
        <div className="proposal-date">{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase()}</div>
      </div>

      {/* Professional Disclaimer */}
      <div className="disclaimer">
        This quote is for estimation purposes and is not a guarantee of cost for services. Quote is based on current information 
        from manufacturer about the project requirements. Actual cost may change once project elements are finalized. Client 
        will be notified of any changes in cost prior to them being incurred.
      </div>

      {/* Layout Section */}
      <div className="section-title">LAYOUT:</div>

      {/* Cover Photo */}
      {showCover && activeCoverPhoto && (
        <div className="layout-image">
          <img 
            src={getProxiedImageUrl(activeCoverPhoto.storageUrl)}
            alt="Project Layout"
            className="layout-photo"
          />
        </div>
      )}

      {/* Inspiration Gallery */}
      {activeRenderings && activeRenderings.length > 0 && (
        <>
          <div className="section-title">INSPIRATION GALLERY:</div>
          {activeRenderings.slice(0, 4).map((rendering, index) => (
            <div key={rendering.id} className="gallery-image">
              <img 
                src={getProxiedImageUrl(rendering.storageUrl)}
                alt={`Gallery ${index + 1}`}
                className="gallery-photo"
              />
            </div>
          ))}
        </>
      )}

      {/* Product Categories */}
      <div className="section-title">MOTORIZED SCREENS:</div>
      <div className="section-title">HEATERS:</div>

      {/* Pricing Table */}
      {showPricing && totals && (
        <div className="pricing-section">
          <table className="pricing-table">
            <thead>
              <tr>
                <th className="product-col">PRODUCT</th>
                <th className="qty-col">QUANTITIES</th>
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
                    <td className="product-name">{item.description.toUpperCase()}</td>
                    <td className="quantity">{qty}</td>
                    <td className="amount">{formatCurrency(total)}</td>
                  </tr>
                );
              })}
              
              {/* Subtotal, Tax, Total rows */}
              {totals.shippingAmount > 0 && (
                <tr>
                  <td className="product-name">SHIPPING:</td>
                  <td className="quantity">1</td>
                  <td className="amount">{formatCurrency(totals.shippingAmount)}</td>
                </tr>
              )}
              
              {totals.taxAmount > 0 && (
                <tr>
                  <td className="product-name">SALES TAX ({((totals.taxAmount / totals.subtotal) * 100).toFixed(2)}%):</td>
                  <td className="quantity"></td>
                  <td className="amount">{formatCurrency(totals.taxAmount)}</td>
                </tr>
              )}

              <tr className="total-row">
                <td className="product-name"><strong>TOTAL:</strong></td>
                <td className="quantity"></td>
                <td className="amount"><strong>{formatCurrency(totals.total)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Company Footer */}
      <div className="company-footer">
        <div className="company-name">{company.name}</div>
        <div className="company-address">{company.address1}, {company.address2}</div>
        <div className="company-contact">
          <div>Website: {company.website}</div>
          <div>Email: {company.email}</div>
        </div>
        <div className="company-social">
          <div>Instagram: @edgpatioandshade</div>
          <div>LinkedIn: EDG Patio & Shade</div>
        </div>
      </div>

      {/* Contract Terms */}
      {showContract && (quote.contractTemplate?.terms || quote.customContractTerms) && (
        <div className="contract-section page-break-before">
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
      )}
    </div>
  );
}