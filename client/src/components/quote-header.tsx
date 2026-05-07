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
import { Save, Clock, Camera, Image, Wrench, Building, ChevronDown, ChevronUp, Search, Users, Send, ExternalLink } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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

type OperationsImportResponse = {
  success?: boolean;
  skipped?: boolean;
  message?: string;
  opsJobUrl?: string | null;
  data?: {
    existing?: boolean;
    imported?: boolean;
    job?: {
      id?: string | number;
      title?: string | null;
      projectCode?: string | null;
      jobNumber?: string | null;
    } | null;
    oemImportPacket?: {
      importMode?: string;
      summary?: {
        oemLineCount?: number;
        oemGroupCount?: number;
        manualReviewLineCount?: number;
        sundanceLineCount?: number;
      };
    };
  };
};

const getOpsJobLabel = (result?: OperationsImportResponse | null): string | null => {
  const job = result?.data?.job;
  if (!job) return null;
  return job.projectCode || job.jobNumber || job.title || (job.id ? `job ${job.id}` : null);
};

interface QuoteHeaderProps {
  quote?: QuoteWithDetails;
  onSave: (data: QuoteFormData) => void;
  isLoading?: boolean;
}

export function QuoteHeader({ quote, onSave, isLoading }: QuoteHeaderProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingChanges = useRef<Record<string, any>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [opsImportResult, setOpsImportResult] = useState<OperationsImportResponse | null>(null);

  const form = useForm<QuoteFormData>({
    resolver: zodResolver(quoteFormSchema),
    defaultValues: {
      quoteNumber: quote?.quoteNumber || "",
      projectName: quote?.projectName || "",
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
  }, [quote?.id, form]);
  

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

  const sendToOpsMutation = useMutation({
    mutationFn: async () => {
      if (!quote?.id) throw new Error("No quote ID");
      flushPendingChanges();
      const response = await apiRequest("POST", `/api/quotes/${quote.id}/send-to-ops`, {});
      return response.json() as Promise<OperationsImportResponse>;
    },
    onSuccess: (result) => {
      setOpsImportResult(result);
      const jobLabel = getOpsJobLabel(result);
      const packet = result.data?.oemImportPacket;
      const summary = packet?.summary;
      const mode = packet?.importMode === "oem_ready" ? "OEM-ready" : packet?.importMode ? packet.importMode.replace(/_/g, " ") : "ready";
      const oemGroupCount = summary?.oemGroupCount;

      toast({
        title: result.data?.existing ? "Quote already in Ops" : "Quote sent to Ops",
        description: result.data?.existing
          ? jobLabel
            ? `${jobLabel} is already in Ops. Open the Ops job to review the import packet and procurement next steps.`
            : "This quote is already in Ops. Open Ops to review the import packet and procurement next steps."
          : jobLabel
            ? `${jobLabel} is ${mode}. ${typeof oemGroupCount === "number" ? `${oemGroupCount} OEM group${oemGroupCount === 1 ? "" : "s"} ready for procurement review.` : "Open the Ops job to review procurement next steps."}`
            : "Ops received the quote and built the import packet.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Could not send to Ops",
        description: error?.message || "Ops import is unavailable right now.",
        variant: "destructive",
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

  // General autosave mutation for project details and client info
  const autosaveMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      if (!quote?.id) throw new Error("No quote ID");
      const response = await apiRequest('PUT', `/api/quotes/${quote.id}`, data);
      return response.json();
    },
    onSuccess: () => {
      // Invalidate caches to ensure fresh data
      queryClient.invalidateQueries({ queryKey: [`/api/quotes/${quote?.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      setIsSaving(false);
    },
    onError: (error: Error) => {
      toast({ 
        title: "Error", 
        description: "Failed to save changes", 
        variant: "destructive" 
      });
      setIsSaving(false);
    },
  });

  // Flush all pending changes immediately
  const flushPendingChanges = useCallback(() => {
    if (!quote?.id) return;
    
    // Clear the timer if it exists
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    
    // Only mutate if there are actual changes
    const changes = { ...pendingChanges.current };
    if (Object.keys(changes).length > 0) {
      pendingChanges.current = {};
      setIsSaving(true);
      autosaveMutation.mutate(changes);
    }
  }, [quote?.id, autosaveMutation]);

  // Debounced autosave function - uses single timer for all fields
  const performAutosave = useCallback((field: keyof QuoteFormData, value: any) => {
    if (!quote?.id) return;
    
    // Store the pending change
    pendingChanges.current[field] = value;
    
    // Clear existing timer
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    
    // Set new debounced timer (500ms delay)
    debounceTimer.current = setTimeout(() => {
      flushPendingChanges();
    }, 500);
  }, [quote?.id, flushPendingChanges]);

  // Handle field blur - flush all pending changes immediately
  const handleFieldBlur = useCallback(() => {
    if (!quote?.id) return;
    flushPendingChanges();
  }, [quote?.id, flushPendingChanges]);

  // Handle field change with autosave
  const handleFieldChange = useCallback((
    field: keyof QuoteFormData, 
    value: any, 
    originalOnChange: (value: any) => void
  ) => {
    originalOnChange(value);
    performAutosave(field, value);
  }, [performAutosave]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

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
    
    // Autosave all address fields immediately when selecting from autocomplete
    if (quote?.id) {
      // Add all address fields to pending changes and flush immediately
      pendingChanges.current = {
        ...pendingChanges.current,
        jobsiteStreetAddress: components.streetAddress,
        jobsiteAddressLine2: components.addressLine2 || "",
        jobsiteCity: components.city,
        jobsiteState: components.state,
        jobsiteZipCode: components.zipCode,
        jobsiteCountry: components.country,
        jobsitePlaceId: components.placeId,
      };
      flushPendingChanges();
    }
  };

  // Handle client change with immediate autosave
  const handleClientChange = useCallback((value: number | null | undefined) => {
    const actualValue = value ?? null;
    form.setValue("accountId", actualValue);
    if (quote?.id) {
      pendingChanges.current = { ...pendingChanges.current, accountId: actualValue };
      flushPendingChanges();
    }
  }, [quote?.id, flushPendingChanges, form]);

  const handleSubmit = (data: QuoteFormData) => {
    onSave(data);
  };

  const opsJobUrl = opsImportResult?.opsJobUrl || null;
  const opsJobLabel = getOpsJobLabel(opsImportResult);
  const canSendToOps = Boolean(quote?.id && quote.lineItems?.length);

  return (
    <Card className="mb-6">
      <CardHeader className="border-b border-border">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="text-2xl font-bold text-foreground">
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
                {(isSaving || autosaveMutation.isPending) && (
                  <span className="text-sm text-muted-foreground flex items-center">
                    <Clock className="mr-1 h-3 w-3 animate-spin" />
                    Saving...
                  </span>
                )}
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium text-foreground">Pipeline Stage:</span>
                  <Select
                    value={(form.watch("dealStage") as string) || "new_lead"}
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
                <div className="flex flex-col sm:flex-row gap-2">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!canSendToOps || sendToOpsMutation.isPending}
                        data-testid="button-send-to-ops"
                        title={!canSendToOps ? "Add at least one line item before sending to Ops" : "Create or open the matching Ops job"}
                      >
                        {sendToOpsMutation.isPending ? (
                          <Clock className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="mr-2 h-4 w-4" />
                        )}
                        {sendToOpsMutation.isPending ? "Sending..." : "Send to Ops"}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Send this quote to Ops?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Ops will create or find the matching job, copy the quote lines, and build the Rainmaker Import Packet.
                          Purchase orders will not be created automatically.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
                        Use this when the sale is ready for the team to start operational planning. OEM lines will be grouped for procurement review; Sundance or unclear lines will be marked for manual review.
                      </div>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => {
                            sendToOpsMutation.mutate();
                          }}
                          disabled={sendToOpsMutation.isPending}
                          data-testid="confirm-send-to-ops"
                        >
                          Send to Ops
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  {opsJobUrl && (
                    <Button type="button" variant="outline" asChild data-testid="link-open-ops-job">
                      <a href={opsJobUrl} target="_blank" rel="noreferrer">
                        <ExternalLink className="mr-2 h-4 w-4" />
                        {opsJobLabel ? "Open Ops Job" : "Open Ops"}
                      </a>
                    </Button>
                  )}
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
                <h3 className="text-lg font-semibold text-foreground">Client Information</h3>
                <span className="text-sm text-muted-foreground">(Optional)</span>
              </div>
              
              <div className="text-sm text-muted-foreground mb-4">
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
                          value={field.value as number | null | undefined}
                          onValueChange={handleClientChange}
                          placeholder="Search clients or create new..."
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="text-xs text-muted-foreground bg-muted p-3 rounded-md">
                  <strong>Tip:</strong> You can create quotes quickly without selecting a client. 
                  Clients can be linked later when managing relationships.
                </div>
              </div>
            </div>
            
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-3">Project Details</h3>
                <div className="space-y-3">
                  <FormField
                    control={form.control}
                    name="quoteNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Quote Number</FormLabel>
                        <FormControl>
                          <Input 
                            value={field.value as string || ""}
                            readOnly 
                            placeholder="Auto-generated on save"
                            className="bg-muted"
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
                          <Input 
                            placeholder="Enter project name (required)" 
                            value={field.value as string || ""} 
                            onChange={(e) => handleFieldChange("projectName", e.target.value, field.onChange)}
                            onBlur={handleFieldBlur}
                            data-testid="input-project-name" 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-foreground">Jobsite Address</h4>
                      <span className="text-xs text-muted-foreground">Optional</span>
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
                      <p className="text-xs text-muted-foreground mt-1">Or enter address details manually below</p>
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
                              value={field.value as string || ""}
                              onChange={(e) => handleFieldChange("jobsiteStreetAddress", e.target.value, field.onChange)}
                              onBlur={handleFieldBlur}
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
                                value={field.value as string || ""}
                                onChange={(e) => handleFieldChange("jobsiteAddressLine2", e.target.value, field.onChange)}
                                onBlur={handleFieldBlur}
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
                                value={field.value as string || ""}
                                onChange={(e) => handleFieldChange("jobsiteCity", e.target.value, field.onChange)}
                                onBlur={handleFieldBlur}
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
                                value={field.value as string || ""}
                                onChange={(e) => handleFieldChange("jobsiteState", e.target.value, field.onChange)}
                                onBlur={handleFieldBlur}
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
                                value={field.value as string || ""}
                                onChange={(e) => handleFieldChange("jobsiteZipCode", e.target.value, field.onChange)}
                                onBlur={handleFieldBlur}
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
                                value={field.value as string || ""}
                                onChange={(e) => handleFieldChange("jobsiteCountry", e.target.value, field.onChange)}
                                onBlur={handleFieldBlur}
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
                          <Input 
                            type="date" 
                            value={field.value as string || ""} 
                            onChange={(e) => handleFieldChange("estimatedStartDate", e.target.value, field.onChange)}
                            onBlur={handleFieldBlur}
                          />
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
