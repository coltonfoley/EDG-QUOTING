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
import { ClientComboboxWithCreate } from "@/components/client-combobox-with-create";
import { AddressAutocomplete } from "@/components/address-autocomplete";

// Form schema extends the insert schema with new structured address fields
const quoteFormSchema = insertQuoteSchema.extend({
  quoteNumber: z.string().optional(), // Override for form
  accountId: z.number().nullable().optional(),
  dealStage: z.string().default("new_lead"),
  // Add new structured project address fields
  projectStreetAddress: z.string().optional(),
  projectAddressLine2: z.string().optional(),
  projectCity: z.string().optional(),
  projectState: z.string().optional(),
  projectZipCode: z.string().optional(),
  projectCountry: z.string().optional(),
  projectPlaceId: z.string().optional(),
  // Add new structured jobsite address fields
  jobsiteStreetAddress: z.string().optional(),
  jobsiteAddressLine2: z.string().optional(),
  jobsiteCity: z.string().optional(),
  jobsiteState: z.string().optional(),
  jobsiteZipCode: z.string().optional(),
  jobsiteCountry: z.string().optional(),
  jobsitePlaceId: z.string().optional(),
});

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
      projectStreetAddress: quote?.projectStreetAddress || "",
      projectAddressLine2: quote?.projectAddressLine2 || "",
      projectCity: quote?.projectCity || "",
      projectState: quote?.projectState || "",
      projectZipCode: quote?.projectZipCode || "",
      projectCountry: quote?.projectCountry || "",
      projectPlaceId: quote?.projectPlaceId || "",
      jobsiteStreetAddress: quote?.jobsiteStreetAddress || "",
      jobsiteAddressLine2: quote?.jobsiteAddressLine2 || "",
      jobsiteCity: quote?.jobsiteCity || "",
      jobsiteState: quote?.jobsiteState || "",
      jobsiteZipCode: quote?.jobsiteZipCode || "",
      jobsiteCountry: quote?.jobsiteCountry || "",
      jobsitePlaceId: quote?.jobsitePlaceId || "",
      estimatedStartDate: quote?.estimatedStartDate || "",
      dealStage: quote?.dealStage || "new_lead",
      taxRate: quote?.taxRate || "0",
      tariffRate: quote?.tariffRate || "0",
      discount: quote?.discount || "0",
      shipping: quote?.shipping || "0",
      accountId: quote?.accountId ?? null,
    },
  });

  
  
  
  useEffect(() => {
    if (quote) {
      form.reset({
        quoteNumber: quote.quoteNumber || "",
        projectName: quote.projectName || "",
        projectStreetAddress: quote.projectStreetAddress || "",
        projectAddressLine2: quote.projectAddressLine2 || "",
        projectCity: quote.projectCity || "",
        projectState: quote.projectState || "",
        projectZipCode: quote.projectZipCode || "",
        projectCountry: quote.projectCountry || "",
        projectPlaceId: quote.projectPlaceId || "",
        jobsiteStreetAddress: quote.jobsiteStreetAddress || "",
        jobsiteAddressLine2: quote.jobsiteAddressLine2 || "",
        jobsiteCity: quote.jobsiteCity || "",
        jobsiteState: quote.jobsiteState || "",
        jobsiteZipCode: quote.jobsiteZipCode || "",
        jobsiteCountry: quote.jobsiteCountry || "",
        jobsitePlaceId: quote.jobsitePlaceId || "",
        estimatedStartDate: quote.estimatedStartDate || "",
        dealStage: quote.dealStage || "new_lead",
        taxRate: quote.taxRate || "0",
        tariffRate: quote.tariffRate || "0",
        discount: quote.discount || "0",
        shipping: quote.shipping || "0",
        accountId: quote.accountId ?? null,
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
      
      // Update the specific quote cache
      queryClient.setQueryData([`/api/quotes/${quote?.id}`], (oldData: any) => {
        if (!oldData) return oldData;
        return { ...oldData, ...updatedQuote };
      });
      
      // Also update the quotes list cache to keep list views in sync
      queryClient.setQueryData(["/api/quotes"], (oldData: any) => {
        if (!oldData) return oldData;
        return oldData.map((q: any) => 
          q.id === quote?.id ? { ...q, ...updatedQuote } : q
        );
      });
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


  const handleProjectAddressSelect = (components: {
    streetAddress: string;
    addressLine2: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
    placeId: string;
  }) => {
    form.setValue("projectStreetAddress", components.streetAddress);
    form.setValue("projectAddressLine2", components.addressLine2 || "");
    form.setValue("projectCity", components.city);
    form.setValue("projectState", components.state);
    form.setValue("projectZipCode", components.zipCode);
    form.setValue("projectCountry", components.country);
    form.setValue("projectPlaceId", components.placeId);
  };

  const handleJobsiteAddressSelect = (components: {
    streetAddress: string;
    addressLine2: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
    placeId: string;
  }) => {
    form.setValue("jobsiteStreetAddress", components.streetAddress);
    form.setValue("jobsiteAddressLine2", components.addressLine2 || "");
    form.setValue("jobsiteCity", components.city);
    form.setValue("jobsiteState", components.state);
    form.setValue("jobsiteZipCode", components.zipCode);
    form.setValue("jobsiteCountry", components.country);
    form.setValue("jobsitePlaceId", components.placeId);
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
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-charcoal">Client Information</h3>
                <span className="text-sm text-gray-500">(Optional)</span>
              </div>
              
              <div className="text-sm text-gray-600 mb-4">
                Client can be linked later if needed. Focus on getting the quote created quickly.
              </div>
              
              <div className="space-y-3">
                <FormField
                  control={form.control}
                  name="accountId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Client (Optional)</FormLabel>
                      <FormControl>
                        <ClientComboboxWithCreate
                          value={field.value}
                          onValueChange={field.onChange}
                          placeholder="Search clients or create new..."
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-md">
                  <strong>Tip:</strong> You can create quotes quickly without selecting a client. 
                  Clients can be linked later when managing relationships.
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
                        <FormLabel>
                          Project Name <span className="text-red-500">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input placeholder="Enter project name (required)" {...field} value={field.value || ""} data-testid="input-project-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium leading-none">
                        Search for Project Address
                      </label>
                      <AddressAutocomplete
                        onAddressSelect={handleProjectAddressSelect}
                        placeholder="Start typing project address..."
                        testId="input-project-address-autocomplete"
                      />
                      <p className="text-xs text-gray-500 mt-1">Or enter address details manually below</p>
                    </div>

                    <FormField
                      control={form.control}
                      name="projectStreetAddress"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Street Address</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="123 Main Street" 
                              {...field} 
                              value={field.value || ""}
                              data-testid="input-project-street-address"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="projectAddressLine2"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Apt, Suite, etc. (optional)</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Apt 4B" 
                                {...field} 
                                value={field.value || ""}
                                data-testid="input-project-address-line2"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="projectCity"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>City</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="City" 
                                {...field} 
                                value={field.value || ""}
                                data-testid="input-project-city"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="projectState"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>State</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="State" 
                                {...field} 
                                value={field.value || ""}
                                data-testid="input-project-state"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="projectZipCode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>ZIP Code</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="ZIP" 
                                {...field} 
                                value={field.value || ""}
                                data-testid="input-project-zip"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="projectCountry"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Country</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Country" 
                                {...field} 
                                value={field.value || ""}
                                data-testid="input-project-country"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <div className="space-y-3 border-t pt-4 mt-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-charcoal">Jobsite Address (if different)</h4>
                      <span className="text-xs text-gray-500">Optional</span>
                    </div>
                    <div>
                      <label className="text-sm font-medium leading-none">
                        Search for Jobsite Address
                      </label>
                      <AddressAutocomplete
                        onAddressSelect={handleJobsiteAddressSelect}
                        placeholder="Start typing jobsite address..."
                        testId="input-jobsite-address-autocomplete"
                      />
                      <p className="text-xs text-gray-500 mt-1">Or enter address details manually below</p>
                    </div>

                    <FormField
                      control={form.control}
                      name="jobsiteStreetAddress"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Street Address</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="123 Main Street" 
                              {...field} 
                              value={field.value || ""}
                              data-testid="input-jobsite-street-address"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="jobsiteAddressLine2"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Apt, Suite, etc. (optional)</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Apt 4B" 
                                {...field} 
                                value={field.value || ""}
                                data-testid="input-jobsite-address-line2"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="jobsiteCity"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>City</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="City" 
                                {...field} 
                                value={field.value || ""}
                                data-testid="input-jobsite-city"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="jobsiteState"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>State</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="State" 
                                {...field} 
                                value={field.value || ""}
                                data-testid="input-jobsite-state"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="jobsiteZipCode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>ZIP Code</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="ZIP" 
                                {...field} 
                                value={field.value || ""}
                                data-testid="input-jobsite-zip"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="jobsiteCountry"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Country</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Country" 
                                {...field} 
                                value={field.value || ""}
                                data-testid="input-jobsite-country"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

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
                </div>
              </div>
            
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
