import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { SiGmail } from "react-icons/si";
import { Archive, CheckCircle2, ExternalLink, FileText, FolderPlus, Inbox, Mail, MapPin, MessageSquare, Phone } from "lucide-react";

import { AppHeader } from "@/components/app-header";
import { PageLoadError } from "@/components/error-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { effectiveGmailDraftUrl, gmailDraftHref, type LeadWorkflowStatus } from "@shared/leadWorkflow";
import type { LeadAttachment } from "@shared/schema";

type ArchiveReason = "not_a_fit" | "spam" | "duplicate" | "no_response" | "other";

type LeadInquiryRow = {
  id: number;
  inquiryId: number;
  submissionId?: string | null;
  name: string;
  company?: string | null;
  email: string;
  phone?: string | null;
  billingAddress?: string | null;
  zipCode?: string | null;
  leadStatus: LeadWorkflowStatus;
  storedLeadStatus: string;
  leadSource?: string | null;
  leadProjectType?: string | null;
  leadMessage?: string | null;
  leadReceivedAt: string;
  inquiryCount: number;
  convertedQuoteId?: number | null;
  convertedQuoteNumber?: string | null;
  assessmentOutcome?: string | null;
  assessmentReason?: string | null;
  gmailDraftId?: string | null;
  gmailMessageId?: string | null;
  gmailDraftUrl?: string | null;
  manualGmailDraftUrl?: string | null;
  archiveReason?: ArchiveReason | null;
  leadAttachments?: LeadAttachment[];
};

const filters: Array<{ value: "all" | LeadWorkflowStatus; label: string }> = [
  { value: "new", label: "New" },
  { value: "draft_ready", label: "Draft Ready" },
  { value: "contacted", label: "Contacted" },
  { value: "archived", label: "Archived / Disqualified" },
  { value: "all", label: "All" },
];

const statusLabels: Record<LeadWorkflowStatus, string> = {
  new: "New",
  draft_ready: "Draft Ready",
  contacted: "Contacted",
  archived: "Archived / Disqualified",
};

const archiveReasons: Array<{ value: ArchiveReason; label: string }> = [
  { value: "not_a_fit", label: "Not a fit" },
  { value: "spam", label: "Spam" },
  { value: "duplicate", label: "Duplicate" },
  { value: "no_response", label: "No response" },
  { value: "other", label: "Other" },
];

function statusClass(status: LeadWorkflowStatus) {
  return {
    new: "border-sky-200 bg-sky-50 text-sky-800",
    draft_ready: "border-emerald-200 bg-emerald-50 text-emerald-800",
    contacted: "border-violet-200 bg-violet-50 text-violet-800",
    archived: "border-slate-200 bg-slate-50 text-slate-700",
  }[status];
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  }).format(date);
}

function extractMessage(message?: string | null) {
  if (!message) return "No message provided.";
  const match = message.match(/Message:\s*([\s\S]*?)(?:\n\nMetadata:|$)/);
  return (match?.[1] || message).trim() || "No message provided.";
}

