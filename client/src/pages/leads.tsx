import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SiGmail } from "react-icons/si";

import { AppHeader } from "@/components/app-header";
import { PageLoadError } from "@/components/error-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExternalLink, Inbox } from "lucide-react";

type AgentReviewedLead = {
  accountId: number;
  inquiryId: number;
  name: string;
  company?: string | null;
  email: string;
  phone?: string | null;
  projectType?: string | null;
  location?: string | null;
  message?: string | null;
  source?: string | null;
  receivedAt: string;
  outcome: "fit" | "not_fit";
  assessmentReason: string;
  gmailDraftId?: string | null;
  gmailMessageId?: string | null;
  gmailDraftUrl?: string | null;
  assessedAt: string;
};

type LeadTab = "draft_ready" | "not_fit";

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

function gmailDraftHref(lead: AgentReviewedLead): string | null {
  if (lead.gmailDraftUrl) {
    try {
      const url = new URL(lead.gmailDraftUrl);
      if (
        url.protocol === "https:"
        && url.hostname === "mail.google.com"
        && /^\/mail\/u\/\d+\//.test(url.pathname)
        && url.hash.startsWith("#drafts")
      ) {
        return url.toString();
      }
    } catch {
      // Fall through to the message identifier when the stored URL is malformed.
    }
  }
  if (!lead.gmailMessageId) return null;
  return `https://mail.google.com/mail/u/0/#drafts/${encodeURIComponent(lead.gmailMessageId)}`;
}

function displayName(lead: AgentReviewedLead) {
  return lead.company || lead.name;
}

function LeadIdentity({ lead }: { lead: AgentReviewedLead }) {
  return (
    <div className="min-w-0">
      <h2 className="break-words text-lg font-semibold text-foreground">
        {displayName(lead)}
      </h2>
      {lead.company && lead.company !== lead.name && (
        <p className="mt-0.5 break-words text-base text-muted-foreground">{lead.name}</p>
      )}
      <p className="mt-2 break-words text-base text-foreground">
        {lead.projectType || "Project type not provided"}
      </p>
      <p className="mt-0.5 break-words text-base text-muted-foreground">
        {lead.location || "Location not provided"}
      </p>
    </div>
  );
}

function DraftReadyRow({ lead }: { lead: AgentReviewedLead }) {
  const draftHref = gmailDraftHref(lead);

  return (
    <article
      className="grid gap-5 px-6 py-7 md:grid-cols-[minmax(0,1.2fr)_minmax(8rem,0.65fr)] lg:grid-cols-[minmax(13rem,1.05fr)_minmax(8rem,0.55fr)_minmax(8rem,0.45fr)_minmax(18rem,1.6fr)_auto] lg:items-center xl:grid-cols-[minmax(17rem,1.25fr)_minmax(9rem,0.65fr)_minmax(7rem,0.45fr)_minmax(20rem,1.5fr)_minmax(13.5rem,auto)]"
      data-testid={`lead-row-${lead.inquiryId}`}
    >
      <LeadIdentity lead={lead} />

      <div className="text-base">
        <p className="font-medium text-foreground lg:sr-only">Received</p>
        <p className="mt-1 text-muted-foreground lg:mt-0">{formatDate(lead.receivedAt)}</p>
      </div>

      <div>
        <Badge
          variant="outline"
          className="border-emerald-200 bg-emerald-50 px-4 py-1 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
        >
          Fit
        </Badge>
      </div>

      <div className="min-w-0">
        <p className="break-words text-base leading-7 text-muted-foreground">
          <span className="font-semibold text-foreground">Agent assessment:</span>{" "}
          {lead.assessmentReason}
        </p>
      </div>

      <div className="md:col-span-2 lg:col-span-1 lg:justify-self-end">
        {draftHref && (
          <Button
            asChild
            variant="outline"
            className="min-h-12 w-full border-edg-teal px-5 text-base text-edg-teal hover:bg-edg-teal/10 hover:text-edg-teal lg:w-auto"
          >
            <a
              href={draftHref}
              target="_blank"
              rel="noopener noreferrer"
              data-testid={`open-gmail-draft-${lead.inquiryId}`}
              aria-label={`Open Gmail draft for ${displayName(lead)} in a new tab`}
            >
              <SiGmail className="mr-2 h-4 w-4 text-red-500" aria-hidden="true" />
              Open Gmail draft
              <ExternalLink className="ml-2 h-4 w-4" aria-hidden="true" />
            </a>
          </Button>
        )}
      </div>
    </article>
  );
}

