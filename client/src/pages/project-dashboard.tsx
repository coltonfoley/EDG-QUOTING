import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from "@/components/ui/chart";
import { 
  Building2, 
  Users, 
  Clock, 
  DollarSign, 
  TrendingUp, 
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Activity as ActivityIcon,
  Target,
  Wrench,
  FileText,
  Plus,
  ArrowRight,
  BarChart3,
  PieChart,
  Settings
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, PieChart as RechartsPieChart, Pie, Cell, LineChart, Line, ResponsiveContainer, Area, AreaChart } from "recharts";
import { Link } from "wouter";
import { format, subDays, subMonths, startOfMonth, endOfMonth, parseISO, differenceInDays } from "date-fns";
import { formatCurrency } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useState, useMemo } from "react";
import type { 
  ProjectListItem, 
  ProjectTaskWithDetails, 
  ProjectMilestone, 
  ProjectCrewWithDetails,
  ProjectEquipment,
  ProjectChangeOrderWithDetails,
  ProjectFinancialSummary
} from "@shared/schema";

interface ProjectMetrics {
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  overdueProjects: number;
  totalValue: number;
  completedValue: number;
  averageProgress: number;
  totalTasks: number;
  completedTasks: number;
  milestonesCompleted: number;
  totalMilestones: number;
  activeCrewMembers: number;
  equipmentInUse: number;
  changeOrdersPending: number;
  totalBudgetVariance: number;
  scheduleVariance: number;
}

