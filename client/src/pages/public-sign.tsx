import { useState, useEffect } from 'react';
import { useParams } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/loading-spinner';
import { SignatureCanvas, SignatureData } from '@/components/signature-canvas';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { CheckCircle, AlertTriangle, FileText, Download, Shield, Clock, Eye, PenLine, ArrowRight, ArrowLeft, MapPin, Mail, Phone, DollarSign, Package, Maximize2, Minimize2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import jsPDF from 'jspdf';
import { barlowRegularBase64, barlowSemiBoldBase64 } from '@/lib/fonts';
import { generateBrandedSequencePDF } from '@/lib/pdf-branded-sequence';
import { normalizeImageToDataUrl } from '@/lib/pdf-image-pipeline';
import { generateSignedPDF, downloadSignedPDF } from '@/lib/generate-signed-pdf';
import type { QuoteWithDetails } from '@shared/schema';
import { cn } from '@/lib/utils';
import edgLogoPath from '@assets/Logo_Full_Color_Black_1766097629382.png';

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
    isTaxable?: boolean;
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

type SigningStep = 'review' | 'sign' | 'complete';

const COMPANY_INFO = {
  name: 'EDG Patio & Shade',
  address: '1802 Holian Drive, Spring Grove, IL 60081',
  phone: '+1 (815) 581-0138',
  email: 'info@edgpatioshade.com'
};

function calculateQuoteTotals(quoteData: SigningQuoteData) {
  const lineItems = quoteData.lineItems || [];
  const subtotal = lineItems.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.unitPrice) || 0;
    return sum + (qty * price);
  }, 0);
  const taxableAmount = lineItems
    .filter(item => item.isTaxable !== false)
    .reduce((sum, item) => {
      const qty = Number(item.quantity) || 0;
      const price = Number(item.unitPrice) || 0;
      return sum + (qty * price);
    }, 0);
  const taxRate = Number(quoteData.taxRate) || 0;
  const tax = taxableAmount * (taxRate / 100);
  const shipping = Number(quoteData.shipping) || 0;
  const discount = Number(quoteData.discount) || 0;
  const total = subtotal + tax + shipping - discount;
  return { subtotal, tax, shipping, discount, total, itemCount: lineItems.length };
}

