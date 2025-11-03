import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, XCircle, Settings, RefreshCw, Users } from "lucide-react";
import { useEffect, useState } from "react";

export default function GoogleContactsSettings() {
  const { toast } = useToast();
  const [isSyncing, setIsSyncing] = useState(false);

  const { data: status, isLoading } = useQuery({
    queryKey: ["/api/google-contacts/status"],
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("GET", "/api/google-contacts/auth");
      return await response.json();
    },
    onSuccess: (data: any) => {
      if (data.authUrl) {
        const width = 600;
        const height = 700;
        const left = window.screen.width / 2 - width / 2;
        const top = window.screen.height / 2 - height / 2;
        window.open(
          data.authUrl,
          'Google OAuth',
          `width=${width},height=${height},top=${top},left=${left}`
        );
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to initiate Google connection",
        variant: "destructive",
      });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/google-contacts/disconnect");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/google-contacts/status"] });
      toast({
        title: "Success",
        description: "Google Contacts disconnected successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to disconnect Google Contacts",
        variant: "destructive",
      });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      setIsSyncing(true);
      const response = await apiRequest("POST", "/api/google-contacts/sync");
      return await response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/google-contacts/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      
      toast({
        title: "Sync Complete",
        description: `Imported ${data.imported} contacts, updated ${data.updated}. ${data.errors?.length > 0 ? `${data.errors.length} errors occurred.` : ''}`,
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

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'GOOGLE_AUTH_SUCCESS') {
        toast({
          title: "Success",
          description: "Google Contacts connected successfully!",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/google-contacts/status"] });
        
        setTimeout(() => {
          syncMutation.mutate();
        }, 1000);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
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
  const lastSync = (status as any)?.lastSync;

  return (
    <div>
      <AppHeader />
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Google Contacts Integration</h1>
          <p className="text-muted-foreground">
            Sync your contacts between this app and Google Contacts
          </p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Connection Status
                </CardTitle>
                <CardDescription>
                  Manage your Google Contacts integration
                </CardDescription>
              </div>
              {isConnected ? (
                <Badge variant="default" className="bg-green-600 hover:bg-green-700" data-testid="badge-connected">
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Connected
                </Badge>
              ) : (
                <Badge variant="destructive" data-testid="badge-disconnected">
                  <XCircle className="h-4 w-4 mr-1" />
                  Not Connected
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {isConnected ? (
              <>
                <div className="flex flex-col gap-4">
                  <div className="text-sm text-muted-foreground">
                    {lastSync ? (
                      <p>Last synced: {new Date(lastSync).toLocaleString()}</p>
                    ) : (
                      <p>No sync performed yet</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => syncMutation.mutate()}
                      disabled={isSyncing || syncMutation.isPending}
                      data-testid="button-sync"
                    >
                      <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing || syncMutation.isPending ? 'animate-spin' : ''}`} />
                      {isSyncing || syncMutation.isPending ? 'Syncing...' : 'Sync Now'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => disconnectMutation.mutate()}
                      disabled={disconnectMutation.isPending}
                      data-testid="button-disconnect"
                    >
                      Disconnect
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Connect your Google account to automatically sync contacts between this app and Google Contacts.
                  Changes you make in either place will be reflected in both.
                </p>
                <Button
                  onClick={() => connectMutation.mutate()}
                  disabled={connectMutation.isPending}
                  data-testid="button-connect"
                >
                  <Users className="h-4 w-4 mr-2" />
                  Connect Google Contacts
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>How It Works</CardTitle>
            <CardDescription>Understanding the two-way sync</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <h3 className="font-semibold text-sm">Pull from Google</h3>
              <p className="text-sm text-muted-foreground">
                When you sync, all contacts from your Google Contacts will be imported into this app.
                Contact names, emails, phone numbers, addresses, and company information will be synchronized.
              </p>
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-sm">Push to Google</h3>
              <p className="text-sm text-muted-foreground">
                When you create or update contacts in this app, they will automatically be pushed to your Google Contacts.
                This keeps both systems in sync.
              </p>
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-sm">Privacy & Security</h3>
              <p className="text-sm text-muted-foreground">
                We only access and sync contact information. Your Google credentials are securely stored and
                we follow Google's security best practices. You can disconnect at any time.
              </p>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
