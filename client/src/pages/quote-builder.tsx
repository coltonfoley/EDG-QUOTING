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
import { Save, Loader2, FileText, CloudUpload, Copy, History, Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { QuoteWithDetails } from "@shared/schema";
import { QuickBooksSync } from "@/components/quickbooks-sync";
import { generateSimpleCostReport } from "@/lib/pdf-simple-cost-report";
import { COMPANY_INFO } from "@shared/companyConfig";

export default function QuoteBuilder() {
  const params = useParams();
  const id = params.id;
  
  const isNewQuote = !id || id === "new";
  const quoteId = id && id !== "new" ? parseInt(id) : undefined;
  
  const { toast } = useToast();
  const queryClient = useQueryClient();


  // State for proposal generator dialog
  const [proposalGeneratorOpen, setProposalGeneratorOpen] = useState(false);
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);

  const { data: quote, isLoading, error } = useQuery<QuoteWithDetails>({
    queryKey: [`/api/quotes/${quoteId}`],
    enabled: !isNewQuote,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    placeholderData: (previousData) => previousData,
  });

  // Query for quote versions
  const { data: versions } = useQuery<QuoteWithDetails[]>({
    queryKey: [`/api/quotes/${quoteId}/versions`],
    enabled: !isNewQuote && !!quoteId,
  });

  // Mutation to create a new version
  const createVersionMutation = useMutation({
    mutationFn: async () => {
      if (!quoteId) throw new Error("No quote ID");
      const response = await apiRequest("POST", `/api/quotes/${quoteId}/create-version`);
      return response.json();
    },
    onSuccess: (newVersion) => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      queryClient.invalidateQueries({ queryKey: [`/api/quotes/${quoteId}/versions`] });
      toast({ title: "New version created successfully" });
      // Navigate to the new version
      window.location.href = `/quotes/${newVersion.id}/edit`;
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create new version", variant: "destructive" });
    },
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
    onSuccess: (updatedQuote, variables) => {
      // Get the current cached quote to compare accountId
      const cachedQuote = queryClient.getQueryData([`/api/quotes/${quoteId}`]) as any;
      
      // If accountId actually changed (not just present in the update), invalidate to refetch full account details
      if (variables.accountId !== undefined && cachedQuote && variables.accountId !== cachedQuote.accountId) {
        queryClient.invalidateQueries({ queryKey: [`/api/quotes/${quoteId}`] });
      } else {
        // For other updates, use setQueryData to update cache without refetch
        queryClient.setQueryData([`/api/quotes/${quoteId}`], (oldData: any) => {
          if (!oldData) return oldData;
          return { ...oldData, ...updatedQuote };
        });
      }
      
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
      <div className="min-h-screen bg-background">
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
    projectName: "",
    projectAddress: "",
    jobsiteAddress: null,
    estimatedStartDate: "",
    notes: "",
    taxRate: "8.5",
    tariffRate: "0",
    discount: "0",
    shipping: "0",
    isShippingTaxable: false,
    dealStage: "new_lead",
    lostReason: null,
    contractTemplateId: null,
    customContractTerms: null,
    enableESignature: false,
    signingToken: null,
    clientSignatureData: null,
    clientSignedAt: null,
    clientSignedIp: null,
    companySignatureData: null,
    companySignedAt: null,
    companySignedIp: null,
    qbEstimateId: null,
    qbSyncStatus: null,
    qbSyncedAt: null,
    qbSyncError: null,
    parentQuoteId: null,
    versionNumber: 1,
    isLatestVersion: true,
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
      firstName: null,
      lastName: null,
      secondaryContacts: null,
      qbCustomerId: null,
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
      firstName: null,
      lastName: null,
      secondaryContacts: null,
      qbCustomerId: null,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    lineItems: [],
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <QuoteHeader
          quote={isNewQuote ? undefined : currentQuote}
          onSave={handleSaveQuote}
          isLoading={createQuoteMutation.isPending || updateQuoteMutation.isPending}
        />

        {/* Version Control Section */}
        {!isNewQuote && quote && (
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge variant="secondary" className="text-sm px-3 py-1" data-testid="badge-version">
                    Version {currentQuote.versionNumber}
                  </Badge>
                  {!currentQuote.isLatestVersion && (
                    <Badge variant="destructive" className="text-sm" data-testid="badge-old-version">
                      Old Version
                    </Badge>
                  )}
                  {versions && versions.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setVersionHistoryOpen(true)}
                      data-testid="button-view-versions"
                    >
                      <History className="h-4 w-4 mr-1" />
                      View History ({versions.length} versions)
                    </Button>
                  )}
                </div>
                <Button
                  onClick={() => createVersionMutation.mutate()}
                  disabled={createVersionMutation.isPending}
                  variant="outline"
                  data-testid="button-create-version"
                >
                  {createVersionMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Copy className="mr-2 h-4 w-4" />
                  )}
                  Create New Version
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Version History Dialog */}
        <Dialog open={versionHistoryOpen} onOpenChange={setVersionHistoryOpen}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Version History</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-4">
              {versions && versions.length > 0 ? (
                versions.map((version) => (
                  <Card key={version.id} className={version.id === quoteId ? "border-blue-500 border-2" : ""}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold">{version.quoteNumber}</h3>
                            {version.isLatestVersion && (
                              <Badge variant="default" className="text-xs">Latest</Badge>
                            )}
                            {version.id === quoteId && (
                              <Badge variant="outline" className="text-xs">Current</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Created: {version.createdAt ? new Date(version.createdAt).toLocaleDateString() : 'N/A'}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Project: {version.projectName || "Untitled"}
                          </p>
                        </div>
                        {version.id !== quoteId && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              window.location.href = `/quotes/${version.id}/edit`;
                            }}
                            data-testid={`button-view-version-${version.id}`}
                          >
                            View
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <p className="text-center text-muted-foreground py-8">No version history available</p>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Line Items Table - Show for both new and existing quotes */}
        <LineItemsTable
          quoteId={currentQuote.id || 0}
          lineItems={currentQuote.lineItems}
          tariffRate={currentQuote.tariffRate || "0"}
        />

        {/* Quote Summary - Show for both new and existing quotes */}
        <QuoteSummary
          quote={currentQuote}
          onUpdateQuote={handleUpdateQuote}
        />

        {/* Action Buttons - Show for existing quotes with line items */}
        {!isNewQuote && currentQuote.id && currentQuote.lineItems.length > 0 && (
          <div className="flex justify-end gap-4 mt-8 pb-8">
            <QuickBooksSync quote={currentQuote} />
            
            <Button 
              onClick={() => {
                if (!quote) return;
                generateSimpleCostReport({ 
                  quote, 
                  company: COMPANY_INFO 
                });
              }}
              variant="outline"
              className="px-6 py-3 text-lg"
              data-testid="button-print-with-costs"
            >
              <Printer className="mr-2 h-5 w-5" />
              Print with Costs
            </Button>
            
            <Button 
              onClick={() => setProposalGeneratorOpen(true)}
              variant="outline"
              className="px-6 py-3 text-lg border-edg-black text-edg-black hover:bg-edg-black hover:text-white"
              data-testid="button-generate-proposal"
            >
              <FileText className="mr-2 h-5 w-5" />
              Generate Proposal
            </Button>
          </div>
        )}

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
