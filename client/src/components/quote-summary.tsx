import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { FileText, Bookmark, Plus, Eye, Send, Mail, CheckCircle, AlertCircle, Clock, Link2, Copy, Download, PenTool, Package } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatCurrency, calculateQuoteTotals } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { QuoteWithDetails, ContractTemplate } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { SignatureCanvas, SignatureData } from "@/components/signature-canvas";
import { ESignatureOptionsModal } from "@/components/esignature-options-modal";

interface QuoteSummaryProps {
  quote: QuoteWithDetails;
  onUpdateQuote: (field: string, value: any) => void;
}

export function QuoteSummary({ quote, onUpdateQuote }: QuoteSummaryProps) {
  const [localTaxRate, setLocalTaxRate] = useState<string>("");
  const [localTariffRate, setLocalTariffRate] = useState<string>("");
  const [localDiscount, setLocalDiscount] = useState<string>("");
  const [localShipping, setLocalShipping] = useState<string>("");
  const [localNotes, setLocalNotes] = useState<string>("");
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [localCustomContractTerms, setLocalCustomContractTerms] = useState<string>("");
  const [showSigningLinkDialog, setShowSigningLinkDialog] = useState(false);
  const [signingLink, setSigningLink] = useState<string>("");
  const [personalizedMessage, setPersonalizedMessage] = useState<string>("");
  const [showCompanySignDialog, setShowCompanySignDialog] = useState(false);
  const [companySignature, setCompanySignature] = useState<SignatureData | null>(null);
  const [showESignatureOptionsModal, setShowESignatureOptionsModal] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Sync localNotes with quote.notes when not editing
  useEffect(() => {
    if (!isEditingNotes) {
      setLocalNotes(quote.notes || "");
    }
  }, [quote.notes, isEditingNotes]);

  // Fetch available contract templates
  const { data: contractTemplates = [] } = useQuery<ContractTemplate[]>({
    queryKey: ["/api/contract-templates"],
  });




  const updateContractMutation = useMutation({
    mutationFn: async (data: { contractTemplateId?: number | null; customContractTerms?: string | null }) => {
      const response = await apiRequest("PUT", `/api/quotes/${quote.id}`, data);
      return response.json();
    },
    onSuccess: (updatedQuote) => {
      toast({ title: "Contract updated successfully" });
      
      // Invalidate to refetch with contractTemplate relation
      queryClient.invalidateQueries({ queryKey: [`/api/quotes/${quote.id}`] });
    },
    onError: () => {
      toast({ 
        title: "Error", 
        description: "Failed to update contract", 
        variant: "destructive" 
      });
    },
  });

  // Download signed PDF mutation
  const downloadSignedPdfMutation = useMutation({
    mutationFn: async () => {
      // Fetch full quote data with signatures
      const response = await apiRequest('GET', `/api/quotes/${quote.id}`);
      const fullQuote: QuoteWithDetails = await response.json();
      
      // Fetch groups for proper PDF aggregation
      let groups: { id: string; title: string; position: number }[] = [];
      try {
        const groupsResponse = await apiRequest('GET', `/api/quotes/${quote.id}/groups`);
        const groupsData = await groupsResponse.json();
        groups = groupsData.map((g: any) => ({ id: g.id, title: g.title, position: g.position }));
      } catch (e) {
        console.warn('Failed to fetch groups for PDF:', e);
      }
      
      // Use stored PDF preferences
      const includeImages = fullQuote.esigIncludeImages ?? false;
      const includePricing = fullQuote.esigIncludePricing ?? true;
      const includeContract = fullQuote.esigIncludeContract ?? true;
      
      const { generateSignedPDF, downloadSignedPDF } = await import("@/lib/generate-signed-pdf");
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
        description: 'Signed quote has been downloaded successfully',
      });
    }
  });

  // Download BOM PDF mutation
  const downloadBomPdfMutation = useMutation({
    mutationFn: async () => {
      // Fetch full quote data
      const response = await apiRequest('GET', `/api/quotes/${quote.id}`);
      const fullQuote: QuoteWithDetails = await response.json();
      
      // Fetch groups for proper sorting
      let groups: { id: string; title: string; position: number }[] = [];
      try {
        const groupsResponse = await apiRequest('GET', `/api/quotes/${quote.id}/groups`);
        const groupsData = await groupsResponse.json();
        groups = groupsData.map((g: any) => ({ id: g.id, title: g.title, position: g.position }));
      } catch (e) {
        console.warn('Failed to fetch groups for BOM:', e);
      }
      
      const { generateBomPDF, downloadBomPDF } = await import("@/lib/generate-bom-pdf");
      const pdfBlob = await generateBomPDF({ 
        quote: fullQuote, 
        groups
      });
      downloadBomPDF(pdfBlob, fullQuote);
    },
    onError: (error: any) => {
      toast({
        title: 'Download Failed',
        description: error.message || 'Failed to generate BOM PDF',
        variant: 'destructive'
      });
    },
    onSuccess: () => {
      toast({
        title: 'BOM Downloaded',
        description: 'Bill of Materials has been downloaded successfully',
      });
    }
  });

  // E-signature toggle mutation
  const toggleESignatureMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const response = await apiRequest("PUT", `/api/quotes/${quote.id}`, { 
        enableESignature: enabled 
      });
      return response.json();
    },
    onSuccess: (updatedQuote, enabled) => {
      toast({ 
        title: enabled ? "E-signature enabled" : "E-signature disabled",
        description: enabled ? "You can now send this quote for digital signature" : "Digital signature has been disabled for this quote"
      });
      
      queryClient.setQueryData([`/api/quotes/${quote.id}`], (oldData: any) => {
        if (!oldData) return oldData;
        return { ...oldData, ...updatedQuote };
      });
    },
    onError: () => {
      toast({ 
        title: "Error", 
        description: "Failed to update e-signature setting", 
        variant: "destructive" 
      });
    },
  });

  // Generate signing link mutation
  const generateSigningLinkMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/quotes/${quote.id}/enable-esignature`, {});
      return response.json();
    },
    onSuccess: (data) => {
      const link = `${window.location.origin}/sign/${data.signingToken}`;
      setSigningLink(link);
      setShowSigningLinkDialog(true);
      const isNewToken = !quote.signingToken;
      toast({ 
        title: isNewToken ? "Signing link generated" : "Signing link retrieved",
        description: isNewToken ? "Share this link with the client to sign the quote" : "Your permanent signing link is ready"
      });
      
      // Invalidate query to refetch with updated data
      queryClient.invalidateQueries({ 
        queryKey: [`/api/quotes/${quote.id}`] 
      });
    },
    onError: () => {
      toast({ 
        title: "Error", 
        description: "Failed to generate signing link", 
        variant: "destructive" 
      });
    },
  });

  // Company signature mutation
  const companySignMutation = useMutation({
    mutationFn: async (signatureData: SignatureData) => {
      if (!quote.signingToken) {
        throw new Error("Signing token not available");
      }
      const response = await apiRequest('POST', `/api/signatures/${quote.signingToken}/sign`, { 
        signatureData,
        signerType: 'company'
      });
      return response;
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Quote signed as company successfully!',
        variant: 'default'
      });
      setShowCompanySignDialog(false);
      setCompanySignature(null);
      
      // Refresh quote data to show signed status
      queryClient.invalidateQueries({ 
        queryKey: [`/api/quotes/${quote.id}`]
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

  // Handle signing link button click
  const handleSigningLinkClick = () => {
    if (quote.signingToken) {
      // Token exists - just show the dialog with the existing link
      const link = `${window.location.origin}/sign/${quote.signingToken}`;
      setSigningLink(link);
      // Pre-populate personalized message from saved value if available
      setPersonalizedMessage(quote.signatureEmailMessage || '');
      setShowSigningLinkDialog(true);
    } else {
      // No token - open the options modal to configure preferences
      setShowESignatureOptionsModal(true);
    }
  };

  // Handle successful link generation from the modal
  const handleESignatureLinkGenerated = (signingToken: string) => {
    const link = `${window.location.origin}/sign/${signingToken}`;
    setSigningLink(link);
    setShowSigningLinkDialog(true);
    
    // Invalidate query to refetch with updated data
    queryClient.invalidateQueries({ 
      queryKey: [`/api/quotes/${quote.id}`]
    });
  };

  const copySigningLink = () => {
    navigator.clipboard.writeText(signingLink);
    toast({ 
      title: "Copied!",
      description: "Signing link copied to clipboard"
    });
  };

  // Send signature email mutation
  const sendSignatureEmailMutation = useMutation({
    mutationFn: async (message?: string) => {
      const response = await apiRequest("POST", `/api/quotes/${quote.id}/send-signature-email`, {
        message: message || ''
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "Email Sent!",
        description: data.message || "E-signature email sent to customer"
      });
      // Don't clear the personalized message - keep it for potential resend
      // Refresh to get updated signatureEmailSentAt
      queryClient.invalidateQueries({ queryKey: [`/api/quotes/${quote.id}`] });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to send email", 
        variant: "destructive" 
      });
    },
  });

  const handleCompanySign = () => {
    if (!companySignature) {
      toast({
        title: 'Signature Required',
        description: 'Please provide your signature before submitting',
        variant: 'destructive'
      });
      return;
    }
    companySignMutation.mutate(companySignature);
  };

  const totals = calculateQuoteTotals(
    quote.lineItems.map(item => ({
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      markupType: item.markupType,
      markupValue: item.markupValue,
      discountType: item.discountType,
      discountValue: item.discountValue,
      isTaxable: item.isTaxable,
      isTariffApplicable: item.isTariffApplicable,
    })),
    quote.taxRate ?? 0,
    quote.discount ?? 0,
    quote.shipping ?? 0,
    quote.isShippingTaxable ?? true,
    quote.tariffRate ?? 0
  );

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Additional Options */}
      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Additional Options</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="notes">Notes & Terms</Label>
              <Textarea
                id="notes"
                rows={4}
                value={localNotes}
                onFocus={() => setIsEditingNotes(true)}
                onChange={(e) => setLocalNotes(e.target.value)}
                onBlur={() => {
                  if (localNotes !== quote.notes) {
                    onUpdateQuote("notes", localNotes);
                  }
                  setIsEditingNotes(false);
                }}
                placeholder="Add project notes, terms, or special conditions..."
                className="mt-1"
              />
            </div>
            {/* Contract Selection */}
            <div className="space-y-4 p-4 bg-muted rounded-lg border">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Contract Template</Label>
                {(quote.contractTemplate || quote.customContractTerms) && (
                  <span className="text-xs text-green-600 font-medium">✓ Contract Added</span>
                )}
              </div>
              
              <div className="space-y-3">
                <Select
                  value={quote.contractTemplateId?.toString() || ""}
                  onValueChange={(value) => {
                    if (value === "custom") {
                      // Clear template, keep custom terms
                      updateContractMutation.mutate({ 
                        contractTemplateId: null,
                        customContractTerms: quote.customContractTerms || "" 
                      });
                    } else if (value === "none") {
                      // Clear both template and custom terms
                      updateContractMutation.mutate({ 
                        contractTemplateId: null,
                        customContractTerms: null 
                      });
                    } else {
                      // Set template, clear custom terms
                      updateContractMutation.mutate({ 
                        contractTemplateId: parseInt(value),
                        customContractTerms: null 
                      });
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a contract template" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Contract</SelectItem>
                    {contractTemplates.map((template) => (
                      <SelectItem key={template.id} value={template.id.toString()}>
                        {template.name} {template.isDefault && "(Default)"}
                      </SelectItem>
                    ))}
                    <SelectItem value="custom">Custom Contract Terms</SelectItem>
                  </SelectContent>
                </Select>

                {/* Preview selected template */}
                {quote.contractTemplate && (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" className="w-full">
                        <Eye className="mr-2 h-4 w-4" />
                        Preview: {quote.contractTemplate.name}
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl">
                      <DialogHeader>
                        <DialogTitle>{quote.contractTemplate.title}</DialogTitle>
                        <DialogDescription>
                          Preview the contract terms for this quote
                        </DialogDescription>
                      </DialogHeader>
                      <div className="max-h-96 overflow-y-auto">
                        <pre className="whitespace-pre-wrap text-sm">{quote.contractTemplate.terms}</pre>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}

                {/* Custom contract terms input */}
                {(!quote.contractTemplateId || quote.customContractTerms !== null) && (
                  <div>
                    <Label htmlFor="customContractTerms" className="text-sm">Custom Contract Terms</Label>
                    <Textarea
                      id="customContractTerms"
                      rows={6}
                      value={localCustomContractTerms || (quote.customContractTerms ?? "")}
                      onChange={(e) => setLocalCustomContractTerms(e.target.value)}
                      onBlur={(e) => {
                        if (localCustomContractTerms !== "" && localCustomContractTerms !== (quote.customContractTerms ?? "")) {
                          updateContractMutation.mutate({
                            contractTemplateId: null,
                            customContractTerms: localCustomContractTerms
                          });
                        }
                        setLocalCustomContractTerms("");
                      }}
                      placeholder="Enter custom contract terms and conditions..."
                      className="mt-1 text-sm"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <Label htmlFor="taxRate">Tax Rate (%)</Label>
                <Input
                  id="taxRate"
                  type="number"
                  step="0.1"
                  value={localTaxRate || quote.taxRate || ""}
                  onChange={(e) => setLocalTaxRate(e.target.value)}
                  onBlur={(e) => {
                    if (localTaxRate !== "" && localTaxRate !== quote.taxRate) {
                      onUpdateQuote("taxRate", localTaxRate);
                    }
                    setLocalTaxRate("");
                  }}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="tariffRate">Tariff Rate (%) - Internal</Label>
                <Input
                  id="tariffRate"
                  type="number"
                  step="0.1"
                  value={localTariffRate || quote.tariffRate || ""}
                  onChange={(e) => setLocalTariffRate(e.target.value)}
                  onBlur={(e) => {
                    if (localTariffRate !== "" && localTariffRate !== quote.tariffRate) {
                      onUpdateQuote("tariffRate", localTariffRate);
                    }
                    setLocalTariffRate("");
                  }}
                  className="mt-1"
                  data-testid="input-tariff-rate"
                />
              </div>
              <div>
                <Label htmlFor="discount">Discount (%)</Label>
                <Input
                  id="discount"
                  type="number"
                  step="0.1"
                  value={localDiscount || quote.discount || ""}
                  onChange={(e) => setLocalDiscount(e.target.value)}
                  onBlur={(e) => {
                    if (localDiscount !== "" && localDiscount !== quote.discount) {
                      onUpdateQuote("discount", localDiscount);
                    }
                    setLocalDiscount("");
                  }}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="shipping">Shipping ($)</Label>
                <Input
                  id="shipping"
                  type="number"
                  step="0.01"
                  min="0"
                  value={localShipping || quote.shipping || ""}
                  onChange={(e) => setLocalShipping(e.target.value)}
                  onBlur={(e) => {
                    if (localShipping !== "" && localShipping !== quote.shipping) {
                      onUpdateQuote("shipping", localShipping);
                    }
                    setLocalShipping("");
                  }}
                  className="mt-1"
                  data-testid="input-shipping"
                />
                <div className="flex items-center gap-2 mt-2">
                  <Checkbox
                    id="isShippingTaxable"
                    checked={quote.isShippingTaxable !== false}
                    onCheckedChange={(checked) => {
                      onUpdateQuote("isShippingTaxable", checked === true);
                    }}
                    data-testid="checkbox-shipping-taxable"
                  />
                  <Label 
                    htmlFor="isShippingTaxable" 
                    className="text-sm font-normal cursor-pointer"
                  >
                    Taxable
                  </Label>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Totals and Actions */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Quote Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Subtotal:</span>
              <span className="font-medium text-foreground">
                {formatCurrency(totals.subtotal)}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Total Markup:</span>
              <span className="font-medium text-success-green">
                {formatCurrency(totals.totalMarkup)}
              </span>
            </div>
            {totals.totalManufacturerDiscount > 0 && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Manufacturer Discount:</span>
                <span className="font-medium text-blue-600">
                  -{formatCurrency(totals.totalManufacturerDiscount)}
                </span>
              </div>
            )}
            {totals.discountAmount > 0 && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Discount:</span>
                <span className="font-medium text-red-600">
                  -{formatCurrency(totals.discountAmount)}
                </span>
              </div>
            )}
            {totals.shippingAmount > 0 && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Shipping:</span>
                <span className="font-medium text-foreground">
                  {formatCurrency(totals.shippingAmount)}
                </span>
              </div>
            )}
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Tax ({quote.taxRate}%):</span>
              <span className="font-medium text-foreground">
                {formatCurrency(totals.taxAmount)}
              </span>
            </div>
            <div className="border-t border-border pt-3">
              <div className="flex justify-between items-center">
                <span className="text-lg font-semibold text-edg-black">Total:</span>
                <span className="text-2xl font-bold text-edg-black">
                  {formatCurrency(totals.total)}
                </span>
              </div>
            </div>
            <div className="mt-3 p-3 bg-muted rounded-lg border">
              <div className="text-xs text-muted-foreground">Profit Margin:</div>
              <div className="text-lg font-semibold text-edg-teal">
                {totals.margin}%
              </div>
            </div>
          </CardContent>
        </Card>

        {/* E-Signature Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Electronic Signature</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="enable-esignature" className="text-sm font-medium">
                  Enable E-Signature
                </Label>
                <p className="text-xs text-muted-foreground">
                  Allow clients to sign digitally
                </p>
              </div>
              <Switch
                id="enable-esignature"
                data-testid="switch-enable-esignature"
                checked={quote.enableESignature ?? false}
                onCheckedChange={(checked) => toggleESignatureMutation.mutate(checked)}
                disabled={toggleESignatureMutation.isPending}
              />
            </div>

            {quote.enableESignature && (
              <>
                {/* Signature Status Display */}
                {quote.clientSignedAt && quote.companySignedAt ? (
                  <>
                    <Alert className="border-green-600/30 bg-green-600/10">
                      <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                      <AlertDescription className="text-green-900 dark:text-green-100">
                        <strong>Fully Signed</strong>
                        <span className="block mt-1 text-sm">
                          Client: {new Date(quote.clientSignedAt).toLocaleString()}
                        </span>
                        <span className="block text-sm">
                          Company: {new Date(quote.companySignedAt).toLocaleString()}
                        </span>
                      </AlertDescription>
                    </Alert>
                    <Button 
                      onClick={() => downloadSignedPdfMutation.mutate()}
                      disabled={downloadSignedPdfMutation.isPending}
                      variant="outline"
                      className="w-full"
                      data-testid="button-download-signed-pdf-company"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      {downloadSignedPdfMutation.isPending ? 'Generating PDF...' : 'Download Signed Quote'}
                    </Button>
                  </>
                ) : quote.clientSignedAt ? (
                  <>
                    <Alert className="border-blue-600/30 bg-blue-600/10">
                      <CheckCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      <AlertDescription className="text-blue-900 dark:text-blue-100">
                        <strong>Client Signed</strong>
                        <span className="block mt-1 text-sm">
                          Signed on {new Date(quote.clientSignedAt).toLocaleString()}
                        </span>
                      </AlertDescription>
                    </Alert>
                    <Button 
                      onClick={() => downloadSignedPdfMutation.mutate()}
                      disabled={downloadSignedPdfMutation.isPending}
                      variant="outline"
                      className="w-full"
                      data-testid="button-download-signed-pdf-company"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      {downloadSignedPdfMutation.isPending ? 'Generating PDF...' : 'Download Signed Quote'}
                    </Button>
                  </>
                ) : quote.companySignedAt ? (
                  <Alert className="border-purple-600/30 bg-purple-600/10">
                    <CheckCircle className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                    <AlertDescription className="text-purple-900 dark:text-purple-100">
                      <strong>Company Signed</strong>
                      <span className="block mt-1 text-sm">
                        Signed on {new Date(quote.companySignedAt).toLocaleString()}
                      </span>
                      <span className="block text-sm text-purple-700 dark:text-purple-300">
                        Waiting for client signature
                      </span>
                    </AlertDescription>
                  </Alert>
                ) : quote.signingToken ? (
                  <Alert className="border-yellow-600/30 bg-yellow-600/10">
                    <Clock className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                    <AlertDescription className="text-yellow-900 dark:text-yellow-100">
                      <strong>Pending Signature</strong>
                      {quote.signatureEmailSentAt ? (
                        <span className="block mt-1 text-sm">
                          Email sent on {new Date(quote.signatureEmailSentAt).toLocaleString()}
                        </span>
                      ) : (
                        <span className="block mt-1 text-sm">
                          Signing link ready - email not yet sent
                        </span>
                      )}
                    </AlertDescription>
                  </Alert>
                ) : null}

                <Button
                  onClick={handleSigningLinkClick}
                  disabled={generateSigningLinkMutation.isPending || !!(quote.clientSignedAt && quote.companySignedAt)}
                  className="w-full"
                  data-testid="button-send-for-signature"
                >
                  <Link2 className="mr-2 h-4 w-4" />
                  {quote.signingToken ? 'View Signing Link' : 'Generate Signing Link'}
                </Button>

                {quote.signingToken && !quote.companySignedAt && (
                  <Button
                    onClick={() => setShowCompanySignDialog(true)}
                    variant="outline"
                    className="w-full border-edg-teal text-edg-teal hover:bg-edg-light-teal hover:bg-opacity-10"
                    data-testid="button-sign-as-company"
                  >
                    <PenTool className="mr-2 h-4 w-4" />
                    Sign as Company
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="space-y-3">
          <Button
            onClick={() => downloadBomPdfMutation.mutate()}
            disabled={downloadBomPdfMutation.isPending || quote.lineItems.length === 0}
            variant="outline"
            className="w-full"
            data-testid="button-download-bom"
          >
            <Package className="mr-2 h-4 w-4" />
            {downloadBomPdfMutation.isPending ? 'Generating BOM...' : 'Download BOM'}
          </Button>

          <Button
            variant="outline"
            className="w-full border-edg-teal text-edg-teal hover:bg-edg-light-teal hover:bg-opacity-10"
          >
            <Bookmark className="mr-2 h-4 w-4" />
            Save as Template
          </Button>
        </div>
      </div>

      {/* Signing Link Dialog */}
      <Dialog open={showSigningLinkDialog} onOpenChange={setShowSigningLinkDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Send Quote for Signature</DialogTitle>
            <DialogDescription>
              Share this link with your client or send it directly via email
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Show if email was already sent */}
            {quote.signatureEmailSentAt && (
              <Alert className="border-green-600/30 bg-green-600/10">
                <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                <AlertDescription className="text-green-900 dark:text-green-100">
                  <strong>Email Previously Sent</strong>
                  <span className="block mt-1 text-sm">
                    Sent on {new Date(quote.signatureEmailSentAt).toLocaleString()}
                  </span>
                </AlertDescription>
              </Alert>
            )}
            
            <div className="space-y-2">
              <Label>Signing Link</Label>
              <div className="flex gap-2">
                <Input
                  value={signingLink}
                  readOnly
                  data-testid="input-signing-link"
                  className="font-mono text-sm"
                />
                <Button
                  onClick={copySigningLink}
                  variant="outline"
                  data-testid="button-copy-signing-link"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="border-t pt-4 space-y-3">
              <Label className="text-sm font-medium">Send via Email</Label>
              
              {!quote.account?.email ? (
                <Alert className="border-yellow-600/30 bg-yellow-600/10">
                  <AlertCircle className="h-4 w-4 text-yellow-600" />
                  <AlertDescription className="text-yellow-900 dark:text-yellow-100 text-sm">
                    Add a customer email address to enable email sending
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <div className="text-sm text-muted-foreground">
                    Sending to: <span className="font-medium text-foreground">{quote.account.email}</span>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="personalized-message" className="text-sm">
                      Add a Personal Message <span className="text-muted-foreground">(optional)</span>
                    </Label>
                    <Textarea
                      id="personalized-message"
                      placeholder="Hi! Thank you for choosing us for your project. Please review the attached quote at your convenience..."
                      value={personalizedMessage}
                      onChange={(e) => setPersonalizedMessage(e.target.value)}
                      rows={3}
                      className="resize-none"
                      data-testid="input-personalized-message"
                    />
                    <p className="text-xs text-muted-foreground">
                      This message will appear as a highlighted note in the email, before the quote details.
                    </p>
                  </div>
                  
                  <Button
                    onClick={() => sendSignatureEmailMutation.mutate(personalizedMessage)}
                    disabled={sendSignatureEmailMutation.isPending}
                    className="w-full bg-edg-teal hover:bg-edg-dark-teal text-white"
                    data-testid="button-send-email"
                  >
                    <Mail className="mr-2 h-4 w-4" />
                    {sendSignatureEmailMutation.isPending ? "Sending..." : 
                      quote.signatureEmailSentAt ? "Resend Email" : "Send Email"}
                  </Button>
                </>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <Button
                onClick={() => setShowSigningLinkDialog(false)}
                variant="outline"
                data-testid="button-close-dialog"
              >
                Done
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Company Signature Dialog */}
      <Dialog open={showCompanySignDialog} onOpenChange={(open) => {
        setShowCompanySignDialog(open);
        if (!open) {
          setCompanySignature(null);
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Sign Quote as Company</DialogTitle>
            <DialogDescription>
              Add your company signature to finalize the quote
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Alert>
              <AlertDescription>
                Draw or type your signature below to sign this quote on behalf of the company
              </AlertDescription>
            </Alert>
            
            <SignatureCanvas
              onSignatureChange={setCompanySignature}
              signerName=""
            />

            {companySignature && (
              <Alert className="border-green-600/30 bg-green-600/10">
                <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                <AlertDescription className="text-green-900 dark:text-green-100">
                  Signature captured. Click "Submit Signature" to complete.
                </AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2 pt-4">
              <Button
                onClick={() => {
                  setShowCompanySignDialog(false);
                  setCompanySignature(null);
                }}
                variant="outline"
                className="flex-1"
                data-testid="button-cancel-company-sign"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCompanySign}
                disabled={!companySignature || companySignMutation.isPending}
                className="flex-1"
                data-testid="button-submit-company-signature"
              >
                {companySignMutation.isPending ? 'Submitting...' : 'Submit Signature'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* E-Signature Options Modal */}
      <ESignatureOptionsModal
        quote={quote}
        open={showESignatureOptionsModal}
        onOpenChange={setShowESignatureOptionsModal}
        onSuccess={handleESignatureLinkGenerated}
      />
      </div>
    </>
  );
}
