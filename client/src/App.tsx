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
import { AlertTriangle, RefreshCw } from "lucide-react";
import NotFound from "@/pages/not-found";
import Quotes from "@/pages/quotes";
import QuoteBuilder from "@/pages/quote-builder";
import QuoteDetail from "@/pages/quote-detail";
import Products from "@/pages/products";
import Landing from "@/pages/landing";
import Home from "@/pages/home";
import AuthPage from "@/pages/auth-page";
import AdminPage from "@/pages/admin";
import AdminTemplatesPage from "@/pages/admin-templates";
import ContractsPage from "@/pages/contracts";
import Accounts from "@/pages/accounts";
import AccountDetail from "@/pages/account-detail";
import Pipeline from "@/pages/pipeline";

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
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full">
          <Alert className="border-red-200 bg-red-50">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertTitle className="text-red-900">Connection Error</AlertTitle>
            <AlertDescription className="text-red-700">
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
    <Switch>
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
          <Route path="/quotes" component={Quotes} />
          <Route path="/pipeline" component={Pipeline} />
          <Route path="/quotes/new" component={QuoteBuilder} />
          <Route path="/quotes/:id/edit" component={QuoteBuilder} />
          <Route path="/quotes/:id" component={QuoteDetail} />
          <Route path="/products" component={Products} />
          <Route path="/contracts">
            <Redirect to="/admin/contracts" />
          </Route>
          <Route path="/admin" component={AdminPage} />
          <Route path="/admin/templates" component={AdminTemplatesPage} />
          <Route path="/admin/contracts" component={ContractsPage} />
          {/* Catch-all for not found pages */}
          <Route component={NotFound} />
        </>
      )}
    </Switch>
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
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
