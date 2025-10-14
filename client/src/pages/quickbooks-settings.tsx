import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, XCircle, Settings, ExternalLink } from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "wouter";

export default function QuickBooksSettings() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data: status, isLoading } = useQuery({
    queryKey: ["/api/quickbooks/status"],
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("GET", "/api/quickbooks/connect");
      return await response.json();
    },
    onSuccess: (data: any) => {
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to initiate QuickBooks connection",
        variant: "destructive",
      });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/quickbooks/disconnect");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quickbooks/status"] });
      toast({
        title: "Success",
        description: "QuickBooks disconnected successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to disconnect QuickBooks",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("qb_connected") === "true") {
      toast({
        title: "Success",
        description: "QuickBooks connected successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/quickbooks/status"] });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.has("qb_error")) {
      const error = params.get("qb_error");
      toast({
        title: "Connection Error",
        description: `Failed to connect QuickBooks: ${error}`,
        variant: "destructive",
      });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [toast]);

  if (isLoading) {
    return (
      <div>
        <AppHeader />
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  const isConnected = (status as any)?.connected;

  return (
    <div>
      <AppHeader />
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">QuickBooks Integration</h1>
          <p className="text-muted-foreground">
            Connect your QuickBooks Online account to sync quotes as estimates
          </p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Connection Status
                </CardTitle>
                <CardDescription>
                  Manage your QuickBooks Online integration
                </CardDescription>
              </div>
              {isConnected ? (
                <Badge variant="default" className="bg-green-600 hover:bg-green-700">
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Connected
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <XCircle className="h-4 w-4 mr-1" />
                  Not Connected
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {isConnected ? (
              <>
                <div className="rounded-lg bg-green-50 border border-green-200 p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-green-900 mb-1">
                        QuickBooks Connected
                      </h3>
                      <p className="text-sm text-green-700">
                        Your QuickBooks account is connected. You can now sync quotes to QuickBooks as estimates.
                      </p>
                      {(status as any)?.realmId && (
                        <p className="text-xs text-green-600 mt-2">
                          Company ID: {(status as any).realmId}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="font-semibold">What you can do:</h3>
                  <ul className="space-y-2">
                    <li className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <span>Sync quotes to QuickBooks as estimates</span>
                    </li>
                    <li className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <span>Automatically create customers in QuickBooks</span>
                    </li>
                    <li className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <span>Track sync status for each quote</span>
                    </li>
                  </ul>
                </div>

                <div className="pt-4 border-t">
                  <Button
                    variant="destructive"
                    onClick={() => disconnectMutation.mutate()}
                    disabled={disconnectMutation.isPending}
                    data-testid="button-disconnect-quickbooks"
                  >
                    {disconnectMutation.isPending ? "Disconnecting..." : "Disconnect QuickBooks"}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Connect your QuickBooks Online account to automatically sync quotes as estimates.
                    This integration allows you to:
                  </p>
                  <ul className="space-y-2">
                    <li className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                      <span>Convert quotes to QuickBooks estimates with one click</span>
                    </li>
                    <li className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                      <span>Automatically sync customer information</span>
                    </li>
                    <li className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                      <span>Keep estimates in sync with your quote data</span>
                    </li>
                  </ul>
                </div>

                <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
                  <h3 className="font-semibold text-blue-900 mb-2">Before you connect:</h3>
                  <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
                    <li>Make sure you have QuickBooks Online credentials ready</li>
                    <li>Ensure you have admin access to your QuickBooks account</li>
                    <li>This will redirect you to QuickBooks to authorize the connection</li>
                  </ul>
                </div>

                <div className="pt-4">
                  <Button
                    onClick={() => connectMutation.mutate()}
                    disabled={connectMutation.isPending}
                    className="w-full sm:w-auto"
                    data-testid="button-connect-quickbooks"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    {connectMutation.isPending ? "Connecting..." : "Connect QuickBooks"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <div className="mt-6 p-4 bg-gray-50 rounded-lg border">
          <h3 className="font-semibold mb-2 text-sm">Need Help?</h3>
          <p className="text-sm text-muted-foreground">
            If you encounter any issues connecting to QuickBooks, please contact support.
          </p>
        </div>
      </main>
    </div>
  );
}
