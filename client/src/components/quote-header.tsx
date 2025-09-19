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
import { ImageUploader, type UploadedImage } from "@/components/image-uploader";
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
  onUploadStatesChange?: (states: {
    portfolioImages: UploadedImage[];
    technicalDiagrams: UploadedImage[];
    companyImages: UploadedImage[];
  }) => void;
}

export function QuoteHeader({ quote, onSave, isLoading, onUploadStatesChange }: QuoteHeaderProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State for managing image uploads
  const [portfolioImages, setPortfolioImages] = useState<UploadedImage[]>([]);
  const [technicalDiagrams, setTechnicalDiagrams] = useState<UploadedImage[]>([]);
  const [companyImages, setCompanyImages] = useState<UploadedImage[]>([]);
  
  // Track upload completion and auto-save
  const [pendingSave, setPendingSave] = useState(false);
  
  // State for collapsible image assets section
  const [isImageAssetsOpen, setIsImageAssetsOpen] = useState(false);
  
  // Customer search state
  const [customerSearchTerm, setCustomerSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  
  // Calculate if any uploads are still in progress
  const isUploading = [...portfolioImages, ...technicalDiagrams, ...companyImages]
    .some(img => !img.uploaded);
  const uploadingCount = [...portfolioImages, ...technicalDiagrams, ...companyImages]
    .filter(img => !img.uploaded).length;
  
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
      
      // Convert database image arrays to UploadedImage format
      const convertDbImagesToUploaded = (dbImages: any[] = []): UploadedImage[] => {
        return dbImages.map((img, index) => ({
          id: `db-${Date.now()}-${index}`,
          file: new File([], img.filename || 'image'),
          preview: img.url,
          uploadProgress: 100,
          uploaded: true,
          url: img.url,
          metadata: {
            filename: img.filename || '',
            caption: img.caption || '',
            altText: img.altText || '',
            uploadedAt: img.uploadedAt || new Date().toISOString(),
            size: img.size,
            thumbnailUrl: img.thumbnailUrl,
            url: img.url,
            ...img
          }
        }));
      };
      
      // Project images removed with projects module
      setPortfolioImages(convertDbImagesToUploaded((quote.portfolioImages as any[]) || []));
      setTechnicalDiagrams(convertDbImagesToUploaded((quote.technicalDiagrams as any[]) || []));
      setCompanyImages(convertDbImagesToUploaded((quote.companyImages as any[]) || []));
      
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
  
  // Auto-save after all uploads complete
  useEffect(() => {
    if (pendingSave && !isUploading) {
      console.log('🎯 Auto-saving after all uploads completed');
      setPendingSave(false);
      // Trigger form submission with current form data
      form.handleSubmit(handleSubmit)();
    }
  }, [pendingSave, isUploading, form]);

  // Notify parent component of upload state changes
  useEffect(() => {
    if (onUploadStatesChange) {
      onUploadStatesChange({
        portfolioImages,
        technicalDiagrams,
        companyImages,
      });
    }
  }, [portfolioImages, technicalDiagrams, companyImages, onUploadStatesChange]);

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
    // If images are still uploading, set pending save and return
    if (isUploading) {
      setPendingSave(true);
      toast({
        title: "Upload in progress",
        description: `Waiting for ${uploadingCount} images to finish uploading...`,
      });
      return;
    }
    
    // Convert uploaded images to the expected format for the database
    const imageData = {
      ...data,
      // Project images removed with projects module
      portfolioImages: portfolioImages.filter(img => img.uploaded).map(img => ({
        url: img.url || '',
        filename: img.metadata.filename || '',
        caption: img.metadata.caption || '',
        altText: img.metadata.altText || '',
        uploadedAt: img.metadata.uploadedAt || new Date().toISOString(),
        size: img.metadata.size,
        thumbnailUrl: img.metadata.thumbnailUrl,
        projectType: (img.metadata as any).projectType,
        featured: (img.metadata as any).featured || false,
      })),
      technicalDiagrams: technicalDiagrams.filter(img => img.uploaded).map(img => ({
        url: img.url || '',
        filename: img.metadata.filename || '',
        caption: img.metadata.caption || '',
        altText: img.metadata.altText || '',
        uploadedAt: img.metadata.uploadedAt || new Date().toISOString(),
        size: img.metadata.size,
        thumbnailUrl: img.metadata.thumbnailUrl,
        diagramType: (img.metadata as any).diagramType || 'other',
      })),
      companyImages: companyImages.filter(img => img.uploaded).map(img => ({
        url: img.url || '',
        filename: img.metadata.filename || '',
        caption: img.metadata.caption || '',
        altText: img.metadata.altText || '',
        uploadedAt: img.metadata.uploadedAt || new Date().toISOString(),
        size: img.metadata.size,
        thumbnailUrl: img.metadata.thumbnailUrl,
        imageType: (img.metadata as any).imageType || 'other',
      })),
    };
    
    onSave(imageData);
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
              disabled={isLoading || isUploading}
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
              {isLoading ? "Saving..." : isUploading ? `Uploading ${uploadingCount} images...` : "Save Quote"}
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
            
            {/* Image Assets Section - Collapsible */}
            <Collapsible open={isImageAssetsOpen} onOpenChange={setIsImageAssetsOpen} className="mt-6 pt-6 border-t border-gray-200">
              <CollapsibleTrigger asChild>
                <Button 
                  variant="ghost" 
                  className="w-full justify-between p-0 h-auto hover:bg-transparent mb-4"
                  data-testid="toggle-image-assets"
                >
                  <div className="flex items-center gap-2">
                    <Camera className="h-5 w-5" />
                    <h3 className="text-lg font-semibold text-charcoal">
                      Image Assets
                    </h3>
                    <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                      <span>({portfolioImages.filter(img => img.uploaded).length + technicalDiagrams.filter(img => img.uploaded).length + companyImages.filter(img => img.uploaded).length} uploaded)</span>
                    </div>
                  </div>
                  {isImageAssetsOpen ? (
                    <ChevronUp className="h-5 w-5" />
                  ) : (
                    <ChevronDown className="h-5 w-5" />
                  )}
                </Button>
              </CollapsibleTrigger>
              
              <div className="mb-4">
                <p className="text-sm text-accent-grey">
                  Upload and manage images to enhance your proposals. Images will be stored securely and included in generated documents.
                </p>
              </div>

              <CollapsibleContent className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Project Images */}
                  <div className="space-y-4">
                    {/* Project photos removed with projects module */}

                    <ImageUploader
                      imageType="technical"
                      title="Technical Diagrams"
                      description="Blueprints, plans, and technical specifications"
                      maxFiles={10}
                      allowedTypes={['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']}
                      onImagesChange={setTechnicalDiagrams}
                      initialImages={technicalDiagrams}
                      categoryOptions={[
                        { value: 'floorplan', label: 'Floor Plans' },
                        { value: 'elevation', label: 'Elevations' },
                        { value: 'detail', label: 'Detail Drawings' },
                        { value: 'specification', label: 'Specifications' },
                        { value: 'other', label: 'Other' }
                      ]}
                      data-testid="uploader-technical-diagrams"
                    />
                  </div>

                  <div className="space-y-4">
                    <ImageUploader
                      imageType="portfolio"
                      title="Portfolio Showcase"
                      description="Similar projects and portfolio examples to showcase expertise"
                      maxFiles={12}
                      onImagesChange={setPortfolioImages}
                      initialImages={portfolioImages}
                      categoryOptions={[
                        { value: 'residential', label: 'Residential Projects' },
                        { value: 'commercial', label: 'Commercial Projects' },
                        { value: 'industrial', label: 'Industrial Projects' },
                        { value: 'other', label: 'Other Projects' }
                      ]}
                      data-testid="uploader-portfolio-images"
                    />

                    <ImageUploader
                      imageType="company"
                      title="Company Assets"
                      description="Company logos, team photos, certifications, and facility images"
                      maxFiles={8}
                      onImagesChange={setCompanyImages}
                      initialImages={companyImages}
                      categoryOptions={[
                        { value: 'logo', label: 'Company Logo' },
                        { value: 'team', label: 'Team Photos' },
                        { value: 'facility', label: 'Facility Images' },
                        { value: 'certification', label: 'Certifications' },
                        { value: 'other', label: 'Other Assets' }
                      ]}
                      data-testid="uploader-company-images"
                    />
                  </div>
                </div>

                {/* Image Summary */}
                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <h4 className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-2">Image Summary</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600 dark:text-gray-400">
                    <div className="flex items-center gap-2">
                      <Camera className="h-4 w-4" />
                      <span>Project: N/A</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Image className="h-4 w-4" />
                      <span>Portfolio: {portfolioImages.filter(img => img.uploaded).length}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Wrench className="h-4 w-4" />
                      <span>Technical: {technicalDiagrams.filter(img => img.uploaded).length}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Building className="h-4 w-4" />
                      <span>Company: {companyImages.filter(img => img.uploaded).length}</span>
                    </div>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