export default function Leads() {
  const [filter, setFilter] = useState<"all" | LeadWorkflowStatus>("new");
  const [draftReadyLead, setDraftReadyLead] = useState<LeadInquiryRow | null>(null);
  const [draftUrl, setDraftUrl] = useState("");
  const { toast } = useToast();
  const { data: leads = [], isLoading, error, refetch } = useQuery<LeadInquiryRow[]>({
    queryKey: ["/api/leads", "inquiry-workflow"],
    queryFn: async () => {
      const response = await fetch("/api/leads?status=all&limit=200", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch leads");
      return response.json();
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ lead, status, reason, gmailDraftUrl }: { lead: LeadInquiryRow; status: "draft_ready" | "contacted" | "archived"; reason?: ArchiveReason; gmailDraftUrl?: string }) => {
      const response = await apiRequest("PATCH", `/api/inquiries/${lead.inquiryId}/status`, { status, reason, gmailDraftUrl: gmailDraftUrl || null });
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: [`/api/accounts/${variables.lead.id}/details`] });
      toast({
        title: variables.status === "draft_ready" ? "Marked Draft Ready" : variables.status === "contacted" ? "Marked contacted" : "Inquiry archived",
        description: variables.status === "archived" && variables.reason
          ? archiveReasons.find((item) => item.value === variables.reason)?.label
          : undefined,
      });
      if (variables.status === "draft_ready") {
        setDraftReadyLead(null);
        setDraftUrl("");
      }
    },
    onError: (mutationError: Error) => toast({ title: "Could not update inquiry", description: mutationError.message, variant: "destructive" }),
  });

  const counts = useMemo(() => leads.reduce<Record<string, number>>((result, lead) => {
    result[lead.leadStatus] = (result[lead.leadStatus] || 0) + 1;
    result.all = (result.all || 0) + 1;
    return result;
  }, {}), [leads]);
  const visible = filter === "all" ? leads : leads.filter((lead) => lead.leadStatus === filter);

  if (error) return (
    <div className="min-h-screen bg-background"><AppHeader /><PageLoadError
      title="Leads couldn't be loaded"
      description="Rainmaker could not retrieve the lead inbox. No inquiry statuses were changed."
      onRetry={() => void refetch()}
    /></div>
  );

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-3"><Inbox className="h-8 w-8 text-edg-teal" /><h1 className="text-3xl font-bold">Website Leads</h1></div>
            <p className="mt-1 text-muted-foreground">One row for every website inquiry, from arrival through contact or archive.</p>
          </div>
          <Link href="/quotes/new"><Button className="bg-edg-black text-edg-white hover:bg-edg-grey"><FolderPlus className="mr-2 h-4 w-4" />New Quote</Button></Link>
        </div>

        <Card>
          <CardHeader className="border-b">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <CardTitle>Lead Inbox</CardTitle>
              <div role="group" aria-label="Filter inquiries by status" className="inline-flex flex-wrap rounded-md bg-muted p-1">
                {filters.map((item) => <Button key={item.value} type="button" variant="ghost" size="sm" aria-pressed={filter === item.value}
                  onClick={() => setFilter(item.value)} className={cn("gap-2", filter === item.value && "bg-background shadow-sm hover:bg-background")}>
                  {item.label}<span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground">{counts[item.value] || 0}</span>
                </Button>)}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? <div className="space-y-4 p-6">{[1, 2, 3].map((item) => <div key={item} className="rounded-lg border p-4"><Skeleton className="h-5 w-48" /><Skeleton className="mt-3 h-4 w-72" /><Skeleton className="mt-4 h-16 w-full" /></div>)}</div>
              : visible.length === 0 ? <div className="px-6 py-16 text-center"><Inbox className="mx-auto h-12 w-12 text-muted-foreground opacity-50" /><p className="mt-4 text-sm text-muted-foreground">No inquiries in this status.</p></div>
              : <div className="divide-y">{visible.map((lead) => {
                const draftHref = gmailDraftHref({
                  gmailDraftUrl: effectiveGmailDraftUrl({ manualGmailDraftUrl: lead.manualGmailDraftUrl, assessmentGmailDraftUrl: lead.gmailDraftUrl }),
                  gmailMessageId: lead.gmailMessageId,
                }) || (lead.leadStatus === "draft_ready" ? "https://mail.google.com/mail/u/0/#drafts" : null);
                return <article key={lead.inquiryId} data-testid={`lead-inquiry-row-${lead.inquiryId}`} className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/accounts/${lead.id}`} className="text-lg font-semibold hover:text-edg-teal">{lead.company || lead.name}</Link>
                      <Badge variant="outline" className={cn("border", statusClass(lead.leadStatus))}>{statusLabels[lead.leadStatus]}</Badge>
                      <span className="text-sm text-muted-foreground">Received {formatDate(lead.leadReceivedAt)}</span>
                      {lead.inquiryCount > 1 && <Badge variant="secondary">Inquiry {lead.inquiryId} · {lead.inquiryCount} total</Badge>}
                    </div>
                    <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                      <a href={`mailto:${lead.email}`} className="flex items-center gap-1 hover:text-edg-teal"><Mail className="h-4 w-4" />{lead.email}</a>
                      {lead.phone && <a href={`tel:${lead.phone}`} className="flex items-center gap-1 hover:text-edg-teal"><Phone className="h-4 w-4" />{lead.phone}</a>}
                      {(lead.billingAddress || lead.zipCode) && <span className="flex items-center gap-1"><MapPin className="h-4 w-4" />{lead.billingAddress || lead.zipCode}</span>}
                      {lead.leadProjectType && <span className="flex items-center gap-1"><MessageSquare className="h-4 w-4" />{lead.leadProjectType}</span>}
                    </div>
                    <p className="max-w-3xl text-sm leading-6">{extractMessage(lead.leadMessage)}</p>
                    {lead.assessmentReason && <p className="max-w-3xl rounded-md bg-muted px-3 py-2 text-sm"><span className="font-semibold">Agent assessment:</span> {lead.assessmentReason}</p>}
                    {lead.archiveReason && <p className="text-sm text-muted-foreground"><span className="font-semibold text-foreground">Archive reason:</span> {archiveReasons.find((reason) => reason.value === lead.archiveReason)?.label || "Other"}</p>}
                    {(lead.leadAttachments || []).length > 0 && <div className="flex flex-wrap gap-2">{lead.leadAttachments!.map((attachment) => <a key={attachment.id} href={attachment.storageUrl} target="_blank" rel="noreferrer" className="group relative block h-16 w-20 overflow-hidden rounded-md border bg-muted"><img src={attachment.storageUrl} alt={attachment.originalName} className="h-full w-full object-cover" /></a>)}</div>}
                  </div>

                  <div className="flex min-w-48 flex-col items-stretch gap-2 lg:items-end">
                    {lead.leadStatus === "draft_ready" && draftHref && <Button asChild size="sm" className="bg-edg-teal text-white hover:bg-edg-teal/90"><a href={draftHref} target="_blank" rel="noopener noreferrer" data-testid={`button-open-gmail-draft-${lead.inquiryId}`}><SiGmail className="mr-2 h-4 w-4" />Open Gmail Draft<ExternalLink className="ml-2 h-3 w-3" /></a></Button>}
                    {lead.convertedQuoteId ? <Link href={`/quotes/${lead.convertedQuoteId}/edit`}><Button size="sm" variant={lead.leadStatus === "draft_ready" ? "outline" : "default"} data-testid={`button-open-quote-${lead.inquiryId}`}><FileText className="mr-2 h-4 w-4" />Open Quote{lead.convertedQuoteNumber ? ` ${lead.convertedQuoteNumber}` : ""}</Button></Link>
                      : lead.leadStatus !== "archived" && <Link href={`/quotes/new?accountId=${lead.id}&inquiryId=${lead.inquiryId}&projectName=${encodeURIComponent(lead.leadProjectType || "")}`}><Button size="sm" variant={lead.leadStatus === "draft_ready" ? "outline" : "default"} data-testid={`button-create-quote-${lead.inquiryId}`}><FolderPlus className="mr-2 h-4 w-4" />Create Quote</Button></Link>}
                    {lead.leadStatus === "new" && <Button variant="outline" size="sm" disabled={updateStatus.isPending} onClick={() => { setDraftReadyLead(lead); setDraftUrl(""); }} data-testid={`button-mark-draft-ready-${lead.inquiryId}`}><SiGmail className="mr-2 h-4 w-4" />Mark Draft Ready</Button>}
                    {lead.leadStatus !== "contacted" && lead.leadStatus !== "archived" && <Button variant="ghost" size="sm" disabled={updateStatus.isPending} onClick={() => updateStatus.mutate({ lead, status: "contacted" })} data-testid={`button-mark-contacted-${lead.inquiryId}`}><CheckCircle2 className="mr-2 h-4 w-4" />Contacted</Button>}
                    {lead.leadStatus !== "archived" && <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="sm" disabled={updateStatus.isPending} data-testid={`button-archive-inquiry-${lead.inquiryId}`}><Archive className="mr-2 h-4 w-4" />Archive / Disqualify</Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuLabel>Optional reason</DropdownMenuLabel>{archiveReasons.map((reason) => <DropdownMenuItem key={reason.value} onSelect={() => updateStatus.mutate({ lead, status: "archived", reason: reason.value })}>{reason.label}</DropdownMenuItem>)}<DropdownMenuSeparator /><DropdownMenuItem onSelect={() => updateStatus.mutate({ lead, status: "archived" })}>No reason</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}
                  </div>
                </article>;
              })}</div>}
          </CardContent>
        </Card>
      </main>
      <Dialog open={Boolean(draftReadyLead)} onOpenChange={(open) => { if (!open) { setDraftReadyLead(null); setDraftUrl(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Draft Ready</DialogTitle>
            <DialogDescription>Use this only after confirming the Gmail draft exists. Adding its link is optional.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="gmail-draft-url">Gmail draft link (optional)</Label>
            <Input id="gmail-draft-url" type="url" placeholder="https://mail.google.com/..." value={draftUrl} onChange={(event) => setDraftUrl(event.target.value)} />
            <p className="text-xs text-muted-foreground">Without a link, Open Gmail Draft will open the Gmail Drafts folder.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDraftReadyLead(null); setDraftUrl(""); }}>Cancel</Button>
            <Button disabled={!draftReadyLead || updateStatus.isPending} onClick={() => draftReadyLead && updateStatus.mutate({ lead: draftReadyLead, status: "draft_ready", gmailDraftUrl: draftUrl.trim() || undefined })}>Mark Draft Ready</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
