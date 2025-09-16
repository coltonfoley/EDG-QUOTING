import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { 
  Plus, 
  FileText, 
  Users, 
  DollarSign, 
  Search, 
  Eye, 
  ArrowUpDown,
  Calendar,
  Building,
  CheckCircle,
  Clock,
  XCircle,
  Pause,
  AlertCircle
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useAuth } from "@/hooks/useAuth";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RefreshCw } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ProjectWithDetails, QuoteWithDetails } from "@shared/schema";

type ProjectStatus = "pending" | "in_progress" | "completed" | "on_hold" | "cancelled";
type SortField = "projectNumber" | "projectName" | "customerName" | "status" | "completionPercentage" | "estimatedStartDate" | "contractValue";
type SortOrder = "asc" | "desc";

export default function Projects() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("projectNumber");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  
  const { data: projects, isLoading, error } = useQuery<ProjectWithDetails[]>({
    queryKey: ["/api/projects"],
    enabled: isAuthenticated,
  });

  const { data: quotes } = useQuery<QuoteWithDetails[]>({
    queryKey: ["/api/quotes"],
    enabled: isAuthenticated,
  });

  // Status update mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ projectId, status }: { projectId: number; status: ProjectStatus }) => {
      return await apiRequest("PATCH", `/api/projects/${projectId}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({
        title: "Status updated",
        description: "Project status has been successfully updated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update status. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Convert quote to project mutation
  const convertQuoteMutation = useMutation({
    mutationFn: async (quoteId: number) => {
      return await apiRequest("POST", `/api/projects/from-quote/${quoteId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({
        title: "Project created",
        description: "Quote has been successfully converted to a project.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to convert quote to project. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        navigate("/auth");
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
        navigate("/auth");
      }, 500);
      return;
    }
  }, [error, toast]);

  // Filter and sort projects
  const filteredAndSortedProjects = useMemo(() => {
    if (!projects) return [];
    
    let filtered = projects;

    // Apply search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(project => 
        project.projectNumber.toLowerCase().includes(term) ||
        (project.projectName && project.projectName.toLowerCase().includes(term)) ||
        project.customer.name.toLowerCase().includes(term) ||
        project.customer.email.toLowerCase().includes(term) ||
        (project.customer.company && project.customer.company.toLowerCase().includes(term)) ||
        (project.projectAddress && project.projectAddress.toLowerCase().includes(term))
      );
    }

    // Apply status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter(project => project.status === statusFilter);
    }

    // Sort projects
    const sorted = [...filtered].sort((a, b) => {
      let valueA: any;
      let valueB: any;

      switch (sortField) {
        case "projectNumber":
          valueA = a.projectNumber;
          valueB = b.projectNumber;
          break;
        case "projectName":
          valueA = a.projectName || "";
          valueB = b.projectName || "";
          break;
        case "customerName":
          valueA = a.customer.name;
          valueB = b.customer.name;
          break;
        case "status":
          valueA = a.status;
          valueB = b.status;
          break;
        case "completionPercentage":
          valueA = parseFloat(a.completionPercentage || "0");
          valueB = parseFloat(b.completionPercentage || "0");
          break;
        case "estimatedStartDate":
          valueA = a.estimatedStartDate || "";
          valueB = b.estimatedStartDate || "";
          break;
        case "contractValue":
          valueA = parseFloat(a.contractValue || "0");
          valueB = parseFloat(b.contractValue || "0");
          break;
        default:
          valueA = a.projectNumber;
          valueB = b.projectNumber;
      }

      if (sortOrder === "asc") {
        return valueA < valueB ? -1 : valueA > valueB ? 1 : 0;
      } else {
        return valueA > valueB ? -1 : valueA < valueB ? 1 : 0;
      }
    });

    return sorted;
  }, [projects, searchTerm, statusFilter, sortField, sortOrder]);

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

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const handleStatusUpdate = (projectId: number, newStatus: ProjectStatus) => {
    updateStatusMutation.mutate({ projectId, status: newStatus });
  };

  const handleConvertQuote = (quoteId: number) => {
    convertQuoteMutation.mutate(quoteId);
  };

  const handleNewProject = () => {
    navigate("/projects/new");
  };

  const handleViewDetails = (projectId: number) => {
    navigate(`/projects/${projectId}`);
  };

  const retryQuery = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
  };

  // Calculate dashboard stats
  const totalProjects = projects?.length || 0;
  const totalValue = projects?.reduce((sum, project) => {
    return sum + parseFloat(project.contractValue || "0");
  }, 0) || 0;
  const activeProjects = projects?.filter(p => p.status === "in_progress").length || 0;
  const completedProjects = projects?.filter(p => p.status === "completed").length || 0;
  
  // Get approved quotes that can be converted to projects
  const availableQuotes = quotes?.filter(quote => 
    quote.status === "approved" && 
    !projects?.some(project => project.quoteId === quote.id)
  ) || [];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <AppHeader />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-64 mb-6"></div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-32 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show error UI for non-auth errors
  if (error && !isUnauthorizedError(error as Error)) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <AppHeader />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load projects. {error?.message || 'An unexpected error occurred.'}
              <Button 
                variant="outline" 
                size="sm" 
                className="ml-4"
                onClick={retryQuery}
                data-testid="button-retry-projects"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <AppHeader />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-8 space-y-4 sm:space-y-0">
          <div>
            <h2 className="text-3xl font-bold text-edg-black dark:text-white">Project Management</h2>
            <p className="text-edg-grey dark:text-gray-400 mt-2">Track and manage your active projects</p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-edg-grey h-4 w-4" />
              <Input
                data-testid="input-search-projects"
                placeholder="Search projects, customers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 w-full sm:w-80"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger data-testid="select-status-filter" className="w-full sm:w-48">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="on_hold">On Hold</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>

            {availableQuotes.length > 0 && (
              <Select onValueChange={(value) => value && handleConvertQuote(parseInt(value))}>
                <SelectTrigger data-testid="select-convert-quote" className="w-full sm:w-48">
                  <SelectValue placeholder="Convert Quote" />
                </SelectTrigger>
                <SelectContent>
                  {availableQuotes.map((quote) => (
                    <SelectItem key={quote.id} value={quote.id.toString()}>
                      {quote.quoteNumber} - {quote.customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Button 
              data-testid="button-new-project"
              className="bg-edg-black hover:bg-edg-grey text-edg-white w-full sm:w-auto"
              onClick={handleNewProject}
            >
              <Plus className="mr-2 h-4 w-4" />
              New Project
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <FileText className="h-8 w-8 text-edg-teal" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-edg-grey dark:text-gray-400">Total Projects</p>
                  <p data-testid="text-total-projects" className="text-2xl font-bold text-edg-black dark:text-white">{totalProjects}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <DollarSign className="h-8 w-8 text-edg-teal" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-edg-grey dark:text-gray-400">Total Value</p>
                  <p data-testid="text-total-value" className="text-2xl font-bold text-edg-black dark:text-white">{formatCurrency(totalValue)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <AlertCircle className="h-8 w-8 text-edg-teal" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-edg-grey dark:text-gray-400">Active Projects</p>
                  <p data-testid="text-active-projects" className="text-2xl font-bold text-edg-black dark:text-white">{activeProjects}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <CheckCircle className="h-8 w-8 text-edg-teal" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-edg-grey dark:text-gray-400">Completed</p>
                  <p data-testid="text-completed-projects" className="text-2xl font-bold text-edg-black dark:text-white">{completedProjects}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Projects Table */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-3 sm:space-y-0">
              <CardTitle>Projects Overview</CardTitle>
              <div className="text-sm text-edg-grey dark:text-gray-400">
                {searchTerm && (
                  <span>Found {filteredAndSortedProjects.length} project{filteredAndSortedProjects.length !== 1 ? 's' : ''} matching "{searchTerm}"</span>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {!projects || projects.length === 0 ? (
              <div className="text-center py-12">
                <Building className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">No projects yet</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Start by converting an approved quote to a project or create a new project.
                </p>
                <div className="mt-6 flex flex-col sm:flex-row gap-3 items-center justify-center">
                  <Button 
                    data-testid="button-empty-new-project"
                    className="bg-edg-black hover:bg-edg-grey text-edg-white"
                    onClick={handleNewProject}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    New Project
                  </Button>
                  {availableQuotes.length > 0 && (
                    <Select onValueChange={(value) => value && handleConvertQuote(parseInt(value))}>
                      <SelectTrigger data-testid="select-empty-convert-quote" className="w-48">
                        <SelectValue placeholder="Convert Quote" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableQuotes.map((quote) => (
                          <SelectItem key={quote.id} value={quote.id.toString()}>
                            {quote.quoteNumber}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            ) : filteredAndSortedProjects.length === 0 ? (
              <div className="text-center py-12">
                <Search className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">No projects found</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Try adjusting your search terms or filters.</p>
                <div className="mt-6">
                  <Button 
                    data-testid="button-clear-search"
                    variant="outline" 
                    onClick={() => {setSearchTerm(""); setStatusFilter("all");}}
                  >
                    Clear Filters
                  </Button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-edg-grey dark:text-gray-400 uppercase tracking-wider">
                        <button
                          data-testid="button-sort-project-number"
                          onClick={() => handleSort("projectNumber")}
                          className="flex items-center space-x-1 hover:text-edg-black dark:hover:text-white"
                        >
                          <span>Project #</span>
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-edg-grey dark:text-gray-400 uppercase tracking-wider">
                        <button
                          data-testid="button-sort-customer-name"
                          onClick={() => handleSort("customerName")}
                          className="flex items-center space-x-1 hover:text-edg-black dark:hover:text-white"
                        >
                          <span>Customer</span>
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-edg-grey dark:text-gray-400 uppercase tracking-wider">
                        <button
                          data-testid="button-sort-project-name"
                          onClick={() => handleSort("projectName")}
                          className="flex items-center space-x-1 hover:text-edg-black dark:hover:text-white"
                        >
                          <span>Project</span>
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-edg-grey dark:text-gray-400 uppercase tracking-wider">
                        <button
                          data-testid="button-sort-status"
                          onClick={() => handleSort("status")}
                          className="flex items-center justify-center space-x-1 hover:text-edg-black dark:hover:text-white"
                        >
                          <span>Status</span>
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-edg-grey dark:text-gray-400 uppercase tracking-wider">
                        <button
                          data-testid="button-sort-completion"
                          onClick={() => handleSort("completionPercentage")}
                          className="flex items-center justify-center space-x-1 hover:text-edg-black dark:hover:text-white"
                        >
                          <span>Progress</span>
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-edg-grey dark:text-gray-400 uppercase tracking-wider">
                        <button
                          data-testid="button-sort-value"
                          onClick={() => handleSort("contractValue")}
                          className="flex items-center justify-end space-x-1 hover:text-edg-black dark:hover:text-white"
                        >
                          <span>Value</span>
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-edg-grey dark:text-gray-400 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                    {filteredAndSortedProjects.map((project) => {
                      const completionPercentage = parseFloat(project.completionPercentage || "0");
                      const contractValue = parseFloat(project.contractValue || "0");

                      return (
                        <tr key={project.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                          <td className="px-6 py-4 text-sm font-medium text-edg-teal">
                            <span data-testid={`text-project-number-${project.id}`}>
                              {project.projectNumber}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-edg-black dark:text-white">
                            <div>
                              <div data-testid={`text-customer-name-${project.id}`} className="font-medium">
                                {project.customer.name}
                              </div>
                              {project.customer.company && (
                                <div className="text-xs text-edg-grey dark:text-gray-400">
                                  {project.customer.company}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-edg-black dark:text-white">
                            <div>
                              <div data-testid={`text-project-name-${project.id}`} className="font-medium">
                                {project.projectName || "Untitled Project"}
                              </div>
                              {project.projectAddress && (
                                <div className="text-xs text-edg-grey dark:text-gray-400">
                                  {project.projectAddress}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <Select
                              value={project.status}
                              onValueChange={(newStatus: ProjectStatus) => handleStatusUpdate(project.id, newStatus)}
                              disabled={updateStatusMutation.isPending}
                            >
                              <SelectTrigger data-testid={`select-status-${project.id}`} className="w-32">
                                <SelectValue asChild>
                                  <Badge className={`${getStatusColor(project.status as ProjectStatus)} flex items-center space-x-1`}>
                                    {getStatusIcon(project.status as ProjectStatus)}
                                    <span>{project.status.replace('_', ' ')}</span>
                                  </Badge>
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="in_progress">In Progress</SelectItem>
                                <SelectItem value="completed">Completed</SelectItem>
                                <SelectItem value="on_hold">On Hold</SelectItem>
                                <SelectItem value="cancelled">Cancelled</SelectItem>
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="flex flex-col items-center space-y-1">
                              <Progress 
                                data-testid={`progress-${project.id}`}
                                value={completionPercentage} 
                                className="w-16 h-2" 
                              />
                              <span data-testid={`text-completion-${project.id}`} className="text-xs text-edg-grey dark:text-gray-400">
                                {completionPercentage.toFixed(0)}%
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right text-sm font-medium text-edg-black dark:text-white">
                            <span data-testid={`text-contract-value-${project.id}`}>
                              {formatCurrency(contractValue)}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="flex items-center justify-center space-x-2">
                              <Button
                                data-testid={`button-view-details-${project.id}`}
                                variant="ghost"
                                size="sm"
                                className="text-edg-teal hover:text-edg-black dark:hover:text-white"
                                onClick={() => handleViewDetails(project.id)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}