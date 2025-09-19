import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { 
  Plus, 
  Edit, 
  Trash2, 
  Eye, 
  FileText, 
  Settings, 
  Palette, 
  Layout, 
  Star, 
  StarOff, 
  CheckCircle, 
  XCircle,
  Copy,
  Download,
  User as UserIcon
} from "lucide-react";
import { z } from "zod";
import type { ProposalTemplate, TemplateSection, BrandingSettings, LayoutSettings, DefaultContent } from "@shared/schema";
import { insertProposalTemplateSchema, getPreferredProductCategory, isManufacturerPreferred } from "@shared/schema";

// Form validation schema
const templateFormSchema = insertProposalTemplateSchema.extend({
  sections: z.array(z.object({
    id: z.string(),
    name: z.string(),
    order: z.number(),
    required: z.boolean(),
    defaultContent: z.string().optional()
  })),
  brandingSettings: z.object({
    primaryColor: z.string(),
    accentColor: z.string(),
    textColor: z.string(),
    backgroundColor: z.string(),
    logoSize: z.enum(['small', 'medium', 'large']),
    headerStyle: z.enum(['minimal', 'standard', 'formal']),
    footerStyle: z.enum(['minimal', 'standard', 'detailed'])
  }),
  layoutSettings: z.object({
    pageSize: z.enum(['A4', 'letter']),
    margins: z.object({
      top: z.number(),
      bottom: z.number(),
      left: z.number(),
      right: z.number()
    }),
    spacing: z.object({
      sectionGap: z.number(),
      paragraphGap: z.number()
    }),
    pageBreaks: z.object({
      beforeSections: z.array(z.string()),
      avoidBreakInSections: z.array(z.string())
    })
  }),
  defaultContent: z.object({
    companyDescription: z.string().optional(),
    projectScope: z.string().optional(),
    timeline: z.string().optional(),
    credentials: z.string().optional(),
    warranty: z.string().optional(),
    paymentTerms: z.string().optional(),
    additionalTerms: z.string().optional()
  })
});

type TemplateFormData = z.infer<typeof templateFormSchema>;

// Default template configuration
const getDefaultTemplateConfig = (manufacturer: string): Partial<TemplateFormData> => ({
  sections: [
    { id: 'header', name: 'Header & Company Info', order: 1, required: true, defaultContent: '' },
    { id: 'customer', name: 'Customer Information', order: 2, required: true, defaultContent: '' },
    { id: 'project', name: 'Project Details', order: 3, required: true, defaultContent: '' },
    { id: 'scope', name: 'Project Scope', order: 4, required: false, defaultContent: '' },
    { id: 'timeline', name: 'Timeline & Schedule', order: 5, required: false, defaultContent: '' },
    { id: 'lineItems', name: 'Products & Services', order: 6, required: true, defaultContent: '' },
    { id: 'totals', name: 'Pricing Summary', order: 7, required: true, defaultContent: '' },
    { id: 'terms', name: 'Terms & Conditions', order: 8, required: false, defaultContent: '' },
    { id: 'signature', name: 'Signature Block', order: 9, required: false, defaultContent: '' }
  ],
  brandingSettings: {
    primaryColor: '#1f2937',
    accentColor: '#3b82f6',
    textColor: '#374151',
    backgroundColor: '#ffffff',
    logoSize: 'medium' as const,
    headerStyle: 'standard' as const,
    footerStyle: 'standard' as const
  },
  layoutSettings: {
    pageSize: 'A4' as const,
    margins: { top: 20, bottom: 20, left: 15, right: 15 },
    spacing: { sectionGap: 16, paragraphGap: 8 },
    pageBreaks: { beforeSections: [], avoidBreakInSections: ['totals', 'signature'] }
  },
  defaultContent: {
    companyDescription: 'Professional services provider delivering exceptional results.',
    projectScope: 'Comprehensive project scope will be defined based on your specific requirements.',
    timeline: 'Project timeline will be established upon contract execution.',
    credentials: 'Our team brings years of experience and proven expertise.',
    warranty: 'All work is backed by our comprehensive warranty program.',
    paymentTerms: 'Payment terms: Net 30 days from invoice date.',
    additionalTerms: 'Additional terms and conditions apply as outlined in our service agreement.'
  }
});

