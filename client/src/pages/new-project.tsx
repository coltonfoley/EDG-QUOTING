import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { insertProjectSchema } from "@shared/schema";
import type { QuoteWithDetails, Account, Contact, User } from "@shared/schema";
import { ArrowLeft, CalendarIcon, Building2, Users, DollarSign, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

// Form validation schema - subset of insertProjectSchema with UI-specific validation
const formSchema = insertProjectSchema.pick({
  quoteId: true,
  accountId: true,
  primaryContactId: true,
  name: true,
  description: true,
  priority: true,
  projectAddress: true,
  estimatedStartDate: true,
  estimatedEndDate: true,
  projectManagerId: true,
  estimatedTotalCost: true,
  notes: true,
}).extend({
  estimatedStartDate: z.date().optional(),
  estimatedEndDate: z.date().optional(),
  estimatedTotalCost: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

export default function NewProjectPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();

  // Fetch supporting data
  const { data: quotes = [] } = useQuery<QuoteWithDetails[]>({
    queryKey: ["/api/quotes"],
    enabled: isAuthenticated,
  });

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ["/api/accounts"],
    enabled: isAuthenticated,
  });

  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
    enabled: isAuthenticated,
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: isAuthenticated,
    retry: false,
  });

  // Form setup
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      priority: "medium",
      description: "",
      projectAddress: "",
      notes: "",
      estimatedTotalCost: "",
    },
  });

  const watchedAccountId = form.watch("accountId");
  const watchedQuoteId = form.watch("quoteId");

  // Filter contacts by selected account
  const accountContacts = contacts.filter(contact => 
    watchedAccountId ? contact.accountId === watchedAccountId : false
  );

  // For now, show all quotes since customers don't directly map to accounts
  // TODO: Implement customer-to-account mapping when needed
  const accountQuotes = quotes;

  // Auto-populate fields when quote is selected
  const selectedQuote = quotes.find(q => q.id === watchedQuoteId);
  
  // Generate project number
  const generateProjectNumber = () => {
    const year = new Date().getFullYear();
    const randomId = Math.floor(Math.random() * 900000) + 100000;
    return `PRJ-${year}-${randomId}`;
  };

  // Calculate quote total
  const calculateQuoteTotal = (quote?: QuoteWithDetails): string => {
    if (!quote?.lineItems || !Array.isArray(quote.lineItems) || quote.lineItems.length === 0) return "0";
    try {
      const total = quote.lineItems.reduce((sum, item) => {
        if (!item) return sum;
        const qty = parseFloat(item.quantity?.toString() || "0");
        const price = parseFloat(item.unitPrice?.toString() || "0");
        const markup = parseFloat(item.markupValue?.toString() || "0");
        if (isNaN(qty) || isNaN(price) || isNaN(markup)) return sum;
        
        const baseTotal = qty * price;
        const itemTotal = item.markupType === 'percentage' 
          ? baseTotal + (baseTotal * (markup / 100))
          : baseTotal + markup;
        return sum + itemTotal;
      }, 0);
      return total.toString();
    } catch (error) {
      console.error("Error calculating quote total:", error);
      return "0";
    }
  };

  // Create project mutation
  const createProjectMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const projectData = {
        ...data,
        projectNumber: generateProjectNumber(),
        accountId: data.accountId, // Must be explicitly selected since customer doesn't have accountId
        estimatedStartDate: data.estimatedStartDate?.toISOString(),
        estimatedEndDate: data.estimatedEndDate?.toISOString(),
        estimatedTotalCost: data.estimatedTotalCost || calculateQuoteTotal(selectedQuote),
      };
      
      // Use convert-from-quote endpoint if a quote is selected
      if (data.quoteId) {
        const response = await apiRequest("POST", "/api/projects/convert-from-quote", {
          quoteId: data.quoteId,
          projectData
        });
        return await response.json();
      } else {
        const response = await apiRequest("POST", "/api/projects", projectData);
        return await response.json();
      }
    },
    onSuccess: (project: any) => {
      toast({
        title: "Project Created",
        description: `Project "${project.name || 'New Project'}" has been created successfully.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setLocation(`/project-details/${project.id}`);
    },
    onError: (error: any) => {
      toast({
        title: "Error Creating Project",
        description: error.message || "Failed to create project. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    if (!data.quoteId) {
      toast({
        title: "Quote Required",
        description: "Please select an approved quote to create a project.",
        variant: "destructive",
      });
      return;
    }
    if (!data.accountId) {
      toast({
        title: "Account Required",
        description: "Please select a client account for this project.",
        variant: "destructive",
      });
      return;
    }
    createProjectMutation.mutate(data);
  };

  // Auto-fill fields when quote is selected
  const handleQuoteSelect = (quoteId: string) => {
    const quote = quotes.find(q => q.id === parseInt(quoteId));
    if (quote) {
      // Note: Customer objects don't have accountId, so we'll need to manually select the account
      // Generate project name with fallbacks
      const projectName = quote.projectName || 
        (quote.customer?.name ? `${quote.customer.name} Project` : `Project from Quote ${quote.quoteNumber || quote.id}`);
      form.setValue("name", projectName);
      
      form.setValue("projectAddress", quote.projectAddress || "");
      form.setValue("estimatedTotalCost", calculateQuoteTotal(quote));
      
      if (quote.estimatedStartDate) {
        try {
          form.setValue("estimatedStartDate", new Date(quote.estimatedStartDate));
        } catch (e) {
          console.warn("Invalid start date in quote:", quote.estimatedStartDate);
        }
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Link href="/projects" className="inline-flex items-center text-edg-blue hover:text-edg-blue-dark">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Projects
          </Link>
        </div>

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-edg-black mb-2">Create New Project</h1>
          <p className="text-edg-grey">Convert an approved quote into a managed project with full tracking capabilities.</p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Quote Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Quote & Account Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="quoteId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Approved Quote *</FormLabel>
                        <Select 
                          onValueChange={(value) => {
                            field.onChange(parseInt(value));
                            handleQuoteSelect(value);
                          }}
                          value={field.value?.toString()}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-quote">
                              <SelectValue placeholder="Select approved quote" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {accountQuotes.map((quote) => (
                              <SelectItem key={quote.id} value={quote.id.toString()}>
                                {quote.quoteNumber} - {quote.customer?.name || 'Unknown Customer'}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="accountId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Client Account *</FormLabel>
                        <Select onValueChange={(value) => field.onChange(parseInt(value))} value={field.value?.toString()}>
                          <FormControl>
                            <SelectTrigger data-testid="select-account">
                              <SelectValue placeholder="Select client account (required)" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {accounts.map((account) => (
                              <SelectItem key={account.id} value={account.id.toString()}>
                                {account.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="primaryContactId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Primary Contact</FormLabel>
                      <Select onValueChange={(value) => field.onChange(parseInt(value))} value={field.value?.toString()}>
                        <FormControl>
                          <SelectTrigger data-testid="select-contact">
                            <SelectValue placeholder="Select primary contact" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {accountContacts.map((contact) => (
                            <SelectItem key={contact.id} value={contact.id.toString()}>
                              {contact.firstName} {contact.lastName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Project Details */}
            <Card>
              <CardHeader>
                <CardTitle>Project Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Project Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter project name" {...field} data-testid="input-project-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Detailed project description..."
                          className="min-h-[100px]"
                          {...field}
                          data-testid="textarea-description"
                        />
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
                      <FormLabel>Project Address</FormLabel>
                      <FormControl>
                        <Input placeholder="Work site address" {...field} data-testid="input-address" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Priority</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-priority">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="urgent">Urgent</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Timeline & Budget */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarIcon className="h-5 w-5" />
                  Timeline & Budget
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="estimatedStartDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Estimated Start Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                                data-testid="button-start-date"
                              >
                                {field.value ? format(field.value, "PPP") : "Select start date"}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              disabled={(date) => date < new Date()}
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="estimatedEndDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Estimated End Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                                data-testid="button-end-date"
                              >
                                {field.value ? format(field.value, "PPP") : "Select end date"}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              disabled={(date) => {
                                const startDate = form.getValues("estimatedStartDate");
                                return startDate ? date < startDate : date < new Date();
                              }}
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="estimatedTotalCost"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Estimated Total Cost</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <DollarSign className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                          <Input 
                            placeholder="0.00" 
                            className="pl-9"
                            {...field}
                            data-testid="input-estimated-cost"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Team Assignment */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Team Assignment
                </CardTitle>
              </CardHeader>
              <CardContent>
                <FormField
                  control={form.control}
                  name="projectManagerId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Project Manager</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ""}>
                        <FormControl>
                          <SelectTrigger data-testid="select-project-manager">
                            <SelectValue placeholder="Select project manager" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {users.map((user) => (
                            <SelectItem key={user.id} value={user.id}>
                              {user.username}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Additional Notes */}
            <Card>
              <CardHeader>
                <CardTitle>Additional Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Textarea 
                          placeholder="Any additional notes or requirements..."
                          className="min-h-[80px]"
                          {...field}
                          data-testid="textarea-notes"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Form Actions */}
            <div className="flex justify-end space-x-4">
              <Link href="/projects">
                <Button variant="outline" type="button" data-testid="button-cancel">
                  Cancel
                </Button>
              </Link>
              <Button 
                type="submit" 
                disabled={createProjectMutation.isPending}
                data-testid="button-create-project"
              >
                {createProjectMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating Project...
                  </>
                ) : (
                  "Create Project"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}