import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppHeader } from "@/components/app-header";
import { QuoteHeader } from "@/components/quote-header";
import { ImageAssetsPreview } from "@/components/image-assets-preview";
import { LineItemsTable } from "@/components/line-items-table";
import { QuoteSummary } from "@/components/quote-summary";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { generateQuoteNumber } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadingSpinner } from "@/components/loading-spinner";
import { Save, Loader2 } from "lucide-react";
import type { QuoteWithDetails } from "@shared/schema";
import type { UploadedImage } from "@/components/image-uploader";

export default function QuoteBuilder() {
  const params = useParams();
  const id = params.id;
  
  const isNewQuote = !id || id === "new";
  const quoteId = id && id !== "new" ? parseInt(id) : undefined;
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State to track upload states from QuoteHeader
  const [uploadStates, setUploadStates] = useState<{
    portfolioImages: UploadedImage[];
    technicalDiagrams: UploadedImage[];
    companyImages: UploadedImage[];
  }>({
    portfolioImages: [],
    technicalDiagrams: [],
    companyImages: [],
  });

  const { data: quote, isLoading, error } = useQuery<QuoteWithDetails>({
    queryKey: [`/api/quotes/${quoteId}`],
    enabled: !isNewQuote,
  });

  const createQuoteMutation = useMutation({
    mutationFn: async (data: any) => {
      // First create or get account (using accounts endpoint)
      const accountResponse = await apiRequest("POST", "/api/accounts", {
        name: data.customerName,
        email: data.customerEmail,
        phone: data.customerPhone,
        company: data.customerCompany || null,
      });
      const account = await accountResponse.json();

      // Then create quote with accountId (and customerId for backward compatibility)
      const quoteData = {
        ...data,
        accountId: account.id,
        customerId: account.id, // Keep for backward compatibility
        quoteNumber: generateQuoteNumber(),
      };
      delete quoteData.customerName;
      delete quoteData.customerEmail;
      delete quoteData.customerPhone;
      delete quoteData.customerCompany;

      const quoteResponse = await apiRequest("POST", "/api/quotes", quoteData);
      return quoteResponse.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      toast({ title: "Quote created successfully" });
      // Navigate to the new quote
      window.history.replaceState(null, "", `/quotes/${data.id}`);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create quote", variant: "destructive" });
    },
  });

  const updateQuoteMutation = useMutation({
    mutationFn: async (data: any) => {
      if (!quoteId) throw new Error("No quote ID");
      
      // Update account first (check both quote.account and quote.customer for backward compatibility)
      const accountId = quote?.account?.id || quote?.customer?.id;
      if (accountId) {
        await apiRequest("PUT", `/api/accounts/${accountId}`, {
          name: data.customerName,
          email: data.customerEmail,
          phone: data.customerPhone,
          company: data.customerCompany || null,
        });
      }

      // Update quote
      const quoteData = { ...data };
      delete quoteData.customerName;
      delete quoteData.customerEmail;
      delete quoteData.customerPhone;
      delete quoteData.customerCompany;

      const response = await apiRequest("PUT", `/api/quotes/${quoteId}`, quoteData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/quotes/${quoteId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      toast({ title: "Quote updated successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update quote", variant: "destructive" });
    },
  });

  const handleSaveQuote = (data: any) => {
    if (isNewQuote) {
      createQuoteMutation.mutate(data);
    } else {
      updateQuoteMutation.mutate(data);
    }
  };

  const handleUpdateQuote = (field: string, value: any) => {
    if (!quote || !quoteId) return;
    
    // Use account data if available, fall back to customer for backward compatibility
    const customerData = quote.account || quote.customer;
    
    // Only send the specific field being updated, not the entire quote object
    updateQuoteMutation.mutate({
      [field]: value,
      customerName: customerData.name,
      customerEmail: customerData.email,
      customerPhone: customerData.phone,
      customerCompany: customerData.company || "",
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="space-y-6">
            {/* Header skeleton */}
            <Card>
              <CardContent className="p-6">
                <div className="space-y-4">
                  <Skeleton className="h-8 w-48" />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-24 w-full" />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            {/* Image assets skeleton */}
            <Card>
              <CardContent className="p-6">
                <Skeleton className="h-6 w-32 mb-4" />
                <div className="grid grid-cols-3 gap-4">
                  <Skeleton className="h-32 w-full" />
                  <Skeleton className="h-32 w-full" />
                  <Skeleton className="h-32 w-full" />
                </div>
              </CardContent>
            </Card>
            
            {/* Line items skeleton */}
            <Card>
              <CardContent className="p-6">
                <Skeleton className="h-6 w-40 mb-4" />
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              </CardContent>
            </Card>
            
            {/* Summary skeleton */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Skeleton className="lg:col-span-2 h-64" />
              <Skeleton className="h-64" />
            </div>
          </div>
        </div>
      </div>
    );
  }


  const currentQuote: QuoteWithDetails = quote || {
    id: 0,
    quoteNumber: "",
    customerId: 0,
    accountId: null,
    assignedRepId: null,
    projectName: "",
    projectAddress: "",
    jobsiteAddress: null,
    estimatedStartDate: "",
    notes: "",
    portfolioImages: [],
    technicalDiagrams: [],
    companyImages: [],
    taxRate: "8.5",
    discount: "0",
    shipping: "0",
    status: "draft" as const,
    dealStage: "new_lead",
    lostReason: null,
    contractTemplateId: null,
    customContractTerms: null,
    issuerSignature: null,
    issuerSignatureDate: null,
    customerSignature: null,
    customerSignatureDate: null,
    signatureStatus: "unsigned" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    account: { 
      id: 0, 
      name: "", 
      email: "", 
      phone: "", 
      company: null,
      accountType: "homeowner" as const,
      paymentTerms: null,
      billingAddress: null,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    customer: { 
      id: 0, 
      name: "", 
      email: "", 
      phone: "", 
      company: null,
      accountType: "homeowner" as const,
      paymentTerms: null,
      billingAddress: null,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    lineItems: [],
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <QuoteHeader
          quote={isNewQuote ? undefined : currentQuote}
          onSave={handleSaveQuote}
          isLoading={createQuoteMutation.isPending || updateQuoteMutation.isPending}
          onUploadStatesChange={setUploadStates}
        />

        {/* Image Assets Preview - Show for both new and existing quotes */}
        <ImageAssetsPreview
          portfolioImages={currentQuote.portfolioImages as any[]}
          technicalDiagrams={currentQuote.technicalDiagrams as any[]}
          companyImages={currentQuote.companyImages as any[]}
          uploadedPortfolioImages={uploadStates.portfolioImages}
          uploadedTechnicalDiagrams={uploadStates.technicalDiagrams}
          uploadedCompanyImages={uploadStates.companyImages}
        />

        {/* Line Items Table - Show for both new and existing quotes */}
        <LineItemsTable
          quoteId={currentQuote.id || 0}
          lineItems={currentQuote.lineItems}
        />

        {/* Quote Summary - Show for both new and existing quotes */}
        <QuoteSummary
          quote={currentQuote}
          onUpdateQuote={handleUpdateQuote}
        />

        {/* Save Button - Show for both new and existing quotes */}
        <div className="flex justify-end mt-8 pb-8">
          <Button 
            type="submit" 
            form="quote-form" 
            className="bg-edg-black hover:bg-edg-grey text-edg-white px-8 py-3 text-lg"
            disabled={createQuoteMutation.isPending || updateQuoteMutation.isPending}
          >
            {(createQuoteMutation.isPending || updateQuoteMutation.isPending) ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-5 w-5" />
                {isNewQuote ? "Create Quote" : "Save Changes"}
              </>
            )}
          </Button>
        </div>

      </div>
    </div>
  );
}