function NotFitRow({ lead }: { lead: AgentReviewedLead }) {
  return (
    <article
      className="grid gap-5 px-6 py-7 md:grid-cols-[minmax(0,1.2fr)_minmax(8rem,0.65fr)] lg:grid-cols-[minmax(13rem,1.05fr)_minmax(8rem,0.55fr)_minmax(8rem,0.45fr)_minmax(18rem,1.6fr)] lg:items-center xl:grid-cols-[minmax(17rem,1.25fr)_minmax(9rem,0.65fr)_minmax(7rem,0.45fr)_minmax(20rem,1.5fr)]"
      data-testid={`lead-row-${lead.inquiryId}`}
    >
      <LeadIdentity lead={lead} />

      <div className="text-base">
        <p className="font-medium text-foreground lg:sr-only">Received</p>
        <p className="mt-1 text-muted-foreground lg:mt-0">{formatDate(lead.receivedAt)}</p>
      </div>

      <div>
        <Badge
          variant="outline"
          className="border-slate-200 bg-slate-50 px-4 py-1 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          Not a fit
        </Badge>
      </div>

      <div className="min-w-0">
        <p className="break-words text-base leading-7 text-muted-foreground">
          <span className="font-semibold text-foreground">Agent assessment:</span>{" "}
          {lead.assessmentReason}
        </p>
      </div>
    </article>
  );
}

function LeadList({
  leads,
  emptyMessage,
  renderRow,
}: {
  leads: AgentReviewedLead[];
  emptyMessage: string;
  renderRow: (lead: AgentReviewedLead) => React.ReactNode;
}) {
  if (leads.length === 0) {
    return (
      <div className="px-6 py-16 text-center">
        <Inbox className="mx-auto h-10 w-10 text-muted-foreground opacity-40" aria-hidden="true" />
        <p className="mt-4 text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return <div className="divide-y">{leads.map(renderRow)}</div>;
}

export default function Leads() {
  const [activeTab, setActiveTab] = useState<LeadTab>("draft_ready");
  const { data: leads = [], isLoading, error, refetch } = useQuery<AgentReviewedLead[]>({
    queryKey: ["/api/lead-agent/review"],
    queryFn: async () => {
      const response = await fetch("/api/lead-agent/review", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch agent-reviewed leads");
      return response.json();
    },
    refetchInterval: 60_000,
  });

  const draftReady = useMemo(
    () => leads.filter((lead) => lead.outcome === "fit" && gmailDraftHref(lead)),
    [leads],
  );
  const notFit = useMemo(
    () => leads.filter((lead) => lead.outcome === "not_fit"),
    [leads],
  );

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <PageLoadError
          title="Leads couldn't be loaded"
          description="Rainmaker could not retrieve Jacob's latest lead assessments."
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="mx-auto max-w-[1450px] px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-7">
          <h1 className="text-3xl font-bold text-foreground">Leads</h1>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as LeadTab)}
          className="w-full"
        >
          <div className="border-b">
            <TabsList
              aria-label="Lead assessment results"
              className="inline-grid h-auto min-h-11 w-full grid-cols-2 rounded-none bg-transparent p-0 sm:w-80"
            >
              <TabsTrigger
                value="draft_ready"
                className="min-h-11 rounded-none border-b-2 border-transparent px-4 data-[state=active]:border-edg-teal data-[state=active]:bg-transparent data-[state=active]:text-edg-teal data-[state=active]:shadow-none"
                data-testid="tab-draft-ready"
                aria-label={`Draft ready, ${draftReady.length} leads`}
              >
                Draft ready
              </TabsTrigger>
              <TabsTrigger
                value="not_fit"
                className="min-h-11 rounded-none border-b-2 border-transparent px-4 data-[state=active]:border-edg-teal data-[state=active]:bg-transparent data-[state=active]:text-edg-teal data-[state=active]:shadow-none"
                data-testid="tab-not-fit"
                aria-label={`Not a fit, ${notFit.length} leads`}
              >
                Not a fit
              </TabsTrigger>
            </TabsList>
          </div>

          <p className="mt-5 text-sm text-muted-foreground">
            New leads are checked every 15 minutes.
          </p>

          <p className="sr-only" role="status" aria-live="polite">
            {activeTab === "draft_ready"
              ? `${draftReady.length} Gmail drafts ready`
              : `${notFit.length} leads marked not a fit`}
          </p>

          <div className="mt-5 overflow-hidden rounded-lg border bg-card">
            {isLoading ? (
              <div className="space-y-0 divide-y" aria-label="Loading leads">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="grid gap-5 px-5 py-6 lg:grid-cols-5">
                    <div>
                      <Skeleton className="h-5 w-40" />
                      <Skeleton className="mt-3 h-4 w-32" />
                      <Skeleton className="mt-2 h-4 w-24" />
                    </div>
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-6 w-12" />
                    <div>
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="mt-2 h-4 w-full" />
                    </div>
                    <Skeleton className="h-11 w-40" />
                  </div>
                ))}
              </div>
            ) : (
              <>
                <TabsContent value="draft_ready" className="m-0">
                  <LeadList
                    leads={draftReady}
                    emptyMessage="No Gmail drafts are ready right now."
                    renderRow={(lead) => <DraftReadyRow key={lead.inquiryId} lead={lead} />}
                  />
                </TabsContent>
                <TabsContent value="not_fit" className="m-0">
                  <LeadList
                    leads={notFit}
                    emptyMessage="No leads have been marked not a fit."
                    renderRow={(lead) => <NotFitRow key={lead.inquiryId} lead={lead} />}
                  />
                </TabsContent>
              </>
            )}
          </div>
        </Tabs>
      </main>
    </div>
  );
}
