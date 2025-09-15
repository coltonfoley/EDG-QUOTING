import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { 
  ArrowLeft, 
  Edit, 
  Calendar, 
  Users, 
  DollarSign, 
  MapPin,
  Phone,
  Mail,
  Building2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Target,
  FileText,
  Camera,
  Wrench,
  TrendingUp,
  Plus,
  Eye,
  Download,
  Settings,
  MoreHorizontal,
  User,
  Briefcase,
  Activity as ActivityIcon,
  List,
  KanbanSquare,
  GitBranch,
  Timer
} from "lucide-react";

// Import new task management components
import TaskList from "@/components/tasks/task-list";
import TaskBoard from "@/components/tasks/task-board";
import TaskAssignmentManager from "@/components/tasks/task-assignment";
import TaskDependenciesManager from "@/components/tasks/task-dependencies";
import TaskProgressTracker from "@/components/tasks/task-progress";
import TaskFormModal from "@/components/tasks/task-form";

// Import scheduling components
import ScheduleDashboard from "@/components/scheduling/schedule-dashboard";
import ResourceCalendar from "@/components/scheduling/resource-calendar";
import CrewAllocation from "@/components/scheduling/crew-allocation";
import ScheduleEventsManager from "@/components/scheduling/schedule-events";
import ResourceAvailabilityTracker from "@/components/scheduling/resource-availability";
import EquipmentSchedule from "@/components/scheduling/equipment-schedule";
import { format, formatDistanceToNow } from "date-fns";
import { formatCurrency } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { 
  ProjectWithDetails, 
  ProjectTask, 
  ProjectMilestone, 
  ProjectCrew, 
  ProjectEquipment,
  ProjectBudgetLine,
  ProjectChangeOrderWithDetails,
  ProjectTimeEntry,
  ProjectProgress,
  ProjectFinancial
} from "@shared/schema";

