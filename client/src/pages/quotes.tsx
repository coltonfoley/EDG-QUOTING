import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, FileText, Users, DollarSign, Search, Upload, Trash2, Loader2, CheckCircle2, Clock, FileSignature } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { getDealStageColor, getDealStageLabel } from "@shared/dealStageConstants";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { LoadingSpinner } from "@/components/loading-spinner";
import { SimpleProposalGenerator } from "@/components/simple-proposal-generator";
import { QuoteImporter } from "@/components/quote-importer";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { QuoteWithDetails } from "@shared/schema";

export default function Quotes() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedQuoteForProposal, setSelectedQuoteForProposal] = useState<QuoteWithDetails | null>(null);
  const [proposalGeneratorOpen, setProposalGeneratorOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  
  const { data: quotes, isLoading, error } = useQuery<QuoteWithDetails[]>({
    queryKey: ["/api/quotes"],
    enabled: isAuthenticated,
  });

  // Delete mutation
  const deleteQuoteMutation = useMutation({
    mutationFn: async (quoteId: number) => {
      return await apiRequest("DELETE", `/api/quotes/${quoteId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      toast({
        title: "Quote deleted",
        description: "The quote has been successfully deleted.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete quote. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        navigate("/auth");
      }, 500);
      return;
    }
  }, [isAuthenticated, authLoading, toast]);

  // Handle unauthorized errors
  useEffect(() => {
    if (error && isUnauthorizedError(error as Error)) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        navigate("/auth");
      }, 500);
      return;
    }
  }, [error, toast]);

  const filteredQuotes = useMemo(() => {
    if (!quotes || !searchTerm.trim()) return quotes;
    
    const term = searchTerm.toLowerCase();
    return quotes.filter(quote => 
      quote.quoteNumber.toLowerCase().includes(term) ||
      (quote.account && quote.account.name.toLowerCase().includes(term)) ||
      (quote.account && quote.account.email.toLowerCase().includes(term)) ||
      (quote.account?.company && quote.account.company.toLowerCase().includes(term)) ||
      (quote.projectName && quote.projectName.toLowerCase().includes(term)) ||
      (quote.projectAddress && quote.projectAddress.toLowerCase().includes(term))
    );
  }, [quotes, searchTerm]);


  const totalQuotes = quotes?.length || 0;
  const totalValue = quotes?.reduce((sum, quote) => {
    const lineItemsTotal = quote.lineItems.reduce((itemSum, item) => {
      const qty = parseFloat(item.quantity.toString());
      const price = parseFloat(item.unitPrice.toString());
      const markup = parseFloat(item.markupValue.toString());
      const baseTotal = qty * price;
      const total = item.markupType === 'percentage' 
        ? baseTotal + (baseTotal * (markup / 100))
        : baseTotal + markup;
      return itemSum + total;
    }, 0);
    return sum + lineItemsTotal;
  }, 0) || 0;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header skeleton */}
          <div className="flex justify-between items-center mb-8">
            <div>
              <Skeleton className="h-9 w-48 mb-2" />
              <Skeleton className="h-5 w-64" />
            </div>
            <div className="flex space-x-4">
              <Skeleton className="h-10 w-32" />
              <Skeleton className="h-10 w-32" />
              <Skeleton className="h-10 w-32" />
            </div>
          </div>
          
          {/* Stats cards skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <div className="flex items-center">
                    <Skeleton className="h-8 w-8 rounded" />
                    <div className="ml-4 space-y-2">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-7 w-24" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          
          {/* Table skeleton */}
          <Card>
            <CardContent className="p-0">
              <div className="p-4 space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center space-x-4 p-4 border-b">
                    <Skeleton className="h-10 w-20" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-5 w-48" />
                      <Skeleton className="h-4 w-64" />
                    </div>
                    <Skeleton className="h-6 w-24" />
                    <Skeleton className="h-9 w-20" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-8 space-y-4 sm:space-y-0">
          <div>
            <h2 className="text-3xl font-bold text-edg-black">Project Quotes</h2>
            <p className="text-edg-grey mt-2">Manage your patio & shade project estimates</p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-edg-grey h-4 w-4" />
              <Input
                placeholder="Search quotes, accounts, projects..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 w-full sm:w-80"
              />
            </div>


            <Button 
              variant="outline" 
              onClick={() => setImportDialogOpen(true)}
              className="w-full sm:w-auto"
              data-testid="button-import-pdf"
            >
              <Upload className="mr-2 h-4 w-4" />
              Import PDF
            </Button>
            <Link href="/quotes/new">
              <Button className="bg-edg-black hover:bg-edg-grey text-edg-white w-full sm:w-auto">
                <Plus className="mr-2 h-4 w-4" />
                New Quote
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <FileText className="h-8 w-8 text-edg-teal" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-edg-grey">Total Quotes</p>
                  <p className="text-2xl font-bold text-edg-black">{totalQuotes}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <DollarSign className="h-8 w-8 text-edg-teal" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-edg-grey">Total Value</p>
                  <p className="text-2xl font-bold text-edg-black">{formatCurrency(totalValue)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Users className="h-8 w-8 text-edg-teal" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-edg-grey">Active Accounts</p>
                  <p className="text-2xl font-bold text-edg-black">{new Set(quotes?.filter(q => q.account).map(q => q.account?.id).filter(Boolean)).size || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quotes Table */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-3 sm:space-y-0">
              <CardTitle>Recent Quotes</CardTitle>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-edg-grey h-4 w-4" />
                <Input
                  placeholder="Search quotes..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-full sm:w-64"
                />
              </div>
            </div>
            {searchTerm && (
              <p className="text-sm text-edg-grey mt-2">
                Found {filteredQuotes?.length || 0} quote{filteredQuotes?.length !== 1 ? 's' : ''} matching "{searchTerm}"
              </p>
            )}
          </CardHeader>
          <CardContent>
            {!quotes || quotes.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No quotes yet</h3>
                <p className="mt-1 text-sm text-gray-500">Get started by creating your first quote.</p>
                <div className="mt-6 flex flex-col sm:flex-row gap-3 items-center justify-center">
                  <Link href="/quotes/new">
                    <Button className="bg-edg-black hover:bg-edg-grey text-edg-white">
                      <Plus className="mr-2 h-4 w-4" />
                      New Quote
                    </Button>
                  </Link>
                  <Button 
                    variant="outline" 
                    onClick={() => setImportDialogOpen(true)}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Import PDF
                  </Button>
                </div>
              </div>
            ) : filteredQuotes && filteredQuotes.length === 0 ? (
              <div className="text-center py-12">
                <Search className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No quotes found</h3>
                <p className="mt-1 text-sm text-gray-500">Try adjusting your search terms.</p>
                <div className="mt-6">
                  <Button 
                    variant="outline" 
                    onClick={() => setSearchTerm("")}
                  >
                    Clear Search
                  </Button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-edg-grey uppercase tracking-wider">
                        Quote #
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-edg-grey uppercase tracking-wider">
                        Account
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-edg-grey uppercase tracking-wider">
                        Project
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-edg-grey uppercase tracking-wider">
                        Workflow
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-edg-grey uppercase tracking-wider">
                        Signature
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-edg-grey uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-edg-grey uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {(filteredQuotes || quotes).map((quote) => {
                      const total = quote.lineItems.reduce((sum, item) => {
                        const qty = parseFloat(item.quantity.toString());
                        const price = parseFloat(item.unitPrice.toString());
                        const markup = parseFloat(item.markupValue.toString());
                        const baseTotal = qty * price;
                        const itemTotal = item.markupType === 'percentage' 
                          ? baseTotal + (baseTotal * (markup / 100))
                          : baseTotal + markup;
                        return sum + itemTotal;
                      }, 0);

                      return (
                        <tr key={quote.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 text-sm font-medium text-edg-teal">
                            <Link href={`/quotes/${quote.id}/edit`} className="hover:underline">
                              {quote.quoteNumber}
                            </Link>
                          </td>
                          <td className="px-6 py-4 text-sm text-edg-black">
                            <div>
                              <div className="font-medium">
                                {quote.account?.name === 'Unnamed Client' && quote.account?.company 
                                  ? quote.account.company 
                                  : quote.account?.name || 'Unassigned Quote'}
                              </div>
                              {quote.account?.company && quote.account?.name !== 'Unnamed Client' && (
                                <div className="text-xs text-edg-grey">{quote.account.company}</div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-edg-black">
                            {quote.projectName}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <Badge className={getDealStageColor(quote.dealStage)}>
                              {getDealStageLabel(quote.dealStage)}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 text-center">
                            {quote.enableESignature ? (
                              quote.clientSignedAt && quote.companySignedAt ? (
                                <Badge className="bg-green-100 text-green-800 hover:bg-green-100" data-testid={`badge-signature-complete-${quote.id}`}>
                                  <CheckCircle2 className="w-3 h-3 mr-1" />
                                  Fully Signed
                                </Badge>
                              ) : quote.clientSignedAt ? (
                                <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100" data-testid={`badge-signature-client-${quote.id}`}>
                                  <FileSignature className="w-3 h-3 mr-1" />
                                  Client Signed
                                </Badge>
                              ) : (
                                <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100" data-testid={`badge-signature-pending-${quote.id}`}>
                                  <Clock className="w-3 h-3 mr-1" />
                                  Pending Client
                                </Badge>
                              )
                            ) : (
                              <span className="text-gray-400 text-xs">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm font-medium text-edg-black text-right">
                            {formatCurrency(total)}
                          </td>
                          <td className="px-6 py-4 text-center text-sm">
                            <div className="flex items-center justify-center space-x-2">
                              <Link href={`/quotes/${quote.id}/edit`}>
                                <Button variant="ghost" size="sm" className="text-edg-teal hover:text-edg-dark-teal" data-testid={`button-edit-quote-${quote.id}`}>
                                  Edit
                                </Button>
                              </Link>
                              
                              {/* Generate Proposal Button - Only show if quote has line items */}
                              {quote.lineItems.length > 0 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={async () => {
                                    // Fetch fresh quote data with contract template relation
                                    try {
                                      const response = await apiRequest('GET', `/api/quotes/${quote.id}`);
                                      const freshQuote = await response.json();
                                      setSelectedQuoteForProposal(freshQuote);
                                      setProposalGeneratorOpen(true);
                                    } catch (error) {
                                      toast({
                                        title: "Error",
                                        description: "Failed to load quote data",
                                        variant: "destructive"
                                      });
                                    }
                                  }}
                                  className="text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                                  data-testid={`button-generate-proposal-${quote.id}`}
                                >
                                  <FileText className="h-4 w-4" />
                                </Button>
                              )}
                              
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="text-red-600 hover:text-red-800 hover:bg-red-50"
                                    data-testid={`button-delete-quote-${quote.id}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Quote</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to delete quote {quote.quoteNumber}? This action cannot be undone and will also delete all associated line items.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel data-testid={`button-cancel-delete-${quote.id}`}>Cancel</AlertDialogCancel>
                                    <AlertDialogAction 
                                      onClick={() => deleteQuoteMutation.mutate(quote.id)}
                                      className="bg-red-600 hover:bg-red-700"
                                      disabled={deleteQuoteMutation.isPending}
                                      data-testid={`button-confirm-delete-${quote.id}`}
                                    >
                                      {deleteQuoteMutation.isPending && (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      )}
                                      {deleteQuoteMutation.isPending ? "Deleting..." : "Delete"}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Simple Proposal Generator Dialog */}
        {selectedQuoteForProposal && (
          <SimpleProposalGenerator
            quote={selectedQuoteForProposal}
            open={proposalGeneratorOpen}
            onOpenChange={(open) => {
              setProposalGeneratorOpen(open);
              if (!open) {
                setSelectedQuoteForProposal(null);
              }
            }}
          />
        )}

        {/* Quote Importer */}
        <QuoteImporter
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          onImportComplete={(importedCount) => {
            toast({
              title: "Import Completed",
              description: `Successfully imported ${importedCount} quote${importedCount !== 1 ? 's' : ''}`,
            });
          }}
        />
      </div>
    </div>
  );
}
