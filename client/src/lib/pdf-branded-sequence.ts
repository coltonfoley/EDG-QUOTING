// Branded Sequence PDF Orchestrator
// Calls section renderers in fixed order to create the branded proposal

import jsPDF from 'jspdf';
import type { QuoteWithDetails } from '@shared/schema';
import { getBrandCoverJPG, getBrandLogoPNG, getBrandBackPagePNG } from './pdf-brand-assets';
import {
  drawStandardCover,
  drawProjectDetailsPage,
  drawApprovalDrawingSection,
  drawRenderingsPages,
  drawLineItemsSection,
  drawContractSection,
  drawBrandedBackPage
} from './pdf-sections';

interface PdfGroup {
  id: string;
  title: string;
  position: number;
}

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
  includeApprovalDrawing?: boolean;
  clientLogoDataUrl: string | null;
  groups?: PdfGroup[];
  brandAssets?: {
    coverJpg: string;
    logoPng: string;
    backPageJpg: string;
  };
}

/**
 * Generates a Branded Sequence PDF with fixed page order:
 * 1. Standardized Cover (brand photo + logo)
 * 2. Project Details
 * 3. Order Approval Drawing, when included
 * 4. Gallery (auto-paginate)
 * 5. Line Items (auto-paginate, optional pricing)
 * 6. Contract Terms (auto-paginate)
 * 7. Branded Back Page
 */
export async function generateBrandedSequencePDF(options: BrandedSequenceOptions): Promise<void> {
  const { pdf, company, quote, renderImages, contractText, showPricing, includeApprovalDrawing = quote?.esigIncludeApprovalDrawing === true, clientLogoDataUrl, groups = [], brandAssets } = options;

  const [BRAND_COVER_JPG, BRAND_LOGO_PNG, BRAND_BACK_PAGE_PNG] = brandAssets
    ? [brandAssets.coverJpg, brandAssets.logoPng, brandAssets.backPageJpg]
    : await Promise.all([
        getBrandCoverJPG(),
        getBrandLogoPNG(),
        getBrandBackPagePNG(),
      ]);

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
    subtitle: quote?.account?.company || quote?.account?.name || quote?.customer?.company || quote?.customer?.name || '',
    pageW,
    pageH
  });

  // 2. Project Details Page (section handles its own page creation)
  // Only use client logo if provided (no fallback)
  await drawProjectDetailsPage(pdf, {
    company,
    quote,
    coverDataUrl: clientLogoDataUrl,
    logoDataUrl: BRAND_LOGO_PNG,
    margin,
    contentW,
    pageW,
    pageH,
    showPricing
  });

  // 3. Order Approval Drawing (if included)
  if (includeApprovalDrawing && quote?.approvalDrawing) {
    drawApprovalDrawingSection(pdf, {
      quote,
      logoDataUrl: BRAND_LOGO_PNG,
      company,
      margin,
      contentW,
      pageW,
      pageH
    });
  }

  // 4. Gallery / Renderings (if images provided) (section handles its own page creation)
  if (renderImages && renderImages.length > 0) {
    await drawRenderingsPages(pdf, {
      images: renderImages,
      logoDataUrl: BRAND_LOGO_PNG,
      company,
      margin,
      contentW,
      pageW,
      pageH
    });
  }

  // 5. Line Items Section (if items exist) (section handles its own page creation)
  if (quote?.lineItems && quote.lineItems.length > 0) {
    drawLineItemsSection(pdf, {
      quote,
      showPricing,
      logoDataUrl: BRAND_LOGO_PNG,
      company,
      margin,
      contentW,
      pageW,
      pageH,
      groups
    });
  }

  // 6. Contract Terms (if contract text provided) (section handles its own page creation)
  if (contractText && contractText.trim()) {
    drawContractSection(pdf, {
      contractText,
      logoDataUrl: BRAND_LOGO_PNG,
      company,
      margin,
      contentW,
      pageW,
      pageH,
      quote
    });
  }

  // 7. Branded Back Page (section handles its own page creation)
  drawBrandedBackPage(pdf, {
    backPageDataUrl: BRAND_BACK_PAGE_PNG,
    pageW,
    pageH,
    margin
  });
}