export default function ProjectDetailsPage() {
  // Handle both /projects/new and /projects/:id/edit routes
  const [newMatch, newParams] = useRoute("/projects/new");
  const [editMatch, editParams] = useRoute("/projects/:id/edit");
  const [detailsMatch, detailsParams] = useRoute("/project-details/:id");
  
  const isNewProject = !!newMatch;
  const projectId = editParams?.id ? parseInt(editParams.id) : 
                   detailsParams?.id ? parseInt(detailsParams.id) : null;
  const [activeTab, setActiveTab] = useState("overview");
  const [taskView, setTaskView] = useState("list"); // list, board, assignments, dependencies, progress
  const [selectedTask, setSelectedTask] = useState<ProjectTask | null>(null);
  const [isTaskFormOpen, setIsTaskFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ProjectTask | null>(null);
  const [parentTaskId, setParentTaskId] = useState<number | null>(null);
  const [scheduleView, setScheduleView] = useState("dashboard"); // dashboard, calendar, crew, events, availability, equipment
  const [selectedResourceId, setSelectedResourceId] = useState<number | null>(null);
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();

  // Fetch main project data (only for existing projects, not new ones)
  const { data: project, isLoading: projectLoading, error } = useQuery<ProjectWithDetails>({
    queryKey: ["/api/projects", projectId],
    enabled: isAuthenticated && !!projectId && !isNewProject,
  });

  // Fetch project tasks
  const { data: tasks = [], isLoading: tasksLoading } = useQuery<ProjectTask[]>({
    queryKey: ["/api/projects", projectId, "tasks"],
    enabled: isAuthenticated && !!projectId && !isNewProject,
  });

  // Fetch project milestones
  const { data: milestones = [], isLoading: milestonesLoading } = useQuery<ProjectMilestone[]>({
    queryKey: ["/api/projects", projectId, "milestones"],
    enabled: isAuthenticated && !!projectId && !isNewProject,
  });

  // Fetch project crew
  const { data: crew = [], isLoading: crewLoading } = useQuery<ProjectCrew[]>({
    queryKey: ["/api/projects", projectId, "crew"],
    enabled: isAuthenticated && !!projectId && !isNewProject,
  });

  // Fetch project equipment
  const { data: equipment = [], isLoading: equipmentLoading } = useQuery<ProjectEquipment[]>({
    queryKey: ["/api/projects", projectId, "equipment"],
    enabled: isAuthenticated && !!projectId && !isNewProject,
  });

  // Fetch budget lines
  const { data: budgetLines = [], isLoading: budgetLoading } = useQuery<ProjectBudgetLine[]>({
    queryKey: ["/api/projects", projectId, "budget"],
    enabled: isAuthenticated && !!projectId && !isNewProject,
  });

  // Fetch project financials
  const { data: financials } = useQuery<ProjectFinancial>({
    queryKey: ["/api/projects", projectId, "financials"],
    enabled: isAuthenticated && !!projectId && !isNewProject,
  });

  // Fetch progress entries
  const { data: progressEntries = [] } = useQuery<ProjectProgress[]>({
    queryKey: ["/api/projects", projectId, "progress"],
    enabled: isAuthenticated && !!projectId && !isNewProject,
  });

  // Show "Project Not Found" only for existing projects that don't exist, not for new projects
  if (!isNewProject && (!projectId || (error && error.message?.includes('404')))) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-edg-black">Project Not Found</h1>
            <p className="text-edg-grey mt-2">The requested project could not be found.</p>
            <Link href="/projects">
              <Button className="mt-4">Back to Projects</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (projectLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-64 mb-6"></div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <div className="h-64 bg-gray-200 rounded-lg"></div>
                <div className="h-96 bg-gray-200 rounded-lg"></div>
              </div>
              <div className="space-y-6">
                <div className="h-48 bg-gray-200 rounded-lg"></div>
                <div className="h-48 bg-gray-200 rounded-lg"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Only show error for existing projects, not new ones
  if (!isNewProject && (error || !project)) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-edg-black">Error Loading Project</h1>
            <p className="text-edg-grey mt-2">There was an error loading the project details.</p>
            <Link href="/projects">
              <Button className="mt-4">Back to Projects</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Show new project creation form
  if (isNewProject) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-6">
            <Link href="/projects" className="inline-flex items-center text-edg-blue hover:text-edg-blue-dark">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Projects
            </Link>
          </div>
          
          <div className="text-center">
            <h1 className="text-3xl font-bold text-edg-black mb-2">Create New Project</h1>
            <p className="text-edg-grey mb-8">Project creation form coming soon!</p>
            <Link href="/projects">
              <Button>Back to Projects</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Helper functions
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

  const getTaskStatusBadge = (status: string) => {
    const styles = {
      pending: "bg-gray-100 text-gray-600",
      in_progress: "bg-blue-100 text-blue-600",
      completed: "bg-green-100 text-green-600",
      blocked: "bg-red-100 text-red-600",
      cancelled: "bg-gray-100 text-gray-600"
    };
    return styles[status as keyof typeof styles] || "bg-gray-100 text-gray-600";
  };

  // Calculate project metrics
  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const totalTasks = tasks.length;
  const taskCompletionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  const completedMilestones = milestones.filter(m => m.status === 'completed').length;
  const totalMilestones = milestones.length;
  const milestoneCompletionRate = totalMilestones > 0 ? (completedMilestones / totalMilestones) * 100 : 0;

  const estimatedCost = project.estimatedTotalCost ? parseFloat(project.estimatedTotalCost.toString()) : 0;
  const actualCost = project.actualTotalCost ? parseFloat(project.actualTotalCost.toString()) : 0;
  const budgetVariance = actualCost - estimatedCost;

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <Link href="/projects">
              <Button variant="ghost" size="sm" data-testid="button-back-to-projects">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Projects
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-edg-black">{project.name}</h1>
              <p className="text-edg-grey mt-1">{project.projectNumber}</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <Badge className={`${getStatusBadge(project.status)} border`}>
              {project.status.replace('_', ' ').toUpperCase()}
            </Badge>
            <Badge className={`${getPriorityBadge(project.priority)} border`}>
              {project.priority.toUpperCase()}
            </Badge>
            <Button variant="outline" size="sm" data-testid="button-edit-project">
              <Edit className="mr-2 h-4 w-4" />
              Edit Project
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main Content Area */}
          <div className="lg:col-span-3">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
              <TabsList className="grid w-full grid-cols-7">
                <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
                <TabsTrigger value="tasks" data-testid="tab-tasks">Tasks</TabsTrigger>
                <TabsTrigger value="schedule" data-testid="tab-schedule">Schedule</TabsTrigger>
                <TabsTrigger value="progress" data-testid="tab-progress">Progress</TabsTrigger>
                <TabsTrigger value="financials" data-testid="tab-financials">Financials</TabsTrigger>
                <TabsTrigger value="resources" data-testid="tab-resources">Resources</TabsTrigger>
                <TabsTrigger value="documents" data-testid="tab-documents">Documents</TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center">
                        <Building2 className="mr-2 h-5 w-5" />
                        Project Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {project.description && (
                        <div>
                          <label className="text-sm font-medium text-edg-grey">Description</label>
                          <p className="text-sm text-edg-black mt-1">{project.description}</p>
                        </div>
                      )}
                      {project.projectAddress && (
                        <div>
                          <label className="text-sm font-medium text-edg-grey">Project Address</label>
                          <p className="text-sm text-edg-black mt-1 flex items-center">
                            <MapPin className="mr-1 h-4 w-4" />
                            {project.projectAddress}
                          </p>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium text-edg-grey">Start Date</label>
                          <p className="text-sm text-edg-black mt-1">
                            {project.estimatedStartDate 
                              ? format(new Date(project.estimatedStartDate), 'MMM dd, yyyy')
                              : 'Not set'
                            }
                          </p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-edg-grey">End Date</label>
                          <p className="text-sm text-edg-black mt-1">
                            {project.estimatedEndDate 
                              ? format(new Date(project.estimatedEndDate), 'MMM dd, yyyy')
                              : 'Not set'
                            }
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center">
                        <Users className="mr-2 h-5 w-5" />
                        Client Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <label className="text-sm font-medium text-edg-grey">Client</label>
                        <p className="text-sm text-edg-black mt-1 font-medium">{project.account.name}</p>
                        <p className="text-xs text-edg-grey">{project.account.type}</p>
                      </div>
                      {project.primaryContact && (
                        <div>
                          <label className="text-sm font-medium text-edg-grey">Primary Contact</label>
                          <div className="mt-1">
                            <p className="text-sm text-edg-black font-medium">
                              {project.primaryContact.firstName} {project.primaryContact.lastName}
                            </p>
                            {project.primaryContact.email && (
                              <p className="text-xs text-edg-grey flex items-center mt-1">
                                <Mail className="mr-1 h-3 w-3" />
                                {project.primaryContact.email}
                              </p>
                            )}
                            {project.primaryContact.phone && (
                              <p className="text-xs text-edg-grey flex items-center mt-1">
                                <Phone className="mr-1 h-3 w-3" />
                                {project.primaryContact.phone}
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Progress Summary */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Target className="mr-2 h-5 w-5" />
                      Progress Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm font-medium text-edg-grey">Overall Progress</span>
                          <span className="text-sm font-bold text-edg-black">85%</span>
                        </div>
                        <Progress value={85} className="h-3" />
                      </div>
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm font-medium text-edg-grey">Tasks Completed</span>
                          <span className="text-sm font-bold text-edg-black">
                            {completedTasks}/{totalTasks}
                          </span>
                        </div>
                        <Progress value={taskCompletionRate} className="h-3" />
                      </div>
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm font-medium text-edg-grey">Milestones</span>
                          <span className="text-sm font-bold text-edg-black">
                            {completedMilestones}/{totalMilestones}
                          </span>
                        </div>
                        <Progress value={milestoneCompletionRate} className="h-3" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Tasks Tab */}
              <TabsContent value="tasks" className="space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div className="flex items-center space-x-4">
                    <h3 className="text-lg font-semibold text-edg-black">Project Tasks</h3>
                    <Badge variant="outline">{tasks.length} tasks</Badge>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    {/* Task View Toggle */}
                    <div className="flex items-center bg-gray-100 rounded-lg p-1">
                      <Button
                        variant={taskView === "list" ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setTaskView("list")}
                        data-testid="task-view-list"
                      >
                        <List className="h-4 w-4 mr-1" />
                        List
                      </Button>
                      <Button
                        variant={taskView === "board" ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setTaskView("board")}
                        data-testid="task-view-board"
                      >
                        <KanbanSquare className="h-4 w-4 mr-1" />
                        Board
                      </Button>
                      <Button
                        variant={taskView === "assignments" ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setTaskView("assignments")}
                        data-testid="task-view-assignments"
                      >
                        <Users className="h-4 w-4 mr-1" />
                        Team
                      </Button>
                      <Button
                        variant={taskView === "dependencies" ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setTaskView("dependencies")}
                        data-testid="task-view-dependencies"
                      >
                        <GitBranch className="h-4 w-4 mr-1" />
                        Dependencies
                      </Button>
                      <Button
                        variant={taskView === "progress" ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setTaskView("progress")}
                        data-testid="task-view-progress"
                      >
                        <Timer className="h-4 w-4 mr-1" />
                        Progress
                      </Button>
                    </div>
                    
                    <Button 
                      size="sm" 
                      onClick={() => {
                        setEditingTask(null);
                        setParentTaskId(null);
                        setIsTaskFormOpen(true);
                      }}
                      data-testid="button-add-task"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add Task
                    </Button>
                  </div>
                </div>

                {/* Task Views */}
                {taskView === "list" && (
                  <TaskList
                    projectId={projectId!}
                    onTaskSelect={setSelectedTask}
                    onCreateTask={(parentId) => {
                      setParentTaskId(parentId || null);
                      setEditingTask(null);
                      setIsTaskFormOpen(true);
                    }}
                  />
                )}

                {taskView === "board" && (
                  <TaskBoard
                    projectId={projectId!}
                    onTaskSelect={setSelectedTask}
                    onCreateTask={() => {
                      setParentTaskId(null);
                      setEditingTask(null);
                      setIsTaskFormOpen(true);
                    }}
                    onEditTask={(task) => {
                      setEditingTask(task);
                      setIsTaskFormOpen(true);
                    }}
                  />
                )}

                {taskView === "assignments" && selectedTask && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-lg font-medium">Task Assignments</h4>
                        <p className="text-sm text-gray-600">
                          Manage team assignments for: <span className="font-medium">{selectedTask.title}</span>
                        </p>
                      </div>
                      <Button 
                        variant="outline" 
                        onClick={() => setSelectedTask(null)}
                        data-testid="button-clear-task-selection"
                      >
                        View All Tasks
                      </Button>
                    </div>
                    <TaskAssignmentManager
                      taskId={selectedTask.id}
                      projectId={projectId!}
                    />
                  </div>
                )}

                {taskView === "assignments" && !selectedTask && (
                  <Card>
                    <CardContent className="text-center py-12">
                      <Users className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                      <h4 className="text-lg font-medium mb-2">Select a Task</h4>
                      <p className="text-gray-600 mb-4">
                        Choose a task from the list or board view to manage its assignments
                      </p>
                      <div className="flex justify-center space-x-2">
                        <Button variant="outline" onClick={() => setTaskView("list")}>
                          View Task List
                        </Button>
                        <Button variant="outline" onClick={() => setTaskView("board")}>
                          View Task Board
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {taskView === "dependencies" && selectedTask && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-lg font-medium">Task Dependencies</h4>
                        <p className="text-sm text-gray-600">
                          Manage dependencies for: <span className="font-medium">{selectedTask.title}</span>
                        </p>
                      </div>
                      <Button 
                        variant="outline" 
                        onClick={() => setSelectedTask(null)}
                        data-testid="button-clear-task-selection-deps"
                      >
                        View All Tasks
                      </Button>
                    </div>
                    <TaskDependenciesManager
                      taskId={selectedTask.id}
                      projectId={projectId!}
                    />
                  </div>
                )}

                {taskView === "dependencies" && !selectedTask && (
                  <Card>
                    <CardContent className="text-center py-12">
                      <GitBranch className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                      <h4 className="text-lg font-medium mb-2">Select a Task</h4>
                      <p className="text-gray-600 mb-4">
                        Choose a task to manage its dependencies and view the dependency graph
                      </p>
                      <div className="flex justify-center space-x-2">
                        <Button variant="outline" onClick={() => setTaskView("list")}>
                          View Task List
                        </Button>
                        <Button variant="outline" onClick={() => setTaskView("board")}>
                          View Task Board
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {taskView === "progress" && selectedTask && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-lg font-medium">Task Progress</h4>
                        <p className="text-sm text-gray-600">
                          Track progress for: <span className="font-medium">{selectedTask.title}</span>
                        </p>
                      </div>
                      <Button 
                        variant="outline" 
                        onClick={() => setSelectedTask(null)}
                        data-testid="button-clear-task-selection-progress"
                      >
                        View All Tasks
                      </Button>
                    </div>
                    <TaskProgressTracker
                      taskId={selectedTask.id}
                      projectId={projectId!}
                      task={selectedTask}
                    />
                  </div>
                )}

                {taskView === "progress" && !selectedTask && (
                  <Card>
                    <CardContent className="text-center py-12">
                      <Timer className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                      <h4 className="text-lg font-medium mb-2">Select a Task</h4>
                      <p className="text-gray-600 mb-4">
                        Choose a task to track its progress, log time, and add updates
                      </p>
                      <div className="flex justify-center space-x-2">
                        <Button variant="outline" onClick={() => setTaskView("list")}>
                          View Task List
                        </Button>
                        <Button variant="outline" onClick={() => setTaskView("board")}>
                          View Task Board
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Task Form Modal */}
                <TaskFormModal
                  isOpen={isTaskFormOpen}
                  onOpenChange={setIsTaskFormOpen}
                  projectId={projectId!}
                  parentTaskId={parentTaskId}
                  editTask={editingTask}
                  onSuccess={(task) => {
                    setSelectedTask(task);
                    // Auto-switch to appropriate view after creating/editing
                    if (taskView === "assignments" || taskView === "dependencies" || taskView === "progress") {
                      // Stay in current view but select the new/edited task
                    } else {
                      // Switch to list view to see the new task
                      setTaskView("list");
                    }
                  }}
                />
              </TabsContent>

              {/* Schedule Tab */}
              <TabsContent value="schedule" className="space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div className="flex items-center space-x-4">
                    <h3 className="text-lg font-semibold text-edg-black">Project Scheduling</h3>
                    <Badge variant="outline">{crew.length + equipment.length} resources</Badge>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    {/* Schedule View Toggle */}
                    <div className="flex items-center bg-gray-100 rounded-lg p-1">
                      <Button
                        variant={scheduleView === "dashboard" ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setScheduleView("dashboard")}
                        data-testid="schedule-view-dashboard"
                      >
                        <Target className="h-4 w-4 mr-1" />
                        Dashboard
                      </Button>
                      <Button
                        variant={scheduleView === "calendar" ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setScheduleView("calendar")}
                        data-testid="schedule-view-calendar"
                      >
                        <Calendar className="h-4 w-4 mr-1" />
                        Calendar
                      </Button>
                      <Button
                        variant={scheduleView === "crew" ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setScheduleView("crew")}
                        data-testid="schedule-view-crew"
                      >
                        <Users className="h-4 w-4 mr-1" />
                        Crew
                      </Button>
                      <Button
                        variant={scheduleView === "events" ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setScheduleView("events")}
                        data-testid="schedule-view-events"
                      >
                        <Clock className="h-4 w-4 mr-1" />
                        Events
                      </Button>
                      <Button
                        variant={scheduleView === "availability" ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setScheduleView("availability")}
                        data-testid="schedule-view-availability"
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                        Availability
                      </Button>
                      <Button
                        variant={scheduleView === "equipment" ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setScheduleView("equipment")}
                        data-testid="schedule-view-equipment"
                      >
                        <Wrench className="h-4 w-4 mr-1" />
                        Equipment
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Schedule Views */}
                {scheduleView === "dashboard" && (
                  <ScheduleDashboard
                    projectId={projectId!}
                    showAllProjects={false}
                    onNavigateToSchedule={(view, resourceId) => {
                      setScheduleView(view);
                      if (resourceId) {
                        setSelectedResourceId(resourceId);
                      }
                    }}
                    onCreateScheduleEvent={() => setScheduleView("events")}
                    onManageResource={(resourceType, resourceId) => {
                      setSelectedResourceId(resourceId);
                      setScheduleView(resourceType === 'crew_member' ? 'crew' : 'equipment');
                    }}
                  />
                )}

                {scheduleView === "calendar" && (
                  <ResourceCalendar
                    projectId={projectId!}
                    showAllProjects={false}
                    selectedResourceTypes={['crew_member', 'equipment', 'vehicle', 'external_contractor']}
                    onEventClick={(event) => {
                      console.log('Event clicked:', event);
                      // Handle event details view
                    }}
                    onEventCreate={() => setScheduleView("events")}
                    onEventUpdate={(event) => {
                      console.log('Event updated:', event);
                      toast({
                        title: "Event Updated",
                        description: "Schedule event has been updated successfully."
                      });
                    }}
                  />
                )}

                {scheduleView === "crew" && (
                  <CrewAllocation
                    projectId={projectId!}
                    showAllProjects={false}
                    onCrewMemberClick={(crewMember) => {
                      setSelectedResourceId(crewMember.id);
                      console.log('Crew member clicked:', crewMember);
                    }}
                    onAssignmentUpdate={(assignment) => {
                      console.log('Assignment updated:', assignment);
                      toast({
                        title: "Assignment Updated",
                        description: "Crew assignment has been updated successfully."
                      });
                    }}
                  />
                )}

                {scheduleView === "events" && (
                  <ScheduleEventsManager
                    projectId={projectId!}
                    showAllProjects={false}
                    preSelectedResource={selectedResourceId ? {
                      id: selectedResourceId,
                      type: crew.find(c => c.id === selectedResourceId) ? 'crew_member' : 'equipment'
                    } : undefined}
                    onEventCreated={(event) => {
                      console.log('Event created:', event);
                      toast({
                        title: "Event Created",
                        description: "Schedule event has been created successfully."
                      });
                    }}
                    onEventUpdated={(event) => {
                      console.log('Event updated:', event);
                      toast({
                        title: "Event Updated", 
                        description: "Schedule event has been updated successfully."
                      });
                    }}
                    onEventDeleted={(eventId) => {
                      console.log('Event deleted:', eventId);
                      toast({
                        title: "Event Deleted",
                        description: "Schedule event has been deleted successfully."
                      });
                    }}
                  />
                )}

                {scheduleView === "availability" && (
                  <ResourceAvailabilityTracker
                    projectId={projectId!}
                    selectedResourceId={selectedResourceId}
                    showAllResources={!selectedResourceId}
                    onAvailabilityUpdate={(resourceId, availability) => {
                      console.log('Availability updated:', resourceId, availability);
                      toast({
                        title: "Availability Updated",
                        description: "Resource availability has been updated successfully."
                      });
                    }}
                  />
                )}

                {scheduleView === "equipment" && (
                  <EquipmentSchedule
                    projectId={projectId!}
                    showAllProjects={false}
                    selectedEquipmentId={selectedResourceId}
                    onEquipmentScheduled={(equipmentId, event) => {
                      console.log('Equipment scheduled:', equipmentId, event);
                      toast({
                        title: "Equipment Scheduled",
                        description: "Equipment has been scheduled successfully."
                      });
                    }}
                    onMaintenanceScheduled={(equipmentId, maintenance) => {
                      console.log('Maintenance scheduled:', equipmentId, maintenance);
                      toast({
                        title: "Maintenance Scheduled",
                        description: "Equipment maintenance has been scheduled successfully."
                      });
                    }}
                  />
                )}
              </TabsContent>

              {/* Progress Tab */}
              <TabsContent value="progress" className="space-y-6">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold text-edg-black">Progress Updates</h3>
                  <Button size="sm" data-testid="button-add-progress">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Update
                  </Button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <Card className="lg:col-span-2">
                    <CardHeader>
                      <CardTitle className="flex items-center">
                        <ActivityIcon className="mr-2 h-5 w-5" />
                        Progress Timeline
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {progressEntries.length === 0 ? (
                          <p className="text-center text-edg-grey py-8">No progress updates yet</p>
                        ) : (
                          progressEntries.slice(0, 5).map((entry) => (
                            <div key={entry.id} className="flex space-x-4 p-4 bg-gray-50 rounded-lg">
                              <div className="flex-shrink-0">
                                <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                              </div>
                              <div className="flex-1">
                                <p className="font-medium text-edg-black">{entry.title}</p>
                                {entry.description && (
                                  <p className="text-sm text-edg-grey mt-1">{entry.description}</p>
                                )}
                                <p className="text-xs text-edg-grey mt-2">
                                  {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
                                </p>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center">
                        <Camera className="mr-2 h-5 w-5" />
                        Progress Photos
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-center py-8">
                        <Camera className="mx-auto h-8 w-8 text-gray-400" />
                        <p className="text-sm text-edg-grey mt-2">No photos uploaded yet</p>
                        <Button variant="outline" size="sm" className="mt-3" data-testid="button-upload-photo">
                          <Plus className="mr-2 h-4 w-4" />
                          Upload Photo
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Financials Tab */}
              <TabsContent value="financials" className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center">
                        <DollarSign className="h-6 w-6 text-green-500" />
                        <div className="ml-3">
                          <p className="text-sm font-medium text-edg-grey">Estimated Cost</p>
                          <p className="text-xl font-bold text-edg-black">
                            {formatCurrency(estimatedCost)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center">
                        <DollarSign className="h-6 w-6 text-blue-500" />
                        <div className="ml-3">
                          <p className="text-sm font-medium text-edg-grey">Actual Cost</p>
                          <p className="text-xl font-bold text-edg-black">
                            {formatCurrency(actualCost)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center">
                        <TrendingUp className={`h-6 w-6 ${budgetVariance >= 0 ? 'text-red-500' : 'text-green-500'}`} />
                        <div className="ml-3">
                          <p className="text-sm font-medium text-edg-grey">Budget Variance</p>
                          <p className={`text-xl font-bold ${budgetVariance >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {budgetVariance >= 0 ? '+' : ''}{formatCurrency(budgetVariance)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <FileText className="mr-2 h-5 w-5" />
                      Budget Breakdown
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Category</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Estimated</TableHead>
                          <TableHead>Actual</TableHead>
                          <TableHead>Variance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {budgetLines.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-8 text-edg-grey">
                              No budget lines defined
                            </TableCell>
                          </TableRow>
                        ) : (
                          budgetLines.map((line) => {
                            const estimated = parseFloat(line.estimatedTotalCost.toString());
                            const actual = parseFloat(line.actualTotalCost.toString());
                            const variance = actual - estimated;
                            
                            return (
                              <TableRow key={line.id}>
                                <TableCell className="font-medium">{line.category}</TableCell>
                                <TableCell>{line.description}</TableCell>
                                <TableCell>{formatCurrency(estimated)}</TableCell>
                                <TableCell>{formatCurrency(actual)}</TableCell>
                                <TableCell className={variance >= 0 ? 'text-red-600' : 'text-green-600'}>
                                  {variance >= 0 ? '+' : ''}{formatCurrency(variance)}
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Resources Tab */}
              <TabsContent value="resources" className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span className="flex items-center">
                          <Users className="mr-2 h-5 w-5" />
                          Crew Members
                        </span>
                        <Button size="sm" data-testid="button-add-crew">
                          <Plus className="h-4 w-4" />
                        </Button>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {crew.length === 0 ? (
                          <p className="text-center text-edg-grey py-8">No crew members assigned</p>
                        ) : (
                          crew.map((member) => (
                            <div key={member.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                              <div className="flex items-center space-x-3">
                                <Avatar className="h-8 w-8">
                                  <AvatarFallback>
                                    {member.externalContractorName 
                                      ? member.externalContractorName.charAt(0).toUpperCase()
                                      : 'U'
                                    }
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="font-medium text-edg-black">
                                    {member.externalContractorName || 'Internal Member'}
                                  </p>
                                  <p className="text-sm text-edg-grey">{member.role}</p>
                                </div>
                              </div>
                              <Badge className={member.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                                {member.isActive ? 'Active' : 'Inactive'}
                              </Badge>
                            </div>
                          ))
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span className="flex items-center">
                          <Wrench className="mr-2 h-5 w-5" />
                          Equipment
                        </span>
                        <Button size="sm" data-testid="button-add-equipment">
                          <Plus className="h-4 w-4" />
                        </Button>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {equipment.length === 0 ? (
                          <p className="text-center text-edg-grey py-8">No equipment allocated</p>
                        ) : (
                          equipment.map((item) => (
                            <div key={item.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                              <div>
                                <p className="font-medium text-edg-black">{item.equipmentName}</p>
                                <p className="text-sm text-edg-grey">{item.equipmentType}</p>
                              </div>
                              <Badge className={`${
                                item.status === 'in_use' ? 'bg-green-100 text-green-800' :
                                item.status === 'allocated' ? 'bg-blue-100 text-blue-800' :
                                item.status === 'maintenance' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {item.status?.replace('_', ' ') || 'allocated'}
                              </Badge>
                            </div>
                          ))
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Documents Tab */}
              <TabsContent value="documents" className="space-y-6">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold text-edg-black">Project Documents</h3>
                  <Button size="sm" data-testid="button-upload-document">
                    <Plus className="mr-2 h-4 w-4" />
                    Upload Document
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {['Contracts', 'Change Orders', 'Receipts', 'Permits', 'Reports', 'Photos'].map((category) => (
                    <Card key={category}>
                      <CardHeader>
                        <CardTitle className="text-base">{category}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-center py-8">
                          <FileText className="mx-auto h-8 w-8 text-gray-400" />
                          <p className="text-sm text-edg-grey mt-2">No {category.toLowerCase()} uploaded</p>
                          <Button variant="outline" size="sm" className="mt-3" data-testid={`button-upload-${category.toLowerCase()}`}>
                            <Plus className="mr-2 h-4 w-4" />
                            Upload
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button variant="outline" size="sm" className="w-full justify-start" data-testid="button-add-task-sidebar">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Task
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start" data-testid="button-update-progress">
                  <ActivityIcon className="mr-2 h-4 w-4" />
                  Update Progress
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start" data-testid="button-add-expense">
                  <DollarSign className="mr-2 h-4 w-4" />
                  Add Expense
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start" data-testid="button-schedule-meeting">
                  <Calendar className="mr-2 h-4 w-4" />
                  Schedule Meeting
                </Button>
              </CardContent>
            </Card>

            {/* Project Team */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Project Team</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {project.projectManager && (
                    <div className="flex items-center space-x-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>
                          {project.projectManager.firstName?.charAt(0)}{project.projectManager.lastName?.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium text-edg-black">
                          {project.projectManager.firstName} {project.projectManager.lastName}
                        </p>
                        <p className="text-xs text-edg-grey">Project Manager</p>
                      </div>
                    </div>
                  )}
                  
                  {crew.slice(0, 3).map((member) => (
                    <div key={member.id} className="flex items-center space-x-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>
                          {member.externalContractorName?.charAt(0).toUpperCase() || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium text-edg-black">
                          {member.externalContractorName || 'Internal Member'}
                        </p>
                        <p className="text-xs text-edg-grey">{member.role}</p>
                      </div>
                    </div>
                  ))}
                  
                  {crew.length > 3 && (
                    <p className="text-xs text-edg-grey">+{crew.length - 3} more team members</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="text-sm">
                    <p className="text-edg-black">Project created</p>
                    <p className="text-xs text-edg-grey">
                      {formatDistanceToNow(new Date(project.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                  {project.updatedAt !== project.createdAt && (
                    <div className="text-sm">
                      <p className="text-edg-black">Project updated</p>
                      <p className="text-xs text-edg-grey">
                        {formatDistanceToNow(new Date(project.updatedAt), { addSuffix: true })}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}