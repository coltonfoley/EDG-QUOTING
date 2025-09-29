import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FileText, Bookmark, Plus, Eye, Send, Mail, CheckCircle, AlertCircle, Clock } from "lucide-react";
import { formatCurrency, calculateQuoteTotals } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { QuoteWithDetails, ContractTemplate } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

interface QuoteSummaryProps {
  quote: QuoteWithDetails;
  onUpdateQuote: (field: string, value: any) => void;
}

export function QuoteSummary({ quote, onUpdateQuote }: QuoteSummaryProps) {
  const [issuerSignatureInput, setIssuerSignatureInput] = useState("");
  const [localTaxRate, setLocalTaxRate] = useState<string>("");
  const [localDiscount, setLocalDiscount] = useState<string>("");
  const [localShipping, setLocalShipping] = useState<string>("");
  const [localNotes, setLocalNotes] = useState<string>("");
  const { toast } = useToast();
  const queryClient = useQueryClient();


  // Fetch available contract templates
  const { data: contractTemplates = [] } = useQuery<ContractTemplate[]>({
    queryKey: ["/api/contract-templates"],
  });

  const signIssuerMutation = useMutation({
    mutationFn: async ({ signature }: { signature: string }) => {
      const response = await fetch(`/api/quotes/${quote.id}/sign-issuer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to sign quote');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Quote signed successfully" });
      queryClient.invalidateQueries({ queryKey: [`/api/quotes/${quote.id}`] });
    },
    onError: () => {
      toast({ 
        title: "Error", 
        description: "Failed to sign quote", 
        variant: "destructive" 
      });
    },
  });


  // Simple save functions - no auto-save, manual button click only
  const handleSaveIssuerSignature = () => {
    if (issuerSignatureInput.trim()) {
      signIssuerMutation.mutate({ signature: issuerSignatureInput.trim() });
    }
  };

  const updateContractMutation = useMutation({
    mutationFn: async (data: { contractTemplateId?: number | null; customContractTerms?: string | null }) => {
      const response = await apiRequest("PUT", `/api/quotes/${quote.id}`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Contract updated successfully" });
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

  const totals = calculateQuoteTotals(
    quote.lineItems.map(item => ({
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      markupType: item.markupType,
      markupValue: item.markupValue,
    })),
    quote.taxRate ?? 0,
    quote.discount ?? 0,
    quote.shipping ?? 0
  );

  return (
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
                      value={quote.customContractTerms ?? ""}
                      onChange={(e) => {
                        updateContractMutation.mutate({
                          contractTemplateId: null,
                          customContractTerms: e.target.value
                        });
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
                />
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

        {/* Action Buttons */}
        <div className="space-y-3">

          {/* Signature Status */}
          <div className="p-3 bg-gray-50 rounded">
            <div className="text-sm text-center">
              <span className="font-medium">Signature Status: </span>
              <span className={`capitalize ${
                quote.signatureStatus === 'signed' ? 'text-green-600 font-semibold' :
                quote.signatureStatus === 'unsigned' ? 'text-red-600' :
                'text-blue-600'
              }`}>
                {quote.signatureStatus === 'signed' ? 'Signed by EDG' : 
                 quote.signatureStatus === 'unsigned' ? 'Unsigned' : 
                 quote.signatureStatus?.replace('_', ' ')}
              </span>
            </div>
            {quote.issuerSignature && (
              <div className="text-xs text-gray-600 mt-1">
                Issuer: {quote.issuerSignature} {quote.issuerSignatureDate && 
                  `(${new Date(quote.issuerSignatureDate).toLocaleDateString()})`
                }
              </div>
            )}
            {quote.customerSignature && (
              <div className="text-xs text-gray-600">
                Client: {quote.customerSignature} {quote.customerSignatureDate && 
                  `(${new Date(quote.customerSignatureDate).toLocaleDateString()})`
                }
              </div>
            )}
          </div>

          {/* Signature Actions */}
          {!quote.issuerSignature && (
            <div className="space-y-3">
              <Label htmlFor="issuerSignature" className="text-sm font-medium">Sign as EDG</Label>
              <div className="flex gap-2">
                <Input
                  id="issuerSignature"
                  placeholder="Enter your name to sign..."
                  value={issuerSignatureInput}
                  onChange={(e) => setIssuerSignatureInput(e.target.value)}
                  disabled={signIssuerMutation.isPending}
                  className="flex-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && issuerSignatureInput.trim()) {
                      handleSaveIssuerSignature();
                    }
                  }}
                />
                <Button
                  onClick={handleSaveIssuerSignature}
                  disabled={!issuerSignatureInput.trim() || signIssuerMutation.isPending}
                  className="bg-edg-teal hover:bg-edg-teal/90 text-white"
                >
                  {signIssuerMutation.isPending ? "Saving..." : "Sign"}
                </Button>
              </div>
            </div>
          )}

          <Button
            variant="outline"
            className="w-full border-edg-teal text-edg-teal hover:bg-edg-light-teal hover:bg-opacity-10"
          >
            <Bookmark className="mr-2 h-4 w-4" />
            Save as Template
          </Button>
        </div>
      </div>

    </div>
  );
}
