import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { z } from "zod";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { insertAccountSchema, insertContactSchema, insertQuoteSchema } from "@shared/schema";
import { Building2, User, ChevronRight, ChevronLeft, Search, UserPlus } from "lucide-react";
import type { Account, InsertAccount, InsertContact, InsertQuote } from "@shared/schema";

interface LeadCreationModalProps {
  open: boolean;
  onClose: () => void;
}

type WorkflowType = "new_customer" | "existing_account" | null;
type Step = "select" | "account" | "contact" | "project" | "search_account";

// Form schemas
const accountFormSchema = insertAccountSchema.extend({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().min(10, "Valid phone number is required"),
  company: z.string().optional(),
  accountType: z.enum(["homeowner", "general_contractor", "commercial"]),
  paymentTerms: z.string().default("net_30"),
  billingAddress: z.string().optional()
});

const contactFormSchema = insertContactSchema.extend({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().optional(),
  role: z.string().default("primary_contact"),
  isPrimary: z.boolean().default(true)
}).omit({ accountId: true });

const projectFormSchema = z.object({
  projectName: z.string().min(1, "Project name is required"),
  jobsiteAddress: z.string().min(1, "Jobsite address is required"),
  dealValue: z.number().min(0).optional(),
  description: z.string().optional()
});

