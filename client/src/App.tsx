import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useIsFetching, useIsMutating } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ErrorBoundary } from "@/components/error-boundary";
import { LoadingBar } from "@/components/loading-bar";
import { LoadingSpinner } from "@/components/loading-spinner";
import NotFound from "@/pages/not-found";
import Quotes from "@/pages/quotes";
import QuoteBuilder from "@/pages/quote-builder";
import Products from "@/pages/products";
import Leads from "@/pages/leads";
import Landing from "@/pages/landing";
import Home from "@/pages/home";
import AuthPage from "@/pages/auth-page";
import AdminPage from "@/pages/admin";
import AdminTemplatesPage from "@/pages/admin-templates";
import ContractsPage from "@/pages/contracts";

function GlobalLoadingIndicator() {
  const isFetching = useIsFetching();
  const isMutating = useIsMutating();
  const isLoading = isFetching > 0 || isMutating > 0;
  
  return <LoadingBar isLoading={isLoading} />;
}

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingSpinner fullScreen text="Loading application..." />;
  }

  return (
    <Switch>
      {!isAuthenticated ? (
        <>
          <Route path="/" component={AuthPage} />
          <Route path="/auth" component={AuthPage} />
          {/* Catch-all route for unauthenticated users */}
          <Route component={AuthPage} />
        </>
      ) : (
        <>
          <Route path="/" component={Home} />
          <Route path="/quotes" component={Quotes} />
          <Route path="/quotes/new" component={QuoteBuilder} />
          <Route path={/\/quotes\/\d+$/} component={QuoteBuilder} />
          <Route path="/products" component={Products} />
          <Route path="/leads" component={Leads} />
          <Route path="/contracts" component={ContractsPage} />
          <Route path="/admin" component={AdminPage} />
          <Route path="/admin/templates" component={AdminTemplatesPage} />
          {/* Catch-all route for authenticated users */}
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
