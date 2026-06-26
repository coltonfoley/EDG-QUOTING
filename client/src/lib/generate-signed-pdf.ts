import jsPDFDefault, { jsPDF as jsPDFNamed } from 'jspdf';
import type { QuoteProductRendering, QuoteWithDetails } from '@shared/schema';
import { barlowRegularBase64, barlowSemiBoldBase64 } from './fonts';
import { generateBrandedSequencePDF } from './pdf-branded-sequence';
import { normalizeImageToDataUrl } from './pdf-image-pipeline';

const JsPDF = jsPDFNamed || jsPDFDefault;

interface PdfGroup {
  id: string;
  title: string;
  position: number;
}

interface GenerateSignedPDFOptions {
  quote: QuoteWithDetails;
  includeImages?: boolean;
  includePricing?: boolean;
  includeContract?: boolean;
  includeApprovalDrawing?: boolean;
  groups?: PdfGroup[];
  brandAssets?: {
    coverJpg: string;
    logoPng: string;
    backPageJpg: string;
  };
  normalizeImage?: (src: string) => Promise<{ dataUrl: string; format: 'PNG' | 'JPEG' }>;
}

/**
 * Generates a signed PDF for a quote with all signatures and contract terms
 * This is the official legally-binding document for both parties
 */
export async function generateSignedPDF(options: GenerateSignedPDFOptions): Promise<Blob> {
  const {
    quote,
    includeImages = false,
    includePricing = true,
    includeContract = true,
    includeApprovalDrawing = quote.esigIncludeApprovalDrawing === true
      || Boolean((quote.signedDocumentSnapshot as any)?.approvalDrawing && (quote.signedDocumentSnapshot as any)?.esigIncludeApprovalDrawing !== false),
    groups = [],
    brandAssets,
    normalizeImage = normalizeImageToDataUrl,
  } = options;

  // Create PDF instance
  const pdf = new JsPDF({ unit: 'mm', format: 'letter' });

  // Add custom fonts
  pdf.addFileToVFS('Barlow-Regular.ttf', barlowRegularBase64);
  pdf.addFont('Barlow-Regular.ttf', 'Barlow-Regular', 'normal');
  pdf.addFileToVFS('Barlow-SemiBold.ttf', barlowSemiBoldBase64);
  pdf.addFont('Barlow-SemiBold.ttf', 'Barlow-SemiBold', 'normal');

  // Prepare normalized images if requested
  let normalizedImages: Array<{ dataUrl: string; format: 'PNG' | 'JPEG' }> = [];
  if (includeImages && quote.productRenderings && quote.productRenderings.length > 0) {
    const imageResults = await Promise.allSettled(
      quote.productRenderings.map(async (rendering: QuoteProductRendering) => {
        return await normalizeImage(rendering.storageUrl);
      })
    );
    normalizedImages = imageResults
      .filter((r): r is PromiseFulfilledResult<{ dataUrl: string; format: 'PNG' | 'JPEG' }> => r.status === 'fulfilled')
      .map(r => r.value);
  }

  // Company information
  const company = {
    name: 'EDG Patio & Shade',
    address: '1802 Holian Drive, Spring Grove, IL 60081',
    phone: '+1 (815) 581-0138',
    email: 'info@edgpatioshade.com'
  };

  // Get contract text (combine customer-facing quote notes with contract terms) if includeContract is true
  let contractText = '';
  if (includeContract) {
    const parts = [];
    if (quote.notes?.trim()) parts.push(quote.notes.trim());
    if (quote.customContractTerms?.trim()) parts.push(quote.customContractTerms.trim());
    else if (quote.contractTemplate?.terms?.trim()) parts.push(quote.contractTemplate.terms.trim());
    contractText = parts.join('\n\n');
  }

  // Get client logo if available
  let clientLogoDataUrl: string | null = null;
  if (quote.coverPhoto) {
    try {
      const result = await normalizeImage(quote.coverPhoto.storageUrl);
      clientLogoDataUrl = result.dataUrl;
    } catch (error) {
      console.warn('Failed to load client logo:', error);
    }
  }

  // Generate the PDF using branded sequence
  await generateBrandedSequencePDF({
    pdf,
    company,
    quote,
    renderImages: normalizedImages,
    contractText,
    showPricing: includePricing,
    includeApprovalDrawing,
    clientLogoDataUrl,
    groups,
    brandAssets
  });

  // Return as blob
  return pdf.output('blob');
}

/**
 * Downloads a signed PDF with proper filename
 */
export function downloadSignedPDF(pdfBlob: Blob, quote: QuoteWithDetails) {
  const timestamp = new Date().toISOString().slice(0, 10);
  const projectName = quote.projectName || 'Project';
  const quoteNumber = quote.quoteNumber || 'Quote';
  const filename = `${projectName.replace(/[^a-zA-Z0-9]/g, '_')}_${quoteNumber}_Signed_${timestamp}.pdf`;

  const url = URL.createObjectURL(pdfBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
