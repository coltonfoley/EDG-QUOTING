import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle, Clock, Download, Eye, FileText, Mail, MapPin, PenLine, Phone, Shield } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/loading-spinner";
import { SignatureCanvas, type SignatureData } from "@/components/signature-canvas";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  downloadPlanningAgreementPDF,
  generatePlanningAgreementPDF,
  type PlanningAgreementPublicData,
} from "@/lib/generate-planning-agreement-pdf";
import edgLogoPath from "@assets/Logo_Full_Color_Black_1766097629382.png";

type SigningStep = "review" | "sign" | "complete";

const COMPANY_INFO = {
  name: "EDG Patio & Shade",
  phone: "+1 (815) 581-0138",
  email: "info@edgpatioshade.com",
};

function money(value: string | number) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed)
    ? parsed.toLocaleString("en-US", { style: "currency", currency: "USD" })
    : "$0.00";
}

function CompanyHeader() {
  return (
    <div className="bg-edg-black text-edg-white border-b-4 border-edg-brand-teal py-3 px-6 shadow-lg">
      <div className="max-w-7xl mx-auto flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <img
            src={edgLogoPath}
            alt="EDG Patio & Shade"
            className="h-10 w-auto brightness-0 invert"
          />
          <div className="hidden sm:block border-l border-edg-brand-teal/40 pl-4">
            <p className="text-edg-brand-teal text-xs font-semibold uppercase tracking-wide">Design + Planning Agreement</p>
            <p className="text-edg-white/70 text-xs">EDG Patio & Shade</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-edg-white/70">
          <Shield className="w-3.5 h-3.5 text-edg-brand-teal" />
          <span>Secure agreement link</span>
        </div>
      </div>
    </div>
  );
}

