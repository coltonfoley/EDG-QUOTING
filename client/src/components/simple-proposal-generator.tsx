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
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = 210; // A4 width in mm
      const pageHeight = 297; // A4 height in mm
      const margin = 20; // mm
      const contentWidth = pageWidth - (2 * margin);
      let yPosition = margin;
      
      // Helper function to check if we need a new page
      const checkPageBreak = (heightNeeded: number) => {
        if (yPosition + heightNeeded > pageHeight - margin) {
          pdf.addPage();
          yPosition = margin;
          return true;
        }
        return false;
      };
      
      // Helper function to add text with automatic line breaking
      const addTextWithWrapping = (text: string, x: number, fontSize: number, style: 'normal' | 'bold' = 'normal', maxWidth?: number) => {
        pdf.setFontSize(fontSize);
        pdf.setFont('helvetica', style);
        const actualMaxWidth = maxWidth || contentWidth;
        const lines = pdf.splitTextToSize(text, actualMaxWidth);
        const lineHeight = fontSize * 0.35277; // Convert pt to mm
        
        checkPageBreak(lines.length * lineHeight);
        
        for (const line of lines) {
          pdf.text(line, x, yPosition);
          yPosition += lineHeight;
        }
        return yPosition;
      };

      // Cover page
      if (includeCoverPage) {
        pdf.setFontSize(28);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Project Proposal', pageWidth / 2, 60, { align: 'center' });
        
        yPosition = 80;
        pdf.setFontSize(20);
        pdf.setFont('helvetica', 'normal');
        pdf.text(quote.projectName || 'Outdoor Living Project', pageWidth / 2, yPosition, { align: 'center' });
        
        yPosition = 120;
        if (coverPhoto) {
          try {
            // Add cover photo if available
            const maxPhotoWidth = 120;
            const maxPhotoHeight = 80;
            const { dataUrl, format } = await getImageDataForPDF(coverPhoto);
            pdf.addImage(dataUrl, format, (pageWidth - maxPhotoWidth) / 2, yPosition, maxPhotoWidth, maxPhotoHeight);
            yPosition += maxPhotoHeight + 20;
            
            // Clean up converted image URL if it's different from original
            if (dataUrl !== coverPhoto.preview) {
              URL.revokeObjectURL(dataUrl);
            }
          } catch (e) {
            console.warn('Could not add cover photo to PDF:', e);
          }
        }
        
        // Customer info on cover
        yPosition = Math.max(yPosition, 220);
        pdf.setFontSize(14);
        pdf.text('Prepared for:', pageWidth / 2, yPosition, { align: 'center' });
        yPosition += 10;
        
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(16);
        pdf.text((quote.account ?? quote.customer).name, pageWidth / 2, yPosition, { align: 'center' });
        yPosition += 8;
        
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(12);
        if (quote.projectAddress || (quote.account ?? quote.customer).company) {
          pdf.text(quote.projectAddress || (quote.account ?? quote.customer).company || '', pageWidth / 2, yPosition, { align: 'center' });
        }
        
        pdf.addPage();
        yPosition = margin;
      }

      // Project details
      pdf.setFontSize(18);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Project Details', margin, yPosition);
      yPosition += 10;
      
      // Draw underline
      pdf.setLineWidth(0.5);
      pdf.line(margin, yPosition, margin + contentWidth, yPosition);
      yPosition += 15;
      
      checkPageBreak(40); // Reserve space for project details
      
      // Two column layout for project details
      const colWidth = contentWidth / 2 - 10;
      const col1X = margin;
      const col2X = margin + colWidth + 20;
      let col1Y = yPosition;
      let col2Y = yPosition;
      
      // Column 1
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Quote Number:', col1X, col1Y);
      col1Y += 5;
      pdf.setFont('helvetica', 'normal');
      pdf.text(quote.quoteNumber, col1X, col1Y);
      col1Y += 8;
      
      pdf.setFont('helvetica', 'bold');
      pdf.text('Customer:', col1X, col1Y);
      col1Y += 5;
      pdf.setFont('helvetica', 'normal');
      pdf.text((quote.account ?? quote.customer).name, col1X, col1Y);
      col1Y += 8;
      
      pdf.setFont('helvetica', 'bold');
      pdf.text('Email:', col1X, col1Y);
      col1Y += 5;
      pdf.setFont('helvetica', 'normal');
      pdf.text((quote.account ?? quote.customer).email || '', col1X, col1Y);
      col1Y += 8;
      
      pdf.setFont('helvetica', 'bold');
      pdf.text('Phone:', col1X, col1Y);
      col1Y += 5;
      pdf.setFont('helvetica', 'normal');
      pdf.text((quote.account ?? quote.customer).phone || '', col1X, col1Y);
      
      // Column 2
      pdf.setFont('helvetica', 'bold');
      pdf.text('Project:', col2X, col2Y);
      col2Y += 5;
      pdf.setFont('helvetica', 'normal');
      pdf.text(quote.projectName || 'Outdoor Living Project', col2X, col2Y);
      col2Y += 8;
      
      pdf.setFont('helvetica', 'bold');
      pdf.text('Address:', col2X, col2Y);
      col2Y += 5;
      pdf.setFont('helvetica', 'normal');
      const addressLines = pdf.splitTextToSize(quote.projectAddress || 'Not specified', colWidth);
      for (const line of addressLines) {
        pdf.text(line, col2X, col2Y);
        col2Y += 5;
      }
      col2Y += 3;
      
      pdf.setFont('helvetica', 'bold');
      pdf.text('Start Date:', col2X, col2Y);
      col2Y += 5;
      pdf.setFont('helvetica', 'normal');
      pdf.text(quote.estimatedStartDate || 'TBD', col2X, col2Y);
      
      yPosition = Math.max(col1Y, col2Y) + 15;

      // Product renderings
      if (productRenderings.length > 0) {
        checkPageBreak(60);
        
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Product Renderings', margin, yPosition);
        yPosition += 15;
        
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
            
            // Clean up converted image URL if it's different from original
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
      }

      // Line items table
      if (quote.lineItems.length > 0) {
        checkPageBreak(40);
        
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Project Items', margin, yPosition);
        yPosition += 15;
        
        // Table headers
        const tableStartY = yPosition;
        const rowHeight = 8;
        const headerHeight = 10;
        
        // Column widths
        const descWidth = showPricing ? contentWidth * 0.5 : contentWidth * 0.8;
        const qtyWidth = showPricing ? contentWidth * 0.1 : contentWidth * 0.2;
        const priceWidth = showPricing ? contentWidth * 0.2 : 0;
        const totalWidth = showPricing ? contentWidth * 0.2 : 0;
        
        // Draw header background
        pdf.setFillColor(245, 245, 245);
        pdf.rect(margin, yPosition - 2, contentWidth, headerHeight, 'F');
        
        // Header borders
        pdf.setDrawColor(221, 221, 221);
        pdf.setLineWidth(0.1);
        
        // Header text
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Description', margin + 2, yPosition + 6);
        pdf.text('Qty', margin + descWidth + 2, yPosition + 6);
        
        if (showPricing) {
          pdf.text('Unit Price', margin + descWidth + qtyWidth + 2, yPosition + 6);
          pdf.text('Total', margin + descWidth + qtyWidth + priceWidth + 2, yPosition + 6);
        }
        
        yPosition += headerHeight;
        
        // Table rows
        pdf.setFont('helvetica', 'normal');
        pdf.setFillColor(255, 255, 255);
        
        for (let i = 0; i < quote.lineItems.length; i++) {
          const item = quote.lineItems[i];
          const qty = parseFloat(item.quantity.toString());
          const price = parseFloat(item.unitPrice.toString());
          const markup = parseFloat(item.markupValue.toString());
          const baseTotal = qty * price;
          const total = item.markupType === 'percentage' 
            ? baseTotal + (baseTotal * (markup / 100))
            : baseTotal + markup;
          
          // Check if we need to split long descriptions
          const descLines = pdf.splitTextToSize(item.description, descWidth - 4);
          const neededHeight = Math.max(rowHeight, descLines.length * 5);
          
          checkPageBreak(neededHeight + 5);
          
          // Draw row background (alternating)
          if (i % 2 === 0) {
            pdf.setFillColor(249, 249, 249);
            pdf.rect(margin, yPosition - 2, contentWidth, neededHeight, 'F');
          }
          
          // Draw borders
          pdf.rect(margin, yPosition - 2, descWidth, neededHeight);
          pdf.rect(margin + descWidth, yPosition - 2, qtyWidth, neededHeight);
          
          if (showPricing) {
            pdf.rect(margin + descWidth + qtyWidth, yPosition - 2, priceWidth, neededHeight);
            pdf.rect(margin + descWidth + qtyWidth + priceWidth, yPosition - 2, totalWidth, neededHeight);
          }
          
          // Row text
          pdf.setFontSize(9);
          
          // Description (multi-line)
          for (let j = 0; j < descLines.length; j++) {
            pdf.text(descLines[j], margin + 2, yPosition + 4 + (j * 5));
          }
          
          // Quantity
          pdf.text(qty.toString(), margin + descWidth + 2, yPosition + 4);
          
          if (showPricing) {
            // Unit Price
            pdf.text(formatCurrency(price), margin + descWidth + qtyWidth + 2, yPosition + 4);
            
            // Total
            pdf.text(formatCurrency(total), margin + descWidth + qtyWidth + priceWidth + 2, yPosition + 4);
          }
          
          yPosition += neededHeight;
        }
        
        yPosition += 10;
        
        // Totals section
        if (showPricing) {
          checkPageBreak(50);
          
          const totalsX = margin + contentWidth - 80;
          const totalsLabelX = totalsX - 60;
          
          pdf.setFontSize(10);
          pdf.setFont('helvetica', 'normal');
          
          pdf.text('Subtotal:', totalsLabelX, yPosition);
          pdf.text(formatCurrency(totals.subtotal), totalsX, yPosition);
          yPosition += 6;
          
          if (totals.discountAmount > 0) {
            pdf.text('Discount:', totalsLabelX, yPosition);
            pdf.text(`-${formatCurrency(totals.discountAmount)}`, totalsX, yPosition);
            yPosition += 6;
          }
          
          if (totals.shippingAmount > 0) {
            pdf.text('Shipping:', totalsLabelX, yPosition);
            pdf.text(formatCurrency(totals.shippingAmount), totalsX, yPosition);
            yPosition += 6;
          }
          
          if (totals.taxAmount > 0) {
            pdf.text('Tax:', totalsLabelX, yPosition);
            pdf.text(formatCurrency(totals.taxAmount), totalsX, yPosition);
            yPosition += 6;
          }
          
          // Total line
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(12);
          pdf.line(totalsLabelX, yPosition, totalsX + 50, yPosition);
          yPosition += 5;
          
          pdf.text('Total:', totalsLabelX, yPosition);
          pdf.text(formatCurrency(totals.total), totalsX, yPosition);
          yPosition += 15;
        }
      }

      // Notes
      if (quote.notes && quote.notes.trim()) {
        checkPageBreak(30);
        
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Project Notes', margin, yPosition);
        yPosition += 15;
        
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        
        // Split notes into lines and add with proper wrapping
        const noteLines = quote.notes.split('\n');
        for (const noteLine of noteLines) {
          if (noteLine.trim()) {
            const wrappedLines = pdf.splitTextToSize(noteLine, contentWidth - 10);
            checkPageBreak(wrappedLines.length * 5 + 5);
            
            for (const wrappedLine of wrappedLines) {
              pdf.text(wrappedLine, margin + 5, yPosition);
              yPosition += 5;
            }
            yPosition += 3;
          } else {
            yPosition += 5; // Empty line spacing
          }
        }
      }

      // Download the PDF
      pdf.save(`Proposal-${quote.quoteNumber}.pdf`);
      
      toast({
        title: "Success!",
        description: "Proposal PDF generated and downloaded successfully.",
      });
      
      onOpenChange(false);
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast({
        title: "Error",
        description: "Failed to generate PDF. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="dialog-proposal-generator">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Generate Proposal - {quote.quoteNumber}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Options Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Proposal Options</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="show-pricing" className="text-sm font-medium">
                    Include Pricing in PDF
                  </Label>
                  <p className="text-sm text-gray-500">Show prices, totals, and financial details</p>
                </div>
                <Switch
                  id="show-pricing"
                  checked={showPricing}
                  onCheckedChange={setShowPricing}
                  data-testid="switch-show-pricing"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="include-cover" className="text-sm font-medium">
                    Include Cover Page
                  </Label>
                  <p className="text-sm text-gray-500">Add a professional cover page with project details</p>
                </div>
                <Switch
                  id="include-cover"
                  checked={includeCoverPage}
                  onCheckedChange={setIncludeCoverPage}
                  data-testid="switch-include-cover"
                />
              </div>
            </CardContent>
          </Card>

          {/* Cover Photo Section */}
          {includeCoverPage && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Image className="h-5 w-5" />
                  Cover Photo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {coverPhoto ? (
                    <div className="relative">
                      <img
                        src={coverPhoto.preview}
                        alt="Cover photo"
                        className="w-full h-48 object-cover rounded border"
                      />
                      <Button
                        variant="destructive"
                        size="sm"
                        className="absolute top-2 right-2"
                        onClick={() => removeFile(coverPhoto.id, 'cover')}
                        data-testid="button-remove-cover-photo"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                      <Badge className="absolute bottom-2 left-2 bg-black/70 text-white">
                        {coverPhoto.name}
                      </Badge>
                    </div>
                  ) : (
                    <div
                      className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center cursor-pointer hover:border-gray-400 transition-colors"
                      onClick={() => coverPhotoRef.current?.click()}
                      data-testid="dropzone-cover-photo"
                    >
                      <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-lg font-medium text-gray-700">Upload Cover Photo</p>
                      <p className="text-sm text-gray-500">Click to select an image for your proposal cover</p>
                    </div>
                  )}
                  <input
                    ref={coverPhotoRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFileUpload(e.target.files, 'cover')}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Product Renderings Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Camera className="h-5 w-5" />
                Product Renderings
                <Badge variant="outline" className="ml-2">
                  {productRenderings.length}/5
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {productRenderings.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {productRenderings.map((rendering) => (
                      <div key={rendering.id} className="relative">
                        <img
                          src={rendering.preview}
                          alt="Product rendering"
                          className="w-full h-32 object-cover rounded border"
                        />
                        <Button
                          variant="destructive"
                          size="sm"
                          className="absolute top-1 right-1"
                          onClick={() => removeFile(rendering.id, 'renderings')}
                          data-testid={`button-remove-rendering-${rendering.id}`}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                
                {productRenderings.length < 5 && (
                  <div
                    className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-gray-400 transition-colors"
                    onClick={() => renderingsRef.current?.click()}
                    data-testid="dropzone-product-renderings"
                  >
                    <Camera className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                    <p className="font-medium text-gray-700">Add Product Images</p>
                    <p className="text-sm text-gray-500">Click to upload product renderings and photos</p>
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
              </div>
            </CardContent>
          </Card>

          {/* Preview Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Eye className="h-5 w-5" />
                Proposal Preview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-gray-50 p-4 rounded border text-sm space-y-2">
                <p><strong>Quote:</strong> {quote.quoteNumber}</p>
                <p><strong>Customer:</strong> {quote.account.name}</p>
                <p><strong>Project:</strong> {quote.projectName || 'Outdoor Living Project'}</p>
                <p><strong>Items:</strong> {quote.lineItems.length} line items</p>
                {showPricing && <p><strong>Total:</strong> {formatCurrency(totals.total)}</p>}
                <p><strong>Cover Page:</strong> {includeCoverPage ? 'Yes' : 'No'}</p>
                <p><strong>Cover Photo:</strong> {coverPhoto ? 'Included' : 'None'}</p>
                <p><strong>Product Images:</strong> {productRenderings.length} images</p>
              </div>
            </CardContent>
          </Card>

          {/* Generate Button */}
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isGenerating}
              data-testid="button-cancel-proposal"
            >
              Cancel
            </Button>
            <Button
              onClick={generatePDF}
              disabled={isGenerating}
              className="bg-edg-black hover:bg-edg-grey text-white"
              data-testid="button-generate-proposal"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
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