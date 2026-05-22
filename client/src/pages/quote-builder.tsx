import { useLocation, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, Suspense } from "react";
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
import { lazyWithReload } from "@/lib/lazy-with-reload";

const SimpleProposalGenerator = lazyWithReload(() => import("@/components/simple-proposal-generator").then(m => ({ default: m.SimpleProposalGenerator })), "simple-proposal-generator");
import { Archive, CheckCircle2, Loader2, Copy, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { QuoteWithDetails } from "@shared/schema";

export default function QuoteBuilder() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const id = params.id;
  
  const isNewQuote = !id || id === "new";
  const quoteId = id && id !== "new" ? parseInt(id) : undefined;
  
  const { toast } = useToast();
  const queryClient = useQueryClient();


  // State for proposal generator dialog
  const [proposalGeneratorOpen, setProposalGeneratorOpen] = useState(false);
  const [isPreparingProposal, setIsPreparingProposal] = useState(false);
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);

  const { data: quote, isLoading, error } = useQuery<QuoteWithDetails>({
    queryKey: [`/api/quotes/${quoteId}`],
    enabled: !isNewQuote,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    placeholderData: (previousData: QuoteWithDetails | undefined) => previousData,
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

  const useVersionMutation = useMutation({
    mutationFn: async (versionId: number) => {
      const response = await apiRequest("POST", `/api/quotes/${versionId}/use-version`);
      return response.json() as Promise<QuoteWithDetails>;
    },
    onSuccess: (updatedVersion) => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      queryClient.invalidateQueries({ queryKey: [`/api/quotes/${quoteId}/versions`] });
      queryClient.invalidateQueries({ queryKey: [`/api/quotes/${updatedVersion.id}/versions`] });
      queryClient.invalidateQueries({ queryKey: [`/api/quotes/${quoteId}`] });
      queryClient.setQueryData([`/api/quotes/${updatedVersion.id}`], updatedVersion);
      toast({
        title: "Current version updated",
        description: `${updatedVersion.quoteNumber} is now the version shown on the main quote list.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Could not update current version",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
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
      setLocation(`/quotes/${data.id}/edit`, { replace: true });
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

  const waitForPendingQuoteSaves = async (timeoutMs = 3000) => {
    const startedAt = Date.now();
    while (queryClient.isMutating() > 0 && Date.now() - startedAt < timeoutMs) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  };

  const openProposalGenerator = async () => {
    if (!quoteId) return;

    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) {
      activeElement.blur();
    }

    setIsPreparingProposal(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 100));
      await waitForPendingQuoteSaves();
      await queryClient.fetchQuery({ queryKey: [`/api/quotes/${quoteId}`] });
      setProposalGeneratorOpen(true);
    } catch (error: any) {
      toast({
        title: "Could not prepare proposal",
        description: error?.message || "Please try again after the quote finishes saving.",
        variant: "destructive",
      });
    } finally {
      setIsPreparingProposal(false);
    }
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
    jobsiteAddress: null,
    jobsiteStreetAddress: null,
    jobsiteAddressLine2: null,
    jobsiteCity: null,
    jobsiteState: null,
    jobsiteZipCode: null,
    jobsiteCountry: null,
    jobsitePlaceId: null,
    estimatedStartDate: "",
    notes: "",
    internalNotes: "",
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
    signedDocumentSnapshot: null,
    signatureAuditTrail: null,
    signatureEmailSentAt: null,
    signatureEmailMessage: null,
    esigIncludePricing: true,
    esigIncludeImages: false,
    esigIncludeContract: true,
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
      streetAddress: null,
      addressLine2: null,
      city: null,
      state: null,
      zipCode: null,
      country: null,
      placeId: null,
      firstName: null,
      lastName: null,
      secondaryContacts: null,
      qbCustomerId: null,
      leadStatus: null,
      leadSource: null,
      leadProjectType: null,
      leadMessage: null,
      leadReceivedAt: null,
      leadLastContactedAt: null,
      leadConvertedAt: null,
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
      streetAddress: null,
      addressLine2: null,
      city: null,
      state: null,
      zipCode: null,
      country: null,
      placeId: null,
      firstName: null,
      lastName: null,
      secondaryContacts: null,
      qbCustomerId: null,
      leadStatus: null,
      leadSource: null,
      leadProjectType: null,
      leadMessage: null,
      leadReceivedAt: null,
      leadLastContactedAt: null,
      leadConvertedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    lineItems: [],
  };
  const isArchivedVersion = currentQuote.isLatestVersion === false;

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
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-3">
                  <Badge variant="secondary" className="text-sm px-3 py-1" data-testid="badge-version">
                    Version {currentQuote.versionNumber}
                  </Badge>
                  {currentQuote.isLatestVersion ? (
                    <Badge className="text-sm bg-emerald-100 text-emerald-800 hover:bg-emerald-100" data-testid="badge-current-version">
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                      Current Version
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-sm bg-slate-100 text-slate-700 hover:bg-slate-100" data-testid="badge-archived-version">
                      <Archive className="mr-1 h-3 w-3" />
                      Archived
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
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  {isArchivedVersion && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          variant="default"
                          className="bg-edg-black text-edg-white hover:bg-edg-grey"
                          disabled={useVersionMutation.isPending}
                          data-testid="button-use-this-version"
                        >
                          {useVersionMutation.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                          )}
                          Use This Version
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Use this quote version?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will move {currentQuote.quoteNumber} back to the main quote list and archive the other versions for this project. No quote data will be deleted.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => useVersionMutation.mutate(currentQuote.id)}>
                            Use This Version
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
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
              </div>
              {isArchivedVersion && (
                <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="archived-version-warning">
                  This version is archived for history. Make it current before sending it to a customer or Ops.
                </div>
              )}
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
                versions.map((version) => {
                  const versionIsCurrent = version.isLatestVersion;
                  const versionHasSignatureActivity = Boolean(version.clientSignedAt || version.companySignedAt || version.signatureEmailSentAt);

                  return (
                  <Card key={version.id} className={version.id === quoteId ? "border-blue-500 border-2" : ""}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold">{version.quoteNumber}</h3>
                            {versionIsCurrent ? (
                              <Badge className="text-xs bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Current</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs bg-slate-100 text-slate-700 hover:bg-slate-100">Archived</Badge>
                            )}
                            {version.id === quoteId && (
                              <Badge variant="outline" className="text-xs">Open</Badge>
                            )}
                            {versionHasSignatureActivity && (
                              <Badge variant="outline" className="text-xs">Signature Activity</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Created: {version.createdAt ? new Date(version.createdAt).toLocaleDateString() : 'N/A'}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Project: {version.projectName || "Untitled"}
                          </p>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          {!versionIsCurrent && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="default"
                                  size="sm"
                                  className="bg-edg-black text-edg-white hover:bg-edg-grey"
                                  disabled={useVersionMutation.isPending}
                                  data-testid={`button-use-version-${version.id}`}
                                >
                                  Use This Version
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Use {version.quoteNumber}?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will make this quote the current version and archive the others. No quote data will be deleted.
                                    {versionHasSignatureActivity ? " This version has signature history, and that record will stay attached to it." : ""}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => useVersionMutation.mutate(version.id)}>
                                    Use This Version
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
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
                      </div>
                    </CardContent>
                  </Card>
                  );
                })
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
          onGenerateProposal={!isNewQuote && currentQuote.id ? openProposalGenerator : undefined}
          isPreparingProposal={isPreparingProposal}
        />

        {/* Simple Proposal Generator Dialog */}
        {!isNewQuote && currentQuote.id && proposalGeneratorOpen && (
          <Suspense fallback={null}>
            <SimpleProposalGenerator
              quote={currentQuote}
              open={proposalGeneratorOpen}
              onOpenChange={setProposalGeneratorOpen}
            />
          </Suspense>
        )}

      </div>
    </div>
  );
}
