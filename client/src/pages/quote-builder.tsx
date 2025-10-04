import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppHeader } from "@/components/app-header";
import { QuoteHeader } from "@/components/quote-header";
import { LineItemsTable } from "@/components/line-items-table";
import { QuoteSummary } from "@/components/quote-summary";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { generateQuoteNumber } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadingSpinner } from "@/components/loading-spinner";
import { SimpleProposalGenerator } from "@/components/simple-proposal-generator";
import { Save, Loader2, FileText } from "lucide-react";
import type { QuoteWithDetails } from "@shared/schema";

export default function QuoteBuilder() {
  const params = useParams();
  const id = params.id;
  
  const isNewQuote = !id || id === "new";
  const quoteId = id && id !== "new" ? parseInt(id) : undefined;
  
  const { toast } = useToast();
  const queryClient = useQueryClient();


  // State for proposal generator dialog
  const [proposalGeneratorOpen, setProposalGeneratorOpen] = useState(false);

  const { data: quote, isLoading, error } = useQuery<QuoteWithDetails>({
    queryKey: [`/api/quotes/${quoteId}`],
    enabled: !isNewQuote,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    placeholderData: (previousData) => previousData,
  });

  const createQuoteMutation = useMutation({
    mutationFn: async (data: any) => {
      // Check if accountId is already provided (existing account selected)
      let accountId = data.accountId;
      
      // Only create new account if no accountId is provided
      if (!accountId && (data.accountName || data.accountEmail)) {
        const accountResponse = await apiRequest("POST", "/api/accounts", {
          name: data.accountName,
          email: data.accountEmail,
          phone: data.accountPhone,
          company: data.accountCompany || null,
        });
        const account = await accountResponse.json();
        accountId = account.id;
      }

      // Create quote with accountId (either existing or newly created)
      const quoteData = {
        ...data,
        accountId,
        quoteNumber: generateQuoteNumber(),
      };
      
      // Clean up account creation fields
      delete quoteData.accountName;
      delete quoteData.accountEmail;
      delete quoteData.accountPhone;
      delete quoteData.accountCompany;

      const quoteResponse = await apiRequest("POST", "/api/quotes", quoteData);
      return quoteResponse.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      toast({ title: "Quote created successfully" });
      // Navigate to the new quote edit page
      window.history.replaceState(null, "", `/quotes/${data.id}/edit`);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create quote", variant: "destructive" });
    },
  });

  const updateQuoteMutation = useMutation({
    mutationFn: async (data: any) => {
      if (!quoteId) throw new Error("No quote ID");
      
      // Now we support changing the account relationship directly via accountId
      // No need to update account details here since we're selecting from existing accounts
      
      // Update quote with the new data (including accountId if changed)
      const quoteData = { ...data };
      
      const response = await apiRequest("PUT", `/api/quotes/${quoteId}`, quoteData);
      return response.json();
    },
    onSuccess: (updatedQuote) => {
      // Use setQueryData to update the cache without triggering refetches
      queryClient.setQueryData([`/api/quotes/${quoteId}`], (oldData: any) => {
        if (!oldData) return oldData;
        return { ...oldData, ...updatedQuote };
      });
      
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
    accountId: null,
    contactId: null,
    projectName: "",
    projectAddress: "",
    jobsiteAddress: null,
    estimatedStartDate: "",
    notes: "",
    taxRate: "8.5",
    discount: "0",
    shipping: "0",
    dealStage: "new_lead",
    lostReason: null,
    contractTemplateId: null,
    customContractTerms: null,
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

        {/* Action Buttons - Show for both new and existing quotes */}
        <div className="flex justify-end gap-4 mt-8 pb-8">
          {/* Generate Proposal Button - Only show for existing quotes with line items */}
          {!isNewQuote && currentQuote.id && currentQuote.lineItems.length > 0 && (
            <Button 
              onClick={() => setProposalGeneratorOpen(true)}
              variant="outline"
              className="px-6 py-3 text-lg border-edg-black text-edg-black hover:bg-edg-black hover:text-white"
              data-testid="button-generate-proposal"
            >
              <FileText className="mr-2 h-5 w-5" />
              Generate Proposal
            </Button>
          )}
          
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

        {/* Simple Proposal Generator Dialog */}
        {!isNewQuote && currentQuote.id && (
          <SimpleProposalGenerator
            quote={currentQuote}
            open={proposalGeneratorOpen}
            onOpenChange={setProposalGeneratorOpen}
          />
        )}

      </div>
    </div>
  );
}
