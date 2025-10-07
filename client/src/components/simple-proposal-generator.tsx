import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { FileText, Upload, X, Download, Loader2, Eye, Image, Camera } from 'lucide-react';
import { formatCurrency, calculateQuoteTotals, calculateLineItemTotal } from '@/lib/utils';
import { ensureSpace, measureAcceptanceBlock } from '@/lib/pdf-utils';
import { getProxiedImageUrl } from '@/lib/image-utils';
import { apiRequest, queryClient } from '@/lib/queryClient';
import type { QuoteWithDetails, QuoteCoverPhoto, QuoteProductRendering } from '@shared/schema';
import jsPDF from 'jspdf';
import logoPath from '@assets/Logo_Full Color_Black_1758731429139.png';
import { barlowRegularBase64, barlowSemiBoldBase64 } from '@/lib/fonts';
import { generateBrandedSequencePDF } from '@/lib/pdf-branded-sequence';
import { normalizeImageToDataUrl } from '@/lib/pdf-image-pipeline';

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
  const [layoutMode, setLayoutMode] = useState<'classic' | 'branded-sequence'>('classic');
  
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

  // Fetch groups for this quote
  const { data: groups = [] } = useQuery({
    queryKey: ["/api/quotes", quote.id, "groups"],
    queryFn: async ({ signal }) => {
      const response = await apiRequest('GET', `/api/quotes/${quote.id}/groups`, undefined, { signal });
      return response.json();
    },
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
        title: "Visual asset saved",
        description: "Your visual asset has been added to the quote",
      });
      // Clear the temp rendering that was just uploaded
      setTempProductRenderings(prev => prev.filter(temp => temp.file !== file));
    },
    onError: (error: any) => {
      toast({
        title: "Upload failed",
        description: error.message || "Failed to save visual asset",
        variant: "destructive"
      });
    }
  });

  // Mutation for deleting cover photos
  const deleteCoverPhotoMutation = useMutation({
    mutationFn: async (imageId: number) => {
      return await apiRequest('DELETE', `/api/quote-images/cover-photo/${imageId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/quotes/${quote.id}/cover-photos`] });
      toast({
        title: "Cover photo deleted",
        description: "The cover photo has been permanently removed",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Delete failed",
        description: error.message || "Failed to delete cover photo",
        variant: "destructive"
      });
    }
  });

  // Mutation for deleting visual assets
  const deleteProductRenderingMutation = useMutation({
    mutationFn: async (imageId: number) => {
      return await apiRequest('DELETE', `/api/quote-images/product-rendering/${imageId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/quotes/${quote.id}/product-renderings`] });
      toast({
        title: "Visual asset deleted",
        description: "The visual asset has been permanently removed",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Delete failed",
        description: error.message || "Failed to delete visual asset",
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

  // Helper function to get effective visual assets (persistent + temp)
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
      if (file.size > 100 * 1024 * 1024) { // 100MB limit
        toast({
          title: "File too large",
          description: "Please upload files smaller than 100MB",
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
        // Delete persistent cover photo from database and object storage
        deleteCoverPhotoMutation.mutate(persistentCoverPhoto.id as number);
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
          // Delete persistent product rendering from database and object storage
          deleteProductRenderingMutation.mutate(found.id as number);
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

  const generateClassicPDF = async () => {
    // Load logo for use throughout PDF
    const logoData = await loadLogo();
      // Baseline grid system for consistent spacing
      const BASELINE = 6; // 6mm baseline grid
      
      // Grid-based spacing constants
      const spacing = {
        xs: BASELINE,           // 6mm
        sm: BASELINE * 2,       // 12mm
        md: BASELINE * 3,       // 18mm
        lg: BASELINE * 4,       // 24mm
        xl: BASELINE * 5,       // 30mm
        xxl: BASELINE * 6       // 36mm
      };

      // Professional document setup - US Letter size
      const pdf = new jsPDF('p', 'mm', 'letter');
      
      // Add Barlow fonts to PDF
      pdf.addFileToVFS('Barlow-Regular.ttf', barlowRegularBase64);
      pdf.addFont('Barlow-Regular.ttf', 'Barlow', 'normal');
      pdf.addFileToVFS('Barlow-SemiBold.ttf', barlowSemiBoldBase64);
      pdf.addFont('Barlow-SemiBold.ttf', 'Barlow', 'bold');
      
      const pageWidth = 215.9; // Letter width in mm
      const pageHeight = 279.4; // Letter height in mm
      const margin = 19; // Professional margins (3/4 inch)
      const contentWidth = pageWidth - (2 * margin);
      let yPosition = margin + spacing.lg; // Leave space for header with logo and title (24mm)
      let currentPage = 1;

      // Professional typography scale - locked type scale
      const fonts = {
        h1: { size: 19, weight: 'bold' },        // H1 (18–20pt) 
        h2: { size: 15, weight: 'bold' },        // H2 (14–16pt)
        h3: { size: 12, weight: 'bold' },        // H3 (12–13pt)
        body: { size: 10, weight: 'normal' },    // Body (10pt)
        small: { size: 9, weight: 'normal' }     // Small (9pt)
      };
      
      const colors = {
        primary: [60, 60, 60], // Dark body text #3C3C3C
        white: [255, 255, 255], // White #ffffff
        accent: [66, 255, 193], // EDG Teal #42ffc1
        accentRgb: '#42ffc1', // For hex operations
        gray: [153, 153, 153], // Darker table lines #999999
        lightGray: [240, 240, 240],
        darkGray: [60, 60, 60],
        tableLines: [153, 153, 153], // Table border color #999999
        onAccent: [0, 0, 0] // Dark text on teal background #000000
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
        pdf.setFont('Barlow', fonts[type].weight as any);
      };
      
      const setColor = (colorKey: keyof typeof colors) => {
        const color = colors[colorKey];
        if (Array.isArray(color)) {
          const [r, g, b] = color;
          pdf.setTextColor(r, g, b);
        }
      };

      // Grid-based spacing helpers
      const addSpace = (size: keyof typeof spacing) => {
        yPosition += spacing[size];
      };

      const addCustomSpace = (mm: number) => {
        // Round to nearest baseline increment
        const gridUnits = Math.round(mm / BASELINE);
        yPosition += gridUnits * BASELINE;
      };

      const addSectionBreak = () => {
        addSpace('lg'); // Standard section break (24mm)
      };

      const addParagraphBreak = () => {
        addSpace('sm'); // Standard paragraph break (12mm)
      };
      
      // Legacy functions removed - only use ensureSpace() for page breaks
      
      const stampHeader = (pageTitle: string, projectName: string) => {
        // Skip header on cover page - cover has its own branding
        if (includeCoverPage && currentPage === 1) return;
        
        const headerY = margin;
        
        // Branded header background with teal accent strip
        const [r, g, b] = colors.accent;
        pdf.setFillColor(r, g, b);
        pdf.rect(0, 0, pageWidth, 4, 'F'); // Teal strip at very top
        
        // Add logo to header if available
        if (logoData) {
          const logoHeight = 12;
          const logoWidth = (logoData.width / logoData.height) * logoHeight;
          try {
            pdf.addImage(logoData.dataUrl, 'PNG', margin, headerY, logoWidth, logoHeight);
          } catch (e) {
            console.warn('Could not add logo to header:', e);
          }
        }
        
        // Page title and project name in center
        setFont('h2');
        setColor('primary');
        const centerX = pageWidth / 2;
        pdf.text(pageTitle.toUpperCase(), centerX, headerY + 4, { align: 'center' });
        
        setFont('body');
        setColor('darkGray');
        pdf.text(projectName, centerX, headerY + 9, { align: 'center' });
        
        // Branded bottom border
        pdf.setDrawColor(r, g, b);
        pdf.setLineWidth(1);
        pdf.line(margin, headerY + 12, pageWidth - margin, headerY + 12);
      };

      const drawHeader = () => {
        stampHeader('Project Proposal', quote.projectName || 'Outdoor Living Project');
      };
      
      const stampFooter = (pageNumber: number, pageCount: number) => {
        // Skip footer on cover page - cover has its own custom footer
        if (includeCoverPage && currentPage === 1) {
          return;
        }
        
        const footerY = pageHeight - 15 + 2; // Use same 15mm reserve as ensureSpace
        const [r, g, b] = colors.accent;
        
        // Branded footer with teal accent line
        pdf.setDrawColor(r, g, b);
        pdf.setLineWidth(2);
        pdf.line(margin, footerY - 8, pageWidth - margin, footerY - 8);
        
        // Company name on left
        setFont('small');
        setColor('primary');
        pdf.text(company.name, margin, footerY - 2, { align: 'left' });
        
        // Page numbers in center
        pdf.text(`page ${pageNumber} of ${pageCount}`, pageWidth / 2, footerY - 2, { align: 'center' });
        
        // Contact info on right
        setColor('darkGray');
        pdf.text(`${company.phone}  •  ${company.email}`, pageWidth - margin, footerY - 2, { align: 'right' });
      };

      const drawFooter = () => {
        const totalPages = pdf.getNumberOfPages();
        stampFooter(currentPage, totalPages);
      };
      
      const drawEstimateHeader = () => {
        // Create a stunning branded header with teal background
        const [r, g, b] = colors.accent;
        pdf.setFillColor(r, g, b);
        
        // Draw teal background rectangle with consistent width
        pdf.rect(margin, yPosition - 8, contentWidth, 20, 'F');
        
        // Clean design without shadow effects
        
        // Dark text on teal background for better contrast
        setColor('onAccent');
        setFont('h1');
        pdf.text('PROFESSIONAL ESTIMATE', margin + 5, yPosition + 2);
        
        // Clean design without decorative lines
        
        // Reset text color
        setColor('primary');
        addSpace('lg'); // 24mm
      };
      
      const drawAddresses = () => {
        const leftCol = margin;
        const rightCol = margin + (contentWidth / 2);
        const startY = yPosition;
        
        // Bill To
        setFont('body');
        setColor('primary');
        pdf.text('Bill to', leftCol, yPosition);
        addSpace('xs'); // 6mm
        
        setFont('body');
        const customer = (quote.account ?? quote.customer)!;
        pdf.text(customer.name, leftCol, yPosition);
        addSpace('xs'); // 6mm
        if (customer.company) {
          pdf.text(customer.company, leftCol, yPosition);
          addSpace('xs'); // 6mm
        }
        if (customer.billingAddress) {
          const billingLines = pdf.splitTextToSize(customer.billingAddress, (contentWidth / 2) - 10);
          for (const line of billingLines) {
            pdf.text(line, leftCol, yPosition);
            addSpace('xs'); // 6mm
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
        
        addSpace('sm'); // 12mm // Extra spacing after addresses
      };
      
      const drawEstimateDetails = () => {
        addSpace('sm'); // 12mm
        
        setFont('body');
        setColor('primary');
        
        // Create a simple details grid
        const detailsY = yPosition;
        pdf.text('Estimate details', margin, detailsY);
        addSpace('sm'); // 12mm
        
        // Estimate number and date
        pdf.text(`Estimate no.: ${quote.id}`, margin, yPosition);
        addSpace('xs'); // 6mm
        
        const estimateDate = new Date().toLocaleDateString('en-US', {
          month: '2-digit',
          day: '2-digit', 
          year: 'numeric'
        });
        pdf.text(`Estimate date: ${estimateDate}`, margin, yPosition);
        addSpace('md'); // 18mm
      };
      
      const drawProfessionalTable = () => {
        if (quote.lineItems.length === 0) return;
        
        // Build grouped line items structure
        const orderedGroups = [...groups].sort((a: any, b: any) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER));
        const itemsByGroup = new Map<string, any[]>();
        orderedGroups.forEach(g => itemsByGroup.set(g.id, []));

        const ungrouped: any[] = [];
        quote.lineItems.forEach(li => {
          if (li.groupId && itemsByGroup.has(li.groupId)) {
            itemsByGroup.get(li.groupId)!.push(li);
          } else {
            ungrouped.push(li);
          }
        });

        // Sort within groups by position
        itemsByGroup.forEach((arr, gid) => {
          arr.sort((a: any, b: any) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER));
        });
        ungrouped.sort((a: any, b: any) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER));
        
        // Padding constants and layout metrics - all in mm
        const lineHeight = spacing.xs * 0.67; // ~4mm, grid-aligned
        const padX = spacing.xs * 0.5; // 3mm
        const padY = spacing.xs * 0.5; // 3mm
        const rowHeight = 14;
        const headerHeight = 12;
        
        // Column configuration with proper proportions
        const tableWidth = contentWidth;
        const columns = [
          { header: 'Description', width: tableWidth * 0.60, dataAlign: 'left' },
          { header: 'Qty', width: tableWidth * 0.10, dataAlign: 'right' },
          { header: 'Price', width: tableWidth * 0.15, dataAlign: 'right' },
          { header: 'Total', width: tableWidth * 0.15, dataAlign: 'right' }
        ];
        
        const tableX = margin;
        
        const drawTableHeader = () => {
          const headerTop = yPosition;
          
          // Professional branded table header with teal background
          const [r, g, b] = colors.accent;
          pdf.setFillColor(r, g, b);
          pdf.rect(tableX, headerTop, contentWidth, headerHeight, 'F');
          
          // Draw header borders
          const [tr, tg, tb] = colors.tableLines;
          pdf.setDrawColor(tr, tg, tb);
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
          
          // Dark text on teal background for better contrast
          setColor('onAccent');
          setFont('h3');
          
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
        
        // Enhanced drawTableRow helper with zebra striping and pagination
        const drawTableRow = (item: any, index: number) => {
          const qty = parseFloat(item.quantity.toString());
          const cost = parseFloat(item.unitPrice.toString());
          
          // Calculate the actual selling price (cost + markup)
          const markupValue = parseFloat(item.markupValue?.toString() || '0');
          const markupType = item.markupType || 'percentage';
          const sellingPrice = markupType === 'percentage' 
            ? cost * (1 + markupValue / 100)
            : cost + markupValue;
          
          // Use shared calculation helper to ensure consistency
          const total = calculateLineItemTotal(
            item.quantity,
            item.unitPrice,
            item.markupType,
            item.markupValue,
            item.discountType || "percentage",
            item.discountValue || 0
          );
          
          // Calculate proper row height based on description wrapping
          const maxDescWidth = columns[0].width - 2*padX;
          const descLines = pdf.splitTextToSize(item.description, maxDescWidth);
          const actualRowHeight = Math.max(rowHeight, padY*2 + descLines.length*lineHeight);
          
          // Check for page break and redraw header if needed
          yPosition = ensureSpace(pdf, yPosition, actualRowHeight + spacing.xs, {
            marginTop: margin,
            marginBottom: margin,
            footerReserve: 15,
            onNewPage: () => {
              currentPage++;
              drawTableHeader();
            }
          });
          
          const cellTop = yPosition;
          const cellBottom = cellTop + actualRowHeight;
          
          // Zebra striping for better readability
          if (index % 2 === 0) {
            pdf.setFillColor(248, 248, 248); // Very light gray for alternate rows
            pdf.rect(tableX, cellTop, contentWidth, actualRowHeight, 'F');
          }
          
          // Set font for row content
          setFont('small');
          setColor('primary');
          
          // Row data with proper numeric formatting
          const rowData = [
            item.description, // Full description (multi-line)
            qty.toString(),
            formatCurrency(sellingPrice), // Show the markup-adjusted selling price, not cost
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
            if (colIndex === 0) {
              for (let i = 0; i < descLines.length; i++) {
                const textY = cellTop + padY + 3 + (i * lineHeight);
                pdf.text(descLines[i], textX, textY, { align: col.dataAlign as any });
              }
            } else {
              // Center text vertically in single-line cells
              const textY = cellTop + (actualRowHeight / 2) + 1;
              pdf.text(rowData[colIndex], textX, textY, { align: col.dataAlign as any });
            }
            
            currentX += col.width;
          });
          
          // Draw subtle row separators
          const [tr, tg, tb] = colors.tableLines;
          pdf.setDrawColor(tr, tg, tb);
          pdf.setLineWidth(0.25); // Thinner lines for subtle separation
          
          // Draw horizontal line at bottom of row
          pdf.line(tableX, cellBottom, tableX + contentWidth, cellBottom);
          
          // Draw vertical column dividers for this row
          currentX = tableX;
          columns.forEach((col, colIndex) => {
            if (colIndex > 0) {
              pdf.line(currentX, cellTop, currentX, cellBottom);
            }
            currentX += col.width;
          });
          
          // Draw left and right borders
          pdf.line(tableX, cellTop, tableX, cellBottom); // Left border
          pdf.line(tableX + contentWidth, cellTop, tableX + contentWidth, cellBottom); // Right border
          
          yPosition = cellBottom;
          return total; // Return value for subtotal accumulation
        };
        
        // Helper: draw a group header row (light grey band)
        const drawGroupHeader = (title: string) => {
          const headerH = 10;
          // Avoid page break splitting header
          yPosition = ensureSpace(pdf, yPosition, headerH + 2, {
            marginTop: margin,
            marginBottom: margin,
            footerReserve: 15,
            onNewPage: () => {
              currentPage++;
              drawTableHeader();
            }
          });
          // Light grey band
          pdf.setFillColor(240, 240, 240);
          pdf.rect(tableX, yPosition, contentWidth, headerH, 'F');
          setFont('body'); 
          setColor('primary');
          pdf.text(title, tableX + 3, yPosition + 7);
          yPosition += headerH;
        };

        // Helper: draw a group subtotal row
        const drawGroupSubtotal = (amount: number) => {
          const rowH = 10;
          yPosition = ensureSpace(pdf, yPosition, rowH + 2, {
            marginTop: margin,
            marginBottom: margin,
            footerReserve: 15,
            onNewPage: () => {
              currentPage++;
              drawTableHeader();
            }
          });
          setFont('body');
          // Label cell (spans first 3 columns)
          pdf.text('Group Subtotal', tableX + columns[0].width + columns[1].width + columns[2].width - 3, yPosition + 7, { align: 'right' });
          // Amount in Total column
          pdf.text(formatCurrency(amount), tableX + contentWidth - 3, yPosition + 7, { align: 'right' });
          // Divider
          const [tr, tg, tb] = colors.tableLines;
          pdf.setDrawColor(tr, tg, tb); 
          pdf.setLineWidth(0.35);
          pdf.line(tableX, yPosition + rowH, tableX + contentWidth, yPosition + rowH);
          yPosition += rowH;
        };

        // Draw table header
        drawTableHeader();
        
        // Render each group in order with headers and subtotals
        for (const g of orderedGroups) {
          const items = (itemsByGroup.get(g.id) ?? []);
          // Show header always; if collapsed, skip items but still show subtotal
          drawGroupHeader(g.title);

          let groupSubtotal = 0;
          if (!g.isCollapsed) {
            items.forEach((item, idx) => {
              // Check page break before first data row to keep it with header
              if (idx === 0) {
                yPosition = ensureSpace(pdf, yPosition, 14 + 2, {
                  marginTop: margin,
                  marginBottom: margin,
                  footerReserve: 15,
                  onNewPage: () => {
                    currentPage++;
                    drawTableHeader();
                  }
                });
              }
              groupSubtotal += drawTableRow(item, idx); // drawTableRow now returns the row total
            });
          } else {
            // When collapsed, compute subtotal from data without drawing rows
            groupSubtotal = items.reduce((sum, item) => {
              // Use same shared calculation helper as drawTableRow
              const lineTotal = calculateLineItemTotal(
                item.quantity,
                item.unitPrice,
                item.markupType,
                item.markupValue,
                item.discountType || "percentage",
                item.discountValue || 0
              );
              return sum + lineTotal;
            }, 0);
          }

          drawGroupSubtotal(groupSubtotal);
        }

        // Ungrouped (if any)
        if (ungrouped.length > 0) {
          // Don't add a group header for ungrouped items - show them directly
          let ungroupedSubtotal = 0;
          ungrouped.forEach((item, idx) => { 
            // Check page break before first data row to keep it with header
            if (idx === 0) {
              yPosition = ensureSpace(pdf, yPosition, 14 + 2, {
                marginTop: margin,
                marginBottom: margin,
                footerReserve: 15,
                onNewPage: () => {
                  currentPage++;
                  drawTableHeader();
                }
              });
            }
            ungroupedSubtotal += drawTableRow(item, idx); 
          });
          drawGroupSubtotal(ungroupedSubtotal);
        }
        
        addSpace('sm'); // 12mm
      };
      
      const drawTotalsSection = () => {
        if (!showPricing) return;
        
        // Add spacer before totals section
        addSpace('sm'); // 12mm spacer
        
        yPosition = ensureSpace(pdf, yPosition, 60, {
          marginTop: margin,
          marginBottom: margin,
          footerReserve: 15,
          onNewPage: () => {
            currentPage++;
            drawHeader();
          }
        });
        
        // Professional totals area
        const totalsWidth = 75;
        const totalsX = pageWidth - margin - totalsWidth;
        const labelsX = totalsX - 5;
        
        setFont('body');
        setColor('primary');
        
        // Check if we have shipping, tax, or discounts that make total different from subtotal
        const hasBreakdownItems = totals.shippingAmount > 0 || totals.taxAmount > 0 || totals.discountAmount > 0;
        
        // Calculate total box height based on content
        const baseHeight = 15; // Height for TOTAL row
        const itemHeight = 8; // Height per subtotal item
        let totalBoxHeight = baseHeight;
        
        if (hasBreakdownItems) {
          totalBoxHeight += itemHeight; // Subtotal
          if (totals.shippingAmount > 0) totalBoxHeight += itemHeight; // Shipping
          if (totals.discountAmount > 0) totalBoxHeight += itemHeight; // Discount
          if (totals.taxAmount > 0) totalBoxHeight += itemHeight; // Tax
        }
        
        // Draw light gray background box for entire totals section
        // Calculate proper box dimensions to contain all text
        const boxLeft = labelsX - 25; // More space for left-aligned labels
        const boxWidth = totalsWidth + 35; // Wider to contain both labels and values
        
        pdf.setFillColor(245, 245, 245); // Light gray background
        pdf.roundedRect(boxLeft, yPosition - 5, boxWidth, totalBoxHeight + 10, 3, 3, 'F');
        
        // Draw subtle border around totals box
        pdf.setDrawColor(200, 200, 200);
        pdf.setLineWidth(0.5);
        pdf.roundedRect(boxLeft, yPosition - 5, boxWidth, totalBoxHeight + 10, 3, 3, 'S');
        
        if (hasBreakdownItems) {
          // Subtotal
          setFont('body');
          setColor('primary');
          pdf.text('Subtotal:', labelsX, yPosition, { align: 'right' });
          pdf.text(formatCurrency(totals.subtotal), totalsX + totalsWidth, yPosition, { align: 'right' });
          addSpace('xs'); // 6mm
          
          // Shipping
          if (totals.shippingAmount > 0) {
            pdf.text('Shipping:', labelsX, yPosition, { align: 'right' });
            pdf.text(formatCurrency(totals.shippingAmount), totalsX + totalsWidth, yPosition, { align: 'right' });
            addSpace('xs'); // 6mm
          }
          
          // Discount
          if (totals.discountAmount > 0) {
            pdf.text('Discount:', labelsX, yPosition, { align: 'right' });
            pdf.text(`-${formatCurrency(totals.discountAmount)}`, totalsX + totalsWidth, yPosition, { align: 'right' });
            addSpace('xs'); // 6mm
          }
          
          // Sales tax
          if (totals.taxAmount > 0) {
            pdf.text('Sales tax:', labelsX, yPosition, { align: 'right' });
            pdf.text(formatCurrency(totals.taxAmount), totalsX + totalsWidth, yPosition, { align: 'right' });
            addSpace('xs'); // 6mm
          }
          
          // Separator line before total
          pdf.setDrawColor(180, 180, 180);
          pdf.setLineWidth(0.5);
          pdf.line(labelsX, yPosition, totalsX + totalsWidth, yPosition);
          addSpace('xs'); // 6mm
        }
        
        // Bold TOTAL with increased font size
        pdf.setFontSize(fonts.h2.size + 2); // Increase by 2pts (15pt -> 17pt)
        pdf.setFont('Barlow', 'bold');
        setColor('primary');
        pdf.text('TOTAL:', labelsX, yPosition, { align: 'right' });
        pdf.text(formatCurrency(totals.total), totalsX + totalsWidth, yPosition, { align: 'right' });
        
        // Reset font and color
        setColor('primary');
        setFont('body'); // Reset to body font
        
        // Advance yPosition to include totals box outer padding (bottom padding of 5mm)
        yPosition += 5; // Account for bottom padding of rounded box
        addSpace('md'); // 18mm additional spacing
      };
      
      const drawSignatureSection = () => {
        // Single source of truth: configure once, measure once, draw with same config
        const cfg = {
          heading: "CLIENT ACCEPTANCE",
          width: contentWidth,
          headingFontSizePt: 14,
          bodyFontSizePt: 11,
          spacingTop: 12,           // mm above the block
          spacingAfterHeading: 6,
          fieldGap: 8,
          labelGap: 2,
          bottomPadding: 10,
          fields: [
            { label: "Signature:",  lineWidthMm: contentWidth * 0.62 },
            { label: "Date:",       lineWidthMm: contentWidth * 0.30 },
            { label: "Print Name:", lineWidthMm: contentWidth * 0.62 },
          ],
        };

        const blockH = measureAcceptanceBlock(pdf, cfg);

        // ensure we have space; if not, add page and reset y
        yPosition = ensureSpace(pdf, yPosition, blockH, {
          marginTop: margin,
          marginBottom: margin,     // your bottom content margin, e.g., 19
          footerReserve: 15,        // your reserved footer band
          onNewPage: () => {
            // if you need to re-draw page header on new page, do it here
            drawHeader();
          }
        });

        // now DRAW with the same config used to measure
        yPosition += cfg.spacingTop;

        // Header (no teal fill; make legal/contract look distinct)
        pdf.setFont("Barlow", "bold");
        pdf.setFontSize(cfg.headingFontSizePt);
        pdf.text(cfg.heading, margin, yPosition);
        yPosition += cfg.headingFontSizePt * 0.352778 * 1.2; // advance by heading line-height

        // divider
        pdf.setDrawColor(200);
        pdf.line(margin, yPosition + 2, margin + contentWidth, yPosition + 2);
        yPosition += cfg.spacingAfterHeading;

        // Body labels + lines
        pdf.setFont("Barlow", "normal");
        pdf.setFontSize(cfg.bodyFontSizePt);

        const drawField = (label: string, lineWidthMm: number) => {
          const labelH = cfg.bodyFontSizePt * 0.352778 * 1.15;
          pdf.text(label, margin, yPosition + labelH);
          // label -> line gap
          const lineY = yPosition + labelH + cfg.labelGap;
          pdf.line(margin + 28, lineY, margin + 28 + lineWidthMm, lineY); // shift 28mm to leave label
          yPosition = lineY + cfg.fieldGap;
        };

        cfg.fields.forEach(f => drawField(f.label, f.lineWidthMm));

        yPosition += cfg.bottomPadding;
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
        const logoY = 8;
        const logoHeight = 15;
        let logoWidth = 0;
        
        if (logoData) {
          logoWidth = (logoData.width / logoData.height) * logoHeight;
          try {
            pdf.addImage(logoData.dataUrl, 'PNG', margin, logoY, logoWidth, logoHeight);
          } catch (e) {
            console.warn('Could not add logo to cover:', e);
          }
        }
        
        // Contact info vertically aligned with logo center
        const logoCenterY = logoY + logoHeight / 2; // Center of logo = 8 + 7.5 = 15.5mm
        const lineSpacing = 4; // 4mm between contact lines
        const contactStartY = logoCenterY - lineSpacing; // Start 4mm above center = 11.5mm
        
        const rightX = pageWidth - margin;
        setFont('small');
        setColor('onAccent'); // Dark text on teal background
        pdf.text('www.edgpatioshade.com', rightX, contactStartY + lineSpacing, { align: 'right' }); // 15.5mm
        pdf.text('+1 (815) 581-0138', rightX, contactStartY + (lineSpacing * 2), { align: 'right' }); // 19.5mm  
        pdf.text('info@edgpatioshade.com', rightX, contactStartY + (lineSpacing * 3), { align: 'right' }); // 23.5mm
        
        // 2. Dramatic Title Section with branded styling
        yPosition = brandBarHeight + 45;
        setColor('primary');
        
        // Massive impact title
        pdf.setFontSize(32);
        pdf.setFont('Barlow', 'bold');
        pdf.text('PROJECT PROPOSAL', margin, yPosition);
        
        // Thin left-aligned rule under title
        pdf.setDrawColor(60, 60, 60); // Dark gray
        pdf.setLineWidth(0.5); // Thin line
        pdf.line(margin, yPosition + 5, margin + 80, yPosition + 5); // Left-aligned rule
        
        // Project name with style
        addSpace('md'); // 18mm
        setFont('h1');
        setColor('darkGray');
        pdf.text((quote.projectName || 'Outdoor Living Project').toUpperCase(), margin, yPosition);
        
        // Clean project details below title (no box)
        addSpace('sm'); // 12mm
        setFont('body');
        setColor('darkGray');
        
        const customer = (quote.account ?? quote.customer)!;
        const currentDate = new Date().toLocaleDateString('en-US', { 
          year: 'numeric', month: 'long', day: 'numeric' 
        });
        
        // Two simple lines with project details
        if (customer.name) {
          pdf.text(`Client: ${customer.name}`, margin, yPosition);
          addSpace('xs'); // 6mm
        }
        pdf.text(`Date: ${currentDate}`, margin, yPosition);
        
        // 3. Hero Cover Image (if provided)
        addSpace('lg'); // 24mm
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
        
        // Clean, minimalist design - no overlay box needed
        
        
        // Cover page complete - next content will start on a new page when needed
      };

      const drawVisualsDetailsSection = async () => {
        if (productRenderings.length === 0) return;
        
        // === DEDICATED FULL-PAGE GALLERY ===
        // Start renderings on their own page(s) for maximum impact
        pdf.addPage();
        currentPage++;
        yPosition = margin + spacing.lg;
        
        const [r, g, b] = colors.accent;
        
        // Gallery page header
        pdf.setFillColor(r, g, b);
        pdf.rect(margin, yPosition - 8, contentWidth, 18, 'F');
        
        setColor('onAccent');
        setFont('h2');
        pdf.text('VISUALS & DETAILS', margin + 5, yPosition + 2);
        
        setColor('primary');
        addSpace('lg'); // 24mm space after header
        
        // Calculate dimensions for showcase images
        const maxImageHeight = (pageHeight - margin * 2 - 50) * 0.75; // 75% of available page height
        const maxImageWidth = contentWidth;
        
        // Show 1 large image per page for maximum showcase impact
        const imagesPerPage = 1;
        let imageIndex = 0;
        
        // Process each image on its own page
        for (let i = 0; i < productRenderings.length; i++) {
          const rendering = productRenderings[i];
          
          try {
            const { dataUrl, format } = await getImageDataForPDF(rendering);
            
            // Calculate actual image dimensions maintaining aspect ratio
            const img = document.createElement('img') as HTMLImageElement;
            img.src = dataUrl;
            await img.decode();
            
            const aspectRatio = img.width / img.height;
            
            // Size image to fit within max dimensions while maintaining aspect ratio
            let imageWidth = maxImageWidth;
            let imageHeight = imageWidth / aspectRatio;
            
            // If height exceeds max, scale down to fit height
            if (imageHeight > maxImageHeight) {
              imageHeight = maxImageHeight;
              imageWidth = imageHeight * aspectRatio;
            }
            
            // Center image horizontally
            const imageX = margin + (contentWidth - imageWidth) / 2;
            
            // Add image to PDF
            pdf.addImage(dataUrl, format, imageX, yPosition, imageWidth, imageHeight);
            
            // Clean up converted image URL if different from original
            if (dataUrl !== rendering.preview) {
              URL.revokeObjectURL(dataUrl);
            }
            
            // Start new page for next image (except for the last one)
            if (i < productRenderings.length - 1) {
              pdf.addPage();
              currentPage++;
              yPosition = margin + spacing.lg;
              
              // Add gallery header to continuation page
              pdf.setFillColor(r, g, b);
              pdf.rect(margin, yPosition - 8, contentWidth, 18, 'F');
              
              setColor('onAccent');
              setFont('h2');
              pdf.text('VISUALS & DETAILS (CONTINUED)', margin + 5, yPosition + 2);
              
              setColor('primary');
              addSpace('lg'); // 24mm space after header
            }
            
          } catch (e) {
            console.warn(`Could not add rendering ${i} to PDF:`, e);
          }
        }
        
        // Ensure we have proper spacing at the end
        addSpace('xl'); // 30mm final spacing
      };

      // === MAIN PDF GENERATION FLOW ===
      
      // Step 1: Professional cover page (if enabled)
      await drawProfessionalCoverPage();
      
      // Step 2: Add visuals & details (if uploaded) - on their own page(s)
      await drawVisualsDetailsSection();
      
      // Step 3: Generate main estimate page
      pdf.addPage();
      currentPage++;
      yPosition = margin + spacing.lg;
      drawHeader(); // This adds the proper header for the estimate page
      
      drawProfessionalTable();
      drawTotalsSection();
      
      // Step 4: Signature section
      drawSignatureSection();
      
      // Terms & Conditions section
      if (includeContract && hasContractData) {
        // Always start terms on a new page for clarity
        pdf.addPage();
        currentPage++;
        yPosition = margin + spacing.lg;
        
        // Branded terms header
        const [r, g, b] = colors.accent;
        pdf.setFillColor(r, g, b);
        pdf.rect(margin, yPosition - 8, contentWidth, 18, 'F');
        
        setColor('onAccent');
        setFont('h2');
        pdf.text('CONTRACT TERMS & CONDITIONS', margin + 5, yPosition + 2);
        
        setColor('primary');
        // Advance yPosition to clear the header box (18mm height) plus proper spacing
        yPosition += 18 + spacing.sm; // Clear header box (18mm) + additional spacing (12mm) = 30mm total
        
        // Summary box at top
        const summaryText = `You're agreeing to professional installation services, payment terms, and warranty coverage as outlined below. Please review all terms carefully before signing.`;
        
        // Summary box styling
        pdf.setFillColor(248, 248, 248);
        const summaryHeight = 25;
        pdf.roundedRect(margin, yPosition - 3, contentWidth, summaryHeight, 2, 2, 'F');
        
        pdf.setDrawColor(200, 200, 200);
        pdf.setLineWidth(0.5);
        pdf.roundedRect(margin, yPosition - 3, contentWidth, summaryHeight, 2, 2, 'S');
        
        // Summary text
        setFont('body');
        setColor('primary');
        const summaryLines = pdf.splitTextToSize(summaryText, contentWidth - 12);
        for (let i = 0; i < summaryLines.length; i++) {
          pdf.text(summaryLines[i], margin + 6, yPosition + 3 + (i * 5));
        }
        
        yPosition += summaryHeight + spacing.sm;
        
        // Get contract content
        const contractContent = quote.contractTemplate?.terms || quote.customContractTerms || '';
        
        if (contractContent.trim()) {
          const lines = contractContent.split('\n');
          
          for (const line of lines) {
            const trimmedLine = line.trim();
            
            if (!trimmedLine) {
              addSpace('xs'); // 6mm for empty lines
              continue;
            }
            
            // Check for page break with contract-specific header handling
            // Calculate marginTop to include space for contract header
            const contractHeaderHeight = spacing.lg + 18 + spacing.sm; // header position + header height + spacing
            yPosition = ensureSpace(pdf, yPosition, spacing.md, {
              marginTop: margin + contractHeaderHeight, // This ensures correct return position
              marginBottom: margin,
              footerReserve: 15,
              onNewPage: () => {
                currentPage++;
                // Redraw the branded contract header on new pages
                const [r, g, b] = colors.accent;
                pdf.setFillColor(r, g, b);
                pdf.rect(margin, margin + spacing.lg - 8, contentWidth, 18, 'F');
                setColor('onAccent');
                setFont('h2');
                pdf.text('CONTRACT TERMS & CONDITIONS (CONTINUED)', margin + 5, margin + spacing.lg + 2);
                setColor('primary');
              }
            });
            
            // Detect section headers (numbered sections)
            const isNumberedSection = /^\d+\./.test(trimmedLine);
            const isKeySection = /payment|change order|warranty/i.test(trimmedLine);
            
            if (isNumberedSection) {
              // Section header with proper spacing
              addSpace('sm'); // 12mm before sections
              setFont('h3');
              setColor('primary');
              pdf.text(trimmedLine, margin, yPosition);
              addSpace('xs'); // 6mm after header
              
            } else {
              // Regular content with consistent formatting
              setFont('body');
              setColor('primary');
              
              // Use a more conservative width to prevent text breaking issues
              const safeWidth = contentWidth - 10;
              const wrappedLines = pdf.splitTextToSize(trimmedLine, safeWidth);
              
              for (let j = 0; j < wrappedLines.length; j++) {
                pdf.text(wrappedLines[j], margin, yPosition);
                if (j < wrappedLines.length - 1) {
                  // Only add line spacing between wrapped lines, not after
                  addCustomSpace(spacing.xs * 0.67); // ~4mm line height (grid-aligned)
                }
              }
              
              // Only add paragraph spacing at the end of each complete paragraph
              addSpace('xs'); // 6mm spacing between paragraphs
            }
          }
        }
        
        addSpace('lg'); // Final spacing
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
      const customer = (quote.account ?? quote.customer);
      const customerName = customer?.name ?? 'Customer';
      const filename = `${customerName.replace(/[^a-zA-Z0-9]/g, '_')}_Estimate_${timestamp}.pdf`;
      
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
  };

  const generatePDF = async () => {
    setIsGenerating(true);
    try {
      if (layoutMode === 'branded-sequence') {
        // Create new PDF instance
        const pdf = new jsPDF({ unit: 'mm', format: 'letter' });
        
        // Add Barlow fonts to PDF (register with exact family names to match section renderers)
        pdf.addFileToVFS('Barlow-Regular.ttf', barlowRegularBase64);
        pdf.addFont('Barlow-Regular.ttf', 'Barlow-Regular', 'normal');
        pdf.addFileToVFS('Barlow-SemiBold.ttf', barlowSemiBoldBase64);
        pdf.addFont('Barlow-SemiBold.ttf', 'Barlow-SemiBold', 'normal');

        // Normalize render images for PDF - use allSettled to handle failures gracefully
        const normalizedImages = (
          await Promise.allSettled(
            productRenderings.map(async (rendering) => {
              // For temp images with files, read the file directly to avoid blob URL fetch issues
              if (!rendering.isPersistent && rendering.originalFile) {
                const file = rendering.originalFile;
                return new Promise<{ dataUrl: string; format: 'PNG' | 'JPEG' }>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () => {
                    const dataUrl = reader.result as string;
                    const format = file.type.includes('png') ? 'PNG' : 'JPEG';
                    resolve({ dataUrl, format });
                  };
                  reader.onerror = () => reject(new Error('Failed to read file'));
                  reader.readAsDataURL(file);
                });
              }
              // For persistent images, use the preview URL (already proxied at line 238)
              return await normalizeImageToDataUrl(rendering.preview);
            })
          )
        ).flatMap(r => (r.status === 'fulfilled' ? [r.value] : []));

        // Prepare company info
        const company = {
          name: 'EDG Patio & Shade',
          address: '1802 Holian Drive, Spring Grove, IL 60081',
          phone: '+1 (815) 581-0138',
          email: 'info@edgpatioshade.com'
        };

        // Get contract text (only if includeContract is enabled)
        const contractText = includeContract ? (quote.contractTemplate?.terms || quote.customContractTerms || '') : '';

        // Get client logo (from "Cover Photo" section) - handle errors gracefully
        const clientLogoImage = getEffectiveCoverPhoto();
        let clientLogoDataUrl: string | null = null;
        if (clientLogoImage) {
          try {
            // For temp images with files, read the file directly
            if (!clientLogoImage.isPersistent && clientLogoImage.originalFile) {
              const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = () => reject(new Error('Failed to read file'));
                reader.readAsDataURL(clientLogoImage.originalFile!);
              });
              clientLogoDataUrl = dataUrl;
            } else {
              // For persistent images, fetch through proxy
              const normalized = await normalizeImageToDataUrl(clientLogoImage.preview);
              clientLogoDataUrl = normalized.dataUrl;
            }
          } catch (error) {
            // If logo fails to load, continue without it rather than crashing
            console.warn('Failed to load client logo for PDF:', error);
          }
        }

        // Generate Branded Sequence PDF
        await generateBrandedSequencePDF({
          pdf,
          company,
          quote,
          renderImages: normalizedImages,
          contractText,
          showPricing,
          clientLogoDataUrl
        });

        // Save the PDF
        const pdfBlob = pdf.output('blob');
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '');
        const customer = (quote.account ?? quote.customer);
        const customerName = customer?.name ?? 'Customer';
        const filename = `${customerName.replace(/[^a-zA-Z0-9]/g, '_')}_Proposal_Branded_${timestamp}.pdf`;
        
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
        
        toast({
          title: "PDF Generated Successfully",
          description: `Branded proposal downloaded as ${filename}. You can also view it using the buttons below.`,
        });
      } else {
        await generateClassicPDF();
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
      console.error('Error details:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : undefined
      });
      toast({
        title: "Error Generating PDF",
        description: error instanceof Error ? error.message : "There was an error creating the PDF. Please try again.",
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
                <Label htmlFor="layout-mode">Layout</Label>
                <Select value={layoutMode} onValueChange={(value: 'classic' | 'branded-sequence') => setLayoutMode(value)}>
                  <SelectTrigger id="layout-mode" className="w-[200px]" data-testid="select-layout-mode">
                    <SelectValue placeholder="Select layout" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="classic" data-testid="option-classic">Classic</SelectItem>
                    <SelectItem value="branded-sequence" data-testid="option-branded-sequence">Branded Sequence</SelectItem>
                  </SelectContent>
                </Select>
              </div>

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

          {/* Client Logo Upload */}
          {includeCoverPage && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Camera className="w-5 h-5" />
                  Client Logo
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!coverPhoto ? (
                  <div 
                    className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-gray-400 transition-colors"
                    onClick={() => coverPhotoRef.current?.click()}
                  >
                    <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                    <p className="text-sm text-gray-600">Click to upload client's company logo</p>
                    <p className="text-xs text-gray-500">PNG, JPG up to 100MB</p>
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

          {/* Visuals & Details Upload */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Image className="w-5 h-5" />
                Visuals & Details
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
                  <p className="text-sm text-gray-600">Click to upload visual assets (renderings, photos, details)</p>
                  <p className="text-xs text-gray-500">PNG, JPG up to 100MB each (max 5 images)</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {productRenderings.map((rendering) => (
                      <div key={rendering.id} className="relative">
                        <img 
                          src={rendering.preview} 
                          alt="Visual asset" 
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