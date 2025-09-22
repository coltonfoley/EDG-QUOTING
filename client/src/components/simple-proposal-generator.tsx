import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { FileText, Upload, X, Download, Loader2, Eye, Image, Camera } from 'lucide-react';
import { formatCurrency, calculateQuoteTotals } from '@/lib/utils';
import type { QuoteWithDetails } from '@shared/schema';
import jsPDF from 'jspdf';

interface SimpleProposalGeneratorProps {
  quote: QuoteWithDetails;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface UploadedFile {
  id: string;
  file: File;
  preview: string;
  name: string;
}

export function SimpleProposalGenerator({ quote, open, onOpenChange }: SimpleProposalGeneratorProps) {
  const [showPricing, setShowPricing] = useState(true);
  const [includeCoverPage, setIncludeCoverPage] = useState(false);
  const [coverPhoto, setCoverPhoto] = useState<UploadedFile | null>(null);
  const [productRenderings, setProductRenderings] = useState<UploadedFile[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Contract state and logic
  const hasContractData = !!(quote.contractTemplate || quote.customContractTerms);
  const [includeContract, setIncludeContract] = useState(hasContractData);
  const { toast } = useToast();
  
  const coverPhotoRef = useRef<HTMLInputElement>(null);
  const renderingsRef = useRef<HTMLInputElement>(null);

  const totals = calculateQuoteTotals(
    quote.lineItems.map(item => ({
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      markupType: item.markupType,
      markupValue: item.markupValue,
    })),
    quote.taxRate ?? 0,
    quote.discount ?? 0,
    quote.shipping ?? 0
  );

  const handleFileUpload = (
    files: FileList | null, 
    type: 'cover' | 'renderings'
  ) => {
    if (!files) return;

    const fileArray = Array.from(files);
    const validFiles = fileArray.filter(file => {
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Invalid file type",
          description: "Please upload only image files",
          variant: "destructive"
        });
        return false;
      }
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        toast({
          title: "File too large",
          description: "Please upload files smaller than 10MB",
          variant: "destructive"
        });
        return false;
      }
      return true;
    });

    if (type === 'cover' && validFiles.length > 0) {
      const file = validFiles[0];
      const uploadedFile: UploadedFile = {
        id: Date.now().toString(),
        file,
        preview: URL.createObjectURL(file),
        name: file.name
      };
      setCoverPhoto(uploadedFile);
    } else if (type === 'renderings') {
      const newRenderings = validFiles.map(file => ({
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        file,
        preview: URL.createObjectURL(file),
        name: file.name
      }));
      setProductRenderings(prev => [...prev, ...newRenderings].slice(0, 5)); // Max 5 images
    }
  };

  // Helper function to detect image format for PDF
  const getImageFormat = (file: File): string => {
    const mimeType = file.type.toLowerCase();
    if (mimeType === 'image/png') return 'PNG';
    if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return 'JPEG';
    if (mimeType === 'image/gif') return 'GIF';
    // Default to JPEG for other formats or if we need to convert
    return 'JPEG';
  };

  // Helper function to convert unsupported formats to supported ones
  const convertImageToSupportedFormat = async (file: File, targetFormat: 'PNG' | 'JPEG' = 'JPEG'): Promise<string> => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = document.createElement('img') as HTMLImageElement;
      
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        
        if (ctx) {
          // Clear canvas with white background for JPEG (since JPEG doesn't support transparency)
          if (targetFormat === 'JPEG') {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
          
          ctx.drawImage(img, 0, 0);
          
          const mimeType = targetFormat === 'PNG' ? 'image/png' : 'image/jpeg';
          const quality = targetFormat === 'JPEG' ? 0.9 : undefined;
          
          canvas.toBlob((blob) => {
            if (blob) {
              const url = URL.createObjectURL(blob);
              resolve(url);
            } else {
              reject(new Error('Failed to convert image'));
            }
          }, mimeType, quality);
        } else {
          reject(new Error('Failed to get canvas context'));
        }
      };
      
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = URL.createObjectURL(file);
    });
  };

  // Helper function to get the appropriate image data and format for PDF
  const getImageDataForPDF = async (uploadedFile: UploadedFile): Promise<{ dataUrl: string; format: string }> => {
    const format = getImageFormat(uploadedFile.file);
    
    // Check if format needs conversion (WebP or other unsupported formats)
    if (uploadedFile.file.type === 'image/webp' || !['PNG', 'JPEG', 'GIF'].includes(format)) {
      try {
        // Convert WebP and other unsupported formats to JPEG
        const convertedUrl = await convertImageToSupportedFormat(uploadedFile.file, 'JPEG');
        return { dataUrl: convertedUrl, format: 'JPEG' };
      } catch (error) {
        console.warn('Failed to convert image format, falling back to original:', error);
        return { dataUrl: uploadedFile.preview, format: 'JPEG' };
      }
    }
    
    return { dataUrl: uploadedFile.preview, format };
  };

  const removeFile = (id: string, type: 'cover' | 'renderings') => {
    if (type === 'cover') {
      if (coverPhoto?.preview) {
        URL.revokeObjectURL(coverPhoto.preview);
      }
      setCoverPhoto(null);
    } else {
      setProductRenderings(prev => {
        const removed = prev.find(img => img.id === id);
        if (removed?.preview) {
          URL.revokeObjectURL(removed.preview);
        }
        return prev.filter(img => img.id !== id);
      });
    }
  };

  const generatePDF = async () => {
    setIsGenerating(true);
    try {
      // Professional document setup - US Letter size
      const pdf = new jsPDF('p', 'mm', 'letter');
      const pageWidth = 215.9; // Letter width in mm
      const pageHeight = 279.4; // Letter height in mm
      const margin = 19; // Professional margins (3/4 inch)
      const contentWidth = pageWidth - (2 * margin);
      let yPosition = margin;
      let currentPage = 1;
      
      // Professional typography scale and brand tokens
      const fonts = {
        heading: { size: 16, weight: 'bold' },
        subheading: { size: 14, weight: 'bold' },
        body: { size: 10, weight: 'normal' },
        small: { size: 9, weight: 'normal' },
        caption: { size: 8, weight: 'normal' }
      };
      
      const colors = {
        primary: [0, 0, 0], // Black
        accent: [66, 255, 193], // EDG Teal
        gray: [128, 128, 128],
        lightGray: [240, 240, 240]
      };
      
      // Company information
      const company = {
        name: 'EDG Patio & Shade',
        address1: '1802 Holian Drive',
        address2: 'Spring Grove, IL 60081',
        email: 'info@edgfurniture.com',
        phone: '+1 (815) 581-0138',
        website: 'www.edgfurniture.com'
      };
      
      // Professional drawing utilities
      const setFont = (type: keyof typeof fonts) => {
        pdf.setFontSize(fonts[type].size);
        pdf.setFont('helvetica', fonts[type].weight as any);
      };
      
      const setColor = (colorKey: keyof typeof colors) => {
        const [r, g, b] = colors[colorKey];
        pdf.setTextColor(r, g, b);
      };
      
      const checkPageBreak = (heightNeeded: number) => {
        if (yPosition + heightNeeded > pageHeight - margin - 15) { // Leave space for footer
          addNewPage();
          return true;
        }
        return false;
      };
      
      const addNewPage = () => {
        pdf.addPage();
        currentPage++;
        yPosition = margin + 20; // Leave space for header
        drawHeader();
        drawFooter();
      };
      
      const drawHeader = () => {
        // Skip header on cover page - cover has its own branding
        if (includeCoverPage && currentPage === 1) return;
        
        // Company header on every page (except cover)
        const headerY = margin;
        setFont('subheading');
        setColor('primary');
        pdf.text(company.name, margin, headerY);
        
        setFont('caption');
        pdf.text(company.address1, margin, headerY + 4);
        pdf.text(company.address2, margin, headerY + 8);
        
        // Contact info on right
        const rightX = pageWidth - margin;
        pdf.text(company.email, rightX, headerY, { align: 'right' });
        pdf.text(company.phone, rightX, headerY + 4, { align: 'right' });
        pdf.text(company.website, rightX, headerY + 8, { align: 'right' });
        
        // Header line
        pdf.setDrawColor(200, 200, 200);
        pdf.setLineWidth(0.5);
        pdf.line(margin, headerY + 12, pageWidth - margin, headerY + 12);
      };
      
      const drawFooter = () => {
        // ABSOLUTELY NO PAGE NUMBERS ON COVER PAGE - SKIP ENTIRELY
        if (includeCoverPage && currentPage === 1) {
          return; // Cover page has its own custom footer band
        }
        
        // Only draw page numbers on content pages (page 2+)
        const footerY = pageHeight - margin - 2;
        setFont('caption');
        setColor('gray');
        
        // Page numbers for content pages only
        const totalPages = pdf.getNumberOfPages();
        pdf.text(`Page ${currentPage} of ${totalPages}`, pageWidth / 2, footerY, { align: 'center' });
      };
      
      const drawEstimateHeader = () => {
        setFont('heading');
        setColor('primary');
        pdf.text('ESTIMATE', margin, yPosition);
        yPosition += 12;
      };
      
      const drawAddresses = () => {
        const leftCol = margin;
        const rightCol = margin + (contentWidth / 2);
        const startY = yPosition;
        
        // Bill To
        setFont('body');
        setColor('primary');
        pdf.text('Bill to', leftCol, yPosition);
        yPosition += 6;
        
        setFont('body');
        const customer = quote.account ?? quote.customer;
        pdf.text(customer.name, leftCol, yPosition);
        yPosition += 4;
        if (customer.company) {
          pdf.text(customer.company, leftCol, yPosition);
          yPosition += 4;
        }
        if (customer.billingAddress) {
          const billingLines = pdf.splitTextToSize(customer.billingAddress, (contentWidth / 2) - 10);
          for (const line of billingLines) {
            pdf.text(line, leftCol, yPosition);
            yPosition += 4;
          }
        }
        
        // Ship To (reset y to start position for right column)
        const shipToY = startY;
        pdf.text('Ship to', rightCol, shipToY);
        
        let shipY = shipToY + 6;
        pdf.text(customer.name, rightCol, shipY);
        shipY += 4;
        if (quote.projectAddress) {
          const addressLines = pdf.splitTextToSize(quote.projectAddress, (contentWidth / 2) - 10);
          for (const line of addressLines) {
            pdf.text(line, rightCol, shipY);
            shipY += 4;
          }
        }
        
        yPosition += 8; // Extra spacing after addresses
      };
      
      const drawEstimateDetails = () => {
        yPosition += 10;
        
        setFont('body');
        setColor('primary');
        
        // Create a simple details grid
        const detailsY = yPosition;
        pdf.text('Estimate details', margin, detailsY);
        yPosition += 8;
        
        // Estimate number and date
        pdf.text(`Estimate no.: ${quote.id}`, margin, yPosition);
        yPosition += 4;
        
        const estimateDate = new Date().toLocaleDateString('en-US', {
          month: '2-digit',
          day: '2-digit', 
          year: 'numeric'
        });
        pdf.text(`Estimate date: ${estimateDate}`, margin, yPosition);
        yPosition += 15;
      };
      
      const drawProfessionalTable = () => {
        if (quote.lineItems.length === 0) return;
        
        // Table configuration
        const tableStartY = yPosition;
        const rowHeight = 12;
        const headerHeight = 8;
        
        // Column configuration - matches EDG example
        const columns = [
          { header: '#', width: 8, align: 'left' },
          { header: 'Date', width: 15, align: 'left' },
          { header: 'Product or service', width: 45, align: 'left' },
          { header: 'SKU', width: 20, align: 'left' },
          { header: 'Description', width: 65, align: 'left' },
          { header: 'Qty', width: 12, align: 'center' },
          { header: 'Rate', width: 20, align: 'right' },
          { header: 'Amount', width: 20, align: 'right' }
        ];
        
        const totalTableWidth = columns.reduce((sum, col) => sum + col.width, 0);
        const tableX = margin;
        
        const drawTableHeader = () => {
          setFont('body');
          setColor('primary');
          
          let currentX = tableX;
          
          columns.forEach(col => {
            let textX = currentX;
            if (col.align === 'center') textX = currentX + (col.width / 2);
            else if (col.align === 'right') textX = currentX + col.width;
            
            const align = col.align === 'center' ? 'center' : col.align === 'right' ? 'right' : 'left';
            pdf.text(col.header, textX, yPosition, { align: align as any });
            currentX += col.width;
          });
          
          yPosition += headerHeight;
          
          // Header underline
          pdf.setDrawColor(0, 0, 0);
          pdf.setLineWidth(0.5);
          pdf.line(tableX, yPosition, tableX + totalTableWidth, yPosition);
          yPosition += 3;
        };
        
        const drawTableRow = (item: any, index: number) => {
          const qty = parseFloat(item.quantity.toString());
          const price = parseFloat(item.unitPrice.toString());
          const markup = parseFloat(item.markupValue.toString());
          const baseTotal = qty * price;
          const total = item.markupType === 'percentage' 
            ? baseTotal + (baseTotal * (markup / 100))
            : baseTotal + markup;
          
          // Check if row needs multiple lines for description
          const maxDescWidth = columns[4].width - 2;
          const descLines = pdf.splitTextToSize(item.description, maxDescWidth);
          const actualRowHeight = Math.max(rowHeight, descLines.length * 4 + 4);
          
          // Check for page break and redraw header if needed
          if (checkPageBreak(actualRowHeight + 5)) {
            drawTableHeader();
          }
          
          setFont('small');
          setColor('primary');
          
          let currentX = tableX;
          const baseY = yPosition;
          
          // Row data
          const rowData = [
            (index + 1).toString(), // #
            '', // Date (empty in example)
            item.description.split(' ').slice(0, 3).join(' '), // Product name (abbreviated)
            item.description.split(' ').slice(0, 2).join(' '), // SKU (abbreviated)
            item.description, // Full description
            qty.toString(),
            formatCurrency(price),
            formatCurrency(total)
          ];
          
          columns.forEach((col, colIndex) => {
            let textX = currentX;
            if (col.align === 'center') textX = currentX + (col.width / 2);
            else if (col.align === 'right') textX = currentX + col.width - 1;
            
            const align = col.align === 'center' ? 'center' : col.align === 'right' ? 'right' : 'left';
            
            if (colIndex === 4) { // Description column - handle multi-line
              for (let i = 0; i < descLines.length; i++) {
                pdf.text(descLines[i], textX, baseY + (i * 4), { align: align as any });
              }
            } else {
              pdf.text(rowData[colIndex], textX, baseY, { align: align as any });
            }
            
            currentX += col.width;
          });
          
          yPosition += actualRowHeight;
        };
        
        // Draw table header
        drawTableHeader();
        
        // Draw table rows
        quote.lineItems.forEach((item, index) => {
          drawTableRow(item, index);
        });
        
        yPosition += 10;
      };
      
      const drawTotalsSection = () => {
        if (!showPricing) return;
        
        checkPageBreak(50);
        
        // Professional totals area - right aligned
        const totalsWidth = 60;
        const totalsX = pageWidth - margin - totalsWidth;
        const labelsX = totalsX - 5;
        
        setFont('body');
        setColor('primary');
        
        // Subtotal
        pdf.text('Subtotal:', labelsX, yPosition, { align: 'right' });
        pdf.text(formatCurrency(totals.subtotal), totalsX + totalsWidth, yPosition, { align: 'right' });
        yPosition += 6;
        
        // Sales tax
        if (totals.taxAmount > 0) {
          pdf.text('Sales tax:', labelsX, yPosition, { align: 'right' });
          pdf.text(formatCurrency(totals.taxAmount), totalsX + totalsWidth, yPosition, { align: 'right' });
          yPosition += 6;
        }
        
        // Total line
        pdf.setDrawColor(0, 0, 0);
        pdf.setLineWidth(0.5);
        pdf.line(labelsX, yPosition, totalsX + totalsWidth, yPosition);
        yPosition += 4;
        
        setFont('subheading');
        pdf.text('Total:', labelsX, yPosition, { align: 'right' });
        pdf.text(formatCurrency(totals.total), totalsX + totalsWidth, yPosition, { align: 'right' });
        yPosition += 15;
      };
      
      const drawSignatureSection = () => {
        checkPageBreak(40);
        
        yPosition += 10;
        
        // Signature lines
        const leftSigX = margin;
        const rightSigX = margin + (contentWidth / 2);
        
        setFont('body');
        setColor('primary');
        
        // Acceptance signature
        pdf.text('Accepted date', leftSigX, yPosition);
        pdf.text('Accepted by', rightSigX, yPosition);
        yPosition += 15;
        
        // Signature lines
        pdf.setDrawColor(0, 0, 0);
        pdf.setLineWidth(0.5);
        pdf.line(leftSigX, yPosition, leftSigX + 50, yPosition);
        pdf.line(rightSigX, yPosition, rightSigX + 80, yPosition);
        yPosition += 20;
      };

      const drawProfessionalCoverPage = async () => {
        if (!includeCoverPage) return;
        
        // === PROFESSIONAL COVER PAGE WITH EDG BRANDING ===
        
        // 1. EDG Teal Brand Header Bar (full width)
        const brandBarHeight = 28;
        const [r, g, b] = colors.accent;
        pdf.setFillColor(r, g, b);
        pdf.rect(0, 0, pageWidth, brandBarHeight, 'F');
        
        // Company logo placeholder and name on brand bar
        pdf.setTextColor(255, 255, 255); // White text on teal
        setFont('subheading');
        pdf.text('EDG PATIO & SHADE', margin, 18);
        
        // Company contact on right side of brand bar
        setFont('small');
        pdf.text('www.edgfurniture.com', pageWidth - margin, 12, { align: 'right' });
        pdf.text('+1 (815) 581-0138', pageWidth - margin, 20, { align: 'right' });
        
        // 2. Professional Title Section
        yPosition = brandBarHeight + 35;
        setColor('primary'); // Back to black text
        
        // Large title
        pdf.setFontSize(28);
        pdf.setFont('helvetica', 'bold');
        pdf.text('PROJECT PROPOSAL', margin, yPosition);
        
        // Project name subtitle
        yPosition += 15;
        setFont('heading');
        pdf.text(quote.projectName || 'Outdoor Living Project', margin, yPosition);
        
        // 3. Hero Cover Image (if provided)
        yPosition += 25;
        let imageEndY = yPosition;
        
        if (coverPhoto) {
          try {
            const { dataUrl, format } = await getImageDataForPDF(coverPhoto);
            
            // Professional hero image sizing - full content width
            const heroImageWidth = contentWidth;
            const maxHeroHeight = 120; // Cap height for professional proportions
            
            // Safe image loading with single decode pattern
            const img = document.createElement('img') as HTMLImageElement;
            img.src = dataUrl;
            await img.decode(); // Wait for image to fully load
            
            // Calculate aspect ratio and fit to width with height limit
            const aspectRatio = img.width / img.height;
            const scaledHeight = Math.min(heroImageWidth / aspectRatio, maxHeroHeight);
            
            pdf.addImage(dataUrl, format, margin, yPosition, heroImageWidth, scaledHeight);
            imageEndY = yPosition + scaledHeight;
            
            // Clean up converted image URL if different from original
            if (dataUrl !== coverPhoto.preview) {
              URL.revokeObjectURL(dataUrl);
            }
          } catch (e) {
            console.warn('Could not add cover photo to PDF:', e);
            imageEndY = yPosition + 10; // Small buffer if image fails
          }
        }
        
        // 4. Professional Metadata Panel (right-aligned)
        const metadataY = Math.max(imageEndY + 30, 180);
        const panelWidth = 85;
        const panelX = pageWidth - margin - panelWidth;
        const customer = quote.account ?? quote.customer;
        
        // Light background panel for metadata
        pdf.setFillColor(248, 248, 248);
        pdf.roundedRect(panelX - 5, metadataY - 5, panelWidth + 10, 85, 3, 3, 'F');
        
        // Metadata content
        let metaY = metadataY + 5;
        setFont('caption');
        setColor('gray');
        
        // Quote/Proposal Number
        pdf.text('PROPOSAL NUMBER', panelX, metaY);
        metaY += 6;
        setFont('small');
        setColor('primary');
        pdf.text(quote.quoteNumber || 'PROP-001', panelX, metaY);
        metaY += 12;
        
        // Date
        setFont('caption');
        setColor('gray');
        pdf.text('DATE PREPARED', panelX, metaY);
        metaY += 6;
        setFont('small');
        setColor('primary');
        const currentDate = new Date().toLocaleDateString('en-US', { 
          year: 'numeric', month: 'long', day: 'numeric' 
        });
        pdf.text(currentDate, panelX, metaY);
        metaY += 12;
        
        // Prepared For
        setFont('caption');
        setColor('gray');
        pdf.text('PREPARED FOR', panelX, metaY);
        metaY += 6;
        setFont('small');
        setColor('primary');
        
        // Customer name with text wrapping
        const nameLines = pdf.splitTextToSize(customer.name, panelWidth - 5);
        nameLines.forEach((line: string) => {
          pdf.text(line, panelX, metaY);
          metaY += 5;
        });
        
        // Project address with text wrapping
        if (quote.projectAddress) {
          const addressLines = pdf.splitTextToSize(quote.projectAddress, panelWidth - 5);
          addressLines.forEach((line: string) => {
            pdf.text(line, panelX, metaY);
            metaY += 5;
          });
        }
        
        // Email with text wrapping
        if (customer.email) {
          const emailLines = pdf.splitTextToSize(customer.email, panelWidth - 5);
          emailLines.forEach((line: string) => {
            pdf.text(line, panelX, metaY);
            metaY += 5;
          });
        }
        
        // 5. Footer Brand Band (NO PAGE NUMBERS OR STANDARD FOOTERS ON COVER)
        const footerY = pageHeight - 15;
        pdf.setFillColor(0, 0, 0); // Black footer
        pdf.rect(0, footerY, pageWidth, 15, 'F');
        
        // Footer content in white
        pdf.setTextColor(255, 255, 255);
        setFont('small');
        pdf.text('1802 Holian Drive, Spring Grove, IL 60081  •  info@edgfurniture.com', 
                pageWidth / 2, footerY + 8, { align: 'center' });
        
        // Add new page for main content (this will be page 2)
        pdf.addPage();
        currentPage++;
        yPosition = margin + 20; // Leave space for header
        drawHeader(); // This runs on page 2
        drawFooter(); // This runs on page 2
      };

      const drawProductRenderingsSection = async () => {
        if (productRenderings.length === 0) return;
        
        checkPageBreak(60);
        
        // Professional section header with teal background - matching our style
        const [r, g, b] = colors.accent;
        pdf.setFillColor(r, g, b);
        pdf.rect(margin, yPosition - 5, contentWidth, 15, 'F');
        
        // White text on teal background
        pdf.setTextColor(255, 255, 255);
        setFont('subheading');
        pdf.text('PRODUCT RENDERINGS', margin + 5, yPosition + 5);
        
        // Reset to black text
        setColor('primary');
        yPosition += 20;
        
        // Professional image grid layout
        const imagesPerRow = 3;
        const imageWidth = (contentWidth - 20) / imagesPerRow;
        const imageHeight = 40;
        let currentX = margin;
        let imagesInCurrentRow = 0;
        
        for (let i = 0; i < Math.min(productRenderings.length, 6); i++) {
          if (imagesInCurrentRow === 0) {
            checkPageBreak(imageHeight + 10);
          }
          
          try {
            const { dataUrl, format } = await getImageDataForPDF(productRenderings[i]);
            pdf.addImage(dataUrl, format, currentX, yPosition, imageWidth - 5, imageHeight);
            
            // Clean up converted image URL if different from original
            if (dataUrl !== productRenderings[i].preview) {
              URL.revokeObjectURL(dataUrl);
            }
          } catch (e) {
            console.warn(`Could not add rendering ${i} to PDF:`, e);
          }
          
          currentX += imageWidth;
          imagesInCurrentRow++;
          
          if (imagesInCurrentRow === imagesPerRow) {
            yPosition += imageHeight + 10;
            currentX = margin;
            imagesInCurrentRow = 0;
          }
        }
        
        if (imagesInCurrentRow > 0) {
          yPosition += imageHeight + 10;
        }
        yPosition += 10;
      };

      // === MAIN PDF GENERATION FLOW ===
      
      // Step 1: Professional cover page (if enabled)
      await drawProfessionalCoverPage();
      
      // Step 2: Generate main estimate page
      if (!includeCoverPage) {
        // Only add header/footer if we didn't create a cover page
        drawHeader();
        drawFooter();
      }
      // Note: If cover page was created, header/footer are already added in drawProfessionalCoverPage
      
      drawEstimateHeader();
      drawAddresses();
      drawEstimateDetails();
      drawProfessionalTable();
      drawTotalsSection();
      
      // Step 3: Add product renderings (if uploaded)
      await drawProductRenderingsSection();
      
      // Step 4: Signature section
      drawSignatureSection();
      
      // Add contract terms if available
      if (includeContract && hasContractData) {
        // Start contract on new page if needed
        if (yPosition > pageHeight - 80) {
          addNewPage();
        } else {
          yPosition += 20;
        }
        
        checkPageBreak(30);
        
        setFont('subheading');
        setColor('primary');
        pdf.text('CONTRACT', margin, yPosition);
        yPosition += 15;
        
        // Get contract content
        const contractContent = quote.contractTemplate?.terms || quote.customContractTerms || '';
        
        if (contractContent.trim()) {
          setFont('small');
          setColor('primary');
          
          // Split contract content into numbered clauses
          const clauses = contractContent.split(/(?=\d+\.)/);
          
          for (let i = 0; i < clauses.length; i++) {
            const clause = clauses[i].trim();
            if (!clause) continue;
            
            // Split clause into lines
            const clauseLines = clause.split('\n');
            let firstLine = true;
            
            for (const line of clauseLines) {
              if (!line.trim()) {
                yPosition += 3;
                continue;
              }
              
              const wrappedLines = pdf.splitTextToSize(line.trim(), contentWidth - 5);
              checkPageBreak(wrappedLines.length * 4 + 5);
              
              for (let j = 0; j < wrappedLines.length; j++) {
                const indentX = firstLine ? margin : margin + 5;
                pdf.text(wrappedLines[j], indentX, yPosition);
                yPosition += 4;
                firstLine = false;
              }
            }
            yPosition += 3;
          }
        }
      }
      
      // Update all page footers with correct total page count
      const totalPages = pdf.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        const footerY = pageHeight - margin + 5;
        
        // Clear previous footer
        pdf.setFillColor(255, 255, 255);
        pdf.rect(margin, footerY - 5, contentWidth, 10, 'F');
        
        // Draw new footer
        setFont('caption');
        setColor('gray');
        pdf.text(`Page ${i} of ${totalPages}`, pageWidth / 2, footerY, { align: 'center' });
      }

      // Save the PDF
      const pdfBlob = pdf.output('blob');
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '');
      const customer = quote.account ?? quote.customer;
      const filename = `${customer.name.replace(/[^a-zA-Z0-9]/g, '_')}_Estimate_${timestamp}.pdf`;
      
      // Create download link
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast({
        title: "PDF Generated Successfully",
        description: `Professional proposal downloaded as ${filename}`,
      });
      
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast({
        title: "Error Generating PDF",
        description: "There was an error creating the PDF. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Professional Proposal Generator
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* PDF Options */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">PDF Options</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="show-pricing">Include Pricing</Label>
                <Switch 
                  id="show-pricing" 
                  checked={showPricing} 
                  onCheckedChange={setShowPricing} 
                />
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="include-cover">Include Cover Page</Label>
                <Switch 
                  id="include-cover" 
                  checked={includeCoverPage} 
                  onCheckedChange={setIncludeCoverPage} 
                />
              </div>

              {hasContractData && (
                <div className="flex items-center justify-between">
                  <Label htmlFor="include-contract">Include Contract Terms</Label>
                  <Switch 
                    id="include-contract" 
                    checked={includeContract} 
                    onCheckedChange={setIncludeContract} 
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Cover Photo Upload */}
          {includeCoverPage && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Camera className="w-5 h-5" />
                  Cover Photo
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!coverPhoto ? (
                  <div 
                    className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-gray-400 transition-colors"
                    onClick={() => coverPhotoRef.current?.click()}
                  >
                    <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                    <p className="text-sm text-gray-600">Click to upload cover photo</p>
                    <p className="text-xs text-gray-500">PNG, JPG up to 10MB</p>
                  </div>
                ) : (
                  <div className="relative">
                    <img 
                      src={coverPhoto.preview} 
                      alt="Cover preview" 
                      className="w-full h-48 object-cover rounded-lg"
                    />
                    <Button
                      variant="destructive"
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={() => removeFile(coverPhoto.id, 'cover')}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                    <Badge variant="secondary" className="absolute bottom-2 left-2">
                      {coverPhoto.name}
                    </Badge>
                  </div>
                )}
                <input
                  ref={coverPhotoRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFileUpload(e.target.files, 'cover')}
                />
              </CardContent>
            </Card>
          )}

          {/* Product Renderings Upload */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Image className="w-5 h-5" />
                Product Renderings
                <Badge variant="outline">{productRenderings.length}/5</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {productRenderings.length === 0 ? (
                <div 
                  className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-gray-400 transition-colors"
                  onClick={() => renderingsRef.current?.click()}
                >
                  <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                  <p className="text-sm text-gray-600">Click to upload product renderings</p>
                  <p className="text-xs text-gray-500">PNG, JPG up to 10MB each (max 5 images)</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {productRenderings.map((rendering) => (
                      <div key={rendering.id} className="relative">
                        <img 
                          src={rendering.preview} 
                          alt="Product rendering" 
                          className="w-full h-32 object-cover rounded-lg"
                        />
                        <Button
                          variant="destructive"
                          size="sm"
                          className="absolute top-1 right-1"
                          onClick={() => removeFile(rendering.id, 'renderings')}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                        <Badge variant="secondary" className="absolute bottom-1 left-1 text-xs">
                          {rendering.name.substring(0, 10)}...
                        </Badge>
                      </div>
                    ))}
                  </div>
                  
                  {productRenderings.length < 5 && (
                    <Button 
                      variant="outline" 
                      onClick={() => renderingsRef.current?.click()}
                      className="w-full"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Add More Images
                    </Button>
                  )}
                </div>
              )}
              
              <input
                ref={renderingsRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleFileUpload(e.target.files, 'renderings')}
              />
            </CardContent>
          </Card>

          {/* Generate Button */}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={generatePDF} disabled={isGenerating} className="min-w-32">
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Generate PDF
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}