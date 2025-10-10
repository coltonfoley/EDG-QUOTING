import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FileText, Bookmark, Plus, Eye, Send, Mail, CheckCircle, AlertCircle, Clock, Link2, Copy } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatCurrency, calculateQuoteTotals } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { QuoteWithDetails, ContractTemplate } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

interface QuoteSummaryProps {
  quote: QuoteWithDetails;
  onUpdateQuote: (field: string, value: any) => void;
}

export function QuoteSummary({ quote, onUpdateQuote }: QuoteSummaryProps) {
  const [localTaxRate, setLocalTaxRate] = useState<string>("");
  const [localDiscount, setLocalDiscount] = useState<string>("");
  const [localShipping, setLocalShipping] = useState<string>("");
  const [localNotes, setLocalNotes] = useState<string>("");
  const [localCustomContractTerms, setLocalCustomContractTerms] = useState<string>("");
  const [showSigningLinkDialog, setShowSigningLinkDialog] = useState(false);
  const [signingLink, setSigningLink] = useState<string>("");
  const { toast } = useToast();
  const queryClient = useQueryClient();


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
      
      // Use setQueryData instead of invalidateQueries to avoid refetch
      queryClient.setQueryData([`/api/quotes/${quote.id}`], (oldData: any) => {
        if (!oldData) return oldData;
        return { ...oldData, ...updatedQuote };
      });
    },
    onError: () => {
      toast({ 
        title: "Error", 
        description: "Failed to update contract", 
        variant: "destructive" 
      });
    },
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
      const link = `${window.location.origin}/sign/${data.token}`;
      setSigningLink(link);
      setShowSigningLinkDialog(true);
      toast({ 
        title: "Signing link generated",
        description: "Share this link with the client to sign the quote"
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

  const copySigningLink = () => {
    navigator.clipboard.writeText(signingLink);
    toast({ 
      title: "Copied!",
      description: "Signing link copied to clipboard"
    });
  };

  const totals = calculateQuoteTotals(
    quote.lineItems.map(item => ({
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      markupType: item.markupType,
      markupValue: item.markupValue,
      isTaxable: item.isTaxable,
    })),
    quote.taxRate ?? 0,
    quote.discount ?? 0,
    quote.shipping ?? 0,
    quote.isShippingTaxable ?? true
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
                value={localNotes || quote.notes || ""}
                onChange={(e) => setLocalNotes(e.target.value)}
                onBlur={(e) => {
                  if (localNotes !== "" && localNotes !== quote.notes) {
                    onUpdateQuote("notes", localNotes);
                  }
                  setLocalNotes("");
                }}
                placeholder="Add project notes, terms, or special conditions..."
                className="mt-1"
              />
            </div>
            {/* Contract Selection */}
            <div className="space-y-4 p-4 bg-gray-50 rounded-lg border">
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

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
              <span className="text-accent-grey">Subtotal:</span>
              <span className="font-medium text-charcoal">
                {formatCurrency(totals.subtotal)}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-accent-grey">Total Markup:</span>
              <span className="font-medium text-success-green">
                {formatCurrency(totals.totalMarkup)}
              </span>
            </div>
            {totals.totalManufacturerDiscount > 0 && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-accent-grey">Manufacturer Discount:</span>
                <span className="font-medium text-blue-600">
                  -{formatCurrency(totals.totalManufacturerDiscount)}
                </span>
              </div>
            )}
            {totals.discountAmount > 0 && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-accent-grey">Discount:</span>
                <span className="font-medium text-red-600">
                  -{formatCurrency(totals.discountAmount)}
                </span>
              </div>
            )}
            {totals.shippingAmount > 0 && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-accent-grey">Shipping:</span>
                <span className="font-medium text-charcoal">
                  {formatCurrency(totals.shippingAmount)}
                </span>
              </div>
            )}
            <div className="flex justify-between items-center text-sm">
              <span className="text-accent-grey">Tax ({quote.taxRate}%):</span>
              <span className="font-medium text-charcoal">
                {formatCurrency(totals.taxAmount)}
              </span>
            </div>
            <div className="border-t border-gray-200 pt-3">
              <div className="flex justify-between items-center">
                <span className="text-lg font-semibold text-edg-black">Total:</span>
                <span className="text-2xl font-bold text-edg-black">
                  {formatCurrency(totals.total)}
                </span>
              </div>
            </div>
            <div className="mt-3 p-3 bg-green-50 rounded-lg">
              <div className="text-xs text-edg-grey">Profit Margin:</div>
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
                <p className="text-xs text-gray-500">
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
                  <Alert className="border-green-200 bg-green-50">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-800">
                      <strong>Fully Signed</strong>
                      <span className="block mt-1 text-sm">
                        Client: {new Date(quote.clientSignedAt).toLocaleString()}
                      </span>
                      <span className="block text-sm">
                        Company: {new Date(quote.companySignedAt).toLocaleString()}
                      </span>
                    </AlertDescription>
                  </Alert>
                ) : quote.clientSignedAt ? (
                  <Alert className="border-blue-200 bg-blue-50">
                    <CheckCircle className="h-4 w-4 text-blue-600" />
                    <AlertDescription className="text-blue-800">
                      <strong>Client Signed</strong>
                      <span className="block mt-1 text-sm">
                        Signed on {new Date(quote.clientSignedAt).toLocaleString()}
                      </span>
                    </AlertDescription>
                  </Alert>
                ) : quote.companySignedAt ? (
                  <Alert className="border-purple-200 bg-purple-50">
                    <CheckCircle className="h-4 w-4 text-purple-600" />
                    <AlertDescription className="text-purple-800">
                      <strong>Company Signed</strong>
                      <span className="block mt-1 text-sm">
                        Signed on {new Date(quote.companySignedAt).toLocaleString()}
                      </span>
                      <span className="block text-sm text-purple-600">
                        Waiting for client signature
                      </span>
                    </AlertDescription>
                  </Alert>
                ) : quote.signingToken ? (
                  <Alert className="border-yellow-200 bg-yellow-50">
                    <Clock className="h-4 w-4 text-yellow-600" />
                    <AlertDescription className="text-yellow-800">
                      <strong>Pending Signature</strong>
                      <span className="block mt-1 text-sm">
                        Signing link is active, waiting for signature
                      </span>
                    </AlertDescription>
                  </Alert>
                ) : null}

                <Button
                  onClick={() => generateSigningLinkMutation.mutate()}
                  disabled={generateSigningLinkMutation.isPending || !!(quote.clientSignedAt && quote.companySignedAt)}
                  className="w-full"
                  data-testid="button-send-for-signature"
                >
                  <Link2 className="mr-2 h-4 w-4" />
                  {quote.signingToken ? 'Regenerate Signing Link' : 'Generate Signing Link'}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="space-y-3">



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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Signing Link Generated</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Alert>
              <AlertDescription>
                Share this link with the client to sign the quote electronically
              </AlertDescription>
            </Alert>
            
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

            <div className="pt-4">
              <Button
                onClick={() => setShowSigningLinkDialog(false)}
                className="w-full"
                data-testid="button-close-dialog"
              >
                Done
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </>
  );
}
