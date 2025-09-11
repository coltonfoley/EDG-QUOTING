import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertQuoteSchema, insertCustomerSchema, type QuoteWithDetails } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Clock, Camera, Image, Wrench, Building } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { z } from "zod";
import { useEffect, useState } from "react";
import { ImageUploader, type UploadedImage } from "@/components/image-uploader";

const quoteFormSchema = insertQuoteSchema.extend({
  customerName: z.string().min(1, "Customer name is required"),
  customerEmail: z.string().email("Valid email is required"),
  customerPhone: z.string().min(1, "Phone number is required"),
  customerCompany: z.string().optional(),
  // Rich content fields are optional but can be longer text
  projectScope: z.string().optional(),
  timeline: z.string().optional(),
  companyOverview: z.string().optional(),
  technicalSpecs: z.string().optional(),
}).omit({ customerId: true });

type QuoteFormData = z.infer<typeof quoteFormSchema>;

interface QuoteHeaderProps {
  quote?: QuoteWithDetails;
  onSave: (data: QuoteFormData) => void;
  isLoading?: boolean;
}

export function QuoteHeader({ quote, onSave, isLoading }: QuoteHeaderProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State for managing image uploads
  const [projectImages, setProjectImages] = useState<UploadedImage[]>([]);
  const [portfolioImages, setPortfolioImages] = useState<UploadedImage[]>([]);
  const [technicalDiagrams, setTechnicalDiagrams] = useState<UploadedImage[]>([]);
  const [companyImages, setCompanyImages] = useState<UploadedImage[]>([]);
  
  const form = useForm<QuoteFormData>({
    resolver: zodResolver(quoteFormSchema),
    defaultValues: {
      quoteNumber: quote?.quoteNumber || "",
      projectName: quote?.projectName || "",
      projectAddress: quote?.projectAddress || "",
      estimatedStartDate: quote?.estimatedStartDate || "",
      notes: quote?.notes || "",
      projectScope: quote?.projectScope || "",
      timeline: quote?.timeline || "",
      companyOverview: quote?.companyOverview || "",
      technicalSpecs: quote?.technicalSpecs || "",
      status: quote?.status || "draft",
      taxRate: quote?.taxRate || "0",
      discount: quote?.discount || "0",
      shipping: quote?.shipping || "0",
      customerName: quote?.customer?.name || "",
      customerEmail: quote?.customer?.email || "",
      customerPhone: quote?.customer?.phone || "",
      customerCompany: quote?.customer?.company || "",
    },
  });

  // Update form values when quote data changes
  useEffect(() => {
    if (quote) {
      form.reset({
        quoteNumber: quote.quoteNumber || "",
        projectName: quote.projectName || "",
        projectAddress: quote.projectAddress || "",
        estimatedStartDate: quote.estimatedStartDate || "",
        notes: quote.notes || "",
        projectScope: quote.projectScope || "",
        timeline: quote.timeline || "",
        companyOverview: quote.companyOverview || "",
        technicalSpecs: quote.technicalSpecs || "",
        status: quote.status || "draft",
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

  const updateStatusMutation = useMutation({
    mutationFn: async ({ status }: { status: string }) => {
      if (!quote?.id) throw new Error("No quote ID");
      const response = await apiRequest('PUT', `/api/quotes/${quote.id}`, { status });
      return response.json();
    },
    onSuccess: (updatedQuote, variables) => {
      // Update form state to match the new status
      form.setValue("status", variables.status);
      toast({ title: "Quote status updated successfully" });
      queryClient.invalidateQueries({ queryKey: [`/api/quotes/${quote?.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Error", 
        description: "Failed to update quote status", 
        variant: "destructive" 
      });
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "draft":
        return "bg-yellow-100 text-yellow-800";
      case "sent":
        return "bg-blue-100 text-blue-800";
      case "approved":
        return "bg-green-100 text-green-800";
      case "rejected":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const handleSubmit = (data: QuoteFormData) => {
    // Convert uploaded images to the expected format for the database
    const imageData = {
      ...data,
      projectImages: projectImages.filter(img => img.uploaded).map(img => ({
        url: img.url || '',
        filename: img.metadata.filename || '',
        caption: img.metadata.caption || '',
        altText: img.metadata.altText || '',
        uploadedAt: img.metadata.uploadedAt || new Date().toISOString(),
        size: img.metadata.size,
        thumbnailUrl: img.metadata.thumbnailUrl,
        category: (img.metadata as any).category || 'other',
      })),
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
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium text-gray-700">Status:</span>
                <Select
                  value={quote.status}
                  onValueChange={(value) => {
                    updateStatusMutation.mutate({ status: value });
                  }}
                  disabled={updateStatusMutation.isPending}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="sent">Sent</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button 
              type="submit" 
              form="quote-form" 
              className="bg-edg-black hover:bg-edg-grey text-edg-white"
              disabled={isLoading}
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
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h3 className="text-lg font-semibold text-charcoal mb-3">Customer Information</h3>
                <div className="space-y-3">
                  <FormField
                    control={form.control}
                    name="customerName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Customer Name</FormLabel>
                        <FormControl>
                          <Input {...field} />
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
                          <Input type="email" {...field} />
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
                          <Input type="tel" {...field} />
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
                          <Input placeholder="Company name" {...field} />
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
            
            {/* Enhanced Content Section */}
            <div className="mt-6 pt-6 border-t border-gray-200">
              <h3 className="text-lg font-semibold text-charcoal mb-4">Enhanced Content (Optional)</h3>
              <p className="text-sm text-accent-grey mb-4">Add rich content for comprehensive proposals and detailed templates.</p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="projectScope"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Project Scope & Description</FormLabel>
                        <FormControl>
                          <Textarea 
                            rows={4} 
                            placeholder="Detailed project description, objectives, and scope of work..." 
                            {...field} 
                            value={field.value || ""} 
                            data-testid="textarea-project-scope"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="timeline"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Project Timeline & Milestones</FormLabel>
                        <FormControl>
                          <Textarea 
                            rows={4} 
                            placeholder="Project timeline, key milestones, and delivery schedule..." 
                            {...field} 
                            value={field.value || ""} 
                            data-testid="textarea-timeline"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="companyOverview"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company Overview & Credentials</FormLabel>
                        <FormControl>
                          <Textarea 
                            rows={4} 
                            placeholder="Company background, credentials, relevant experience, and qualifications..." 
                            {...field} 
                            value={field.value || ""} 
                            data-testid="textarea-company-overview"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="technicalSpecs"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Technical Specifications</FormLabel>
                        <FormControl>
                          <Textarea 
                            rows={4} 
                            placeholder="Technical specifications, methodology, materials, and implementation details..." 
                            {...field} 
                            value={field.value || ""} 
                            data-testid="textarea-technical-specs"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </div>

            {/* Image Assets Section */}
            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-charcoal mb-2 flex items-center gap-2">
                  <Camera className="h-5 w-5" />
                  Image Assets
                </h3>
                <p className="text-sm text-accent-grey">
                  Upload and manage images to enhance your proposals. Images will be stored securely and included in generated documents.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Project Images */}
                <div className="space-y-4">
                  <ImageUploader
                    imageType="project"
                    title="Project Photos"
                    description="Before, during, and after photos of project work"
                    maxFiles={15}
                    onImagesChange={setProjectImages}
                    initialImages={projectImages}
                    categoryOptions={[
                      { value: 'before', label: 'Before Photos' },
                      { value: 'during', label: 'During Construction' },
                      { value: 'after', label: 'After Completion' },
                      { value: 'other', label: 'Other' }
                    ]}
                    data-testid="uploader-project-images"
                  />

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
              <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <h4 className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-2">Image Summary</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600 dark:text-gray-400">
                  <div className="flex items-center gap-2">
                    <Camera className="h-4 w-4" />
                    <span>Project: {projectImages.filter(img => img.uploaded).length}</span>
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
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
