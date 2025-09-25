import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { insertContactSchema, type Contact, type InsertContact } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";

const contactFormSchema = insertContactSchema.extend({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().optional(),
  role: z.string().min(1, "Role is required"),
  isPrimary: z.boolean().default(false)
}).omit({ accountId: true });

type ContactFormData = z.infer<typeof contactFormSchema>;

interface ContactFormProps {
  accountId: number;
  contact?: Contact | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export function ContactForm({ accountId, contact, onSuccess, onCancel }: ContactFormProps) {
  const { toast } = useToast();
  
  const form = useForm<ContactFormData>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      firstName: contact?.firstName || "",
      lastName: contact?.lastName || "",
      email: contact?.email || "",
      phone: contact?.phone || "",
      role: contact?.role || "primary_contact",
      isPrimary: contact?.isPrimary || false
    }
  });

  const saveContactMutation = useMutation({
    mutationFn: async (data: ContactFormData) => {
      const payload = { ...data, accountId };
      if (contact) {
        return await apiRequest("PUT", `/api/contacts/${contact.id}`, payload);
      }
      return await apiRequest("POST", "/api/contacts", payload);
    },
    onSuccess: () => {
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || `Failed to ${contact ? 'update' : 'create'} contact. Please try again.`,
        variant: "destructive",
      });
    }
  });

  const onSubmit = (data: ContactFormData) => {
    saveContactMutation.mutate(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                    data-testid="input-contact-first-name"
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
                    data-testid="input-contact-last-name"
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
                    data-testid="input-contact-email"
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
                <FormLabel>Phone</FormLabel>
                <FormControl>
                  <Input 
                    placeholder="(555) 123-4567" 
                    {...field} 
                    data-testid="input-contact-phone"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="role"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Role *</FormLabel>
                <Select 
                  onValueChange={field.onChange} 
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger data-testid="select-contact-role">
                      <SelectValue placeholder="Select their role" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="primary_contact">Primary Contact</SelectItem>
                    <SelectItem value="project_manager">Project Manager</SelectItem>
                    <SelectItem value="accounting">Accounting</SelectItem>
                    <SelectItem value="decision_maker">Decision Maker</SelectItem>
                    <SelectItem value="technical_contact">Technical Contact</SelectItem>
                    <SelectItem value="superintendent">Superintendent</SelectItem>
                    <SelectItem value="owner">Owner</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="isPrimary"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">Primary Contact</FormLabel>
                  <div className="text-sm text-gray-500">
                    Mark this person as the main contact for the account
                  </div>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    data-testid="switch-contact-primary"
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>

        <div className="flex justify-end gap-4">
          <Button 
            type="button" 
            variant="outline" 
            onClick={onCancel}
            data-testid="button-cancel-contact"
          >
            Cancel
          </Button>
          <Button 
            type="submit" 
            disabled={saveContactMutation.isPending}
            data-testid="button-submit-contact"
          >
            {saveContactMutation.isPending 
              ? (contact ? "Updating..." : "Creating...") 
              : (contact ? "Update Contact" : "Create Contact")
            }
          </Button>
        </div>
      </form>
    </Form>
  );
}