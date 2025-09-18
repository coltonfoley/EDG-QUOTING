import { useAuth } from "@/hooks/useAuth";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertTriangle, RefreshCw, LogIn, Loader2 } from "lucide-react";
import { useLocation } from "wouter";

export function AuthStatus() {
  const { isLoading, error, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  // Don't show anything if authenticated
  if (isAuthenticated) {
    return null;
  }

  // Loading state with timeout indicator
  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm">
        <Card className="p-6 max-w-sm w-full mx-4">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div className="text-center">
              <h3 className="font-semibold">Checking authentication</h3>
              <p className="text-sm text-muted-foreground mt-1">
                This should only take a moment...
              </p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // Error state - authentication check failed
  if (error) {
    const isTimeout = error.message?.includes("timeout");
    const isOffline = error.message?.includes("offline");
    
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm">
        <Card className="p-6 max-w-md w-full mx-4">
          <Alert className="border-amber-200 bg-amber-50">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-900">
              {isTimeout ? "Connection Timeout" :
               isOffline ? "You're Offline" : 
               "Authentication Error"}
            </AlertTitle>
            <AlertDescription className="text-amber-700">
              {isTimeout ? "We couldn't verify your authentication status. The server might be slow or unavailable." :
               isOffline ? "Please check your internet connection and try again." :
               "Unable to verify your authentication. Please try again or login."}
            </AlertDescription>
          </Alert>
          
          <div className="flex gap-3 mt-6">
            <Button
              onClick={() => window.location.reload()}
              className="flex-1 flex items-center justify-center gap-2"
              data-testid="button-retry-auth-check"
            >
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
            <Button
              variant="outline"
              onClick={() => setLocation("/auth")}
              className="flex-1 flex items-center justify-center gap-2"
              data-testid="button-proceed-to-login"
            >
              <LogIn className="h-4 w-4" />
              Go to Login
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return null;
}