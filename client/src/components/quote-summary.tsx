import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileText, FileSignature, Bookmark } from "lucide-react";
import { formatCurrency, calculateQuoteTotals } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { QuotePDFTemplate } from "./quote-pdf-template";
import type { QuoteWithDetails } from "@shared/schema";

interface QuoteSummaryProps {
  quote: QuoteWithDetails;
  onUpdateQuote: (field: string, value: any) => void;
}

export function QuoteSummary({ quote, onUpdateQuote }: QuoteSummaryProps) {
  const [showPDFTemplate, setShowPDFTemplate] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const sendToDocuSignMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/quotes/${quote.id}/send-to-docusign`, {});
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/quotes/${quote.id}`] });
      toast({ 
        title: "Quote sent to DocuSign", 
        description: `Envelope ID: ${data.envelopeId}` 
      });
    },
    onError: () => {
      toast({ 
        title: "Error", 
        description: "Failed to send quote to DocuSign", 
        variant: "destructive" 
      });
    },
  });

  const generatePDFMutation = useMutation({
    mutationFn: async () => {
      setShowPDFTemplate(true);
      return Promise.resolve();
    },
    onSuccess: () => {
      // PDF template dialog will handle the actual generation
    },
    onError: () => {
      toast({ 
        title: "Error", 
        description: "Failed to open PDF template", 
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
    quote.taxRate,
    quote.discount
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
                value={quote.notes || ""}
                onChange={(e) => onUpdateQuote("notes", e.target.value)}
                placeholder="Add project notes, terms, or special conditions..."
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="taxRate">Tax Rate (%)</Label>
                <Input
                  id="taxRate"
                  type="number"
                  step="0.1"
                  value={quote.taxRate}
                  onChange={(e) => onUpdateQuote("taxRate", e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="discount">Discount (%)</Label>
                <Input
                  id="discount"
                  type="number"
                  step="0.1"
                  value={quote.discount}
                  onChange={(e) => onUpdateQuote("discount", e.target.value)}
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
            {totals.discountAmount > 0 && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-accent-grey">Discount:</span>
                <span className="font-medium text-red-600">
                  -{formatCurrency(totals.discountAmount)}
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
                <span className="text-lg font-semibold text-charcoal">Total:</span>
                <span className="text-2xl font-bold text-construction-blue">
                  {formatCurrency(totals.total)}
                </span>
              </div>
            </div>
            <div className="mt-3 p-3 bg-green-50 rounded-lg">
              <div className="text-xs text-accent-grey">Profit Margin:</div>
              <div className="text-lg font-semibold text-success-green">
                {totals.margin}%
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="space-y-3">
          <Button
            onClick={() => generatePDFMutation.mutate()}
            disabled={generatePDFMutation.isPending}
            className="w-full bg-construction-blue hover:bg-blue-700 text-white"
          >
            <FileText className="mr-2 h-4 w-4" />
            Generate PDF Quote
          </Button>
          <Button
            onClick={() => sendToDocuSignMutation.mutate()}
            disabled={sendToDocuSignMutation.isPending}
            className="w-full bg-sandy-brown hover:bg-orange-500 text-white"
          >
            <FileSignature className="mr-2 h-4 w-4" />
            Send to DocuSign
          </Button>
          <Button
            variant="outline"
            className="w-full border-construction-blue text-construction-blue hover:bg-blue-50"
          >
            <Bookmark className="mr-2 h-4 w-4" />
            Save as Template
          </Button>
        </div>
      </div>

      <QuotePDFTemplate
        quote={quote}
        isOpen={showPDFTemplate}
        onClose={() => setShowPDFTemplate(false)}
      />
    </div>
  );
}
