import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm, SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertProjectSchema, type ProjectWithDetails } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Save, Clock, User, MapPin, Calendar, FileText, Building, Briefcase } from "lucide-react";
import { z } from "zod";

const projectFormSchema = insertProjectSchema.extend({
  customerName: z.string().min(1, "Customer name is required"),
  customerEmail: z.string().email("Valid email is required"),
  customerPhone: z.string().min(1, "Phone number is required"),
  customerCompany: z.string().optional().or(z.literal('')),
}).omit({ customerId: true, quoteId: true, projectNumber: true });

// Define the form data type explicitly to ensure proper typing
type ProjectFormData = {
  projectName?: string;
  projectAddress?: string;
  estimatedStartDate?: string;
  estimatedEndDate?: string;
  notes?: string;
  status: "pending" | "in_progress" | "completed" | "on_hold" | "cancelled";
  contractValue?: string | null;
  actualCost: string;
  completionPercentage: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerCompany?: string;
};

export default function ProjectBuilder() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const isNewProject = !id || id === "new";
  const projectId = id && id !== "new" ? parseInt(id) : undefined;
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: project, isLoading, error } = useQuery<ProjectWithDetails>({
    queryKey: [`/api/projects/${projectId}`],
    enabled: !isNewProject,
  });

  const form = useForm<ProjectFormData>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: {
      projectName: project?.projectName || "",
      projectAddress: project?.projectAddress || "",
      estimatedStartDate: project?.estimatedStartDate || "",
      estimatedEndDate: project?.estimatedEndDate || "",
      notes: project?.notes || "",
      status: (project?.status as ProjectFormData['status']) || "pending",
      contractValue: project?.contractValue || "",
      actualCost: project?.actualCost || "0",
      completionPercentage: project?.completionPercentage || "0",
      customerName: project?.customer?.name || "",
      customerEmail: project?.customer?.email || "",
      customerPhone: project?.customer?.phone || "",
      customerCompany: project?.customer?.company || "",
    },
  });

  // Reset form with project data when editing existing projects
  useEffect(() => {
    if (!isNewProject && project) {
      form.reset({
        projectName: project.projectName || "",
        projectAddress: project.projectAddress || "",
        estimatedStartDate: project.estimatedStartDate || "",
        estimatedEndDate: project.estimatedEndDate || "",
        notes: project.notes || "",
        status: (project.status as ProjectFormData['status']) || "pending",
        contractValue: project.contractValue || "",
        actualCost: project.actualCost || "0",
        completionPercentage: project.completionPercentage || "0",
        customerName: project.customer?.name || "",
        customerEmail: project.customer?.email || "",
        customerPhone: project.customer?.phone || "",
        customerCompany: project.customer?.company || "",
      });
    }
  }, [project, isNewProject, form]);

  const createProjectMutation = useMutation({
    mutationFn: async (data: ProjectFormData) => {
      // First create or get customer
      const customerResponse = await apiRequest("POST", "/api/customers", {
        name: data.customerName,
        email: data.customerEmail,
        phone: data.customerPhone,
        company: data.customerCompany || null,
      });
      const customer = await customerResponse.json();

      // Then create project - omit quoteId for standalone projects
      const projectData = {
        ...data,
        customerId: customer.id,
        // quoteId is omitted for standalone projects (nullable in schema)
      };
      delete (projectData as any).customerName;
      delete (projectData as any).customerEmail;
      delete (projectData as any).customerPhone;
      delete (projectData as any).customerCompany;

      const projectResponse = await apiRequest("POST", "/api/projects", projectData);
      return projectResponse.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Project created successfully" });
      // Navigate to the new project using wouter's navigate
      navigate(`/projects/${data.id}`, { replace: true });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create project", variant: "destructive" });
    },
  });

  const updateProjectMutation = useMutation({
    mutationFn: async (data: ProjectFormData) => {
      if (!projectId) throw new Error("No project ID");
      
      // Update customer first
      if (project?.customer) {
        await apiRequest("PUT", `/api/customers/${project.customer.id}`, {
          name: data.customerName,
          email: data.customerEmail,
          phone: data.customerPhone,
          company: data.customerCompany || null,
        });
      }

      // Update project
      const projectData = { ...data };
      delete (projectData as any).customerName;
      delete (projectData as any).customerEmail;
      delete (projectData as any).customerPhone;
      delete (projectData as any).customerCompany;

      const response = await apiRequest("PUT", `/api/projects/${projectId}`, projectData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Project updated successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update project", variant: "destructive" });
    },
  });

  const handleSubmit: SubmitHandler<ProjectFormData> = (data: ProjectFormData) => {
    if (isNewProject) {
      createProjectMutation.mutate(data);
    } else {
      updateProjectMutation.mutate(data);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      case "in_progress":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "completed":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "on_hold":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
      case "cancelled":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="space-y-6">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-96 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-red-600">Error loading project</h2>
            <p className="text-accent-grey mt-2">Please try again later.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-8 space-y-4 sm:space-y-0">
          <div>
            <h2 className="text-3xl font-bold text-edg-black dark:text-white">
              {isNewProject ? "Create New Project" : "Edit Project"}
            </h2>
            <p className="text-edg-grey dark:text-gray-400 mt-2">
              {isNewProject ? "Set up a new project with customer details and project information" : "Update project details and customer information"}
            </p>
          </div>
          {!isNewProject && project && (
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-sm text-edg-grey dark:text-gray-400">Project Number</p>
                <p className="text-lg font-semibold text-edg-black dark:text-white">{project.projectNumber}</p>
              </div>
              <Badge className={getStatusColor(project.status)}>
                {project.status.replace('_', ' ').toUpperCase()}
              </Badge>
            </div>
          )}
        </div>

        <Form {...form}>
          <form id="project-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">
            
            {/* Customer Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <User className="mr-2 h-5 w-5 text-edg-teal" />
                  Customer Information
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="customerName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Customer Name *</FormLabel>
                      <FormControl>
                        <Input data-testid="input-customer-name" placeholder="Enter customer name" {...field} />
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
                      <FormLabel>Email Address *</FormLabel>
                      <FormControl>
                        <Input data-testid="input-customer-email" type="email" placeholder="customer@example.com" {...field} />
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
                      <FormLabel>Phone Number *</FormLabel>
                      <FormControl>
                        <Input data-testid="input-customer-phone" placeholder="(555) 123-4567" {...field} />
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
                        <Input data-testid="input-customer-company" placeholder="Company name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Project Details */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Briefcase className="mr-2 h-5 w-5 text-edg-teal" />
                  Project Details
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="projectName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Project Name</FormLabel>
                      <FormControl>
                        <Input data-testid="input-project-name" placeholder="Enter project name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Project Status</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-project-status">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="in_progress">In Progress</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="on_hold">On Hold</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="projectAddress"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Project Address</FormLabel>
                      <FormControl>
                        <Input data-testid="input-project-address" placeholder="Enter project address" {...field} />
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
                        <Input data-testid="input-estimated-start-date" type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="estimatedEndDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Estimated End Date</FormLabel>
                      <FormControl>
                        <Input data-testid="input-estimated-end-date" type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="contractValue"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contract Value</FormLabel>
                      <FormControl>
                        <Input 
                          data-testid="input-contract-value" 
                          type="number" 
                          step="0.01" 
                          placeholder="0.00" 
                          {...field}
                          value={field.value || ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="completionPercentage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Completion Percentage</FormLabel>
                      <FormControl>
                        <Input data-testid="input-completion-percentage" type="number" min="0" max="100" placeholder="0" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Project Notes</FormLabel>
                      <FormControl>
                        <Textarea 
                          data-testid="textarea-project-notes"
                          placeholder="Enter any additional notes or special instructions for this project"
                          className="min-h-[100px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Save Button */}
            <div className="flex justify-end mt-8 pb-8">
              <Button 
                type="submit" 
                className="bg-edg-black hover:bg-edg-grey text-edg-white px-8 py-3 text-lg"
                disabled={createProjectMutation.isPending || updateProjectMutation.isPending}
                data-testid="button-save-project"
              >
                <Save className="mr-2 h-5 w-5" />
                {isNewProject ? "Create Project" : "Save Changes"}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}