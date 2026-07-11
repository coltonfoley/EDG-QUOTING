import { useForm, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertQuoteSchema, type QuoteWithDetails } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Clock, Camera, Image, Wrench, Building, ChevronDown, ChevronUp, Search, Users, CheckCircle2, AlertCircle, Circle } from "lucide-react";
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
import { omitQuoteSummaryFields } from "@shared/quoteSavePayload";
import { ClientComboboxWithCreate } from "@/components/client-combobox-with-create";
import { AddressAutocomplete } from "@/components/address-autocomplete";
import { isSignedQuoteLockApiError, SIGNED_QUOTE_READ_ONLY_MESSAGE } from "@/lib/quote-lock";

// Form schema extends the insert schema with new structured address fields
const quoteFormSchema = insertQuoteSchema.extend({
  quoteNumber: z.string().optional(), // Override for form
  projectName: z.string().trim().min(1, "Project name is required"),
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

interface QuoteHeaderProps {
  quote?: QuoteWithDetails;
  onSave: (data: Partial<QuoteFormData>) => void;
  isLoading?: boolean;
  isReadOnly?: boolean;
}

type SaveStatus = "new" | "saved" | "pending" | "saving" | "error";

export function QuoteHeader({ quote, onSave, isLoading, isReadOnly = false }: QuoteHeaderProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isExistingQuote = Boolean(quote?.id);
  
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingChanges = useRef<Record<string, any>>({});
  const pendingSavePromise = useRef<Promise<any> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(quote?.id ? "saved" : "new");
  const [formErrorSummary, setFormErrorSummary] = useState<string[]>([]);
  const formErrorSummaryRef = useRef<HTMLDivElement | null>(null);

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
      internalNotes: quote?.internalNotes || "",
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
        internalNotes: quote.internalNotes || "",
        dealStage: quote.dealStage || "new_lead",
        taxRate: quote.taxRate || "0",
        tariffRate: quote.tariffRate || "0",
        discount: quote.discount || "0",
        shipping: quote.shipping || "0",
        accountId: quote.accountId ?? null,
      });
      setSaveStatus(quote.id ? "saved" : "new");
    } else {
      setSaveStatus("new");
    }
  }, [quote?.id, form]);
  

  const updateDealStageMutation = useMutation({
    mutationFn: async ({ dealStage }: { dealStage: string }) => {
      if (!quote?.id) throw new Error("No quote ID");
      const response = await apiRequest('PATCH', `/api/quotes/${quote.id}/stage`, { deal_stage: dealStage });
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
      if (isSignedQuoteLockApiError(error)) {
        pendingChanges.current = {};
        queryClient.invalidateQueries({ queryKey: [`/api/quotes/${quote?.id}`] });
        toast({
          title: "Quote is now read only",
          description: SIGNED_QUOTE_READ_ONLY_MESSAGE,
          variant: "destructive",
        });
        setIsSaving(false);
        setSaveStatus("saved");
        return;
      }
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
      setSaveStatus("saved");
    },
    onError: (error: Error) => {
      toast({ 
        title: "Error", 
        description: "Failed to save changes", 
        variant: "destructive" 
      });
      setIsSaving(false);
      setSaveStatus("error");
    },
  });

  const persistPendingChangesOnUnload = useCallback(() => {
    if (isReadOnly || !quote?.id || Object.keys(pendingChanges.current).length === 0) return;

    const changes = { ...pendingChanges.current };
    pendingChanges.current = {};

    void fetch(`/api/quotes/${quote.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
      credentials: "include",
      keepalive: true,
    }).catch(() => {
      // The normal autosave path handles user-visible errors. This is only a last-chance save.
    });
  }, [quote?.id, isReadOnly]);

  // Flush all pending changes immediately
  const flushPendingChanges = useCallback(async () => {
    if (isReadOnly || !quote?.id) return pendingSavePromise.current ?? Promise.resolve();
    
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
      setSaveStatus("saving");
      const savePromise = autosaveMutation
        .mutateAsync(changes)
        .catch((error) => {
          if (!isSignedQuoteLockApiError(error)) {
            pendingChanges.current = { ...changes, ...pendingChanges.current };
          }
          throw error;
        })
        .finally(() => {
          if (pendingSavePromise.current === savePromise) {
            pendingSavePromise.current = null;
          }
        });

      pendingSavePromise.current = savePromise;
      return savePromise;
    }

    return pendingSavePromise.current ?? Promise.resolve();
  }, [quote?.id, isReadOnly, autosaveMutation]);

  // Debounced autosave function - uses single timer for all fields
  const performAutosave = useCallback((field: keyof QuoteFormData, value: any) => {
    if (isReadOnly || !quote?.id) return;
    
    // Store the pending change
    pendingChanges.current[field] = value;
    setSaveStatus("pending");
    
    // Clear existing timer
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    
    // Set new debounced timer (500ms delay)
    debounceTimer.current = setTimeout(() => {
      void flushPendingChanges().catch(() => undefined);
    }, 500);
  }, [quote?.id, isReadOnly, flushPendingChanges]);

  // Handle field blur - flush all pending changes immediately
  const handleFieldBlur = useCallback(() => {
    if (!quote?.id) return;
    void flushPendingChanges().catch(() => undefined);
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
      persistPendingChangesOnUnload();
    };
  }, [persistPendingChangesOnUnload]);

  useEffect(() => {
    if (!isReadOnly) return;
    pendingChanges.current = {};
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    setSaveStatus("saved");
  }, [isReadOnly]);

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
    if (quote?.id && !isReadOnly) {
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
      setSaveStatus("pending");
      void flushPendingChanges().catch(() => undefined);
    }
  };

  // Handle client change with immediate autosave
  const handleClientChange = useCallback((value: number | null | undefined) => {
    const actualValue = value ?? null;
    form.setValue("accountId", actualValue);
    if (quote?.id) {
      pendingChanges.current = { ...pendingChanges.current, accountId: actualValue };
      setSaveStatus("pending");
      void flushPendingChanges().catch(() => undefined);
    }
  }, [quote?.id, isReadOnly, flushPendingChanges, form]);

  const handleSubmit = (data: QuoteFormData) => {
    setFormErrorSummary([]);
    onSave(omitQuoteSummaryFields(data));
  };

  const handleInvalid = (errors: FieldErrors<QuoteFormData>) => {
    const fieldLabels: Partial<Record<keyof QuoteFormData, string>> = {
      projectName: "Project name",
      accountId: "Client",
      dealStage: "Pipeline stage",
      taxRate: "Tax rate",
      tariffRate: "Tariff rate",
      discount: "Discount",
      shipping: "Shipping",
    };
    const messages = Object.entries(errors).map(([field, error]) => {
      const label = fieldLabels[field as keyof QuoteFormData] || field;
      return `${label}: ${error?.message || "check this field"}`;
    });
    setFormErrorSummary(messages.length > 0 ? messages : ["Check the highlighted quote details."]);
    window.setTimeout(() => formErrorSummaryRef.current?.focus(), 0);
  };

  const isArchivedVersion = quote?.isLatestVersion === false;
  const hasLineItems = Boolean(quote?.lineItems?.length);
  const hasProjectName = Boolean((form.watch("projectName") as string | undefined)?.trim());
  const proposalShared = Boolean(quote?.signingToken || quote?.signatureEmailSentAt || quote?.clientSignedAt || quote?.companySignedAt);
  const signatureComplete = Boolean(quote?.clientSignedAt);
  const workflowSteps = [
    { label: "Details", complete: hasProjectName },
    { label: "Line Items", complete: hasLineItems },
    { label: "Review", complete: hasProjectName && hasLineItems },
    { label: "Proposal", complete: proposalShared },
    { label: "Signature", complete: signatureComplete },
  ];
  const nextWorkflowStep = !quote?.id
    ? "Create the quote, then add products or custom line items."
    : !hasProjectName
      ? "Add a clear project name so the quote is easy to find later."
      : !hasLineItems
        ? "Add line items from the catalog or as custom items."
        : !proposalShared
          ? "Review totals, generate the proposal, then prepare the signature link."
          : !signatureComplete
            ? "Follow up on the customer and company signatures."
            : "Customer approval is complete. Keep this signed version as the project record.";
  const saveStatusConfig = {
    new: { label: "Not created yet", icon: Circle, className: "text-muted-foreground" },
    saved: { label: "Saved", icon: CheckCircle2, className: "text-emerald-700 dark:text-emerald-400" },
    pending: { label: "Unsaved changes", icon: Clock, className: "text-amber-700" },
    saving: { label: "Saving...", icon: Clock, className: "text-blue-700" },
    error: { label: "Save needs attention", icon: AlertCircle, className: "text-red-700" },
  }[saveStatus];
  const SaveStatusIcon = saveStatusConfig.icon;

  return (
    <Card className="mb-6">
      <CardHeader className="border-b border-border">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle>
              <h1 className="text-2xl font-bold text-foreground">
                {isExistingQuote ? `Quote ${quote?.quoteNumber}` : "New Quote"}
              </h1>
            </CardTitle>
            {isExistingQuote && quote?.createdAt && (
              <p className="text-sm text-accent-grey mt-1">
                Created on {new Date(quote.createdAt).toLocaleDateString()}
              </p>
            )}
          </div>
          <div className="mt-4 lg:mt-0 flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3">
            {isExistingQuote && (
              <>
                <div
                  className={cn("flex items-center gap-1.5 text-sm font-medium", saveStatusConfig.className)}
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                  data-testid="quote-save-status"
                >
                  <SaveStatusIcon className={cn("h-4 w-4", saveStatus === "saving" && "animate-spin")} aria-hidden="true" />
                  {saveStatusConfig.label}
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium text-foreground">Pipeline Stage:</span>
                  <Select
                    value={(form.watch("dealStage") as string) || "new_lead"}
                    onValueChange={handleDealStageChange}
                    disabled={updateDealStageMutation.isPending || isArchivedVersion}
                  >
                    <SelectTrigger className="w-48" aria-label="Pipeline stage">
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
            {!isReadOnly && isExistingQuote && <Button
              type="submit" 
              form="quote-form" 
              className="bg-edg-black hover:bg-edg-grey text-edg-white"
              disabled={isLoading}
              data-testid="button-submit-quote"
            >
              <Save className="mr-2 h-4 w-4" aria-hidden="true" />
              {isLoading ? "Saving..." : "Save Now"}
            </Button>}
          </div>
        </div>
        <div className="mt-5 rounded-md border bg-muted/30 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Quote workflow</p>
              <p className="mt-1 text-sm text-muted-foreground">{nextWorkflowStep}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {workflowSteps.map((step) => (
                <Badge
                  key={step.label}
                  variant={step.complete ? "default" : "outline"}
                  className={cn(
                    "gap-1.5",
                    step.complete
                      ? "bg-edg-teal text-white hover:bg-edg-teal"
                      : "bg-background text-muted-foreground"
                  )}
                >
                  {step.complete ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
                  {step.label}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6">
        <Form {...form}>
          <form id="quote-form" onSubmit={form.handleSubmit(handleSubmit, handleInvalid)} className="space-y-6" noValidate>
            {formErrorSummary.length > 0 && (
              <div
                ref={formErrorSummaryRef}
                role="alert"
                tabIndex={-1}
                className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid="quote-form-error-summary"
              >
                <p className="font-semibold">Quote details need attention</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {formErrorSummary.map((message) => <li key={message}>{message}</li>)}
                </ul>
              </div>
            )}
            <fieldset disabled={isReadOnly} aria-label="Quote details" className="min-w-0 space-y-6 border-0 p-0">
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
                        {isReadOnly ? (
                          <div className="rounded-md border bg-muted px-3 py-2 text-sm" data-testid="read-only-client-name">
                            {quote?.account?.name || quote?.account?.company || "No client linked"}
                          </div>
                        ) : (
                          <ClientComboboxWithCreate
                            value={field.value as number | null | undefined}
                            onValueChange={handleClientChange}
                            placeholder="Search clients or create new..."
                          />
                        )}
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
                  {!isReadOnly && !isExistingQuote && (
                    <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm text-muted-foreground">Create the quote now; notes, jobsite details, and scheduling can be added afterward.</p>
                      <Button type="submit" disabled={isLoading} data-testid="button-submit-quote">
                        <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                        {isLoading ? "Creating..." : "Create Quote"}
                      </Button>
                    </div>
                  )}
                  <FormField
                    control={form.control}
                    name="internalNotes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Internal Notes</FormLabel>
                        <FormControl>
                          <Textarea
                            rows={3}
                            placeholder="Internal project notes. Not shown on the customer proposal or contract."
                            value={field.value as string || ""}
                            onChange={(e) => handleFieldChange("internalNotes", e.target.value, field.onChange)}
                            onBlur={handleFieldBlur}
                            data-testid="textarea-internal-notes"
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
                        ariaLabel="Search for jobsite address"
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
                        <FormLabel htmlFor="estimated-start-date">Estimated Start Date</FormLabel>
                        <FormControl>
                          <Input 
                            id="estimated-start-date"
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
            </fieldset>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
