import { useState, useEffect, useRef, type SyntheticEvent } from 'react';
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
import { usePublicLightTheme } from '@/hooks/use-public-light-theme';
import { ORDER_APPROVAL_SIGNATURE_CONSENT } from '@shared/approvalDrawing';
import { generateSignedPDF, downloadSignedPDF } from '@/lib/generate-signed-pdf';
import { QuoteApprovalDrawingPreview } from '@/components/quote-approval-drawing-preview';
import type { QuoteWithDetails } from '@shared/schema';
import { cn } from '@/lib/utils';
import edgLogoPath from '@assets/Logo_Full_Color_Black_1766097629382.png';

interface SigningQuoteData {
  customerPackageVersion?: number;
  customerPackageFingerprint?: string | null;
  documentRevision?: string | null;
  packageIssues?: Array<{ code: string; message: string }>;
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
  signedDocumentSnapshot?: any;
  signatureAuditTrail?: {
    documentFingerprint?: string;
    entries?: Array<{
      signerName?: string;
      signedAt?: string;
      documentFingerprint?: string;
    }>;
  } | null;
  approvalDrawing?: {
    id?: number;
    status?: string | null;
    title?: string | null;
    manufacturer?: string | null;
    productSystem?: string | null;
    revisionLabel?: string | null;
    drawingData?: unknown;
    customerNotes?: string | null;
    disclaimer?: string | null;
    readyAt?: string | null;
    sentForSignatureAt?: string | null;
    signedLockedAt?: string | null;
  } | null;
  esigIncludePricing?: boolean;
  esigIncludeImages?: boolean;
  esigIncludeContract?: boolean;
  esigIncludeApprovalDrawing?: boolean;
  groups?: Array<{ id: string; title: string; position: number }>;
  productRenderings?: Array<{
    id: number;
    storageUrl: string;
    filename: string;
    originalName: string;
    mimeType: string;
    displayOrder?: number | null;
  }>;
  coverPhoto?: {
    id: number;
    storageUrl: string;
    filename: string;
    originalName: string;
    mimeType: string;
  };
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
                status === 'complete' && "bg-edg-teal text-white",
                status === 'current' && "bg-edg-black text-white ring-4 ring-edg-brand-teal/30",
                status === 'upcoming' && "bg-edg-light-grey text-edg-grey"
              )}>
                <Icon className="w-5 h-5" />
              </div>
              <span className={cn(
                "text-xs mt-1 font-medium",
                status === 'complete' && "text-edg-teal",
                status === 'current' && "text-edg-black",
                status === 'upcoming' && "text-edg-grey"
              )}>
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div className={cn(
                "w-8 sm:w-16 h-0.5 mx-2",
                getStepStatus(steps[index + 1].id) !== 'upcoming' ? "bg-edg-teal" : "bg-edg-light-grey"
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ProposalPreviewFallback({
  quoteData,
  pdfPreviewError,
  isGeneratingPdf,
  onRetry,
}: {
  quoteData: SigningQuoteData;
  pdfPreviewError: string | null;
  isGeneratingPdf: boolean;
  onRetry: () => void;
}) {
  const hasIncludedApprovalDrawing = Boolean(quoteData.esigIncludeApprovalDrawing && quoteData.approvalDrawing);

  return (
    <div className="h-full min-h-[500px] overflow-auto bg-white p-5">
      <div className="mx-auto max-w-4xl space-y-5">
        <Alert className="border-amber-200 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-700" />
          <AlertDescription className="text-amber-900">
            The PDF preview is not available right now, but the approval details below are available for review before signing.
          </AlertDescription>
        </Alert>

        {hasIncludedApprovalDrawing ? (
          <section className="space-y-3">
            <div>
              <Badge variant="outline" className="border-edg-teal/30 bg-edg-light-teal text-edg-dark-teal">Order Approval Drawing</Badge>
              <h2 className="mt-2 text-2xl font-semibold text-edg-black">
                Review the ordering layout
              </h2>
              <p className="mt-1 text-sm text-edg-grey">
                This is the layout, dimensions, colors, and selected options EDG will use for order release. It is not a permit, engineering, sealed, or manufacturer shop drawing.
              </p>
            </div>
            <QuoteApprovalDrawingPreview drawingData={quoteData.approvalDrawing?.drawingData} />
            {quoteData.approvalDrawing?.customerNotes && (
              <div className="rounded-md border border-edg-teal/10 bg-edg-light-grey p-4 text-sm">
                <div className="font-semibold text-edg-black">Customer notes / exclusions</div>
                <p className="mt-1 text-edg-grey">{quoteData.approvalDrawing?.customerNotes}</p>
              </div>
            )}
          </section>
        ) : (
          <section className="rounded-md border border-edg-teal/10 bg-edg-light-grey p-4">
            <h2 className="text-lg font-semibold text-edg-black">Proposal Summary</h2>
            <p className="mt-1 text-sm text-edg-grey">
              Review the quote information above before approving.
            </p>
          </section>
        )}

        {pdfPreviewError && (
          <Button variant="outline" onClick={onRetry} disabled={isGeneratingPdf}>
            Try PDF Preview Again
          </Button>
        )}
      </div>
    </div>
  );
}

function CompanyHeader() {
  return (
    <div className="bg-edg-black text-edg-white border-b-4 border-edg-brand-teal py-3 px-6 shadow-lg">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <img 
            src={edgLogoPath} 
            alt="EDG Patio & Shade" 
            className="h-10 w-auto brightness-0 invert"
          />
          <div className="hidden sm:block border-l border-edg-brand-teal/40 pl-4">
            <p className="text-edg-brand-teal text-xs font-semibold uppercase tracking-wide">Proposal Approval</p>
            <p className="text-edg-white/70 text-xs">EDG Patio & Shade</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-edg-white/70">
          <Shield className="w-3.5 h-3.5 text-edg-brand-teal" />
          <span>Secure review link</span>
        </div>
      </div>
    </div>
  );
}

function QuoteSummaryBar({ quoteData, showPricing }: { quoteData: SigningQuoteData; showPricing: boolean }) {
  const totals = calculateQuoteTotals(quoteData);
  
  return (
    <div className="bg-white border-b border-edg-teal/20 shadow-sm sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-edg-light-teal">
              <FileText className="w-5 h-5 text-edg-teal" />
            </div>
            <div>
              <h2 className="font-semibold text-lg leading-tight text-edg-black">
                {quoteData.projectName || `Quote #${quoteData.quoteNumber}`}
              </h2>
              <div className="flex flex-wrap items-center gap-2 text-sm text-edg-grey">
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
              <Badge variant="secondary" className="flex items-center gap-1 bg-edg-light-grey text-edg-black">
                <Package className="w-3 h-3" />
                {totals.itemCount} items
              </Badge>
              {showPricing && (
                <Badge variant="default" className="flex items-center gap-1 bg-edg-teal text-white hover:bg-edg-dark-teal">
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
  usePublicLightTheme();
  const params = useParams();
  const token = params.token as string;
  const [signature, setSignature] = useState<SignatureData | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfPreviewError, setPdfPreviewError] = useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [currentStep, setCurrentStep] = useState<SigningStep>('review');
  const [hasAgreed, setHasAgreed] = useState(false);
  const [signedTimestamp, setSignedTimestamp] = useState<Date | null>(null);
  const [emailWasSent, setEmailWasSent] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [focusedPreview, setFocusedPreview] = useState<"review" | "sign" | null>(null);
  const signHeadingRef = useRef<HTMLHeadingElement>(null);
  const { toast } = useToast();

  const { data: quoteData, isLoading, error } = useQuery<SigningQuoteData>({
    queryKey: ['/api/signatures', token, 'full'],
    queryFn: async () => {
      const res = await fetch(`/api/signatures/${token}/full`, {
        credentials: 'include'
      });
      if (!res.ok) {
        let message = 'This signing link may have expired or been revoked. Please contact the sender for a new link.';
        try {
          const body = await res.json();
          message = body.message || message;
        } catch {
          // Keep the default message when the server does not return JSON.
        }
        throw new Error(message);
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
    if (currentStep === 'sign') {
      const focusFrame = window.requestAnimationFrame(() => signHeadingRef.current?.focus());
      return () => window.cancelAnimationFrame(focusFrame);
    }
  }, [currentStep]);

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
    setPdfPreviewError(null);
    try {
      const showPricing = quoteData.esigIncludePricing ?? true;
      const includeImages = quoteData.esigIncludeImages ?? false;
      const includeContract = quoteData.esigIncludeContract ?? true;
      const blob = await generateSignedPDF({
        quote: quoteData as unknown as QuoteWithDetails,
        includeImages,
        includePricing: showPricing,
        includeContract,
        includeApprovalDrawing: quoteData.esigIncludeApprovalDrawing === true,
        groups: quoteData.groups || [],
      });
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
    } catch (error) {
      setPdfPreviewError(error instanceof Error ? error.message : 'Document preview could not be generated.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const signMutation = useMutation({
    mutationFn: async (signatureData: SignatureData) => {
      const response = await apiRequest('POST', `/api/signatures/${token}/sign`, { 
        signatureData,
        signerType: 'client',
        documentRevision: quoteData?.documentRevision ?? null,
        customerPackageFingerprint: quoteData?.customerPackageFingerprint,
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
      
      const groups = fullQuote.groups || [];
      
      const includeImages = fullQuote.esigIncludeImages ?? false;
      const includePricing = fullQuote.esigIncludePricing ?? true;
      const includeContract = fullQuote.esigIncludeContract ?? true;
      const includeApprovalDrawing = fullQuote.esigIncludeApprovalDrawing === true;
      
      const pdfBlob = await generateSignedPDF({ 
        quote: fullQuote, 
        includeImages,
        includePricing,
        includeContract,
        includeApprovalDrawing,
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
    if ((quoteData?.packageIssues?.length || 0) > 0) {
      toast({
        title: 'Proposal needs attention',
        description: 'EDG must resolve the package items shown above before this proposal can be approved.',
        variant: 'destructive',
      });
      return;
    }
    setCurrentStep('sign');
  };

  const handleSignPreviewLoad = (event: SyntheticEvent<HTMLIFrameElement>) => {
    if (currentStep !== 'sign') return;
    const previewFrame = event.currentTarget;
    window.requestAnimationFrame(() => {
      if (document.activeElement === document.body || document.activeElement === previewFrame) {
        signHeadingRef.current?.focus();
      }
    });
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
  const hasPackageIssues = (quoteData?.packageIssues?.length || 0) > 0;
  const canSign = signature && hasAgreed && !hasPackageIssues && !isAlreadySigned && !signMutation.isPending;
  const showPricing = quoteData?.esigIncludePricing ?? true;
  const hasApprovalDrawing = Boolean(quoteData?.esigIncludeApprovalDrawing && quoteData?.approvalDrawing);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-edg-light-grey">
        <CompanyHeader />
        <div className="flex items-center justify-center py-32">
          <LoadingSpinner text="Loading document..." />
        </div>
      </div>
    );
  }

  if (error || !quoteData) {
    const errorMessage = error instanceof Error
      ? error.message
      : 'This signing link may have expired or been revoked. Please contact the sender for a new link.';

    return (
      <div className="min-h-screen bg-edg-light-grey">
        <CompanyHeader />
        <div className="flex items-center justify-center py-16 px-4">
          <Card className="max-w-md w-full shadow-lg">
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
              <h1 className="text-xl font-semibold leading-none tracking-tight">Invalid Signing Link</h1>
              <CardDescription>
                This link is no longer valid
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert variant="destructive">
                <AlertDescription className="text-red-700">
                  {errorMessage}
                </AlertDescription>
              </Alert>
              <div className="pt-4 border-t text-center">
                <p className="text-sm text-muted-foreground mb-2">Need help?</p>
                <div className="flex flex-col gap-1 text-sm">
                  <a href={`mailto:${COMPANY_INFO.email}`} className="text-edg-teal hover:text-edg-dark-teal hover:underline flex items-center justify-center gap-1">
                    <Mail className="w-3 h-3" />
                    {COMPANY_INFO.email}
                  </a>
                  <a href={`tel:${COMPANY_INFO.phone}`} className="text-edg-teal hover:text-edg-dark-teal hover:underline flex items-center justify-center gap-1">
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
      <div className="min-h-screen bg-edg-light-grey">
        <CompanyHeader />
        <div className="max-w-2xl mx-auto px-4 py-8">
          <StepIndicator currentStep="complete" isComplete={true} />
          
          <Card className="shadow-lg mt-8 border-edg-teal/20">
            <CardContent className="pt-8 text-center">
              <div className="mx-auto w-20 h-20 rounded-full bg-edg-light-teal flex items-center justify-center mb-6 ring-8 ring-edg-brand-teal/20">
                <CheckCircle className="w-10 h-10 text-edg-teal" />
              </div>
              
              <h1 className="text-2xl font-bold text-edg-black mb-2">
                Proposal Approved
              </h1>
              <p className="text-edg-grey mb-6">
                Your approval has been recorded. EDG will use this signed proposal to move the project forward.
              </p>

              <div className="bg-edg-light-grey rounded-lg border border-edg-teal/10 p-4 mb-6 text-left">
                <h3 className="font-semibold text-sm text-edg-teal uppercase tracking-wide mb-3">Approval receipt</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Proposal</span>
                    <span className="font-medium">{quoteData.projectName || `Quote #${quoteData.quoteNumber}`}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">From</span>
                    <span className="font-medium">{COMPANY_INFO.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Approved On</span>
                    <span className="font-medium flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {(signedTimestamp || new Date(quoteData.clientSignedAt!)).toLocaleString()}
                    </span>
                  </div>
                  {hasApprovalDrawing && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Order Approval Drawing</span>
                      <span className="font-medium">Included</span>
                    </div>
                  )}
                </div>
                {quoteData.signatureAuditTrail?.documentFingerprint && (
                  <div className="mt-3 rounded-md bg-white p-3 text-xs text-edg-grey">
                    Document ID: <span className="font-mono">{quoteData.signatureAuditTrail.documentFingerprint.slice(0, 16)}</span>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <Button
                  onClick={() => downloadPdfMutation.mutate()}
                  disabled={downloadPdfMutation.isPending}
                  size="lg"
                  className="w-full bg-edg-teal text-white hover:bg-edg-dark-teal"
                  data-testid="button-download-signed-pdf"
                >
                  <Download className="w-4 h-4 mr-2" />
                  {downloadPdfMutation.isPending ? 'Generating PDF...' : 'Download Approved Proposal'}
                </Button>
                
                <p className="text-xs text-edg-grey">
                  {emailWasSent 
                    ? "A confirmation email has been sent to you with a link to download your signed document."
                    : "We recommend downloading a copy of your signed document for your records."
                  }
                </p>
              </div>

              <div className="mt-8 pt-6 border-t">
                <p className="text-sm text-edg-grey mb-4">
                  Thank you for your business!
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-edg-grey">
                  <a href={`mailto:${COMPANY_INFO.email}`} className="flex items-center gap-1 hover:text-edg-teal">
                    <Mail className="w-3 h-3" />
                    {COMPANY_INFO.email}
                  </a>
                  <a href={`tel:${COMPANY_INFO.phone}`} className="flex items-center gap-1 hover:text-edg-teal">
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
    <div className="min-h-screen bg-edg-light-grey flex flex-col">
      {currentStep === 'review' && !isFullscreen && (
        <a
          href="#approval-actions"
          data-testid="link-skip-to-approval-actions"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-white focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-edg-dark-teal focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-edg-teal focus:ring-offset-2"
        >
          Skip to approval actions
        </a>
      )}
      <CompanyHeader />
      <QuoteSummaryBar quoteData={quoteData} showPricing={showPricing} />
      
      <div className="flex-1 flex flex-col">
        <div className="max-w-7xl mx-auto w-full px-4 py-4">
          <StepIndicator currentStep={currentStep} isComplete={false} />
        </div>

        {currentStep === 'review' && (
          <>
            {!isFullscreen && (
              <div className="max-w-7xl mx-auto w-full px-4 pb-4">
                <div className="rounded-lg border border-edg-teal/20 bg-white shadow-sm p-5">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="space-y-2">
                      <Badge variant="outline" className="w-fit border-edg-teal/30 bg-edg-light-teal text-edg-dark-teal">Proposal approval</Badge>
                      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-edg-black">
                        Review {quoteData.projectName || `Quote #${quoteData.quoteNumber}`}
                      </h1>
                      <p className="text-sm text-edg-grey max-w-2xl">
                        Check the scope, pricing, visuals, and terms below. If something needs to change, contact EDG before approving.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                      <div className="rounded-md border border-edg-teal/10 bg-edg-light-grey px-3 py-2">
                        <div className="text-edg-grey">Customer</div>
                        <div className="font-medium truncate max-w-[150px]">{quoteData.accountName}</div>
                      </div>
                      <div className="rounded-md border border-edg-teal/10 bg-edg-light-grey px-3 py-2">
                        <div className="text-edg-grey">Items</div>
                        <div className="font-medium">{calculateQuoteTotals(quoteData).itemCount}</div>
                      </div>
                      {showPricing && (
                        <div className="rounded-md border border-edg-teal/10 bg-edg-light-grey px-3 py-2 col-span-2 sm:col-span-1">
                          <div className="text-edg-grey">Proposal total</div>
                          <div className="font-semibold text-edg-teal">
                            {calculateQuoteTotals(quoteData).total.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                {hasPackageIssues && (
                  <Alert variant="destructive" className="mt-4 bg-white" data-testid="customer-package-issues">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="text-red-700">
                      <div className="font-semibold">This proposal is not ready for approval.</div>
                      <ul className="mt-2 list-disc space-y-1 pl-5">
                        {quoteData.packageIssues?.map((issue) => (
                          <li key={issue.code}>{issue.message}</li>
                        ))}
                      </ul>
                      <div className="mt-2">Please contact EDG so the proposal package can be corrected.</div>
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}
            {!isFullscreen && hasApprovalDrawing && quoteData.approvalDrawing?.drawingData && (
              <div className="max-w-7xl mx-auto w-full px-4 pb-4">
                <section className="rounded-lg border border-edg-teal/20 bg-white p-3 shadow-sm sm:p-5">
                  <Badge variant="outline" className="w-fit border-edg-teal/30 bg-edg-light-teal text-edg-dark-teal">Order Approval Drawing</Badge>
                  <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.95fr)] lg:items-start">
                    <div>
                      <h2 className="text-xl font-semibold text-edg-black">Review the ordering layout</h2>
                      <p className="mt-2 text-sm leading-relaxed text-edg-grey">
                        Confirm the dimensions, colors, selected options, and layout EDG will use for order release. This is not a permit, engineering, sealed, or manufacturer shop drawing.
                      </p>
                      {quoteData.approvalDrawing?.customerNotes && (
                        <div className="mt-4 rounded-md border border-edg-teal/10 bg-edg-light-grey p-3 text-sm text-edg-grey">
                          <div className="font-semibold text-edg-black">Customer notes / exclusions</div>
                          <p className="mt-1">{quoteData.approvalDrawing?.customerNotes}</p>
                        </div>
                      )}
                    </div>
                    <QuoteApprovalDrawingPreview drawingData={quoteData.approvalDrawing?.drawingData} />
                  </div>
                </section>
              </div>
            )}
            <div className={cn(
              "flex-1 bg-edg-black/10 relative",
              isFullscreen && "fixed inset-0 z-50"
            )}>
              <div className="absolute top-2 right-2 z-10 flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsFullscreen(!isFullscreen)}
                  aria-label={isFullscreen ? "Exit fullscreen proposal view" : "Enter fullscreen proposal view"}
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
                    "w-full border-0 outline-none",
                    focusedPreview === "review" && "ring-2 ring-edg-teal ring-offset-2",
                    isFullscreen ? "h-full" : "h-[calc(100vh-280px)] min-h-[500px]"
                  )}
                  data-testid="pdf-preview"
                  title="Proposal Preview"
                  onFocus={() => setFocusedPreview("review")}
                  onBlur={() => setFocusedPreview(null)}
                />
              ) : (
                <ProposalPreviewFallback
                  quoteData={quoteData}
                  pdfPreviewError={pdfPreviewError}
                  isGeneratingPdf={isGeneratingPdf}
                  onRetry={generatePdfPreview}
                />
              )}
            </div>

            {!isFullscreen && (
              <div
                id="approval-actions"
                tabIndex={-1}
                className="bg-white border-t border-edg-teal/20 shadow-lg sticky bottom-0 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-edg-teal"
              >
                <div className="max-w-7xl mx-auto px-4 py-4">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3 text-sm text-edg-grey">
                      <Shield className="w-4 h-4 text-edg-teal" />
                      <span>Review the proposal, then approve when everything looks right.</span>
                    </div>
                    
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                      <Button
                        variant="outline"
                        onClick={handleDownloadPreview}
                        disabled={!pdfUrl || isGeneratingPdf}
                        className="border-edg-teal/30 text-edg-teal hover:bg-edg-light-teal hover:text-edg-dark-teal"
                        data-testid="button-download-preview"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download
                      </Button>
                      <Button 
                        onClick={handleProceedToSign}
                        size="lg"
                        disabled={isGeneratingPdf || hasPackageIssues}
                        className="flex-1 sm:flex-none min-w-[200px] bg-edg-teal text-white hover:bg-edg-dark-teal"
                        data-testid="button-proceed-to-sign"
                      >
                        Approve & Sign
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
                <Card className="shadow-lg h-full border-edg-teal/20">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg text-edg-black">
                      <Eye className="w-5 h-5 text-edg-teal" />
                      Proposal Preview
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-2">
                    {pdfUrl ? (
                      <iframe
                        src={pdfUrl}
                        className={cn(
                          "w-full h-[400px] border rounded-lg outline-none",
                          focusedPreview === "sign" && "ring-2 ring-edg-teal ring-offset-2",
                        )}
                        data-testid="pdf-preview-sign"
                        title="Proposal Preview"
                        onFocus={() => setFocusedPreview("sign")}
                        onBlur={() => setFocusedPreview(null)}
                        onLoad={handleSignPreviewLoad}
                      />
                    ) : (
                      <div className="h-[400px] overflow-auto rounded-lg border bg-edg-light-grey">
                        <ProposalPreviewFallback
                          quoteData={quoteData}
                          pdfPreviewError={pdfPreviewError}
                          isGeneratingPdf={isGeneratingPdf}
                          onRetry={generatePdfPreview}
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="lg:col-span-3 space-y-4">
                <Card className="shadow-lg border-edg-teal/20">
                  <CardHeader>
                    <h1
                      ref={signHeadingRef}
                      tabIndex={-1}
                      data-testid="heading-sign-approval"
                      className="flex items-center gap-2 text-2xl font-semibold leading-none tracking-tight text-edg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-edg-teal focus-visible:ring-offset-2"
                    >
                      <PenLine className="w-5 h-5 text-edg-teal" />
                      Your Approval
                    </h1>
                    <CardDescription className="text-edg-grey">
                      Type your legal name and sign to approve this proposal.
                    </CardDescription>
                    <a
                      href="#signature-form"
                      data-testid="link-skip-to-signature-form"
                      className="sr-only focus:not-sr-only focus:w-fit focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-edg-dark-teal focus:outline-none focus:ring-2 focus:ring-edg-teal focus:ring-offset-2"
                    >
                      Skip to signature form
                    </a>
                  </CardHeader>
                  <CardContent
                    id="signature-form"
                    tabIndex={-1}
                    className="space-y-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-edg-teal"
                  >
                    <SignatureCanvas
                      onSignatureChange={setSignature}
                      signerName=""
                    />
                  </CardContent>
                </Card>

                <Card className="shadow-lg border-edg-teal/20">
                  <CardContent className="py-4 space-y-4">
                    <div className="flex items-start gap-3">
                      <Checkbox 
                        id="agree-terms" 
                        checked={hasAgreed}
                        onCheckedChange={(checked) => setHasAgreed(checked === true)}
                        data-testid="checkbox-agree-terms"
                      />
                      <Label htmlFor="agree-terms" className="text-sm leading-relaxed cursor-pointer text-edg-black">
                        {hasApprovalDrawing
                          ? `${ORDER_APPROVAL_SIGNATURE_CONSENT} I understand that my electronic signature carries the same legal weight as a handwritten signature.`
                          : "I confirm that I have reviewed this proposal and agree to be legally bound by its terms. I understand that my electronic signature carries the same legal weight as a handwritten signature."}
                      </Label>
                    </div>

                    {signature && hasAgreed && (
                      <Alert className="bg-edg-light-teal border-edg-teal/20">
                        <CheckCircle className="w-4 h-4 text-edg-teal" />
                        <AlertDescription className="text-edg-dark-teal">
                          Ready to approve. Click "Approve Proposal" to complete.
                        </AlertDescription>
                      </Alert>
                    )}

                    <div className="flex gap-3 pt-2">
                      <Button
                        variant="outline"
                        onClick={() => setCurrentStep('review')}
                        className="border-edg-teal/30 text-edg-teal hover:bg-edg-light-teal hover:text-edg-dark-teal"
                        data-testid="button-back-to-review"
                      >
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back
                      </Button>
                      <Button
                        onClick={handleSign}
                        disabled={!canSign}
                        className="flex-1 bg-edg-teal text-white hover:bg-edg-dark-teal"
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
                            Approve Proposal
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