export default function AdminTemplatesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ProposalTemplate | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<ProposalTemplate | null>(null);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);

  // Check admin access
  if (!user || user.role !== "admin") {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <div className="max-w-4xl mx-auto px-4 py-8">
          <Card>
            <CardContent className="text-center py-12">
              <Settings className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
              <p className="text-gray-600">You need administrator privileges to access template management.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const { data: templates = [], isLoading } = useQuery<ProposalTemplate[]>({
    queryKey: ["/api/proposal-templates", { includeInactive: true }],
    queryFn: async () => {
      const response = await fetch("/api/proposal-templates?includeInactive=true");
      if (!response.ok) throw new Error("Failed to fetch templates");
      return response.json();
    }
  });

  const templateForm = useForm<TemplateFormData>({
    resolver: zodResolver(templateFormSchema),
    defaultValues: {
      name: "",
      description: "",
      category: "basic_quote",
      templateType: "pdf",
      isActive: true,
      isDefault: false,
      ...getDefaultTemplateConfig("default")
    }
  });

  const createTemplateMutation = useMutation({
    mutationFn: async (data: TemplateFormData) => {
      const response = await apiRequest("POST", "/api/proposal-templates", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposal-templates"] });
      toast({ title: "Template created successfully" });
      setShowCreateDialog(false);
      templateForm.reset();
    },
    onError: (error: Error) => {
      toast({ 
        title: "Error", 
        description: error.message, 
        variant: "destructive" 
      });
    }
  });

  const updateTemplateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<TemplateFormData> }) => {
      const response = await apiRequest("PUT", `/api/proposal-templates/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposal-templates"] });
      toast({ title: "Template updated successfully" });
      setShowEditDialog(false);
      setEditingTemplate(null);
    },
    onError: (error: Error) => {
      toast({ 
        title: "Error", 
        description: error.message, 
        variant: "destructive" 
      });
    }
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (templateId: number) => {
      await apiRequest("DELETE", `/api/proposal-templates/${templateId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposal-templates"] });
      toast({ title: "Template deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Error", 
        description: error.message, 
        variant: "destructive" 
      });
    }
  });

  const toggleTemplateMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const response = await apiRequest("PUT", `/api/proposal-templates/${id}`, { isActive });
      return response.json();
    },
    onSuccess: (_, { isActive }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposal-templates"] });
      toast({ title: isActive ? "Template activated" : "Template deactivated" });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Error", 
        description: error.message, 
        variant: "destructive" 
      });
    }
  });

  const setDefaultMutation = useMutation({
    mutationFn: async ({ id, isDefault }: { id: number; isDefault: boolean }) => {
      const response = await apiRequest("PUT", `/api/proposal-templates/${id}`, { isDefault });
      return response.json();
    },
    onSuccess: (_, { isDefault }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposal-templates"] });
      toast({ title: isDefault ? "Template set as default" : "Template default status removed" });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Error", 
        description: error.message, 
        variant: "destructive" 
      });
    }
  });

  const duplicateTemplateMutation = useMutation({
    mutationFn: async (template: ProposalTemplate) => {
      const duplicateData = {
        ...template,
        name: `${template.name} (Copy)`,
        isDefault: false
      };
      delete (duplicateData as any).id;
      delete (duplicateData as any).createdAt;
      delete (duplicateData as any).updatedAt;
      
      const response = await apiRequest("POST", "/api/proposal-templates", duplicateData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposal-templates"] });
      toast({ title: "Template duplicated successfully" });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Error", 
        description: error.message, 
        variant: "destructive" 
      });
    }
  });

  const handleCreateTemplate = (data: TemplateFormData) => {
    createTemplateMutation.mutate(data);
  };

  const handleEditTemplate = (data: TemplateFormData) => {
    if (editingTemplate) {
      updateTemplateMutation.mutate({ id: editingTemplate.id, data });
    }
  };

  const openEditDialog = (template: ProposalTemplate) => {
    setEditingTemplate(template);
    templateForm.reset({
      name: template.name,
      description: template.description || "",
      category: template.category as any,
      templateType: template.templateType as any,
      isActive: template.isActive ?? true,
      isDefault: template.isDefault ?? false,
      sections: (template.sections as TemplateSection[]) || getDefaultTemplateConfig(template.category || "default").sections!,
      brandingSettings: (template.brandingSettings as BrandingSettings) || getDefaultTemplateConfig(template.category || "default").brandingSettings!,
      layoutSettings: (template.layoutSettings as LayoutSettings) || getDefaultTemplateConfig(template.category || "default").layoutSettings!,
      defaultContent: (template.defaultContent as DefaultContent) || getDefaultTemplateConfig(template.category || "default").defaultContent!
    });
    setShowEditDialog(true);
  };

  const handleDeleteTemplate = (templateId: number) => {
    if (confirm("Are you sure you want to delete this template? This action cannot be undone.")) {
      deleteTemplateMutation.mutate(templateId);
    }
  };

  const getCategoryBadgeColor = (category: string) => {
    const colors = {
      basic_quote: 'bg-blue-100 text-blue-800',
      full_proposal: 'bg-green-100 text-green-800',
      executive_summary: 'bg-purple-100 text-purple-800',
      technical_spec: 'bg-orange-100 text-orange-800'
    };
    return colors[category as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const getCategoryLabel = (category: string) => {
    const labels = {
      basic_quote: 'Basic Quote',
      full_proposal: 'Full Proposal',
      executive_summary: 'Executive Summary', 
      technical_spec: 'Technical Specification'
    };
    return labels[category as keyof typeof labels] || category;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Administration</h1>
          <p className="text-gray-600">Manage system settings, users, and templates</p>
          
          {/* Admin Navigation Tabs */}
          <div className="flex space-x-1 mt-6 border-b">
            <Link 
              href="/admin"
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-edg-black hover:border-b-2 hover:border-gray-300 transition-colors"
              data-testid="link-admin-users"
            >
              <UserIcon className="inline mr-2 h-4 w-4" />
              Users & Access
            </Link>
            <button 
              className="px-4 py-2 text-sm font-medium text-edg-black border-b-2 border-edg-black bg-white"
              data-testid="button-admin-templates-active"
            >
              <FileText className="inline mr-2 h-4 w-4" />
              Templates
            </button>
            <Link 
              href="/admin/contracts"
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-edg-black hover:border-b-2 hover:border-gray-300 transition-colors"
              data-testid="link-admin-contracts"
            >
              <Settings className="inline mr-2 h-4 w-4" />
              Contracts
            </Link>
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Templates ({templates.length})
            </CardTitle>
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogTrigger asChild>
                <Button data-testid="button-create-template" className="bg-edg-black hover:bg-edg-grey text-white">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Template
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create New Template</DialogTitle>
                </DialogHeader>
                <TemplateForm
                  form={templateForm}
                  onSubmit={handleCreateTemplate}
                  isSubmitting={createTemplateMutation.isPending}
                  submitLabel="Create Template"
                />
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">Loading templates...</div>
            ) : templates.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No Templates Found</h3>
                <p className="text-gray-600 mb-4">Create your first proposal template to get started</p>
                <Button onClick={() => setShowCreateDialog(true)} className="bg-edg-black hover:bg-edg-grey text-white">
                  <Plus className="mr-2 h-4 w-4" />
                  Create First Template
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead data-testid="header-manufacturer">Manufacturer</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Default</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((template) => (
                    <TableRow key={template.id} data-testid={`row-template-${template.id}`}>
                      <TableCell>
                        <div>
                          <div className="font-medium" data-testid={`text-template-name-${template.id}`}>{template.name}</div>
                          {template.description && (
                            <div className="text-sm text-gray-500 max-w-xs truncate">{template.description}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getCategoryBadgeColor(template.category)} data-testid={`badge-category-${template.id}`}>
                          {getCategoryLabel(template.category)}
                        </Badge>
                      </TableCell>
                      <TableCell data-testid={`text-type-${template.id}`}>
                        {template.templateType.toUpperCase()}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {template.isActive ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <XCircle className="h-4 w-4 text-gray-400" />
                          )}
                          <span className={template.isActive ? 'text-green-600' : 'text-gray-400'} data-testid={`status-${template.id}`}>
                            {template.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {template.isDefault && (
                          <Star className="h-4 w-4 text-yellow-500 fill-current" data-testid={`star-default-${template.id}`} />
                        )}
                      </TableCell>
                      <TableCell data-testid={`text-created-${template.id}`}>
                        {template.createdAt ? new Date(template.createdAt).toLocaleDateString() : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setPreviewTemplate(template);
                              setShowPreviewDialog(true);
                            }}
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            data-testid={`button-preview-${template.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => duplicateTemplateMutation.mutate(template)}
                            className="text-green-600 hover:text-green-700 hover:bg-green-50"
                            data-testid={`button-duplicate-${template.id}`}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(template)}
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            data-testid={`button-edit-${template.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleTemplateMutation.mutate({ 
                              id: template.id, 
                              isActive: !template.isActive 
                            })}
                            className={template.isActive 
                              ? "text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                              : "text-green-600 hover:text-green-700 hover:bg-green-50"
                            }
                            data-testid={`button-toggle-${template.id}`}
                          >
                            {template.isActive ? <XCircle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDefaultMutation.mutate({ 
                              id: template.id, 
                              isDefault: !template.isDefault 
                            })}
                            className="text-yellow-600 hover:text-yellow-700 hover:bg-yellow-50"
                            data-testid={`button-star-${template.id}`}
                          >
                            {template.isDefault ? <Star className="h-4 w-4 fill-current" /> : <StarOff className="h-4 w-4" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteTemplate(template.id)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            data-testid={`button-delete-${template.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Edit Template Dialog */}
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Template</DialogTitle>
            </DialogHeader>
            <TemplateForm
              form={templateForm}
              onSubmit={handleEditTemplate}
              isSubmitting={updateTemplateMutation.isPending}
              submitLabel="Update Template"
            />
          </DialogContent>
        </Dialog>

        {/* Template Preview Dialog */}
        <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
          <DialogContent className="max-w-5xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>Template Preview</DialogTitle>
            </DialogHeader>
            <div className="overflow-y-auto max-h-[75vh]">
              {previewTemplate && <TemplatePreview template={previewTemplate} />}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

// Template Form Component
function TemplateForm({ 
  form, 
  onSubmit, 
  isSubmitting, 
  submitLabel 
}: {
  form: any;
  onSubmit: (data: TemplateFormData) => void;
  isSubmitting: boolean;
  submitLabel: string;
}) {
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="basic">Basic Info</TabsTrigger>
            <TabsTrigger value="sections">Sections</TabsTrigger>
            <TabsTrigger value="branding">Branding</TabsTrigger>
            <TabsTrigger value="layout">Layout</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Template Name *</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-template-name" placeholder="Enter template name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-category">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="basic_quote">Basic Quote</SelectItem>
                        <SelectItem value="full_proposal">Full Proposal</SelectItem>
                        <SelectItem value="executive_summary">Executive Summary</SelectItem>
                        <SelectItem value="technical_spec">Technical Specification</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea 
                      {...field} 
                      data-testid="textarea-description"
                      placeholder="Describe when and how to use this template"
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="templateType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Output Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-template-type">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="pdf">PDF</SelectItem>
                        <SelectItem value="html">HTML</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Active</FormLabel>
                      <div className="text-sm text-muted-foreground">
                        Available for use
                      </div>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-active"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isDefault"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Default</FormLabel>
                      <div className="text-sm text-muted-foreground">
                        Default for category
                      </div>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-default"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            {/* Default Content */}
            <div className="space-y-4">
              <Separator />
              <h3 className="text-lg font-medium">Default Content</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="defaultContent.companyDescription"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company Description</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={3} data-testid="textarea-company-description" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="defaultContent.projectScope"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Project Scope Template</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={3} data-testid="textarea-project-scope" />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="defaultContent.warranty"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Warranty Information</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={2} data-testid="textarea-warranty" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="defaultContent.paymentTerms"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Payment Terms</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={2} data-testid="textarea-payment-terms" />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="sections" className="space-y-4">
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Template Sections</h3>
              <p className="text-sm text-gray-600">Configure which sections appear in this template and their order.</p>
              
              {form.watch("sections")?.map((section: any, index: number) => (
                <Card key={section.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="text-sm font-medium">{section.order}</div>
                      <div>
                        <div className="font-medium">{section.name}</div>
                        <div className="text-sm text-gray-500">Section ID: {section.id}</div>
                      </div>
                    </div>
                    <FormField
                      control={form.control}
                      name={`sections.${index}.required`}
                      render={({ field }) => (
                        <FormItem className="flex items-center space-x-2">
                          <FormLabel className="text-sm">Required</FormLabel>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid={`switch-required-${section.id}`}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="branding" className="space-y-4">
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Branding & Visual Settings</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="brandingSettings.primaryColor"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Primary Color</FormLabel>
                      <div className="flex gap-2">
                        <FormControl>
                          <Input {...field} type="color" className="w-16 h-10" data-testid="input-primary-color" />
                        </FormControl>
                        <Input value={field.value} onChange={field.onChange} className="flex-1" data-testid="input-primary-color-hex" />
                      </div>
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="brandingSettings.accentColor"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Accent Color</FormLabel>
                      <div className="flex gap-2">
                        <FormControl>
                          <Input {...field} type="color" className="w-16 h-10" data-testid="input-accent-color" />
                        </FormControl>
                        <Input value={field.value} onChange={field.onChange} className="flex-1" data-testid="input-accent-color-hex" />
                      </div>
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="brandingSettings.logoSize"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Logo Size</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-logo-size">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="small">Small</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="large">Large</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="brandingSettings.headerStyle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Header Style</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-header-style">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="minimal">Minimal</SelectItem>
                          <SelectItem value="standard">Standard</SelectItem>
                          <SelectItem value="formal">Formal</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="brandingSettings.footerStyle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Footer Style</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-footer-style">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="minimal">Minimal</SelectItem>
                          <SelectItem value="standard">Standard</SelectItem>
                          <SelectItem value="detailed">Detailed</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="layout" className="space-y-4">
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Layout & Formatting</h3>
              
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="layoutSettings.pageSize"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Page Size</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-page-size">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="A4">A4</SelectItem>
                            <SelectItem value="letter">Letter</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                  
                  <div className="space-y-2">
                    <Label>Page Margins (mm)</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <FormField
                        control={form.control}
                        name="layoutSettings.margins.top"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Top</FormLabel>
                            <FormControl>
                              <Input 
                                {...field} 
                                type="number" 
                                onChange={(e) => field.onChange(Number(e.target.value))}
                                data-testid="input-margin-top"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="layoutSettings.margins.bottom"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Bottom</FormLabel>
                            <FormControl>
                              <Input 
                                {...field} 
                                type="number" 
                                onChange={(e) => field.onChange(Number(e.target.value))}
                                data-testid="input-margin-bottom"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="layoutSettings.margins.left"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Left</FormLabel>
                            <FormControl>
                              <Input 
                                {...field} 
                                type="number" 
                                onChange={(e) => field.onChange(Number(e.target.value))}
                                data-testid="input-margin-left"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="layoutSettings.margins.right"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Right</FormLabel>
                            <FormControl>
                              <Input 
                                {...field} 
                                type="number" 
                                onChange={(e) => field.onChange(Number(e.target.value))}
                                data-testid="input-margin-right"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Spacing (px)</Label>
                    <div className="space-y-2">
                      <FormField
                        control={form.control}
                        name="layoutSettings.spacing.sectionGap"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Section Gap</FormLabel>
                            <FormControl>
                              <Input 
                                {...field} 
                                type="number" 
                                onChange={(e) => field.onChange(Number(e.target.value))}
                                data-testid="input-section-gap"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="layoutSettings.spacing.paragraphGap"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Paragraph Gap</FormLabel>
                            <FormControl>
                              <Input 
                                {...field} 
                                type="number" 
                                onChange={(e) => field.onChange(Number(e.target.value))}
                                data-testid="input-paragraph-gap"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={() => {}}>
            Cancel
          </Button>
          <Button 
            type="submit" 
            disabled={isSubmitting}
            className="bg-edg-black hover:bg-edg-grey text-white"
            data-testid="button-submit-template"
          >
            {isSubmitting ? "Saving..." : submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  );
}

// Template Preview Component
function TemplatePreview({ template }: { template: ProposalTemplate }) {
  const branding = template.brandingSettings as BrandingSettings;
  const content = template.defaultContent as DefaultContent;
  
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold">{template.name} Preview</h3>
        <p className="text-sm text-gray-600">{getCategoryLabel(template.category)} • {template.templateType.toUpperCase()}</p>
      </div>
      
      {/* Mock preview based on template configuration */}
      <div 
        className="border rounded-lg p-6 bg-white" 
        style={{ 
          borderColor: branding.primaryColor,
          color: branding.textColor 
        }}
      >
        <div className="mb-6" style={{ borderBottomColor: branding.accentColor }}>
          <h1 className="text-2xl font-bold mb-2" style={{ color: branding.accentColor }}>
            Your Company Name
          </h1>
          <div className="text-sm space-y-1 pb-4 border-b-2">
            <div>123 Business Street, City, State 12345</div>
            <div>Phone: (555) 123-4567 | Email: info@company.com</div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold mb-2" style={{ color: branding.accentColor }}>
              Project Information
            </h2>
            <div className="text-sm space-y-1">
              <div><strong>Project:</strong> Sample Project Name</div>
              <div><strong>Customer:</strong> John Smith</div>
              <div><strong>Date:</strong> {new Date().toLocaleDateString()}</div>
            </div>
          </div>

          {content.projectScope && (
            <div>
              <h3 className="font-semibold mb-1" style={{ color: branding.accentColor }}>Project Scope</h3>
              <p className="text-sm">{content.projectScope}</p>
            </div>
          )}

          {content.companyDescription && (
            <div>
              <h3 className="font-semibold mb-1" style={{ color: branding.accentColor }}>About Us</h3>
              <p className="text-sm">{content.companyDescription}</p>
            </div>
          )}

          <div>
            <h3 className="font-semibold mb-2" style={{ color: branding.accentColor }}>Products & Services</h3>
            <div className="border rounded p-3 text-sm">
              <div className="flex justify-between mb-1">
                <span>Sample Product 1</span>
                <span>$1,000.00</span>
              </div>
              <div className="flex justify-between mb-1">
                <span>Sample Product 2</span>
                <span>$500.00</span>
              </div>
              <div className="border-t pt-2 mt-2 flex justify-between font-semibold">
                <span>Total</span>
                <span>$1,500.00</span>
              </div>
            </div>
          </div>

          {(content.warranty || content.paymentTerms) && (
            <div>
              <h3 className="font-semibold mb-2" style={{ color: branding.accentColor }}>Terms & Conditions</h3>
              <div className="text-sm space-y-1">
                {content.warranty && <div><strong>Warranty:</strong> {content.warranty}</div>}
                {content.paymentTerms && <div><strong>Payment:</strong> {content.paymentTerms}</div>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function getCategoryLabel(category: string) {
  const labels = {
    basic_quote: 'Basic Quote',
    full_proposal: 'Full Proposal',
    executive_summary: 'Executive Summary', 
    technical_spec: 'Technical Specification'
  };
  return labels[category as keyof typeof labels] || category;
}