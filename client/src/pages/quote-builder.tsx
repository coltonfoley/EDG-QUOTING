import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppHeader } from "@/components/app-header";
import { QuoteHeader } from "@/components/quote-header";
import { LineItemsTable } from "@/components/line-items-table";
import { QuoteSummary } from "@/components/quote-summary";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { generateQuoteNumber } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import type { QuoteWithDetails } from "@shared/schema";

export default function QuoteBuilder() {
  const { id } = useParams();
  const isNewQuote = !id;
  const quoteId = id ? parseInt(id) : undefined;
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: quote, isLoading, error } = useQuery<QuoteWithDetails>({
    queryKey: [`/api/quotes/${quoteId}`],
    enabled: !isNewQuote,
  });

  const createQuoteMutation = useMutation({
    mutationFn: async (data: any) => {
      // First create or get customer
      const customerResponse = await apiRequest("POST", "/api/customers", {
        name: data.customerName,
        email: data.customerEmail,
        phone: data.customerPhone,
      });
      const customer = await customerResponse.json();

      // Then create quote
      const quoteData = {
        ...data,
        customerId: customer.id,
        quoteNumber: generateQuoteNumber(),
      };
      delete quoteData.customerName;
      delete quoteData.customerEmail;
      delete quoteData.customerPhone;

      const quoteResponse = await apiRequest("POST", "/api/quotes", quoteData);
      return quoteResponse.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      toast({ title: "Quote created successfully" });
      // Navigate to the new quote
      window.history.replaceState(null, "", `/quotes/${data.id}`);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create quote", variant: "destructive" });
    },
  });

  const updateQuoteMutation = useMutation({
    mutationFn: async (data: any) => {
      if (!quoteId) throw new Error("No quote ID");
      
      // Update customer first
      if (quote?.customer) {
        await apiRequest("PUT", `/api/customers/${quote.customer.id}`, {
          name: data.customerName,
          email: data.customerEmail,
          phone: data.customerPhone,
          company: data.customerCompany || null,
        });
      }

      // Update quote
      const quoteData = { ...data };
      delete quoteData.customerName;
      delete quoteData.customerEmail;
      delete quoteData.customerPhone;

      const response = await apiRequest("PUT", `/api/quotes/${quoteId}`, quoteData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/quotes/${quoteId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      toast({ title: "Quote updated successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update quote", variant: "destructive" });
    },
  });

  const handleSaveQuote = (data: any) => {
    if (isNewQuote) {
      createQuoteMutation.mutate(data);
    } else {
      updateQuoteMutation.mutate(data);
    }
  };

  const handleUpdateQuote = (field: string, value: any) => {
    if (!quote || !quoteId) return;
    
    updateQuoteMutation.mutate({
      ...quote,
      [field]: value,
      customerName: quote.customer.name,
      customerEmail: quote.customer.email,
      customerPhone: quote.customer.phone,
      customerCompany: quote.customer.company || "",
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="space-y-6">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-96 w-full" />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Skeleton className="lg:col-span-2 h-64" />
              <Skeleton className="h-64" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-red-600">Error loading quote</h2>
            <p className="text-accent-grey mt-2">Please try again later.</p>
          </div>
        </div>
      </div>
    );
  }

  const currentQuote = quote || {
    id: 0,
    quoteNumber: "",
    customerId: 0,
    projectName: "",
    projectAddress: "",
    estimatedStartDate: "",
    notes: "",
    taxRate: "8.5",
    discount: "0",
    status: "draft",
    createdAt: new Date(),
    customer: { id: 0, name: "", email: "", phone: "" },
    lineItems: [],
  } as QuoteWithDetails;

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <QuoteHeader
          quote={isNewQuote ? undefined : currentQuote}
          onSave={handleSaveQuote}
          isLoading={createQuoteMutation.isPending || updateQuoteMutation.isPending}
        />

        {currentQuote.id > 0 && (
          <>
            <LineItemsTable
              quoteId={currentQuote.id}
              lineItems={currentQuote.lineItems}
            />

            <QuoteSummary
              quote={currentQuote}
              onUpdateQuote={handleUpdateQuote}
            />
          </>
        )}
      </div>
    </div>
  );
}
