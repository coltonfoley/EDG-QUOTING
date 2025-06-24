import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, FileText, Users, DollarSign } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { QuoteWithDetails } from "@shared/schema";

export default function Quotes() {
  const { data: quotes, isLoading } = useQuery<QuoteWithDetails[]>({
    queryKey: ["/api/quotes"],
  });

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
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-3xl font-bold text-charcoal">Construction Quotes</h2>
            <p className="text-accent-grey mt-2">Manage your project estimates and proposals</p>
          </div>
          <Link href="/quotes/new">
            <Button className="bg-construction-blue hover:bg-blue-700 text-white">
              <Plus className="mr-2 h-4 w-4" />
              New Quote
            </Button>
          </Link>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <FileText className="h-8 w-8 text-construction-blue" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-accent-grey">Total Quotes</p>
                  <p className="text-2xl font-bold text-charcoal">{totalQuotes}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <DollarSign className="h-8 w-8 text-success-green" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-accent-grey">Total Value</p>
                  <p className="text-2xl font-bold text-charcoal">{formatCurrency(totalValue)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Users className="h-8 w-8 text-sandy-brown" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-accent-grey">Active Customers</p>
                  <p className="text-2xl font-bold text-charcoal">{new Set(quotes?.map(q => q.customer.id)).size || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quotes Table */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Quotes</CardTitle>
          </CardHeader>
          <CardContent>
            {!quotes || quotes.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No quotes yet</h3>
                <p className="mt-1 text-sm text-gray-500">Get started by creating your first quote.</p>
                <div className="mt-6">
                  <Link href="/quotes/new">
                    <Button className="bg-construction-blue hover:bg-blue-700 text-white">
                      <Plus className="mr-2 h-4 w-4" />
                      New Quote
                    </Button>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-accent-grey uppercase tracking-wider">
                        Quote #
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-accent-grey uppercase tracking-wider">
                        Customer
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-accent-grey uppercase tracking-wider">
                        Project
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-accent-grey uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-accent-grey uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-accent-grey uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {quotes.map((quote) => {
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
                          <td className="px-6 py-4 text-sm font-medium text-construction-blue">
                            <Link href={`/quotes/${quote.id}`} className="hover:underline">
                              {quote.quoteNumber}
                            </Link>
                          </td>
                          <td className="px-6 py-4 text-sm text-charcoal">
                            {quote.customer.name}
                          </td>
                          <td className="px-6 py-4 text-sm text-charcoal">
                            {quote.projectName}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <Badge className={getStatusColor(quote.status)}>
                              {quote.status.charAt(0).toUpperCase() + quote.status.slice(1)}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 text-sm font-medium text-charcoal text-right">
                            {formatCurrency(total)}
                          </td>
                          <td className="px-6 py-4 text-center text-sm">
                            <Link href={`/quotes/${quote.id}`}>
                              <Button variant="ghost" size="sm" className="text-construction-blue hover:text-blue-700">
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
