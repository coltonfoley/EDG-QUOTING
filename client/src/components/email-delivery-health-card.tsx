import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, MailWarning, RefreshCw } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type EmailDeliveryHealth = {
  asOf: string;
  staleAfterMinutes: number;
  summary: {
    pending: number;
    stalePending: number;
    failed: number;
    sent: number;
    sentLast24Hours: number;
  };
  attentionTotal: number;
  attentionTruncated: boolean;
  attention: Array<{
    id: number;
    messageType:
      | "quote_signature_request"
      | "planning_signature_request"
      | "quote_signature_confirmation"
      | "planning_signature_confirmation";
    quoteId: number | null;
    planningAgreementId: number | null;
    status: "pending" | "failed";
    attemptCount: number;
    lastErrorType: string | null;
    createdAt: string | null;
    updatedAt: string | null;
  }>;
};

function formatTimestamp(value: string | null) {
  if (!value) return "Time unavailable";
  return new Date(value).toLocaleString([], { dateStyle: "short", timeStyle: "short" });
}

function attemptLabel(attempt: EmailDeliveryHealth["attention"][number]) {
  if (attempt.quoteId) return `Quote #${attempt.quoteId}`;
  if (attempt.planningAgreementId) return `Retained planning agreement #${attempt.planningAgreementId}`;
  return `Delivery record #${attempt.id}`;
}

function messageLabel(messageType: EmailDeliveryHealth["attention"][number]["messageType"]) {
  switch (messageType) {
    case "quote_signature_confirmation":
    case "planning_signature_confirmation":
      return "Confirmation receipt";
    default:
      return "Approval request";
  }
}

export function EmailDeliveryHealthCard() {
  const { toast } = useToast();
  const { data, error, isLoading, isFetching, refetch } = useQuery<EmailDeliveryHealth>({
    queryKey: ["/api/admin/email-delivery-health"],
    queryFn: async ({ signal }) => {
      const response = await apiRequest("GET", "/api/admin/email-delivery-health", undefined, { signal });
      return response.json();
    },
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });
  const retryConfirmation = useMutation({
    mutationFn: async (attemptId: number) => {
      const response = await apiRequest("POST", `/api/admin/email-delivery-attempts/${attemptId}/retry-confirmation`);
      return response.json() as Promise<{ message: string }>;
    },
    onSuccess: async (result) => {
      toast({ title: "Confirmation receipt accepted", description: result.message });
      await refetch();
    },
    onError: (retryError) => {
      toast({
        title: "Confirmation receipt not sent",
        description: retryError instanceof Error ? retryError.message : "Review the delivery record and try again later.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <Card className="mt-8" data-testid="email-delivery-health-loading">
        <CardContent className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
          Checking signature-email delivery evidence...
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="mt-8 border-destructive/40" data-testid="email-delivery-health-error">
        <CardContent className="flex flex-col gap-4 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-destructive" aria-hidden="true" />
            <div>
              <p className="font-medium text-foreground">Email delivery evidence unavailable</p>
              <p className="text-sm text-muted-foreground">Rainmaker could not read the delivery ledger. No email action was taken.</p>
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const refreshedAt = formatTimestamp(data.asOf);
  return (
    <Card className="mt-8" data-testid="email-delivery-health-card">
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <MailWarning className="h-5 w-5" aria-hidden="true" />
            Signature-email delivery
          </CardTitle>
          <p className="mt-2 text-sm text-muted-foreground">
            Provider evidence. Approval requests have no resend action; only a failed confirmation receipt can be deliberately retried.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} aria-hidden="true" />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-md border p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Needs review</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{data.attentionTotal}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Failed</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{data.summary.failed}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pending</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{data.summary.pending}</p>
            <p className="text-xs text-muted-foreground">{data.summary.stalePending} over {data.staleAfterMinutes} min</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Accepted in 24h</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{data.summary.sentLast24Hours}</p>
            <p className="text-xs text-muted-foreground">{data.summary.sent} all time</p>
          </div>
        </div>

        {data.attention.length === 0 ? (
          <div className="flex items-start gap-3 rounded-md border border-emerald-300 bg-emerald-50 p-4 text-emerald-950">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-medium">No delivery attempts need review</p>
              <p className="text-sm">No failed attempts or pending attempts older than {data.staleAfterMinutes} minutes were found.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
              A stale pending attempt may mean Gmail accepted the message before Rainmaker could finalize its evidence. Check the quote and provider logs before starting any new send action.
            </div>
            <ul className="divide-y rounded-md border" aria-label="Email delivery attempts needing review">
              {data.attention.map((attempt) => (
                <li key={attempt.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      {attempt.quoteId ? (
                        <Link href={`/quotes/${attempt.quoteId}/edit`} className="font-medium text-foreground underline-offset-4 hover:underline">
                          {attemptLabel(attempt)}
                        </Link>
                      ) : (
                        <span className="font-medium text-foreground">{attemptLabel(attempt)}</span>
                      )}
                      <Badge
                        variant={attempt.status === "failed" ? "outline" : "secondary"}
                        className={attempt.status === "failed" ? "border-red-800 bg-red-800 text-white" : undefined}
                      >
                        {attempt.status === "failed" ? "Failed" : `Pending over ${data.staleAfterMinutes} min`}
                      </Badge>
                      <Badge variant="outline">{messageLabel(attempt.messageType)}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Attempt {attempt.attemptCount} • Updated {formatTimestamp(attempt.updatedAt || attempt.createdAt)}
                      {attempt.lastErrorType ? ` • ${attempt.lastErrorType}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <span className="text-xs text-muted-foreground">Record #{attempt.id}</span>
                    {attempt.status === "failed" && attempt.messageType === "quote_signature_confirmation" && attempt.quoteId && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button type="button" variant="outline" size="sm" disabled={retryConfirmation.isPending}>
                            Retry confirmation
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Send one replacement confirmation receipt?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This sends a receipt to the customer email currently saved on Quote #{attempt.quoteId}. It does not change the recorded signature. Continue only after confirming this failed delivery record.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => retryConfirmation.mutate(attempt.id)}>
                              Send replacement receipt
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {data.attentionTruncated && (
              <p className="text-xs text-muted-foreground">Showing the oldest 50 of {data.attentionTotal} attempts needing review.</p>
            )}
          </div>
        )}

        <p className="text-xs text-muted-foreground">Last checked {refreshedAt}. Counts contain no recipient address or message content.</p>
      </CardContent>
    </Card>
  );
}
