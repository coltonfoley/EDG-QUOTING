import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CloudUpload, Check, AlertTriangle, Loader2, ExternalLink } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { QuoteWithDetails } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface QuickBooksSyncProps {
  quote: QuoteWithDetails;
}

export function QuickBooksSync({ quote }: QuickBooksSyncProps) {
  const { toast } = useToast();
  const [showDialog, setShowDialog] = useState(false);

  const { data: qbStatus } = useQuery({
    queryKey: ["/api/quickbooks/status"],
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/quickbooks/sync-quote/${quote.id}`);
      return await response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotes", quote.id] });
      setShowDialog(true);
      toast({
        title: "Success",
        description: `Quote synced to QuickBooks as estimate ${data.docNumber}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Sync Failed",
        description: error.message || "Failed to sync quote to QuickBooks",
        variant: "destructive",
      });
    },
  });

  if (!(qbStatus as any)?.connected) {
    return null;
  }

  const getSyncStatus = () => {
    if (quote.qbSyncStatus === "synced") {
      return (
        <Badge variant="default" className="bg-green-600 hover:bg-green-700 ml-2">
          <Check className="h-3 w-3 mr-1" />
          Synced
        </Badge>
      );
    } else if (quote.qbSyncStatus === "error") {
      return (
        <Badge variant="destructive" className="ml-2">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Error
        </Badge>
      );
    } else if (quote.qbSyncStatus === "pending") {
      return (
        <Badge variant="secondary" className="ml-2">
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          Syncing...
        </Badge>
      );
    }
    return null;
  };

  const handleSync = () => {
    if (!quote.account) {
      toast({
        title: "Cannot Sync",
        description: "Quote must have an associated customer to sync to QuickBooks",
        variant: "destructive",
      });
      return;
    }

    syncMutation.mutate();
  };

  return (
    <>
      <Button
        onClick={handleSync}
        disabled={syncMutation.isPending || quote.qbSyncStatus === "pending"}
        variant="outline"
        className="px-6 py-3 text-lg border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white"
        data-testid="button-sync-quickbooks"
      >
        <CloudUpload className="mr-2 h-5 w-5" />
        {quote.qbSyncStatus === "synced" ? "Resync to" : "Push to"} QuickBooks
        {getSyncStatus()}
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-green-600" />
              Successfully Synced to QuickBooks
            </DialogTitle>
            <DialogDescription className="space-y-4">
              <p className="pt-4">
                Quote <strong>{quote.quoteNumber}</strong> has been successfully synced to QuickBooks as an estimate.
              </p>
              {quote.qbEstimateId && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-sm text-green-800">
                    <strong>Estimate ID:</strong> {quote.qbEstimateId}
                  </p>
                </div>
              )}
              {quote.qbSyncError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-sm text-red-800">
                    <strong>Previous Error:</strong> {quote.qbSyncError}
                  </p>
                </div>
              )}
              <div className="flex gap-2 pt-4">
                <Button variant="outline" onClick={() => setShowDialog(false)}>
                  Close
                </Button>
                <Button
                  onClick={() => {
                    window.open(`https://app.qbo.intuit.com/app/estimate?txnId=${quote.qbEstimateId}`, '_blank');
                  }}
                  disabled={!quote.qbEstimateId}
                  data-testid="button-view-in-quickbooks"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View in QuickBooks
                </Button>
              </div>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </>
  );
}
