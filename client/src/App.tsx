import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import NotFound from "@/pages/not-found";
import Quotes from "@/pages/quotes";
import QuoteBuilder from "@/pages/quote-builder";
import Products from "@/pages/products";
import Landing from "@/pages/landing";
import Home from "@/pages/home";
import AuthPage from "@/pages/auth-page";
import AdminPage from "@/pages/admin";
import AdminTemplatesPage from "@/pages/admin-templates";
import ContractsPage from "@/pages/contracts";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <Switch>
      {!isAuthenticated ? (
        <>
          <Route path="/" component={AuthPage} />
          <Route path="/auth" component={AuthPage} />
        </>
      ) : (
        <>
          <Route path="/" component={Home} />
          <Route path="/quotes" component={Quotes} />
          <Route path="/quotes/new" component={QuoteBuilder} />
          <Route path="/quotes/:id(\\d+)" component={QuoteBuilder} />
          <Route path="/products" component={Products} />
          <Route path="/contracts" component={ContractsPage} />
          <Route path="/admin" component={AdminPage} />
          <Route path="/admin/templates" component={AdminTemplatesPage} />
        </>
      )}
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
