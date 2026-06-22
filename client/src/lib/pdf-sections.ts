import jsPDF from 'jspdf';
import { ensureSpace, measureAcceptanceBlock } from '@/lib/pdf-utils';
import { formatCurrency, calculateLineItemTotal, calculateQuoteTotals } from '@/lib/utils';
import { getImageDimensions, getAspectFitBox, getCenteredOrigin } from '@/lib/pdf-image-pipeline';
import {
  formatApprovalDrawingEnclosureType,
  formatApprovalDrawingLightLabel,
  formatApprovalDrawingLouverDirection,
  formatApprovalDrawingSideFeatureType,
  formatDimension,
  getApprovalDrawingSideFeatures,
  normalizeApprovalDrawingData,
  sanitizeQuoteApprovalDrawingForPublic,
} from '@shared/approvalDrawing';

const EDG_TEAL = [66, 255, 193] as const;

function formatJobsiteAddress(quote: any): string {
  const parts: string[] = [];
  
  if (quote.jobsiteStreetAddress) {
    parts.push(quote.jobsiteStreetAddress);
  }
  
  if (quote.jobsiteAddressLine2) {
    parts.push(quote.jobsiteAddressLine2);
  }
  
  const cityStateZip: string[] = [];
  if (quote.jobsiteCity) cityStateZip.push(quote.jobsiteCity);
  if (quote.jobsiteState) cityStateZip.push(quote.jobsiteState);
  if (quote.jobsiteZipCode) cityStateZip.push(quote.jobsiteZipCode);
  
  if (cityStateZip.length > 0) {
    parts.push(cityStateZip.join(', '));
  }
  
  if (quote.jobsiteCountry && quote.jobsiteCountry !== 'United States') {
    parts.push(quote.jobsiteCountry);
  }
  
  return parts.length > 0 ? parts.join('\n') : 'N/A';
}

interface BrandedFooterOpts {
  pdf: jsPDF;
  logoDataUrl: string;
  company: { name: string; address: string; phone: string; email: string };
  pageW: number;
  pageH: number;
  margin: number;
  showInitials?: boolean; // Optional - defaults to true
}

