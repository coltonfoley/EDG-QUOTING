import { useState, useEffect } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle, 
  AlertDialogTrigger 
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/utils";
import { 
  ArrowLeft,
  Edit,
  Trash2,
  FileText,
  Users,
  Calendar,
  DollarSign,
  Building,
  Phone,
  Mail,
  MapPin,
  CheckCircle,
  Clock,
  XCircle,
  Pause,
  AlertCircle,
  Save,
  Download,
  ExternalLink,
  Camera,
  FileImage,
  Paperclip,
  RefreshCw
} from "lucide-react";
import type { ProjectWithDetails } from "@shared/schema";

type ProjectStatus = "pending" | "in_progress" | "completed" | "on_hold" | "cancelled";

export default function ProjectDetails() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  
  const projectId = id ? parseInt(id) : undefined;
  
  // Local state for editing
  const [isEditing, setIsEditing] = useState(false);
  const [editingNotes, setEditingNotes] = useState("");
  const [editingCompletion, setEditingCompletion] = useState(0);
  const [editingActualStartDate, setEditingActualStartDate] = useState("");
  const [editingActualEndDate, setEditingActualEndDate] = useState("");

  const { data: project, isLoading, error } = useQuery<ProjectWithDetails>({
    queryKey: [`/api/projects/${projectId}`],
    enabled: isAuthenticated && !!projectId,
  });

  // Status update mutation
  const updateStatusMutation = useMutation({
    mutationFn: async (status: ProjectStatus) => {
      if (!projectId) throw new Error("No project ID");
      return await apiRequest("PATCH", `/api/projects/${projectId}`, { status });
    },
    onMutate: async (newStatus) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: [`/api/projects/${projectId}`] });
      
      // Snapshot the previous value
      const previousProject = queryClient.getQueryData([`/api/projects/${projectId}`]);
      
      // Optimistically update to the new value
      queryClient.setQueryData([`/api/projects/${projectId}`], (old: any) => 
        old ? { ...old, status: newStatus } : old
      );
      
      // Return a context object with the snapshotted value
      return { previousProject };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({
        title: "Status updated",
        description: "Project status has been successfully updated.",
      });
    },
    onError: (error: any, newStatus, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      queryClient.setQueryData([`/api/projects/${projectId}`], context?.previousProject);
      toast({
        title: "Error",
        description: error.message || "Failed to update status. Please try again.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
    },
  });

  // General project update mutation
  const updateProjectMutation = useMutation({
    mutationFn: async (updates: Partial<ProjectWithDetails>) => {
      if (!projectId) throw new Error("No project ID");
      return await apiRequest("PATCH", `/api/projects/${projectId}`, updates);
    },
    onMutate: async (updates) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: [`/api/projects/${projectId}`] });
      
      // Snapshot the previous value
      const previousProject = queryClient.getQueryData([`/api/projects/${projectId}`]);
      
      // Optimistically update to the new values
      queryClient.setQueryData([`/api/projects/${projectId}`], (old: any) => 
        old ? { ...old, ...updates } : old
      );
      
      // Return a context object with the snapshotted value
      return { previousProject };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setIsEditing(false);
      toast({
        title: "Project updated",
        description: "Project details have been successfully updated.",
      });
    },
    onError: (error: any, updates, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      queryClient.setQueryData([`/api/projects/${projectId}`], context?.previousProject);
      toast({
        title: "Error",
        description: error.message || "Failed to update project. Please try again.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
    },
  });

  // Delete project mutation
  const deleteProjectMutation = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error("No project ID");
      return await apiRequest("DELETE", `/api/projects/${projectId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({
        title: "Project deleted",
        description: "Project has been successfully deleted.",
      });
      navigate("/projects");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete project. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Initialize editing state when project loads
  useEffect(() => {
    if (project) {
      setEditingNotes(project.notes || "");
      setEditingCompletion(parseFloat(project.completionPercentage || "0"));
      setEditingActualStartDate(project.actualStartDate || "");
      setEditingActualEndDate(project.actualEndDate || "");
    }
  }, [project]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, authLoading, toast]);

  // Handle unauthorized errors
  useEffect(() => {
    if (error && isUnauthorizedError(error as Error)) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [error, toast]);

  const getStatusColor = (status: ProjectStatus) => {
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

  const getStatusIcon = (status: ProjectStatus) => {
    switch (status) {
      case "pending":
        return <Clock className="h-3 w-3" />;
      case "in_progress":
        return <AlertCircle className="h-3 w-3" />;
      case "completed":
        return <CheckCircle className="h-3 w-3" />;
      case "on_hold":
        return <Pause className="h-3 w-3" />;
      case "cancelled":
        return <XCircle className="h-3 w-3" />;
      default:
        return null;
    }
  };

  const handleStatusUpdate = (newStatus: ProjectStatus) => {
    updateStatusMutation.mutate(newStatus);
  };

  const handleSaveEdits = () => {
    updateProjectMutation.mutate({
      notes: editingNotes,
      completionPercentage: editingCompletion.toString(),
      actualStartDate: editingActualStartDate,
      actualEndDate: editingActualEndDate,
    });
  };

  const handleDeleteProject = () => {
    deleteProjectMutation.mutate();
  };

  const calculateMargin = (contractValue: string | null, actualCost: string | null) => {
    if (!contractValue || !actualCost) return null;
    const contract = parseFloat(contractValue);
    const cost = parseFloat(actualCost);
    if (contract === 0) return null;
    return ((contract - cost) / contract) * 100;
  };

  const retryQuery = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <AppHeader />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="space-y-6">
            <Skeleton className="h-64 w-full" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Skeleton className="h-96" />
              <Skeleton className="h-96" />
            </div>
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <AppHeader />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-red-600">
              {error ? "Error loading project" : "Project not found"}
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              {error ? "Please try again later." : "The requested project could not be found."}
            </p>
            <div className="flex justify-center space-x-4 mt-4">
              {error && (
                <Button
                  onClick={retryQuery}
                  data-testid="button-retry-project"
                  variant="outline"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry
                </Button>
              )}
              <Button 
                data-testid="button-back-to-projects"
                onClick={() => navigate("/projects")} 
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Projects
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const margin = calculateMargin(project.contractValue, project.actualCost);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <AppHeader />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header with navigation and actions */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <Button 
              data-testid="button-back-to-projects"
              variant="outline" 
              onClick={() => navigate("/projects")}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Projects
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white" data-testid="text-project-title">
                {project.projectName || `Project ${project.projectNumber}`}
              </h1>
              <p className="text-gray-600 dark:text-gray-400" data-testid="text-project-number">
                {project.projectNumber}
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <Button 
              data-testid="button-edit-project"
              variant="outline" 
              onClick={() => setIsEditing(!isEditing)}
              disabled={updateProjectMutation.isPending}
            >
              <Edit className="mr-2 h-4 w-4" />
              {isEditing ? "Cancel" : "Edit"}
            </Button>
            
            {isEditing && (
              <Button 
                data-testid="button-save-project"
                onClick={handleSaveEdits}
                disabled={updateProjectMutation.isPending}
              >
                <Save className="mr-2 h-4 w-4" />
                Save Changes
              </Button>
            )}
            
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  data-testid="button-delete-project"
                  variant="destructive"
                  disabled={deleteProjectMutation.isPending}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent data-testid="dialog-delete-confirmation">
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Project</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete this project? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
                  <AlertDialogAction 
                    data-testid="button-confirm-delete"
                    onClick={handleDeleteProject}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    Delete Project
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Project Header Card */}
        <Card className="mb-6" data-testid="card-project-header">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center space-x-2">
                <Building className="h-5 w-5" />
                <span>Project Overview</span>
              </CardTitle>
              <div className="flex items-center space-x-4">
                <Badge 
                  data-testid={`badge-status-${project.status}`}
                  className={`flex items-center space-x-1 ${getStatusColor(project.status as ProjectStatus)}`}
                >
                  {getStatusIcon(project.status as ProjectStatus)}
                  <span className="capitalize">{project.status.replace('_', ' ')}</span>
                </Badge>
                <Select
                  value={project.status}
                  onValueChange={(value: string) => handleStatusUpdate(value as ProjectStatus)}
                  disabled={updateStatusMutation.isPending}
                >
                  <SelectTrigger className="w-48" data-testid="select-project-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending" data-testid="option-status-pending">Pending</SelectItem>
                    <SelectItem value="in_progress" data-testid="option-status-in-progress">In Progress</SelectItem>
                    <SelectItem value="on_hold" data-testid="option-status-on-hold">On Hold</SelectItem>
                    <SelectItem value="completed" data-testid="option-status-completed">Completed</SelectItem>
                    <SelectItem value="cancelled" data-testid="option-status-cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Progress */}
              <div>
                <Label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Completion Progress
                </Label>
                <div className="mt-2">
                  {isEditing ? (
                    <div className="space-y-2">
                      <Input
                        data-testid="input-completion-percentage"
                        type="number"
                        min="0"
                        max="100"
                        value={editingCompletion}
                        onChange={(e) => setEditingCompletion(parseFloat(e.target.value) || 0)}
                        className="mb-2"
                      />
                      <Progress value={editingCompletion} className="w-full" />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-2xl font-bold" data-testid="text-completion-percentage">
                          {parseFloat(project.completionPercentage || "0").toFixed(1)}%
                        </span>
                      </div>
                      <Progress value={parseFloat(project.completionPercentage || "0")} className="w-full" />
                    </div>
                  )}
                </div>
              </div>

              {/* Contract Value */}
              <div>
                <Label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Contract Value
                </Label>
                <div className="mt-2">
                  <span className="text-2xl font-bold text-green-600" data-testid="text-contract-value">
                    {project.contractValue ? formatCurrency(parseFloat(project.contractValue)) : "Not set"}
                  </span>
                </div>
              </div>

              {/* Actual Cost */}
              <div>
                <Label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Actual Cost
                </Label>
                <div className="mt-2">
                  <span className="text-2xl font-bold text-red-600" data-testid="text-actual-cost">
                    {project.actualCost ? formatCurrency(parseFloat(project.actualCost)) : "$0.00"}
                  </span>
                </div>
              </div>

              {/* Margin */}
              <div>
                <Label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Profit Margin
                </Label>
                <div className="mt-2">
                  <span 
                    className={`text-2xl font-bold ${margin !== null && margin > 0 ? 'text-green-600' : 'text-gray-400'}`}
                    data-testid="text-profit-margin"
                  >
                    {margin !== null ? `${margin.toFixed(1)}%` : "N/A"}
                  </span>
                </div>
              </div>
            </div>

            <Separator className="my-6" />

            {/* Project Address */}
            {project.projectAddress && (
              <div className="mb-4">
                <Label className="text-sm font-medium text-gray-600 dark:text-gray-400 flex items-center">
                  <MapPin className="mr-2 h-4 w-4" />
                  Project Address
                </Label>
                <p className="mt-1 text-lg" data-testid="text-project-address">{project.projectAddress}</p>
              </div>
            )}

            {/* Date Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <Label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Estimated Start
                </Label>
                <p className="mt-1" data-testid="text-estimated-start-date">
                  {project.estimatedStartDate || "Not set"}
                </p>
              </div>
              <div>
                <Label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Estimated End
                </Label>
                <p className="mt-1" data-testid="text-estimated-end-date">
                  {project.estimatedEndDate || "Not set"}
                </p>
              </div>
              <div>
                <Label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Actual Start
                </Label>
                {isEditing ? (
                  <Input
                    data-testid="input-actual-start-date"
                    type="date"
                    value={editingActualStartDate}
                    onChange={(e) => setEditingActualStartDate(e.target.value)}
                    className="mt-1"
                  />
                ) : (
                  <p className="mt-1" data-testid="text-actual-start-date">
                    {project.actualStartDate || "Not started"}
                  </p>
                )}
              </div>
              <div>
                <Label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Actual End
                </Label>
                {isEditing ? (
                  <Input
                    data-testid="input-actual-end-date"
                    type="date"
                    value={editingActualEndDate}
                    onChange={(e) => setEditingActualEndDate(e.target.value)}
                    className="mt-1"
                  />
                ) : (
                  <p className="mt-1" data-testid="text-actual-end-date">
                    {project.actualEndDate || "Not completed"}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Customer Information */}
          <Card data-testid="card-customer-info">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Users className="h-5 w-5" />
                <span>Customer Information</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-sm font-medium text-gray-600 dark:text-gray-400">Customer Name</Label>
                <p className="mt-1 text-lg font-medium" data-testid="text-customer-name">{project.customer.name}</p>
              </div>
              <div>
                <Label className="text-sm font-medium text-gray-600 dark:text-gray-400 flex items-center">
                  <Mail className="mr-2 h-4 w-4" />
                  Email
                </Label>
                <p className="mt-1" data-testid="text-customer-email">
                  <a href={`mailto:${project.customer.email}`} className="text-blue-600 hover:underline">
                    {project.customer.email}
                  </a>
                </p>
              </div>
              <div>
                <Label className="text-sm font-medium text-gray-600 dark:text-gray-400 flex items-center">
                  <Phone className="mr-2 h-4 w-4" />
                  Phone
                </Label>
                <p className="mt-1" data-testid="text-customer-phone">
                  <a href={`tel:${project.customer.phone}`} className="text-blue-600 hover:underline">
                    {project.customer.phone}
                  </a>
                </p>
              </div>
              {project.customer.company && (
                <div>
                  <Label className="text-sm font-medium text-gray-600 dark:text-gray-400 flex items-center">
                    <Building className="mr-2 h-4 w-4" />
                    Company
                  </Label>
                  <p className="mt-1" data-testid="text-customer-company">{project.customer.company}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Original Quote Information */}
          <Card data-testid="card-quote-info">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <FileText className="h-5 w-5" />
                <span>Original Quote</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-sm font-medium text-gray-600 dark:text-gray-400">Quote Number</Label>
                <p className="mt-1 text-lg font-medium" data-testid="text-quote-number">{project.quote.quoteNumber}</p>
              </div>
              <div>
                <Label className="text-sm font-medium text-gray-600 dark:text-gray-400">Quote Status</Label>
                <Badge 
                  data-testid={`badge-quote-status-${project.quote.status}`}
                  className="mt-1 capitalize"
                >
                  {project.quote.status}
                </Badge>
              </div>
              <div>
                <Label className="text-sm font-medium text-gray-600 dark:text-gray-400">Created Date</Label>
                <p className="mt-1" data-testid="text-quote-created-date">
                  {project.quote.createdAt ? new Date(project.quote.createdAt).toLocaleDateString() : "Unknown"}
                </p>
              </div>
              <div className="pt-2">
                <Link href={`/quotes/${project.quote.id}`}>
                  <Button variant="outline" className="w-full" data-testid="button-view-original-quote">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    View Original Quote
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Project Notes */}
        <Card className="mb-6" data-testid="card-project-notes">
          <CardHeader>
            <CardTitle>Project Notes</CardTitle>
          </CardHeader>
          <CardContent>
            {isEditing ? (
              <Textarea
                data-testid="textarea-project-notes"
                value={editingNotes}
                onChange={(e) => setEditingNotes(e.target.value)}
                placeholder="Add project notes, updates, or comments..."
                rows={6}
                className="w-full"
              />
            ) : (
              <div data-testid="text-project-notes">
                {project.notes ? (
                  <p className="whitespace-pre-wrap">{project.notes}</p>
                ) : (
                  <p className="text-gray-500 italic">No notes added yet.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Team Members & Progress Photos (Future Enhancement Areas) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card data-testid="card-team-members">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Users className="h-5 w-5" />
                <span>Team Members</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <Users className="mx-auto h-12 w-12 text-gray-400" />
                <p className="mt-2 text-sm text-gray-500">Team member management coming soon</p>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-progress-photos">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Camera className="h-5 w-5" />
                <span>Progress Photos</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <FileImage className="mx-auto h-12 w-12 text-gray-400" />
                <p className="mt-2 text-sm text-gray-500">Progress photo gallery coming soon</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Action Buttons Footer */}
        <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
          <div className="flex flex-wrap gap-4 justify-center">
            <Button variant="outline" data-testid="button-export-project">
              <Download className="mr-2 h-4 w-4" />
              Export Summary
            </Button>
            <Button variant="outline" data-testid="button-project-documents">
              <Paperclip className="mr-2 h-4 w-4" />
              Project Documents
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}