export function LeadCreationModal({ open, onClose }: LeadCreationModalProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [workflowType, setWorkflowType] = useState<WorkflowType>(null);
  const [step, setStep] = useState<Step>("select");
  const [createdAccountId, setCreatedAccountId] = useState<number | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Form instances
  const accountForm = useForm<z.infer<typeof accountFormSchema>>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      company: "",
      accountType: "homeowner",
      paymentTerms: "net_30",
      billingAddress: ""
    }
  });

  const contactForm = useForm<z.infer<typeof contactFormSchema>>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      role: "primary_contact",
      isPrimary: true
    }
  });

  const projectForm = useForm<z.infer<typeof projectFormSchema>>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: {
      projectName: "",
      jobsiteAddress: "",
      dealValue: undefined,
      description: ""
    }
  });

  // Query for searching accounts
  const { data: searchResults } = useQuery<Account[]>({
    queryKey: ["/api/accounts/search", searchTerm],
    queryFn: async () => {
      if (!searchTerm || searchTerm.length < 2) return [];
      const response = await fetch(`/api/accounts/search?q=${encodeURIComponent(searchTerm)}`);
      if (!response.ok) throw new Error("Failed to search accounts");
      return response.json();
    },
    enabled: searchTerm.length >= 2
  });

  // Reset modal state
  const resetModal = () => {
    setWorkflowType(null);
    setStep("select");
    setCreatedAccountId(null);
    setSelectedAccountId(null);
    setSearchTerm("");
    accountForm.reset();
    contactForm.reset();
    projectForm.reset();
  };

  // Handle modal close
  const handleClose = () => {
    resetModal();
    onClose();
  };

  // Handle workflow selection
  const handleWorkflowSelect = (type: WorkflowType) => {
    setWorkflowType(type);
    if (type === "new_customer") {
      setStep("account");
    } else if (type === "existing_account") {
      setStep("search_account");
    }
  };

  // Go back to previous step
  const handleBack = () => {
    if (step === "account" || step === "search_account") {
      setStep("select");
      setWorkflowType(null);
    } else if (step === "contact") {
      setStep("account");
    } else if (step === "project") {
      if (workflowType === "new_customer") {
        setStep("contact");
      } else {
        setStep("search_account");
      }
    }
  };

  // Create account mutation
  const createAccountMutation = useMutation({
    mutationFn: async (data: z.infer<typeof accountFormSchema>) => {
      return await apiRequest("POST", "/api/accounts", data);
    },
    onSuccess: (account: any) => {
      setCreatedAccountId(account.id);
      setStep("contact");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create account",
        variant: "destructive"
      });
    }
  });

  // Create contact mutation
  const createContactMutation = useMutation({
    mutationFn: async (data: z.infer<typeof contactFormSchema>) => {
      return await apiRequest("POST", "/api/contacts", {
        ...data,
        accountId: createdAccountId
      });
    },
    onSuccess: () => {
      setStep("project");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create contact",
        variant: "destructive"
      });
    }
  });

  // Create quote mutation
  const createQuoteMutation = useMutation({
    mutationFn: async (data: z.infer<typeof projectFormSchema>) => {
      const accountId = workflowType === "new_customer" ? createdAccountId : selectedAccountId;
      
      // Generate quote number
      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 1000);
      const quoteNumber = `QT-${new Date().getFullYear()}-${timestamp.toString().slice(-6)}${random}`;
      
      const quoteData: InsertQuote = {
        quoteNumber,
        accountId: accountId!,
        projectName: data.projectName,
        jobsiteAddress: data.jobsiteAddress,
        dealStage: "lead", // Always set to lead for new projects
        status: "draft",
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
        notes: data.description || ""
      };

      return await apiRequest("POST", "/api/quotes", quoteData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      toast({
        title: "Success",
        description: "Lead created successfully!",
      });
      handleClose();
      navigate("/pipeline");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create project",
        variant: "destructive"
      });
    }
  });

  // Handle account form submission
  const onAccountSubmit = (data: z.infer<typeof accountFormSchema>) => {
    createAccountMutation.mutate(data);
  };

  // Handle contact form submission
  const onContactSubmit = (data: z.infer<typeof contactFormSchema>) => {
    createContactMutation.mutate(data);
  };

  // Handle project form submission
  const onProjectSubmit = (data: z.infer<typeof projectFormSchema>) => {
    setIsCreating(true);
    createQuoteMutation.mutate(data);
  };

  // Handle account selection in existing account workflow
  const handleAccountSelect = (accountId: number) => {
    setSelectedAccountId(accountId);
    setStep("project");
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === "select" && "Create New Lead"}
            {step === "account" && "Step 1: Account Information"}
            {step === "contact" && "Step 2: Primary Contact"}
            {step === "project" && "Step 3: Project Details"}
            {step === "search_account" && "Select Existing Account"}
          </DialogTitle>
          <DialogDescription>
            {step === "select" && "Choose how you want to create a new lead"}
            {step === "account" && "Enter the account details for this lead"}
            {step === "contact" && "Add the primary contact for this account"}
            {step === "project" && "Enter the project details"}
            {step === "search_account" && "Search and select an existing account"}
          </DialogDescription>
        </DialogHeader>

        {/* Workflow Selection */}
        {step === "select" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            <Card 
              className="cursor-pointer hover:border-blue-500 transition-colors"
              onClick={() => handleWorkflowSelect("new_customer")}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserPlus className="h-5 w-5" />
                  New Customer
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Create a new account, add a primary contact, and start a new project
                </CardDescription>
              </CardContent>
            </Card>

            <Card 
              className="cursor-pointer hover:border-blue-500 transition-colors"
              onClick={() => handleWorkflowSelect("existing_account")}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Existing Account
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Select an existing account and create a new project for them
                </CardDescription>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Account Form (New Customer - Step 1) */}
        {step === "account" && (
          <Form {...accountForm}>
            <form onSubmit={accountForm.handleSubmit(onAccountSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={accountForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="John Doe" {...field} data-testid="input-lead-account-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={accountForm.control}
                  name="company"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company Name</FormLabel>
                      <FormControl>
                        <Input placeholder="ABC Construction" {...field} data-testid="input-lead-account-company" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={accountForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email *</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="john@example.com" {...field} data-testid="input-lead-account-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={accountForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone *</FormLabel>
                      <FormControl>
                        <Input placeholder="(555) 123-4567" {...field} data-testid="input-lead-account-phone" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={accountForm.control}
                  name="accountType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account Type *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-lead-account-type">
                            <SelectValue placeholder="Select account type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="homeowner">Homeowner</SelectItem>
                          <SelectItem value="general_contractor">General Contractor</SelectItem>
                          <SelectItem value="commercial">Commercial</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={accountForm.control}
                name="billingAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Billing Address</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="123 Main St, Suite 100, City, State 12345" 
                        {...field} 
                        data-testid="textarea-lead-billing-address"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={handleBack}
                  data-testid="button-lead-back"
                >
                  <ChevronLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
                <Button 
                  type="submit" 
                  disabled={createAccountMutation.isPending}
                  data-testid="button-lead-continue-account"
                >
                  {createAccountMutation.isPending ? "Creating..." : "Continue"}
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}

        {/* Contact Form (New Customer - Step 2) */}
        {step === "contact" && (
          <Form {...contactForm}>
            <form onSubmit={contactForm.handleSubmit(onContactSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={contactForm.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="John" {...field} data-testid="input-lead-contact-firstname" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={contactForm.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="Doe" {...field} data-testid="input-lead-contact-lastname" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={contactForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email *</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="john@example.com" {...field} data-testid="input-lead-contact-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={contactForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input placeholder="(555) 123-4567" {...field} data-testid="input-lead-contact-phone" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={contactForm.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-lead-contact-role">
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="primary_contact">Primary Contact</SelectItem>
                          <SelectItem value="project_manager">Project Manager</SelectItem>
                          <SelectItem value="decision_maker">Decision Maker</SelectItem>
                          <SelectItem value="owner">Owner</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={contactForm.control}
                  name="isPrimary"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel>Primary Contact</FormLabel>
                      </div>
                      <FormControl>
                        <Switch 
                          checked={field.value} 
                          onCheckedChange={field.onChange}
                          data-testid="switch-lead-contact-primary"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={handleBack}
                  data-testid="button-lead-back"
                >
                  <ChevronLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
                <Button 
                  type="submit" 
                  disabled={createContactMutation.isPending}
                  data-testid="button-lead-continue-contact"
                >
                  {createContactMutation.isPending ? "Creating..." : "Continue"}
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}

        {/* Search Account (Existing Account Workflow) */}
        {step === "search_account" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-gray-500" />
              <Input
                placeholder="Search by name, email, or company..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                data-testid="input-lead-search-account"
              />
            </div>

            {searchResults && searchResults.length > 0 && (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {searchResults.map((account) => (
                  <Card 
                    key={account.id}
                    className="cursor-pointer hover:border-blue-500 transition-colors"
                    onClick={() => handleAccountSelect(account.id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium">{account.name}</p>
                          {account.company && (
                            <p className="text-sm text-gray-600">{account.company}</p>
                          )}
                          <p className="text-sm text-gray-500">{account.email}</p>
                        </div>
                        <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                          {account.accountType?.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {searchTerm.length >= 2 && (!searchResults || searchResults.length === 0) && (
              <p className="text-center text-gray-500 py-8">No accounts found matching "{searchTerm}"</p>
            )}

            {searchTerm.length < 2 && (
              <p className="text-center text-gray-500 py-8">Start typing to search for accounts...</p>
            )}

            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={handleBack}
                data-testid="button-lead-back"
              >
                <ChevronLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Project Form (Final Step) */}
        {step === "project" && (
          <Form {...projectForm}>
            <form onSubmit={projectForm.handleSubmit(onProjectSubmit)} className="space-y-4">
              <FormField
                control={projectForm.control}
                name="projectName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project Name *</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="e.g., Backyard Pergola Installation" 
                        {...field} 
                        data-testid="input-lead-project-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={projectForm.control}
                name="jobsiteAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Jobsite Address *</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="123 Main St, City, State 12345" 
                        {...field} 
                        data-testid="textarea-lead-jobsite-address"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={projectForm.control}
                name="dealValue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estimated Deal Value</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        placeholder="0.00" 
                        {...field}
                        onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                        data-testid="input-lead-deal-value"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={projectForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project Description</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Brief description of the project..." 
                        {...field} 
                        data-testid="textarea-lead-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={handleBack}
                  disabled={isCreating}
                  data-testid="button-lead-back"
                >
                  <ChevronLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
                <Button 
                  type="submit" 
                  disabled={isCreating}
                  data-testid="button-lead-create"
                >
                  {isCreating ? "Creating Lead..." : "Create Lead"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}