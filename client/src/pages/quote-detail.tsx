import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadingSpinner } from "@/components/loading-spinner";
import { 
  ArrowLeft, 
  Edit, 
  Download, 
  Mail, 
  Phone, 
  Building2,
  Calendar,
  DollarSign,
  FileText,
  User,
} from "lucide-react";
import { format } from "date-fns";
import type { QuoteWithDetails } from "@shared/schema";

export default function QuoteDetail() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const quoteId = id ? parseInt(id) : undefined;

  const { data: quote, isLoading, error } = useQuery<QuoteWithDetails>({
    queryKey: [`/api/quotes/${quoteId}`],
    enabled: !!quoteId,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <LoadingSpinner text="Loading quote details..." />
        </div>
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900">Quote not found</h2>
            <p className="mt-2 text-gray-600">The quote you're looking for doesn't exist.</p>
            <Button 
              onClick={() => setLocation("/quotes")}
              className="mt-4"
              data-testid="button-back-quotes"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Quotes
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const getDealStageLabel = (stage: string) => {
    const stages: Record<string, string> = {
      new_lead: "New Lead",
      qualified: "Qualified",
      proposal_sent: "Proposal Sent",
      negotiation: "Negotiation",
      closed_won: "Closed Won",
      closed_lost: "Closed Lost",
    };
    return stages[stage] || stage;
  };

  const getDealStageColor = (stage: string) => {
    const colors: Record<string, string> = {
      new_lead: "bg-gray-100 text-gray-800",
      qualified: "bg-blue-100 text-blue-800",
      proposal_sent: "bg-purple-100 text-purple-800",
      negotiation: "bg-yellow-100 text-yellow-800",
      closed_won: "bg-green-100 text-green-800",
      closed_lost: "bg-red-100 text-red-800",
    };
    return colors[stage] || "bg-gray-100 text-gray-800";
  };

  const formatCurrency = (amount: number | string) => {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(numAmount || 0);
  };

  // Calculate totals from line items
  const calculateSubtotal = () => {
    if (!quote?.lineItems) return 0;
    return quote.lineItems.reduce((sum, item) => {
      const quantity = parseFloat(item.quantity);
      const unitPrice = parseFloat(item.unitPrice);
      const markupValue = parseFloat(item.markupValue);
      const discountValue = parseFloat(item.discountValue);
      
      let itemTotal = quantity * unitPrice;
      
      // Apply markup
      if (item.markupType === 'percentage') {
        itemTotal = itemTotal * (1 + markupValue / 100);
      } else {
        itemTotal = itemTotal + markupValue;
      }
      
      // Apply discount
      if (item.discountType === 'percentage') {
        itemTotal = itemTotal * (1 - discountValue / 100);
      } else {
        itemTotal = itemTotal - discountValue;
      }
      
      return sum + itemTotal;
    }, 0);
  };

  const subtotal = calculateSubtotal();
  const discount = parseFloat(quote?.discount || '0');
  const taxRate = parseFloat(quote?.taxRate || '0');
  const shipping = parseFloat(quote?.shipping || '0');
  const taxAmount = (subtotal - discount) * (taxRate / 100);
  const total = subtotal - discount + taxAmount + shipping;

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              onClick={() => setLocation("/quotes")}
              data-testid="button-back"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900" data-testid={`text-quote-${quote.id}`}>
                {quote.projectName || `Quote ${quote.quoteNumber}`}
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Quote #{quote.quoteNumber}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge 
              className={getDealStageColor(quote.dealStage || 'new_lead')}
              data-testid={`badge-stage-${quote.id}`}
            >
              {getDealStageLabel(quote.dealStage || 'new_lead')}
            </Badge>
            <Button 
              onClick={() => setLocation(`/quotes/${quote.id}/edit`)}
              data-testid="button-edit-quote"
            >
              <Edit className="mr-2 h-4 w-4" />
              Edit Quote
            </Button>
            <Button variant="outline" data-testid="button-download-pdf">
              <Download className="mr-2 h-4 w-4" />
              Download PDF
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Customer Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Customer Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Name</p>
                    <p className="font-medium" data-testid={`text-customer-name-${quote.id}`}>
                      {quote.customer?.name || 'N/A'}
                    </p>
                  </div>
                  {quote.customer?.company && (
                    <div>
                      <p className="text-sm text-gray-600">Company</p>
                      <p className="font-medium flex items-center gap-1" data-testid={`text-company-${quote.id}`}>
                        <Building2 className="h-4 w-4" />
                        {quote.customer.company}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-gray-600">Email</p>
                    <p className="font-medium flex items-center gap-1" data-testid={`text-email-${quote.id}`}>
                      <Mail className="h-4 w-4" />
                      {quote.customer?.email || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Phone</p>
                    <p className="font-medium flex items-center gap-1" data-testid={`text-phone-${quote.id}`}>
                      <Phone className="h-4 w-4" />
                      {quote.customer?.phone || 'N/A'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Line Items */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Line Items
                </CardTitle>
              </CardHeader>
              <CardContent>
                {quote.lineItems && quote.lineItems.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-4">Description</th>
                          <th className="text-right py-2 px-4">Qty</th>
                          <th className="text-right py-2 px-4">Unit Price</th>
                          <th className="text-right py-2 px-4">Markup</th>
                          <th className="text-right py-2 px-4">Discount</th>
                          <th className="text-right py-2 px-4">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {quote.lineItems.map((item, index) => {
                          const quantity = parseFloat(item.quantity);
                          const unitPrice = parseFloat(item.unitPrice);
                          const markupValue = parseFloat(item.markupValue);
                          const discountValue = parseFloat(item.discountValue);
                          
                          let itemTotal = quantity * unitPrice;
                          
                          // Apply markup
                          if (item.markupType === 'percentage') {
                            itemTotal = itemTotal * (1 + markupValue / 100);
                          } else {
                            itemTotal = itemTotal + markupValue;
                          }
                          
                          // Apply discount
                          if (item.discountType === 'percentage') {
                            itemTotal = itemTotal * (1 - discountValue / 100);
                          } else {
                            itemTotal = itemTotal - discountValue;
                          }
                          
                          return (
                            <tr key={item.id || index} className="border-b" data-testid={`row-item-${item.id || index}`}>
                              <td className="py-2 px-4">{item.description}</td>
                              <td className="text-right py-2 px-4">{quantity}</td>
                              <td className="text-right py-2 px-4">{formatCurrency(unitPrice)}</td>
                              <td className="text-right py-2 px-4">
                                {item.markupType === 'percentage' ? `${markupValue}%` : formatCurrency(markupValue)}
                              </td>
                              <td className="text-right py-2 px-4">
                                {discountValue > 0 ? (
                                  item.discountType === 'percentage' ? `-${discountValue}%` : `-${formatCurrency(discountValue)}`
                                ) : '-'}
                              </td>
                              <td className="text-right py-2 px-4 font-medium">
                                {formatCurrency(itemTotal)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-gray-500">No line items added</p>
                )}
              </CardContent>
            </Card>

            {/* Notes */}
            {quote.notes && (
              <Card>
                <CardHeader>
                  <CardTitle>Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap text-sm" data-testid={`text-notes-${quote.id}`}>
                    {quote.notes}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quote Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Quote Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-sm text-gray-600">Subtotal</p>
                  <p className="text-xl font-bold" data-testid={`text-subtotal-${quote.id}`}>
                    {formatCurrency(subtotal)}
                  </p>
                </div>
                {discount > 0 && (
                  <div>
                    <p className="text-sm text-gray-600">Discount</p>
                    <p className="text-lg font-medium text-red-600">
                      -{formatCurrency(discount)}
                    </p>
                  </div>
                )}
                {taxAmount > 0 && (
                  <div>
                    <p className="text-sm text-gray-600">Tax ({taxRate}%)</p>
                    <p className="text-lg font-medium">
                      {formatCurrency(taxAmount)}
                    </p>
                  </div>
                )}
                {shipping > 0 && (
                  <div>
                    <p className="text-sm text-gray-600">Shipping</p>
                    <p className="text-lg font-medium">
                      {formatCurrency(shipping)}
                    </p>
                  </div>
                )}
                <div className="border-t pt-3">
                  <p className="text-sm text-gray-600">Total</p>
                  <p className="text-2xl font-bold text-green-600" data-testid={`text-total-${quote.id}`}>
                    {formatCurrency(total)}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Quote Details */}
            <Card>
              <CardHeader>
                <CardTitle>Quote Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-sm text-gray-600">Created</p>
                  <p className="font-medium">
                    {quote.createdAt ? format(new Date(quote.createdAt), 'PPP') : 'N/A'}
                  </p>
                </div>
                {quote.updatedAt && (
                  <div>
                    <p className="text-sm text-gray-600">Last Updated</p>
                    <p className="font-medium">
                      {format(new Date(quote.updatedAt), 'PPP')}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}