import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, XCircle, Settings, RefreshCw, AlertCircle } from "lucide-react";

export default function GoogleContactsSettings() {
  const { toast } = useToast();
  const [userEmail, setUserEmail] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);

  const { data: status, isLoading } = useQuery({
    queryKey: ["/api/google-contacts/status"],
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!userEmail) {
        throw new Error('Please enter the Google account email address');
      }

      setIsSyncing(true);
      const response = await apiRequest("POST", "/api/google-contacts/sync", { userEmail });
      return await response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/google-contacts/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      
      toast({
        title: "Sync Complete",
        description: `Imported ${data.imported} contacts. ${data.errors?.length > 0 ? `${data.errors.length} errors occurred.` : ''}`,
      });
      setIsSyncing(false);
    },
    onError: (error: any) => {
      toast({
        title: "Sync Failed",
        description: error.message || "Failed to sync Google Contacts",
        variant: "destructive",
      });
      setIsSyncing(false);
    },
  });

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

  const isConfigured = (status as any)?.configured;

  return (
    <div>
      <AppHeader />
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Google Contacts Integration</h1>
          <p className="text-muted-foreground">
            Sync contacts from your team's Google account
          </p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Sync Status
                </CardTitle>
                <CardDescription>
                  Import contacts from Google Contacts
                </CardDescription>
              </div>
              {isConfigured ? (
                <Badge variant="default" className="bg-green-600 hover:bg-green-700" data-testid="badge-configured">
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Configured
                </Badge>
              ) : (
                <Badge variant="destructive" data-testid="badge-not-configured">
                  <XCircle className="h-4 w-4 mr-1" />
                  Not Configured
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {isConfigured ? (
              <>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="user-email">Google Account Email</Label>
                    <Input
                      id="user-email"
                      type="email"
                      placeholder="contacts@yourcompany.com"
                      value={userEmail}
                      onChange={(e) => setUserEmail(e.target.value)}
                      data-testid="input-email"
                    />
                    <p className="text-sm text-muted-foreground mt-1">
                      Enter the email address of the Google account that contains the contacts to sync
                    </p>
                  </div>
                  <Button
                    onClick={() => syncMutation.mutate()}
                    disabled={isSyncing || syncMutation.isPending || !userEmail}
                    data-testid="button-sync"
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing || syncMutation.isPending ? 'animate-spin' : ''}`} />
                    {isSyncing || syncMutation.isPending ? 'Syncing...' : 'Sync Now'}
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-yellow-900">Service Account Not Configured</p>
                    <p className="text-sm text-yellow-700 mt-1">
                      To enable Google Contacts sync, you need to set up a Service Account. Please contact your administrator.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
