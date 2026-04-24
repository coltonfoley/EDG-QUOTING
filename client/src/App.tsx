import { lazy, Suspense, useState, useCallback } from "react";
import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useIsFetching, useIsMutating } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ErrorBoundary } from "@/components/error-boundary";
import { LoadingBar } from "@/components/loading-bar";
import { LoadingSpinner } from "@/components/loading-spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, MessageCircle } from "lucide-react";
import { ReportIssueButton } from "@/components/report-issue-button";

const AIAssistant = lazy(() => import("@/components/ai-assistant").then(m => ({ default: m.AIAssistant })));

const NotFound = lazy(() => import("@/pages/not-found"));
const Quotes = lazy(() => import("@/pages/quotes"));
const QuoteBuilder = lazy(() => import("@/pages/quote-builder"));
const Products = lazy(() => import("@/pages/products"));
const Landing = lazy(() => import("@/pages/landing"));
const Home = lazy(() => import("@/pages/home"));
const Leads = lazy(() => import("@/pages/leads"));
const AuthPage = lazy(() => import("@/pages/auth-page"));
const AdminPage = lazy(() => import("@/pages/admin"));
const ContractsPage = lazy(() => import("@/pages/contracts"));
const QuickBooksSettings = lazy(() => import("@/pages/quickbooks-settings"));
const GoogleContactsSettings = lazy(() => import("@/pages/google-contacts-settings"));
const Accounts = lazy(() => import("@/pages/accounts"));
const AccountDetail = lazy(() => import("@/pages/account-detail"));
const Pipeline = lazy(() => import("@/pages/pipeline"));
const PublicSignPage = lazy(() => import("@/pages/public-sign"));
const ChangePassword = lazy(() => import("@/pages/change-password"));

function GlobalLoadingIndicator() {
  const isFetching = useIsFetching();
  const isMutating = useIsMutating();
  const isLoading = isFetching > 0 || isMutating > 0;
  
  return <LoadingBar isLoading={isLoading} />;
}

function Router() {
  const { isAuthenticated, isLoading, error } = useAuth();
  const [location, setLocation] = useLocation();

  // Show loading spinner while auth is being checked
  if (isLoading) {
    return <LoadingSpinner fullScreen text="Loading application..." />;
  }

  // If there's an error (timeout or network issue), show error state with retry
  if (error && !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-md w-full">
          <Alert className="border-destructive/50 bg-destructive/10">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <AlertTitle className="text-destructive">Connection Error</AlertTitle>
            <AlertDescription className="text-destructive/90">
              {error.message || "Unable to verify authentication status. Please check your connection and try again."}
            </AlertDescription>
          </Alert>
          <div className="flex gap-4 mt-6 justify-center">
            <Button
              onClick={() => window.location.reload()}
              className="flex items-center gap-2"
              data-testid="button-retry-auth"
            >
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
            <Button
              variant="outline"
              onClick={() => setLocation("/auth")}
              data-testid="button-go-to-login"
            >
              Go to Login
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={<LoadingSpinner fullScreen text="Loading page..." />}>
      <Switch>
        {/* Public routes - accessible without authentication */}
        <Route path="/sign/:token" component={PublicSignPage} />
        
        {!isAuthenticated ? (
          <>
            <Route path="/auth" component={AuthPage} />
            {/* Redirect all other paths to auth when not authenticated */}
            <Route>
              <Redirect to="/auth" />
            </Route>
          </>
        ) : (
          <>
            <Route path="/" component={Home} />
            <Route path="/auth">
              <Redirect to="/" />
            </Route>
            <Route path="/accounts" component={Accounts} />
            <Route path="/accounts/:id" component={AccountDetail} />
            <Route path="/leads" component={Leads} />
            <Route path="/quotes" component={Quotes} />
            <Route path="/pipeline" component={Pipeline} />
            <Route path="/quotes/new" component={QuoteBuilder} />
            <Route path="/quotes/:id/edit" component={QuoteBuilder} />
            <Route path="/products" component={Products} />
            <Route path="/contracts">
              <Redirect to="/admin/contracts" />
            </Route>
            <Route path="/admin" component={AdminPage} />
            <Route path="/admin/contracts" component={ContractsPage} />
            <Route path="/admin/quickbooks" component={QuickBooksSettings} />
            <Route path="/admin/google-contacts" component={GoogleContactsSettings} />
            <Route path="/change-password" component={ChangePassword} />
            <Route component={NotFound} />
          </>
        )}
      </Switch>
    </Suspense>
  );
}

function AIAssistantLauncher() {
  const [activated, setActivated] = useState(false);

  const handleOpen = useCallback(() => {
    setActivated(true);
  }, []);

  if (!activated) {
    return (
      <Button
        onClick={handleOpen}
        size="icon"
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg bg-primary hover:bg-primary/90"
        aria-label="Open AI Assistant"
      >
        <MessageCircle className="h-6 w-6" />
      </Button>
    );
  }

  return (
    <Suspense fallback={null}>
      <AIAssistant defaultOpen />
    </Suspense>
  );
}

function InternalUIComponents() {
  const [location] = useLocation();
  
  if (location.startsWith('/sign/')) {
    return null;
  }
  
  return (
    <>
      <ReportIssueButton />
      <AIAssistantLauncher />
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <GlobalLoadingIndicator />
            <Toaster />
            <Router />
            <InternalUIComponents />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
