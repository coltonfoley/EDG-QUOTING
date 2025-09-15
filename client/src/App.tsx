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
import CRMPage from "@/pages/crm";
// New CRM System Pages
import DashboardPage from "@/pages/dashboard";
import AccountsPage from "@/pages/accounts";
import ContactsPage from "@/pages/contacts";
import OpportunitiesPage from "@/pages/opportunities";
import BusinessPartnersPage from "@/pages/business-partners";

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
          <Route path="/:rest*" component={AuthPage} />
        </>
      ) : (
        <>
          <Route path="/" component={Home} />
          <Route path="/quotes" component={Quotes} />
          <Route path="/quote-builder" component={QuoteBuilder} />
          <Route path="/quotes/new" component={QuoteBuilder} />
          <Route path="/quotes/:id" component={QuoteBuilder} />
          <Route path="/products" component={Products} />
          <Route path="/contracts" component={ContractsPage} />
          {/* Legacy CRM route - redirect to opportunities */}
          <Route path="/crm" component={OpportunitiesPage} />
          {/* New Comprehensive CRM System */}
          <Route path="/dashboard" component={DashboardPage} />
          <Route path="/accounts" component={AccountsPage} />
          <Route path="/contacts" component={ContactsPage} />
          <Route path="/opportunities" component={OpportunitiesPage} />
          <Route path="/business-partners" component={BusinessPartnersPage} />
          {/* Redirect old partner routes to consolidated page */}
          <Route path="/vendors">
            {() => {
              window.location.replace('/business-partners');
              return null;
            }}
          </Route>
          <Route path="/contractors">
            {() => {
              window.location.replace('/business-partners');
              return null;
            }}
          </Route>
          <Route path="/suppliers">
            {() => {
              window.location.replace('/business-partners');
              return null;
            }}
          </Route>
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