export default function ProjectDashboardPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [timeRange, setTimeRange] = useState("30d");
  const [activeTab, setActiveTab] = useState("overview");

  // Fetch main project data
  const { data: projects = [], isLoading: projectsLoading } = useQuery<ProjectListItem[]>({
    queryKey: ["/api/projects"],
    enabled: isAuthenticated,
  });

  // Fetch project tasks for task analytics
  const { data: allTasks = [], isLoading: tasksLoading } = useQuery<ProjectTaskWithDetails[]>({
    queryKey: ["/api/project-tasks", "all"],
    queryFn: async () => {
      // Fetch tasks for all projects
      const allProjectTasks: ProjectTaskWithDetails[] = [];
      for (const project of projects) {
        try {
          const response = await fetch(`/api/projects/${project.id}/tasks`);
          if (response.ok) {
            const tasks = await response.json();
            allProjectTasks.push(...tasks);
          }
        } catch (error) {
          console.warn(`Failed to fetch tasks for project ${project.id}:`, error);
        }
      }
      return allProjectTasks;
    },
    enabled: isAuthenticated && projects.length > 0,
  });

  // Fetch milestones across all projects
  const { data: allMilestones = [], isLoading: milestonesLoading } = useQuery<ProjectMilestone[]>({
    queryKey: ["/api/project-milestones", "all"],
    queryFn: async () => {
      const allProjectMilestones: ProjectMilestone[] = [];
      for (const project of projects) {
        try {
          const response = await fetch(`/api/projects/${project.id}/milestones`);
          if (response.ok) {
            const milestones = await response.json();
            allProjectMilestones.push(...milestones);
          }
        } catch (error) {
          console.warn(`Failed to fetch milestones for project ${project.id}:`, error);
        }
      }
      return allProjectMilestones;
    },
    enabled: isAuthenticated && projects.length > 0,
  });

  // Fetch crew data across all projects
  const { data: allCrew = [], isLoading: crewLoading } = useQuery<ProjectCrewWithDetails[]>({
    queryKey: ["/api/project-crew", "all"],
    queryFn: async () => {
      const allProjectCrew: ProjectCrewWithDetails[] = [];
      for (const project of projects) {
        try {
          const response = await fetch(`/api/projects/${project.id}/crew`);
          if (response.ok) {
            const crew = await response.json();
            allProjectCrew.push(...crew);
          }
        } catch (error) {
          console.warn(`Failed to fetch crew for project ${project.id}:`, error);
        }
      }
      return allProjectCrew;
    },
    enabled: isAuthenticated && projects.length > 0,
  });

  // Fetch equipment data
  const { data: allEquipment = [], isLoading: equipmentLoading } = useQuery<ProjectEquipment[]>({
    queryKey: ["/api/project-equipment", "all"],
    queryFn: async () => {
      const allProjectEquipment: ProjectEquipment[] = [];
      for (const project of projects) {
        try {
          const response = await fetch(`/api/projects/${project.id}/equipment`);
          if (response.ok) {
            const equipment = await response.json();
            allProjectEquipment.push(...equipment);
          }
        } catch (error) {
          console.warn(`Failed to fetch equipment for project ${project.id}:`, error);
        }
      }
      return allProjectEquipment;
    },
    enabled: isAuthenticated && projects.length > 0,
  });

  // Filter data based on time range
  const filteredProjects = useMemo(() => {
    const now = new Date();
    let cutoffDate: Date;
    
    switch (timeRange) {
      case "7d":
        cutoffDate = subDays(now, 7);
        break;
      case "30d":
        cutoffDate = subDays(now, 30);
        break;
      case "90d":
        cutoffDate = subDays(now, 90);
        break;
      case "1y":
        cutoffDate = subDays(now, 365);
        break;
      default:
        return projects;
    }
    
    return projects.filter(project => new Date(project.createdAt) >= cutoffDate);
  }, [projects, timeRange]);

  // Calculate comprehensive project metrics
  const metrics: ProjectMetrics = useMemo(() => {
    const totalProjects = filteredProjects.length;
    const activeProjects = filteredProjects.filter(p => ['planning', 'in_progress'].includes(p.status)).length;
    const completedProjects = filteredProjects.filter(p => p.status === 'completed').length;
    const overdueProjects = filteredProjects.filter(p => p.isOverdue).length;
    
    const totalValue = filteredProjects.reduce((sum, p) => 
      sum + (p.estimatedTotalCost ? parseFloat(p.estimatedTotalCost.toString()) : 0), 0);
    
    const completedValue = filteredProjects
      .filter(p => p.status === 'completed')
      .reduce((sum, p) => sum + (p.estimatedTotalCost ? parseFloat(p.estimatedTotalCost.toString()) : 0), 0);
    
    const averageProgress = totalProjects > 0 ? 
      filteredProjects.reduce((sum, p) => sum + p.progressPercentage, 0) / totalProjects : 0;
    
    const totalTasks = allTasks.length;
    const completedTasks = allTasks.filter(t => t.status === 'completed').length;
    
    const totalMilestones = allMilestones.length;
    const milestonesCompleted = allMilestones.filter(m => m.status === 'completed').length;
    
    const activeCrewMembers = allCrew.filter(c => c.isActive).length;
    const equipmentInUse = allEquipment.filter(e => e.status === 'in_use').length;
    
    // Calculate budget variance (simplified)
    const totalBudgetVariance = filteredProjects.reduce((sum, p) => {
      const estimated = p.estimatedTotalCost ? parseFloat(p.estimatedTotalCost.toString()) : 0;
      const actual = p.actualTotalCost ? parseFloat(p.actualTotalCost.toString()) : 0;
      return sum + (actual - estimated);
    }, 0);

    // Calculate schedule variance in days
    const scheduleVariance = filteredProjects.reduce((sum, p) => {
      if (p.estimatedEndDate && p.actualEndDate) {
        return sum + differenceInDays(new Date(p.actualEndDate), new Date(p.estimatedEndDate));
      }
      if (p.estimatedEndDate && p.status !== 'completed') {
        const now = new Date();
        return sum + differenceInDays(now, new Date(p.estimatedEndDate));
      }
      return sum;
    }, 0);
    
    return {
      totalProjects,
      activeProjects,
      completedProjects,
      overdueProjects,
      totalValue,
      completedValue,
      averageProgress: Math.round(averageProgress),
      totalTasks,
      completedTasks,
      milestonesCompleted,
      totalMilestones,
      activeCrewMembers,
      equipmentInUse,
      changeOrdersPending: 0, // TODO: Implement change orders tracking
      totalBudgetVariance,
      scheduleVariance: Math.round(scheduleVariance),
    };
  }, [filteredProjects, allTasks, allMilestones, allCrew, allEquipment]);

  // Chart data preparation
  const statusChartData = useMemo(() => {
    const statusCounts = filteredProjects.reduce((acc, project) => {
      acc[project.status] = (acc[project.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const colors = {
      planning: "#3b82f6",
      in_progress: "#10b981",
      on_hold: "#f59e0b",
      completed: "#059669",
      billed: "#8b5cf6",
      cancelled: "#ef4444"
    };

    return Object.entries(statusCounts).map(([status, count]) => ({
      name: status.replace('_', ' ').toUpperCase(),
      value: count,
      color: colors[status as keyof typeof colors] || "#6b7280"
    }));
  }, [filteredProjects]);

  const progressChartData = useMemo(() => {
    // Group projects by progress ranges
    const ranges = [
      { label: "0-20%", min: 0, max: 20 },
      { label: "21-40%", min: 21, max: 40 },
      { label: "41-60%", min: 41, max: 60 },
      { label: "61-80%", min: 61, max: 80 },
      { label: "81-100%", min: 81, max: 100 }
    ];

    return ranges.map(range => ({
      range: range.label,
      count: filteredProjects.filter(p => 
        p.progressPercentage >= range.min && p.progressPercentage <= range.max
      ).length
    }));
  }, [filteredProjects]);

  const revenueChartData = useMemo(() => {
    // Generate monthly revenue data for the last 6 months
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const month = subMonths(new Date(), i);
      const monthStart = startOfMonth(month);
      const monthEnd = endOfMonth(month);
      
      const monthRevenue = filteredProjects
        .filter(p => 
          p.status === 'completed' && 
          p.actualEndDate &&
          new Date(p.actualEndDate) >= monthStart &&
          new Date(p.actualEndDate) <= monthEnd
        )
        .reduce((sum, p) => sum + (p.estimatedTotalCost ? parseFloat(p.estimatedTotalCost.toString()) : 0), 0);

      months.push({
        month: format(month, 'MMM'),
        revenue: monthRevenue,
        projects: filteredProjects.filter(p => 
          p.status === 'completed' && 
          p.actualEndDate &&
          new Date(p.actualEndDate) >= monthStart &&
          new Date(p.actualEndDate) <= monthEnd
        ).length
      });
    }
    return months;
  }, [filteredProjects]);

  const upcomingMilestones = useMemo(() => {
    return allMilestones
      .filter(m => m.status !== 'completed' && m.targetDate)
      .sort((a, b) => new Date(a.targetDate!).getTime() - new Date(b.targetDate!).getTime())
      .slice(0, 10);
  }, [allMilestones]);

  const isLoading = projectsLoading || tasksLoading || milestonesLoading || crewLoading || equipmentLoading;

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
            <h2 className="text-3xl font-bold text-edg-black">Project Dashboard</h2>
            <p className="text-edg-grey mt-2">Real-time insights into project performance and progress</p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-full sm:w-40" data-testid="select-time-range">
                <SelectValue placeholder="Time Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
                <SelectItem value="1y">Last year</SelectItem>
              </SelectContent>
            </Select>
            <Link href="/projects">
              <Button variant="outline" className="w-full sm:w-auto">
                <FileText className="mr-2 h-4 w-4" />
                View All Projects
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

        {/* Key Metrics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <Building2 className="h-6 w-6 text-edg-teal" />
                <div className="ml-3">
                  <p className="text-xs font-medium text-edg-grey">Total Projects</p>
                  <p className="text-xl font-bold text-edg-black">{metrics.totalProjects}</p>
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
                  <p className="text-xl font-bold text-edg-black">{metrics.activeProjects}</p>
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
                  <p className="text-xl font-bold text-edg-black">{metrics.completedProjects}</p>
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
                  <p className="text-xl font-bold text-edg-black">{metrics.overdueProjects}</p>
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
                  <p className="text-lg font-bold text-edg-black">{formatCurrency(metrics.totalValue)}</p>
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
                  <p className="text-xl font-bold text-edg-black">{metrics.averageProgress}%</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Analytics */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="progress" data-testid="tab-progress">Progress</TabsTrigger>
            <TabsTrigger value="financial" data-testid="tab-financial">Financial</TabsTrigger>
            <TabsTrigger value="resources" data-testid="tab-resources">Resources</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Project Status Distribution */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <PieChart className="mr-2 h-5 w-5" />
                    Project Status Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsPieChart>
                        <Pie
                          data={statusChartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {statusChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <ChartLegend content={<ChartLegendContent />} />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Progress Distribution */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <BarChart3 className="mr-2 h-5 w-5" />
                    Progress Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={progressChartData}>
                        <XAxis dataKey="range" />
                        <YAxis />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="count" fill="#059669" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Task and Milestone Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <CheckCircle2 className="mr-2 h-5 w-5" />
                    Task Completion
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-edg-grey">Completed Tasks</span>
                      <span className="text-sm font-bold text-edg-black">
                        {metrics.completedTasks} / {metrics.totalTasks}
                      </span>
                    </div>
                    <Progress 
                      value={metrics.totalTasks > 0 ? (metrics.completedTasks / metrics.totalTasks) * 100 : 0} 
                      className="h-3" 
                    />
                    <p className="text-xs text-edg-grey">
                      {metrics.totalTasks > 0 ? Math.round((metrics.completedTasks / metrics.totalTasks) * 100) : 0}% of all tasks completed
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Target className="mr-2 h-5 w-5" />
                    Milestone Progress
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-edg-grey">Completed Milestones</span>
                      <span className="text-sm font-bold text-edg-black">
                        {metrics.milestonesCompleted} / {metrics.totalMilestones}
                      </span>
                    </div>
                    <Progress 
                      value={metrics.totalMilestones > 0 ? (metrics.milestonesCompleted / metrics.totalMilestones) * 100 : 0} 
                      className="h-3" 
                    />
                    <p className="text-xs text-edg-grey">
                      {metrics.totalMilestones > 0 ? Math.round((metrics.milestonesCompleted / metrics.totalMilestones) * 100) : 0}% of milestones completed
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="progress" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Upcoming Milestones */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Calendar className="mr-2 h-5 w-5" />
                    Upcoming Milestones
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {upcomingMilestones.length === 0 ? (
                      <p className="text-sm text-edg-grey text-center py-8">No upcoming milestones</p>
                    ) : (
                      upcomingMilestones.map((milestone) => (
                        <div key={milestone.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-edg-black">{milestone.name}</p>
                            <p className="text-xs text-edg-grey">
                              Due: {format(new Date(milestone.targetDate!), 'MMM dd, yyyy')}
                            </p>
                          </div>
                          <Badge className={`ml-2 ${
                            milestone.status === 'completed' ? 'bg-green-100 text-green-800' :
                            milestone.status === 'overdue' ? 'bg-red-100 text-red-800' :
                            milestone.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {milestone.status.replace('_', ' ')}
                          </Badge>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Schedule Performance */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Clock className="mr-2 h-5 w-5" />
                    Schedule Performance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center p-4 bg-blue-50 rounded-lg">
                        <p className="text-lg font-bold text-blue-600">{metrics.activeProjects}</p>
                        <p className="text-sm text-blue-600">On Track</p>
                      </div>
                      <div className="text-center p-4 bg-red-50 rounded-lg">
                        <p className="text-lg font-bold text-red-600">{metrics.overdueProjects}</p>
                        <p className="text-sm text-red-600">Behind Schedule</p>
                      </div>
                    </div>
                    <div className="text-center p-4 bg-gray-50 rounded-lg">
                      <p className="text-lg font-bold text-edg-black">
                        {metrics.scheduleVariance > 0 ? '+' : ''}{metrics.scheduleVariance} days
                      </p>
                      <p className="text-sm text-edg-grey">Average Schedule Variance</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="financial" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Monthly Revenue Trend */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <TrendingUp className="mr-2 h-5 w-5" />
                    Monthly Revenue Trend
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={revenueChartData}>
                        <XAxis dataKey="month" />
                        <YAxis />
                        <ChartTooltip 
                          content={<ChartTooltipContent />}
                          formatter={(value: number) => [formatCurrency(value), "Revenue"]}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="revenue" 
                          stroke="#059669" 
                          fill="#059669" 
                          fillOpacity={0.3}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Financial Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <DollarSign className="mr-2 h-5 w-5" />
                    Financial Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                      <span className="text-sm font-medium text-green-700">Completed Value</span>
                      <span className="text-lg font-bold text-green-700">
                        {formatCurrency(metrics.completedValue)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                      <span className="text-sm font-medium text-blue-700">Total Pipeline</span>
                      <span className="text-lg font-bold text-blue-700">
                        {formatCurrency(metrics.totalValue)}
                      </span>
                    </div>
                    <div className={`flex justify-between items-center p-3 rounded-lg ${
                      metrics.totalBudgetVariance >= 0 ? 'bg-red-50' : 'bg-green-50'
                    }`}>
                      <span className={`text-sm font-medium ${
                        metrics.totalBudgetVariance >= 0 ? 'text-red-700' : 'text-green-700'
                      }`}>
                        Budget Variance
                      </span>
                      <span className={`text-lg font-bold ${
                        metrics.totalBudgetVariance >= 0 ? 'text-red-700' : 'text-green-700'
                      }`}>
                        {metrics.totalBudgetVariance >= 0 ? '+' : ''}{formatCurrency(metrics.totalBudgetVariance)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="resources" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Crew Utilization */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Users className="mr-2 h-5 w-5" />
                    Crew Resources
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-edg-black">{metrics.activeCrewMembers}</p>
                      <p className="text-sm text-edg-grey">Active Crew Members</p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-edg-grey">Utilization Rate</span>
                        <span className="text-edg-black">
                          {allCrew.length > 0 ? Math.round((metrics.activeCrewMembers / allCrew.length) * 100) : 0}%
                        </span>
                      </div>
                      <Progress 
                        value={allCrew.length > 0 ? (metrics.activeCrewMembers / allCrew.length) * 100 : 0} 
                        className="h-2" 
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Equipment Status */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Wrench className="mr-2 h-5 w-5" />
                    Equipment Status
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-edg-black">{metrics.equipmentInUse}</p>
                      <p className="text-sm text-edg-grey">Equipment In Use</p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-edg-grey">Utilization Rate</span>
                        <span className="text-edg-black">
                          {allEquipment.length > 0 ? Math.round((metrics.equipmentInUse / allEquipment.length) * 100) : 0}%
                        </span>
                      </div>
                      <Progress 
                        value={allEquipment.length > 0 ? (metrics.equipmentInUse / allEquipment.length) * 100 : 0} 
                        className="h-2" 
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Quick Actions */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <ActivityIcon className="mr-2 h-5 w-5" />
                    Quick Actions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <Link href="/projects/new" className="w-full">
                      <Button variant="outline" size="sm" className="w-full justify-start" data-testid="button-new-project">
                        <Plus className="mr-2 h-4 w-4" />
                        New Project
                      </Button>
                    </Link>
                    <Link href="/projects" className="w-full">
                      <Button variant="outline" size="sm" className="w-full justify-start" data-testid="button-view-projects">
                        <FileText className="mr-2 h-4 w-4" />
                        View All Projects
                      </Button>
                    </Link>
                    <Link href="/quotes" className="w-full">
                      <Button variant="outline" size="sm" className="w-full justify-start" data-testid="button-convert-quote">
                        <ArrowRight className="mr-2 h-4 w-4" />
                        Convert Quote
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}