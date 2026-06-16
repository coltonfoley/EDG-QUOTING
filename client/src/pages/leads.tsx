import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { Account, LeadAttachment } from "@shared/schema";
import {
  Archive,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  FolderPlus,
  Images,
  Inbox,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  UserCheck,
} from "lucide-react";

type LeadStatus = "new" | "contacted" | "qualified" | "unresponsive" | "converted" | "archived";

interface LeadAccount extends Account {
  projectCount?: number;
  attachments?: LeadAttachment[];
  leadAttachments?: LeadAttachment[];
}

const LEAD_STATUSES: Array<{ value: "all" | LeadStatus; label: string }> = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "unresponsive", label: "No Reply" },
  { value: "converted", label: "Converted" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "All" },
];

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  unresponsive: "No Reply",
  converted: "Converted",
  archived: "Archived",
};

function getStatusClass(status?: string | null) {
  switch (status) {
    case "new":
      return "border-sky-200 bg-sky-50 text-sky-800";
    case "contacted":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "qualified":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "unresponsive":
      return "border-slate-200 bg-slate-50 text-slate-700";
    case "converted":
      return "border-violet-200 bg-violet-50 text-violet-800";
    case "archived":
      return "border-zinc-200 bg-zinc-50 text-zinc-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function formatDate(value?: string | Date | null) {
  if (!value) return "Unknown";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function extractLeadMessage(message?: string | null) {
  if (!message) return "No message provided.";
  const match = message.match(/Message:\s*([\s\S]*?)(?:\n\nMetadata:|$)/);
  return (match?.[1] || message).trim() || "No message provided.";
}

function getLeadAttachments(lead: LeadAccount) {
  return lead.leadAttachments?.length
    ? lead.leadAttachments
    : lead.attachments || [];
}

function formatAttachmentSize(bytes?: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Leads() {
  const [statusFilter, setStatusFilter] = useState<"all" | LeadStatus>("new");
  const { toast } = useToast();

  const { data: leads = [], isLoading } = useQuery<LeadAccount[]>({
    queryKey: ["/api/leads", "all"],
    queryFn: async () => {
      const response = await fetch("/api/leads?status=all&limit=200", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch leads");
      return response.json();
    },
  });

  const updateLeadStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: LeadStatus }) => {
      const response = await apiRequest("PATCH", `/api/leads/${id}/status`, { status });
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({ queryKey: [`/api/accounts/${variables.id}/details`] });
      toast({
        title: "Lead updated",
        description: `Marked as ${STATUS_LABELS[variables.status].toLowerCase()}.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not update lead",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const counts = useMemo(() => {
    return leads.reduce<Record<string, number>>((acc, lead) => {
      const status = lead.leadStatus || "new";
      acc[status] = (acc[status] || 0) + 1;
      acc.all = (acc.all || 0) + 1;
      return acc;
    }, {});
  }, [leads]);

  const visibleLeads = useMemo(() => {
    if (statusFilter === "all") return leads;
    return leads.filter((lead) => lead.leadStatus === statusFilter);
  }, [leads, statusFilter]);

  const newLeadCount = counts.new || 0;
  const needsFollowUpCount = (counts.new || 0) + (counts.contacted || 0);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Inbox className="h-8 w-8 text-edg-teal" />
              <h1 className="text-3xl font-bold text-foreground">Website Leads</h1>
            </div>
            <p className="mt-1 text-muted-foreground">New inquiries and follow-ups before a quote is created.</p>
          </div>
          <Link href="/quotes/new">
            <Button className="bg-edg-black text-edg-white hover:bg-edg-grey" data-testid="button-new-quote">
              <FolderPlus className="mr-2 h-4 w-4" />
              New Quote
            </Button>
          </Link>
        </div>

        <div className="mb-8 grid gap-4 md:grid-cols-3">
          <Card className="border-l-4 border-l-sky-500">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">New Leads</p>
                  <p className="mt-2 text-3xl font-bold text-foreground">{isLoading ? "-" : newLeadCount}</p>
                </div>
                <Inbox className="h-6 w-6 text-sky-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Needs Follow Up</p>
                  <p className="mt-2 text-3xl font-bold text-foreground">{isLoading ? "-" : needsFollowUpCount}</p>
                </div>
                <Clock className="h-6 w-6 text-amber-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Qualified</p>
                  <p className="mt-2 text-3xl font-bold text-foreground">{isLoading ? "-" : counts.qualified || 0}</p>
                </div>
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="border-b">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <CardTitle>Lead Inbox</CardTitle>
              <Tabs value={statusFilter} onValueChange={(value) => setStatusFilter(value as "all" | LeadStatus)}>
                <TabsList className="h-auto flex-wrap justify-start">
                  {LEAD_STATUSES.map((status) => (
                    <TabsTrigger key={status.value} value={status.value} className="gap-2">
                      {status.label}
                      <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground">
                        {counts[status.value] || 0}
                      </span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-4 p-6">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="rounded-lg border p-4">
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="mt-3 h-4 w-72" />
                    <Skeleton className="mt-4 h-16 w-full" />
                  </div>
                ))}
              </div>
            ) : visibleLeads.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <Inbox className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
                <p className="mt-4 text-sm text-muted-foreground">No leads in this status.</p>
              </div>
            ) : (
              <div className="divide-y">
                {visibleLeads.map((lead) => {
                  const attachments = getLeadAttachments(lead);

                  return (
                    <div key={lead.id} className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_auto]">
                    <div className="min-w-0 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/accounts/${lead.id}`}
                          className="text-lg font-semibold text-foreground hover:text-edg-teal"
                        >
                          {lead.company || lead.name}
                        </Link>
                        <Badge variant="outline" className={cn("border", getStatusClass(lead.leadStatus))}>
                          {STATUS_LABELS[(lead.leadStatus || "new") as LeadStatus] || "New"}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          Received {formatDate(lead.leadReceivedAt || lead.createdAt)}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                        <a href={`mailto:${lead.email}`} className="flex items-center gap-1 hover:text-edg-teal">
                          <Mail className="h-4 w-4" />
                          {lead.email}
                        </a>
                        {lead.phone && (
                          <a href={`tel:${lead.phone}`} className="flex items-center gap-1 hover:text-edg-teal">
                            <Phone className="h-4 w-4" />
                            {lead.phone}
                          </a>
                        )}
                        {(lead.billingAddress || lead.zipCode) && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-4 w-4" />
                            {lead.billingAddress || lead.zipCode}
                          </span>
                        )}
                        {lead.leadProjectType && (
                          <span className="flex items-center gap-1">
                            <MessageSquare className="h-4 w-4" />
                            {lead.leadProjectType}
                          </span>
                        )}
                        {attachments.length > 0 && (
                          <span className="flex items-center gap-1 text-emerald-700">
                            <Images className="h-4 w-4" />
                            {attachments.length} photo{attachments.length === 1 ? "" : "s"}
                          </span>
                        )}
                      </div>

                      <p className="max-w-3xl text-sm leading-6 text-foreground">
                        {extractLeadMessage(lead.leadMessage)}
                      </p>

                      {attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {attachments.slice(0, 4).map((attachment) => (
                            <a
                              key={attachment.id}
                              href={attachment.storageUrl}
                              target="_blank"
                              rel="noreferrer"
                              title={[
                                attachment.originalName,
                                formatAttachmentSize(attachment.fileSize),
                              ].filter(Boolean).join(" - ")}
                              className="group relative block h-16 w-20 overflow-hidden rounded-md border bg-muted"
                              aria-label={`Open ${attachment.originalName}`}
                            >
                              <img
                                src={attachment.storageUrl}
                                alt={attachment.originalName}
                                className="h-full w-full object-cover transition-transform group-hover:scale-105"
                                loading="lazy"
                              />
                              <span className="absolute right-1 top-1 rounded bg-black/70 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100">
                                <ExternalLink className="h-3 w-3" />
                              </span>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-stretch gap-2 lg:items-end">
                      <Link href={`/accounts/${lead.id}`}>
                        <Button
                          size="sm"
                          className="bg-edg-black text-edg-white hover:bg-edg-grey"
                          data-testid={`button-start-follow-up-${lead.id}`}
                        >
                          Start Follow-Up
                          <ChevronRight className="ml-1 h-4 w-4" />
                        </Button>
                      </Link>
                      <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
                      {lead.leadStatus !== "contacted" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => updateLeadStatusMutation.mutate({ id: lead.id, status: "contacted" })}
                          disabled={updateLeadStatusMutation.isPending}
                          data-testid={`button-mark-contacted-${lead.id}`}
                        >
                          <UserCheck className="mr-2 h-4 w-4" />
                          Contacted
                        </Button>
                      )}
                      {lead.leadStatus !== "qualified" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => updateLeadStatusMutation.mutate({ id: lead.id, status: "qualified" })}
                          disabled={updateLeadStatusMutation.isPending}
                          data-testid={`button-mark-qualified-${lead.id}`}
                        >
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          Qualified
                        </Button>
                      )}
                      {lead.leadStatus !== "unresponsive" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => updateLeadStatusMutation.mutate({ id: lead.id, status: "unresponsive" })}
                          disabled={updateLeadStatusMutation.isPending}
                          data-testid={`button-mark-no-reply-${lead.id}`}
                        >
                          <Clock className="mr-2 h-4 w-4" />
                          No Reply
                        </Button>
                      )}
                      {lead.leadStatus !== "archived" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => updateLeadStatusMutation.mutate({ id: lead.id, status: "archived" })}
                          disabled={updateLeadStatusMutation.isPending}
                          aria-label="Archive lead"
                          data-testid={`button-archive-lead-${lead.id}`}
                        >
                          <Archive className="h-4 w-4" />
                        </Button>
                      )}
                      </div>
                    </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
