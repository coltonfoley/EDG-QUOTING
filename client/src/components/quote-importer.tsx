import { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Upload, 
  FileText, 
  X, 
  CheckCircle, 
  AlertCircle, 
  Loader2, 
  RotateCcw, 
  Eye,
  Edit,
  Trash2,
  Plus,
  Users
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/utils';
import { apiRequest, queryClient } from '@/lib/queryClient';
import type { QuoteWithDetails } from '@shared/schema';

// Types for extracted quote data from OpenAI
interface ExtractedLineItem {
  description?: string | null;
  quantity?: number | null;
  price?: number | null;
  total?: number | null;
  unit?: string | null;
}

interface ExtractedCustomer {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  address?: string | null;
}

interface ExtractedQuote {
  customer: ExtractedCustomer;
  quoteNumber?: string | null;
  date?: string | null;
  projectDescription?: string | null;
  lineItems: ExtractedLineItem[];
  subtotal?: number | null;
  taxRate?: number | null;
  taxAmount?: number | null;
  discountAmount?: number | null;
  total?: number | null;
  notes?: string | null;
  terms?: string | null;
}

interface PDFImportResponse {
  success: boolean;
  filename: string;
  extractedData: ExtractedQuote;
  message: string;
  processingMethod?: 'vision' | 'text';
}

interface PDFPageImage {
  index: number;
  imageBase64: string;
}

interface ProcessedPDF {
  id: string;
  file: File;
  filename: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  extractedData?: ExtractedQuote;
  error?: string;
  progress: number;
}

interface ImportOptions {
  createNewQuote: boolean;
  existingQuoteId?: number;
  customerHandling: 'create_new' | 'use_existing';
  existingCustomerId?: number;
}

interface QuoteImporterProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete?: (importedCount: number) => void;
}

