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
import { put as putBlob } from '@vercel/blob/client';

// Types for extracted quote data from OpenAI
interface ExtractedLineItem {
  description?: string | null;
  quantity?: number | null;
  price?: number | null;
  total?: number | null;
  unit?: string | null;
}

interface ExtractedCustomer {
  name?: string | null; // Keep for backward compatibility with AI extraction
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  address?: string | null; // Legacy flat address field
  // Structured address fields
  streetAddress?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  country?: string | null;
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
  confidence?: number; // Extraction confidence score (0-1)
}

interface PDFImportResponse {
  success: boolean;
  filename: string;
  extractedData: ExtractedQuote;
  message: string;
  processingMethod?: 'vision' | 'text' | 'temporary-upload';
}

type QuotePdfUploadTarget =
  | {
      uploadMode: 'vercel-blob-client-token';
      clientToken: string;
      objectPath: string;
      pathname: string;
      maxFileSize: number;
    }
  | {
      uploadMode: 'signed-url';
      uploadUrl: string;
      objectPath: string;
      maxFileSize: number;
    };

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
  combineIntoSingleQuote: boolean; // New option to combine multiple PDFs
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
    combineIntoSingleQuote: false,
    customerHandling: 'create_new'
  });
  
  // State for editable PDF data
  const [editedPDFData, setEditedPDFData] = useState<Record<string, ExtractedQuote>>({});
  const [isImporting, setIsImporting] = useState(false);
  const [currentTab, setCurrentTab] = useState<string>('upload');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Helper function to format confidence score consistently
  const formatConfidence = (confidence?: number): string => {
    if (confidence === undefined) return '';
    const clampedConfidence = Math.max(0, Math.min(1, confidence));
    return ` (${Math.round(clampedConfidence * 100)}% confidence)`;
  };

  // Helper function to split full name into firstName and lastName
  const parseFullName = (fullName: string): { firstName: string; lastName: string } => {
    const trimmed = fullName.trim();
    if (!trimmed) {
      return { firstName: '', lastName: '' };
    }
    
    const parts = trimmed.split(/\s+/);
    if (parts.length === 1) {
      return { firstName: parts[0], lastName: '' };
    }
    
    const firstName = parts[0];
    const lastName = parts.slice(1).join(' ');
    return { firstName, lastName };
  };

  // Helper function to process extracted data and split name into firstName/lastName
  const processExtractedData = (data: ExtractedQuote): ExtractedQuote => {
    if (data.customer.name && !data.customer.firstName && !data.customer.lastName) {
      const { firstName, lastName } = parseFullName(data.customer.name);
      return {
        ...data,
        customer: {
          ...data.customer,
          firstName,
          lastName
        }
      };
    }
    return data;
  };

  // Helper functions for editable PDF data
  const getCurrentPDFData = (pdfId: string): ExtractedQuote | undefined => {
    const pdf = processedPDFs.find(p => p.id === pdfId);
    if (!pdf?.extractedData) return undefined;
    
    // Return edited data if available, otherwise original data
    return editedPDFData[pdfId] || pdf.extractedData;
  };

  const updatePDFData = (pdfId: string, field: string, value: any) => {
    setEditedPDFData(prev => {
      const currentData = getCurrentPDFData(pdfId);
      if (!currentData) return prev;

      const updatedData = { ...currentData };
      
      // Handle nested customer fields
      if (field.startsWith('customer.')) {
        const customerField = field.replace('customer.', '');
        updatedData.customer = { ...updatedData.customer, [customerField]: value };
      } else {
        (updatedData as any)[field] = value;
      }
      
      return { ...prev, [pdfId]: updatedData };
    });
  };

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
        ...(editedPDFData[pdf.id] || pdf.extractedData!)
      }));

      // Map customerHandling to attachCustomer for backend compatibility
      const mappedImportOptions = {
        ...importOptions,
        attachCustomer: importOptions.customerHandling === 'create_new' ? 'auto' as const : 'match_only' as const
      };

      const response = await apiRequest('POST', '/api/quotes/import-batch', {
        importOptions: mappedImportOptions,
        extractedQuotes
      });

      return await response.json();
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

      // Clear processed PDFs to prevent duplicate imports
      setProcessedPDFs([]);
      setSelectedPDFId(null);
      setEditedPDFData({});
      
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

  // Vision processing mutation - now only used for client-side page processing (kept for backward compatibility)
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

  const renderPdfPageToImage = async (page: any, pageIndex: number): Promise<PDFPageImage> => {
    const baseViewport = page.getViewport({ scale: 1 });
    const maxWidth = 1500;
    const scale = Math.min(2, maxWidth / baseViewport.width);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Browser canvas is not available for PDF rendering');
    }

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    await page.render({ canvasContext: context, viewport }).promise;

    let quality = 0.75;
    let dataUrl = canvas.toDataURL('image/jpeg', quality);
    const maxBase64Length = 900_000;

    while (dataUrl.length > maxBase64Length && quality > 0.35) {
      quality -= 0.1;
      dataUrl = canvas.toDataURL('image/jpeg', quality);
    }

    return {
      index: pageIndex,
      imageBase64: dataUrl.split(',')[1] || '',
    };
  };

  const renderPdfToImages = async (file: File, pdfId: string): Promise<PDFPageImage[]> => {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.mjs',
      import.meta.url
    ).toString();

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    const pageCount = Math.min(pdf.numPages, 8);
    const pages: PDFPageImage[] = [];

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      pages.push(await renderPdfPageToImage(page, pageNumber - 1));
      setProcessedPDFs(prev => prev.map(p =>
        p.id === pdfId
          ? { ...p, progress: 30 + Math.round((pageNumber / pageCount) * 40), status: 'processing' }
          : p
      ));
    }

    return pages;
  };

  const processPdfWithClientVision = async (file: File, pdfId: string): Promise<PDFImportResponse> => {
    const pages = await renderPdfToImages(file, pdfId);

    setProcessedPDFs(prev => prev.map(p =>
      p.id === pdfId ? { ...p, progress: 75, status: 'processing' } : p
    ));

    const response = await fetch('/api/quotes/import-vision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        filename: file.name,
        pages,
      }),
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || 'Failed to process PDF images');
    }

    return result;
  };

  const processPdfWithTemporaryUpload = async (file: File, pdfId: string): Promise<PDFImportResponse> => {
    const uploadTargetResponse = await fetch('/api/quotes/pdf-upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        filename: file.name,
        fileSize: file.size,
      }),
    });

    const uploadTarget = await uploadTargetResponse.json();
    if (!uploadTargetResponse.ok) {
      throw new Error(uploadTarget.message || 'Failed to prepare PDF upload');
    }

    const target = uploadTarget as QuotePdfUploadTarget;
    let objectPath = target.objectPath;

    setProcessedPDFs(prev => prev.map(p =>
      p.id === pdfId ? { ...p, progress: 35, status: 'processing' } : p
    ));

    if (target.uploadMode === 'vercel-blob-client-token') {
      const blob = await putBlob(target.pathname, file, {
        access: 'public',
        token: target.clientToken,
        contentType: 'application/pdf',
        multipart: file.size > 5 * 1024 * 1024,
        onUploadProgress: ({ percentage }) => {
          setProcessedPDFs(prev => prev.map(p =>
            p.id === pdfId ? { ...p, progress: 35 + Math.round(percentage * 0.35), status: 'processing' } : p
          ));
        },
      });

      objectPath = blob.pathname;
    } else {
      const uploadResponse = await fetch(target.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/pdf' },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload PDF for processing');
      }

      setProcessedPDFs(prev => prev.map(p =>
        p.id === pdfId ? { ...p, progress: 70, status: 'processing' } : p
      ));
    }

    setProcessedPDFs(prev => prev.map(p =>
      p.id === pdfId ? { ...p, progress: 75, status: 'processing' } : p
    ));

    const processResponse = await fetch('/api/quotes/import-vision-uploaded', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        objectPath,
        filename: file.name,
        fileSize: file.size,
      }),
    });

    const result = await processResponse.json();
    if (!processResponse.ok) {
      throw new Error(result.message || 'Failed to process PDF');
    }

    return result;
  };

  // Main processing function - send PDF directly to backend  
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
      // Update progress: Sending to server
      setProcessedPDFs(prev => prev.map(p => 
        p.id === pdfId ? { ...p, progress: 30, status: 'processing' } : p
      ));
      
      let result: PDFImportResponse;
      try {
        result = await processPdfWithClientVision(file, pdfId);
      } catch (clientVisionError) {
        console.warn('Client-side PDF vision processing failed, falling back to temporary upload:', clientVisionError);
        result = await processPdfWithTemporaryUpload(file, pdfId);
      }
      
      setProcessedPDFs(prev => prev.map(p => 
        p.id === pdfId ? { 
          ...p, 
          progress: 100, 
          status: 'success', 
          extractedData: processExtractedData(result.extractedData),
          processingMethod: 'vision'
        } : p
      ));
      
      toast({
        title: "PDF processed successfully",
        description: `${file.name} processed using server-side vision analysis${formatConfidence(result.extractedData.confidence)}`,
      });
      
      // Auto-advance to preview tab if this is the first successful PDF
      if (processedPDFs.filter(p => p.status === 'success').length === 0) {
        setCurrentTab('preview');
        setSelectedPDFId(pdfId);
      }
      
    } catch (error) {
      console.error('PDF processing failed:', error);
      
      setProcessedPDFs(prev => prev.map(p => 
        p.id === pdfId ? { 
          ...p, 
          progress: 0, 
          status: 'error', 
          error: `PDF processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        } : p
      ));
      
      toast({
        title: "PDF processing failed",
        description: `Failed to process ${file.name}. Please try again or check the file format.`,
        variant: "destructive"
      });
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
        customerHandling: 'create_new',
        combineIntoSingleQuote: false
      });
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Quote Importer
          </DialogTitle>
        </DialogHeader>

        <Tabs value={currentTab} onValueChange={setCurrentTab} className="flex-1 flex flex-col">
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
                      disabled={processedPDFs.some(pdf => pdf.status === 'processing')}
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
                                disabled={processedPDFs.some(pdf => pdf.status === 'processing')}
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
                          {successfulPDFs.map((pdf) => {
                            return (
                              <div
                                key={pdf.id}
                                className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                                  selectedPDFId === pdf.id ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'
                                }`}
                                onClick={() => setSelectedPDFId(pdf.id)}
                                data-testid={`pdf-item-${pdf.id}`}
                              >
                                <div className="flex items-center justify-between space-x-2">
                                  <div className="flex items-center space-x-2 flex-1">
                                    <FileText className="h-4 w-4" />
                                    <span className="text-sm font-medium truncate">{pdf.filename}</span>
                                  </div>
                                  {/* Confidence Score Badge */}
                                  {pdf.extractedData?.confidence !== undefined && (
                                    <div 
                                      className={`px-2 py-1 text-xs rounded-full font-medium ${
                                        pdf.extractedData.confidence >= 0.8 ? 'bg-green-100 text-green-700' :
                                        pdf.extractedData.confidence >= 0.6 ? 'bg-yellow-100 text-yellow-700' :
                                        'bg-red-100 text-red-700'
                                      }`}
                                      data-testid={`text-confidence-${pdf.id}`}
                                    >
                                      {Math.round(Math.max(0, Math.min(1, pdf.extractedData.confidence)) * 100)}%
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </div>

                {/* Preview Content */}
                <div className="lg:col-span-2">
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle>Extracted Data Preview</CardTitle>
                          <p className="text-sm text-gray-600">
                            Review and edit the extracted information before importing
                          </p>
                        </div>
                        {/* Confidence Score Display */}
                        {selectedPDF?.extractedData?.confidence !== undefined && (
                          <div className="text-right">
                            <p className="text-sm text-gray-600">Extraction Confidence</p>
                            <div 
                              className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                                selectedPDF.extractedData.confidence >= 0.8 ? 'bg-green-100 text-green-700' :
                                selectedPDF.extractedData.confidence >= 0.6 ? 'bg-yellow-100 text-yellow-700' :
                                'bg-red-100 text-red-700'
                              }`}
                              data-testid="text-confidence-preview"
                            >
                              {Math.round(Math.max(0, Math.min(1, selectedPDF.extractedData.confidence)) * 100)}%
                            </div>
                          </div>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-80">
                        <div className="space-y-6">
                          {/* Customer Information */}
                          <div>
                            <h4 className="font-medium mb-3">Customer Information</h4>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <Label>First Name</Label>
                                <Input 
                                  value={selectedPDFId ? getCurrentPDFData(selectedPDFId)?.customer?.firstName ?? '' : ''} 
                                  onChange={(e) => selectedPDFId && updatePDFData(selectedPDFId, 'customer.firstName', e.target.value)}
                                  placeholder="First name"
                                  data-testid="input-customer-first-name"
                                />
                              </div>
                              <div>
                                <Label>Last Name</Label>
                                <Input 
                                  value={selectedPDFId ? getCurrentPDFData(selectedPDFId)?.customer?.lastName ?? '' : ''} 
                                  onChange={(e) => selectedPDFId && updatePDFData(selectedPDFId, 'customer.lastName', e.target.value)}
                                  placeholder="Last name"
                                  data-testid="input-customer-last-name"
                                />
                              </div>
                              <div className="col-span-2">
                                <Label>Company</Label>
                                <Input 
                                  value={selectedPDFId ? getCurrentPDFData(selectedPDFId)?.customer?.company ?? '' : ''} 
                                  onChange={(e) => selectedPDFId && updatePDFData(selectedPDFId, 'customer.company', e.target.value)}
                                  placeholder="Company name"
                                  data-testid="input-customer-company"
                                />
                              </div>
                              <div>
                                <Label>Email</Label>
                                <Input 
                                  value={selectedPDFId ? getCurrentPDFData(selectedPDFId)?.customer?.email ?? '' : ''} 
                                  onChange={(e) => selectedPDFId && updatePDFData(selectedPDFId, 'customer.email', e.target.value)}
                                  placeholder="Email address"
                                  data-testid="input-customer-email"
                                />
                              </div>
                              <div>
                                <Label>Phone</Label>
                                <Input 
                                  value={selectedPDFId ? getCurrentPDFData(selectedPDFId)?.customer?.phone ?? '' : ''} 
                                  onChange={(e) => selectedPDFId && updatePDFData(selectedPDFId, 'customer.phone', e.target.value)}
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
                                  value={selectedPDFId ? getCurrentPDFData(selectedPDFId)?.quoteNumber ?? '' : ''} 
                                  onChange={(e) => selectedPDFId && updatePDFData(selectedPDFId, 'quoteNumber', e.target.value)}
                                  placeholder="Quote number"
                                  data-testid="input-quote-number"
                                />
                              </div>
                              <div>
                                <Label>Date</Label>
                                <Input 
                                  value={selectedPDFId ? getCurrentPDFData(selectedPDFId)?.date ?? '' : ''} 
                                  onChange={(e) => selectedPDFId && updatePDFData(selectedPDFId, 'date', e.target.value)}
                                  placeholder="Quote date"
                                  data-testid="input-quote-date"
                                />
                              </div>
                              <div className="col-span-2">
                                <Label>Project Description</Label>
                                <Textarea 
                                  value={selectedPDFId ? getCurrentPDFData(selectedPDFId)?.projectDescription ?? '' : ''} 
                                  onChange={(e) => selectedPDFId && updatePDFData(selectedPDFId, 'projectDescription', e.target.value)}
                                  placeholder="Project description"
                                  data-testid="textarea-project-description"
                                />
                              </div>
                            </div>
                          </div>

                          <Separator />

                          {/* Line Items */}
                          <div>
                            <h4 className="font-medium mb-3">Line Items ({selectedPDFId ? getCurrentPDFData(selectedPDFId)?.lineItems?.length ?? 0 : 0})</h4>
                            {selectedPDFId && getCurrentPDFData(selectedPDFId)?.lineItems && getCurrentPDFData(selectedPDFId)!.lineItems.length > 0 ? (
                              <div className="space-y-3">
                                {getCurrentPDFData(selectedPDFId)!.lineItems.map((item, index) => (
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
                          {selectedPDFId && (getCurrentPDFData(selectedPDFId)?.subtotal || getCurrentPDFData(selectedPDFId)?.total) && (
                            <>
                              <Separator />
                              <div>
                                <h4 className="font-medium mb-3">Financial Summary</h4>
                                <div className="grid grid-cols-2 gap-3">
                                  {selectedPDFId && getCurrentPDFData(selectedPDFId)?.subtotal && (
                                    <div>
                                      <Label>Subtotal</Label>
                                      <Input 
                                        value={selectedPDFId ? formatCurrency(getCurrentPDFData(selectedPDFId)!.subtotal!) : ''} 
                                        readOnly
                                      />
                                    </div>
                                  )}
                                  {selectedPDFId && getCurrentPDFData(selectedPDFId)?.total && (
                                    <div>
                                      <Label>Total</Label>
                                      <Input 
                                        value={selectedPDFId ? formatCurrency(getCurrentPDFData(selectedPDFId)!.total!) : ''} 
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
          <TabsContent value="import" className="flex flex-col flex-1 gap-4">
            <div className="flex-1 overflow-y-auto">
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
                        onChange={() => setImportOptions(prev => ({ ...prev, createNewQuote: true, combineIntoSingleQuote: false }))}
                        data-testid="radio-create-new-quote"
                      />
                      <Label htmlFor="create-new">Create new quotes</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id="add-existing"
                        checked={!importOptions.createNewQuote}
                        onChange={() => setImportOptions(prev => ({ ...prev, createNewQuote: false, combineIntoSingleQuote: false }))}
                        data-testid="radio-add-to-existing"
                      />
                      <Label htmlFor="add-existing">Add line items to existing quote</Label>
                    </div>
                    
                    {/* Combine Option */}
                    {importOptions.createNewQuote && successfulPDFs.length > 1 && (
                      <div className="ml-6 mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id="combine-pdfs"
                            checked={importOptions.combineIntoSingleQuote}
                            onChange={(e) => setImportOptions(prev => ({ 
                              ...prev, 
                              combineIntoSingleQuote: e.target.checked 
                            }))}
                            data-testid="checkbox-combine-pdfs"
                          />
                          <Label htmlFor="combine-pdfs" className="text-blue-700 font-medium">
                            Combine all PDFs into single quote
                          </Label>
                        </div>
                        <p className="text-sm text-blue-600 mt-1 ml-6">
                          All line items from {successfulPDFs.length} PDFs will be merged into one quote
                        </p>
                      </div>
                    )}
                    
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
            </div>

            {/* Import Summary - Fixed at bottom */}
            <Card className="flex-shrink-0">
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
