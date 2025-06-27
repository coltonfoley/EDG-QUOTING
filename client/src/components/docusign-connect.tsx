import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileSignature, ExternalLink, Unlink, CheckCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface DocuSignConnectProps {
  onConnectionChange?: (connected: boolean) => void;
}

export function DocuSignConnect({ onConnectionChange }: DocuSignConnectProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: status, isLoading } = useQuery({
    queryKey: ["/api/docusign/status"],
    refetchInterval: 5000, // Check status every 5 seconds
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("GET", "/api/docusign/auth-url", {});
      const data = await response.json();
      
      // Open DocuSign auth in new window
      const authWindow = window.open(
        data.authUrl,
        'docusign-auth',
        'width=500,height=600,scrollbars=yes,resizable=yes'
      );

      // Check if window is closed (user completed auth)
      return new Promise<void>((resolve, reject) => {
        const checkClosed = setInterval(() => {
          if (authWindow?.closed) {
            clearInterval(checkClosed);
            // Give a moment for the callback to process
            setTimeout(() => {
              queryClient.invalidateQueries({ queryKey: ["/api/docusign/status"] });
              resolve();
            }, 1000);
          }
        }, 1000);

        // Timeout after 5 minutes
        setTimeout(() => {
          clearInterval(checkClosed);
          if (authWindow && !authWindow.closed) {
            authWindow.close();
          }
          reject(new Error("Authentication timed out"));
        }, 300000);
      });
    },
    onSuccess: () => {
      toast({
        title: "DocuSign Connected",
        description: "Successfully connected to your DocuSign account.",
      });
      onConnectionChange?.(true);
    },
    onError: (error) => {
      toast({
        title: "Connection Failed",
        description: "Failed to connect to DocuSign. Please try again.",
        variant: "destructive",
      });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/docusign/disconnect", {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/docusign/status"] });
      toast({
        title: "DocuSign Disconnected",
        description: "Successfully disconnected from DocuSign.",
      });
      onConnectionChange?.(false);
    },
    onError: () => {
      toast({
        title: "Disconnect Failed",
        description: "Failed to disconnect from DocuSign.",
        variant: "destructive",
      });
    },
  });

  const isConnected = status?.connected;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center space-x-3">
            <FileSignature className="h-6 w-6 text-edg-grey" />
            <div>
              <p className="text-sm text-edg-grey">Checking DocuSign connection...</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <FileSignature className="h-5 w-5" />
          <span>DocuSign Integration</span>
          {isConnected && (
            <Badge className="bg-green-100 text-green-800 border-green-200">
              <CheckCircle className="h-3 w-3 mr-1" />
              Connected
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isConnected ? (
          <div className="space-y-4">
            <p className="text-sm text-edg-grey">
              Your DocuSign account is connected. You can now send quotes for electronic signature.
            </p>
            <Button
              variant="outline"
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
              className="w-full"
            >
              <Unlink className="mr-2 h-4 w-4" />
              Disconnect DocuSign
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-edg-grey">
              Connect your DocuSign account to send quotes for electronic signature directly from the app.
            </p>
            <Button
              onClick={() => connectMutation.mutate()}
              disabled={connectMutation.isPending}
              className="w-full bg-edg-black hover:bg-edg-grey text-edg-white"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              {connectMutation.isPending ? "Connecting..." : "Connect DocuSign"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}