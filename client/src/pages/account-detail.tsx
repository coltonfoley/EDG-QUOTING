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
import { Building2, Briefcase, Edit, ChevronLeft, User, FolderPlus, Users, Mail, Phone, ChevronDown, ChevronRight, FileStack, Inbox, FileText, ExternalLink, Images } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { AccountForm } from "@/components/forms/account-form";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Account, LeadAttachment, PlanningAgreement, Quote, SecondaryContact } from "@shared/schema";
import { format } from "date-fns";
import { getDealStageColor, getDealStageLabel } from "@shared/dealStageConstants";
import type { LeadWorkflowStatus } from "@shared/leadWorkflow";

type AccountInquiry = {
  id: number;
  workflowStatus: LeadWorkflowStatus;
  storedStatus: string;
  source?: string | null;
  projectType?: string | null;
  message?: string | null;
  location?: string | null;
  receivedAt: string;
  convertedQuoteId?: number | null;
  assessmentReason?: string | null;
  archiveReason?: string | null;
  attachments?: LeadAttachment[];
};

interface AccountDetails extends Account {
  quotes: Quote[];
  planningAgreements?: (PlanningAgreement & { quote?: Quote })[];
  projectCount: number;
  attachments?: LeadAttachment[];
  leadAttachments?: LeadAttachment[];
  inquiries?: AccountInquiry[];
}

const planningStatusLabels: Record<string, string> = {
  required: "Required",
  sent: "Sent",
  signed_awaiting_payment: "Signed, Awaiting Payment",
  paid_active: "Paid / Active",
  delivered: "Delivered",
  credited: "Credited",
  waived: "Waived",
  expired: "Expired",
  canceled: "Canceled",
};

const planningStatusColors: Record<string, string> = {
  required: "border-amber-200 bg-amber-50 text-amber-900",
  sent: "border-blue-200 bg-blue-50 text-blue-900",
  signed_awaiting_payment: "border-indigo-200 bg-indigo-50 text-indigo-900",
  paid_active: "border-emerald-200 bg-emerald-50 text-emerald-900",
  delivered: "border-emerald-200 bg-emerald-50 text-emerald-900",
  credited: "border-teal-200 bg-teal-50 text-teal-900",
  waived: "border-slate-200 bg-slate-50 text-slate-900",
  expired: "border-red-200 bg-red-50 text-red-900",
  canceled: "border-slate-200 bg-slate-50 text-slate-900",
};

function getAccountLeadAttachments(account?: AccountDetails) {
  if (!account) return [];
  return account.leadAttachments?.length
    ? account.leadAttachments
    : account.attachments || [];
}

