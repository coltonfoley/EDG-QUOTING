import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { 
  Plus, 
  Search, 
  Filter, 
  MoreHorizontal, 
  Eye, 
  Edit, 
  Trash2, 
  Calendar, 
  Users, 
  DollarSign, 
  CheckCircle2, 
  Clock, 
  AlertTriangle,
  ArrowUpRight,
  FileText,
  Target,
  TrendingUp,
  Building2
} from "lucide-react";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/utils";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ProjectListItem, Account, User } from "@shared/schema";

export default function ProjectsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [managerFilter, setManagerFilter] = useState<string>("all");
  const [activeView, setActiveView] = useState("list");
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  
  // Fetch projects with enhanced details
  const { data: projects, isLoading, error } = useQuery<ProjectListItem[]>({
    queryKey: ["/api/projects"],
    enabled: isAuthenticated,
  });

  // Fetch supporting data for filters
  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ["/api/accounts"],
    enabled: isAuthenticated,
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: isAuthenticated,
    retry: false, // Users endpoint might not exist yet
    meta: {
      errorHandler: () => {} // Silently handle missing endpoint
    }
  });

  // Delete mutation
  const deleteProjectMutation = useMutation({
    mutationFn: async (projectId: number) => {
      return await apiRequest("DELETE", `/api/projects/${projectId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({
        title: "Project deleted",
        description: "The project has been successfully deleted.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete project. Please try again.",
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

  // Filter and search projects
  const filteredProjects = useMemo(() => {
    if (!projects) return [];
    
    return projects.filter(project => {
      const matchesSearch = !searchTerm.trim() || 
        project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        project.projectNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        project.account.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (project.projectAddress && project.projectAddress.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesStatus = statusFilter === "all" || project.status === statusFilter;
      const matchesPriority = priorityFilter === "all" || project.priority === priorityFilter;
      const matchesManager = managerFilter === "all" || project.projectManagerId === managerFilter;
      
      return matchesSearch && matchesStatus && matchesPriority && matchesManager;
    });
  }, [projects, searchTerm, statusFilter, priorityFilter, managerFilter]);

  // Get status styling
  const getStatusBadge = (status: string) => {
    const styles = {
      planning: "bg-blue-100 text-blue-800 border-blue-200",
      in_progress: "bg-green-100 text-green-800 border-green-200",
      on_hold: "bg-yellow-100 text-yellow-800 border-yellow-200",
      completed: "bg-emerald-100 text-emerald-800 border-emerald-200",
      billed: "bg-purple-100 text-purple-800 border-purple-200",
      cancelled: "bg-red-100 text-red-800 border-red-200"
    };
    return styles[status as keyof typeof styles] || "bg-gray-100 text-gray-800 border-gray-200";
  };

  const getPriorityBadge = (priority: string) => {
    const styles = {
      low: "bg-gray-100 text-gray-600 border-gray-200",
      medium: "bg-blue-100 text-blue-600 border-blue-200",
      high: "bg-orange-100 text-orange-600 border-orange-200",
      urgent: "bg-red-100 text-red-600 border-red-200"
    };
    return styles[priority as keyof typeof styles] || "bg-gray-100 text-gray-600 border-gray-200";
  };

  // Calculate overview statistics
  const stats = useMemo(() => {
    if (!projects) return { total: 0, active: 0, completed: 0, totalValue: 0, avgProgress: 0, overdue: 0 };
    
    const total = projects.length;
    const active = projects.filter(p => ['planning', 'in_progress'].includes(p.status)).length;
    const completed = projects.filter(p => p.status === 'completed').length;
    const totalValue = projects.reduce((sum, p) => sum + (p.estimatedTotalCost ? parseFloat(p.estimatedTotalCost.toString()) : 0), 0);
    const avgProgress = projects.length > 0 ? projects.reduce((sum, p) => sum + p.progressPercentage, 0) / projects.length : 0;
    const overdue = projects.filter(p => p.isOverdue).length;
    
    return { total, active, completed, totalValue, avgProgress, overdue };
  }, [projects]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-64 mb-6"></div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-8 space-y-4 sm:space-y-0">
          <div>
            <h2 className="text-3xl font-bold text-edg-black">Project Management</h2>
            <p className="text-edg-grey mt-2">Manage active construction projects and track progress</p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
            <Link href="/project-dashboard">
              <Button variant="outline" className="w-full sm:w-auto">
                <TrendingUp className="mr-2 h-4 w-4" />
                Dashboard
              </Button>
            </Link>
            <Link href="/quotes">
              <Button variant="outline" className="w-full sm:w-auto">
                <FileText className="mr-2 h-4 w-4" />
                Convert Quote
              </Button>
            </Link>
            <Link href="/projects/new">
              <Button className="bg-edg-black hover:bg-edg-grey text-edg-white w-full sm:w-auto">
                <Plus className="mr-2 h-4 w-4" />
                New Project
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-8">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <Building2 className="h-6 w-6 text-edg-teal" />
                <div className="ml-3">
                  <p className="text-xs font-medium text-edg-grey">Total Projects</p>
                  <p className="text-xl font-bold text-edg-black">{stats.total}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <Clock className="h-6 w-6 text-blue-500" />
                <div className="ml-3">
                  <p className="text-xs font-medium text-edg-grey">Active</p>
                  <p className="text-xl font-bold text-edg-black">{stats.active}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <CheckCircle2 className="h-6 w-6 text-green-500" />
                <div className="ml-3">
                  <p className="text-xs font-medium text-edg-grey">Completed</p>
                  <p className="text-xl font-bold text-edg-black">{stats.completed}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <DollarSign className="h-6 w-6 text-edg-teal" />
                <div className="ml-3">
                  <p className="text-xs font-medium text-edg-grey">Total Value</p>
                  <p className="text-lg font-bold text-edg-black">{formatCurrency(stats.totalValue)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <Target className="h-6 w-6 text-purple-500" />
                <div className="ml-3">
                  <p className="text-xs font-medium text-edg-grey">Avg Progress</p>
                  <p className="text-xl font-bold text-edg-black">{Math.round(stats.avgProgress)}%</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <AlertTriangle className="h-6 w-6 text-red-500" />
                <div className="ml-3">
                  <p className="text-xs font-medium text-edg-grey">Overdue</p>
                  <p className="text-xl font-bold text-edg-black">{stats.overdue}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Search */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-edg-grey h-4 w-4" />
                  <Input
                    placeholder="Search projects, numbers, clients..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                    data-testid="input-project-search"
                  />
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-3">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-40" data-testid="select-status-filter">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="planning">Planning</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="on_hold">On Hold</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="billed">Billed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                  <SelectTrigger className="w-full sm:w-40" data-testid="select-priority-filter">
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Priorities</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={managerFilter} onValueChange={setManagerFilter}>
                  <SelectTrigger className="w-full sm:w-40" data-testid="select-manager-filter">
                    <SelectValue placeholder="Manager" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Managers</SelectItem>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.firstName} {user.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {(searchTerm || statusFilter !== "all" || priorityFilter !== "all" || managerFilter !== "all") && (
              <div className="mt-4 flex items-center gap-2">
                <span className="text-sm text-edg-grey">
                  Found {filteredProjects.length} project{filteredProjects.length !== 1 ? 's' : ''}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchTerm("");
                    setStatusFilter("all");
                    setPriorityFilter("all");
                    setManagerFilter("all");
                  }}
                  data-testid="button-clear-filters"
                >
                  Clear filters
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Projects Table */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Projects</CardTitle>
              <Tabs value={activeView} onValueChange={setActiveView} className="w-auto">
                <TabsList>
                  <TabsTrigger value="list" data-testid="tab-list-view">List</TabsTrigger>
                  <TabsTrigger value="cards" data-testid="tab-card-view">Cards</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent>
            {!projects || projects.length === 0 ? (
              <div className="text-center py-12">
                <Building2 className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No projects yet</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Get started by creating your first project.
                </p>
                <div className="mt-6">
                  <Link href="/projects/new">
                    <Button className="bg-edg-black hover:bg-edg-grey text-edg-white">
                      <Plus className="mr-2 h-4 w-4" />
                      New Project
                    </Button>
                  </Link>
                </div>
              </div>
            ) : (
              <Tabs value={activeView} className="w-full">
                <TabsContent value="list" className="mt-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Project</TableHead>
                          <TableHead>Client</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Priority</TableHead>
                          <TableHead>Progress</TableHead>
                          <TableHead>Manager</TableHead>
                          <TableHead>Timeline</TableHead>
                          <TableHead>Value</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredProjects.map((project) => (
                          <TableRow key={project.id} className="cursor-pointer hover:bg-gray-50">
                            <TableCell>
                              <div>
                                <div className="font-medium text-edg-black">{project.name}</div>
                                <div className="text-sm text-edg-grey">{project.projectNumber}</div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div>
                                <div className="font-medium">{project.account.name}</div>
                                {project.primaryContact && (
                                  <div className="text-sm text-edg-grey">
                                    {project.primaryContact.firstName} {project.primaryContact.lastName}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge className={`${getStatusBadge(project.status)} border`}>
                                {project.status.replace('_', ' ').toUpperCase()}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge className={`${getPriorityBadge(project.priority)} border`}>
                                {project.priority.toUpperCase()}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="w-20">
                                <Progress value={project.progressPercentage} className="h-2" />
                                <div className="text-xs text-edg-grey mt-1">{project.progressPercentage}%</div>
                              </div>
                            </TableCell>
                            <TableCell>
                              {project.projectManager ? (
                                <div className="text-sm">
                                  {project.projectManager.firstName} {project.projectManager.lastName}
                                </div>
                              ) : (
                                <span className="text-sm text-edg-grey">Unassigned</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">
                                {project.estimatedStartDate && (
                                  <div>Start: {format(new Date(project.estimatedStartDate), 'MMM dd')}</div>
                                )}
                                {project.estimatedEndDate && (
                                  <div className={project.isOverdue ? 'text-red-600' : ''}>
                                    End: {format(new Date(project.estimatedEndDate), 'MMM dd')}
                                  </div>
                                )}
                                {project.daysRemaining !== undefined && (
                                  <div className="text-xs text-edg-grey">
                                    {project.daysRemaining >= 0 ? `${project.daysRemaining} days left` : `${Math.abs(project.daysRemaining)} days overdue`}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {project.estimatedTotalCost && (
                                <div className="text-sm font-medium">
                                  {formatCurrency(parseFloat(project.estimatedTotalCost.toString()))}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Link href={`/project-details/${project.id}`}>
                                  <Button variant="ghost" size="sm" data-testid={`button-view-${project.id}`}>
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </Link>
                                <Link href={`/projects/${project.id}/edit`}>
                                  <Button variant="ghost" size="sm" data-testid={`button-edit-${project.id}`}>
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                </Link>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="sm" data-testid={`button-delete-${project.id}`}>
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        This will permanently delete the project "{project.name}" and all associated data. This action cannot be undone.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => deleteProjectMutation.mutate(project.id)}
                                        className="bg-red-600 hover:bg-red-700"
                                      >
                                        Delete Project
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="cards" className="mt-0">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredProjects.map((project) => (
                      <Card key={project.id} className="hover:shadow-lg transition-shadow">
                        <CardContent className="p-6">
                          <div className="flex justify-between items-start mb-4">
                            <div className="flex-1">
                              <h3 className="font-semibold text-edg-black truncate">{project.name}</h3>
                              <p className="text-sm text-edg-grey">{project.projectNumber}</p>
                            </div>
                            <div className="flex gap-1">
                              <Badge className={`${getStatusBadge(project.status)} border text-xs`}>
                                {project.status.replace('_', ' ')}
                              </Badge>
                            </div>
                          </div>

                          <div className="space-y-3">
                            <div>
                              <p className="text-sm font-medium text-edg-grey">Client</p>
                              <p className="text-sm text-edg-black">{project.account.name}</p>
                            </div>

                            <div>
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-sm font-medium text-edg-grey">Progress</span>
                                <span className="text-sm text-edg-black">{project.progressPercentage}%</span>
                              </div>
                              <Progress value={project.progressPercentage} className="h-2" />
                            </div>

                            <div className="flex justify-between text-sm">
                              <div>
                                <p className="text-edg-grey">Tasks</p>
                                <p className="text-edg-black">{project.completedTaskCount}/{project.taskCount}</p>
                              </div>
                              <div>
                                <p className="text-edg-grey">Value</p>
                                <p className="text-edg-black">
                                  {project.estimatedTotalCost ? formatCurrency(parseFloat(project.estimatedTotalCost.toString())) : 'N/A'}
                                </p>
                              </div>
                            </div>

                            {project.estimatedEndDate && (
                              <div className="text-sm">
                                <p className="text-edg-grey">Due Date</p>
                                <p className={project.isOverdue ? 'text-red-600 font-medium' : 'text-edg-black'}>
                                  {format(new Date(project.estimatedEndDate), 'MMM dd, yyyy')}
                                  {project.isOverdue && ' (Overdue)'}
                                </p>
                              </div>
                            )}

                            <div className="flex gap-2 pt-3 border-t">
                              <Link href={`/project-details/${project.id}`} className="flex-1">
                                <Button variant="outline" size="sm" className="w-full" data-testid={`button-view-card-${project.id}`}>
                                  <Eye className="mr-2 h-4 w-4" />
                                  View
                                </Button>
                              </Link>
                              <Link href={`/projects/${project.id}/edit`}>
                                <Button variant="outline" size="sm" data-testid={`button-edit-card-${project.id}`}>
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </Link>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}