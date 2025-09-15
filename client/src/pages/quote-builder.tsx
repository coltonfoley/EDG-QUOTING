import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppHeader } from "@/components/app-header";
import { QuoteHeader } from "@/components/quote-header";
import { ImageAssetsPreview } from "@/components/image-assets-preview";
import { LineItemsTable } from "@/components/line-items-table";
import { QuoteSummary } from "@/components/quote-summary";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { generateQuoteNumber } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Save } from "lucide-react";
import type { QuoteWithDetails } from "@shared/schema";
import type { UploadedImage } from "@/components/image-uploader";

export default function QuoteBuilder() {
  const { id } = useParams();
  const isNewQuote = !id || id === "new";
  const quoteId = id && id !== "new" ? parseInt(id) : undefined;
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State to track upload states from QuoteHeader
  const [uploadStates, setUploadStates] = useState<{
    projectImages: UploadedImage[];
    portfolioImages: UploadedImage[];
    technicalDiagrams: UploadedImage[];
    companyImages: UploadedImage[];
  }>({
    projectImages: [],
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
      // First create or get customer
      const customerResponse = await apiRequest("POST", "/api/customers", {
        name: data.customerName,
        email: data.customerEmail,
        phone: data.customerPhone,
        company: data.customerCompany || null,
      });
      const customer = await customerResponse.json();

      // Then create quote
      const quoteData = {
        ...data,
        customerId: customer.id,
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
      
      // Update customer first
      if (quote?.customer) {
        await apiRequest("PUT", `/api/customers/${quote.customer.id}`, {
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
    
    // Only send the specific field being updated, not the entire quote object
    updateQuoteMutation.mutate({
      [field]: value,
      customerName: quote.customer.name,
      customerEmail: quote.customer.email,
      customerPhone: quote.customer.phone,
      customerCompany: quote.customer.company || "",
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="space-y-6">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-96 w-full" />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Skeleton className="lg:col-span-2 h-64" />
              <Skeleton className="h-64" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-red-600">Error loading quote</h2>
            <p className="text-accent-grey mt-2">Please try again later.</p>
          </div>
        </div>
      </div>
    );
  }

  const currentQuote = quote || {
    id: 0,
    quoteNumber: "",
    customerId: 0,
    projectName: "",
    projectAddress: "",
    estimatedStartDate: "",
    notes: "",
    projectImages: [],
    portfolioImages: [],
    technicalDiagrams: [],
    companyImages: [],
    taxRate: "8.5",
    discount: "0",
    shipping: "0",
    status: "draft",
    contractTemplateId: null,
    customContractTerms: null,
    issuerSignature: null,
    issuerSignatureDate: null,
    customerSignature: null,
    customerSignatureDate: null,
    signatureStatus: "unsigned",
    docusignEnvelopeId: null,
    docusignStatus: null,
    docusignSentDate: null,
    docusignViewUrl: null,
    createdAt: new Date(),
    customer: { id: 0, name: "", email: "", phone: "", company: null },
    lineItems: [],
  } as QuoteWithDetails;

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
          projectImages={currentQuote.projectImages as any[]}
          portfolioImages={currentQuote.portfolioImages as any[]}
          technicalDiagrams={currentQuote.technicalDiagrams as any[]}
          companyImages={currentQuote.companyImages as any[]}
          uploadedProjectImages={uploadStates.projectImages}
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
            <Save className="mr-2 h-5 w-5" />
            {isNewQuote ? "Create Quote" : "Save Changes"}
          </Button>
        </div>

      </div>
    </div>
  );
}
