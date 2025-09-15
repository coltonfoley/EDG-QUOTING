import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { 
  Calendar as CalendarIcon,
  Users,
  Wrench,
  Clock,
  DollarSign,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Activity,
  CheckCircle2,
  XCircle,
  Bell,
  Filter,
  Download,
  RefreshCw,
  Plus,
  Eye,
  Settings,
  MapPin,
  Target,
  Zap,
  PieChart,
  FileText
} from "lucide-react";
import { format, startOfWeek, endOfWeek, addDays, differenceInDays, isAfter, isBefore } from "date-fns";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { 
  ProjectWithDetails,
  ProjectCrew,
  ProjectEquipment,
  ProjectScheduleEvent,
  ProjectTask
} from "@shared/schema";

interface ScheduleDashboardProps {
  projectId?: number;
  showAllProjects?: boolean;
  dateRange?: {
    start: Date;
    end: Date;
  };
  onNavigateToSchedule?: (view: string, resourceId?: number) => void;
  onCreateScheduleEvent?: () => void;
  onManageResource?: (resourceType: string, resourceId: number) => void;
}

interface DashboardMetrics {
  totalCrew: number;
  activeCrew: number;
  totalEquipment: number;
  availableEquipment: number;
  upcomingEvents: number;
  overdueItems: number;
  averageUtilization: number;
  totalRevenue: number;
  costSavings: number;
  effiencyRating: number;
}

interface ResourceAlert {
  id: string;
  type: 'conflict' | 'overdue' | 'maintenance' | 'availability' | 'cost';
  severity: 'low' | 'medium' | 'high' | 'critical';
  resourceType: 'crew_member' | 'equipment' | 'project';
  resourceId: number;
  resourceName: string;
  title: string;
  description: string;
  actionRequired: boolean;
  dueDate?: Date;
  estimatedImpact?: string;
}

interface ScheduleConflict {
  id: string;
  resourceType: string;
  resourceId: number;
  resourceName: string;
  conflictingEvents: {
    id: number;
    title: string;
    startDate: Date;
    endDate: Date;
    projectName: string;
  }[];
  severity: 'minor' | 'major' | 'critical';
  suggestedAction: string;
}

interface UtilizationMetric {
  resourceId: number;
  resourceName: string;
  resourceType: string;
  currentUtilization: number;
  targetUtilization: number;
  variance: number;
  trend: 'up' | 'down' | 'stable';
  weeklyHours: number;
  projectedRevenue: number;
}

const getSeverityColor = (severity: string) => {
  switch (severity) {
    case 'critical': return 'bg-red-100 text-red-800 border-red-200';
    case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
    case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'low': return 'bg-blue-100 text-blue-800 border-blue-200';
    default: return 'bg-gray-100 text-gray-600 border-gray-200';
  }
};

const getAlertIcon = (type: string) => {
  switch (type) {
    case 'conflict': return <XCircle className="h-4 w-4" />;
    case 'overdue': return <AlertTriangle className="h-4 w-4" />;
    case 'maintenance': return <Settings className="h-4 w-4" />;
    case 'availability': return <Users className="h-4 w-4" />;
    case 'cost': return <DollarSign className="h-4 w-4" />;
    default: return <Bell className="h-4 w-4" />;
  }
};

const getTrendIcon = (trend: string) => {
  switch (trend) {
    case 'up': return <TrendingUp className="h-4 w-4 text-green-500" />;
    case 'down': return <TrendingDown className="h-4 w-4 text-red-500" />;
    default: return <Activity className="h-4 w-4 text-gray-500" />;
  }
};

