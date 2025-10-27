import { useState, useEffect } from 'react';
import { useParams } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { LoadingSpinner } from '@/components/loading-spinner';
import { SignatureCanvas, SignatureData } from '@/components/signature-canvas';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { CheckCircle, AlertTriangle, FileText, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import jsPDF from 'jspdf';
import { barlowRegularBase64, barlowSemiBoldBase64 } from '@/lib/fonts';
import { generateBrandedSequencePDF } from '@/lib/pdf-branded-sequence';
import { normalizeImageToDataUrl } from '@/lib/pdf-image-pipeline';
import { generateSignedPDF, downloadSignedPDF } from '@/lib/generate-signed-pdf';
import type { QuoteWithDetails } from '@shared/schema';

interface SigningQuoteData {
  id: number;
  quoteNumber: string | null;
  projectName: string | null;
  jobsiteAddress: string | null;
  accountName: string;
  lineItems: Array<{
    id: number;
    quoteId: number;
    description: string | null;
    productId: number | null;
    quantity: number;
    unitPrice: number;
    lineType: string;
  }>;
  taxRate: number | null;
  discount: number | null;
  shipping: number | null;
  isShippingTaxable: boolean | null;
  contractTemplate?: any;
  customContractTerms: string | null;
  clientSignedAt: string | null;
  companySignedAt: string | null;
  esigIncludePricing?: boolean;
  esigIncludeImages?: boolean;
  esigIncludeContract?: boolean;
}

export default function PublicSignPage() {
  const params = useParams();
  const token = params.token as string;
  const [signature, setSignature] = useState<SignatureData | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const { toast } = useToast();

  // Fetch quote data by token
  const { data: quoteData, isLoading, error } = useQuery<SigningQuoteData>({
    queryKey: ['/api/signatures', token],
    queryFn: async () => {
      const res = await fetch(`/api/signatures/${token}`, {
        credentials: 'include'
      });
      if (!res.ok) {
        throw new Error('Failed to fetch quote data');
      }
      return res.json();
    },
    enabled: !!token,
  });

  // Generate PDF preview when quote data is loaded
  useEffect(() => {
    if (quoteData && !pdfUrl && !isGeneratingPdf) {
      generatePdfPreview();
    }
  }, [quoteData]);

  // Cleanup PDF blob URL on unmount
  useEffect(() => {
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [pdfUrl]);

  const generatePdfPreview = async () => {
    if (!quoteData) return;

    setIsGeneratingPdf(true);
    try {
      const pdf = new jsPDF({
        unit: 'mm',
        format: 'letter',
        compress: true
      });

      // Add custom fonts
      pdf.addFileToVFS('Barlow-Regular.ttf', barlowRegularBase64);
      pdf.addFont('Barlow-Regular.ttf', 'Barlow-Regular', 'normal');
      pdf.addFileToVFS('Barlow-SemiBold.ttf', barlowSemiBoldBase64);
      pdf.addFont('Barlow-SemiBold.ttf', 'Barlow-SemiBold', 'normal');

      // Company data
      const company = {
        name: 'EDG Patio & Shade',
        address: '1802 Holian Drive, Spring Grove, IL 60081',
        phone: '+1 (815) 581-0138',
        email: 'info@edgpatioshade.com'
      };

      // Get PDF preferences from quote data (with defaults)
      const showPricing = quoteData.esigIncludePricing ?? true;
      const includeImages = quoteData.esigIncludeImages ?? false;
      const includeContract = quoteData.esigIncludeContract ?? true;

      // Get contract text if includeContract is true
      let contractText = '';
      if (includeContract) {
        contractText = (quoteData as any).contractTemplate?.terms || (quoteData as any).customContractTerms || '';
      }

      // Load product renderings if includeImages is true
      let renderImages: Array<{ dataUrl: string; format: 'PNG' | 'JPEG' }> = [];
      if (includeImages) {
        try {
          // Fetch product renderings for this quote
          const response = await fetch(`/api/quotes/${quoteData.id}/product-renderings`);
          if (response.ok) {
            const renderings = await response.json();
            const imageResults = await Promise.allSettled(
              renderings.map(async (rendering: any) => {
                return await normalizeImageToDataUrl(rendering.storageUrl);
              })
            );
            renderImages = imageResults
              .filter((r): r is PromiseFulfilledResult<{ dataUrl: string; format: 'PNG' | 'JPEG' }> => r.status === 'fulfilled')
              .map(r => r.value);
          }
        } catch (error) {
          console.warn('Failed to load product renderings:', error);
        }
      }

      await generateBrandedSequencePDF({
        pdf,
        company,
        quote: quoteData as any,
        renderImages,
        contractText,
        showPricing,
        clientLogoDataUrl: null
      });

      // Create blob URL for preview
      const blob = pdf.output('blob');
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
    } catch (error) {
      console.error('Error generating PDF preview:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate PDF preview',
        variant: 'destructive'
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Submit signature mutation
  const signMutation = useMutation({
    mutationFn: async (signatureData: SignatureData) => {
      // Get client IP (browser will send this with request)
      const response = await apiRequest('POST', `/api/signatures/${token}/sign`, { 
        signatureData,
        signerType: 'client'
      });
      return response;
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Quote signed successfully!',
        variant: 'default'
      });
      // Refresh quote data to show signed status
      queryClient.invalidateQueries({ 
        queryKey: ['/api/signatures', token]
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to sign quote',
        variant: 'destructive'
      });
    }
  });

  // Download signed PDF mutation
  const downloadPdfMutation = useMutation({
    mutationFn: async () => {
      // Fetch full quote data with signatures
      const response = await apiRequest('GET', `/api/signatures/${token}/full`);
      const fullQuote: QuoteWithDetails = await response.json();
      
      // Use stored PDF preferences
      const includeImages = fullQuote.esigIncludeImages ?? false;
      const includePricing = fullQuote.esigIncludePricing ?? true;
      const includeContract = fullQuote.esigIncludeContract ?? true;
      
      // Generate PDF
      const pdfBlob = await generateSignedPDF({ 
        quote: fullQuote, 
        includeImages,
        includePricing,
        includeContract
      });
      
      // Download
      downloadSignedPDF(pdfBlob, fullQuote);
    },
    onError: (error: any) => {
      toast({
        title: 'Download Failed',
        description: error.message || 'Failed to generate PDF',
        variant: 'destructive'
      });
    },
    onSuccess: () => {
      toast({
        title: 'PDF Downloaded',
        description: 'Your signed quote has been downloaded successfully',
      });
    }
  });

  const handleSign = () => {
    if (!signature) {
      toast({
        title: 'Signature Required',
        description: 'Please provide your signature before submitting',
        variant: 'destructive'
      });
      return;
    }

    signMutation.mutate(signature);
  };

  const isAlreadySigned = !!quoteData?.clientSignedAt;
  const canSign = signature && !isAlreadySigned && !signMutation.isPending;

  if (isLoading) {
    return <LoadingSpinner fullScreen text="Loading quote..." />;
  }

  if (error || !quoteData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              Invalid Signing Link
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertDescription>
                This signing link is invalid or has expired. Please contact the sender for a new link.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isAlreadySigned) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-2xl w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle className="w-6 h-6" />
              Quote Signed Successfully
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <AlertDescription className="text-green-800">
                This quote was signed on {new Date(quoteData.clientSignedAt!).toLocaleString()}.
              </AlertDescription>
            </Alert>
            <div className="space-y-2">
              <p className="text-sm text-gray-600">
                <strong>Quote:</strong> {quoteData.projectName || `#${quoteData.quoteNumber}`}
              </p>
              <p className="text-sm text-gray-600">
                <strong>Company:</strong> {quoteData.accountName}
              </p>
            </div>
            
            <div className="pt-4 border-t space-y-3">
              <Button 
                onClick={() => downloadPdfMutation.mutate()}
                disabled={downloadPdfMutation.isPending}
                className="w-full"
                data-testid="button-download-signed-pdf"
              >
                <Download className="w-4 h-4 mr-2" />
                {downloadPdfMutation.isPending ? 'Generating PDF...' : 'Download Signed Quote'}
              </Button>
              <p className="text-sm text-gray-500 text-center">
                You may now close this window.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-5xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Sign Quote: {quoteData.projectName || `Quote #${quoteData.id}`}
            </CardTitle>
            <CardDescription>
              {quoteData.accountName}
            </CardDescription>
          </CardHeader>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* PDF Preview */}
          <Card>
            <CardHeader>
              <CardTitle>Quote Preview</CardTitle>
            </CardHeader>
            <CardContent>
              {isGeneratingPdf ? (
                <div className="flex items-center justify-center h-64 sm:h-96">
                  <LoadingSpinner text="Generating preview..." />
                </div>
              ) : pdfUrl ? (
                <iframe
                  src={pdfUrl}
                  className="w-full h-64 sm:h-96 border rounded-md"
                  data-testid="pdf-preview"
                  title="Quote Preview"
                />
              ) : (
                <Alert>
                  <AlertDescription>
                    PDF preview not available
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Signature Capture */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Your Signature</CardTitle>
                <CardDescription>
                  Please sign below to accept the terms of this quote
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SignatureCanvas
                  onSignatureChange={setSignature}
                  signerName=""
                />
              </CardContent>
            </Card>

            <Button
              onClick={handleSign}
              disabled={!canSign}
              className="w-full"
              size="lg"
              data-testid="button-submit-signature"
            >
              {signMutation.isPending ? 'Submitting...' : 'Submit Signature'}
            </Button>

            {signature && (
              <Alert>
                <CheckCircle className="w-4 h-4" />
                <AlertDescription>
                  Signature captured. Click "Submit Signature" to complete.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
