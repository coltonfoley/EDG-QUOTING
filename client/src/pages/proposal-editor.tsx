import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { LoadingSpinner } from "@/components/loading-spinner";
import { 
  ArrowLeft, 
  Save, 
  Eye,
  Building2,
  FileText,
  ClipboardList,
  Loader2
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import type { QuoteWithDetails } from "@shared/schema";
import { COMPANY_INFO, QUOTE_TERMS } from "@shared/companyConfig";

// Form validation schema
const proposalFormSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  companyAddress: z.string().min(1, "Company address is required"),
  companyPhone: z.string().min(1, "Company phone is required"),
  companyEmail: z.string().email("Valid email is required"),
  projectDescription: z.string().optional(),
  specialNotes: z.string().optional(),
  paymentTerms: z.string().min(1, "Payment terms are required"),
  warranty: z.string().min(1, "Warranty information is required"),
  additionalNotes: z.string().optional(),
});

type ProposalFormData = z.infer<typeof proposalFormSchema>;

export default function ProposalEditor() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const quoteId = id ? parseInt(id) : undefined;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: quote, isLoading, error } = useQuery<QuoteWithDetails>({
    queryKey: [`/api/quotes/${quoteId}`],
    enabled: !!quoteId,
  });

  // Initialize form with company defaults
  const form = useForm<ProposalFormData>({
    resolver: zodResolver(proposalFormSchema),
    defaultValues: {
      companyName: COMPANY_INFO.name,
      companyAddress: COMPANY_INFO.address,
      companyPhone: COMPANY_INFO.phone,
      companyEmail: COMPANY_INFO.email,
      projectDescription: "",
      specialNotes: "",
      paymentTerms: QUOTE_TERMS.paymentTerms,
      warranty: QUOTE_TERMS.warranty,
      additionalNotes: QUOTE_TERMS.additionalNotes,
    },
  });

  // Load saved proposal data when quote loads
  useEffect(() => {
    if (quote?.customContractTerms) {
      try {
        const savedProposalData = JSON.parse(quote.customContractTerms) as ProposalFormData;
        
        // Validate that the parsed data has the expected structure
        if (savedProposalData && typeof savedProposalData === 'object') {
          // Reset form with saved data, falling back to defaults for any missing fields
          form.reset({
            companyName: savedProposalData.companyName || COMPANY_INFO.name,
            companyAddress: savedProposalData.companyAddress || COMPANY_INFO.address,
            companyPhone: savedProposalData.companyPhone || COMPANY_INFO.phone,
            companyEmail: savedProposalData.companyEmail || COMPANY_INFO.email,
            projectDescription: savedProposalData.projectDescription || "",
            specialNotes: savedProposalData.specialNotes || "",
            paymentTerms: savedProposalData.paymentTerms || QUOTE_TERMS.paymentTerms,
            warranty: savedProposalData.warranty || QUOTE_TERMS.warranty,
            additionalNotes: savedProposalData.additionalNotes || QUOTE_TERMS.additionalNotes,
          });
        }
      } catch (error) {
        console.warn('Failed to parse saved proposal data, using defaults:', error);
        // Form will continue to use the default values already set
      }
    }
  }, [quote, form]);

  const saveProposalMutation = useMutation({
    mutationFn: async (data: ProposalFormData) => {
      if (!quoteId) throw new Error("No quote ID");
      // For now, we'll save this as quote notes or custom fields
      // This can be extended later with a proper proposal table
      const response = await apiRequest("PUT", `/api/quotes/${quoteId}`, {
        customContractTerms: JSON.stringify(data),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/quotes/${quoteId}`] });
      toast({ title: "Proposal saved successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save proposal", variant: "destructive" });
    },
  });

  const onSubmit = (data: ProposalFormData) => {
    saveProposalMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <LoadingSpinner text="Loading quote data..." />
        </div>
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900">Quote not found</h2>
            <p className="mt-2 text-gray-600">The quote you're looking for doesn't exist.</p>
            <Button 
              onClick={() => setLocation("/quotes")}
              className="mt-4"
              data-testid="button-back-quotes"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Quotes
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Calculate totals from line items
  const calculateSubtotal = () => {
    if (!quote?.lineItems) return 0;
    return quote.lineItems.reduce((sum, item) => {
      const quantity = parseFloat(item.quantity);
      const unitPrice = parseFloat(item.unitPrice);
      const markupValue = parseFloat(item.markupValue);
      const discountValue = parseFloat(item.discountValue);
      
      let itemTotal = quantity * unitPrice;
      
      // Apply markup
      if (item.markupType === 'percentage') {
        itemTotal = itemTotal * (1 + markupValue / 100);
      } else {
        itemTotal = itemTotal + markupValue;
      }
      
      // Apply discount
      if (item.discountType === 'percentage') {
        itemTotal = itemTotal * (1 - discountValue / 100);
      } else {
        itemTotal = itemTotal - discountValue;
      }
      
      return sum + itemTotal;
    }, 0);
  };

  const subtotal = calculateSubtotal();
  const discount = parseFloat(quote?.discount || '0');
  const taxRate = parseFloat(quote?.taxRate || '0');
  const shipping = parseFloat(quote?.shipping || '0');
  const taxAmount = (subtotal - discount) * (taxRate / 100);
  const total = subtotal - discount + taxAmount + shipping;

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              onClick={() => setLocation(`/quotes/${quote.id}`)}
              data-testid="button-back-quote"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Quote
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900" data-testid={`text-proposal-editor-${quote.id}`}>
                Edit Proposal - {quote.projectName || `Quote ${quote.quoteNumber}`}
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Quote #{quote.quoteNumber}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              onClick={form.handleSubmit(onSubmit)}
              disabled={saveProposalMutation.isPending}
              data-testid="button-save-proposal"
            >
              {saveProposalMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save Proposal
            </Button>
          </div>
        </div>

        {/* Split-view Layout */}
        <div className="h-[calc(100vh-200px)] border rounded-lg overflow-hidden bg-white">
          <ResizablePanelGroup direction="horizontal">
            {/* Left Panel - Editing Form */}
            <ResizablePanel defaultSize={50} minSize={30}>
              <div className="h-full overflow-y-auto p-6">
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                  {/* Company Information Section */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-4">
                      <Building2 className="h-5 w-5 text-blue-600" />
                      <h3 className="text-lg font-semibold text-gray-900">Company Information</h3>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="companyName">Company Name</Label>
                        <Input
                          id="companyName"
                          {...form.register("companyName")}
                          data-testid="input-company-name"
                        />
                        {form.formState.errors.companyName && (
                          <p className="text-sm text-red-600 mt-1">
                            {form.formState.errors.companyName.message}
                          </p>
                        )}
                      </div>
                      
                      <div>
                        <Label htmlFor="companyEmail">Email</Label>
                        <Input
                          id="companyEmail"
                          type="email"
                          {...form.register("companyEmail")}
                          data-testid="input-company-email"
                        />
                        {form.formState.errors.companyEmail && (
                          <p className="text-sm text-red-600 mt-1">
                            {form.formState.errors.companyEmail.message}
                          </p>
                        )}
                      </div>
                      
                      <div>
                        <Label htmlFor="companyPhone">Phone</Label>
                        <Input
                          id="companyPhone"
                          {...form.register("companyPhone")}
                          data-testid="input-company-phone"
                        />
                        {form.formState.errors.companyPhone && (
                          <p className="text-sm text-red-600 mt-1">
                            {form.formState.errors.companyPhone.message}
                          </p>
                        )}
                      </div>
                      
                      <div>
                        <Label htmlFor="companyAddress">Address</Label>
                        <Input
                          id="companyAddress"
                          {...form.register("companyAddress")}
                          data-testid="input-company-address"
                        />
                        {form.formState.errors.companyAddress && (
                          <p className="text-sm text-red-600 mt-1">
                            {form.formState.errors.companyAddress.message}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Project Details Section */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-4">
                      <FileText className="h-5 w-5 text-green-600" />
                      <h3 className="text-lg font-semibold text-gray-900">Project Details</h3>
                    </div>
                    
                    <div>
                      <Label htmlFor="projectDescription">Custom Description</Label>
                      <Textarea
                        id="projectDescription"
                        placeholder="Enter a detailed project description for the proposal..."
                        className="min-h-[120px]"
                        {...form.register("projectDescription")}
                        data-testid="textarea-project-description"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="specialNotes">Special Notes</Label>
                      <Textarea
                        id="specialNotes"
                        placeholder="Any special notes or requirements..."
                        {...form.register("specialNotes")}
                        data-testid="textarea-special-notes"
                      />
                    </div>
                  </div>

                  <Separator />

                  {/* Terms Section */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-4">
                      <ClipboardList className="h-5 w-5 text-purple-600" />
                      <h3 className="text-lg font-semibold text-gray-900">Terms & Conditions</h3>
                    </div>
                    
                    <div>
                      <Label htmlFor="paymentTerms">Payment Terms</Label>
                      <Input
                        id="paymentTerms"
                        {...form.register("paymentTerms")}
                        data-testid="input-payment-terms"
                      />
                      {form.formState.errors.paymentTerms && (
                        <p className="text-sm text-red-600 mt-1">
                          {form.formState.errors.paymentTerms.message}
                        </p>
                      )}
                    </div>
                    
                    <div>
                      <Label htmlFor="warranty">Warranty Information</Label>
                      <Input
                        id="warranty"
                        {...form.register("warranty")}
                        data-testid="input-warranty"
                      />
                      {form.formState.errors.warranty && (
                        <p className="text-sm text-red-600 mt-1">
                          {form.formState.errors.warranty.message}
                        </p>
                      )}
                    </div>
                    
                    <div>
                      <Label htmlFor="additionalNotes">Additional Notes</Label>
                      <Textarea
                        id="additionalNotes"
                        placeholder="Additional terms, conditions, or notes..."
                        {...form.register("additionalNotes")}
                        data-testid="textarea-additional-notes"
                      />
                    </div>
                  </div>
                </form>
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Right Panel - Preview */}
            <ResizablePanel defaultSize={50} minSize={30}>
              <div className="h-full bg-white border-l">
                <div className="p-4 border-b bg-gray-50">
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-gray-600" />
                    <span className="font-medium text-gray-700">Proposal Preview</span>
                  </div>
                </div>
                
                <div className="h-full overflow-y-auto p-6 bg-white">
                  {/* Preview Content */}
                  <div className="max-w-2xl mx-auto space-y-6">
                    {/* Header */}
                    <div className="text-center border-b pb-6">
                      <h2 className="text-2xl font-bold text-gray-900">
                        {form.watch("companyName") || COMPANY_INFO.name}
                      </h2>
                      <p className="text-gray-600 mt-2">
                        {form.watch("companyAddress") || COMPANY_INFO.address}
                      </p>
                      <div className="flex justify-center gap-6 mt-3 text-sm text-gray-600">
                        <span>{form.watch("companyPhone") || COMPANY_INFO.phone}</span>
                        <span>{form.watch("companyEmail") || COMPANY_INFO.email}</span>
                      </div>
                    </div>

                    {/* Quote Information */}
                    <div className="space-y-4">
                      <h3 className="text-xl font-semibold text-gray-900">Quote Details</h3>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-gray-600">Quote Number:</p>
                          <p className="font-medium">{quote.quoteNumber}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Project:</p>
                          <p className="font-medium">{quote.projectName || 'N/A'}</p>
                        </div>
                      </div>
                    </div>

                    {/* Customer Information */}
                    <div className="space-y-4">
                      <h3 className="text-xl font-semibold text-gray-900">Customer Details</h3>
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <p className="font-medium">{quote.customer?.name || quote.account?.name}</p>
                        {quote.customer?.company && (
                          <p className="text-gray-600">{quote.customer.company}</p>
                        )}
                        <p className="text-gray-600">{quote.customer?.email || quote.account?.email}</p>
                        <p className="text-gray-600">{quote.customer?.phone || quote.account?.phone}</p>
                      </div>
                    </div>

                    {/* Project Description */}
                    {form.watch("projectDescription") && (
                      <div className="space-y-4">
                        <h3 className="text-xl font-semibold text-gray-900">Project Description</h3>
                        <p className="text-gray-700 whitespace-pre-wrap">
                          {form.watch("projectDescription")}
                        </p>
                      </div>
                    )}

                    {/* Line Items Summary */}
                    <div className="space-y-4">
                      <h3 className="text-xl font-semibold text-gray-900">Line Items</h3>
                      {quote.lineItems && quote.lineItems.length > 0 ? (
                        <div className="space-y-2">
                          {quote.lineItems.slice(0, 3).map((item, index) => (
                            <div key={index} className="flex justify-between py-2 border-b">
                              <span className="text-gray-700">{item.description}</span>
                              <span className="font-medium">
                                {formatCurrency(parseFloat(item.quantity) * parseFloat(item.unitPrice))}
                              </span>
                            </div>
                          ))}
                          {quote.lineItems.length > 3 && (
                            <p className="text-gray-500 text-sm italic">
                              ...and {quote.lineItems.length - 3} more items
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-gray-500">No line items</p>
                      )}
                    </div>

                    {/* Totals */}
                    <div className="border-t pt-4">
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span>Subtotal:</span>
                          <span>{formatCurrency(subtotal)}</span>
                        </div>
                        {discount > 0 && (
                          <div className="flex justify-between text-red-600">
                            <span>Discount:</span>
                            <span>-{formatCurrency(discount)}</span>
                          </div>
                        )}
                        {taxAmount > 0 && (
                          <div className="flex justify-between">
                            <span>Tax ({taxRate}%):</span>
                            <span>{formatCurrency(taxAmount)}</span>
                          </div>
                        )}
                        {shipping > 0 && (
                          <div className="flex justify-between">
                            <span>Shipping:</span>
                            <span>{formatCurrency(shipping)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-lg font-bold border-t pt-2">
                          <span>Total:</span>
                          <span className="text-green-600">{formatCurrency(total)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Terms Preview */}
                    <div className="space-y-4">
                      <h3 className="text-xl font-semibold text-gray-900">Terms & Conditions</h3>
                      <div className="space-y-3 text-sm text-gray-700">
                        <div>
                          <span className="font-medium">Payment Terms: </span>
                          {form.watch("paymentTerms") || QUOTE_TERMS.paymentTerms}
                        </div>
                        <div>
                          <span className="font-medium">Warranty: </span>
                          {form.watch("warranty") || QUOTE_TERMS.warranty}
                        </div>
                        {form.watch("additionalNotes") && (
                          <div>
                            <span className="font-medium">Additional Notes: </span>
                            <span className="whitespace-pre-wrap">{form.watch("additionalNotes")}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>
    </div>
  );
}