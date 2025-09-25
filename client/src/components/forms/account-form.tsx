import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { insertAccountSchema, type Account, type InsertAccount } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";

const accountFormSchema = insertAccountSchema.extend({
  name: z.string().min(1, "Name is required"),
  email: z.string().refine(
    (val) => val === "" || z.string().email().safeParse(val).success,
    "Invalid email format"
  ),
  phone: z.string().refine(
    (val) => val === "" || val.length >= 10,
    "Phone number must be at least 10 digits"
  ),
  company: z.string().optional(),
  accountType: z.enum(["homeowner", "general_contractor", "commercial"]),
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
      name: account?.name || "",
      email: account?.email || "",
      phone: account?.phone || "",
      company: account?.company || "",
      accountType: (account?.accountType as "homeowner" | "general_contractor" | "commercial") || "homeowner",
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
    createAccountMutation.mutate(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Company/Account Name *</FormLabel>
                <FormControl>
                  <Input 
                    placeholder="ABC Construction LLC" 
                    {...field} 
                    data-testid="input-account-name"
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
                <FormLabel>Doing Business As (Optional)</FormLabel>
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
                <FormLabel>Business Email (Optional)</FormLabel>
                <FormControl>
                  <Input 
                    type="email" 
                    placeholder="info@abcconstruction.com" 
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
                <FormLabel>Business Phone (Optional)</FormLabel>
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
                    <SelectItem value="net_60">Net 60</SelectItem>
                    <SelectItem value="net_90">Net 90</SelectItem>
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