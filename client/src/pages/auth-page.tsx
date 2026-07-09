import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, LogIn } from "lucide-react";

export default function AuthPage() {
  const [, navigate] = useLocation();
  const { user, isLoading } = useAuth();
  const [googleSignInEnabled, setGoogleSignInEnabled] = useState(false);
  const [statusLoaded, setStatusLoaded] = useState(false);

  useEffect(() => {
    if (!isLoading && user) navigate("/");
  }, [user, isLoading, navigate]);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/auth/google/status")
      .then((response) => (response.ok ? response.json() : { enabled: false }))
      .then((status) => {
        if (!cancelled) setGoogleSignInEnabled(Boolean(status.enabled));
      })
      .catch(() => {
        if (!cancelled) setGoogleSignInEnabled(false);
      })
      .finally(() => {
        if (!cancelled) setStatusLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-border" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-foreground">Team Login</h1>
            <p className="text-muted-foreground mt-2">Use your EDG Google Workspace account</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Sign in to Rainmaker</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={!statusLoaded || !googleSignInEnabled}
                onClick={() => window.location.assign("/api/auth/google")}
              >
                {!statusLoaded ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <LogIn className="mr-2 h-4 w-4" />
                )}
                Continue with Google Workspace
              </Button>
              {statusLoaded && !googleSignInEnabled && (
                <p className="text-sm text-destructive text-center">
                  Google Workspace sign-in is not configured. Contact an administrator.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="hidden lg:flex lg:w-1/2 bg-edg-teal text-white p-12 items-center">
        <div>
          <h2 className="text-4xl font-bold mb-6">Rainmaker, by EDG</h2>
          <h3 className="text-2xl font-semibold mb-4">Quote Management System</h3>
          <p className="text-lg opacity-90">
            Secure access for the EDG Patio & Shade team.
          </p>
        </div>
      </div>
    </div>
  );
}
