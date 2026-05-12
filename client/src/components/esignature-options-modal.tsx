import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Upload, X, Image, FileText } from 'lucide-react';
import { getProxiedImageUrl } from '@/lib/image-utils';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { uploadQuoteImage } from '@/lib/quote-image-upload';
import type { QuoteWithDetails, QuoteProductRendering } from '@shared/schema';

interface ESignatureOptionsModalProps {
  quote: QuoteWithDetails;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (signingToken: string) => void;
}

interface UploadedFile {
  id: string;
  file: File;
  preview: string;
  name: string;
}

interface DisplayImage {
  id: string | number;
  name: string;
  preview: string;
  isPersistent: boolean;
  originalFile?: File;
}

export function ESignatureOptionsModal({ quote, open, onOpenChange, onSuccess }: ESignatureOptionsModalProps) {
  // Initialize with stored preferences from the quote (or defaults)
  const [showPricing, setShowPricing] = useState(quote.esigIncludePricing ?? true);
  const [includeImages, setIncludeImages] = useState(quote.esigIncludeImages ?? false);
  
  const [tempProductRenderings, setTempProductRenderings] = useState<UploadedFile[]>([]);
  const [persistentProductRenderings, setPersistentProductRenderings] = useState<QuoteProductRendering[]>([]);
  
  const [isUploading, setIsUploading] = useState(false);
  
  const hasContractData = Boolean(quote.notes?.trim() || quote.contractTemplate || quote.customContractTerms?.trim());
  const [includeContract, setIncludeContract] = useState(quote.esigIncludeContract ?? hasContractData);
  
  const { toast } = useToast();
  const renderingsRef = useRef<HTMLInputElement>(null);

  // Sync state with quote preferences when modal opens
  useEffect(() => {
    if (open) {
      setShowPricing(quote.esigIncludePricing ?? true);
      setIncludeImages(quote.esigIncludeImages ?? false);
      setIncludeContract(quote.esigIncludeContract ?? hasContractData);
    }
  }, [open, quote.esigIncludePricing, quote.esigIncludeImages, quote.esigIncludeContract, hasContractData]);

  const { data: existingProductRenderings, isLoading: loadingRenderings } = useQuery<QuoteProductRendering[]>({
    queryKey: [`/api/quotes/${quote.id}/product-renderings`],
    enabled: open && !!quote.id,
  });

  const uploadRenderingMutation = useMutation({
    mutationFn: async (file: File) => {
      const uploadedImage = await uploadQuoteImage(file, 'product-rendering');
      return await apiRequest('POST', `/api/quotes/${quote.id}/product-rendering`, uploadedImage);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/quotes/${quote.id}/product-renderings`] });
      toast({
        title: "Image saved",
        description: "Product rendering has been added to the quote",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Upload failed",
        description: error.message || "Failed to save image",
        variant: "destructive"
      });
    }
  });

  const deleteRenderingMutation = useMutation({
    mutationFn: async (renderingId: number) => {
      return await apiRequest('DELETE', `/api/quotes/${quote.id}/product-renderings/${renderingId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/quotes/${quote.id}/product-renderings`] });
      toast({
        title: "Image removed",
        description: "Product rendering has been removed",
      });
    },
  });

  const generateSigningLinkMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/quotes/${quote.id}/enable-esignature`, {
        esigIncludePricing: showPricing,
        esigIncludeImages: includeImages,
        esigIncludeContract: includeContract,
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Approval Link Prepared",
        description: "Customer approval link is ready",
      });
      onSuccess(data.signingToken);
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to prepare approval link",
        variant: "destructive"
      });
    },
  });

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const currentTotal = (persistentProductRenderings.length || 0) + tempProductRenderings.length;
    const remaining = 5 - currentTotal;
    
    if (remaining <= 0) {
      toast({
        title: "Maximum images reached",
        description: "You can only upload up to 5 product renderings",
        variant: "destructive"
      });
      return;
    }

    const filesToUpload = Array.from(files).slice(0, remaining);
    const newFiles: UploadedFile[] = [];

    for (const file of filesToUpload) {
      if (file.size > 100 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: `${file.name} exceeds 100MB limit`,
          variant: "destructive"
        });
        continue;
      }

      const id = `temp-${Date.now()}-${Math.random()}`;
      const preview = URL.createObjectURL(file);
      newFiles.push({ id, file, preview, name: file.name });
    }

    setTempProductRenderings(prev => [...prev, ...newFiles]);
    
    setIsUploading(true);
    for (const uploadedFile of newFiles) {
      try {
        await uploadRenderingMutation.mutateAsync(uploadedFile.file);
      } catch (error) {
        console.error('Failed to upload:', uploadedFile.name, error);
      }
    }
    setIsUploading(false);
    setTempProductRenderings(prev => prev.filter(f => !newFiles.find(nf => nf.id === f.id)));
  };

  const removeFile = async (id: string | number) => {
    if (typeof id === 'string') {
      const file = tempProductRenderings.find(f => f.id === id);
      if (file) {
        URL.revokeObjectURL(file.preview);
        setTempProductRenderings(prev => prev.filter(f => f.id !== id));
      }
    } else {
      await deleteRenderingMutation.mutateAsync(id);
    }
  };

  const productRenderings: DisplayImage[] = [
    ...(existingProductRenderings || []).map(r => ({
      id: r.id,
      name: r.originalName,
      preview: getProxiedImageUrl(r.storageUrl),
      isPersistent: true,
    })),
    ...tempProductRenderings.map(f => ({
      id: f.id,
      name: f.name,
      preview: f.preview,
      isPersistent: false,
      originalFile: f.file,
    }))
  ];

  const handleGenerateLink = () => {
    generateSigningLinkMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Proposal Approval Options
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Customer Proposal Package</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="show-pricing">Show Pricing</Label>
                <Switch 
                  id="show-pricing" 
                  checked={showPricing} 
                  onCheckedChange={setShowPricing}
                  data-testid="switch-esig-include-pricing"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <Label htmlFor="include-contract">Include Terms</Label>
                  {!hasContractData && (
                    <span className="text-xs text-gray-500 mt-1">No notes or contract terms available for this quote</span>
                  )}
                </div>
                <Switch 
                  id="include-contract" 
                  checked={includeContract} 
                  onCheckedChange={setIncludeContract}
                  disabled={!hasContractData}
                  data-testid="switch-esig-include-contract"
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="include-images">Include Visuals</Label>
                <Switch 
                  id="include-images" 
                  checked={includeImages} 
                  onCheckedChange={setIncludeImages}
                  data-testid="switch-esig-include-images"
                />
              </div>
            </CardContent>
          </Card>

          {includeImages && (
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
                    <p className="text-sm text-gray-600">Click to upload proposal visuals (renderings, photos, details)</p>
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
                            onClick={() => removeFile(rendering.id)}
                            data-testid={`button-remove-rendering-${rendering.id}`}
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
                        data-testid="button-add-more-renderings"
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
                  onChange={(e) => handleFileUpload(e.target.files)}
                />
              </CardContent>
            </Card>
          )}

          <div className="flex gap-3 justify-end">
            <Button 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              data-testid="button-cancel-esig-options"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleGenerateLink}
              disabled={generateSigningLinkMutation.isPending || isUploading}
              data-testid="button-generate-signing-link"
            >
              {generateSigningLinkMutation.isPending ? 'Generating...' : 'Prepare Approval Link'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
