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
  const [includeCoverPage, setIncludeCoverPage] = useState(true); // Always include in 5-page structure
  
  // Temporary uploads (local files before uploading to server)
  const [tempCoverPhoto, setTempCoverPhoto] = useState<UploadedFile | null>(null); // Layout design photo
  const [tempProductRenderings, setTempProductRenderings] = useState<UploadedFile[]>([]);
  const [tempPartnerLogo, setTempPartnerLogo] = useState<UploadedFile | null>(null); // New for 5-page structure
  
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
      console.log(`🔄 Generating PDF for quote ${quote.id} with options: cover=${includeCoverPage}, pricing=${showPricing}, contract=${includeContract}`);
      
      // Build query parameters for PDF options
      const params = new URLSearchParams();
      params.set('cover', includeCoverPage ? '1' : '0');
      params.set('pricing', showPricing ? '1' : '0');
      params.set('contract', includeContract ? '1' : '0');
      
      // Call the new HTML-to-PDF API endpoint
      const response = await fetch(`/api/quotes/${quote.id}/proposal.pdf?${params.toString()}`, {
        method: 'GET',
        credentials: 'include', // Include authentication cookies
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Server responded with ${response.status}`);
      }
      
      // Get the PDF blob from the response
      const pdfBlob = await response.blob();
      console.log(`✅ PDF generated successfully, size: ${pdfBlob.size} bytes`);
      
      // Generate filename
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '');
      const customer = quote.account ?? quote.customer;
      const filename = `${customer.name.replace(/[^a-zA-Z0-9]/g, '_')}_Proposal_${timestamp}.pdf`;
      
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
        title: "Professional PDF Generated",
        description: `High-quality proposal downloaded as ${filename}. You can also view it using the buttons below.`,
      });
      
    } catch (error: any) {
      console.error('Error generating PDF:', error);
      
      let errorMessage = "There was an error creating the PDF. Please try again.";
      
      if (error.message?.includes('TIMEOUT_ERROR')) {
        errorMessage = "PDF generation timed out. The page may be taking too long to load. Please try again.";
      } else if (error.message?.includes('CONNECTION_ERROR')) {
        errorMessage = "Unable to connect to the PDF service. Please ensure the application is running and try again.";
      } else if (error.message?.includes('not found')) {
        errorMessage = "Quote not found. Please refresh the page and try again.";
      }
      
      toast({
        title: "Error Generating PDF",
        description: errorMessage,
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
          {/* Professional 5-Page Proposal Structure */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">5-Page Professional Proposal</CardTitle>
              <p className="text-sm text-gray-600">
                Generates a professional 5-page proposal: Cover → Project Info → Gallery → Pricing → Final Page
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-5 gap-2 text-center text-xs">
                <div className="p-2 bg-blue-50 rounded border">
                  <div className="font-medium">Page 1</div>
                  <div>Cover</div>
                </div>
                <div className="p-2 bg-green-50 rounded border">
                  <div className="font-medium">Page 2</div>
                  <div>Project Info</div>
                </div>
                <div className="p-2 bg-purple-50 rounded border">
                  <div className="font-medium">Page 3</div>
                  <div>Gallery</div>
                </div>
                <div className="p-2 bg-orange-50 rounded border">
                  <div className="font-medium">Page 4</div>
                  <div>Pricing</div>
                </div>
                <div className="p-2 bg-red-50 rounded border">
                  <div className="font-medium">Page 5</div>
                  <div>Final Page</div>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="show-pricing">Include Pricing (Page 4)</Label>
                <Switch 
                  id="show-pricing" 
                  checked={showPricing} 
                  onCheckedChange={setShowPricing} 
                />
              </div>

              {hasContractData && (
                <div className="flex items-center justify-between">
                  <Label htmlFor="include-contract">Include Contract Terms (Additional Page)</Label>
                  <Switch 
                    id="include-contract" 
                    checked={includeContract} 
                    onCheckedChange={setIncludeContract} 
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Partner Logo Upload - Page 2 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Upload className="w-4 h-4" />
                Partner Logo (Page 2 - Project Info)
              </CardTitle>
              <p className="text-sm text-gray-600">Upload your partner or client company logo</p>
            </CardHeader>
            <CardContent>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                <Button variant="outline">
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Partner Logo
                </Button>
                <p className="text-sm text-gray-500 mt-2">PNG, JPG up to 5MB</p>
              </div>
            </CardContent>
          </Card>

          {/* Layout Design Photo - Page 3 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Image className="w-4 h-4" />
                Layout Design (Page 3 - Gallery)
              </CardTitle>
              <p className="text-sm text-gray-600">Project layout or design photo</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Cover Photo Display and Upload */}
                {coverPhoto ? (
                  <div className="relative border rounded-lg p-4 bg-gray-50">
                    <img 
                      src={coverPhoto.preview} 
                      alt={coverPhoto.name}
                      className="w-full h-32 object-cover rounded"
                    />
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-sm text-gray-600">{coverPhoto.name}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => removeFile(coverPhoto.id, 'cover')}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                    <input
                      ref={coverPhotoRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleFileUpload(e.target.files, 'cover')}
                    />
                    <Button
                      variant="outline"
                      onClick={() => coverPhotoRef.current?.click()}
                      disabled={isUploading}
                    >
                      {isUploading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4 mr-2" />
                          Upload Cover Photo
                        </>
                      )}
                    </Button>
                    <p className="text-sm text-gray-500 mt-2">
                      Add a cover photo to create a professional first impression
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Product Renderings Upload */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Product Renderings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Product Renderings Display and Upload */}
                {productRenderings.length > 0 && (
                  <div className="grid grid-cols-2 gap-4">
                    {productRenderings.map((rendering) => (
                      <div key={rendering.id} className="relative border rounded-lg p-2 bg-gray-50">
                        <img 
                          src={rendering.preview} 
                          alt={rendering.name}
                          className="w-full h-20 object-cover rounded"
                        />
                        <div className="flex justify-between items-center mt-1">
                          <span className="text-xs text-gray-600 truncate">{rendering.name}</span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => removeFile(rendering.id, 'renderings')}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                  <input
                    ref={renderingsRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => handleFileUpload(e.target.files, 'renderings')}
                  />
                  <Button
                    variant="outline"
                    onClick={() => renderingsRef.current?.click()}
                    disabled={isUploading}
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Camera className="w-4 h-4 mr-2" />
                        Upload Product Renderings
                      </>
                    )}
                  </Button>
                  <p className="text-sm text-gray-500 mt-2">
                    Add product photos, renderings, or visualizations
                  </p>
                </div>
              </div>
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
                  <FileText className="w-4 h-4 mr-2" />
                  Generate Proposal
                </>
              )}
            </Button>
          </div>

          {/* View/Download Actions */}
          {generatedPdfUrl && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex gap-3 justify-center">
                  <Button
                    variant="outline"
                    onClick={() => window.open(generatedPdfUrl, '_blank')}
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    View PDF
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      const link = document.createElement('a');
                      link.href = generatedPdfUrl;
                      link.download = `proposal-${quote.quoteNumber}.pdf`;
                      link.click();
                    }}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download Again
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
