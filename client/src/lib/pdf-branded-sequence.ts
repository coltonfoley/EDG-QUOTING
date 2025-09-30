// Branded Sequence PDF Orchestrator
// Calls section renderers in fixed order to create the branded proposal

import jsPDF from 'jspdf';
import type { QuoteWithDetails } from '@shared/schema';
import { BRAND_COVER_JPG, BRAND_LOGO_PNG, BRAND_BACK_PAGE_PNG } from './pdf-brand-assets';
import {
  drawStandardCover,
  drawProjectDetailsPage,
  drawRenderingsPages,
  drawLineItemsSection,
  drawContractSection,
  drawBrandedBackPage
} from './pdf-sections';

interface BrandedSequenceOptions {
  pdf: jsPDF;
  company: {
    name: string;
    address: string;
    email: string;
    phone: string;
  };
  quote: QuoteWithDetails;
  renderImages: Array<{ dataUrl: string; format: 'PNG' | 'JPEG' }>;
  contractText: string;
  showPricing: boolean;
  clientLogoDataUrl: string | null;
}

/**
 * Generates a Branded Sequence PDF with fixed page order:
 * 1. Standardized Cover (brand photo + logo)
 * 2. Project Details
 * 3. Gallery (auto-paginate)
 * 4. Line Items (auto-paginate, optional pricing)
 * 5. Contract Terms (auto-paginate)
 * 6. Branded Back Page
 */
export async function generateBrandedSequencePDF(options: BrandedSequenceOptions): Promise<void> {
  const { pdf, company, quote, renderImages, contractText, showPricing, clientLogoDataUrl } = options;

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 19; // Professional margins (3/4 inch)
  const contentW = pageW - (2 * margin);

  // 1. Standardized Cover Page (brand photo + logo)
  drawStandardCover(pdf, {
    coverDataUrl: BRAND_COVER_JPG,
    logoDataUrl: BRAND_LOGO_PNG,
    company,
    title: quote?.projectName || 'Project Proposal',
    subtitle: quote?.account?.name || quote?.customer?.name || '',
    pageW,
    pageH
  });

  // 2. Project Details Page (section handles its own page creation)
  // Use client logo if provided, otherwise use brand cover as fallback
  drawProjectDetailsPage(pdf, {
    company,
    quote,
    coverDataUrl: clientLogoDataUrl || BRAND_COVER_JPG,
    logoDataUrl: BRAND_LOGO_PNG,
    margin,
    contentW,
    pageW,
    pageH,
    showPricing
  });

  // 3. Gallery / Renderings (if images provided) (section handles its own page creation)
  if (renderImages && renderImages.length > 0) {
    drawRenderingsPages(pdf, {
      images: renderImages,
      logoDataUrl: BRAND_LOGO_PNG,
      company,
      margin,
      contentW,
      pageW,
      pageH
    });
  }

  // 4. Line Items Section (if items exist) (section handles its own page creation)
  if (quote?.lineItems && quote.lineItems.length > 0) {
    drawLineItemsSection(pdf, {
      quote,
      showPricing,
      logoDataUrl: BRAND_LOGO_PNG,
      company,
      margin,
      contentW,
      pageW,
      pageH
    });
  }

  // 5. Contract Terms (if contract text provided) (section handles its own page creation)
  if (contractText && contractText.trim()) {
    drawContractSection(pdf, {
      contractText,
      logoDataUrl: BRAND_LOGO_PNG,
      company,
      margin,
      contentW,
      pageW,
      pageH
    });
  }

  // 6. Branded Back Page (section handles its own page creation)
  drawBrandedBackPage(pdf, {
    backPageDataUrl: BRAND_BACK_PAGE_PNG,
    pageW,
    pageH,
    margin
  });
}
