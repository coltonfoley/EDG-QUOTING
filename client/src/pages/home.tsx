import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, ClipboardList, FileText, Users, Clock, DollarSign } from "lucide-react";
import { Link } from "wouter";
import { AppHeader } from "@/components/app-header";
import { useQuery } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import type { QuoteWithDetails } from "@shared/schema";

export default function Home() {
  const { data: quotes, isLoading } = useQuery<QuoteWithDetails[]>({
    queryKey: ['/api/quotes'],
  });

  // Get recent quotes (last 5, sorted by creation date)
  const recentQuotes = quotes?.slice().sort((a, b) => {
    const dateA = new Date(a.createdAt);
    const dateB = new Date(b.createdAt);
    return dateB.getTime() - dateA.getTime();
  }).slice(0, 5) || [];

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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) return "Today";
    if (diffDays === 2) return "Yesterday";
    if (diffDays <= 7) return `${diffDays - 1} days ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader />

      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-edg-black mb-2">Dashboard</h2>
          <p className="text-edg-grey">Welcome back! Manage your quotes and grow your business.</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <Link href="/quotes">
            <Card className="cursor-pointer hover:shadow-lg transition-shadow">
              <CardHeader className="text-center">
                <ClipboardList className="h-12 w-12 text-edg-teal mx-auto mb-4" />
                <CardTitle className="text-xl">Quotes</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-center">
                  View, create, and manage all your project quotes in one place.
                </CardDescription>
              </CardContent>
            </Card>
          </Link>

          <Link href="/products">
            <Card className="cursor-pointer hover:shadow-lg transition-shadow">
              <CardHeader className="text-center">
                <Building2 className="h-12 w-12 text-edg-teal mx-auto mb-4" />
                <CardTitle className="text-xl">Products</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-center">
                  Manage your catalog of products and services with pricing.
                </CardDescription>
              </CardContent>
            </Card>
          </Link>

          <Link href="/quote-builder">
            <Card className="cursor-pointer hover:shadow-lg transition-shadow">
              <CardHeader className="text-center">
                <FileText className="h-12 w-12 text-edg-teal mx-auto mb-4" />
                <CardTitle className="text-xl">New Quote</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-center">
                  Create a new quote for a customer project.
                </CardDescription>
              </CardContent>
            </Card>
          </Link>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-edg-teal" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-gray-200 rounded animate-pulse"></div>
                      <div className="flex-1 space-y-1">
                        <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
                        <div className="h-3 bg-gray-200 rounded w-2/3 animate-pulse"></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : recentQuotes.length > 0 ? (
                <div className="space-y-3">
                  {recentQuotes.map((quote) => (
                    <div key={quote.id} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-edg-teal bg-opacity-10 rounded-full flex items-center justify-center">
                          <FileText className="h-5 w-5 text-edg-teal" />
                        </div>
                        <div>
                          <div className="font-medium text-sm">
                            Quote {quote.quoteNumber}
                          </div>
                          <div className="text-xs text-edg-grey">
                            {quote.customer.name} • {formatDate(quote.createdAt)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge className={getStatusColor(quote.status)} variant="secondary">
                          {quote.status.charAt(0).toUpperCase() + quote.status.slice(1)}
                        </Badge>
                        <div className="text-sm font-medium text-edg-black">
                          {formatCurrency(quote.lineItems.reduce((sum, item) => {
                            const itemTotal = item.quantity * item.unitPrice;
                            const markupAmount = item.markupType === 'percentage' 
                              ? itemTotal * (item.markupValue / 100)
                              : Number(item.markupValue);
                            return sum + itemTotal + markupAmount;
                          }, 0))}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="pt-2 border-t">
                    <Link href="/quotes">
                      <Button variant="ghost" size="sm" className="w-full text-edg-teal hover:bg-edg-teal hover:bg-opacity-10">
                        View All Quotes
                      </Button>
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6">
                  <FileText className="h-12 w-12 text-edg-grey mx-auto mb-3 opacity-50" />
                  <p className="text-edg-grey text-sm">No quotes yet</p>
                  <Link href="/quote-builder">
                    <Button variant="outline" size="sm" className="mt-2">
                      Create Your First Quote
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-edg-teal" />
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link href="/quote-builder">
                <Button variant="outline" className="w-full justify-start">
                  Create New Quote
                </Button>
              </Link>
              <Link href="/products">
                <Button variant="outline" className="w-full justify-start">
                  Add Product
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}