import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
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
import { getProxiedImageUrl } from '@/lib/image-utils';
import { apiRequest, queryClient } from '@/lib/queryClient';
import type { QuoteWithDetails, QuoteCoverPhoto, QuoteProductRendering } from '@shared/schema';
import jsPDF from 'jspdf';
import logoPath from '@assets/Logo_Full Color_Black_1758731429139.png';

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

interface PersistentImage {
  id: number;
  filename: string;
  originalName: string;
  storageUrl: string;
  mimeType: string;
  isActive: boolean;
  uploadedAt: string;
  displayOrder?: number;
}

// Unified interface for displaying images regardless of source
interface DisplayImage {
  id: string | number;
  name: string;
  preview: string;
  isPersistent: boolean;
  originalFile?: File; // Only for temp images
}

export function SimpleProposalGenerator({ quote, open, onOpenChange }: SimpleProposalGeneratorProps) {
  const [showPricing, setShowPricing] = useState(true);
  const [includeCoverPage, setIncludeCoverPage] = useState(false);
  
  // Temporary uploads (local files before uploading to server)
  const [tempCoverPhoto, setTempCoverPhoto] = useState<UploadedFile | null>(null);
  const [tempProductRenderings, setTempProductRenderings] = useState<UploadedFile[]>([]);
  
  // Persistent images (stored in database and object storage)
  const [persistentCoverPhoto, setPersistentCoverPhoto] = useState<PersistentImage | null>(null);
  const [persistentProductRenderings, setPersistentProductRenderings] = useState<PersistentImage[]>([]);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [generatedPdfUrl, setGeneratedPdfUrl] = useState<string | null>(null);
  
  // Contract state and logic
  const hasContractData = !!(quote.contractTemplate || quote.customContractTerms);
  const [includeContract, setIncludeContract] = useState(hasContractData);
  const { toast } = useToast();
  
  const coverPhotoRef = useRef<HTMLInputElement>(null);
  const renderingsRef = useRef<HTMLInputElement>(null);

  // React Query hooks for loading existing images
  const { data: existingCoverPhotos, isLoading: loadingCoverPhotos } = useQuery<QuoteCoverPhoto[]>({
    queryKey: [`/api/quotes/${quote.id}/cover-photos`],
    enabled: open && !!quote.id,
  });

  const { data: existingProductRenderings, isLoading: loadingRenderings } = useQuery<QuoteProductRendering[]>({
    queryKey: [`/api/quotes/${quote.id}/product-renderings`],
    enabled: open && !!quote.id,
  });

  // Mutations for uploading images
  const uploadCoverPhotoMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('image', file);
      return await apiRequest('POST', `/api/quotes/${quote.id}/cover-photos`, formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/quotes/${quote.id}/cover-photos`] });
      toast({
        title: "Cover photo saved",
        description: "Your cover photo has been added to the quote",
      });
      setTempCoverPhoto(null); // Clear temp after successful upload
    },
    onError: (error: any) => {
      toast({
        title: "Upload failed",
        description: error.message || "Failed to save cover photo",
        variant: "destructive"
      });
    }
  });

  const uploadProductRenderingMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('image', file);
      return await apiRequest('POST', `/api/quotes/${quote.id}/product-renderings`, formData);
    },
    onSuccess: (_, file) => {
      queryClient.invalidateQueries({ queryKey: [`/api/quotes/${quote.id}/product-renderings`] });
      toast({
        title: "Product rendering saved",
        description: "Your product rendering has been added to the quote",
      });
      // Clear the temp rendering that was just uploaded
      setTempProductRenderings(prev => prev.filter(temp => temp.file !== file));
    },
    onError: (error: any) => {
      toast({
        title: "Upload failed",
        description: error.message || "Failed to save product rendering",
        variant: "destructive"
      });
    }
  });

  // Load existing images into state when data is available
  useEffect(() => {
    if (existingCoverPhotos && existingCoverPhotos.length > 0) {
      const activeCoverPhoto = existingCoverPhotos.find((img: QuoteCoverPhoto) => img.isActive);
      if (activeCoverPhoto) {
        setPersistentCoverPhoto({
          id: activeCoverPhoto.id,
          filename: activeCoverPhoto.filename,
          originalName: activeCoverPhoto.originalName,
          storageUrl: activeCoverPhoto.storageUrl,
          mimeType: activeCoverPhoto.mimeType,
          isActive: activeCoverPhoto.isActive ?? true,
          uploadedAt: activeCoverPhoto.uploadedAt instanceof Date 
            ? activeCoverPhoto.uploadedAt.toISOString() 
            : (activeCoverPhoto.uploadedAt ?? new Date().toISOString()),
        });
      }
    }
  }, [existingCoverPhotos]);

  useEffect(() => {
    if (existingProductRenderings && existingProductRenderings.length > 0) {
      const activeRenderings = existingProductRenderings
        .filter((img: QuoteProductRendering) => img.isActive)
        .sort((a: QuoteProductRendering, b: QuoteProductRendering) => (a.displayOrder || 0) - (b.displayOrder || 0));
      
      setPersistentProductRenderings(activeRenderings.map((img: QuoteProductRendering) => ({
        id: img.id,
        filename: img.filename,
        originalName: img.originalName,
        storageUrl: img.storageUrl,
        mimeType: img.mimeType,
        isActive: img.isActive ?? true,
        uploadedAt: img.uploadedAt instanceof Date 
          ? img.uploadedAt.toISOString() 
          : (img.uploadedAt ?? new Date().toISOString()),
        displayOrder: img.displayOrder ?? 0,
      })));
    }
  }, [existingProductRenderings]);

  // Helper function to convert persistent image to display image
  const persistentToDisplayImage = (img: PersistentImage): DisplayImage => ({
    id: img.id,
    name: img.originalName,
    preview: getProxiedImageUrl(img.storageUrl),
    isPersistent: true
  });

  // Helper function to convert temp image to display image
  const tempToDisplayImage = (img: UploadedFile): DisplayImage => ({
    id: img.id,
    name: img.name,
    preview: img.preview,
    isPersistent: false,
    originalFile: img.file
  });

  // Helper function to get the effective cover photo (temp takes priority over persistent)
  const getEffectiveCoverPhoto = (): DisplayImage | null => {
    if (tempCoverPhoto) {
      return tempToDisplayImage(tempCoverPhoto);
    }
    if (persistentCoverPhoto) {
      return persistentToDisplayImage(persistentCoverPhoto);
    }
    return null;
  };

  // Helper function to get effective product renderings (persistent + temp)
  const getEffectiveProductRenderings = (): DisplayImage[] => {
    const persistent = persistentProductRenderings.map(persistentToDisplayImage);
    const temp = tempProductRenderings.map(tempToDisplayImage);
    return [...persistent, ...temp];
  };

  // Expose the legacy interface for backward compatibility
  const coverPhoto = getEffectiveCoverPhoto();
  const productRenderings = getEffectiveProductRenderings();

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

    // Auto-save images immediately when uploaded
    if (type === 'cover' && validFiles.length > 0) {
      const file = validFiles[0];
      const uploadedFile: UploadedFile = {
        id: Date.now().toString(),
        file,
        preview: URL.createObjectURL(file),
        name: file.name
      };
      setTempCoverPhoto(uploadedFile);
      
      // Auto-save the cover photo immediately
      uploadCoverPhotoMutation.mutate(file);
    } else if (type === 'renderings') {
      const newRenderings = validFiles.map(file => ({
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        file,
        preview: URL.createObjectURL(file),
        name: file.name
      }));
      setTempProductRenderings(prev => [...prev, ...newRenderings].slice(0, 5)); // Max 5 images
      
      // Auto-save each product rendering immediately
      validFiles.forEach(file => {
        uploadProductRenderingMutation.mutate(file);
      });
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
  const getImageDataForPDF = async (image: DisplayImage): Promise<{ dataUrl: string; format: string }> => {
    // For temporary images (with original file)
    if (image.originalFile) {
      try {
        // Always convert to data URL using FileReader for reliability
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          
          reader.onload = () => {
            const dataUrl = reader.result as string;
            const format = getImageFormat(image.originalFile!);
            resolve({ dataUrl, format });
          };
          
          reader.onerror = () => {
            reject(new Error('Failed to read file as data URL'));
          };
          
          reader.readAsDataURL(image.originalFile!);
        });
      } catch (error) {
        throw new Error(`Failed to process temporary image: ${error}`);
      }
    }
    
    // For persistent images (stored in object storage)
    // Fetch image data and convert to data URL for reliable PDF generation
    try {
      return new Promise(async (resolve, reject) => {
        try {
          // Fetch the image data directly through a secure endpoint
          const response = await fetch(image.preview, {
            credentials: 'include',
            headers: {
              'Accept': 'image/*',
            },
          });
          
          if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status}`);
          }
          
          // Convert response to blob
          const blob = await response.blob();
          
          // Convert blob to data URL using FileReader
          const reader = new FileReader();
          
          reader.onload = () => {
            const dataUrl = reader.result as string;
            resolve({ dataUrl, format: 'JPEG' });
          };
          
          reader.onerror = () => {
            reject(new Error('Failed to convert blob to data URL'));
          };
          
          reader.readAsDataURL(blob);
          
        } catch (error) {
          reject(error);
        }
      });
    } catch (error) {
      throw new Error(`Failed to process persistent image: ${error}`);
    }
  };

  const removeFile = (id: string | number, type: 'cover' | 'renderings') => {
    if (type === 'cover') {
      // Check if it's a temp cover photo first
      if (tempCoverPhoto && tempCoverPhoto.id === id) {
        if (tempCoverPhoto.preview) {
          URL.revokeObjectURL(tempCoverPhoto.preview);
        }
        setTempCoverPhoto(null);
      } else if (persistentCoverPhoto && persistentCoverPhoto.id === id) {
        // TODO: Add API call to delete persistent cover photo
        setPersistentCoverPhoto(null);
      }
    } else {
      // Try to remove from temp renderings first
      setTempProductRenderings(prev => {
        const removed = prev.find(img => img.id === id);
        if (removed) {
          if (removed.preview) {
            URL.revokeObjectURL(removed.preview);
          }
          return prev.filter(img => img.id !== id);
        }
        return prev;
      });
      
      // Try to remove from persistent renderings
      setPersistentProductRenderings(prev => {
        const found = prev.find(img => img.id === id);
        if (found) {
          // TODO: Add API call to delete persistent rendering
          return prev.filter(img => img.id !== id);
        }
        return prev;
      });
    }
  };

  // Helper function to load the logo
  const loadLogo = async (): Promise<{ dataUrl: string; width: number; height: number } | null> => {
    try {
      return new Promise((resolve, reject) => {
        const img = document.createElement('img') as HTMLImageElement;
        img.onload = () => {
          // Create canvas to convert logo to data URL
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          canvas.width = img.width;
          canvas.height = img.height;
          
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            const dataUrl = canvas.toDataURL('image/png');
            resolve({ dataUrl, width: img.width, height: img.height });
          } else {
            reject(new Error('Failed to get canvas context'));
          }
        };
        img.onerror = () => reject(new Error('Failed to load logo'));
        img.src = logoPath;
      });
    } catch (error) {
      console.warn('Could not load logo:', error);
      return null;
    }
  };

  const generatePDF = async () => {
    setIsGenerating(true);
    try {
      // Load logo for use throughout PDF
      const logoData = await loadLogo();
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
        primary: [0, 0, 0], // Black #000000
        white: [255, 255, 255], // White #ffffff
        accent: [66, 255, 193], // EDG Teal #42ffc1
        accentRgb: '#42ffc1', // For hex operations
        gray: [128, 128, 128],
        lightGray: [240, 240, 240],
        darkGray: [60, 60, 60]
      };
      
      // Company information
      const company = {
        name: 'EDG Patio & Shade',
        address1: '1802 Holian Drive',
        address2: 'Spring Grove, IL 60081',
        email: 'info@edgpatioshade.com',
        phone: '+1 (815) 581-0138',
        website: 'www.edgpatioshade.com'
      };
      
      // Professional drawing utilities
      const setFont = (type: keyof typeof fonts) => {
        pdf.setFontSize(fonts[type].size);
        pdf.setFont('helvetica', fonts[type].weight as any);
      };
      
      const setColor = (colorKey: keyof typeof colors) => {
        const color = colors[colorKey];
        if (Array.isArray(color)) {
          const [r, g, b] = color;
          pdf.setTextColor(r, g, b);
        }
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
      };
      
      const drawHeader = () => {
        // Skip header on cover page - cover has its own branding
        if (includeCoverPage && currentPage === 1) return;
        
        const headerY = margin;
        
        // Branded header background with teal accent strip
        const [r, g, b] = colors.accent;
        pdf.setFillColor(r, g, b);
        pdf.rect(0, 0, pageWidth, 4, 'F'); // Teal strip at very top
        
        
        // Company name with stronger branding
        setFont('subheading');
        setColor('primary');
        pdf.text(company.name.toUpperCase(), margin, headerY + 2);
        
        // Professional contact layout
        setFont('caption');
        setColor('darkGray');
        pdf.text(company.address1 + ' • ' + company.address2, margin, headerY + 6);
        
        // Right-aligned contact with teal accents
        const rightX = pageWidth - margin;
        setColor('primary');
        pdf.text(company.phone, rightX, headerY + 2, { align: 'right' });
        setColor('darkGray');
        pdf.text(company.email + ' • ' + company.website, rightX, headerY + 6, { align: 'right' });
        
        // Branded bottom border
        pdf.setDrawColor(r, g, b);
        pdf.setLineWidth(1);
        pdf.line(margin, headerY + 10, pageWidth - margin, headerY + 10);
        
        // Clean professional design
      };
      
      const drawFooter = () => {
        // ABSOLUTELY NO PAGE NUMBERS ON COVER PAGE - SKIP ENTIRELY
        if (includeCoverPage && currentPage === 1) {
          return; // Cover page has its own custom footer band
        }
        
        const footerY = pageHeight - margin + 2;
        const [r, g, b] = colors.accent;
        
        // Branded footer with teal accent line
        pdf.setDrawColor(r, g, b);
        pdf.setLineWidth(2);
        pdf.line(margin, footerY - 8, pageWidth - margin, footerY - 8);
        
        
        // Company name on left
        setFont('caption');
        setColor('primary');
        pdf.text(company.name, margin, footerY - 2, { align: 'left' });
        
        // Page numbers in center
        const totalPages = pdf.getNumberOfPages();
        pdf.text(`PAGE ${currentPage} OF ${totalPages}`, pageWidth / 2, footerY - 2, { align: 'center' });
        
        // Contact info on right
        setColor('darkGray');
        pdf.text(`${company.phone}  •  ${company.email}`, pageWidth - margin, footerY - 2, { align: 'right' });
        
        // Clean footer design
      };
      
      const drawEstimateHeader = () => {
        // Create a stunning branded header with teal background
        const [r, g, b] = colors.accent;
        pdf.setFillColor(r, g, b);
        
        // Draw teal background rectangle with consistent width
        pdf.rect(margin, yPosition - 8, contentWidth, 20, 'F');
        
        // Clean design without shadow effects
        
        // White text on teal background
        pdf.setTextColor(255, 255, 255);
        setFont('heading');
        pdf.text('PROFESSIONAL ESTIMATE', margin + 5, yPosition + 2);
        
        // Clean design without decorative lines
        
        // Reset text color
        setColor('primary');
        yPosition += 25;
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
        
        // Padding constants and layout metrics
        const lineHeight = 4;
        const padX = 3;
        const padY = 3;
        const rowHeight = 14;
        const headerHeight = 12;
        
        // Column configuration - scaled to match contentWidth for consistency
        const tableWidth = contentWidth;
        const columns = [
          { header: '#', width: tableWidth * 0.05, dataAlign: 'center' },
          { header: 'Product/Service', width: tableWidth * 0.23, dataAlign: 'left' },
          { header: 'SKU', width: tableWidth * 0.13, dataAlign: 'left' },
          { header: 'Description', width: tableWidth * 0.29, dataAlign: 'left' },
          { header: 'Qty', width: tableWidth * 0.06, dataAlign: 'center' },
          { header: 'Rate', width: tableWidth * 0.12, dataAlign: 'right' },
          { header: 'Amount', width: tableWidth * 0.12, dataAlign: 'right' }
        ];
        
        const tableX = margin;
        
        const drawTableHeader = () => {
          const headerTop = yPosition;
          
          // Professional branded table header with teal background
          const [r, g, b] = colors.accent;
          pdf.setFillColor(r, g, b);
          pdf.rect(tableX, headerTop, contentWidth, headerHeight, 'F');
          
          // Draw header borders
          pdf.setDrawColor(200, 200, 200);
          pdf.setLineWidth(0.35);
          let currentX = tableX;
          
          // Draw vertical dividers for header
          columns.forEach((col, index) => {
            if (index > 0) {
              pdf.line(currentX, headerTop, currentX, headerTop + headerHeight);
            }
            currentX += col.width;
          });
          
          // Draw header border outline
          pdf.rect(tableX, headerTop, contentWidth, headerHeight, 'S');
          
          // White text on teal background
          pdf.setTextColor(255, 255, 255);
          setFont('body');
          
          currentX = tableX;
          columns.forEach(col => {
            // Center header text both horizontally and vertically
            const textX = currentX + (col.width / 2);
            const textY = headerTop + headerHeight/2 + 3; // Vertically centered
            pdf.text(col.header, textX, textY, { align: 'center' });
            currentX += col.width;
          });
          
          yPosition += headerHeight;
          
          // Reset text color for table content
          setColor('primary');
        };
        
        const drawTableRow = (item: any, index: number) => {
          const qty = parseFloat(item.quantity.toString());
          const price = parseFloat(item.unitPrice.toString());
          const markup = parseFloat(item.markupValue.toString());
          const baseTotal = qty * price;
          const total = item.markupType === 'percentage' 
            ? baseTotal + (baseTotal * (markup / 100))
            : baseTotal + markup;
          
          // Calculate proper row height based on description wrapping
          const maxDescWidth = columns[3].width - 2*padX;
          const descLines = pdf.splitTextToSize(item.description, maxDescWidth);
          const actualRowHeight = Math.max(rowHeight, padY*2 + descLines.length*lineHeight);
          
          // Check for page break and redraw header if needed
          if (checkPageBreak(actualRowHeight + 6)) {
            drawTableHeader();
          }
          
          const cellTop = yPosition;
          const cellBottom = cellTop + actualRowHeight;
          
          // Set font for row content
          pdf.setFontSize(9);
          pdf.setFont('helvetica', 'normal');
          setColor('primary');
          
          // Row data
          const rowData = [
            (index + 1).toString(),
            item.description.split(' ').slice(0, 3).join(' '), // Product name shortened
            item.description.split(' ').slice(0, 2).join(' '), // SKU shortened  
            item.description, // Full description (multi-line)
            qty.toString(),
            formatCurrency(price),
            formatCurrency(total)
          ];
          
          // Draw cell content with proper padding and alignment
          let currentX = tableX;
          columns.forEach((col, colIndex) => {
            const cellLeft = currentX;
            const cellRight = currentX + col.width;
            
            // Calculate text position based on alignment
            let textX = cellLeft + padX; // Default left align with padding
            if (col.dataAlign === 'right') {
              textX = cellRight - padX;
            } else if (col.dataAlign === 'center') {
              textX = cellLeft + (col.width / 2);
            }
            
            // Handle multi-line description column
            if (colIndex === 3) {
              for (let i = 0; i < descLines.length; i++) {
                const textY = cellTop + padY + 3 + (i * lineHeight);
                pdf.text(descLines[i], textX, textY, { align: col.dataAlign as any });
              }
            } else {
              const textY = cellTop + padY + 3; // Single line with padding
              pdf.text(rowData[colIndex], textX, textY, { align: col.dataAlign as any });
            }
            
            currentX += col.width;
          });
          
          // Draw borders for this row
          pdf.setDrawColor(200, 200, 200);
          pdf.setLineWidth(0.35);
          
          // Draw horizontal line at bottom of row
          pdf.line(tableX, cellBottom, tableX + contentWidth, cellBottom);
          
          // Draw vertical column dividers for this row
          currentX = tableX;
          columns.forEach((col, index) => {
            if (index > 0) {
              pdf.line(currentX, cellTop, currentX, cellBottom);
            }
            currentX += col.width;
          });
          
          // Draw left and right borders
          pdf.line(tableX, cellTop, tableX, cellBottom); // Left border
          pdf.line(tableX + contentWidth, cellTop, tableX + contentWidth, cellBottom); // Right border
          
          yPosition = cellBottom;
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
        
        checkPageBreak(60);
        
        // Professional totals area
        const totalsWidth = 75;
        const totalsX = pageWidth - margin - totalsWidth;
        const labelsX = totalsX - 5;
        
        setFont('body');
        setColor('primary');
        
        // Check if we have tax or discounts that make total different from subtotal
        const hasTaxOrDiscounts = totals.taxAmount > 0 || totals.discountAmount > 0;
        
        if (hasTaxOrDiscounts) {
          // Add subtle background for itemized totals
          const bgHeight = (totals.taxAmount > 0 ? 30 : 20) + (totals.discountAmount > 0 ? 6 : 0);
          pdf.setFillColor(248, 248, 248);
          pdf.roundedRect(labelsX - 5, yPosition - 5, totalsWidth + 10, bgHeight, 2, 2, 'F');
          
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
          
          // Discount
          if (totals.discountAmount > 0) {
            pdf.text('Discount:', labelsX, yPosition, { align: 'right' });
            pdf.text(`-${formatCurrency(totals.discountAmount)}`, totalsX + totalsWidth, yPosition, { align: 'right' });
            yPosition += 6;
          }
          
          // Branded total line
          const [r, g, b] = colors.accent;
          pdf.setDrawColor(r, g, b);
          pdf.setLineWidth(2);
          pdf.line(labelsX, yPosition, totalsX + totalsWidth, yPosition);
          yPosition += 8;
          
          // Branded total with teal background
          pdf.setFillColor(r, g, b);
          pdf.rect(labelsX - 2, yPosition - 4, totalsWidth + 7, 12, 'F');
          
          pdf.setTextColor(255, 255, 255);
          setFont('subheading');
          pdf.text('TOTAL:', labelsX, yPosition + 2, { align: 'right' });
          pdf.text(formatCurrency(totals.total), totalsX + totalsWidth, yPosition + 2, { align: 'right' });
        } else {
          // Simple total when no tax/discounts - just a clean total line
          const [r, g, b] = colors.accent;
          
          // Simple branded line above total
          pdf.setDrawColor(r, g, b);
          pdf.setLineWidth(1.5);
          pdf.line(labelsX, yPosition, totalsX + totalsWidth, yPosition);
          yPosition += 8;
          
          // Clean total display
          setFont('subheading');
          pdf.text('TOTAL:', labelsX, yPosition, { align: 'right' });
          pdf.text(formatCurrency(totals.total), totalsX + totalsWidth, yPosition, { align: 'right' });
        }
        
        setColor('primary'); // Reset
        yPosition += 20;
      };
      
      const drawSignatureSection = () => {
        checkPageBreak(50);
        
        yPosition += 15;
        
        // Branded signature section header
        const [r, g, b] = colors.accent;
        pdf.setFillColor(r, g, b);
        pdf.rect(margin, yPosition - 5, contentWidth, 12, 'F');
        
        pdf.setTextColor(255, 255, 255);
        setFont('body');
        pdf.text('CLIENT ACCEPTANCE', margin + 5, yPosition + 2);
        
        setColor('primary');
        yPosition += 20;
        
        // Professional signature boxes
        const leftSigX = margin;
        const rightSigX = margin + (contentWidth / 2);
        
        // Left signature box
        pdf.setDrawColor(r, g, b);
        pdf.setLineWidth(1);
        pdf.rect(leftSigX, yPosition, 70, 25, 'S');
        
        setFont('small');
        setColor('gray');
        pdf.text('ACCEPTED DATE', leftSigX + 2, yPosition + 5);
        setColor('primary');
        pdf.text('Date:', leftSigX + 2, yPosition + 15);
        
        // Right signature box
        pdf.setDrawColor(r, g, b);
        pdf.rect(rightSigX, yPosition, 90, 25, 'S');
        
        setColor('gray');
        pdf.text('CLIENT SIGNATURE', rightSigX + 2, yPosition + 5);
        setColor('primary');
        pdf.text('Signature:', rightSigX + 2, yPosition + 15);
        pdf.text('Print Name:', rightSigX + 2, yPosition + 20);
        
        yPosition += 35;
      };

      const drawProfessionalCoverPage = async () => {
        if (!includeCoverPage) return;
        
        // === STUNNING BRANDED COVER PAGE ===
        
        // 1. Dramatic gradient-style header with multiple teal layers
        const brandBarHeight = 35;
        const [r, g, b] = colors.accent;
        
        // Main teal background
        pdf.setFillColor(r, g, b);
        pdf.rect(0, 0, pageWidth, brandBarHeight, 'F');
        
        // Simple clean design - single teal bar
        
        // Add logo to cover page header
        if (logoData) {
          const logoHeight = 15;
          const logoWidth = (logoData.width / logoData.height) * logoHeight;
          try {
            pdf.addImage(logoData.dataUrl, 'PNG', margin, 8, logoWidth, logoHeight);
          } catch (e) {
            console.warn('Could not add logo to cover:', e);
          }
        }
        
        // Clean header - logo only (no redundant text)
        
        // Contact info with style
        const rightX = pageWidth - margin;
        setFont('small');
        pdf.text('www.edgpatioshade.com', rightX, 16, { align: 'right' });
        pdf.text('+1 (815) 581-0138', rightX, 22, { align: 'right' });
        pdf.text('info@edgpatioshade.com', rightX, 28, { align: 'right' });
        
        // 2. Dramatic Title Section with branded styling
        yPosition = brandBarHeight + 45;
        setColor('primary');
        
        // Massive impact title
        pdf.setFontSize(32);
        pdf.setFont('helvetica', 'bold');
        pdf.text('PROJECT PROPOSAL', margin, yPosition);
        
        // Teal accent line under title
        pdf.setFillColor(r, g, b);
        pdf.rect(margin, yPosition + 5, 120, 3, 'F');
        
        // Project name with style
        yPosition += 20;
        setFont('heading');
        setColor('darkGray');
        pdf.text((quote.projectName || 'Outdoor Living Project').toUpperCase(), margin, yPosition);
        
        
        // 3. Hero Cover Image (if provided)
        yPosition += 25;
        let imageStartY = yPosition;
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
        
        // 4. Professional Metadata Panel (positioned to avoid overlap)
        const panelHeight = 85;
        
        let metadataY;
        let rectTop;
        
        // Position metadata panel to overlay the bottom-right of the cover image
        metadataY = imageStartY + 60; // Position in lower part of image area
        rectTop = metadataY - 5;
        const panelWidth = 85;
        const panelX = pageWidth - margin - panelWidth;
        const customer = quote.account ?? quote.customer;
        
        // Professional background with teal accent
        const [accentR, accentG, accentB] = colors.accent;
        pdf.setFillColor(248, 248, 248); // Light gray background
        pdf.roundedRect(panelX - 5, rectTop, panelWidth + 10, panelHeight, 3, 3, 'F');
        
        // Add teal accent border
        pdf.setDrawColor(accentR, accentG, accentB);
        pdf.setLineWidth(2);
        pdf.roundedRect(panelX - 5, rectTop, panelWidth + 10, panelHeight, 3, 3, 'S');
        
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
        
        
        // Add new page for main content (this will be page 2)
        pdf.addPage();
        currentPage++;
        yPosition = margin + 20; // Leave space for header
        drawHeader(); // This runs on page 2
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
      }
      // Note: If cover page was created, header/footer are already added in drawProfessionalCoverPage
      
      drawEstimateHeader();
      drawAddresses();
      drawEstimateDetails();
      
      // Step 3: Add product renderings (if uploaded)
      await drawProductRenderingsSection();
      
      drawProfessionalTable();
      drawTotalsSection();
      
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
        
        // Branded contract header
        const [r, g, b] = colors.accent;
        pdf.setFillColor(r, g, b);
        pdf.rect(margin, yPosition - 8, contentWidth, 18, 'F');
        
        pdf.setTextColor(255, 255, 255);
        setFont('subheading');
        pdf.text('CONTRACT TERMS & CONDITIONS', margin + 5, yPosition + 2);
        
        // Clean design without decorative lines
        
        setColor('primary');
        yPosition += 25;
        
        // Get contract content
        const contractContent = quote.contractTemplate?.terms || quote.customContractTerms || '';
        
        if (contractContent.trim()) {
          setFont('small');
          setColor('primary');
          
          // Process contract content line by line with proper formatting
          const lines = contractContent.split('\n');
          let inSection = false;
          
          for (const line of lines) {
            const trimmedLine = line.trim();
            
            // Skip empty lines but add spacing
            if (!trimmedLine) {
              yPosition += 4;
              continue;
            }
            
            // Check if this line starts a new numbered section (e.g., "1.", "2.", etc.)
            const isSectionStart = /^\d+\.(\s|$)/.test(trimmedLine);
            
            if (isSectionStart) {
              // Add extra spacing before new sections (except the first one)
              if (inSection) {
                yPosition += 8;
              }
              inSection = true;
            }
            
            // Calculate proper text width for wrapping - ensure it fits within margins
            const textStartX = margin;
            const availableWidth = contentWidth - 10; // Leave extra margin for safety
            const wrappedLines = pdf.splitTextToSize(trimmedLine, availableWidth);
            
            // Check for page break before rendering this section
            checkPageBreak(wrappedLines.length * 4.5 + 8);
            
            // Reset font after potential page break to ensure consistency
            setFont('small');
            setColor('primary');
            
            // Render each wrapped line with proper spacing
            for (let j = 0; j < wrappedLines.length; j++) {
              pdf.text(wrappedLines[j], textStartX, yPosition);
              yPosition += 4.5; // Slightly more line spacing for readability
            }
            
            // Add small spacing after each paragraph/section
            if (!isSectionStart || wrappedLines.length > 1) {
              yPosition += 2;
            }
          }
        }
      }
      
      // Add footers to all pages after content is generated
      const totalPages = pdf.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        currentPage = i;
        pdf.setPage(i);
        drawFooter();
      }

      // Save the PDF
      const pdfBlob = pdf.output('blob');
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '');
      const customer = quote.account ?? quote.customer;
      const filename = `${customer.name.replace(/[^a-zA-Z0-9]/g, '_')}_Estimate_${timestamp}.pdf`;
      
      // Create download link and store URL for viewing
      const url = URL.createObjectURL(pdfBlob);
      
      // Store the PDF URL for viewing functionality
      setGeneratedPdfUrl(url);
      
      // Auto-download the PDF
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      // Note: Don't revoke URL immediately so users can view the PDF
      
      toast({
        title: "PDF Generated Successfully",
        description: `Professional proposal downloaded as ${filename}. You can also view it using the buttons below.`,
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

          {/* Generated PDF Success */}
          {generatedPdfUrl && (
            <Card className="border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                      ✓
                    </div>
                    <div>
                      <p className="text-sm font-medium text-green-800 dark:text-green-200">
                        PDF Generated Successfully
                      </p>
                      <p className="text-xs text-green-600 dark:text-green-400">
                        Quote {quote.quoteNumber} is ready for review
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const link = document.createElement('a');
                        link.href = generatedPdfUrl;
                        link.download = `Quote-${quote.quoteNumber}.pdf`;
                        link.click();
                      }}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => window.open(generatedPdfUrl, '_blank')}
                      data-testid="button-view-pdf"
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      View PDF
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

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