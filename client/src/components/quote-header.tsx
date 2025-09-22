import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertQuoteSchema, insertCustomerSchema, type QuoteWithDetails, type Customer } from "@shared/schema";
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
  customerName: z.string().min(1, "Customer name is required"),
  customerEmail: z.string().email("Valid email is required"),
  customerPhone: z.string().min(1, "Phone number is required"),
  customerCompany: z.string().optional(),
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

  
  
  
  // Customer search state
  const [customerSearchTerm, setCustomerSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  
  
  // Debounce search term
  const debouncedSearch = useCallback(
    debounce((value: string) => {
      setDebouncedSearchTerm(value);
    }, 300),
    []
  );
  
  useEffect(() => {
    debouncedSearch(customerSearchTerm);
  }, [customerSearchTerm, debouncedSearch]);
  
  // Query for customer search using the accounts endpoint
  const { data: searchResults = [], isLoading: isSearching } = useQuery<Customer[]>({
    queryKey: ["/api/accounts/search", debouncedSearchTerm],
    queryFn: async ({ signal }): Promise<Customer[]> => {
      if (!debouncedSearchTerm || debouncedSearchTerm.length < 2) return [];
      
      try {
        const response = await fetch(`/api/accounts/search?q=${encodeURIComponent(debouncedSearchTerm)}`, {
          credentials: 'include',
          signal,
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error('Search failed:', response.status, errorData);
          if (response.status === 401) {
            throw new Error("Authentication required");
          }
          throw new Error(errorData.message || "Failed to search accounts");
        }
        
        const data = await response.json();
        console.log(`Search for "${debouncedSearchTerm}" returned ${data.length} results`);
        return data;
      } catch (error: any) {
        // Don't throw error for cancelled requests
        if (error.name === 'AbortError') {
          return [];
        }
        console.error('Search error:', error);
        throw error;
      }
    },
    enabled: debouncedSearchTerm.length >= 2,
    retry: false,
  });
  
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
      customerName: quote?.customer?.name || "",
      customerEmail: quote?.customer?.email || "",
      customerPhone: quote?.customer?.phone || "",
      customerCompany: quote?.customer?.company || "",
    },
  });

  // Handle customer selection from search
  const handleCustomerSelect = (customer: Customer) => {
    setSelectedCustomer(customer);
    form.setValue("customerName", customer.name);
    form.setValue("customerEmail", customer.email);
    form.setValue("customerPhone", customer.phone);
    form.setValue("customerCompany", customer.company || "");
    setCustomerSearchOpen(false);
    setShowDuplicateWarning(false);
    toast({
      title: "Customer Selected",
      description: `Selected existing customer: ${customer.name}`,
    });
  };
  
  // Check for duplicate when customer info changes
  const checkForDuplicates = useCallback(
    debounce(async (email: string, phone: string) => {
      if ((!email && !phone) || selectedCustomer) return;
      
      try {
        const searchTerm = email || phone;
        const response = await fetch(`/api/accounts/search?q=${encodeURIComponent(searchTerm)}`, {
          credentials: 'include',
        });
        const results = await response.json();
        
        if (results.length > 0) {
          setShowDuplicateWarning(true);
        } else {
          setShowDuplicateWarning(false);
        }
      } catch (error) {
        console.error('Error checking for duplicates:', error);
      }
    }, 500),
    [selectedCustomer]
  );
  
  // Watch for changes in email and phone to detect duplicates
  const watchedEmail = form.watch("customerEmail");
  const watchedPhone = form.watch("customerPhone");
  
  useEffect(() => {
    if (!selectedCustomer) {
      checkForDuplicates(watchedEmail, watchedPhone);
    }
  }, [watchedEmail, watchedPhone, checkForDuplicates, selectedCustomer]);
  
  // Initialize image states from database when quote loads
  useEffect(() => {
    if (quote) {
      // Set selected customer if editing existing quote
      if (quote.customer) {
        setSelectedCustomer(quote.customer);
      }
      
      
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
        customerName: quote.customer?.name || "",
        customerEmail: quote.customer?.email || "",
        customerPhone: quote.customer?.phone || "",
        customerCompany: quote.customer?.company || "",
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
                  <h3 className="text-lg font-semibold text-charcoal">Customer Information</h3>
                  {selectedCustomer && (
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      Existing Customer
                    </Badge>
                  )}
                </div>
                
                {/* Customer Search */}
                <div className="mb-4">
                  <FormLabel>Customer Search</FormLabel>
                  <Popover open={customerSearchOpen} onOpenChange={setCustomerSearchOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={customerSearchOpen}
                        className="w-full justify-between"
                        data-testid="customer-search-trigger"
                      >
                        <div className="flex items-center gap-2">
                          <Search className="h-4 w-4" />
                          <span className="text-left">
                            {selectedCustomer
                              ? `${selectedCustomer.name} (${selectedCustomer.email})`
                              : "Search for existing customer..."}
                          </span>
                        </div>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0" align="start">
                      <Command>
                        <CommandInput 
                          placeholder="Search by name, email, phone, or company..." 
                          value={customerSearchTerm}
                          onValueChange={setCustomerSearchTerm}
                          data-testid="customer-search-input"
                        />
                        <CommandList>
                          {isSearching ? (
                            <CommandEmpty>Searching...</CommandEmpty>
                          ) : searchResults.length === 0 && debouncedSearchTerm.length >= 2 ? (
                            <CommandEmpty>No customers found.</CommandEmpty>
                          ) : searchResults.length > 0 ? (
                            <CommandGroup heading="Existing Customers">
                              {searchResults.map((customer) => (
                                <CommandItem
                                  key={customer.id}
                                  onSelect={() => handleCustomerSelect(customer)}
                                  className="cursor-pointer"
                                  data-testid={`customer-option-${customer.id}`}
                                >
                                  <div className="flex flex-col gap-1">
                                    <div className="font-medium">{customer.name}</div>
                                    <div className="text-sm text-muted-foreground">
                                      {customer.email} • {customer.phone}
                                      {customer.company && ` • ${customer.company}`}
                                    </div>
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          ) : (
                            <CommandEmpty>Type at least 2 characters to search...</CommandEmpty>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  
                  {selectedCustomer && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-2"
                      onClick={() => {
                        setSelectedCustomer(null);
                        setShowDuplicateWarning(false);
                        form.setValue("customerName", "");
                        form.setValue("customerEmail", "");
                        form.setValue("customerPhone", "");
                        form.setValue("customerCompany", "");
                      }}
                      data-testid="clear-customer-selection"
                    >
                      Clear selection and create new customer
                    </Button>
                  )}
                </div>
                
                {/* Duplicate Warning */}
                {showDuplicateWarning && !selectedCustomer && (
                  <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                    <p className="text-sm text-yellow-800 dark:text-yellow-200">
                      <strong>Possible duplicate:</strong> A customer with similar details may already exist. 
                      Use the search above to find and select them, or continue to create a new customer.
                    </p>
                  </div>
                )}
                
                <div className="space-y-3">
                  <FormField
                    control={form.control}
                    name="customerName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Customer Name</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            disabled={!!selectedCustomer}
                            onChange={(e) => {
                              field.onChange(e);
                              if (selectedCustomer) setSelectedCustomer(null);
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="customerEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input 
                            type="email" 
                            {...field} 
                            disabled={!!selectedCustomer}
                            onChange={(e) => {
                              field.onChange(e);
                              if (selectedCustomer) setSelectedCustomer(null);
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="customerPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone</FormLabel>
                        <FormControl>
                          <Input 
                            type="tel" 
                            {...field} 
                            disabled={!!selectedCustomer}
                            onChange={(e) => {
                              field.onChange(e);
                              if (selectedCustomer) setSelectedCustomer(null);
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="customerCompany"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company (Optional)</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Company name" 
                            {...field} 
                            disabled={!!selectedCustomer}
                            onChange={(e) => {
                              field.onChange(e);
                              if (selectedCustomer) setSelectedCustomer(null);
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
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
