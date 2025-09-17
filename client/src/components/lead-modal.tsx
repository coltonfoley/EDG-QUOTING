import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LoadingSpinner } from "@/components/loading-spinner";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { insertLeadSchema, type Lead, type InsertLead } from "@shared/schema";

// Enhanced validation schema for the form with additional client-side rules
const leadFormSchema = insertLeadSchema.extend({
  title: z.string().min(1, "Title is required").max(200, "Title is too long"),
  contactName: z.string().min(1, "Contact name is required").max(100, "Contact name is too long"),
  email: z.string().email("Please enter a valid email address").max(255, "Email is too long"),
  phone: z.string().optional().refine((val) => !val || val.length >= 10, "Phone number must be at least 10 digits"),
  company: z.string().max(100, "Company name is too long").optional(),
  description: z.string().max(1000, "Description is too long").optional(),
  notes: z.string().max(2000, "Notes are too long").optional(),
  value: z.string().optional().refine((val) => {
    if (!val || val === "") return true;
    const num = parseFloat(val.replace(/[,$]/g, ""));
    return !isNaN(num) && num >= 0 && num <= 10000000;
  }, "Value must be a valid amount between $0 and $10,000,000"),
});

// Lead stages with proper labels
const LEAD_STAGES = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "proposal", label: "Proposal" },
  { value: "negotiation", label: "Negotiation" },
  { value: "closed_won", label: "Closed Won" },
  { value: "closed_lost", label: "Closed Lost" },
] as const;

// Priority options
const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
] as const;

// Common lead sources
const LEAD_SOURCES = [
  { value: "website", label: "Website" },
  { value: "referral", label: "Referral" },
  { value: "email", label: "Email Campaign" },
  { value: "social_media", label: "Social Media" },
  { value: "trade_show", label: "Trade Show" },
  { value: "cold_call", label: "Cold Call" },
  { value: "partner", label: "Partner" },
  { value: "advertising", label: "Advertising" },
  { value: "other", label: "Other" },
] as const;

interface LeadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead?: Lead;
  onLeadSaved?: (lead: Lead) => void;
}

interface User {
  id: string;
  username: string;
  firstName?: string;
  lastName?: string;
}

