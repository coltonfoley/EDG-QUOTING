import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import ScreenForm from "../components/ScreenForm";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AppHeader } from "@/components/app-header";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ScreenConfigurator() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get quoteId from URL query params if present
  const urlParams = new URLSearchParams(window.location.search);
  const quoteId = urlParams.get('quoteId');

  const createLineItemMutation = useMutation({
    mutationFn: async (data: any) => {
      if (!quoteId) {
        throw new Error("No quote ID provided");
      }
      const response = await apiRequest("POST", `/api/quotes/${quoteId}/line-items`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/quotes/${quoteId}`] });
      toast({ 
        title: "Screen added to quote", 
        description: "The configured screen has been added successfully" 
      });
      // Navigate back to the quote builder
      setLocation(`/quotes/${quoteId}/edit`);
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to add screen to quote", 
        variant: "destructive" 
      });
    },
  });

  const handleAddItem = (item: any) => {
    if (quoteId) {
      // If we have a quoteId, add the item to the quote
      createLineItemMutation.mutate(item);
    } else {
      // If no quoteId, just log it (for testing/development)
      console.log("ADD-LINE-ITEM →", item);
      toast({
        title: "Screen configured",
        description: "Check console for line item details. Integrate with quote by adding ?quoteId=X to URL"
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <AppHeader />
      <div className="mx-auto max-w-5xl p-6">
        {quoteId && (
          <Button
            variant="ghost"
            onClick={() => setLocation(`/quotes/${quoteId}/edit`)}
            className="mb-4"
            data-testid="button-back-to-quote"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Quote
          </Button>
        )}
        <h1 className="text-2xl font-bold mb-2 text-gray-900 dark:text-gray-100">Screen Configurator</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Configure a motorized screen and add it directly to your quote.
        </p>
        <ScreenForm onAdd={handleAddItem} />
      </div>
    </div>
  );
}
