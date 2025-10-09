import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { insertAccountSchema, type Account, type InsertAccount } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { User, Info } from "lucide-react";

const accountFormSchema = insertAccountSchema.extend({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  name: z.string().optional(), // Auto-generated from firstName + lastName
  email: z.string().email("Valid email is required"),
  phone: z.string().min(10, "Valid phone number is required"),
  company: z.string().optional(),
  accountType: z.enum([
    "homeowner", 
    "general_contractor", 
    "commercial", 
    "property_manager",
    "architect", 
    "developer",
    "subcontractor",
    "government",
    "nonprofit",
    "other"
  ]),
  paymentTerms: z.string().optional(),
  billingAddress: z.string().optional()
});

type AccountFormData = z.infer<typeof accountFormSchema>;

interface AccountFormProps {
  account?: Account;
  onSuccess: () => void;
  onCancel: () => void;
}

export function AccountForm({ account, onSuccess, onCancel }: AccountFormProps) {
  const { toast } = useToast();
  
  const form = useForm<AccountFormData>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: {
      firstName: account?.firstName || "",
      lastName: account?.lastName || "",
      name: account?.name || "",
      email: account?.email || "",
      phone: account?.phone || "",
      company: account?.company || "",
      accountType: (account?.accountType as "homeowner" | "general_contractor" | "commercial" | "property_manager" | "architect" | "developer" | "subcontractor" | "government" | "nonprofit" | "other") || "homeowner",
      paymentTerms: account?.paymentTerms || "net_30",
      billingAddress: account?.billingAddress || ""
    }
  });

  const createAccountMutation = useMutation({
    mutationFn: async (data: AccountFormData) => {
      if (account) {
        return await apiRequest("PUT", `/api/accounts/${account.id}`, data);
      }
      return await apiRequest("POST", "/api/accounts", data);
    },
    onSuccess: () => {
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || `Failed to ${account ? 'update' : 'create'} account. Please try again.`,
        variant: "destructive",
      });
    }
  });

  const onSubmit = (data: AccountFormData) => {
    // Auto-generate name from firstName and lastName if not provided
    const submissionData = {
      ...data,
      name: data.name || `${data.firstName} ${data.lastName}`.trim()
    };
    createAccountMutation.mutate(submissionData);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {!account && (
          <Alert className="bg-blue-50 border-blue-200">
            <Info className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800">
              <strong>Creating a new client</strong> for individual contacts or businesses. 
              Provide at minimum first name, last name, email, and phone.
            </AlertDescription>
          </Alert>
        )}
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="firstName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>First Name *</FormLabel>
                <FormControl>
                  <Input 
                    placeholder="John" 
                    {...field} 
                    data-testid="input-account-firstname"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="lastName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Last Name *</FormLabel>
                <FormControl>
                  <Input 
                    placeholder="Doe" 
                    {...field} 
                    data-testid="input-account-lastname"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="company"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Company Name</FormLabel>
                <FormControl>
                  <Input 
                    placeholder="ABC Construction" 
                    {...field} 
                    data-testid="input-account-company"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email *</FormLabel>
                <FormControl>
                  <Input 
                    type="email" 
                    placeholder="john@example.com" 
                    {...field} 
                    data-testid="input-account-email"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone *</FormLabel>
                <FormControl>
                  <Input 
                    placeholder="(555) 123-4567" 
                    {...field} 
                    data-testid="input-account-phone"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="accountType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Account Type *</FormLabel>
                <Select 
                  onValueChange={field.onChange} 
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger data-testid="select-account-type">
                      <SelectValue placeholder="Select account type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="homeowner">Homeowner</SelectItem>
                    <SelectItem value="general_contractor">General Contractor</SelectItem>
                    <SelectItem value="commercial">Commercial</SelectItem>
                    <SelectItem value="property_manager">Property Manager</SelectItem>
                    <SelectItem value="architect">Architect</SelectItem>
                    <SelectItem value="developer">Developer</SelectItem>
                    <SelectItem value="subcontractor">Subcontractor</SelectItem>
                    <SelectItem value="government">Government</SelectItem>
                    <SelectItem value="nonprofit">Nonprofit</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="paymentTerms"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Payment Terms</FormLabel>
                <Select 
                  onValueChange={field.onChange} 
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger data-testid="select-payment-terms">
                      <SelectValue placeholder="Select payment terms" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="due_on_receipt">Due on Receipt</SelectItem>
                    <SelectItem value="net_15">Net 15</SelectItem>
                    <SelectItem value="net_30">Net 30</SelectItem>
                    <SelectItem value="net_45">Net 45</SelectItem>
                    <SelectItem value="net_60">Net 60</SelectItem>
                    <SelectItem value="net_90">Net 90</SelectItem>
                    <SelectItem value="50_percent_down">50% Down, Balance Due on Completion</SelectItem>
                    <SelectItem value="progress_payments">Progress Payments</SelectItem>
                    <SelectItem value="2_10_net_30">2/10 Net 30 (2% discount if paid within 10 days)</SelectItem>
                    <SelectItem value="cog">COG (Cash on Delivery)</SelectItem>
                    <SelectItem value="prepaid">Prepaid</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="billingAddress"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Billing Address</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder="123 Main St, City, State ZIP" 
                  {...field} 
                  rows={3}
                  data-testid="textarea-billing-address"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-4">
          <Button 
            type="button" 
            variant="outline" 
            onClick={onCancel}
            data-testid="button-cancel-account"
          >
            Cancel
          </Button>
          <Button 
            type="submit" 
            disabled={createAccountMutation.isPending}
            data-testid="button-submit-account"
          >
            {createAccountMutation.isPending 
              ? (account ? "Updating..." : "Creating...") 
              : (account ? "Update Account" : "Create Account")
            }
          </Button>
        </div>
      </form>
    </Form>
  );
}