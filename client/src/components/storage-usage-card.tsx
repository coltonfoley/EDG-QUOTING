import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Database } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";

type StorageUsage = {
  usedBytes: number;
  quotaBytes: number | null;
  objectCount: number;
  calculatedAt: string;
  cached?: boolean;
  unavailableReason?: string;
};

function formatStorage(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 GB";
  }

  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export function StorageUsageCard() {
  const { data, isError, isLoading } = useQuery<StorageUsage>({
    queryKey: ["/api/storage/usage"],
    queryFn: async ({ signal }) => {
      const response = await apiRequest("GET", "/api/storage/usage", undefined, { signal });
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  if (isLoading) {
    return (
      <Card className="mt-8">
        <CardContent className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
          <Database className="h-4 w-4" />
          Checking storage usage...
        </CardContent>
      </Card>
    );
  }

  if (isError || !data || data.unavailableReason) {
    return (
      <Card className="mt-8">
        <CardContent className="flex items-start gap-3 py-4 text-sm text-muted-foreground">
          <AlertCircle className="mt-0.5 h-4 w-4" />
          <div>
            <p className="font-medium text-foreground">Storage usage unavailable</p>
            <p className="text-xs">
              {data?.unavailableReason || "Rainmaker could not read storage usage right now."}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const usedPercent = data.quotaBytes
    ? Math.min(100, Math.round((data.usedBytes / data.quotaBytes) * 100))
    : null;
  const refreshedAt = new Date(data.calculatedAt).toLocaleString([], {
    dateStyle: "short",
    timeStyle: "short",
  });

  return (
    <Card className="mt-8">
      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Database className="mt-0.5 h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground">Storage usage</p>
            <p className="text-xs text-muted-foreground">
              Tucked here for admins. Last checked {refreshedAt}.
            </p>
          </div>
        </div>
        <div className="text-sm text-muted-foreground sm:text-right">
          <p className="font-medium text-foreground">
            {formatStorage(data.usedBytes)}
            {data.quotaBytes ? ` / ${formatStorage(data.quotaBytes)}` : ""}
          </p>
          <p className="text-xs text-muted-foreground">
            {data.objectCount.toLocaleString()} files
            {usedPercent !== null ? ` • ${usedPercent}% used` : ""}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