function formatAttachmentSize(bytes?: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  const leadAttachments = getAccountLeadAttachments(account);

  const handleAccountUpdated = () => {
    setEditAccountOpen(false);
    queryClient.invalidateQueries({ queryKey: [`/api/accounts/${accountId}/details`] });
    queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
    queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
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

  const formatLeadStatus = (status: string) => {
    const labels: Record<string, string> = {
      new: "New",
      draft_ready: "Draft Ready",
      contacted: "Contacted",
      archived: "Archived / Disqualified",
    };
    return labels[status] || status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  const extractLeadMessage = (message?: string | null) => {
    if (!message) return null;
    const match = message.match(/Message:\s*([\s\S]*?)(?:\n\nMetadata:|$)/);
    return (match?.[1] || message).trim();
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
              {(account.streetAddress || account.city) && (
                <div>
                  <p className="text-sm text-gray-500">Billing Address</p>
                  <p className="font-medium">
                    {account.streetAddress}
                    {account.addressLine2 && `, ${account.addressLine2}`}
                    {account.city && (
                      <>
                        <br />
                        {account.city}{account.state && `, ${account.state}`} {account.zipCode}
                      </>
                    )}
                  </p>
                </div>
              )}
              <div>
                <p className="text-sm text-gray-500">Created</p>
                <p className="font-medium">
                  {account.createdAt ? format(new Date(account.createdAt), 'MMM d, yyyy') : 'N/A'}
                </p>
              </div>
            </div>

            {(account.inquiries?.length || account.leadStatus) && (
              <div className="mt-6 border-t pt-6">
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Inbox className="h-5 w-5 text-edg-teal" />
                    <h3 className="text-lg font-semibold">Inquiry History</h3>
                  </div>
                </div>
                {account.inquiries?.length ? <div className="space-y-4">
                  {account.inquiries.map((inquiry) => <div key={inquiry.id} className="rounded-lg border bg-gray-50 p-4" data-testid={`account-inquiry-${inquiry.id}`}>
                    <div className="flex flex-wrap items-center gap-3">
                      <Badge variant="outline" className="border-sky-200 bg-white text-sky-800">{formatLeadStatus(inquiry.workflowStatus)}</Badge>
                      <span className="text-sm text-gray-500">Received {format(new Date(inquiry.receivedAt), 'MMM d, yyyy h:mm a')}</span>
                      <span className="text-sm text-gray-500">{inquiry.projectType || 'Project type not provided'}</span>
                      {inquiry.convertedQuoteId && <Button variant="link" size="sm" className="h-auto p-0" onClick={() => navigate(`/quotes/${inquiry.convertedQuoteId}/edit`)}>Open linked quote</Button>}
                    </div>
                    {extractLeadMessage(inquiry.message) && <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-700">{extractLeadMessage(inquiry.message)}</p>}
                    {inquiry.assessmentReason && <p className="mt-2 text-sm text-gray-600"><span className="font-semibold">Agent assessment:</span> {inquiry.assessmentReason}</p>}
                    {inquiry.archiveReason && <p className="mt-2 text-sm text-gray-600"><span className="font-semibold">Archive reason:</span> {formatLeadStatus(inquiry.archiveReason)}</p>}
                  </div>)}
                </div> : <div className="rounded-lg border bg-gray-50 p-4">
                  <Badge variant="outline" className="border-sky-200 bg-white text-sky-800">{formatLeadStatus(account.leadStatus || 'new')}</Badge>
                  {extractLeadMessage(account.leadMessage) && <p className="mt-3 text-sm text-gray-700">{extractLeadMessage(account.leadMessage)}</p>}
                </div>}

                {leadAttachments.length > 0 && <div className="mt-5">
                    <div className="mb-3 flex items-center gap-2">
                      <Images className="h-4 w-4 text-edg-teal" />
                      <p className="text-sm font-semibold text-gray-800">
                        Site photos ({leadAttachments.length})
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {leadAttachments.map((attachment) => (
                        <a
                          key={attachment.id}
                          href={attachment.storageUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="group overflow-hidden rounded-md border bg-white transition-colors hover:border-edg-teal"
                        >
                          <div className="aspect-[4/3] bg-gray-100">
                            <img
                              src={attachment.storageUrl}
                              alt={attachment.originalName}
                              className="h-full w-full object-cover transition-transform group-hover:scale-105"
                              loading="lazy"
                            />
                          </div>
                          <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-gray-600">
                            <span className="min-w-0 truncate">{attachment.originalName}</span>
                            <span className="flex shrink-0 items-center gap-1">
                              {formatAttachmentSize(attachment.fileSize)}
                              <ExternalLink className="h-3 w-3" />
                            </span>
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>}
              </div>
            )}

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

        {account.planningAgreements && account.planningAgreements.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Design + Planning
              </CardTitle>
              <CardDescription>
                Paid planning agreements, manual payment state, and project credits for this client.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {account.planningAgreements.map((agreement) => {
                  const feeAmount = Number(agreement.amount || 0);
                  const creditAmount = Number(agreement.appliedCreditAmount || 0);
                  const quote = agreement.quote;
                  const signatureAudit = agreement.signatureAuditTrail as { documentFingerprint?: string } | null;

                  return (
                    <div key={agreement.id} className="rounded-lg border p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-gray-900">
                              {quote?.projectName || quote?.quoteNumber || `Planning Agreement #${agreement.id}`}
                            </p>
                            <Badge variant="outline" className={planningStatusColors[agreement.status] || "bg-gray-50 text-gray-800"}>
                              {planningStatusLabels[agreement.status] || agreement.status}
                            </Badge>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                            <span>Fee: {formatCurrency(Number.isFinite(feeAmount) ? feeAmount : 0)}</span>
                            {agreement.paymentConfirmedAt && (
                              <span>Paid {format(new Date(agreement.paymentConfirmedAt), 'MMM d, yyyy')}</span>
                            )}
                            {agreement.signatureEmailSentAt && (
                              <span>Email sent {format(new Date(agreement.signatureEmailSentAt), 'MMM d, yyyy')}</span>
                            )}
                            {agreement.customerSignedAt && (
                              <span>Signed {format(new Date(agreement.customerSignedAt), 'MMM d, yyyy')}</span>
                            )}
                            {agreement.creditEligible && agreement.creditExpiresAt && (
                              <span>Credit expires {format(new Date(agreement.creditExpiresAt), 'MMM d, yyyy')}</span>
                            )}
                            {agreement.creditedAt && (
                              <span>Credit applied: {formatCurrency(Number.isFinite(creditAmount) ? creditAmount : 0)}</span>
                            )}
                            {signatureAudit?.documentFingerprint && (
                              <span>Doc ID {signatureAudit.documentFingerprint.slice(0, 12)}</span>
                            )}
                          </div>
                          {agreement.scopeSummary && (
                            <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-700">
                              {agreement.scopeSummary}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {agreement.signingToken && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => window.open(`/planning-agreements/sign/${agreement.signingToken}`, '_blank', 'noopener,noreferrer')}
                            >
                              <ExternalLink className="mr-2 h-4 w-4" />
                              Agreement
                            </Button>
                          )}
                          {quote && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => navigate(`/quotes/${quote.id}/edit`)}
                            >
                              Open Quote
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

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
                  onClick={() => navigate(`/quotes/new?accountId=${accountId}`)}
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
                                {mainQuote.jobsiteAddress || mainQuote.jobsiteStreetAddress || 'No address specified'}
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden p-0">
          <div className="flex flex-col max-h-[90vh]">
            <DialogHeader className="px-6 pt-6 pb-4">
              <DialogTitle>Edit Client</DialogTitle>
            </DialogHeader>
            <div className="overflow-y-auto px-6 pb-6">
              <AccountForm 
                account={account}
                onSuccess={handleAccountUpdated}
                onCancel={() => setEditAccountOpen(false)}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
