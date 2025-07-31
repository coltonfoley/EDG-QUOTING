import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Plus, FileText, Users, DollarSign, Search } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useAuth } from "@/hooks/useAuth";
import type { QuoteWithDetails } from "@shared/schema";

export default function Quotes() {
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  
  const { data: quotes, isLoading, error } = useQuery<QuoteWithDetails[]>({
    queryKey: ["/api/quotes"],
    enabled: isAuthenticated,
  });

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, authLoading, toast]);

  // Handle unauthorized errors
  useEffect(() => {
    if (error && isUnauthorizedError(error as Error)) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [error, toast]);

  const filteredQuotes = useMemo(() => {
    if (!quotes || !searchTerm.trim()) return quotes;
    
    const term = searchTerm.toLowerCase();
    return quotes.filter(quote => 
      quote.quoteNumber.toLowerCase().includes(term) ||
      quote.customer.name.toLowerCase().includes(term) ||
      quote.customer.email.toLowerCase().includes(term) ||
      (quote.customer.company && quote.customer.company.toLowerCase().includes(term)) ||
      quote.projectName.toLowerCase().includes(term) ||
      quote.projectAddress.toLowerCase().includes(term)
    );
  }, [quotes, searchTerm]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "draft":
        return "bg-yellow-100 text-yellow-800";
      case "sent":
        return "bg-blue-100 text-blue-800";
      case "approved":
        return "bg-green-100 text-green-800";
      case "rejected":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const totalQuotes = quotes?.length || 0;
  const totalValue = quotes?.reduce((sum, quote) => {
    const lineItemsTotal = quote.lineItems.reduce((itemSum, item) => {
      const qty = parseFloat(item.quantity.toString());
      const price = parseFloat(item.unitPrice.toString());
      const markup = parseFloat(item.markupValue.toString());
      const baseTotal = qty * price;
      const total = item.markupType === 'percentage' 
        ? baseTotal + (baseTotal * (markup / 100))
        : baseTotal + markup;
      return itemSum + total;
    }, 0);
    return sum + lineItemsTotal;
  }, 0) || 0;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-64 mb-6"></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-8 space-y-4 sm:space-y-0">
          <div>
            <h2 className="text-3xl font-bold text-edg-black">Project Quotes</h2>
            <p className="text-edg-grey mt-2">Manage your patio & shade project estimates</p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-edg-grey h-4 w-4" />
              <Input
                placeholder="Search quotes, customers, projects..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 w-full sm:w-80"
              />
            </div>

            <Link href="/quotes/new">
              <Button className="bg-edg-black hover:bg-edg-grey text-edg-white w-full sm:w-auto">
                <Plus className="mr-2 h-4 w-4" />
                New Quote
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <FileText className="h-8 w-8 text-edg-teal" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-edg-grey">Total Quotes</p>
                  <p className="text-2xl font-bold text-edg-black">{totalQuotes}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <DollarSign className="h-8 w-8 text-edg-teal" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-edg-grey">Total Value</p>
                  <p className="text-2xl font-bold text-edg-black">{formatCurrency(totalValue)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Users className="h-8 w-8 text-edg-teal" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-edg-grey">Active Customers</p>
                  <p className="text-2xl font-bold text-edg-black">{new Set(quotes?.map(q => q.customer.id)).size || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quotes Table */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-3 sm:space-y-0">
              <CardTitle>Recent Quotes</CardTitle>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-edg-grey h-4 w-4" />
                <Input
                  placeholder="Search quotes..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-full sm:w-64"
                />
              </div>
            </div>
            {searchTerm && (
              <p className="text-sm text-edg-grey mt-2">
                Found {filteredQuotes?.length || 0} quote{filteredQuotes?.length !== 1 ? 's' : ''} matching "{searchTerm}"
              </p>
            )}
          </CardHeader>
          <CardContent>
            {!quotes || quotes.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No quotes yet</h3>
                <p className="mt-1 text-sm text-gray-500">Get started by creating your first quote.</p>
                <div className="mt-6">
                  <Link href="/quotes/new">
                    <Button className="bg-edg-black hover:bg-edg-grey text-edg-white">
                      <Plus className="mr-2 h-4 w-4" />
                      New Quote
                    </Button>
                  </Link>
                </div>
              </div>
            ) : filteredQuotes && filteredQuotes.length === 0 ? (
              <div className="text-center py-12">
                <Search className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No quotes found</h3>
                <p className="mt-1 text-sm text-gray-500">Try adjusting your search terms.</p>
                <div className="mt-6">
                  <Button 
                    variant="outline" 
                    onClick={() => setSearchTerm("")}
                  >
                    Clear Search
                  </Button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-edg-grey uppercase tracking-wider">
                        Quote #
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-edg-grey uppercase tracking-wider">
                        Customer
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-edg-grey uppercase tracking-wider">
                        Project
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-edg-grey uppercase tracking-wider">
                        Workflow
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-edg-grey uppercase tracking-wider">
                        Signature
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-edg-grey uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-edg-grey uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {(filteredQuotes || quotes).map((quote) => {
                      const total = quote.lineItems.reduce((sum, item) => {
                        const qty = parseFloat(item.quantity.toString());
                        const price = parseFloat(item.unitPrice.toString());
                        const markup = parseFloat(item.markupValue.toString());
                        const baseTotal = qty * price;
                        const itemTotal = item.markupType === 'percentage' 
                          ? baseTotal + (baseTotal * (markup / 100))
                          : baseTotal + markup;
                        return sum + itemTotal;
                      }, 0);

                      return (
                        <tr key={quote.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 text-sm font-medium text-edg-teal">
                            <Link href={`/quotes/${quote.id}`} className="hover:underline">
                              {quote.quoteNumber}
                            </Link>
                          </td>
                          <td className="px-6 py-4 text-sm text-edg-black">
                            <div>
                              <div className="font-medium">{quote.customer.name}</div>
                              {quote.customer.company && (
                                <div className="text-xs text-edg-grey">{quote.customer.company}</div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-edg-black">
                            {quote.projectName}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <Badge className={getStatusColor(quote.status)}>
                              {quote.status.charAt(0).toUpperCase() + quote.status.slice(1)}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              quote.signatureStatus === 'signed' ? 'bg-green-100 text-green-800' :
                              quote.signatureStatus === 'unsigned' ? 'bg-red-100 text-red-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {quote.signatureStatus === 'signed' ? 'Signed by EDG' : 
                               quote.signatureStatus === 'unsigned' ? 'Unsigned' : 
                               quote.signatureStatus?.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm font-medium text-edg-black text-right">
                            {formatCurrency(total)}
                          </td>
                          <td className="px-6 py-4 text-center text-sm">
                            <Link href={`/quotes/${quote.id}`}>
                              <Button variant="ghost" size="sm" className="text-edg-teal hover:text-edg-dark-teal">
                                Edit
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