export function QuoteImporter({ open, onOpenChange, onImportComplete }: QuoteImporterProps) {
  // State management
  const [processedPDFs, setProcessedPDFs] = useState<ProcessedPDF[]>([]);
  const [selectedPDFId, setSelectedPDFId] = useState<string | null>(null);
  const [importOptions, setImportOptions] = useState<ImportOptions>({
    createNewQuote: true,
    customerHandling: 'create_new'
  });
  const [isImporting, setIsImporting] = useState(false);
  const [currentTab, setCurrentTab] = useState<string>('upload');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Fetch existing quotes and customers for selection
  const { data: existingQuotes } = useQuery<QuoteWithDetails[]>({
    queryKey: ['/api/quotes'],
    enabled: open && !importOptions.createNewQuote
  });

  const { data: existingCustomers } = useQuery<any[]>({
    queryKey: ['/api/accounts'],
    enabled: open && importOptions.customerHandling === 'use_existing'
  });

  // Import execution mutation  
  const importMutation = useMutation({
    mutationFn: async () => {
      const extractedQuotes = successfulPDFs.map(pdf => ({
        pdfId: pdf.id,
        filename: pdf.filename,
        ...pdf.extractedData!
      }));

      const response = await apiRequest('POST', '/api/quotes/import-batch', {
        importOptions,
        extractedQuotes
      });

      return response;
    },
    onMutate: () => {
      setIsImporting(true);
    },
    onSuccess: (data: any) => {
      setIsImporting(false);
      
      const { summary, errors } = data;
      
      // Show success toast with summary
      toast({
        title: "Import Completed",
        description: `Successfully created ${summary.quotesCreated} quotes and added ${summary.lineItemsAdded} line items. ${summary.customersCreated} new customers created.`,
      });

      // Show errors if any
      if (errors.length > 0) {
        toast({
          title: "Some imports failed",
          description: `${errors.length} PDFs failed to import. Check the results for details.`,
          variant: "destructive"
        });
      }

      // Invalidate quotes cache to refresh the list
      queryClient.invalidateQueries({ queryKey: ['/api/quotes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/accounts'] });

      // Notify parent component
      if (onImportComplete) {
        onImportComplete(summary.quotesCreated + (summary.lineItemsAdded > 0 ? 1 : 0));
      }

      // Auto-close dialog after successful import
      setTimeout(() => {
        onOpenChange(false);
      }, 2000);
    },
    onError: (error: any) => {
      setIsImporting(false);
      toast({
        title: "Import Failed",
        description: error.message || "An error occurred during import. Please try again.",
        variant: "destructive"
      });
    }
  });

  // PDF processing mutation
  // Convert PDF to images for vision processing
  const convertPDFToImages = async (file: File): Promise<PDFPageImage[]> => {
    try {
      // Dynamically import PDF.js to avoid SSR issues
      const pdfjs = await import('pdfjs-dist');
      
      // Set up worker
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.js',
        import.meta.url
      ).href;
      
      // Read file as array buffer
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      
      const pages: PDFPageImage[] = [];
      const maxPages = Math.min(pdf.numPages, 20); // Limit to 20 pages
      
      for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        
        // Set up canvas for rendering
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Could not get canvas context');
        
        // Calculate viewport for optimal resolution
        const viewport = page.getViewport({ scale: 2.0 }); // 2x scale for better quality
        canvas.width = Math.min(viewport.width, 2048); // Max width 2048px
        canvas.height = Math.min(viewport.height, 2048); // Max height 2048px
        
        // Adjust scale if canvas was resized
        const scale = Math.min(canvas.width / viewport.width, canvas.height / viewport.height);
        const finalViewport = page.getViewport({ scale: scale * 2.0 });
        
        // Render PDF page to canvas
        await page.render({
          canvasContext: context,
          viewport: finalViewport,
          canvas: canvas
        }).promise;
        
        // Convert canvas to base64 JPEG (compressed)
        const imageBase64 = canvas.toDataURL('image/jpeg', 0.6).split(',')[1]; // 60% quality for compression
        
        pages.push({
          index: pageNum - 1, // 0-based index
          imageBase64
        });
      }
      
      return pages;
    } catch (error) {
      console.error('Error converting PDF to images:', error);
      throw new Error('Failed to convert PDF to images for vision processing');
    }
  };

  // Vision-based PDF processing mutation
  const processVisionMutation = useMutation({
    mutationFn: async ({ file, pages }: { file: File; pages: PDFPageImage[] }): Promise<PDFImportResponse> => {
      const response = await fetch('/api/quotes/import-vision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          filename: file.name,
          pages
        }),
        credentials: 'include'
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to process PDF with vision');
      }
      
      return response.json();
    }
  });

  // Text-based PDF processing mutation (fallback)
  const processPDFMutation = useMutation({
    mutationFn: async (file: File): Promise<PDFImportResponse> => {
      const formData = new FormData();
      formData.append('pdf', file);
      
      const response = await fetch('/api/quotes/import-pdf', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to process PDF');
      }
      
      return response.json();
    },
    onMutate: (file: File) => {
      const pdfId = `pdf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const newPDF: ProcessedPDF = {
        id: pdfId,
        file,
        filename: file.name,
        status: 'processing',
        progress: 0
      };
      
      setProcessedPDFs(prev => [...prev, newPDF]);
      return { pdfId };
    },
    onSuccess: (data, file, context) => {
      if (!context) return;
      
      setProcessedPDFs(prev => prev.map(pdf => 
        pdf.id === context.pdfId 
          ? { ...pdf, status: 'success', extractedData: data.extractedData, progress: 100 }
          : pdf
      ));
      
      toast({
        title: "PDF Processed Successfully",
        description: `Extracted quote data from ${data.filename}`,
      });

      // Auto-advance to preview tab if this is the first successful PDF
      if (processedPDFs.filter(p => p.status === 'success').length === 0) {
        setCurrentTab('preview');
        setSelectedPDFId(context.pdfId);
      }
    },
    onError: (error: any, file, context) => {
      if (!context) return;
      
      setProcessedPDFs(prev => prev.map(pdf => 
        pdf.id === context.pdfId 
          ? { ...pdf, status: 'error', error: error.message, progress: 0 }
          : pdf
      ));
      
      toast({
        title: "PDF Processing Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // File drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const files = Array.from(e.dataTransfer.files);
    handleFileSelection(files);
  }, []);

  const handleFileSelection = useCallback((files: File[]) => {
    const pdfFiles = files.filter(file => file.type === 'application/pdf');
    
    if (pdfFiles.length === 0) {
      toast({
        title: "Invalid File Type",
        description: "Please select PDF files only.",
        variant: "destructive"
      });
      return;
    }
    
    // Process each PDF with vision-first approach
    pdfFiles.forEach(async (file) => {
      await processFileWithVisionFirst(file);
    });
  }, [toast]);

  // Main processing function with vision-first approach
  const processFileWithVisionFirst = async (file: File) => {
    const pdfId = `pdf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Add PDF to processing list
    const newPDF: ProcessedPDF = {
      id: pdfId,
      file,
      filename: file.name,
      status: 'processing',
      progress: 0
    };
    
    setProcessedPDFs(prev => [...prev, newPDF]);
    
    try {
      // Update progress: Converting to images
      setProcessedPDFs(prev => prev.map(p => 
        p.id === pdfId ? { ...p, progress: 20, status: 'processing' } : p
      ));
      
      // Step 1: Convert PDF to images
      const pages = await convertPDFToImages(file);
      
      // Update progress: Processing with vision
      setProcessedPDFs(prev => prev.map(p => 
        p.id === pdfId ? { ...p, progress: 50, status: 'processing' } : p
      ));
      
      try {
        // Step 2: Try vision processing first
        const visionResult = await processVisionMutation.mutateAsync({ file, pages });
        
        // Update progress: Success
        setProcessedPDFs(prev => prev.map(p => 
          p.id === pdfId ? { 
            ...p, 
            progress: 100, 
            status: 'success', 
            extractedData: visionResult.extractedData,
            processingMethod: 'vision'
          } : p
        ));
        
        toast({
          title: "PDF processed successfully",
          description: `${file.name} processed using vision analysis`,
        });
        
      } catch (visionError) {
        console.warn('Vision processing failed, falling back to text extraction:', visionError);
        
        // Update progress: Falling back to text
        setProcessedPDFs(prev => prev.map(p => 
          p.id === pdfId ? { ...p, progress: 70, status: 'processing' } : p
        ));
        
        try {
          // Step 3: Fallback to text processing
          const textResult = await processPDFMutation.mutateAsync(file);
          
          // Update progress: Success with fallback
          setProcessedPDFs(prev => prev.map(p => 
            p.id === pdfId ? { 
              ...p, 
              progress: 100, 
              status: 'success', 
              extractedData: textResult.extractedData,
              processingMethod: 'text'
            } : p
          ));
          
          toast({
            title: "PDF processed successfully",
            description: `${file.name} processed using text extraction (vision fallback)`,
          });
          
        } catch (textError) {
          // Both methods failed
          setProcessedPDFs(prev => prev.map(p => 
            p.id === pdfId ? { 
              ...p, 
              progress: 0, 
              status: 'error', 
              error: `Both vision and text processing failed: ${textError instanceof Error ? textError.message : 'Unknown error'}`
            } : p
          ));
          
          toast({
            title: "PDF processing failed",
            description: `Failed to process ${file.name}. Please try again or check the file format.`,
            variant: "destructive"
          });
        }
      }
      
    } catch (imageError) {
      console.error('PDF to image conversion failed:', imageError);
      
      // If image conversion fails, try text extraction directly
      try {
        setProcessedPDFs(prev => prev.map(p => 
          p.id === pdfId ? { ...p, progress: 50, status: 'processing' } : p
        ));
        
        const textResult = await processPDFMutation.mutateAsync(file);
        
        setProcessedPDFs(prev => prev.map(p => 
          p.id === pdfId ? { 
            ...p, 
            progress: 100, 
            status: 'success', 
            extractedData: textResult.extractedData,
            processingMethod: 'text'
          } : p
        ));
        
        toast({
          title: "PDF processed successfully",
          description: `${file.name} processed using text extraction (image conversion failed)`,
        });
        
      } catch (finalError) {
        setProcessedPDFs(prev => prev.map(p => 
          p.id === pdfId ? { 
            ...p, 
            progress: 0, 
            status: 'error', 
            error: `Processing failed: ${finalError instanceof Error ? finalError.message : 'Unknown error'}`
          } : p
        ));
        
        toast({
          title: "PDF processing failed",
          description: `Failed to process ${file.name}. Please try again.`,
          variant: "destructive"
        });
      }
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFileSelection(Array.from(e.target.files));
      // Reset input so same file can be selected again
      e.target.value = '';
    }
  };

  const retryPDF = async (pdfId: string) => {
    const pdf = processedPDFs.find(p => p.id === pdfId);
    if (pdf) {
      // Remove the failed PDF from the list and re-process with vision-first
      setProcessedPDFs(prev => prev.filter(p => p.id !== pdfId));
      await processFileWithVisionFirst(pdf.file);
    }
  };

  const removePDF = (pdfId: string) => {
    setProcessedPDFs(prev => prev.filter(p => p.id !== pdfId));
    if (selectedPDFId === pdfId) {
      setSelectedPDFId(null);
    }
  };

  const getStatusColor = (status: ProcessedPDF['status']) => {
    switch (status) {
      case 'pending': return 'bg-gray-100 text-gray-800';
      case 'processing': return 'bg-blue-100 text-blue-800';
      case 'success': return 'bg-green-100 text-green-800';
      case 'error': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: ProcessedPDF['status']) => {
    switch (status) {
      case 'pending': return <FileText className="h-4 w-4" />;
      case 'processing': return <Loader2 className="h-4 w-4 animate-spin" />;
      case 'success': return <CheckCircle className="h-4 w-4" />;
      case 'error': return <AlertCircle className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  const successfulPDFs = processedPDFs.filter(pdf => pdf.status === 'success');
  const selectedPDF = selectedPDFId ? processedPDFs.find(p => p.id === selectedPDFId) : successfulPDFs[0];

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setProcessedPDFs([]);
      setSelectedPDFId(null);
      setCurrentTab('upload');
      setImportOptions({
        createNewQuote: true,
        customerHandling: 'create_new'
      });
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Quote Importer
          </DialogTitle>
        </DialogHeader>

        <Tabs value={currentTab} onValueChange={setCurrentTab} className="flex-1">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="upload">Upload PDFs</TabsTrigger>
            <TabsTrigger value="preview" disabled={successfulPDFs.length === 0}>
              Preview & Edit ({successfulPDFs.length})
            </TabsTrigger>
            <TabsTrigger value="import" disabled={successfulPDFs.length === 0}>
              Import Options
            </TabsTrigger>
          </TabsList>

          {/* Upload Tab */}
          <TabsContent value="upload" className="space-y-4">
            <div className="space-y-4">
              {/* Upload Area */}
              <Card>
                <CardContent className="p-6">
                  <div
                    className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors"
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                  >
                    <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      Upload Quote PDFs
                    </h3>
                    <p className="text-gray-600 mb-4">
                      Drag and drop PDF files here, or click to select files
                    </p>
                    <Button
                      onClick={() => fileInputRef.current?.click()}
                      variant="outline"
                      disabled={processPDFMutation.isPending}
                      data-testid="button-select-files"
                    >
                      Select Files
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf"
                      multiple
                      className="hidden"
                      onChange={handleFileInputChange}
                      data-testid="input-file-upload"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Processing Status */}
              {processedPDFs.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Processing Status</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {processedPDFs.map((pdf) => (
                        <div key={pdf.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center space-x-3 flex-1">
                            {getStatusIcon(pdf.status)}
                            <div className="flex-1">
                              <p className="font-medium text-sm">{pdf.filename}</p>
                              {pdf.status === 'processing' && (
                                <Progress value={pdf.progress} className="w-full mt-2" />
                              )}
                              {pdf.error && (
                                <p className="text-xs text-red-600 mt-1">{pdf.error}</p>
                              )}
                            </div>
                            <Badge className={getStatusColor(pdf.status)}>
                              {pdf.status}
                            </Badge>
                          </div>
                          <div className="flex items-center space-x-2">
                            {pdf.status === 'success' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedPDFId(pdf.id);
                                  setCurrentTab('preview');
                                }}
                                data-testid={`button-preview-${pdf.id}`}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            )}
                            {pdf.status === 'error' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => retryPDF(pdf.id)}
                                disabled={processPDFMutation.isPending}
                                data-testid={`button-retry-${pdf.id}`}
                              >
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removePDF(pdf.id)}
                              data-testid={`button-remove-${pdf.id}`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Preview Tab */}
          <TabsContent value="preview" className="space-y-4">
            {selectedPDF?.extractedData && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* PDF List */}
                <div className="lg:col-span-1">
                  <Card>
                    <CardHeader>
                      <CardTitle>Processed PDFs</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-60">
                        <div className="space-y-2">
                          {successfulPDFs.map((pdf) => (
                            <div
                              key={pdf.id}
                              className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                                selectedPDFId === pdf.id ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'
                              }`}
                              onClick={() => setSelectedPDFId(pdf.id)}
                              data-testid={`pdf-item-${pdf.id}`}
                            >
                              <div className="flex items-center space-x-2">
                                <FileText className="h-4 w-4" />
                                <span className="text-sm font-medium truncate">{pdf.filename}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </div>

                {/* Preview Content */}
                <div className="lg:col-span-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>Extracted Data Preview</CardTitle>
                      <p className="text-sm text-gray-600">
                        Review and edit the extracted information before importing
                      </p>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-80">
                        <div className="space-y-6">
                          {/* Customer Information */}
                          <div>
                            <h4 className="font-medium mb-3">Customer Information</h4>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <Label>Name</Label>
                                <Input 
                                  value={selectedPDF.extractedData.customer?.name || ''} 
                                  placeholder="Customer name"
                                  data-testid="input-customer-name"
                                />
                              </div>
                              <div>
                                <Label>Company</Label>
                                <Input 
                                  value={selectedPDF.extractedData.customer?.company || ''} 
                                  placeholder="Company name"
                                  data-testid="input-customer-company"
                                />
                              </div>
                              <div>
                                <Label>Email</Label>
                                <Input 
                                  value={selectedPDF.extractedData.customer?.email || ''} 
                                  placeholder="Email address"
                                  data-testid="input-customer-email"
                                />
                              </div>
                              <div>
                                <Label>Phone</Label>
                                <Input 
                                  value={selectedPDF.extractedData.customer?.phone || ''} 
                                  placeholder="Phone number"
                                  data-testid="input-customer-phone"
                                />
                              </div>
                            </div>
                          </div>

                          <Separator />

                          {/* Quote Details */}
                          <div>
                            <h4 className="font-medium mb-3">Quote Details</h4>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <Label>Quote Number</Label>
                                <Input 
                                  value={selectedPDF.extractedData.quoteNumber || ''} 
                                  placeholder="Quote number"
                                  data-testid="input-quote-number"
                                />
                              </div>
                              <div>
                                <Label>Date</Label>
                                <Input 
                                  value={selectedPDF.extractedData.date || ''} 
                                  placeholder="Quote date"
                                  data-testid="input-quote-date"
                                />
                              </div>
                              <div className="col-span-2">
                                <Label>Project Description</Label>
                                <Textarea 
                                  value={selectedPDF.extractedData.projectDescription || ''} 
                                  placeholder="Project description"
                                  data-testid="textarea-project-description"
                                />
                              </div>
                            </div>
                          </div>

                          <Separator />

                          {/* Line Items */}
                          <div>
                            <h4 className="font-medium mb-3">Line Items ({selectedPDF.extractedData.lineItems?.length || 0})</h4>
                            {selectedPDF.extractedData.lineItems?.length > 0 ? (
                              <div className="space-y-3">
                                {selectedPDF.extractedData.lineItems.map((item, index) => (
                                  <div key={index} className="p-3 border rounded-lg">
                                    <div className="grid grid-cols-4 gap-2 text-sm">
                                      <div>
                                        <span className="font-medium">Description:</span>
                                        <p>{item.description || 'N/A'}</p>
                                      </div>
                                      <div>
                                        <span className="font-medium">Quantity:</span>
                                        <p>{item.quantity || 'N/A'} {item.unit || ''}</p>
                                      </div>
                                      <div>
                                        <span className="font-medium">Price:</span>
                                        <p>{item.price ? formatCurrency(item.price) : 'N/A'}</p>
                                      </div>
                                      <div>
                                        <span className="font-medium">Total:</span>
                                        <p>{item.total ? formatCurrency(item.total) : 'N/A'}</p>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <Alert>
                                <AlertCircle className="h-4 w-4" />
                                <AlertDescription>
                                  No line items were extracted from this PDF.
                                </AlertDescription>
                              </Alert>
                            )}
                          </div>

                          {/* Financial Summary */}
                          {(selectedPDF.extractedData.subtotal || selectedPDF.extractedData.total) && (
                            <>
                              <Separator />
                              <div>
                                <h4 className="font-medium mb-3">Financial Summary</h4>
                                <div className="grid grid-cols-2 gap-3">
                                  {selectedPDF.extractedData.subtotal && (
                                    <div>
                                      <Label>Subtotal</Label>
                                      <Input 
                                        value={formatCurrency(selectedPDF.extractedData.subtotal)} 
                                        readOnly
                                      />
                                    </div>
                                  )}
                                  {selectedPDF.extractedData.total && (
                                    <div>
                                      <Label>Total</Label>
                                      <Input 
                                        value={formatCurrency(selectedPDF.extractedData.total)} 
                                        readOnly
                                      />
                                    </div>
                                  )}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Import Options Tab */}
          <TabsContent value="import" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Import Options</CardTitle>
                <p className="text-sm text-gray-600">
                  Configure how the extracted data should be imported into your system
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Quote Creation Options */}
                <div>
                  <h4 className="font-medium mb-3">Quote Creation</h4>
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id="create-new"
                        checked={importOptions.createNewQuote}
                        onChange={() => setImportOptions(prev => ({ ...prev, createNewQuote: true }))}
                        data-testid="radio-create-new-quote"
                      />
                      <Label htmlFor="create-new">Create new quotes</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id="add-existing"
                        checked={!importOptions.createNewQuote}
                        onChange={() => setImportOptions(prev => ({ ...prev, createNewQuote: false }))}
                        data-testid="radio-add-to-existing"
                      />
                      <Label htmlFor="add-existing">Add line items to existing quote</Label>
                    </div>
                    
                    {!importOptions.createNewQuote && (
                      <div className="ml-6 mt-2">
                        <Label>Select Quote</Label>
                        <Select 
                          value={importOptions.existingQuoteId?.toString()} 
                          onValueChange={(value) => setImportOptions(prev => ({ 
                            ...prev, 
                            existingQuoteId: parseInt(value) 
                          }))}
                        >
                          <SelectTrigger data-testid="select-existing-quote">
                            <SelectValue placeholder="Choose an existing quote" />
                          </SelectTrigger>
                          <SelectContent>
                            {existingQuotes?.map((quote) => (
                              <SelectItem key={quote.id} value={quote.id.toString()}>
                                {quote.quoteNumber} - {quote.customer?.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Customer Handling */}
                <div>
                  <h4 className="font-medium mb-3">Customer Handling</h4>
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id="create-customer"
                        checked={importOptions.customerHandling === 'create_new'}
                        onChange={() => setImportOptions(prev => ({ ...prev, customerHandling: 'create_new' }))}
                        data-testid="radio-create-new-customer"
                      />
                      <Label htmlFor="create-customer">Create new customer accounts</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id="use-existing-customer"
                        checked={importOptions.customerHandling === 'use_existing'}
                        onChange={() => setImportOptions(prev => ({ ...prev, customerHandling: 'use_existing' }))}
                        data-testid="radio-use-existing-customer"
                      />
                      <Label htmlFor="use-existing-customer">Match with existing customers</Label>
                    </div>

                    {importOptions.customerHandling === 'use_existing' && (
                      <div className="ml-6 mt-2">
                        <Label>Default Customer (for unmatched)</Label>
                        <Select 
                          value={importOptions.existingCustomerId?.toString()} 
                          onValueChange={(value) => setImportOptions(prev => ({ 
                            ...prev, 
                            existingCustomerId: parseInt(value) 
                          }))}
                        >
                          <SelectTrigger data-testid="select-existing-customer">
                            <SelectValue placeholder="Choose a default customer" />
                          </SelectTrigger>
                          <SelectContent>
                            {existingCustomers?.map((customer) => (
                              <SelectItem key={customer.id} value={customer.id.toString()}>
                                {customer.name} {customer.company && `(${customer.company})`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Import Summary */}
            <Card>
              <CardHeader>
                <CardTitle>Import Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span>PDFs to import:</span>
                    <span className="font-medium">{successfulPDFs.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total line items:</span>
                    <span className="font-medium">
                      {successfulPDFs.reduce((total, pdf) => 
                        total + (pdf.extractedData?.lineItems?.length || 0), 0
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Action:</span>
                    <span className="font-medium">
                      {importOptions.createNewQuote ? 'Create new quotes' : 'Add to existing quote'}
                    </span>
                  </div>
                </div>

                <div className="mt-6 flex justify-end space-x-3">
                  <Button 
                    variant="outline" 
                    onClick={() => onOpenChange(false)}
                    data-testid="button-cancel-import"
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={() => importMutation.mutate()}
                    disabled={successfulPDFs.length === 0 || isImporting}
                    data-testid="button-start-import"
                  >
                    {isImporting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Importing...
                      </>
                    ) : (
                      `Import ${successfulPDFs.length} Quote${successfulPDFs.length !== 1 ? 's' : ''}`
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}