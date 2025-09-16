import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Camera, Image, Wrench, Building, Eye, FileText, Download, Upload, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { getProxiedImageUrl } from '@/lib/image-utils';
import type { PortfolioImage, TechnicalDiagram, CompanyImage } from '@shared/schema';
import type { UploadedImage } from '@/components/image-uploader';
import { useState, useMemo } from 'react';

interface ImageAssetsPreviewProps {
  portfolioImages?: PortfolioImage[] | null;
  technicalDiagrams?: TechnicalDiagram[] | null;
  companyImages?: CompanyImage[] | null;
  uploadedPortfolioImages?: UploadedImage[] | null;
  uploadedTechnicalDiagrams?: UploadedImage[] | null;
  uploadedCompanyImages?: UploadedImage[] | null;
  className?: string;
}

// Unified type that contains all properties from both database images and uploaded images
type UnifiedImage = {
  filename: string;
  url: string;
  altText?: string;
  caption?: string;
  uploadedAt: string;
  size?: number;
  thumbnailUrl?: string;
  isUploading?: boolean;
  isPending?: boolean;
  uploadProgress?: number;
  // Additional properties from database types
  imageType?: string;
  id?: number;
};

interface ImagePreviewModalProps {
  image: UnifiedImage;
  title: string;
  category: string;
}

