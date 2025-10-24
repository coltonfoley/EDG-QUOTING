import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Building2, Briefcase, Edit, ChevronLeft, User, FolderPlus, Users, Mail, Phone, ChevronDown, ChevronRight, FileStack } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { AccountForm } from "@/components/forms/account-form";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Account, Quote, SecondaryContact } from "@shared/schema";
import { format } from "date-fns";
import { getDealStageColor, getDealStageLabel } from "@shared/dealStageConstants";

interface AccountDetails extends Account {
  quotes: Quote[];
  projectCount: number;
}

export default function AccountDetail() {
  const [match, params] = useRoute("/accounts/:id");
  const accountId = match ? parseInt(params.id) : null;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();
  
  const [editAccountOpen, setEditAccountOpen] = useState(false);
  const [expandedProjects, setExpandedProjects] = useState<Set<number>>(new Set());

  const { data: account, isLoading, error } = useQuery<AccountDetails>({
    queryKey: [`/api/accounts/${accountId}/details`],
    enabled: isAuthenticated && accountId !== null,
  });

  const handleAccountUpdated = () => {
    setEditAccountOpen(false);
    queryClient.invalidateQueries({ queryKey: [`/api/accounts/${accountId}/details`] });
    toast({
      title: "Client updated",
      description: "The client has been successfully updated.",
    });
  };

  const getAccountTypeColor = (type: string) => {
    switch (type) {
      case "general_contractor":
        return "bg-blue-100 text-blue-800";
      case "homeowner":
        return "bg-green-100 text-green-800";
      case "commercial":
        return "bg-purple-100 text-purple-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatAccountType = (type: string) => {
    return type.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };


  if (!accountId) {
    navigate("/accounts");
    return null;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Skeleton className="h-10 w-32 mb-8" />
          <div className="space-y-6">
            <Card>
              <CardContent className="p-6 space-y-4">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-56" />
              </CardContent>
            </Card>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardContent className="p-6 space-y-4">
                  <Skeleton className="h-6 w-32" />
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6 space-y-4">
                  <Skeleton className="h-6 w-32" />
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !account) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-gray-500">Client not found or you don't have permission to view it.</p>
              <Button 
                className="mt-4"
                onClick={() => navigate("/accounts")}
                data-testid="button-back-to-clients"
              >
                Back to Clients
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const secondaryContacts = Array.isArray(account?.secondaryContacts) 
    ? (account.secondaryContacts as SecondaryContact[]) 
    : [];

  // Group quotes by project (using parentQuoteId or self-reference)
  // Create a map of quote families
  const quoteMap = new Map<number, Quote[]>();
  
  account.quotes.forEach(quote => {
    const rootId = quote.parentQuoteId || quote.id;
    if (!quoteMap.has(rootId)) {
      quoteMap.set(rootId, []);
    }
    quoteMap.get(rootId)!.push(quote);
  });
  
  // Sort each group by version number and return as array
  const groupedQuotes = Array.from(quoteMap.values()).map(versions => {
    const sorted = versions.sort((a, b) => (a.versionNumber || 1) - (b.versionNumber || 1));
    const latestVersion = sorted.find(q => q.isLatestVersion) || sorted[sorted.length - 1];
    return {
      versions: sorted,
      latestVersion,
      projectName: latestVersion.projectName || latestVersion.quoteNumber,
      hasMultipleVersions: sorted.length > 1
    };
  }).sort((a, b) => {
    // Sort by latest version's creation date
    const aDate = new Date(a.latestVersion.createdAt || 0);
    const bDate = new Date(b.latestVersion.createdAt || 0);
    return bDate.getTime() - aDate.getTime();
  });

  const projectCount = groupedQuotes.length;

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Button */}
        <Button
          variant="ghost"
          onClick={() => navigate("/accounts")}
          className="mb-6"
          data-testid="button-back"
        >
          <ChevronLeft className="h-4 w-4 mr-2" />
          Back to Clients
        </Button>

        {/* Client Information Card */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <Building2 className="h-8 w-8 text-gray-600" />
                  <div>
                    <CardTitle className="text-2xl">
                      {account.company || account.name}
                    </CardTitle>
                    {(account.firstName || account.lastName) && (
                      <p className="text-sm text-gray-500 flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {account.firstName} {account.lastName}
                      </p>
                    )}
                    <p className="text-gray-600">{account.email} • {account.phone}</p>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Badge className={getAccountTypeColor(account.accountType)}>
                  {formatAccountType(account.accountType)}
                </Badge>
                <Button
                  onClick={() => setEditAccountOpen(true)}
                  size="sm"
                  data-testid="button-edit-client"
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Client
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <p className="text-sm text-gray-500">Payment Terms</p>
                <p className="font-medium">{account.paymentTerms?.replace('_', ' ').toUpperCase() || 'NET 30'}</p>
              </div>
              {account.billingAddress && (
                <div>
                  <p className="text-sm text-gray-500">Billing Address</p>
                  <p className="font-medium">{account.billingAddress}</p>
                </div>
              )}
              <div>
                <p className="text-sm text-gray-500">Created</p>
                <p className="font-medium">
                  {account.createdAt ? format(new Date(account.createdAt), 'MMM d, yyyy') : 'N/A'}
                </p>
              </div>
            </div>

            {/* Secondary Contacts Section */}
            {secondaryContacts.length > 0 && (
              <div className="mt-6 pt-6 border-t">
                <div className="flex items-center gap-2 mb-4">
                  <Users className="h-5 w-5 text-gray-600" />
                  <h3 className="text-lg font-semibold">Additional Contacts</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {secondaryContacts.map((contact) => (
                    <div 
                      key={contact.id} 
                      className="p-4 border rounded-lg bg-gray-50"
                      data-testid={`card-contact-${contact.id}`}
                    >
                      <div className="font-medium text-gray-900">
                        {contact.firstName} {contact.lastName}
                      </div>
                      {contact.role && (
                        <div className="text-sm text-gray-600 mt-1">
                          {contact.role}
                        </div>
                      )}
                      <div className="mt-3 space-y-1">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Mail className="h-3 w-3" />
                          <a href={`mailto:${contact.email}`} className="hover:text-blue-600">
                            {contact.email}
                          </a>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Phone className="h-3 w-3" />
                          <a href={`tel:${contact.phone}`} className="hover:text-blue-600">
                            {contact.phone}
                          </a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quotes Section - Full Width */}
        <div className="grid grid-cols-1 gap-6">
          {/* Quotes Section */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Briefcase className="h-5 w-5" />
                    Projects & Quotes
                  </CardTitle>
                  <CardDescription>
                    {projectCount} project{projectCount !== 1 ? 's' : ''} • {account.quotes?.length || 0} total quote{account.quotes?.length !== 1 ? 's' : ''}
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  onClick={() => navigate("/quotes")}
                  data-testid="button-new-quote"
                >
                  <FolderPlus className="h-4 w-4 mr-2" />
                  New Quote
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {groupedQuotes.length === 0 ? (
                  <p className="text-center py-8 text-gray-500">
                    No quotes yet. Create your first quote to get started.
                  </p>
                ) : (
                  groupedQuotes.map((project, index) => {
                    const mainQuote = project.latestVersion;
                    const rootId = mainQuote.parentQuoteId || mainQuote.id;
                    const isOpen = expandedProjects.has(rootId);
                    
                    const toggleExpanded = () => {
                      const newExpanded = new Set(expandedProjects);
                      if (isOpen) {
                        newExpanded.delete(rootId);
                      } else {
                        newExpanded.add(rootId);
                      }
                      setExpandedProjects(newExpanded);
                    };
                    
                    return (
                      <div 
                        key={mainQuote.id}
                        className="border rounded-lg overflow-hidden"
                        data-testid={`card-project-${index}`}
                      >
                        {/* Main Quote Display */}
                        <div 
                          className="p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                          onClick={() => navigate(`/quotes/${mainQuote.id}/edit`)}
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-gray-900">
                                  {mainQuote.projectName || mainQuote.quoteNumber}
                                </p>
                                {project.hasMultipleVersions && (
                                  <Badge variant="outline" className="text-xs">
                                    <FileStack className="h-3 w-3 mr-1" />
                                    {project.versions.length} versions
                                  </Badge>
                                )}
                                <Badge variant="secondary" className="text-xs">
                                  v{mainQuote.versionNumber || 1}
                                </Badge>
                              </div>
                              <p className="text-sm text-gray-500 mt-1">
                                {mainQuote.projectAddress || 'No address specified'}
                              </p>
                              <p className="text-sm text-gray-600 mt-2">
                                Latest: {mainQuote.createdAt ? format(new Date(mainQuote.createdAt), 'MMM d, yyyy') : 'N/A'}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge className={getDealStageColor(mainQuote.dealStage || 'new_lead')}>
                                {getDealStageLabel(mainQuote.dealStage || 'new_lead')}
                              </Badge>
                              {project.hasMultipleVersions && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleExpanded();
                                  }}
                                  data-testid={`button-toggle-versions-${index}`}
                                >
                                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Version History - Collapsible */}
                        {project.hasMultipleVersions && isOpen && (
                          <div className="border-t bg-gray-50 px-4 py-2">
                            <p className="text-xs font-medium text-gray-600 mb-2">All Versions:</p>
                            <div className="space-y-1">
                              {project.versions.map(version => (
                                <div
                                  key={version.id}
                                  className="flex items-center justify-between p-2 hover:bg-white rounded cursor-pointer transition-colors"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/quotes/${version.id}/edit`);
                                  }}
                                  data-testid={`card-version-${version.id}`}
                                >
                                  <div className="flex items-center gap-2 text-sm">
                                    <span className="font-mono text-gray-600">v{version.versionNumber || 1}</span>
                                    <span className="text-gray-500">{version.quoteNumber}</span>
                                    {version.isLatestVersion && (
                                      <Badge variant="default" className="text-xs">Latest</Badge>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-500">
                                      {version.createdAt ? format(new Date(version.createdAt), 'MMM d, yyyy') : 'N/A'}
                                    </span>
                                    <Badge className={getDealStageColor(version.dealStage || 'new_lead')} variant="outline">
                                      {getDealStageLabel(version.dealStage || 'new_lead')}
                                    </Badge>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edit Client Dialog */}
      <Dialog open={editAccountOpen} onOpenChange={setEditAccountOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Client</DialogTitle>
          </DialogHeader>
          <AccountForm 
            account={account}
            onSuccess={handleAccountUpdated}
            onCancel={() => setEditAccountOpen(false)}
          />
        </DialogContent>
      </Dialog>

    </div>
  );
}