export function LeadModal({ open, onOpenChange, lead, onLeadSaved }: LeadModalProps) {
  const { toast } = useToast();
  const isEditing = !!lead;

  // Form setup with validation
  const form = useForm<z.infer<typeof leadFormSchema>>({
    resolver: zodResolver(leadFormSchema),
    defaultValues: {
      title: "",
      description: "",
      contactName: "",
      email: "",
      phone: "",
      company: "",
      source: "",
      stage: "new",
      value: "",
      priority: "medium",
      assignedTo: undefined,
      notes: "",
      customerId: undefined,
      quoteId: undefined,
    },
  });

  // Fetch users for assignment dropdown
  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: open, // Only fetch when modal is open
  });

  // Reset form when modal opens/closes or lead changes
  useEffect(() => {
    if (open && lead) {
      // Editing mode - populate form with lead data
      form.reset({
        title: lead.title || "",
        description: lead.description || "",
        contactName: lead.contactName || "",
        email: lead.email || "",
        phone: lead.phone || "",
        company: lead.company || "",
        source: lead.source || "",
        stage: (lead.stage as "new" | "contacted" | "qualified" | "proposal" | "negotiation" | "closed_won" | "closed_lost") || "new",
        value: lead.value ? lead.value.toString() : "",
        priority: (lead.priority as "low" | "medium" | "high") || "medium",
        assignedTo: lead.assignedTo || undefined,
        notes: lead.notes || "",
        customerId: lead.customerId || undefined,
        quoteId: lead.quoteId || undefined,
      });
    } else if (open && !lead) {
      // Create mode - reset to defaults
      form.reset({
        title: "",
        description: "",
        contactName: "",
        email: "",
        phone: "",
        company: "",
        source: "",
        stage: "new",
        value: "",
        priority: "medium",
        assignedTo: undefined,
        notes: "",
        customerId: undefined,
        quoteId: undefined,
      });
    }
  }, [open, lead, form]);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: InsertLead) => {
      const response = await apiRequest("POST", "/api/leads", data);
      return response.json();
    },
    onSuccess: (newLead: Lead) => {
      toast({
        title: "Success",
        description: "Lead created successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      onLeadSaved?.(newLead);
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create lead",
        variant: "destructive",
      });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (data: InsertLead & { id: number }) => {
      const { id, ...updateData } = data;
      const response = await apiRequest("PUT", `/api/leads/${id}`, updateData);
      return response.json();
    },
    onSuccess: (updatedLead: Lead) => {
      toast({
        title: "Success",
        description: "Lead updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      onLeadSaved?.(updatedLead);
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update lead",
        variant: "destructive",
      });
    },
  });

  // Form submission handler
  const onSubmit = async (data: z.infer<typeof leadFormSchema>) => {
    try {
      // Transform form data to match API expectations
      const submitData: InsertLead = {
        title: data.title,
        description: data.description || null,
        contactName: data.contactName,
        email: data.email,
        phone: data.phone || null,
        company: data.company || null,
        source: data.source || null,
        stage: data.stage,
        value: data.value && data.value !== "" ? data.value.replace(/[,$]/g, "") : null,
        priority: data.priority,
        assignedTo: data.assignedTo || null,
        notes: data.notes || null,
        customerId: data.customerId || null,
        quoteId: data.quoteId || null,
      };

      if (isEditing && lead) {
        updateMutation.mutate({ ...submitData, id: lead.id });
      } else {
        createMutation.mutate(submitData);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Please check your input and try again",
        variant: "destructive",
      });
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  // Format value input for currency display
  const formatCurrency = (value: string) => {
    const numericValue = value.replace(/[^0-9.]/g, "");
    if (!numericValue) return "";
    const number = parseFloat(numericValue);
    if (isNaN(number)) return "";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(number);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="lead-modal">
        <DialogHeader>
          <DialogTitle data-testid="modal-title">
            {isEditing ? "Edit Lead" : "Create New Lead"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Title */}
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Brief lead description"
                        data-testid="input-title"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Contact Name */}
              <FormField
                control={form.control}
                name="contactName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Name *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Primary contact person"
                        data-testid="input-contact-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Email */}
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="email"
                        placeholder="contact@example.com"
                        data-testid="input-email"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Phone */}
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="tel"
                        placeholder="(555) 123-4567"
                        data-testid="input-phone"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Company */}
              <FormField
                control={form.control}
                name="company"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Company name"
                        data-testid="input-company"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Source */}
              <FormField
                control={form.control}
                name="source"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Source</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""} data-testid="select-source">
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="How did we find this lead?" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="">Not specified</SelectItem>
                        {LEAD_SOURCES.map((source) => (
                          <SelectItem key={source.value} value={source.value}>
                            {source.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Stage */}
              <FormField
                control={form.control}
                name="stage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stage *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} data-testid="select-stage">
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select stage" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {LEAD_STAGES.map((stage) => (
                          <SelectItem key={stage.value} value={stage.value}>
                            {stage.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Priority */}
              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} data-testid="select-priority">
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select priority" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PRIORITY_OPTIONS.map((priority) => (
                          <SelectItem key={priority.value} value={priority.value}>
                            {priority.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Value */}
              <FormField
                control={form.control}
                name="value"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estimated Value</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="text"
                        placeholder="$0.00"
                        data-testid="input-value"
                        onChange={(e) => {
                          const value = e.target.value;
                          field.onChange(value);
                        }}
                        onBlur={(e) => {
                          const formatted = formatCurrency(e.target.value);
                          field.onChange(formatted);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Assigned To */}
              <FormField
                control={form.control}
                name="assignedTo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assigned To</FormLabel>
                    <Select 
                      onValueChange={(value) => field.onChange(value ? parseInt(value) : undefined)} 
                      value={field.value?.toString() || ""} 
                      data-testid="select-assigned-to"
                      disabled={usersLoading}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={usersLoading ? "Loading users..." : "Select assignee"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="">Unassigned</SelectItem>
                        {users?.map((user) => (
                          <SelectItem key={user.id} value={user.id.toString()}>
                            {user.firstName && user.lastName 
                              ? `${user.firstName} ${user.lastName} (${user.username})`
                              : user.username}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Detailed lead description and requirements..."
                      className="min-h-[100px]"
                      data-testid="textarea-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Additional notes, activities, or follow-up tasks..."
                      className="min-h-[80px]"
                      data-testid="textarea-notes"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isLoading}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isLoading}
                data-testid="button-submit"
              >
                {isLoading ? (
                  <>
                    <LoadingSpinner className="mr-2 h-4 w-4" />
                    {isEditing ? "Updating..." : "Creating..."}
                  </>
                ) : (
                  isEditing ? "Update Lead" : "Create Lead"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}