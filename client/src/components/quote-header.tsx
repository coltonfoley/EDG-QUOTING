import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertQuoteSchema, type QuoteWithDetails } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Clock, Camera, Image, Wrench, Building, ChevronDown, ChevronUp, Search, Users } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { z } from "zod";
import { useEffect, useState, useCallback, useRef } from "react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { debounce } from "lodash";
import { DEAL_STAGES } from "@shared/dealStageConstants";

const quoteFormSchema = insertQuoteSchema.extend({
  quoteNumber: z.string().optional(), // Auto-generated on server
  contactId: z.number().optional(),
  dealStage: z.string().default("new_lead"),
}).omit({ accountId: true, customerId: true });

type QuoteFormData = z.infer<typeof quoteFormSchema>;

interface QuoteHeaderProps {
  quote?: QuoteWithDetails;
  onSave: (data: QuoteFormData) => void;
  isLoading?: boolean;
}

export function QuoteHeader({ quote, onSave, isLoading }: QuoteHeaderProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  
  
  
  
  
  
  
  const form = useForm<QuoteFormData>({
    resolver: zodResolver(quoteFormSchema),
    defaultValues: {
      quoteNumber: quote?.quoteNumber || "",
      projectName: quote?.projectName || "",
      projectAddress: quote?.projectAddress || "",
      estimatedStartDate: quote?.estimatedStartDate || "",
      notes: quote?.notes || "",
      dealStage: quote?.dealStage || "new_lead",
      taxRate: quote?.taxRate || "0",
      discount: quote?.discount || "0",
      shipping: quote?.shipping || "0",
      contactId: undefined,
    },
  });

  
  
  
  useEffect(() => {
    if (quote) {
      form.reset({
        quoteNumber: quote.quoteNumber || "",
        projectName: quote.projectName || "",
        projectAddress: quote.projectAddress || "",
        estimatedStartDate: quote.estimatedStartDate || "",
        notes: quote.notes || "",
        dealStage: quote.dealStage || "new_lead",
        taxRate: quote.taxRate || "0",
        discount: quote.discount || "0",
        shipping: quote.shipping || "0",
        contactId: undefined,
      });
    }
  }, [quote, form]);
  

  const updateDealStageMutation = useMutation({
    mutationFn: async ({ dealStage }: { dealStage: string }) => {
      if (!quote?.id) throw new Error("No quote ID");
      const response = await apiRequest('PUT', `/api/quotes/${quote.id}`, { dealStage });
      return response.json();
    },
    onSuccess: (updatedQuote, variables) => {
      // Update form state to match the new dealStage
      form.setValue("dealStage", variables.dealStage);
      toast({ title: "Quote updated successfully" });
      queryClient.invalidateQueries({ queryKey: [`/api/quotes/${quote?.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Error", 
        description: "Failed to update quote", 
        variant: "destructive" 
      });
    },
  });
  
  // Handle deal stage change
  const handleDealStageChange = (newDealStage: string) => {
    form.setValue("dealStage", newDealStage);
    
    // If editing an existing quote, update immediately
    if (quote?.id) {
      updateDealStageMutation.mutate({ dealStage: newDealStage });
    }
  };


  const handleSubmit = (data: QuoteFormData) => {
    onSave(data);
  };

  return (
    <Card className="mb-6">
      <CardHeader className="border-b border-gray-200">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="text-2xl font-bold text-charcoal">
              {quote ? `Quote ${quote.quoteNumber}` : "New Quote"}
            </CardTitle>
            {quote?.createdAt && (
              <p className="text-sm text-accent-grey mt-1">
                Created on {new Date(quote.createdAt).toLocaleDateString()}
              </p>
            )}
          </div>
          <div className="mt-4 lg:mt-0 flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3">
            {quote && (
              <>
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium text-gray-700">Pipeline Stage:</span>
                  <Select
                    value={form.watch("dealStage")}
                    onValueChange={handleDealStageChange}
                    disabled={updateDealStageMutation.isPending}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DEAL_STAGES.map((stage) => (
                        <SelectItem key={stage.id} value={stage.id}>
                          {stage.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <Button 
              type="submit" 
              form="quote-form" 
              className="bg-edg-black hover:bg-edg-grey text-edg-white"
              disabled={isLoading}
              onClick={() => {
                // Check for validation errors and show them
                const errors = form.formState.errors;
                if (Object.keys(errors).length > 0) {
                  const errorMessages = Object.entries(errors)
                    .map(([field, error]) => `${field}: ${error?.message}`)
                    .join(', ');
                  toast({
                    title: "Form Validation Error",
                    description: `Please fix the following: ${errorMessages}`,
                    variant: "destructive",
                  });
                }
              }}
            >
              <Save className="mr-2 h-4 w-4" />
              {isLoading ? "Saving..." : "Save Quote"}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6">
        <Form {...form}>
          <form id="quote-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold text-charcoal">Contact Information</h3>
                  <span className="text-sm text-gray-500">(Optional)</span>
                </div>
                
                <div className="text-sm text-gray-600 mb-4">
                  Contact can be linked later if needed. Focus on getting the quote created quickly.
                </div>
                
                <div className="space-y-3">
                  <FormField
                    control={form.control}
                    name="contactId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact (Optional)</FormLabel>
                        <FormControl>
                          <Select
                            value={field.value?.toString() || ""}
                            onValueChange={(value) => field.onChange(value ? parseInt(value) : undefined)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select a contact or leave blank" />
                            </SelectTrigger>
                            <SelectContent>
                              {/* Contact options will be populated here later */}
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-md">
                    <strong>Tip:</strong> You can create quotes quickly without selecting a contact. 
                    Contacts can be linked later when managing client relationships.
                  </div>
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold text-charcoal mb-3">Project Details</h3>
                <div className="space-y-3">
                  <FormField
                    control={form.control}
                    name="quoteNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Quote Number</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            readOnly 
                            placeholder="Auto-generated on save"
                            className="bg-gray-50"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="projectName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Project Name (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter project name" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="projectAddress"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Project Address (Optional)</FormLabel>
                        <FormControl>
                          <Textarea rows={2} placeholder="Enter project address" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="estimatedStartDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Estimated Start Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Additional Notes (Optional)</FormLabel>
                        <FormControl>
                          <Textarea rows={3} placeholder="Any additional notes or requirements" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </div>
            
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