function drawBrandedFooter(opts: BrandedFooterOpts): void {
  const { pdf, logoDataUrl, company, pageW, pageH, margin, showInitials = true } = opts;
  
  const footerY = pageH - 15;
  const lineY = footerY - 12; // Moved line up for more space
  
  // Draw teal line
  pdf.setDrawColor(66, 255, 193);
  pdf.setLineWidth(1);
  pdf.line(margin, lineY, pageW - margin, lineY);
  
  // Add small logo on the left (with more space below the line)
  const logoW = 25;
  const logoH = 10;
  if (!isFallbackBrandImage(logoDataUrl)) {
    const logoFormat = detectImageFormat(logoDataUrl);
    pdf.addImage(logoDataUrl, logoFormat, margin, footerY - logoH + 2, logoW, logoH);
  } else {
    pdf.setFont('Barlow-SemiBold', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(17, 24, 39);
    pdf.text(company.name, margin, footerY);
  }
  
  // Add company info on the right
  pdf.setFont('Barlow-Regular', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(100, 100, 100);
  
  const infoText = `${company.name} | ${company.phone} | ${company.email}`;
  pdf.text(infoText, pageW - margin, footerY, { align: 'right' });
  
  // Add initial field at bottom left (only if showInitials is true)
  if (showInitials) {
    pdf.setFont('Barlow-Regular', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(80, 80, 80);
    const initialX = margin;
    const initialY = pageH - 5;
    pdf.text('Initial:', initialX, initialY);
    
    // Draw short line for initial
    pdf.setDrawColor(150, 150, 150);
    pdf.setLineWidth(0.3);
    pdf.line(initialX + 10, initialY, initialX + 25, initialY);
  }
}

interface DrawStandardCoverOpts {
  coverDataUrl: string;
  logoDataUrl: string;
  company: { name: string; address: string; phone: string; email: string };
  title: string;
  subtitle: string;
  pageW: number;
  pageH: number;
}

interface DrawProjectDetailsPageOpts {
  company: { name: string; address: string; phone: string; email: string };
  quote: any;
  coverDataUrl: string | null;
  logoDataUrl: string;
  margin: number;
  contentW: number;
  pageW: number;
  pageH: number;
  showPricing: boolean;
}

interface DrawRenderingsPagesOpts {
  images: Array<{ dataUrl: string; format: string }>;
  logoDataUrl: string;
  company: { name: string; address: string; phone: string; email: string };
  margin: number;
  contentW: number;
  pageW: number;
  pageH: number;
}

interface DrawApprovalDrawingSectionOpts {
  quote: any;
  logoDataUrl: string;
  company: { name: string; address: string; phone: string; email: string };
  margin: number;
  contentW: number;
  pageW: number;
  pageH: number;
}

interface PdfGroup {
  id: string;
  title: string;
  position: number;
}

interface DrawLineItemsSectionOpts {
  quote: any;
  showPricing: boolean;
  logoDataUrl: string;
  company: { name: string; address: string; phone: string; email: string };
  margin: number;
  contentW: number;
  pageW: number;
  pageH: number;
  groups?: PdfGroup[];
}

interface DrawContractSectionOpts {
  contractText: string;
  logoDataUrl: string;
  company: { name: string; address: string; phone: string; email: string };
  margin: number;
  contentW: number;
  pageW: number;
  pageH: number;
  quote?: any; // For signature data
}

interface DrawBrandedBackPageOpts {
  backPageDataUrl: string;
  pageW: number;
  pageH: number;
  margin: number;
}

export function drawStandardCover(pdf: jsPDF, opts: DrawStandardCoverOpts): void {
  const { coverDataUrl, company, title, subtitle, pageW, pageH } = opts;

  if (isFallbackBrandImage(coverDataUrl)) {
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, pageW, pageH, 'F');
    pdf.setDrawColor(...EDG_TEAL);
    pdf.setLineWidth(1.5);
    pdf.line(20, 28, pageW - 20, 28);
    pdf.setFont('Barlow-SemiBold', 'normal');
    pdf.setFontSize(26);
    pdf.setTextColor(17, 24, 39);
    pdf.text(title || 'Project Proposal', 20, 55, { maxWidth: pageW - 40 });
    pdf.setFont('Barlow-Regular', 'normal');
    pdf.setFontSize(13);
    pdf.setTextColor(80, 80, 80);
    if (subtitle) {
      pdf.text(subtitle, 20, 68, { maxWidth: pageW - 40 });
    }
    pdf.setFontSize(10);
    pdf.text(company.name, 20, pageH - 32);
    pdf.text(`${company.phone} | ${company.email}`, 20, pageH - 24);
    return;
  }

  // Add the cover image as a full-page background
  const format = detectImageFormat(coverDataUrl);
  pdf.addImage(coverDataUrl, format, 0, 0, pageW, pageH);
}

export async function drawProjectDetailsPage(pdf: jsPDF, opts: DrawProjectDetailsPageOpts): Promise<void> {
  const { company, quote, coverDataUrl, logoDataUrl, margin, contentW, pageW, pageH, showPricing } = opts;

  pdf.addPage();
  let y = margin;

  pdf.setFont('Barlow-SemiBold', 'normal');
  pdf.setFontSize(18);
  pdf.setTextColor(0, 0, 0);
  pdf.text('Project Details', margin, y);
  y += 15;

  const colW = contentW / 2 - 5;
  const col1X = margin;
  const col2X = margin + colW + 10;

  pdf.setFont('Barlow-Regular', 'normal');
  pdf.setFontSize(11);

  pdf.setFont('Barlow-SemiBold', 'normal');
  pdf.text('Client', col1X, y);
  pdf.setFont('Barlow-Regular', 'normal');
  pdf.text(quote.account?.company || quote.account?.name || 'N/A', col1X, y + 5);

  pdf.setFont('Barlow-SemiBold', 'normal');
  pdf.text('Date', col2X, y);
  pdf.setFont('Barlow-Regular', 'normal');
  const dateStr = quote.createdAt ? new Date(quote.createdAt).toLocaleDateString() : 'N/A';
  pdf.text(dateStr, col2X, y + 5);

  y += 15;

  pdf.setFont('Barlow-SemiBold', 'normal');
  pdf.text('Project', col1X, y);
  pdf.setFont('Barlow-Regular', 'normal');
  pdf.text(quote.projectName || 'N/A', col1X, y + 5);

  pdf.setFont('Barlow-SemiBold', 'normal');
  pdf.text('Email', col2X, y);
  pdf.setFont('Barlow-Regular', 'normal');
  pdf.text(company.email, col2X, y + 5);

  y += 15;

  pdf.setFont('Barlow-SemiBold', 'normal');
  pdf.text('Jobsite Address', col1X, y);
  pdf.setFont('Barlow-Regular', 'normal');
  const formattedAddress = formatJobsiteAddress(quote);
  const addressLines = pdf.splitTextToSize(formattedAddress, colW);
  pdf.text(addressLines, col1X, y + 5);

  y += Math.max(5 + addressLines.length * 5, 15);

  y += 10;
  
  // Add client logo image only if provided with proper aspect ratio
  if (coverDataUrl) {
    const maxBoxH = 120; // Maximum height for cover photo
    let imgW = contentW;
    let imgH = maxBoxH;
    
    try {
      const dims = await getImageDimensions(coverDataUrl);
      // Calculate aspect-fit dimensions to preserve the image's natural aspect ratio
      const fitted = getAspectFitBox(dims.width, dims.height, contentW, maxBoxH);
      imgW = fitted.w;
      imgH = fitted.h;
    } catch (error) {
      console.warn('Could not get cover photo dimensions, using default:', error);
    }
    
    // Center the image horizontally and vertically within the box
    const { x: imgX, y: imgY } = getCenteredOrigin(margin, y, contentW, maxBoxH, imgW, imgH);
    
    const imgFormat = detectImageFormat(coverDataUrl);
    pdf.addImage(coverDataUrl, imgFormat, imgX, imgY, imgW, imgH);
    y += maxBoxH;
  }

  // Add branded footer
  drawBrandedFooter({ pdf, logoDataUrl, company, pageW, pageH, margin });
}

export function drawApprovalDrawingSection(pdf: jsPDF, opts: DrawApprovalDrawingSectionOpts): void {
  const { quote, logoDataUrl, company, margin, contentW, pageW, pageH } = opts;
  const publicDrawing = sanitizeQuoteApprovalDrawingForPublic(quote.approvalDrawing) as any;
  if (!publicDrawing) return;

  const data = normalizeApprovalDrawingData(publicDrawing.drawingData);
  pdf.addPage();
  let y = margin;

  pdf.setFont('Barlow-SemiBold', 'normal');
  pdf.setFontSize(18);
  pdf.setTextColor(0, 0, 0);
  pdf.text('Order Approval Drawing', margin, y);
  y += 8;

  pdf.setFont('Barlow-Regular', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(90, 90, 90);
  const disclaimer = publicDrawing.disclaimer || 'Order approval layout only. Not permit/shop drawings.';
  pdf.text(pdf.splitTextToSize(disclaimer, contentW), margin, y);
  y += 18;

  const drawingX = margin;
  const drawingY = y;
  const drawingW = contentW;
  const drawingH = 95;
  const length = data.layout.overallLength.inches || data.layout.overallLength.mm || 240;
  const projection = data.layout.overallProjection.inches || data.layout.overallProjection.mm || 144;
  const ratio = Math.min(1.8, Math.max(0.65, Math.max(1, length) / Math.max(1, projection)));
  const boxW = ratio >= 1 ? Math.min(120, drawingW - 30) : 85;
  const boxH = ratio >= 1 ? Math.max(58, boxW / ratio) : 82;
  const boxX = drawingX + (drawingW - boxW) / 2;
  const boxY = drawingY + 8;

  pdf.setDrawColor(25, 25, 25);
  pdf.setLineWidth(0.8);
  pdf.rect(boxX, boxY, boxW, boxH);
  pdf.setDrawColor(210, 210, 210);
  if (data.layout.louverDirection === 'projection') {
    for (let x = boxX + 6; x < boxX + boxW; x += 7) {
      pdf.line(x, boxY, x, boxY + boxH);
    }
  } else {
    for (let lineY = boxY + 6; lineY < boxY + boxH; lineY += 7) {
      pdf.line(boxX, lineY, boxX + boxW, lineY);
    }
  }

  const sideRows = new Map(data.sides.map((side) => [side.side, side]));
  const drawSide = (side: 'A' | 'B' | 'C' | 'D', x1: number, y1: number, x2: number, y2: number, labelX: number, labelY: number) => {
    const isReference = data.orientation.referenceSide === side;
    pdf.setLineWidth(isReference ? 2.1 : 0.7);
    pdf.setLineDashPattern([], 0);
    pdf.setDrawColor(isReference ? 20 : 148, isReference ? 20 : 163, isReference ? 20 : 184);
    pdf.line(x1, y1, x2, y2);
    pdf.setLineDashPattern([], 0);
    pdf.setFont('Barlow-SemiBold', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(30, 30, 30);
    pdf.text(side, labelX, labelY, { align: 'center' });
  };

  drawSide('A', boxX, boxY, boxX + boxW, boxY, boxX + boxW / 2, boxY - 3);
  drawSide('B', boxX + boxW, boxY, boxX + boxW, boxY + boxH, boxX + boxW + 5, boxY + boxH / 2);
  drawSide('C', boxX + boxW, boxY + boxH, boxX, boxY + boxH, boxX + boxW / 2, boxY + boxH + 6);
  drawSide('D', boxX, boxY + boxH, boxX, boxY, boxX - 5, boxY + boxH / 2);

  const getFeatureColor = (type: string): [number, number, number] => {
    if (type === 'motorized_screen') return [37, 99, 235];
    if (type === 'lumon_glass_wall') return [8, 145, 178];
    if (type === 'other') return [124, 58, 237];
    return [17, 24, 39];
  };
  const drawSideFeature = (side: 'A' | 'B' | 'C' | 'D', feature: any, index: number) => {
    const offset = 8 + index * 4;
    const line =
      side === 'A'
        ? [boxX + 4, boxY + offset, boxX + boxW - 4, boxY + offset]
        : side === 'B'
          ? [boxX + boxW - offset, boxY + 4, boxX + boxW - offset, boxY + boxH - 4]
          : side === 'C'
            ? [boxX + 4, boxY + boxH - offset, boxX + boxW - 4, boxY + boxH - offset]
            : [boxX + offset, boxY + 4, boxX + offset, boxY + boxH - 4];
    const [r, g, b] = getFeatureColor(feature.type);
    pdf.setDrawColor(r, g, b);
    pdf.setLineWidth(1.1);
    pdf.setLineDashPattern(feature.type === 'motorized_screen' ? [2.5, 1.8] : [], 0);
    pdf.line(line[0], line[1], line[2], line[3]);
    pdf.setLineDashPattern([], 0);
  };
  for (const side of data.sides) {
    getApprovalDrawingSideFeatures(side).forEach((feature, index) => drawSideFeature(side.side, feature, index));
  }

  const perimeterLed = data.lights.find((light) => light.type === 'led_strip' && /perimeter|around|border|edge/i.test(light.location || ''));
  if (perimeterLed) {
    pdf.setDrawColor(245, 158, 11);
    pdf.setLineWidth(1.4);
    pdf.rect(boxX + 4, boxY + 4, boxW - 8, boxH - 8);
    pdf.setFont('Barlow-Regular', 'normal');
    pdf.setFontSize(6.5);
    pdf.setTextColor(90, 90, 90);
    pdf.text(formatApprovalDrawingLightLabel(perimeterLed), boxX + 6, boxY + 10);
  }

  pdf.setFillColor(17, 24, 39);
  for (const post of data.posts) {
    const px = boxX + post.x * boxW;
    const py = boxY + post.y * boxH;
    pdf.rect(px - 1.7, py - 1.7, 3.4, 3.4, 'F');
    pdf.setFont('Barlow-Regular', 'normal');
    pdf.setFontSize(6.5);
    pdf.setTextColor(60, 60, 60);
    pdf.text(`${post.label}${post.height?.display ? ` ${post.height.display}` : ''}`, px + 3, py - 2);
  }

  y = drawingY + drawingH + 14;
  const colW = contentW / 2 - 5;
  const details = [
    ['Dimensions', `${formatDimension(data.layout.overallLength) || 'Not set'} length x ${formatDimension(data.layout.overallProjection) || 'Not set'} projection/depth`],
    ['Mount / Reference', `${data.layout.mountType}; ${data.orientation.referenceSide} = ${data.orientation.referenceSideLabel || 'reference side'}`],
    ['Height', formatDimension(data.layout.finishedHeight) || formatDimension(data.layout.clearanceHeight) || 'See post labels'],
    ['Colors / Louvers', `Frame ${data.colors.frameColor || 'not set'}; louvers ${data.colors.louverColor || 'not set'}; ${formatApprovalDrawingLouverDirection(data.layout.louverDirection)}${data.colors.postTrimGutterColor ? `; post/trim/gutter ${data.colors.postTrimGutterColor}` : ''}`],
  ];

  pdf.setFontSize(9);
  details.forEach(([label, value], index) => {
    const x = index % 2 === 0 ? margin : margin + colW + 10;
    const rowY = y + Math.floor(index / 2) * 15;
    pdf.setFont('Barlow-SemiBold', 'normal');
    pdf.setTextColor(20, 20, 20);
    pdf.text(label, x, rowY);
    pdf.setFont('Barlow-Regular', 'normal');
    pdf.setTextColor(70, 70, 70);
    pdf.text(pdf.splitTextToSize(String(value), colW), x, rowY + 5);
  });
  y += 35;

  pdf.setFont('Barlow-SemiBold', 'normal');
  pdf.setTextColor(20, 20, 20);
  pdf.text('Side Schedule', margin, y);
  y += 6;
  pdf.setFont('Barlow-Regular', 'normal');
  pdf.setTextColor(70, 70, 70);
  for (const side of data.sides) {
    const sideFeatures = getApprovalDrawingSideFeatures(side);
    const enclosure = sideFeatures.length
      ? sideFeatures.map((feature) => formatApprovalDrawingSideFeatureType(feature.type)).join(' + ')
      : formatApprovalDrawingEnclosureType("none");
    const span = formatDimension(side.enclosureSpan || side.length);
    const height = formatDimension(side.enclosureHeight || side.openingHeight);
    const text = `Side ${side.side}: ${side.label || ''} - ${enclosure}${span ? `, span ${span}` : ''}${height ? `, height/opening ${height}` : ''}`;
    pdf.text(pdf.splitTextToSize(text, contentW), margin, y);
    y += 6;
  }

  if (data.lights.length > 0) {
    y += 2;
    pdf.setFont('Barlow-SemiBold', 'normal');
    pdf.setTextColor(20, 20, 20);
    pdf.text('Lights / Accessories', margin, y);
    y += 6;
    pdf.setFont('Barlow-Regular', 'normal');
    pdf.setTextColor(70, 70, 70);
    pdf.text(pdf.splitTextToSize(data.lights.map(formatApprovalDrawingLightLabel).join('; '), contentW), margin, y);
    y += 12;
  }

  if (publicDrawing.customerNotes) {
    y += 2;
    pdf.setFont('Barlow-SemiBold', 'normal');
    pdf.setTextColor(20, 20, 20);
    pdf.text('Customer Notes', margin, y);
    y += 6;
    pdf.setFont('Barlow-Regular', 'normal');
    pdf.setTextColor(70, 70, 70);
    pdf.text(pdf.splitTextToSize(publicDrawing.customerNotes, contentW), margin, y);
  }

  drawBrandedFooter({ pdf, logoDataUrl, company, pageW, pageH, margin });
}


function drawAcceptanceBlock(
  pdf: jsPDF, 
  x: number, 
  y: number, 
  width: number,
  signatureData?: { type: 'draw' | 'type', imageData: string, name: string } | null,
  signedDate?: Date | null,
  ipAddress?: string | null
): void {
  pdf.setFont('Barlow-SemiBold', 'normal');
  pdf.setFontSize(14);
  pdf.text('CLIENT ACCEPTANCE', x, y);
  y += 8;

  pdf.setFont('Barlow-Regular', 'normal');
  pdf.setFontSize(11);

  // Signature field
  pdf.text('Signature', x, y);
  y += 3;
  if (signatureData?.imageData) {
    // Draw signature image
    pdf.addImage(signatureData.imageData, 'PNG', x, y - 10, 60, 15);
  }
  pdf.line(x, y, x + width * 0.6, y);
  y += 12;

  // Print Name field
  pdf.text('Print Name', x, y);
  y += 3;
  if (signatureData?.name) {
    pdf.text(signatureData.name, x + 2, y - 1);
  }
  pdf.line(x, y, x + width * 0.6, y);
  y += 12;

  // Date field
  pdf.text('Date', x, y);
  y += 3;
  if (signedDate) {
    pdf.text(signedDate.toLocaleDateString(), x + 2, y - 1);
  }
  pdf.line(x, y, x + 50, y);
  y += 12;

  // IP Address field (for legal verification)
  if (ipAddress) {
    pdf.setFontSize(8);
    pdf.setTextColor(100, 100, 100);
    pdf.text(`IP: ${ipAddress}`, x, y);
    y += 8;
    pdf.setTextColor(0, 0, 0);
  }
}

function drawCompanyAcceptanceBlock(
  pdf: jsPDF, 
  x: number, 
  y: number, 
  width: number,
  signatureData?: { type: 'draw' | 'type', imageData: string, name: string } | null,
  signedDate?: Date | null,
  ipAddress?: string | null
): void {
  pdf.setFont('Barlow-SemiBold', 'normal');
  pdf.setFontSize(14);
  pdf.text('EDG PATIO & SHADE ACCEPTANCE', x, y);
  y += 8;

  pdf.setFont('Barlow-Regular', 'normal');
  pdf.setFontSize(11);

  // Signature field
  pdf.text('Signature', x, y);
  y += 3;
  if (signatureData?.imageData) {
    // Draw signature image
    pdf.addImage(signatureData.imageData, 'PNG', x, y - 10, 60, 15);
  }
  pdf.line(x, y, x + width * 0.6, y);
  y += 12;

  // Print Name field
  pdf.text('Print Name', x, y);
  y += 3;
  if (signatureData?.name) {
    pdf.text(signatureData.name, x + 2, y - 1);
  }
  pdf.line(x, y, x + width * 0.6, y);
  y += 12;

  // Date field
  pdf.text('Date', x, y);
  y += 3;
  if (signedDate) {
    pdf.text(signedDate.toLocaleDateString(), x + 2, y - 1);
  }
  pdf.line(x, y, x + 50, y);
  y += 12;

  // IP Address field (for legal verification)
  if (ipAddress) {
    pdf.setFontSize(8);
    pdf.setTextColor(100, 100, 100);
    pdf.text(`IP: ${ipAddress}`, x, y);
    y += 8;
    pdf.setTextColor(0, 0, 0);
  }
}

function drawCompactAcceptanceBlock(
  pdf: jsPDF, 
  x: number, 
  y: number, 
  width: number,
  signatureData?: { type: 'draw' | 'type', imageData: string, name: string } | null,
  signedDate?: Date | null,
  ipAddress?: string | null
): void {
  pdf.setFont('Barlow-SemiBold', 'normal');
  pdf.setFontSize(11);
  pdf.text('CLIENT ACCEPTANCE', x, y);
  y += 6;

  pdf.setFont('Barlow-Regular', 'normal');
  pdf.setFontSize(9);

  // Signature field
  pdf.text('Signature', x, y);
  y += 2;
  if (signatureData?.imageData) {
    // Draw signature image (scaled down for compact mode)
    pdf.addImage(signatureData.imageData, 'PNG', x, y - 8, 40, 10);
  }
  pdf.line(x, y, x + width * 0.8, y);
  y += 8;

  // Print Name field
  pdf.text('Print Name', x, y);
  y += 2;
  if (signatureData?.name) {
    pdf.text(signatureData.name, x + 2, y - 1);
  }
  pdf.line(x, y, x + width * 0.8, y);
  y += 8;

  // Date field
  pdf.text('Date', x, y);
  y += 2;
  if (signedDate) {
    pdf.text(signedDate.toLocaleDateString(), x + 2, y - 1);
  }
  pdf.line(x, y, x + 40, y);
  y += 8;

  // IP Address field (for legal verification)
  if (ipAddress) {
    pdf.setFontSize(7);
    pdf.setTextColor(100, 100, 100);
    pdf.text(`IP: ${ipAddress}`, x, y);
    y += 6;
    pdf.setTextColor(0, 0, 0);
  }
}

function drawCompactCompanyAcceptanceBlock(
  pdf: jsPDF, 
  x: number, 
  y: number, 
  width: number,
  signatureData?: { type: 'draw' | 'type', imageData: string, name: string } | null,
  signedDate?: Date | null,
  ipAddress?: string | null
): void {
  pdf.setFont('Barlow-SemiBold', 'normal');
  pdf.setFontSize(11);
  pdf.text('EDG ACCEPTANCE', x, y);
  y += 6;

  pdf.setFont('Barlow-Regular', 'normal');
  pdf.setFontSize(9);

  // Signature field
  pdf.text('Signature', x, y);
  y += 2;
  if (signatureData?.imageData) {
    // Draw signature image (scaled down for compact mode)
    pdf.addImage(signatureData.imageData, 'PNG', x, y - 8, 40, 10);
  }
  pdf.line(x, y, x + width * 0.8, y);
  y += 8;

  // Print Name field
  pdf.text('Print Name', x, y);
  y += 2;
  if (signatureData?.name) {
    pdf.text(signatureData.name, x + 2, y - 1);
  }
  pdf.line(x, y, x + width * 0.8, y);
  y += 8;

  // Date field
  pdf.text('Date', x, y);
  y += 2;
  if (signedDate) {
    pdf.text(signedDate.toLocaleDateString(), x + 2, y - 1);
  }
  pdf.line(x, y, x + 40, y);
  y += 8;

  // IP Address field (for legal verification)
  if (ipAddress) {
    pdf.setFontSize(7);
    pdf.setTextColor(100, 100, 100);
    pdf.text(`IP: ${ipAddress}`, x, y);
    y += 6;
    pdf.setTextColor(0, 0, 0);
  }
}

export async function drawRenderingsPages(pdf: jsPDF, opts: DrawRenderingsPagesOpts): Promise<void> {
  const { images, logoDataUrl, company, margin, contentW, pageW, pageH } = opts;

  if (images.length === 0) return;

  pdf.addPage();
  let y = margin;

  pdf.setFont('Barlow-SemiBold', 'normal');
  pdf.setFontSize(18);
  pdf.setTextColor(0, 0, 0);
  pdf.text('Visuals & Details', margin, y);
  y += 15;

  const gap = 10;
  const maxBoxH = 140; // Maximum height for each image box (adjust for page layout)

  let currentPage = 0;

  for (let imgIndex = 0; imgIndex < images.length; imgIndex++) {
    const img = images[imgIndex];
    const format = detectImageFormat(img.dataUrl);

    // Get actual image dimensions
    let imgW = contentW;
    let imgH = maxBoxH;
    
    try {
      const dims = await getImageDimensions(img.dataUrl);
      // Calculate aspect-fit dimensions to preserve the image's natural aspect ratio
      const fitted = getAspectFitBox(dims.width, dims.height, contentW, maxBoxH);
      imgW = fitted.w;
      imgH = fitted.h;
    } catch (error) {
      console.warn('Could not get image dimensions, using default:', error);
      // Fall back to default dimensions if we can't get the natural size
    }

    // Check if we need a new page (if current image won't fit)
    const spaceNeeded = maxBoxH + gap;
    const footerSpace = 30;
    const availableSpace = pageH - y - margin - footerSpace;

    if (availableSpace < spaceNeeded && imgIndex > 0) {
      // Add a new page
      pdf.addPage();
      y = margin;

      pdf.setFont('Barlow-SemiBold', 'normal');
      pdf.setFontSize(18);
      pdf.text('Visuals & Details (cont.)', margin, y);
      y += 15;
      currentPage++;
    }

    // Center the image horizontally and vertically within the box
    const { x: imgX, y: imgY } = getCenteredOrigin(margin, y, contentW, maxBoxH, imgW, imgH);

    pdf.addImage(img.dataUrl, format, imgX, imgY, imgW, imgH);

    y += maxBoxH + gap;
  }

  // Add branded footer to the last page
  drawBrandedFooter({ pdf, logoDataUrl, company, pageW, pageH, margin });
}

function detectImageFormat(dataUrl: string): 'PNG' | 'JPEG' {
  if (dataUrl.startsWith('data:image/png')) return 'PNG';
  return 'JPEG';
}

function isFallbackBrandImage(dataUrl: string): boolean {
  return /^data:image\/(png|jpeg|jpg);base64,/i.test(dataUrl) && dataUrl.length < 200;
}

export function drawLineItemsSection(pdf: jsPDF, opts: DrawLineItemsSectionOpts): void {
  const { quote, showPricing, logoDataUrl, company, margin, contentW, pageW, pageH, groups = [] } = opts;

  const lineItems = quote.lineItems || [];
  if (lineItems.length === 0) return;

  pdf.addPage();
  let y = margin;

  const drawHeader = (title: string) => {
    pdf.setFont('Barlow-SemiBold', 'normal');
    pdf.setFontSize(18);
    pdf.setTextColor(0, 0, 0);
    pdf.text(title, margin, y);
    y += 12;

    pdf.setFontSize(11);
    pdf.setDrawColor(200, 200, 200);

    if (showPricing) {
      const descW = contentW * 0.5;
      const qtyW = contentW * 0.15;
      const priceW = contentW * 0.17;
      const totalW = contentW * 0.18;

      pdf.text('Description', margin, y);
      pdf.text('Qty', margin + descW, y);
      pdf.text('Price', margin + descW + qtyW, y);
      pdf.text('Total', margin + descW + qtyW + priceW, y);

      y += 2;
      pdf.line(margin, y, margin + contentW, y);
      y += 5;
    } else {
      const descW = contentW * 0.75;
      const qtyW = contentW * 0.25;

      pdf.text('Description', margin, y);
      pdf.text('Qty', margin + descW, y);

      y += 2;
      pdf.line(margin, y, margin + contentW, y);
      y += 5;
    }
  };

  drawHeader('Line Items');

  pdf.setFont('Barlow-Regular', 'normal');
  pdf.setFontSize(10);

  // Process items: aggregate grouped items, keep ungrouped items individual
  interface DisplayItem {
    description: string;
    quantity: number;
    total: number;
    colorText: string;
    isGroup: boolean;
  }

  const displayItems: DisplayItem[] = [];
  const groupsMap = new Map<string, PdfGroup>();
  groups.forEach(g => groupsMap.set(g.id, g));

  // Separate items into grouped and ungrouped
  const ungroupedItems: any[] = [];
  const groupedItemsMap = new Map<string, any[]>();

  lineItems.forEach((item: any) => {
    if (item.groupId && groupsMap.has(item.groupId)) {
      const existing = groupedItemsMap.get(item.groupId) || [];
      existing.push(item);
      groupedItemsMap.set(item.groupId, existing);
    } else {
      ungroupedItems.push(item);
    }
  });

  // Add ungrouped items individually
  ungroupedItems.forEach((item: any) => {
    let colorText = '';
    try {
      const configData = item.configData ? (typeof item.configData === 'string' ? JSON.parse(item.configData) : item.configData) : null;
      if (configData?.colors && Array.isArray(configData.colors) && configData.colors.length > 0) {
        const colorNames = configData.colors.map((c: any) => c.name).join(', ');
        colorText = `Colors: ${colorNames}`;
      }
    } catch (e) {}

    const total = calculateLineItemTotal(
      item.quantity,
      item.unitPrice,
      item.markupType,
      item.markupValue,
      item.discountType || 'percentage',
      item.discountValue || 0,
      quote.tariffRate || 0,
      item.isTariffApplicable || false
    );

    displayItems.push({
      description: item.description || '',
      quantity: parseFloat(item.quantity || '0'),
      total,
      colorText,
      isGroup: false
    });
  });

  // Add grouped items as single aggregated lines (sorted by group position)
  const sortedGroups = [...groups].sort((a, b) => a.position - b.position);
  sortedGroups.forEach(group => {
    const items = groupedItemsMap.get(group.id);
    if (!items || items.length === 0) return;

    let aggregatedTotal = 0;
    let aggregatedQty = 0;

    items.forEach((item: any) => {
      const itemTotal = calculateLineItemTotal(
        item.quantity,
        item.unitPrice,
        item.markupType,
        item.markupValue,
        item.discountType || 'percentage',
        item.discountValue || 0,
        quote.tariffRate || 0,
        item.isTariffApplicable || false
      );
      aggregatedTotal += itemTotal;
      aggregatedQty += parseFloat(item.quantity || '0');
    });

    displayItems.push({
      description: group.title,
      quantity: 1,
      total: aggregatedTotal,
      colorText: '',
      isGroup: true
    });
  });

  displayItems.forEach((item: DisplayItem, index: number) => {
    const descLines = pdf.splitTextToSize(item.description || '', contentW * 0.48);
    const colorLines = item.colorText ? pdf.splitTextToSize(item.colorText, contentW * 0.48) : [];
    const rowHeight = Math.max((descLines.length + colorLines.length) * 5, 8);

    // Track if we need to draw header after page break
    let newPageY: number | null = null;
    ensureSpace(pdf, y, rowHeight, {
      marginTop: margin,
      marginBottom: margin,
      footerReserve: 0,
      onNewPage: () => {
        // Draw continuation header and track the y position after it
        let headerY = margin;
        pdf.setFont('Barlow-SemiBold', 'normal');
        pdf.setFontSize(18);
        pdf.setTextColor(0, 0, 0);
        pdf.text('Line Items (cont.)', margin, headerY);
        headerY += 12;

        pdf.setFontSize(11);
        pdf.setDrawColor(200, 200, 200);

        if (showPricing) {
          const descW = contentW * 0.5;
          const qtyW = contentW * 0.15;
          const priceW = contentW * 0.17;

          pdf.text('Description', margin, headerY);
          pdf.text('Qty', margin + descW, headerY);
          pdf.text('Price', margin + descW + qtyW, headerY);
          pdf.text('Total', margin + descW + qtyW + priceW, headerY);

          headerY += 2;
          pdf.line(margin, headerY, margin + contentW, headerY);
          headerY += 5;
        } else {
          const descW = contentW * 0.75;

          pdf.text('Description', margin, headerY);
          pdf.text('Qty', margin + descW, headerY);

          headerY += 2;
          pdf.line(margin, headerY, margin + contentW, headerY);
          headerY += 5;
        }
        
        // Reset font for line items
        pdf.setFont('Barlow-Regular', 'normal');
        pdf.setFontSize(10);
        
        newPageY = headerY;
      },
    });
    
    // Use the tracked y position from header if we had a page break, otherwise use returned value
    if (newPageY !== null) {
      y = newPageY;
    }

    // Reset font for each item to regular to ensure consistency
    pdf.setFont('Barlow-Regular', 'normal');

    if (showPricing) {
      const descW = contentW * 0.5;
      const qtyW = contentW * 0.15;
      const priceW = contentW * 0.17;

      pdf.text(descLines, margin, y);
      
      // Add colors below description if they exist
      if (colorLines.length > 0) {
        const colorY = y + (descLines.length * 5);
        pdf.setFontSize(9);
        pdf.setTextColor(100, 100, 100);
        pdf.text(colorLines, margin, colorY);
        pdf.setFontSize(10);
        pdf.setTextColor(0, 0, 0);
      }

      const qty = item.quantity;
      const total = item.total;
      const unitPrice = qty > 0 ? total / qty : 0;

      pdf.text(qty.toString(), margin + descW, y);
      pdf.text(formatCurrency(unitPrice), margin + descW + qtyW, y);
      pdf.text(formatCurrency(total), margin + descW + qtyW + priceW, y);
    } else {
      const descW = contentW * 0.75;

      pdf.text(descLines, margin, y);
      
      // Add colors below description if they exist
      if (colorLines.length > 0) {
        const colorY = y + (descLines.length * 5);
        pdf.setFontSize(9);
        pdf.setTextColor(100, 100, 100);
        pdf.text(colorLines, margin, colorY);
        pdf.setFontSize(10);
        pdf.setTextColor(0, 0, 0);
      }
      
      pdf.text(item.quantity.toString(), margin + descW, y);
    }

    // Reset font for next item
    pdf.setFont('Barlow-Regular', 'normal');
    y += rowHeight + 2;
  });

  // Calculate footer reserve height to prevent overlap
  const disclaimerText = 'This quote is for estimation purposes and is not a guarantee of cost for services. Quote is based on current information from manufacturer about the project requirements. Actual cost may change once project elements are finalized. Client will be notified of any changes in cost prior to them being incurred.';
  pdf.setFont('Barlow-Regular', 'normal');
  pdf.setFontSize(8);
  const disclaimerLines = pdf.splitTextToSize(disclaimerText, contentW);
  const disclaimerHeight = disclaimerLines.length * 3;
  const footerReserveHeight = 25 + disclaimerHeight + 5; // Footer + disclaimer + gap

  // Investment Summary - Always visible (per spec)
  y += 10;
  pdf.setFont('Barlow-SemiBold', 'normal');
  pdf.setFontSize(14);
  
  y = ensureSpace(pdf, y, 60, {
    marginTop: margin,
    marginBottom: margin,
    footerReserve: footerReserveHeight,
    onNewPage: () => {
      y = margin;
    },
  });
  
  pdf.text('Investment Summary', margin, y);
  y += 8;

  const totals = calculateQuoteTotals(
    quote.lineItems || [],
    quote.taxRate || 0,
    quote.discount || 0,
    quote.shipping || 0,
    quote.isShippingTaxable || false,
    quote.tariffRate || 0
  );

  pdf.setFont('Barlow-Regular', 'normal');
  pdf.setFontSize(11);

  const summaryItems = [
    { label: 'Subtotal', value: totals.subtotal },
  ];
  
  // Add discount if it exists
  if (totals.discountAmount > 0) {
    summaryItems.push({ label: 'Discount', value: -totals.discountAmount });
  }
  
  summaryItems.push(
    { label: 'Shipping', value: totals.shippingAmount },
    { label: 'Tax', value: totals.taxAmount }
  );

  summaryItems.forEach(item => {
    pdf.text(item.label, margin, y);
    pdf.text(formatCurrency(item.value), margin + contentW - 30, y, { align: 'right' });
    y += 6;
  });

  y += 2;
  pdf.setFont('Barlow-SemiBold', 'normal');
  pdf.setFontSize(12);
  pdf.text('Total', margin, y);
  pdf.text(formatCurrency(totals.total), margin + contentW - 30, y, { align: 'right' });
  y += 7;

  const planningCreditAmount = quote.planningAgreement?.status === 'credited'
    ? Math.max(0, Number(quote.planningAgreement.appliedCreditAmount || 0))
    : 0;

  if (planningCreditAmount > 0) {
    pdf.setFont('Barlow-Regular', 'normal');
    pdf.setFontSize(11);
    pdf.text('Planning Fee Credit', margin, y);
    pdf.text(`-${formatCurrency(planningCreditAmount)}`, margin + contentW - 30, y, { align: 'right' });
    y += 6;

    pdf.setFont('Barlow-SemiBold', 'normal');
    pdf.setFontSize(12);
    pdf.text('Amount Due After Credit', margin, y);
    pdf.text(formatCurrency(Math.max(0, totals.total - planningCreditAmount)), margin + contentW - 30, y, { align: 'right' });
    y += 5;
  }

  y += 11;

  // Client Acceptance Block - positioned at bottom of page
  const acceptanceH = measureAcceptanceBlock(pdf, {
    heading: 'CLIENT ACCEPTANCE',
    width: contentW,
    headingFontSizePt: 14,
    bodyFontSizePt: 11,
    spacingTop: 10,
    spacingAfterHeading: 8,
    fieldGap: 8,
    labelGap: 2,
    bottomPadding: 5,
    fields: [
      { label: 'Signature', lineWidthMm: contentW * 0.6 },
      { label: 'Print Name', lineWidthMm: contentW * 0.6 },
      { label: 'Date', lineWidthMm: 50 },
    ],
  }) + (quote.clientSignedIp ? 8 : 0); // Add space for IP address if present

  // Ensure space for signature, pushing to bottom when possible
  const targetSignatureY = pageH - footerReserveHeight - acceptanceH - 10;
  let signatureY = y;
  
  // If current position is above target, push to bottom
  if (y + acceptanceH < targetSignatureY) {
    signatureY = targetSignatureY;
  } else {
    // Otherwise ensure space at current position
    signatureY = ensureSpace(pdf, y, acceptanceH, {
      marginTop: margin,
      marginBottom: margin,
      footerReserve: footerReserveHeight,
      onNewPage: () => {
        // If new page, position at bottom of that page
        signatureY = pageH - footerReserveHeight - acceptanceH - 10;
      },
    });
    
    // If ensureSpace returned a new page, update position
    if (signatureY === margin) {
      signatureY = pageH - footerReserveHeight - acceptanceH - 10;
    }
  }
  
  drawAcceptanceBlock(
    pdf, 
    margin, 
    signatureY, 
    contentW,
    quote.clientSignatureData,
    quote.clientSignedAt ? new Date(quote.clientSignedAt) : null,
    quote.clientSignedIp || null
  );

  // Add disclaimer text above the footer
  const disclaimerY = pageH - 25 - 5; // Footer height + gap
  
  pdf.setFont('Barlow-Regular', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(120, 120, 120);
  
  pdf.text(disclaimerLines, pageW / 2, disclaimerY - disclaimerHeight, { align: 'center' });

  // Add branded footer (no initials on signature page)
  drawBrandedFooter({ pdf, logoDataUrl, company, pageW, pageH, margin, showInitials: false });
}

export function drawContractSection(pdf: jsPDF, opts: DrawContractSectionOpts): void {
  const { contractText, logoDataUrl, company, margin, contentW, pageW, pageH, quote } = opts;

  if (!contractText || contractText.trim() === '') return;

  pdf.addPage();
  let y = margin;

  const drawHeader = (title: string) => {
    pdf.setFont('Barlow-SemiBold', 'normal');
    pdf.setFontSize(18);
    pdf.setTextColor(0, 0, 0);
    pdf.text(title, margin, y);
    y += 12;
  };

  drawHeader('Terms & Conditions');

  pdf.setFont('Barlow-Regular', 'normal');
  pdf.setFontSize(10);

  const paragraphs = contractText.split(/\n\s*\n/);

  paragraphs.forEach(para => {
    const trimmed = para.trim();
    if (!trimmed) return;

    const lines = pdf.splitTextToSize(trimmed, contentW);
    const paraHeight = lines.length * 5 + 5;
    const headerHeight = 12; // Height of continuation header

    // Check if we need a new page (including space for header if it's a new page)
    if (y + paraHeight > pageH - margin) {
      const currentPage = pdf.getNumberOfPages();
      
      pdf.addPage();
      
      // Draw footer on the previous page
      pdf.setPage(currentPage);
      drawBrandedFooter({ pdf, logoDataUrl, company, pageW, pageH, margin });
      
      // Go back to the new page
      pdf.setPage(currentPage + 1);
      
      y = margin;
      pdf.setFont('Barlow-SemiBold', 'normal');
      pdf.setFontSize(18);
      pdf.text('Terms & Conditions (cont.)', margin, y);
      y += headerHeight;
      pdf.setFont('Barlow-Regular', 'normal');
      pdf.setFontSize(10);
    }

    pdf.text(lines, margin, y);
    y += lines.length * 5 + 5;
  });

  // Add side-by-side signatures after contract
  y += 15; // Add spacing after contract text
  
  // Calculate signature block dimensions
  const signatureBlockWidth = (contentW - 10) / 2; // 10mm gap between signatures
  const col1X = margin;
  const col2X = margin + signatureBlockWidth + 10;

  // Check if we need a new page for signatures (need ~35mm for compact signatures)
  if (y + 35 > pageH - margin - 25) { // 25mm for footer
    const currentPage = pdf.getNumberOfPages();
    
    pdf.addPage();
    
    // Draw footer on the previous page
    pdf.setPage(currentPage);
    drawBrandedFooter({ pdf, logoDataUrl, company, pageW, pageH, margin });
    
    // Go back to the new page
    pdf.setPage(currentPage + 1);
    
    y = margin;
  }

  // Draw both signatures side by side
  drawCompactAcceptanceBlock(
    pdf, 
    col1X, 
    y, 
    signatureBlockWidth,
    quote?.clientSignatureData,
    quote?.clientSignedAt ? new Date(quote.clientSignedAt) : null,
    quote?.clientSignedIp || null
  );
  drawCompactCompanyAcceptanceBlock(
    pdf, 
    col2X, 
    y, 
    signatureBlockWidth,
    quote?.companySignatureData,
    quote?.companySignedAt ? new Date(quote.companySignedAt) : null,
    quote?.companySignedIp || null
  );

  // Add branded footer to the last page (no initials since signatures are here)
  drawBrandedFooter({ pdf, logoDataUrl, company, pageW, pageH, margin, showInitials: false });
}

export function drawBrandedBackPage(pdf: jsPDF, opts: DrawBrandedBackPageOpts): void {
  const { backPageDataUrl, pageW, pageH, margin } = opts;

  pdf.addPage();

  if (isFallbackBrandImage(backPageDataUrl)) {
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, pageW, pageH, 'F');
    pdf.setDrawColor(...EDG_TEAL);
    pdf.setLineWidth(1.2);
    pdf.line(margin, pageH / 2 - 12, pageW - margin, pageH / 2 - 12);
    pdf.setFont('Barlow-SemiBold', 'normal');
    pdf.setFontSize(20);
    pdf.setTextColor(17, 24, 39);
    pdf.text('Thank you', pageW / 2, pageH / 2, { align: 'center' });
    pdf.setFont('Barlow-Regular', 'normal');
    pdf.setFontSize(11);
    pdf.setTextColor(80, 80, 80);
    pdf.text('EDG Patio & Shade', pageW / 2, pageH / 2 + 10, { align: 'center' });
    return;
  }

  // Display the custom back page image full-page
  const format = detectImageFormat(backPageDataUrl);
  pdf.addImage(backPageDataUrl, format, 0, 0, pageW, pageH);
}
