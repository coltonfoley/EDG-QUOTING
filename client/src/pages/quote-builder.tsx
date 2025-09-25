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
  });

  const createQuoteMutation = useMutation({
    mutationFn: async (data: any) => {
      // Step 1: Create or get account (business entity)
      // For now, we'll use the company name as the account name, or fallback to customer name
      const accountName = data.customerCompany || data.customerName || "Unknown Account";
      const accountResponse = await apiRequest("POST", "/api/accounts", {
        name: accountName,
        company: data.customerCompany || null,
        // Don't include email/phone in account - these belong to contacts
      });
      const account = await accountResponse.json();

      // Step 2: Create contact (individual person) associated with the account
      const [firstName, ...lastNameParts] = (data.customerName || "Unknown Customer").split(" ");
      const lastName = lastNameParts.join(" ") || "Customer";
      
      const contactResponse = await apiRequest("POST", "/api/contacts", {
        accountId: account.id,
        firstName,
        lastName,
        email: data.customerEmail,
        phone: data.customerPhone || null,
        role: "primary_contact",
        isPrimary: true,
      });
      const contact = await contactResponse.json();

      // Step 3: Create quote with both accountId and contactId
      const quoteData = {
        ...data,
        accountId: account.id,
        contactId: contact.id,
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
      
      // Update account (business) and contact (individual person) separately
      const accountId = quote?.account?.id || quote?.customer?.id;
      const contactId = quote?.contactId;
      
      if (accountId) {
        // Update account (business entity) - only company-related info
        const accountName = data.customerCompany || data.customerName || "Unknown Account";
        await apiRequest("PUT", `/api/accounts/${accountId}`, {
          name: accountName,
          company: data.customerCompany || null,
          // Don't include email/phone in account - these belong to contacts
        });
      }
      
      if (contactId) {
        // Update contact (individual person) - personal info
        const [firstName, ...lastNameParts] = (data.customerName || "Unknown Customer").split(" ");
        const lastName = lastNameParts.join(" ") || "Customer";
        
        await apiRequest("PUT", `/api/contacts/${contactId}`, {
          firstName,
          lastName,
          email: data.customerEmail,
          phone: data.customerPhone || null,
        });
      }

      // Update quote (remove customer fields that are now in account/contact)
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
    // Don't force customer data from database - let form data control it
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
    customerId: 0,
    accountId: null,
    contactId: null,
    assignedRepId: null,
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
