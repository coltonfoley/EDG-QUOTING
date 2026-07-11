import { useQuery } from "@tanstack/react-query";
import { Activity, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";

type AdoptionSummary = {
  asOf: string;
  windowDays: number;
  windowStart: string;
  historicalCoverage: "post_instrumentation_only";
  metrics: Array<{
    key: string;
    label: string;
    count: number;
    firstRecordedAt: string | null;
    source: "business_events" | "email_delivery_attempts" | "quote_version_events";
  }>;
};

function shortDate(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString([], { dateStyle: "medium" });
}

export function AdoptionSummaryCard() {
  const { data, error, isLoading, isFetching, refetch } = useQuery<AdoptionSummary>({
    queryKey: ["/api/admin/adoption-summary"],
    queryFn: async ({ signal }) => {
      const response = await apiRequest("GET", "/api/admin/adoption-summary", undefined, { signal });
      return response.json();
    },
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60_000,
  });

  if (isLoading) {
    return (
      <Card className="mt-8" data-testid="adoption-summary-loading">
        <CardContent className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
          Reading post-instrumentation usage evidence...
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="mt-8 border-destructive/40" data-testid="adoption-summary-error">
        <CardContent className="flex flex-col gap-4 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-destructive" aria-hidden="true" />
            <div>
              <p className="font-medium text-foreground">Usage evidence unavailable</p>
              <p className="text-sm text-muted-foreground">Rainmaker could not read the event ledger. No feature should be classified from this state.</p>
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

  return (
    <Card className="mt-8" data-testid="adoption-summary-card">
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" aria-hidden="true" />
            Recorded feature use
          </CardTitle>
          <p className="mt-2 text-sm text-muted-foreground">Successful authoritative actions recorded in the last {data.windowDays} days.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} aria-hidden="true" />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-md border border-sky-300 bg-sky-50 p-4 text-sm text-sky-950">
          Counts begin only after this instrumentation is deployed. A zero means no event was recorded in this window; it does not prove the feature was historically unused.
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {data.metrics.map((metric) => (
            <div key={metric.key} className="rounded-md border p-3" data-testid={`adoption-metric-${metric.key}`}>
              <p className="text-sm font-medium text-foreground">{metric.label}</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{metric.count}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {metric.firstRecordedAt ? `First recorded ${shortDate(metric.firstRecordedAt)}` : "No post-instrumentation event recorded"}
              </p>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">This summary stores event type, record IDs, actor ID, and time only—never customer content, filenames, dimensions, prices, signing tokens, or email addresses.</p>
      </CardContent>
    </Card>
  );
}