function StepIndicator({ currentStep, isComplete }: { currentStep: SigningStep; isComplete: boolean }) {
  const steps = [
    { id: "review", label: "Review", icon: Eye },
    { id: "sign", label: "Sign", icon: PenLine },
    { id: "complete", label: "Complete", icon: CheckCircle },
  ] as const;
  const order = steps.map((step) => step.id);
  const currentIndex = order.indexOf(currentStep);

  return (
    <div className="flex items-center justify-center gap-2 sm:gap-4 py-4">
      {steps.map((step, index) => {
        const Icon = step.icon;
        const status = isComplete || index < currentIndex
          ? "complete"
          : index === currentIndex
            ? "current"
            : "upcoming";

        return (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center transition-all",
                status === "complete" && "bg-edg-teal text-white",
                status === "current" && "bg-edg-black text-white ring-4 ring-edg-brand-teal/30",
                status === "upcoming" && "bg-edg-light-grey text-edg-grey",
              )}>
                <Icon className="w-5 h-5" />
              </div>
              <span className={cn(
                "text-xs mt-1 font-medium",
                status === "complete" && "text-edg-teal",
                status === "current" && "text-edg-black",
                status === "upcoming" && "text-edg-grey",
              )}>
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div className={cn(
                "w-8 sm:w-16 h-0.5 mx-2",
                index < currentIndex || isComplete ? "bg-edg-teal" : "bg-edg-light-grey",
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function AgreementSummaryBar({ agreement }: { agreement: PlanningAgreementPublicData }) {
  return (
    <div className="bg-white border-b border-edg-teal/20 shadow-sm sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-edg-light-teal">
              <FileText className="w-5 h-5 text-edg-teal" />
            </div>
            <div>
              <h2 className="font-semibold text-lg leading-tight text-edg-black">
                {agreement.projectName || agreement.quoteNumber || agreement.agreementNumber}
              </h2>
              <div className="flex flex-wrap items-center gap-2 text-sm text-edg-grey">
                <span>{agreement.accountName}</span>
                {agreement.jobsiteAddress && (
                  <>
                    <span className="hidden sm:inline">|</span>
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {agreement.jobsiteAddress}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="bg-edg-light-grey text-edg-black">
              {agreement.tierLabel || "Design + Planning"}
            </Badge>
            <Badge variant="default" className="bg-edg-teal text-white hover:bg-edg-dark-teal">
              {money(agreement.amount)}
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
}

function AgreementDocumentPreview({ agreement, compact = false }: { agreement: PlanningAgreementPublicData; compact?: boolean }) {
  const company = agreement.company || {
    name: "EDG Patio & Shade",
    address: "1802 Holian Drive, Spring Grove, IL 60081",
    phone: "+1 (815) 581-0138",
    email: "info@edgpatioshade.com",
  };

  return (
    <div className={cn(
      "mx-auto bg-white text-edg-black shadow-sm border border-edg-teal/10",
      compact ? "max-h-[400px] overflow-y-auto rounded-lg" : "max-w-4xl rounded-md",
    )}>
      <div className="bg-edg-black text-white border-b-4 border-edg-brand-teal px-6 py-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xl font-semibold">{company.name}</p>
            <p className="mt-1 text-xs text-white/70">{company.address}</p>
            <p className="text-xs text-white/70">{company.phone} | {company.email}</p>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-sm font-semibold text-edg-brand-teal">Design + Planning Agreement</p>
            <p className="mt-1 font-mono text-sm text-white/80">{agreement.agreementNumber}</p>
          </div>
        </div>
      </div>
      <div className={cn("space-y-6", compact ? "p-4" : "p-6 sm:p-8")}>
        <div>
          <h2 className={cn("font-semibold tracking-tight", compact ? "text-xl" : "text-2xl")}>
            {agreement.projectName || agreement.quoteNumber || "Design + Planning Services"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-edg-grey">
            This agreement documents paid pre-construction design and planning work before final proposal approval,
            construction authorization, permitting, engineering, fabrication, or installation release.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-edg-teal/10 bg-edg-light-grey px-4 py-3">
            <p className="text-xs uppercase text-edg-grey">Customer</p>
            <p className="mt-1 font-medium">{agreement.accountName}</p>
          </div>
          <div className="rounded-md border border-edg-teal/10 bg-edg-light-grey px-4 py-3">
            <p className="text-xs uppercase text-edg-grey">Fee</p>
            <p className="mt-1 font-semibold text-edg-teal">{money(agreement.amount)}</p>
          </div>
          <div className="rounded-md border border-edg-teal/10 bg-edg-light-grey px-4 py-3">
            <p className="text-xs uppercase text-edg-grey">Planning Tier</p>
            <p className="mt-1 font-medium">{agreement.tierLabel || "Design + Planning"}</p>
          </div>
          <div className="rounded-md border border-edg-teal/10 bg-edg-light-grey px-4 py-3">
            <p className="text-xs uppercase text-edg-grey">Credit</p>
            <p className="mt-1 font-medium">
              {agreement.creditEligible
                ? `Eligible${agreement.creditExpiresAt ? ` until ${new Date(agreement.creditExpiresAt).toLocaleDateString()}` : ""}`
                : "Not credit eligible"}
            </p>
          </div>
        </div>

        {agreement.scopeSummary && (
          <section>
            <h3 className="text-sm font-semibold uppercase text-edg-teal">Planning Scope</h3>
            <p className="mt-2 text-sm leading-6 text-edg-black">{agreement.scopeSummary}</p>
          </section>
        )}

        <section>
          <h3 className="text-sm font-semibold uppercase text-edg-teal">Terms</h3>
          <ol className="mt-3 space-y-3 text-sm leading-6">
            {agreement.terms.map((term, index) => (
              <li key={`${index}-${term.slice(0, 20)}`} className="flex gap-3">
                <span className="font-semibold text-edg-teal">{index + 1}.</span>
                <span>{term}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="rounded-md border border-edg-teal/20 p-4">
          <h3 className="text-sm font-semibold uppercase text-edg-teal">Signature</h3>
          {agreement.customerSignatureData ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase text-edg-grey">Signed By</p>
                <p className="font-medium">{agreement.customerSignatureData.name}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-edg-grey">Signed On</p>
                <p className="font-medium">{agreement.customerSignedAt ? new Date(agreement.customerSignedAt).toLocaleString() : "Recorded"}</p>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-edg-grey">Customer signature will be recorded after signing.</p>
          )}
        </section>
      </div>
    </div>
  );
}

export default function PublicPlanningAgreementSignPage() {
  const params = useParams();
  const token = params.token as string;
  const [signature, setSignature] = useState<SignatureData | null>(null);
  const [hasAgreed, setHasAgreed] = useState(false);
  const [currentStep, setCurrentStep] = useState<SigningStep>("review");
  const [signedTimestamp, setSignedTimestamp] = useState<Date | null>(null);
  const [emailWasSent, setEmailWasSent] = useState(false);
  const { toast } = useToast();

  const { data: agreement, isLoading, error } = useQuery<PlanningAgreementPublicData>({
    queryKey: ["/api/planning-agreement-signatures", token, "full"],
    queryFn: async () => {
      const res = await fetch(`/api/planning-agreement-signatures/${token}/full`, {
        credentials: "include",
      });
      if (!res.ok) {
        let message = "This agreement link may have expired or been revoked. Please contact EDG for a current link.";
        try {
          const body = await res.json();
          message = body.message || message;
        } catch {
          // Keep default message.
        }
        throw new Error(message);
      }
      return res.json();
    },
    enabled: Boolean(token),
  });

  useEffect(() => {
    if (agreement?.customerSignedAt) {
      setCurrentStep("complete");
      setSignedTimestamp(new Date(agreement.customerSignedAt));
    }
  }, [agreement?.customerSignedAt]);

  const signMutation = useMutation({
    mutationFn: async (signatureData: SignatureData) => {
      const response = await apiRequest("POST", `/api/planning-agreement-signatures/${token}/sign`, {
        signatureData,
        signerType: "client",
      });
      return response.json();
    },
    onSuccess: (data: { success: boolean; emailSent?: boolean }) => {
      setSignedTimestamp(new Date());
      setCurrentStep("complete");
      setEmailWasSent(data.emailSent ?? false);
      toast({
        title: "Agreement signed",
        description: "Your signature has been recorded.",
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/planning-agreement-signatures", token, "full"],
      });
    },
    onError: (mutationError: any) => {
      toast({
        title: "Signature failed",
        description: mutationError.message || "Could not submit the agreement signature.",
        variant: "destructive",
      });
    },
  });

  const downloadPdfMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("GET", `/api/planning-agreement-signatures/${token}/full`);
      const latestAgreement: PlanningAgreementPublicData = await response.json();
      const blob = await generatePlanningAgreementPDF(latestAgreement);
      downloadPlanningAgreementPDF(blob, latestAgreement);
    },
    onSuccess: () => {
      toast({
        title: "PDF downloaded",
        description: "The agreement PDF has been downloaded.",
      });
    },
    onError: (downloadError: any) => {
      toast({
        title: "Download failed",
        description: downloadError.message || "Could not download the agreement PDF.",
        variant: "destructive",
      });
    },
  });

  const handleDownloadPreview = async () => {
    if (!agreement) return;
    const blob = await generatePlanningAgreementPDF(agreement);
    downloadPlanningAgreementPDF(blob, agreement);
  };

  const handleSign = () => {
    if (!signature) {
      toast({
        title: "Signature required",
        description: "Provide your signature before submitting.",
        variant: "destructive",
      });
      return;
    }

    if (!hasAgreed) {
      toast({
        title: "Agreement required",
        description: "Confirm that you agree to the agreement terms.",
        variant: "destructive",
      });
      return;
    }

    signMutation.mutate(signature);
  };

  const isAlreadySigned = Boolean(agreement?.customerSignedAt);
  const canSign = Boolean(signature && hasAgreed && !isAlreadySigned && !signMutation.isPending);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-edg-light-grey">
        <CompanyHeader />
        <div className="flex items-center justify-center py-32">
          <LoadingSpinner text="Loading agreement..." />
        </div>
      </div>
    );
  }

  if (error || !agreement) {
    const errorMessage = error instanceof Error
      ? error.message
      : "This agreement link may have expired or been revoked. Please contact EDG for a current link.";

    return (
      <div className="min-h-screen bg-edg-light-grey">
        <CompanyHeader />
        <div className="flex items-center justify-center py-16 px-4">
          <Card className="max-w-md w-full shadow-lg">
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
                <AlertCircle className="w-8 h-8 text-red-600" />
              </div>
              <CardTitle className="text-xl">Invalid Agreement Link</CardTitle>
              <CardDescription>This link is no longer valid</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert variant="destructive">
                <AlertDescription>{errorMessage}</AlertDescription>
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

  if (currentStep === "complete") {
    return (
      <div className="min-h-screen bg-edg-light-grey">
        <CompanyHeader />
        <div className="max-w-2xl mx-auto px-4 py-8">
          <StepIndicator currentStep="complete" isComplete />
          <Card className="shadow-lg mt-8 border-edg-teal/20">
            <CardContent className="pt-8 text-center">
              <div className="mx-auto w-20 h-20 rounded-full bg-edg-light-teal flex items-center justify-center mb-6 ring-8 ring-edg-brand-teal/20">
                <CheckCircle className="w-10 h-10 text-edg-teal" />
              </div>
              <h2 className="text-2xl font-bold text-edg-black mb-2">Agreement Signed</h2>
              <p className="text-edg-grey mb-6">
                EDG has recorded your Design + Planning Agreement signature.
              </p>
              <div className="bg-edg-light-grey rounded-lg border border-edg-teal/10 p-4 mb-6 text-left">
                <h3 className="font-semibold text-sm text-edg-teal uppercase tracking-wide mb-3">Signature receipt</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Agreement</span>
                    <span className="font-medium text-right">{agreement.agreementNumber}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Fee</span>
                    <span className="font-medium">{money(agreement.amount)}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Signed On</span>
                    <span className="font-medium flex items-center gap-1 text-right">
                      <Clock className="w-3 h-3" />
                      {(signedTimestamp || new Date(agreement.customerSignedAt || Date.now())).toLocaleString()}
                    </span>
                  </div>
                </div>
                {agreement.signatureAuditTrail?.documentFingerprint && (
                  <div className="mt-3 rounded-md bg-white p-3 text-xs text-edg-grey">
                    Document ID: <span className="font-mono">{agreement.signatureAuditTrail.documentFingerprint.slice(0, 16)}</span>
                  </div>
                )}
              </div>
              <Button
                onClick={() => downloadPdfMutation.mutate()}
                disabled={downloadPdfMutation.isPending}
                size="lg"
                className="w-full bg-edg-teal text-white hover:bg-edg-dark-teal"
                data-testid="button-download-signed-planning-agreement"
              >
                <Download className="w-4 h-4 mr-2" />
                {downloadPdfMutation.isPending ? "Generating PDF..." : "Download Signed Agreement"}
              </Button>
              <p className="mt-3 text-xs text-edg-grey">
                {emailWasSent ? "A confirmation email has also been sent." : "Download a copy for your records."}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-edg-light-grey flex flex-col">
      <CompanyHeader />
      <AgreementSummaryBar agreement={agreement} />
      <div className="max-w-7xl mx-auto w-full px-4 py-4">
        <StepIndicator currentStep={currentStep} isComplete={false} />
      </div>

      {currentStep === "review" && (
        <>
          <div className="max-w-7xl mx-auto w-full px-4 pb-4">
            <div className="rounded-lg border border-edg-teal/20 bg-white shadow-sm p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-2">
                  <Badge variant="outline" className="w-fit border-edg-teal/30 bg-edg-light-teal text-edg-dark-teal">
                    {agreement.agreementNumber}
                  </Badge>
                  <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-edg-black">
                    Review Design + Planning Agreement
                  </h1>
                  <p className="text-sm text-edg-grey max-w-2xl">
                    This is for pre-construction design and planning work only. It does not authorize construction, fabrication, permits, engineering, or installation.
                  </p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                  <div className="rounded-md border border-edg-teal/10 bg-edg-light-grey px-3 py-2">
                    <div className="text-edg-grey">Customer</div>
                    <div className="font-medium truncate max-w-[150px]">{agreement.accountName}</div>
                  </div>
                  <div className="rounded-md border border-edg-teal/10 bg-edg-light-grey px-3 py-2">
                    <div className="text-edg-grey">Tier</div>
                    <div className="font-medium">{agreement.tierLabel || "Planning"}</div>
                  </div>
                  <div className="rounded-md border border-edg-teal/10 bg-edg-light-grey px-3 py-2 col-span-2 sm:col-span-1">
                    <div className="text-edg-grey">Fee</div>
                    <div className="font-semibold text-edg-teal">{money(agreement.amount)}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 bg-edg-black/10 px-4 py-6">
            <AgreementDocumentPreview agreement={agreement} />
          </div>

          <div className="bg-white border-t border-edg-teal/20 shadow-lg sticky bottom-0">
            <div className="max-w-7xl mx-auto px-4 py-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3 text-sm text-edg-grey">
                  <Shield className="w-4 h-4 text-edg-teal" />
                  <span>Review the agreement before signing.</span>
                </div>
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <Button
                    variant="outline"
                    onClick={handleDownloadPreview}
                    className="border-edg-teal/30 text-edg-teal hover:bg-edg-light-teal hover:text-edg-dark-teal"
                    data-testid="button-download-planning-agreement-preview"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </Button>
                  <Button
                    onClick={() => setCurrentStep("sign")}
                    size="lg"
                    className="flex-1 sm:flex-none min-w-[190px] bg-edg-teal text-white hover:bg-edg-dark-teal"
                    data-testid="button-proceed-to-sign-planning-agreement"
                  >
                    Sign Agreement
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {currentStep === "sign" && (
        <div className="flex-1 max-w-4xl mx-auto w-full px-4 py-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <Card className="shadow-lg h-full border-edg-teal/20">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg text-edg-black">
                    <Eye className="w-5 h-5 text-edg-teal" />
                    Agreement Preview
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-2">
                  <AgreementDocumentPreview agreement={agreement} compact />
                </CardContent>
              </Card>
            </div>
            <div className="lg:col-span-3 space-y-4">
              <Card className="shadow-lg border-edg-teal/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-edg-black">
                    <PenLine className="w-5 h-5 text-edg-teal" />
                    Your Signature
                  </CardTitle>
                  <CardDescription className="text-edg-grey">
                    Type your legal name and sign to accept this agreement.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <SignatureCanvas onSignatureChange={setSignature} signerName="" />
                </CardContent>
              </Card>
              <Card className="shadow-lg border-edg-teal/20">
                <CardContent className="py-4 space-y-4">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="agree-planning-terms"
                      checked={hasAgreed}
                      onCheckedChange={(checked) => setHasAgreed(checked === true)}
                      data-testid="checkbox-agree-planning-terms"
                    />
                    <Label htmlFor="agree-planning-terms" className="text-sm leading-relaxed cursor-pointer text-edg-black">
                      I confirm that I have reviewed this Design + Planning Agreement and agree to be legally bound by its terms. I understand that my electronic signature carries the same legal weight as a handwritten signature.
                    </Label>
                  </div>
                  {signature && hasAgreed && (
                    <Alert className="bg-edg-light-teal border-edg-teal/20">
                      <CheckCircle className="w-4 h-4 text-edg-teal" />
                      <AlertDescription className="text-edg-dark-teal">
                        Ready to sign. Click "Submit Signature" to complete.
                      </AlertDescription>
                    </Alert>
                  )}
                  <div className="flex gap-3 pt-2">
                    <Button
                      variant="outline"
                      onClick={() => setCurrentStep("review")}
                      className="border-edg-teal/30 text-edg-teal hover:bg-edg-light-teal hover:text-edg-dark-teal"
                      data-testid="button-back-to-planning-review"
                    >
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      Back
                    </Button>
                    <Button
                      onClick={handleSign}
                      disabled={!canSign}
                      className="flex-1 bg-edg-teal text-white hover:bg-edg-dark-teal"
                      size="lg"
                      data-testid="button-submit-planning-agreement-signature"
                    >
                      {signMutation.isPending ? (
                        <>
                          <LoadingSpinner className="w-4 h-4 mr-2" />
                          Signing...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Submit Signature
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
  );
}
