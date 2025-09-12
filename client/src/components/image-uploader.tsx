import { useState, useCallback, useRef, DragEvent } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Upload, X, Image, FileText, Camera, Building, Wrench } from 'lucide-react';
import type { ProjectImage, PortfolioImage, TechnicalDiagram, CompanyImage, ProductImage } from '@shared/schema';

export type ImageType = 'project' | 'portfolio' | 'technical' | 'company' | 'product';

export interface UploadedImage {
  id: string;
  file: File;
  preview: string;
  uploadProgress: number;
  uploaded: boolean;
  url?: string;
  metadata: Partial<ProjectImage | PortfolioImage | TechnicalDiagram | CompanyImage | ProductImage>;
}

interface ImageUploaderProps {
  imageType: ImageType;
  title: string;
  description?: string;
  maxFiles?: number;
  maxFileSize?: number;
  allowedTypes?: string[];
  onImagesChange: (images: UploadedImage[]) => void;
  initialImages?: UploadedImage[];
  categoryOptions?: Array<{ value: string; label: string }>;
  className?: string;
}

export function ImageUploader({
  imageType,
  title,
  description,
  maxFiles = 10,
  maxFileSize = 50 * 1024 * 1024, // 50MB
  allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'],
  onImagesChange,
  initialImages = [],
  categoryOptions = [],
  className = '',
}: ImageUploaderProps) {
  const [images, setImages] = useState<UploadedImage[]>(initialImages);
  const [isDragActive, setIsDragActive] = useState(false);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getImageTypeIcon = (type: ImageType) => {
    switch (type) {
      case 'project':
        return <Camera className="h-5 w-5" />;
      case 'portfolio':
        return <Image className="h-5 w-5" />;
      case 'technical':
        return <Wrench className="h-5 w-5" />;
      case 'company':
        return <Building className="h-5 w-5" />;
      case 'product':
        return <Camera className="h-5 w-5" />;
      default:
        return <Upload className="h-5 w-5" />;
    }
  };

  const generateImageId = () => {
    return Date.now().toString() + Math.random().toString(36).substr(2, 9);
  };

  const validateFile = (file: File): string | null => {
    if (!allowedTypes.includes(file.type)) {
      return `File type ${file.type} is not supported. Please upload ${allowedTypes.join(', ')} files.`;
    }
    if (file.size > maxFileSize) {
      return `File size ${(file.size / 1024 / 1024).toFixed(1)}MB exceeds the maximum allowed size of ${(maxFileSize / 1024 / 1024).toFixed(1)}MB.`;
    }
    return null;
  };

  const realUpload = async (image: UploadedImage): Promise<string> => {
    try {
      console.log(`🚀 Starting real upload for ${image.file.name}`);
      
      // Step 1: Get upload URL from backend
      setImages(prev =>
        prev.map(img =>
          img.id === image.id ? { ...img, uploadProgress: 10 } : img
        )
      );

      const uploadResponse = await fetch('/api/images/upload-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageType,
          filename: image.file.name
        })
      });

      if (!uploadResponse.ok) {
        throw new Error(`Failed to get upload URL: ${uploadResponse.statusText}`);
      }

      const { uploadUrl, objectPath, publicUrl } = await uploadResponse.json();
      console.log(`📦 Got upload URL for ${image.file.name}: ${objectPath}`);

      // Step 2: Upload file directly to object storage
      setImages(prev =>
        prev.map(img =>
          img.id === image.id ? { ...img, uploadProgress: 30 } : img
        )
      );

      const fileUploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: image.file,
        headers: {
          'Content-Type': image.file.type,
        }
      });

      if (!fileUploadResponse.ok) {
        throw new Error(`File upload failed: ${fileUploadResponse.statusText}`);
      }

      console.log(`✅ File uploaded successfully: ${image.file.name}`);

      // Step 3: Finalize upload and set ACL policy
      setImages(prev =>
        prev.map(img =>
          img.id === image.id ? { ...img, uploadProgress: 80 } : img
        )
      );

      const finalizeResponse = await fetch('/api/images/finalize-upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          objectPath
        })
      });

      if (!finalizeResponse.ok) {
        throw new Error(`Failed to finalize upload: ${finalizeResponse.statusText}`);
      }

      const { publicUrl: finalPublicUrl } = await finalizeResponse.json();
      console.log(`🎉 Upload completed: ${finalPublicUrl}`);

      // Step 4: Complete upload progress
      setImages(prev =>
        prev.map(img =>
          img.id === image.id ? { ...img, uploadProgress: 100 } : img
        )
      );

      return finalPublicUrl;
    } catch (error) {
      console.error('❌ Real upload failed:', error);
      throw error;
    }
  };

  const handleFiles = useCallback(async (acceptedFiles: File[]) => {
    if (images.length + acceptedFiles.length > maxFiles) {
      toast({
        title: "Too many files",
        description: `You can only upload up to ${maxFiles} files.`,
        variant: "destructive"
      });
      return;
    }

    const newImages: UploadedImage[] = acceptedFiles.map(file => {
      const validation = validateFile(file);
      if (validation) {
        toast({
          title: "File validation failed",
          description: validation,
          variant: "destructive"
        });
        return null;
      }

      const id = generateImageId();
      const preview = URL.createObjectURL(file);
      
      return {
        id,
        file,
        preview,
        uploadProgress: 0,
        uploaded: false,
        metadata: {
          filename: file.name,
          uploadedAt: new Date().toISOString(),
          size: file.size,
        },
      };
    }).filter(Boolean) as UploadedImage[];

    if (newImages.length === 0) return;

    const updatedImages = [...images, ...newImages];
    setImages(updatedImages);
    onImagesChange(updatedImages);

    // Start upload process for each new image
    newImages.forEach(async (image) => {
      try {
        const url = await realUpload(image);
        const updatedImages = await new Promise<UploadedImage[]>(resolve => {
          setImages(prev => {
            const updated = prev.map(img =>
              img.id === image.id
                ? { ...img, uploaded: true, url, metadata: { ...img.metadata, url } }
                : img
            );
            resolve(updated);
            return updated;
          });
        });
        
        // CRITICAL FIX: Notify parent component that upload completed!
        onImagesChange(updatedImages);
        
        toast({
          title: "Upload successful",
          description: `${image.file.name} has been uploaded successfully.`
        });
      } catch (error) {
        toast({
          title: "Upload failed",
          description: `Failed to upload ${image.file.name}. Please try again.`,
          variant: "destructive"
        });
        setImages(prev => {
          const updated = prev.filter(img => img.id !== image.id);
          onImagesChange(updated); // Also notify on removal
          return updated;
        });
      }
    });
  }, [images, maxFiles, onImagesChange, toast]);

  // Native drag and drop handlers
  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFiles(files);
    }
  }, [handleFiles]);

  const removeImage = (imageId: string) => {
    const updatedImages = images.filter(img => img.id !== imageId);
    setImages(updatedImages);
    onImagesChange(updatedImages);
  };

  const updateImageMetadata = (imageId: string, field: string, value: string) => {
    const updatedImages = images.map(img =>
      img.id === imageId
        ? { ...img, metadata: { ...img.metadata, [field]: value } }
        : img
    );
    setImages(updatedImages);
    onImagesChange(updatedImages);
  };

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length > 0) {
      handleFiles(files);
    }
    // Reset input value so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Card className={`w-full ${className}`}>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          {getImageTypeIcon(imageType)}
          {title}
        </CardTitle>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Upload Area */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`
            relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
            ${isDragActive 
              ? 'border-primary bg-primary/5' 
              : 'border-gray-300 dark:border-gray-600 hover:border-primary hover:bg-gray-50 dark:hover:bg-gray-800'
            }
          `}
          data-testid={`dropzone-${imageType}`}
        >
          <input 
            type="file"
            ref={fileInputRef}
            onChange={handleFileInputChange}
            multiple
            accept={allowedTypes.join(',')}
            className="hidden"
            data-testid={`file-input-${imageType}`}
          />
          <div className="flex flex-col items-center gap-2">
            <Upload className="h-8 w-8 text-gray-400" />
            <p className="text-sm font-medium">
              {isDragActive ? 'Drop files here' : 'Drag and drop files here, or click to browse'}
            </p>
            <p className="text-xs text-gray-500">
              Supports: {allowedTypes.map(type => type.split('/')[1]).join(', ')} • 
              Max {maxFiles} files • Up to {(maxFileSize / 1024 / 1024).toFixed(0)}MB each
            </p>
            {maxFiles > 1 && (
              <p className="text-xs text-blue-600 font-medium">
                💡 Select multiple files: Hold Ctrl (Windows) or Cmd (Mac) while clicking files
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1 border-t"></div>
          <span className="text-xs text-gray-500">OR</span>
          <div className="flex-1 border-t"></div>
        </div>

        <Button
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          className="w-full"
          data-testid={`button-browse-${imageType}`}
        >
          <Upload className="h-4 w-4 mr-2" />
          {maxFiles > 1 ? `Choose Files (up to ${maxFiles})` : 'Choose File'}
        </Button>

        {/* Uploaded Images */}
        {images.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">
                Uploaded Files ({images.length}/{maxFiles})
              </h4>
            </div>
            
            <div className="grid grid-cols-1 gap-3">
              {images.map((image) => (
                <div
                  key={image.id}
                  className="flex items-start gap-3 p-3 border rounded-lg bg-gray-50 dark:bg-gray-800"
                  data-testid={`image-item-${image.id}`}
                >
                  {/* Preview */}
                  <div className="flex-shrink-0">
                    {image.file.type.startsWith('image/') ? (
                      <img
                        src={image.preview}
                        alt={image.metadata.filename}
                        className="w-16 h-16 object-cover rounded border"
                      />
                    ) : (
                      <div className="w-16 h-16 flex items-center justify-center bg-gray-200 dark:bg-gray-700 rounded border">
                        <FileText className="h-6 w-6 text-gray-500" />
                      </div>
                    )}
                  </div>

                  {/* Metadata */}
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium truncate">
                        {image.metadata.filename}
                      </p>
                      <div className="flex items-center gap-2">
                        <Badge variant={image.uploaded ? "default" : "secondary"} className="text-xs">
                          {image.uploaded ? "Uploaded" : "Uploading"}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeImage(image.id)}
                          className="h-6 w-6 p-0"
                          data-testid={`button-remove-${image.id}`}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>

                    {/* Upload Progress */}
                    {!image.uploaded && (
                      <Progress value={image.uploadProgress} className="h-1" />
                    )}

                    {/* Metadata Inputs */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div>
                        <Label htmlFor={`caption-${image.id}`} className="text-xs">Caption</Label>
                        <Input
                          id={`caption-${image.id}`}
                          value={image.metadata.caption || ''}
                          onChange={(e) => updateImageMetadata(image.id, 'caption', e.target.value)}
                          placeholder="Add a caption..."
                          className="h-8 text-xs"
                          data-testid={`input-caption-${image.id}`}
                        />
                      </div>
                      
                      {categoryOptions.length > 0 && (
                        <div>
                          <Label className="text-xs">Category</Label>
                          <Select
                            value={String((image.metadata as any).category || '')}
                            onValueChange={(value) => updateImageMetadata(image.id, 'category', value)}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                            <SelectContent>
                              {categoryOptions.map(option => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>

                    {/* Alt Text */}
                    <div>
                      <Label htmlFor={`alt-${image.id}`} className="text-xs">Alt Text (for accessibility)</Label>
                      <Textarea
                        id={`alt-${image.id}`}
                        value={image.metadata.altText || ''}
                        onChange={(e) => updateImageMetadata(image.id, 'altText', e.target.value)}
                        placeholder="Describe this image..."
                        className="h-16 text-xs resize-none"
                        data-testid={`textarea-alt-${image.id}`}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}