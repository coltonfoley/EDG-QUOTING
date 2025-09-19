import { useState, useCallback, useRef, DragEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { 
  Upload, 
  X, 
  Image, 
  AlertTriangle, 
  RefreshCw,
  Move,
  Trash2,
  Plus
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import type { QuoteImage } from '@shared/schema';

interface ImageUploadProps {
  quoteId: number;
  className?: string;
}

interface UploadingImage {
  id: string;
  file: File;
  preview: string;
  uploadProgress: number;
  error?: string;
}

export function ImageUpload({ quoteId, className = '' }: ImageUploadProps) {
  const [uploadingImages, setUploadingImages] = useState<UploadingImage[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const [draggedImageId, setDraggedImageId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch existing images for this quote
  const { data: images = [], isLoading, error } = useQuery<QuoteImage[]>({
    queryKey: [`/api/quotes/${quoteId}/images`],
    enabled: !!quoteId,
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async ({ file, altText }: { file: File; altText?: string }) => {
      const formData = new FormData();
      formData.append('image', file);
      if (altText) formData.append('altText', altText);

      return apiRequest(`/api/quotes/${quoteId}/images`, {
        method: 'POST',
        body: formData,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/quotes/${quoteId}/images`] });
      toast({
        title: "Success",
        description: "Image uploaded successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload image",
        variant: "destructive",
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (imageId: number) => {
      return apiRequest(`/api/quote-images/${imageId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/quotes/${quoteId}/images`] });
      toast({
        title: "Success",
        description: "Image deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to delete image",
        variant: "destructive",
      });
    },
  });

  // Reorder mutation
  const reorderMutation = useMutation({
    mutationFn: async (imageIds: number[]) => {
      return apiRequest(`/api/quotes/${quoteId}/images/order`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageIds }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/quotes/${quoteId}/images`] });
      toast({
        title: "Success",
        description: "Images reordered successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Reorder Failed",
        description: error.message || "Failed to reorder images",
        variant: "destructive",
      });
    },
  });

  const generateUploadId = () => {
    return Date.now().toString() + Math.random().toString(36).substr(2, 9);
  };

  const validateFile = (file: File): string | null => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    const maxSize = 10 * 1024 * 1024; // 10MB

    if (!allowedTypes.includes(file.type)) {
      return 'Invalid file type. Please upload JPEG, PNG, WebP, or GIF images.';
    }

    if (file.size > maxSize) {
      return 'File size exceeds 10MB limit.';
    }

    if (images.length + uploadingImages.length >= 20) {
      return 'Maximum of 20 images per quote allowed.';
    }

    return null;
  };

  const processFiles = useCallback(async (files: FileList) => {
    const validFiles: File[] = [];
    const errors: string[] = [];

    Array.from(files).forEach(file => {
      const error = validateFile(file);
      if (error) {
        errors.push(`${file.name}: ${error}`);
      } else {
        validFiles.push(file);
      }
    });

    if (errors.length > 0) {
      toast({
        title: "Upload Errors",
        description: errors.join('\n'),
        variant: "destructive",
      });
    }

    // Create preview objects for valid files
    const newUploads: UploadingImage[] = await Promise.all(
      validFiles.map(async (file) => {
        const preview = URL.createObjectURL(file);
        return {
          id: generateUploadId(),
          file,
          preview,
          uploadProgress: 0,
        };
      })
    );

    setUploadingImages(prev => [...prev, ...newUploads]);

    // Start uploading each file
    for (const upload of newUploads) {
      try {
        await uploadMutation.mutateAsync({ file: upload.file });
        
        setUploadingImages(prev => 
          prev.filter(u => u.id !== upload.id)
        );
        
        URL.revokeObjectURL(upload.preview);
      } catch (error) {
        setUploadingImages(prev =>
          prev.map(u => 
            u.id === upload.id 
              ? { ...u, error: 'Upload failed' }
              : u
          )
        );
      }
    }
  }, [quoteId, images.length, uploadingImages.length, uploadMutation, toast]);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  }, [processFiles]);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragActive(false);
  }, []);

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
      e.target.value = ''; // Reset input
    }
  };

  const handleDeleteImage = (imageId: number) => {
    deleteMutation.mutate(imageId);
  };

  const handleRetryUpload = (uploadId: string) => {
    setUploadingImages(prev => 
      prev.map(u => 
        u.id === uploadId 
          ? { ...u, error: undefined, uploadProgress: 0 }
          : u
      )
    );

    const upload = uploadingImages.find(u => u.id === uploadId);
    if (upload) {
      uploadMutation.mutateAsync({ file: upload.file }).catch(() => {
        setUploadingImages(prev =>
          prev.map(u => 
            u.id === uploadId 
              ? { ...u, error: 'Upload failed' }
              : u
          )
        );
      });
    }
  };

  const handleRemoveUpload = (uploadId: string) => {
    setUploadingImages(prev => {
      const upload = prev.find(u => u.id === uploadId);
      if (upload) {
        URL.revokeObjectURL(upload.preview);
      }
      return prev.filter(u => u.id !== uploadId);
    });
  };

  // Drag and drop reordering
  const handleDragStart = (imageId: number) => {
    setDraggedImageId(imageId);
  };

  const handleDragEnd = () => {
    setDraggedImageId(null);
  };

  const handleDragOverImage = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDropOnImage = (targetImageId: number) => {
    if (draggedImageId === null || draggedImageId === targetImageId) return;

    const sortedImages = [...images].sort((a, b) => a.displayOrder - b.displayOrder);
    const draggedIndex = sortedImages.findIndex(img => img.id === draggedImageId);
    const targetIndex = sortedImages.findIndex(img => img.id === targetImageId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    // Reorder the array
    const reorderedImages = [...sortedImages];
    const [draggedImage] = reorderedImages.splice(draggedIndex, 1);
    reorderedImages.splice(targetIndex, 0, draggedImage);

    // Extract the new order
    const newOrder = reorderedImages.map(img => img.id);
    reorderMutation.mutate(newOrder);
  };

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Failed to load images. Please refresh the page and try again.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card className={className} data-testid="image-upload-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Image className="h-5 w-5" />
          Product Renderings
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Upload images of the product renderings for this quote. 
          Maximum 20 images, 10MB each. Supported formats: JPEG, PNG, WebP, GIF.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Upload Area */}
        <div
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
            isDragActive 
              ? 'border-primary bg-primary/10' 
              : 'border-muted-foreground/25 hover:border-muted-foreground/50'
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          data-testid="drop-zone"
        >
          <Input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
            multiple
            onChange={handleFileChange}
            className="hidden"
            data-testid="file-input"
          />
          
          <div className="flex flex-col items-center gap-2">
            <Upload className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">
              Drop images here or click to upload
            </p>
            <p className="text-xs text-muted-foreground">
              JPEG, PNG, WebP, GIF up to 10MB each
            </p>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleFileSelect}
              disabled={images.length + uploadingImages.length >= 20}
              data-testid="upload-button"
            >
              <Plus className="h-4 w-4 mr-2" />
              Choose Files
            </Button>
          </div>
        </div>

        {/* Upload Progress */}
        {uploadingImages.length > 0 && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">Uploading...</Label>
            {uploadingImages.map((upload) => (
              <div key={upload.id} className="flex items-center gap-3 p-2 border rounded" data-testid={`upload-progress-${upload.id}`}>
                <img 
                  src={upload.preview} 
                  alt="Preview" 
                  className="w-12 h-12 object-cover rounded"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{upload.file.name}</p>
                  {upload.error ? (
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-destructive">{upload.error}</p>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleRetryUpload(upload.id)}
                        data-testid={`retry-${upload.id}`}
                      >
                        <RefreshCw className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <Progress value={uploadMutation.isPending ? 50 : 100} className="h-1" />
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleRemoveUpload(upload.id)}
                  data-testid={`remove-upload-${upload.id}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Existing Images Gallery */}
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">
            Loading images...
          </div>
        ) : images.length > 0 ? (
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              Uploaded Images ({images.length}/20)
            </Label>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" data-testid="images-grid">
              {[...images]
                .sort((a, b) => a.displayOrder - b.displayOrder)
                .map((image) => (
                  <div
                    key={image.id}
                    draggable
                    onDragStart={() => handleDragStart(image.id)}
                    onDragEnd={handleDragEnd}
                    onDragOver={handleDragOverImage}
                    onDrop={() => handleDropOnImage(image.id)}
                    className={`relative group cursor-move border-2 rounded-lg overflow-hidden transition-all ${
                      draggedImageId === image.id ? 'border-primary scale-105' : 'border-transparent'
                    }`}
                    data-testid={`image-${image.id}`}
                  >
                    {/* Note: In a real implementation, you'd need to serve the images through an endpoint 
                         that handles object storage access. For now showing placeholder */}
                    <div className="aspect-square bg-muted flex items-center justify-center">
                      <Image className="h-8 w-8 text-muted-foreground" />
                      <span className="sr-only">{image.fileName}</span>
                    </div>
                    
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleDeleteImage(image.id)}
                        disabled={deleteMutation.isPending}
                        data-testid={`delete-image-${image.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    <div className="absolute top-2 left-2 bg-black/75 text-white text-xs px-2 py-1 rounded">
                      <Move className="h-3 w-3 inline mr-1" />
                      {image.displayOrder + 1}
                    </div>
                    
                    <div className="absolute bottom-0 left-0 right-0 bg-black/75 text-white text-xs p-2 truncate">
                      {image.fileName}
                    </div>
                  </div>
                ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Drag and drop to reorder images. Images will appear in this order in generated documents.
            </p>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No images uploaded yet. Add some product renderings to showcase your work.
          </div>
        )}
      </CardContent>
    </Card>
  );
}