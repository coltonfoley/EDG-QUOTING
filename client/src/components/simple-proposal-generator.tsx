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
import { formatCurrency, calculateQuoteTotals, calculateLineItemTotal } from '@/lib/utils';
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
  
  // Temporary uploads (local files before uploading to server)
  const [tempCoverPhoto, setTempCoverPhoto] = useState<UploadedFile | null>(null);
  const [tempProductRenderings, setTempProductRenderings] = useState<UploadedFile[]>([]);
  
  // Persistent images (stored in database and object storage)
  const [persistentCoverPhoto, setPersistentCoverPhoto] = useState<PersistentImage | null>(null);
  const [persistentProductRenderings, setPersistentProductRenderings] = useState<PersistentImage[]>([]);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [generatedPdfUrl, setGeneratedPdfUrl] = useState<string | null>(null);
  
  // Drag-and-drop state for visual feedback
  const [isDraggingOverCover, setIsDraggingOverCover] = useState(false);
  const [isDraggingOverRenderings, setIsDraggingOverRenderings] = useState(false);
  
  // Contract state and logic - recompute on each render to catch quote updates
  const hasContractData = Boolean(quote.notes?.trim() || quote.contractTemplate || quote.customContractTerms?.trim());
  const [includeContract, setIncludeContract] = useState(hasContractData);
  
  // Sync includeContract state when hasContractData changes
  useEffect(() => {
    if (hasContractData && !includeContract) {
      setIncludeContract(true);
    }
  }, [hasContractData]);
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
      discountType: item.discountType,
      discountValue: item.discountValue,
      isTaxable: item.isTaxable,
      isTariffApplicable: item.isTariffApplicable,
    })),
    quote.taxRate ?? 0,
    quote.discount ?? 0,
    quote.shipping ?? 0,
    quote.isShippingTaxable ?? true,
    quote.tariffRate ?? 0
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

  // Drag-and-drop handlers
  const handleDragOver = (e: React.DragEvent, type: 'cover' | 'renderings') => {
    e.preventDefault();
    e.stopPropagation();
    if (type === 'cover') {
      setIsDraggingOverCover(true);
    } else {
      setIsDraggingOverRenderings(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent, type: 'cover' | 'renderings') => {
    e.preventDefault();
    e.stopPropagation();
    if (type === 'cover') {
      setIsDraggingOverCover(false);
    } else {
      setIsDraggingOverRenderings(false);
    }
  };

  const handleDrop = (e: React.DragEvent, type: 'cover' | 'renderings') => {
    e.preventDefault();
    e.stopPropagation();
    
    if (type === 'cover') {
      setIsDraggingOverCover(false);
    } else {
      setIsDraggingOverRenderings(false);
    }

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      handleFileUpload(files, type);
    }
  };

  // Clipboard paste handler
  const handlePaste = (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          imageFiles.push(file);
        }
      }
    }

    if (imageFiles.length > 0) {
      // Determine which section to upload to based on context
      // If cover page is enabled and no cover photo exists, upload as cover
      // Otherwise, upload to renderings
      if (includeCoverPage && !coverPhoto) {
        const dataTransfer = new DataTransfer();
        imageFiles.forEach(file => dataTransfer.items.add(file));
        handleFileUpload(dataTransfer.files, 'cover');
        
        toast({
          title: "Screenshot pasted",
          description: "Image pasted as project cover",
        });
      } else {
        const dataTransfer = new DataTransfer();
        imageFiles.forEach(file => dataTransfer.items.add(file));
        handleFileUpload(dataTransfer.files, 'renderings');
        
        toast({
          title: "Screenshot pasted",
          description: `${imageFiles.length} image(s) added to visuals & details`,
        });
      }
    }
  };

  // Add paste event listener when dialog is open
  useEffect(() => {
    if (open) {
      window.addEventListener('paste', handlePaste);
      return () => {
        window.removeEventListener('paste', handlePaste);
      };
    }
  }, [open, includeCoverPage, coverPhoto]);

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
      let contractText = '';
      if (includeContract) {
        const parts = [];
        if (quote.notes?.trim()) parts.push(quote.notes.trim());
        if (quote.customContractTerms?.trim()) parts.push(quote.customContractTerms.trim());
        else if (quote.contractTemplate?.terms?.trim()) parts.push(quote.contractTemplate.terms.trim());
        contractText = parts.join('\n\n');
      }

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
      const filename = `${customerName.replace(/[^a-zA-Z0-9]/g, '_')}_Proposal_${timestamp}.pdf`;
      
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
        description: `Professional proposal downloaded as ${filename}. You can also view it using the buttons below.`,
      });
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
                <Label htmlFor="show-pricing">Include Pricing</Label>
                <Switch 
                  id="show-pricing" 
                  checked={showPricing} 
                  onCheckedChange={setShowPricing} 
                />
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="include-cover">Include Project Cover</Label>
                <Switch 
                  id="include-cover" 
                  checked={includeCoverPage} 
                  onCheckedChange={setIncludeCoverPage} 
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <Label htmlFor="include-contract">Include Notes & Terms</Label>
                  {!hasContractData && (
                    <span className="text-xs text-gray-500 mt-1">No notes or contract terms available for this quote</span>
                  )}
                </div>
                <Switch 
                  id="include-contract" 
                  checked={includeContract} 
                  onCheckedChange={setIncludeContract}
                  disabled={!hasContractData}
                />
              </div>
            </CardContent>
          </Card>

          {/* Project Cover Upload */}
          {includeCoverPage && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Camera className="w-5 h-5" />
                  Project Cover
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!coverPhoto ? (
                  <div 
                    className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all ${
                      isDraggingOverCover 
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950' 
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                    onClick={() => coverPhotoRef.current?.click()}
                    onDragOver={(e) => handleDragOver(e, 'cover')}
                    onDragLeave={(e) => handleDragLeave(e, 'cover')}
                    onDrop={(e) => handleDrop(e, 'cover')}
                  >
                    <Upload className={`w-8 h-8 mx-auto mb-2 ${isDraggingOverCover ? 'text-blue-500' : 'text-gray-400'}`} />
                    <p className={`text-sm ${isDraggingOverCover ? 'text-blue-700 dark:text-blue-300 font-medium' : 'text-gray-600'}`}>
                      {isDraggingOverCover ? 'Drop image here' : 'Drag & drop, paste (Ctrl+V), or click to upload'}
                    </p>
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
                  className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all ${
                    isDraggingOverRenderings 
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950' 
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                  onClick={() => renderingsRef.current?.click()}
                  onDragOver={(e) => handleDragOver(e, 'renderings')}
                  onDragLeave={(e) => handleDragLeave(e, 'renderings')}
                  onDrop={(e) => handleDrop(e, 'renderings')}
                >
                  <Upload className={`w-8 h-8 mx-auto mb-2 ${isDraggingOverRenderings ? 'text-blue-500' : 'text-gray-400'}`} />
                  <p className={`text-sm ${isDraggingOverRenderings ? 'text-blue-700 dark:text-blue-300 font-medium' : 'text-gray-600'}`}>
                    {isDraggingOverRenderings ? 'Drop images here' : 'Drag & drop, paste (Ctrl+V), or click to upload'}
                  </p>
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
                    <div
                      className={`border-2 border-dashed rounded-lg p-3 transition-all ${
                        isDraggingOverRenderings 
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950' 
                          : 'border-gray-200'
                      }`}
                      onDragOver={(e) => handleDragOver(e, 'renderings')}
                      onDragLeave={(e) => handleDragLeave(e, 'renderings')}
                      onDrop={(e) => handleDrop(e, 'renderings')}
                    >
                      <Button 
                        variant="outline" 
                        onClick={() => renderingsRef.current?.click()}
                        className="w-full"
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        {isDraggingOverRenderings ? 'Drop Images Here' : 'Add More Images (Drag, Paste, or Click)'}
                      </Button>
                    </div>
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