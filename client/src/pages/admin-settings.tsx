import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { LoadingSpinner } from "@/components/loading-spinner";
import { AlertCircle, Building2, Palette, Upload, Save, Check } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { apiRequest } from "@/lib/queryClient";
import type { CompanySettings } from "@shared/schema";

// Company settings form schema
const companySettingsSchema = z.object({
  companyName: z.string().min(1, "Company name is required").max(255, "Company name is too long"),
  address: z.string().max(1000, "Address is too long").optional(),
  phone: z.string()
    .max(20, "Phone number is too long")
    .regex(/^[\d\s\-\+\(\)]*$/, "Phone number contains invalid characters")
    .optional(),
  email: z.string().email("Invalid email format").max(255, "Email is too long").optional(),
  website: z.string().url("Must be a valid URL").max(255, "Website URL is too long").optional(),
  logo: z.string().max(500, "Logo path is too long").optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex color"),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex color"),
  textColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex color"),
});

type CompanySettingsForm = z.infer<typeof companySettingsSchema>;

// Color picker component
function ColorPicker({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  return (
    <div className="flex items-center space-x-3">
      <div 
        className="w-8 h-8 rounded border border-gray-300 cursor-pointer shadow-sm"
        style={{ backgroundColor: value }}
        onClick={() => {
          const input = document.createElement('input');
          input.type = 'color';
          input.value = value;
          input.onchange = (e) => onChange((e.target as HTMLInputElement).value);
          input.click();
        }}
        data-testid={`color-picker-${label.toLowerCase().replace(' ', '-')}`}
      />
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="#000000"
        className="w-24 font-mono text-sm"
        data-testid={`input-${label.toLowerCase().replace(' ', '-')}-color`}
      />
      <span className="text-sm text-gray-600">{label}</span>
    </div>
  );
}

// Logo upload component
function LogoUpload({ value, onChange }: { value?: string; onChange: (value: string) => void }) {
  const [uploading, setUploading] = useState(false);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      // For now, we'll just use the filename as a placeholder
      // In a real implementation, you'd upload to object storage
      const mockUrl = `/assets/logos/${file.name}`;
      onChange(mockUrl);
    } catch (error) {
      console.error("Error uploading logo:", error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => document.getElementById('logo-upload')?.click()}
          disabled={uploading}
          data-testid="button-upload-logo"
        >
          <Upload className="h-4 w-4 mr-2" />
          {uploading ? "Uploading..." : "Upload Logo"}
        </Button>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange("")}
            data-testid="button-remove-logo"
          >
            Remove
          </Button>
        )}
      </div>
      
      <input
        id="logo-upload"
        type="file"
        accept="image/*"
        onChange={handleFileUpload}
        className="hidden"
        data-testid="input-logo-file"
      />
      
      {value && (
        <div className="border rounded-lg p-4 bg-gray-50">
          <p className="text-sm text-gray-600 mb-2">Current logo:</p>
          <div className="flex items-center space-x-2">
            <Badge variant="secondary" data-testid="badge-current-logo">
              {value.split('/').pop() || value}
            </Badge>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Fetch current company settings
  const { data: settings, isLoading, error } = useQuery<CompanySettings>({
    queryKey: ['/api/company-settings'],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Form setup
  const form = useForm<CompanySettingsForm>({
    resolver: zodResolver(companySettingsSchema),
    defaultValues: {
      companyName: "",
      address: "",
      phone: "",
      email: "",
      website: "",
      logo: "",
      primaryColor: "#3b82f6",
      accentColor: "#10b981",
      textColor: "#374151",
    },
    values: settings ? {
      companyName: settings.companyName || "",
      address: settings.address || "",
      phone: settings.phone || "",
      email: settings.email || "",
      website: settings.website || "",
      logo: settings.logo || "",
      primaryColor: settings.primaryColor || "#3b82f6",
      accentColor: settings.accentColor || "#10b981",
      textColor: settings.textColor || "#374151",
    } : undefined,
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data: CompanySettingsForm) => 
      apiRequest('PUT', '/api/company-settings', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/company-settings'] });
      toast({
        title: "Settings Updated",
        description: "Company settings have been saved successfully.",
      });
    },
    onError: (error: any) => {
      console.error("Error updating settings:", error);
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update company settings.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CompanySettingsForm) => {
    updateMutation.mutate(data);
  };

  if (isLoading) {
    return <LoadingSpinner fullScreen text="Loading company settings..." />;
  }

  if (error) {
    return (
      <div className="container mx-auto py-8">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load company settings. Please try refreshing the page.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900" data-testid="heading-company-settings">
          Company Settings
        </h1>
        <p className="text-gray-600 mt-2">
          Manage your company information and branding for PDF generation
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          {/* Company Information Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Building2 className="h-5 w-5 mr-2" />
                Company Information
              </CardTitle>
              <CardDescription>
                Basic company details that will appear on quotes and proposals
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="companyName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company Name *</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Enter company name" 
                        {...field} 
                        data-testid="input-company-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Enter company address"
                        className="min-h-[80px]"
                        {...field}
                        data-testid="textarea-address"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                          data-testid="input-phone"
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
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input 
                          type="email"
                          placeholder="contact@company.com" 
                          {...field} 
                          data-testid="input-email"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="website"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Website</FormLabel>
                    <FormControl>
                      <Input 
                        type="url"
                        placeholder="https://www.company.com" 
                        {...field} 
                        data-testid="input-website"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Logo Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Upload className="h-5 w-5 mr-2" />
                Company Logo
              </CardTitle>
              <CardDescription>
                Upload your company logo for use in PDF documents
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="logo"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <LogoUpload 
                        value={field.value} 
                        onChange={field.onChange} 
                      />
                    </FormControl>
                    <FormDescription>
                      Recommended: PNG or JPG format, max 2MB, minimum 200x100px
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Branding Colors Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Palette className="h-5 w-5 mr-2" />
                Branding Colors
              </CardTitle>
              <CardDescription>
                Choose colors that will be used throughout your PDF templates
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="primaryColor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Primary Color</FormLabel>
                    <FormControl>
                      <ColorPicker
                        value={field.value}
                        onChange={field.onChange}
                        label="Used for headers and main elements"
                      />
                    </FormControl>
                    <FormDescription>
                      Main brand color used for headers and primary elements
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="accentColor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Accent Color</FormLabel>
                    <FormControl>
                      <ColorPicker
                        value={field.value}
                        onChange={field.onChange}
                        label="Used for highlights and accents"
                      />
                    </FormControl>
                    <FormDescription>
                      Secondary color used for highlights and accent elements
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="textColor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Text Color</FormLabel>
                    <FormControl>
                      <ColorPicker
                        value={field.value}
                        onChange={field.onChange}
                        label="Used for body text"
                      />
                    </FormControl>
                    <FormDescription>
                      Default color for body text and content
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Separator />

          {/* Save Button */}
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={updateMutation.isPending}
              className="min-w-[120px]"
              data-testid="button-save-settings"
            >
              {updateMutation.isPending ? (
                <>
                  <LoadingSpinner className="mr-2 h-4 w-4" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Settings
                </>
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}