export default function ScheduleDashboard({
  projectId,
  showAllProjects = false,
  dateRange = {
    start: startOfWeek(new Date()),
    end: endOfWeek(addDays(new Date(), 30))
  },
  onNavigateToSchedule,
  onCreateScheduleEvent,
  onManageResource
}: ScheduleDashboardProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);
  const [alertsFilter, setAlertsFilter] = useState<string>('all');
  
  const { toast } = useToast();

  // Fetch dashboard data
  const { data: projects = [], isLoading: projectsLoading } = useQuery<ProjectWithDetails[]>({
    queryKey: ["/api/projects"],
    enabled: showAllProjects,
  });

  const { data: crewMembers = [] } = useQuery<ProjectCrew[]>({
    queryKey: ["/api/projects", projectId, "crew"],
    enabled: !!projectId,
  });

  const { data: equipment = [] } = useQuery<ProjectEquipment[]>({
    queryKey: ["/api/projects", projectId, "equipment"],
    enabled: !!projectId,
  });

  const { data: scheduleEvents = [] } = useQuery<ProjectScheduleEvent[]>({
    queryKey: ["/api/schedule-events", { 
      projectId: showAllProjects ? undefined : projectId,
      startDate: dateRange.start.toISOString(),
      endDate: dateRange.end.toISOString()
    }],
  });

  const { data: tasks = [] } = useQuery<ProjectTask[]>({
    queryKey: ["/api/projects", projectId, "tasks"],
    enabled: !!projectId,
  });

  // Mock data for demonstration - in real implementation, this would come from APIs
  const [resourceAlerts] = useState<ResourceAlert[]>([
    {
      id: '1',
      type: 'conflict',
      severity: 'high',
      resourceType: 'crew_member',
      resourceId: 1,
      resourceName: 'John Doe',
      title: 'Schedule Conflict',
      description: 'Double-booked on March 15th - Site A and Site B projects overlap',
      actionRequired: true,
      dueDate: new Date(),
      estimatedImpact: '8 hours delay'
    },
    {
      id: '2',
      type: 'maintenance',
      severity: 'medium',
      resourceType: 'equipment',
      resourceId: 1,
      resourceName: 'Excavator CAT 320',
      title: 'Maintenance Due',
      description: 'Routine maintenance scheduled for tomorrow',
      actionRequired: false,
      dueDate: addDays(new Date(), 1)
    },
    {
      id: '3',
      type: 'cost',
      severity: 'low',
      resourceType: 'equipment',
      resourceId: 2,
      resourceName: 'Crane 50T',
      title: 'Underutilized Asset',
      description: 'Equipment utilization below 30% this week',
      actionRequired: false,
      estimatedImpact: '$2,400 potential savings'
    }
  ]);

  // Calculate dashboard metrics
  const dashboardMetrics: DashboardMetrics = useMemo(() => {
    const totalCrew = crewMembers.length;
    const activeCrew = crewMembers.filter(crew => crew.isActive).length;
    const totalEquipment = equipment.length;
    const availableEquipment = equipment.filter(equip => equip.status === 'available').length;
    
    const upcomingEvents = scheduleEvents.filter(event => 
      isAfter(new Date(event.startDateTime), new Date()) && 
      event.status !== 'cancelled'
    ).length;
    
    const overdueItems = scheduleEvents.filter(event => 
      isBefore(new Date(event.endDateTime), new Date()) && 
      event.status === 'scheduled'
    ).length + resourceAlerts.filter(alert => alert.severity === 'high' || alert.severity === 'critical').length;

    // Mock calculations - in real app, these would be computed from actual data
    const averageUtilization = 78; // percentage
    const totalRevenue = 125000; // dollar amount
    const costSavings = 8500; // dollar amount from optimization
    const effiencyRating = 85; // percentage

    return {
      totalCrew,
      activeCrew,
      totalEquipment,
      availableEquipment,
      upcomingEvents,
      overdueItems,
      averageUtilization,
      totalRevenue,
      costSavings,
      effiencyRating
    };
  }, [crewMembers, equipment, scheduleEvents, resourceAlerts]);

  // Calculate utilization metrics
  const utilizationMetrics: UtilizationMetric[] = useMemo(() => {
    return crewMembers.slice(0, 5).map(crew => {
      // Mock calculations
      const currentUtilization = Math.random() * 100;
      const targetUtilization = 80;
      const variance = currentUtilization - targetUtilization;
      const trend = variance > 10 ? 'up' : variance < -10 ? 'down' : 'stable';
      
      return {
        resourceId: crew.id,
        resourceName: crew.externalContractorName || `${crew.user?.firstName} ${crew.user?.lastName}`,
        resourceType: 'crew_member',
        currentUtilization,
        targetUtilization,
        variance,
        trend,
        weeklyHours: 32 + Math.random() * 16,
        projectedRevenue: 2500 + Math.random() * 1500
      };
    });
  }, [crewMembers]);

  // Identify schedule conflicts
  const scheduleConflicts: ScheduleConflict[] = useMemo(() => {
    const conflicts: ScheduleConflict[] = [];
    const resourceEvents = new Map<string, ProjectScheduleEvent[]>();
    
    // Group events by resource
    scheduleEvents.forEach(event => {
      const resourceKey = `${event.resourceType}-${event.resourceId}`;
      if (!resourceEvents.has(resourceKey)) {
        resourceEvents.set(resourceKey, []);
      }
      resourceEvents.get(resourceKey)!.push(event);
    });
    
    // Check for overlapping events
    resourceEvents.forEach((events, resourceKey) => {
      const [resourceType, resourceId] = resourceKey.split('-');
      const sortedEvents = events.sort((a, b) => 
        new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime()
      );
      
      const conflictingEvents: any[] = [];
      
      for (let i = 0; i < sortedEvents.length - 1; i++) {
        const current = sortedEvents[i];
        const next = sortedEvents[i + 1];
        
        if (new Date(current.endDateTime) > new Date(next.startDateTime)) {
          conflictingEvents.push(
            {
              id: current.id,
              title: current.title,
              startDate: new Date(current.startDateTime),
              endDate: new Date(current.endDateTime),
              projectName: `Project ${current.projectId}`
            },
            {
              id: next.id,
              title: next.title,
              startDate: new Date(next.startDateTime),
              endDate: new Date(next.endDateTime),
              projectName: `Project ${next.projectId}`
            }
          );
        }
      }
      
      if (conflictingEvents.length > 0) {
        const resourceName = resourceType === 'crew_member' 
          ? crewMembers.find(c => c.id === parseInt(resourceId))?.externalContractorName || 'Unknown Crew'
          : equipment.find(e => e.id === parseInt(resourceId))?.name || 'Unknown Equipment';
          
        conflicts.push({
          id: resourceKey,
          resourceType,
          resourceId: parseInt(resourceId),
          resourceName,
          conflictingEvents: conflictingEvents.slice(0, 2),
          severity: conflictingEvents.length > 4 ? 'critical' : conflictingEvents.length > 2 ? 'major' : 'minor',
          suggestedAction: 'Reschedule one or more conflicting events'
        });
      }
    });
    
    return conflicts;
  }, [scheduleEvents, crewMembers, equipment]);

  // Filter alerts
  const filteredAlerts = resourceAlerts.filter(alert => {
    if (alertsFilter === 'all') return true;
    if (alertsFilter === 'actionRequired') return alert.actionRequired;
    return alert.severity === alertsFilter;
  });

  if (projectsLoading && showAllProjects) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <BarChart3 className="mr-2 h-5 w-5" />
            Schedule Dashboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-96 flex items-center justify-center">
            <div className="animate-pulse text-gray-500">Loading dashboard...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Dashboard Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Schedule Dashboard</h1>
          <p className="text-gray-500 mt-1">
            {showAllProjects 
              ? 'Overview across all projects'
              : 'Project-specific scheduling overview'
            } • {format(dateRange.start, 'MMM dd')} - {format(dateRange.end, 'MMM dd, yyyy')}
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" data-testid="button-export-dashboard">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button size="sm" onClick={onCreateScheduleEvent} data-testid="button-quick-schedule">
            <Plus className="mr-2 h-4 w-4" />
            Quick Schedule
          </Button>
        </div>
      </div>

      {/* Critical Alerts */}
      {resourceAlerts.filter(alert => alert.severity === 'critical' || alert.severity === 'high').length > 0 && (
        <Alert className="border-red-200 bg-red-50">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <AlertDescription>
            <div className="flex items-center justify-between">
              <div>
                <strong>
                  {resourceAlerts.filter(alert => alert.severity === 'critical' || alert.severity === 'high').length} critical alerts
                </strong> require immediate attention
              </div>
              <Button variant="outline" size="sm" onClick={() => setActiveTab('alerts')}>
                View All Alerts
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card 
          className={cn(
            "cursor-pointer hover:shadow-md transition-shadow",
            selectedMetric === 'crew' && "ring-2 ring-blue-500"
          )}
          onClick={() => setSelectedMetric(selectedMetric === 'crew' ? null : 'crew')}
          data-testid="metric-crew"
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Active Crew</p>
                <p className="text-2xl font-bold">{dashboardMetrics.activeCrew}</p>
                <p className="text-xs text-gray-500">of {dashboardMetrics.totalCrew} total</p>
              </div>
              <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
            </div>
            <div className="mt-3">
              <Progress 
                value={(dashboardMetrics.activeCrew / Math.max(dashboardMetrics.totalCrew, 1)) * 100} 
                className="h-2" 
              />
            </div>
          </CardContent>
        </Card>

        <Card 
          className={cn(
            "cursor-pointer hover:shadow-md transition-shadow",
            selectedMetric === 'equipment' && "ring-2 ring-green-500"
          )}
          onClick={() => setSelectedMetric(selectedMetric === 'equipment' ? null : 'equipment')}
          data-testid="metric-equipment"
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Available Equipment</p>
                <p className="text-2xl font-bold">{dashboardMetrics.availableEquipment}</p>
                <p className="text-xs text-gray-500">of {dashboardMetrics.totalEquipment} total</p>
              </div>
              <div className="h-12 w-12 rounded-lg bg-green-100 flex items-center justify-center">
                <Wrench className="h-6 w-6 text-green-600" />
              </div>
            </div>
            <div className="mt-3">
              <Progress 
                value={(dashboardMetrics.availableEquipment / Math.max(dashboardMetrics.totalEquipment, 1)) * 100} 
                className="h-2" 
              />
            </div>
          </CardContent>
        </Card>

        <Card 
          className={cn(
            "cursor-pointer hover:shadow-md transition-shadow",
            selectedMetric === 'utilization' && "ring-2 ring-orange-500"
          )}
          onClick={() => setSelectedMetric(selectedMetric === 'utilization' ? null : 'utilization')}
          data-testid="metric-utilization"
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Avg Utilization</p>
                <p className="text-2xl font-bold">{dashboardMetrics.averageUtilization}%</p>
                <div className="flex items-center text-xs text-green-600 mt-1">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  +5% from last week
                </div>
              </div>
              <div className="h-12 w-12 rounded-lg bg-orange-100 flex items-center justify-center">
                <BarChart3 className="h-6 w-6 text-orange-600" />
              </div>
            </div>
            <div className="mt-3">
              <Progress value={dashboardMetrics.averageUtilization} className="h-2" />
            </div>
          </CardContent>
        </Card>

        <Card 
          className={cn(
            "cursor-pointer hover:shadow-md transition-shadow",
            selectedMetric === 'efficiency' && "ring-2 ring-purple-500"
          )}
          onClick={() => setSelectedMetric(selectedMetric === 'efficiency' ? null : 'efficiency')}
          data-testid="metric-efficiency"
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Efficiency Rating</p>
                <p className="text-2xl font-bold">{dashboardMetrics.effiencyRating}%</p>
                <div className="flex items-center text-xs text-blue-600 mt-1">
                  <Zap className="h-3 w-3 mr-1" />
                  Optimized schedule
                </div>
              </div>
              <div className="h-12 w-12 rounded-lg bg-purple-100 flex items-center justify-center">
                <Target className="h-6 w-6 text-purple-600" />
              </div>
            </div>
            <div className="mt-3">
              <Progress value={dashboardMetrics.effiencyRating} className="h-2" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Dashboard Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid grid-cols-6 w-full">
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="utilization" data-testid="tab-utilization">Utilization</TabsTrigger>
          <TabsTrigger value="conflicts" data-testid="tab-conflicts">Conflicts</TabsTrigger>
          <TabsTrigger value="alerts" data-testid="tab-alerts">Alerts</TabsTrigger>
          <TabsTrigger value="forecasting" data-testid="tab-forecasting">Forecasting</TabsTrigger>
          <TabsTrigger value="reports" data-testid="tab-reports">Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Upcoming Events */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center">
                    <CalendarIcon className="mr-2 h-5 w-5" />
                    Upcoming Schedule
                  </CardTitle>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => onNavigateToSchedule?.('calendar')}
                    data-testid="button-view-calendar"
                  >
                    <Eye className="mr-1 h-4 w-4" />
                    View Calendar
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {scheduleEvents
                  .filter(event => isAfter(new Date(event.startDateTime), new Date()))
                  .slice(0, 5)
                  .map(event => (
                    <div 
                      key={event.id} 
                      className="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-50"
                      data-testid={`upcoming-event-${event.id}`}
                    >
                      <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center">
                        {event.resourceType === 'crew_member' ? (
                          <Users className="h-4 w-4 text-blue-600" />
                        ) : (
                          <Wrench className="h-4 w-4 text-blue-600" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-sm">{event.title}</div>
                        <div className="text-xs text-gray-500">
                          {format(new Date(event.startDateTime), 'MMM dd, h:mm a')}
                          {event.location && (
                            <>
                              <MapPin className="inline h-3 w-3 ml-2 mr-1" />
                              {event.location}
                            </>
                          )}
                        </div>
                      </div>
                      <Badge className={cn(
                        "text-xs",
                        event.status === 'scheduled' ? 'bg-blue-100 text-blue-800' :
                        event.status === 'in_progress' ? 'bg-green-100 text-green-800' :
                        'bg-gray-100 text-gray-600'
                      )}>
                        {event.status.replace('_', ' ')}
                      </Badge>
                    </div>
                  ))}
                {scheduleEvents.filter(event => isAfter(new Date(event.startDateTime), new Date())).length === 0 && (
                  <div className="text-center py-4 text-gray-500">
                    <CalendarIcon className="mx-auto h-8 w-8 mb-2" />
                    <p>No upcoming events scheduled</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Resource Quick Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Activity className="mr-2 h-5 w-5" />
                  Resource Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-3 rounded-lg bg-green-50">
                    <div className="text-2xl font-bold text-green-700">
                      {crewMembers.filter(crew => crew.isActive).length}
                    </div>
                    <div className="text-sm text-green-600">Active Crew</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-blue-50">
                    <div className="text-2xl font-bold text-blue-700">
                      {equipment.filter(equip => equip.status === 'available').length}
                    </div>
                    <div className="text-sm text-blue-600">Available Equipment</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-orange-50">
                    <div className="text-2xl font-bold text-orange-700">{dashboardMetrics.upcomingEvents}</div>
                    <div className="text-sm text-orange-600">Scheduled Events</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-red-50">
                    <div className="text-2xl font-bold text-red-700">{dashboardMetrics.overdueItems}</div>
                    <div className="text-sm text-red-600">Items Need Attention</div>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Overall Capacity</span>
                    <span className="text-sm text-gray-500">{dashboardMetrics.averageUtilization}%</span>
                  </div>
                  <Progress value={dashboardMetrics.averageUtilization} className="h-3" />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>Under-utilized</span>
                    <span>Optimal</span>
                    <span>Over-allocated</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Button 
                  variant="outline" 
                  className="h-16 flex-col space-y-2"
                  onClick={() => onNavigateToSchedule?.('calendar')}
                  data-testid="action-calendar"
                >
                  <CalendarIcon className="h-5 w-5" />
                  <span className="text-sm">View Calendar</span>
                </Button>
                <Button 
                  variant="outline" 
                  className="h-16 flex-col space-y-2"
                  onClick={() => onNavigateToSchedule?.('crew')}
                  data-testid="action-crew"
                >
                  <Users className="h-5 w-5" />
                  <span className="text-sm">Manage Crew</span>
                </Button>
                <Button 
                  variant="outline" 
                  className="h-16 flex-col space-y-2"
                  onClick={() => onNavigateToSchedule?.('equipment')}
                  data-testid="action-equipment"
                >
                  <Wrench className="h-5 w-5" />
                  <span className="text-sm">Equipment</span>
                </Button>
                <Button 
                  variant="outline" 
                  className="h-16 flex-col space-y-2"
                  onClick={onCreateScheduleEvent}
                  data-testid="action-schedule"
                >
                  <Plus className="h-5 w-5" />
                  <span className="text-sm">New Event</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="utilization" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Resource Utilization Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {utilizationMetrics.map(metric => (
                  <div 
                    key={metric.resourceId} 
                    className="p-4 border rounded-lg hover:bg-gray-50 cursor-pointer"
                    onClick={() => onManageResource?.(metric.resourceType, metric.resourceId)}
                    data-testid={`utilization-${metric.resourceId}`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-3">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback>{metric.resourceName?.[0] || 'R'}</AvatarFallback>
                        </Avatar>
                        <div>
                          <h4 className="font-medium">{metric.resourceName}</h4>
                          <p className="text-sm text-gray-500 capitalize">
                            {metric.resourceType.replace('_', ' ')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        {getTrendIcon(metric.trend)}
                        <div className="text-right">
                          <div className="font-medium">{metric.currentUtilization.toFixed(0)}%</div>
                          <div className="text-xs text-gray-500">
                            {metric.variance > 0 ? '+' : ''}{metric.variance.toFixed(0)}% vs target
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Current Utilization</span>
                        <span>{metric.currentUtilization.toFixed(0)}%</span>
                      </div>
                      <Progress value={metric.currentUtilization} className="h-2" />
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>Target: {metric.targetUtilization}%</span>
                        <span>{metric.weeklyHours.toFixed(0)}h this week</span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center mt-3 pt-3 border-t">
                      <div className="text-sm">
                        <span className="text-gray-600">Projected Revenue: </span>
                        <span className="font-medium">${metric.projectedRevenue.toLocaleString()}</span>
                      </div>
                      <Badge className={cn(
                        metric.variance > 10 ? 'bg-red-100 text-red-800' :
                        metric.variance < -10 ? 'bg-yellow-100 text-yellow-800' :
                        'bg-green-100 text-green-800'
                      )}>
                        {metric.variance > 10 ? 'Over-allocated' :
                         metric.variance < -10 ? 'Under-utilized' :
                         'Optimal'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="conflicts" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center">
                  <XCircle className="mr-2 h-5 w-5 text-red-500" />
                  Schedule Conflicts ({scheduleConflicts.length})
                </CardTitle>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => toast({ title: "Auto-resolve initiated", description: "Analyzing conflicts..." })}
                  data-testid="button-auto-resolve"
                >
                  Auto-Resolve
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {scheduleConflicts.length > 0 ? (
                <div className="space-y-4">
                  {scheduleConflicts.map(conflict => (
                    <div 
                      key={conflict.id} 
                      className={cn(
                        "p-4 border rounded-lg",
                        conflict.severity === 'critical' ? "border-red-200 bg-red-50" :
                        conflict.severity === 'major' ? "border-orange-200 bg-orange-50" :
                        "border-yellow-200 bg-yellow-50"
                      )}
                      data-testid={`conflict-${conflict.id}`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h4 className="font-medium">{conflict.resourceName}</h4>
                          <p className="text-sm text-gray-600 capitalize">
                            {conflict.resourceType.replace('_', ' ')} conflict
                          </p>
                        </div>
                        <Badge className={cn(
                          conflict.severity === 'critical' ? 'bg-red-100 text-red-800' :
                          conflict.severity === 'major' ? 'bg-orange-100 text-orange-800' :
                          'bg-yellow-100 text-yellow-800'
                        )}>
                          {conflict.severity}
                        </Badge>
                      </div>

                      <div className="space-y-2">
                        <p className="text-sm font-medium">Conflicting Events:</p>
                        {conflict.conflictingEvents.map(event => (
                          <div key={event.id} className="text-sm bg-white p-2 rounded border">
                            <div className="flex justify-between">
                              <span>{event.title}</span>
                              <span className="text-gray-500">{event.projectName}</span>
                            </div>
                            <div className="text-xs text-gray-500">
                              {format(event.startDate, 'MMM dd, h:mm a')} - {format(event.endDate, 'h:mm a')}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center justify-between mt-3 pt-3 border-t">
                        <p className="text-sm text-gray-600">{conflict.suggestedAction}</p>
                        <div className="flex space-x-2">
                          <Button variant="outline" size="sm">
                            <Eye className="mr-1 h-4 w-4" />
                            View
                          </Button>
                          <Button size="sm">
                            Resolve
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <CheckCircle2 className="mx-auto h-12 w-12 text-green-500 mb-4" />
                  <h3 className="font-medium text-gray-900 mb-2">No Schedule Conflicts</h3>
                  <p className="text-gray-500">Your schedule is optimally organized with no conflicts detected.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center">
                  <Bell className="mr-2 h-5 w-5" />
                  System Alerts ({filteredAlerts.length})
                </CardTitle>
                <div className="flex items-center space-x-2">
                  <select 
                    value={alertsFilter} 
                    onChange={(e) => setAlertsFilter(e.target.value)}
                    className="text-sm border rounded px-2 py-1"
                    data-testid="select-alerts-filter"
                  >
                    <option value="all">All Alerts</option>
                    <option value="critical">Critical</option>
                    <option value="high">High Priority</option>
                    <option value="actionRequired">Action Required</option>
                  </select>
                  <Button variant="outline" size="sm">
                    Mark All Read
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {filteredAlerts.map(alert => (
                  <div 
                    key={alert.id} 
                    className={cn(
                      "p-4 border rounded-lg",
                      getSeverityColor(alert.severity)
                    )}
                    data-testid={`alert-${alert.id}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3">
                        <div className="p-2 rounded-lg bg-white">
                          {getAlertIcon(alert.type)}
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium">{alert.title}</h4>
                          <p className="text-sm mt-1">{alert.description}</p>
                          <div className="flex items-center space-x-4 mt-2 text-xs">
                            <span className="capitalize">{alert.resourceType.replace('_', ' ')}: {alert.resourceName}</span>
                            {alert.dueDate && (
                              <span>Due: {format(alert.dueDate, 'MMM dd, yyyy')}</span>
                            )}
                            {alert.estimatedImpact && (
                              <span>Impact: {alert.estimatedImpact}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {alert.actionRequired && (
                          <Badge variant="destructive" className="text-xs">
                            Action Required
                          </Badge>
                        )}
                        <Button variant="ghost" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
                {filteredAlerts.length === 0 && (
                  <div className="text-center py-8">
                    <CheckCircle2 className="mx-auto h-12 w-12 text-green-500 mb-4" />
                    <h3 className="font-medium text-gray-900 mb-2">No Active Alerts</h3>
                    <p className="text-gray-500">Your scheduling system is running smoothly with no alerts to address.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="forecasting" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <TrendingUp className="mr-2 h-5 w-5" />
                Capacity & Revenue Forecasting
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center p-6 bg-blue-50 rounded-lg">
                  <div className="text-3xl font-bold text-blue-700 mb-2">
                    ${(dashboardMetrics.totalRevenue * 1.15).toLocaleString()}
                  </div>
                  <div className="text-sm text-blue-600 mb-1">Projected Monthly Revenue</div>
                  <div className="text-xs text-blue-500">+15% growth trend</div>
                </div>

                <div className="text-center p-6 bg-green-50 rounded-lg">
                  <div className="text-3xl font-bold text-green-700 mb-2">
                    {Math.round(dashboardMetrics.averageUtilization * 1.08)}%
                  </div>
                  <div className="text-sm text-green-600 mb-1">Projected Utilization</div>
                  <div className="text-xs text-green-500">Optimal efficiency range</div>
                </div>

                <div className="text-center p-6 bg-purple-50 rounded-lg">
                  <div className="text-3xl font-bold text-purple-700 mb-2">
                    ${(dashboardMetrics.costSavings * 1.25).toLocaleString()}
                  </div>
                  <div className="text-sm text-purple-600 mb-1">Potential Savings</div>
                  <div className="text-xs text-purple-500">Through optimization</div>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t">
                <h4 className="font-medium mb-4">Capacity Planning Recommendations</h4>
                <div className="space-y-3">
                  <div className="flex items-center space-x-3 p-3 bg-yellow-50 rounded-lg">
                    <div className="h-2 w-2 bg-yellow-500 rounded-full"></div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">Consider hiring 2 additional crew members</p>
                      <p className="text-xs text-gray-600">Current utilization exceeds 85% consistently</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3 p-3 bg-blue-50 rounded-lg">
                    <div className="h-2 w-2 bg-blue-500 rounded-full"></div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">Equipment rental optimization opportunity</p>
                      <p className="text-xs text-gray-600">3 pieces of equipment showing low utilization</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3 p-3 bg-green-50 rounded-lg">
                    <div className="h-2 w-2 bg-green-500 rounded-full"></div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">Schedule efficiency improved by 12%</p>
                      <p className="text-xs text-gray-600">Recent optimization changes showing positive results</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <FileText className="mr-2 h-5 w-5" />
                Schedule Reports & Analytics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="font-medium">Available Reports</h4>
                  
                  <div className="space-y-3">
                    <Button variant="outline" className="w-full justify-start" data-testid="report-utilization">
                      <PieChart className="mr-2 h-4 w-4" />
                      Resource Utilization Report
                    </Button>
                    <Button variant="outline" className="w-full justify-start" data-testid="report-financial">
                      <DollarSign className="mr-2 h-4 w-4" />
                      Financial Performance Report
                    </Button>
                    <Button variant="outline" className="w-full justify-start" data-testid="report-efficiency">
                      <TrendingUp className="mr-2 h-4 w-4" />
                      Schedule Efficiency Analysis
                    </Button>
                    <Button variant="outline" className="w-full justify-start" data-testid="report-crew">
                      <Users className="mr-2 h-4 w-4" />
                      Crew Performance Report
                    </Button>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-medium">Quick Statistics</h4>
                  
                  <div className="space-y-3">
                    <div className="flex justify-between p-3 bg-gray-50 rounded-lg">
                      <span className="text-sm">Average project completion time</span>
                      <span className="font-medium">14.2 days</span>
                    </div>
                    <div className="flex justify-between p-3 bg-gray-50 rounded-lg">
                      <span className="text-sm">Schedule adherence rate</span>
                      <span className="font-medium">92.3%</span>
                    </div>
                    <div className="flex justify-between p-3 bg-gray-50 rounded-lg">
                      <span className="text-sm">Cost variance from estimates</span>
                      <span className="font-medium text-green-600">-2.1%</span>
                    </div>
                    <div className="flex justify-between p-3 bg-gray-50 rounded-lg">
                      <span className="text-sm">Customer satisfaction score</span>
                      <span className="font-medium">4.7/5.0</span>
                    </div>
                  </div>

                  <Button className="w-full mt-4" data-testid="button-custom-report">
                    Generate Custom Report
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}