function ImagePreviewModal({ image, title, category }: ImagePreviewModalProps) {
  const proxiedUrl = getProxiedImageUrl(image.url);
  
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-8 w-8 p-0 absolute top-2 right-2 bg-black/50 text-white hover:bg-black/70"
          data-testid={`preview-button-${image.filename}`}
        >
          <Eye className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {category === 'Project' && <Camera className="h-5 w-5" />}
            {category === 'Portfolio' && <Image className="h-5 w-5" />}
            {category === 'Technical' && <Wrench className="h-5 w-5" />}
            {category === 'Company' && <Building className="h-5 w-5" />}
            {title}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex justify-center">
            <img 
              src={proxiedUrl}
              alt={image.altText || image.filename}
              className="max-w-full max-h-[60vh] object-contain rounded-lg border"
              data-testid={`modal-image-${image.filename}`}
            />
          </div>
          {image.caption && (
            <div className="text-center">
              <p className="text-sm text-gray-600 italic">{image.caption}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium">Filename:</span>
              <p className="text-gray-600">{image.filename}</p>
            </div>
            <div>
              <span className="font-medium">Uploaded:</span>
              <p className="text-gray-600">
                {new Date(image.uploadedAt).toLocaleDateString()}
              </p>
            </div>
            {image.size && (
              <div>
                <span className="font-medium">Size:</span>
                <p className="text-gray-600">
                  {(image.size / 1024 / 1024).toFixed(1)} MB
                </p>
              </div>
            )}
            {image.altText && (
              <div>
                <span className="font-medium">Alt Text:</span>
                <p className="text-gray-600">{image.altText}</p>
              </div>
            )}
          </div>
          <div className="flex justify-center">
            <Button asChild variant="outline">
              <a 
                href={proxiedUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-2"
                data-testid={`download-button-${image.filename}`}
              >
                <Download className="h-4 w-4" />
                View Full Size
              </a>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface ImageCategoryProps {
  title: string;
  icon: React.ReactNode;
  images: UnifiedImage[];
  emptyMessage: string;
  category: string;
}

function ImageCategory({ title, icon, images, emptyMessage, category }: ImageCategoryProps) {
  if (!images || images.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          {icon}
          <h4 className="text-lg font-semibold text-gray-800">{title}</h4>
          <Badge variant="secondary" className="ml-auto">0</Badge>
        </div>
        <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-lg p-6 text-center">
          <p className="text-gray-500 text-sm">{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <h4 className="text-lg font-semibold text-gray-800">{title}</h4>
        <Badge variant="secondary" className="ml-auto">{images.length}</Badge>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {images.map((image, index) => {
          const proxiedUrl = getProxiedImageUrl(image.url);
          const isImage = image.filename?.match(/\.(jpg|jpeg|png|gif|webp)$/i);
          
          return (
            <div 
              key={`${image.filename}-${index}`} 
              className="relative group aspect-square bg-gray-100 rounded-lg overflow-hidden border hover:shadow-md transition-shadow"
              data-testid={`image-preview-${image.filename}`}
            >
              {isImage ? (
                <img 
                  src={proxiedUrl}
                  alt={image.altText || image.filename}
                  className={`w-full h-full object-cover ${image.isUploading ? 'opacity-60' : 'opacity-100'} transition-opacity`}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gray-200">
                  <FileText className="h-8 w-8 text-gray-400" />
                </div>
              )}

              {/* Upload progress indicator */}
              {image.isUploading && (
                <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                  <div className="bg-white/90 rounded-lg p-2 flex items-center gap-2 text-xs font-medium">
                    <Clock className="h-3 w-3 animate-pulse text-blue-600" />
                    {image.uploadProgress || 0}%
                  </div>
                </div>
              )}

              {/* Upload status badge */}
              {image.isPending || image.isUploading ? (
                <div className="absolute top-2 left-2">
                  <Badge 
                    variant="secondary" 
                    className="text-xs bg-blue-100 text-blue-800 border-blue-200"
                  >
                    {image.isUploading ? (
                      <>
                        <Upload className="h-3 w-3 mr-1" />
                        Uploading
                      </>
                    ) : (
                      <>
                        <Clock className="h-3 w-3 mr-1" />
                        Pending
                      </>
                    )}
                  </Badge>
                </div>
              ) : (
                <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Badge variant="secondary" className="text-xs bg-green-100 text-green-800 border-green-200">
                    Saved
                  </Badge>
                </div>
              )}
              
              {/* Image overlay with filename */}
              <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white p-2 transform translate-y-full group-hover:translate-y-0 transition-transform">
                <p className="text-xs truncate font-medium">{image.filename}</p>
                {image.caption && (
                  <p className="text-xs text-gray-300 truncate">{image.caption}</p>
                )}
              </div>
              
              {/* Preview button */}
              <ImagePreviewModal image={image} title={image.filename || 'Untitled'} category={category} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ImageAssetsPreview({ 
  portfolioImages = [], 
  technicalDiagrams = [], 
  companyImages = [],
  uploadedPortfolioImages = [],
  uploadedTechnicalDiagrams = [],
  uploadedCompanyImages = [],
  className = '' 
}: ImageAssetsPreviewProps) {
  // State for collapsible image assets preview section
  const [isImageAssetsPreviewOpen, setIsImageAssetsPreviewOpen] = useState(false);

  // Helper function to convert UploadedImage to UnifiedImage format
  const convertUploadedToUnified = (uploadedImage: UploadedImage): UnifiedImage => ({
    filename: uploadedImage.metadata.filename || uploadedImage.file.name,
    url: uploadedImage.url || uploadedImage.preview,
    altText: uploadedImage.metadata.altText || "",
    caption: uploadedImage.metadata.caption || "",
    uploadedAt: uploadedImage.metadata.uploadedAt || new Date().toISOString(),
    size: uploadedImage.file.size,
    isUploading: !uploadedImage.uploaded,
    isPending: !uploadedImage.uploaded,
    uploadProgress: uploadedImage.uploadProgress || 0,
  });

  // Helper function to convert database image to UnifiedImage format
  const convertDbToUnified = (dbImage: any): UnifiedImage => ({
    filename: dbImage.filename || 'untitled',
    url: dbImage.url || '',
    altText: dbImage.altText || "",
    caption: dbImage.caption || "",
    uploadedAt: dbImage.uploadedAt || new Date().toISOString(),
    size: dbImage.size,
    thumbnailUrl: dbImage.thumbnailUrl,
    isUploading: false,
    isPending: false,
    uploadProgress: 100,
    imageType: dbImage.imageType,
    id: dbImage.id,
  });

  // Function to merge and deduplicate images
  const mergeImages = (dbImages: any[] | null, uploadedImages: UploadedImage[] | null): UnifiedImage[] => {
    const dbUnified = (dbImages || []).map(convertDbToUnified);
    const uploadedUnified = (uploadedImages || []).map(convertUploadedToUnified);
    
    // Create a Map to deduplicate by filename, prioritizing uploaded images for immediate feedback
    const imageMap = new Map<string, UnifiedImage>();
    
    // First add database images
    dbUnified.forEach(img => {
      if (img.filename) {
        imageMap.set(img.filename, img);
      }
    });
    
    // Then add uploaded images, they will override database images with same filename
    uploadedUnified.forEach(img => {
      if (img.filename) {
        imageMap.set(img.filename, img);
      }
    });
    
    return Array.from(imageMap.values());
  };

  // Merge images using memoization for performance
  const mergedPortfolioImages = useMemo(() => 
    mergeImages(portfolioImages, uploadedPortfolioImages), 
    [portfolioImages, uploadedPortfolioImages]
  );
  
  const mergedTechnicalDiagrams = useMemo(() => 
    mergeImages(technicalDiagrams, uploadedTechnicalDiagrams), 
    [technicalDiagrams, uploadedTechnicalDiagrams]
  );
  
  const mergedCompanyImages = useMemo(() => 
    mergeImages(companyImages, uploadedCompanyImages), 
    [companyImages, uploadedCompanyImages]
  );

  const totalImages = mergedPortfolioImages.length + mergedTechnicalDiagrams.length + mergedCompanyImages.length;
  
  if (totalImages === 0) {
    return (
      <Card className={`mb-6 ${className}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Image className="h-5 w-5" />
            Image Assets
            <Badge variant="outline" className="ml-auto">0 images</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-lg p-8 text-center">
            <Image className="h-12 w-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600 font-medium">No images uploaded yet</p>
            <p className="text-gray-500 text-sm mt-1">
              Upload images in the quote form above to see them here
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`mb-6 ${className}`} data-testid="image-assets-preview">
      <Collapsible open={isImageAssetsPreviewOpen} onOpenChange={setIsImageAssetsPreviewOpen}>
        <CardHeader>
          <CollapsibleTrigger asChild>
            <Button 
              variant="ghost" 
              className="w-full justify-between p-0 h-auto hover:bg-transparent"
              data-testid="toggle-image-assets-preview"
            >
              <CardTitle className="flex items-center gap-2">
                <Image className="h-5 w-5" />
                Image Assets
                <Badge variant="outline" className="ml-2">{totalImages} images</Badge>
              </CardTitle>
              {isImageAssetsPreviewOpen ? (
                <ChevronUp className="h-5 w-5" />
              ) : (
                <ChevronDown className="h-5 w-5" />
              )}
            </Button>
          </CollapsibleTrigger>
        </CardHeader>
        
        <CollapsibleContent>
          <CardContent className="space-y-8 pt-0">
            <ImageCategory
              title="Portfolio Showcase"
              icon={<Image className="h-5 w-5 text-green-600" />}
              images={mergedPortfolioImages}
              emptyMessage="No portfolio images uploaded"
              category="Portfolio"
            />
            
            <ImageCategory
              title="Technical Diagrams"
              icon={<Wrench className="h-5 w-5 text-orange-600" />}
              images={mergedTechnicalDiagrams}
              emptyMessage="No technical diagrams uploaded"
              category="Technical"
            />
            
            <ImageCategory
              title="Company Assets"
              icon={<Building className="h-5 w-5 text-purple-600" />}
              images={mergedCompanyImages}
              emptyMessage="No company assets uploaded"
              category="Company"
            />
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}