function StepIndicator({ currentStep, isComplete }: { currentStep: SigningStep; isComplete: boolean }) {
  const steps = [
    { id: 'review', label: 'Review', icon: Eye },
    { id: 'sign', label: 'Sign', icon: PenLine },
    { id: 'complete', label: 'Complete', icon: CheckCircle },
  ];

  const getStepStatus = (stepId: string) => {
    if (isComplete) return 'complete';
    const stepOrder = ['review', 'sign', 'complete'];
    const currentIndex = stepOrder.indexOf(currentStep);
    const stepIndex = stepOrder.indexOf(stepId);
    if (stepIndex < currentIndex) return 'complete';
    if (stepIndex === currentIndex) return 'current';
    return 'upcoming';
  };

  return (
    <div className="flex items-center justify-center gap-2 sm:gap-4 py-4">
      {steps.map((step, index) => {
        const status = getStepStatus(step.id);
        const Icon = step.icon;
        return (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center transition-all",
                status === 'complete' && "bg-emerald-500 text-white",
                status === 'current' && "bg-primary text-white ring-4 ring-primary/20",
                status === 'upcoming' && "bg-slate-200 text-slate-400 dark:bg-slate-700"
              )}>
                <Icon className="w-5 h-5" />
              </div>
              <span className={cn(
                "text-xs mt-1 font-medium",
                status === 'complete' && "text-emerald-600",
                status === 'current' && "text-primary",
                status === 'upcoming' && "text-slate-400"
              )}>
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div className={cn(
                "w-8 sm:w-16 h-0.5 mx-2",
                getStepStatus(steps[index + 1].id) !== 'upcoming' ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-700"
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function CompanyHeader() {
  return (
    <div className="bg-slate-900 text-white py-3 px-6 shadow-lg">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <img 
            src={edgLogoPath} 
            alt="EDG Patio & Shade" 
            className="h-10 w-auto brightness-0 invert"
          />
          <div className="hidden sm:block border-l border-slate-700 pl-4">
            <p className="text-slate-400 text-xs">Secure Document Signing</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Shield className="w-3.5 h-3.5 text-emerald-400" />
          <span>256-bit SSL Encrypted</span>
        </div>
      </div>
    </div>
  );
}

function QuoteSummaryBar({ quoteData, showPricing }: { quoteData: SigningQuoteData; showPricing: boolean }) {
  const totals = calculateQuoteTotals(quoteData);
  
  return (
    <div className="bg-white dark:bg-slate-800 border-b shadow-sm sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-lg leading-tight">
                {quoteData.projectName || `Quote #${quoteData.quoteNumber}`}
              </h2>
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>{quoteData.accountName}</span>
                {quoteData.jobsiteAddress && (
                  <>
                    <span className="hidden sm:inline">•</span>
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {quoteData.jobsiteAddress}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 text-sm">
              <Badge variant="secondary" className="flex items-center gap-1">
                <Package className="w-3 h-3" />
                {totals.itemCount} items
              </Badge>
              {showPricing && (
                <Badge variant="default" className="flex items-center gap-1 bg-primary">
                  <DollarSign className="w-3 h-3" />
                  {totals.total.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PublicSignPage() {
  const params = useParams();
  const token = params.token as string;
  const [signature, setSignature] = useState<SignatureData | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [currentStep, setCurrentStep] = useState<SigningStep>('review');
  const [hasAgreed, setHasAgreed] = useState(false);
  const [signedTimestamp, setSignedTimestamp] = useState<Date | null>(null);
  const [emailWasSent, setEmailWasSent] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { toast } = useToast();

  const { data: quoteData, isLoading, error } = useQuery<SigningQuoteData>({
    queryKey: ['/api/signatures', token, 'full'],
    queryFn: async () => {
      const res = await fetch(`/api/signatures/${token}/full`, {
        credentials: 'include'
      });
      if (!res.ok) {
        throw new Error('Failed to fetch quote data');
      }
      return res.json();
    },
    enabled: !!token,
  });

  useEffect(() => {
    if (quoteData && !pdfUrl && !isGeneratingPdf) {
      generatePdfPreview();
    }
  }, [quoteData]);

  useEffect(() => {
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [pdfUrl]);

  useEffect(() => {
    if (quoteData?.clientSignedAt) {
      setCurrentStep('complete');
      setSignedTimestamp(new Date(quoteData.clientSignedAt));
    }
  }, [quoteData?.clientSignedAt]);

  useEffect(() => {
    if (isFullscreen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isFullscreen]);

  const handleDownloadPreview = () => {
    if (!pdfUrl || !quoteData) return;
    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = `Quote-${quoteData.quoteNumber || quoteData.id}-Preview.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({
      title: 'PDF Downloaded',
      description: 'Quote preview has been downloaded',
    });
  };

  const generatePdfPreview = async () => {
    if (!quoteData) return;

    setIsGeneratingPdf(true);
    try {
      const pdf = new jsPDF({
        unit: 'mm',
        format: 'letter',
        compress: true
      });

      pdf.addFileToVFS('Barlow-Regular.ttf', barlowRegularBase64);
      pdf.addFont('Barlow-Regular.ttf', 'Barlow-Regular', 'normal');
      pdf.addFileToVFS('Barlow-SemiBold.ttf', barlowSemiBoldBase64);
      pdf.addFont('Barlow-SemiBold.ttf', 'Barlow-SemiBold', 'normal');

      const company = COMPANY_INFO;

      const showPricing = quoteData.esigIncludePricing ?? true;
      const includeImages = quoteData.esigIncludeImages ?? false;
      const includeContract = quoteData.esigIncludeContract ?? true;

      let contractText = '';
      if (includeContract) {
        contractText = (quoteData as any).contractTemplate?.terms || (quoteData as any).customContractTerms || '';
      }

      let renderImages: Array<{ dataUrl: string; format: 'PNG' | 'JPEG' }> = [];
      if (includeImages) {
        try {
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

  const signMutation = useMutation({
    mutationFn: async (signatureData: SignatureData) => {
      const response = await apiRequest('POST', `/api/signatures/${token}/sign`, { 
        signatureData,
        signerType: 'client'
      });
      return response.json();
    },
    onSuccess: (data: { success: boolean; emailSent?: boolean }) => {
      setSignedTimestamp(new Date());
      setCurrentStep('complete');
      setEmailWasSent(data.emailSent ?? false);
      toast({
        title: 'Signed Successfully',
        description: 'Your signature has been recorded',
      });
      queryClient.invalidateQueries({ 
        queryKey: ['/api/signatures', token, 'full']
      });
      queryClient.invalidateQueries({ 
        queryKey: ['/api/quotes']
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

  const downloadPdfMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('GET', `/api/signatures/${token}/full`);
      const fullQuote: QuoteWithDetails = await response.json();
      
      // Fetch groups for proper PDF aggregation
      let groups: { id: string; title: string; position: number }[] = [];
      try {
        const groupsResponse = await apiRequest('GET', `/api/quotes/${fullQuote.id}/groups`);
        const groupsData = await groupsResponse.json();
        groups = groupsData.map((g: any) => ({ id: g.id, title: g.title, position: g.position }));
      } catch (e) {
        console.warn('Failed to fetch groups for PDF:', e);
      }
      
      const includeImages = fullQuote.esigIncludeImages ?? false;
      const includePricing = fullQuote.esigIncludePricing ?? true;
      const includeContract = fullQuote.esigIncludeContract ?? true;
      
      const pdfBlob = await generateSignedPDF({ 
        quote: fullQuote, 
        includeImages,
        includePricing,
        includeContract,
        groups
      });
      
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

  const handleProceedToSign = () => {
    setCurrentStep('sign');
  };

  const handleSign = () => {
    if (!signature) {
      toast({
        title: 'Signature Required',
        description: 'Please provide your signature before submitting',
        variant: 'destructive'
      });
      return;
    }

    if (!hasAgreed) {
      toast({
        title: 'Agreement Required',
        description: 'Please confirm that you agree to the terms',
        variant: 'destructive'
      });
      return;
    }

    signMutation.mutate(signature);
  };

  const isAlreadySigned = !!quoteData?.clientSignedAt;
  const canSign = signature && hasAgreed && !isAlreadySigned && !signMutation.isPending;
  const showPricing = quoteData?.esigIncludePricing ?? true;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
        <CompanyHeader />
        <div className="flex items-center justify-center py-32">
          <LoadingSpinner text="Loading document..." />
        </div>
      </div>
    );
  }

  if (error || !quoteData) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
        <CompanyHeader />
        <div className="flex items-center justify-center py-16 px-4">
          <Card className="max-w-md w-full shadow-lg">
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
              <CardTitle className="text-xl">Invalid Signing Link</CardTitle>
              <CardDescription>
                This link is no longer valid
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert variant="destructive">
                <AlertDescription>
                  This signing link may have expired or been revoked. Please contact the sender for a new link.
                </AlertDescription>
              </Alert>
              <div className="pt-4 border-t text-center">
                <p className="text-sm text-muted-foreground mb-2">Need help?</p>
                <div className="flex flex-col gap-1 text-sm">
                  <a href={`mailto:${COMPANY_INFO.email}`} className="text-primary hover:underline flex items-center justify-center gap-1">
                    <Mail className="w-3 h-3" />
                    {COMPANY_INFO.email}
                  </a>
                  <a href={`tel:${COMPANY_INFO.phone}`} className="text-primary hover:underline flex items-center justify-center gap-1">
                    <Phone className="w-3 h-3" />
                    {COMPANY_INFO.phone}
                  </a>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (currentStep === 'complete') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
        <CompanyHeader />
        <div className="max-w-2xl mx-auto px-4 py-8">
          <StepIndicator currentStep="complete" isComplete={true} />
          
          <Card className="shadow-lg mt-8">
            <CardContent className="pt-8 text-center">
              <div className="mx-auto w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-6">
                <CheckCircle className="w-10 h-10 text-emerald-600" />
              </div>
              
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                Document Signed Successfully
              </h2>
              <p className="text-muted-foreground mb-6">
                Your signature has been recorded and the document is now legally binding.
              </p>

              <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 mb-6 text-left">
                <h3 className="font-medium text-sm text-slate-500 dark:text-slate-400 mb-3">SIGNATURE DETAILS</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Document</span>
                    <span className="font-medium">{quoteData.projectName || `Quote #${quoteData.quoteNumber}`}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">From</span>
                    <span className="font-medium">{COMPANY_INFO.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Signed On</span>
                    <span className="font-medium flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {(signedTimestamp || new Date(quoteData.clientSignedAt!)).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <Button 
                  onClick={() => downloadPdfMutation.mutate()}
                  disabled={downloadPdfMutation.isPending}
                  className="w-full"
                  size="lg"
                  data-testid="button-download-signed-pdf"
                >
                  <Download className="w-4 h-4 mr-2" />
                  {downloadPdfMutation.isPending ? 'Generating PDF...' : 'Download Signed Document'}
                </Button>
                
                <p className="text-xs text-muted-foreground">
                  {emailWasSent 
                    ? "A confirmation email has been sent to you with a link to download your signed document."
                    : "We recommend downloading a copy of your signed document for your records."
                  }
                </p>
              </div>

              <div className="mt-8 pt-6 border-t">
                <p className="text-sm text-muted-foreground mb-4">
                  Thank you for your business!
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-muted-foreground">
                  <a href={`mailto:${COMPANY_INFO.email}`} className="flex items-center gap-1 hover:text-primary">
                    <Mail className="w-3 h-3" />
                    {COMPANY_INFO.email}
                  </a>
                  <a href={`tel:${COMPANY_INFO.phone}`} className="flex items-center gap-1 hover:text-primary">
                    <Phone className="w-3 h-3" />
                    {COMPANY_INFO.phone}
                  </a>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 flex flex-col">
      <CompanyHeader />
      <QuoteSummaryBar quoteData={quoteData} showPricing={showPricing} />
      
      <div className="flex-1 flex flex-col">
        <div className="max-w-7xl mx-auto w-full px-4 py-4">
          <StepIndicator currentStep={currentStep} isComplete={false} />
        </div>

        {currentStep === 'review' && (
          <>
            <div className={cn(
              "flex-1 bg-slate-200 dark:bg-slate-800 relative",
              isFullscreen && "fixed inset-0 z-50"
            )}>
              <div className="absolute top-2 right-2 z-10 flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsFullscreen(!isFullscreen)}
                  className="shadow-lg"
                  data-testid="button-toggle-fullscreen"
                >
                  {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </Button>
              </div>
              
              {isGeneratingPdf ? (
                <div className="flex items-center justify-center h-full min-h-[70vh]">
                  <LoadingSpinner text="Generating document preview..." />
                </div>
              ) : pdfUrl ? (
                <iframe
                  src={pdfUrl}
                  className={cn(
                    "w-full border-0",
                    isFullscreen ? "h-full" : "h-[calc(100vh-280px)] min-h-[500px]"
                  )}
                  data-testid="pdf-preview"
                  title="Document Preview"
                />
              ) : (
                <div className="flex items-center justify-center h-full min-h-[70vh]">
                  <Alert className="max-w-md">
                    <AlertDescription>
                      Document preview not available. Please try refreshing the page.
                    </AlertDescription>
                  </Alert>
                </div>
              )}
            </div>

            {!isFullscreen && (
              <div className="bg-white dark:bg-slate-800 border-t shadow-lg sticky bottom-0">
                <div className="max-w-7xl mx-auto px-4 py-4">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <Shield className="w-4 h-4 text-emerald-500" />
                      <span>Your signature is legally binding and encrypted</span>
                    </div>
                    
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                      <Button
                        variant="outline"
                        onClick={handleDownloadPreview}
                        disabled={!pdfUrl || isGeneratingPdf}
                        data-testid="button-download-preview"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download
                      </Button>
                      <Button 
                        onClick={handleProceedToSign}
                        size="lg"
                        disabled={isGeneratingPdf}
                        className="flex-1 sm:flex-none min-w-[200px]"
                        data-testid="button-proceed-to-sign"
                      >
                        Continue to Sign
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {currentStep === 'sign' && (
          <div className="flex-1 max-w-4xl mx-auto w-full px-4 py-6">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              <div className="lg:col-span-2">
                <Card className="shadow-lg h-full">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Eye className="w-5 h-5" />
                      Document Preview
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-2">
                    {pdfUrl ? (
                      <iframe
                        src={pdfUrl}
                        className="w-full h-[400px] border rounded-lg"
                        data-testid="pdf-preview-sign"
                        title="Document Preview"
                      />
                    ) : (
                      <div className="h-[400px] bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center">
                        <LoadingSpinner text="Loading..." />
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="lg:col-span-3 space-y-4">
                <Card className="shadow-lg">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <PenLine className="w-5 h-5" />
                      Your Signature
                    </CardTitle>
                    <CardDescription>
                      Draw or type your signature below
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <SignatureCanvas
                      onSignatureChange={setSignature}
                      signerName=""
                    />
                  </CardContent>
                </Card>

                <Card className="shadow-lg border-primary/20">
                  <CardContent className="py-4 space-y-4">
                    <div className="flex items-start gap-3">
                      <Checkbox 
                        id="agree-terms" 
                        checked={hasAgreed}
                        onCheckedChange={(checked) => setHasAgreed(checked === true)}
                        data-testid="checkbox-agree-terms"
                      />
                      <Label htmlFor="agree-terms" className="text-sm leading-relaxed cursor-pointer">
                        I confirm that I have reviewed this document and agree to be legally bound by its terms. I understand that my electronic signature carries the same legal weight as a handwritten signature.
                      </Label>
                    </div>

                    {signature && hasAgreed && (
                      <Alert className="bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800">
                        <CheckCircle className="w-4 h-4 text-emerald-600" />
                        <AlertDescription className="text-emerald-800 dark:text-emerald-200">
                          Ready to submit! Click "Sign Document" to complete.
                        </AlertDescription>
                      </Alert>
                    )}

                    <div className="flex gap-3 pt-2">
                      <Button 
                        variant="outline" 
                        onClick={() => setCurrentStep('review')}
                        data-testid="button-back-to-review"
                      >
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back
                      </Button>
                      <Button
                        onClick={handleSign}
                        disabled={!canSign}
                        className="flex-1"
                        size="lg"
                        data-testid="button-submit-signature"
                      >
                        {signMutation.isPending ? (
                          <>
                            <LoadingSpinner className="w-4 h-4 mr-2" />
                            Signing...
                          </>
                        ) : (
                          <>
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Sign Document
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
