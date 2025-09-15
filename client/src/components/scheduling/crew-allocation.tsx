import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent } from "@dnd-kit/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { 
  Users, 
  User, 
  Clock, 
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Wrench,
  MapPin,
  Phone,
  Mail,
  Plus,
  Edit,
  Eye,
  Filter,
  BarChart3,
  TrendingUp,
  AlertCircle,
  Settings
} from "lucide-react";
import { format, formatDistanceToNow, differenceInDays, isAfter, isBefore, startOfWeek, endOfWeek, eachDayOfInterval } from "date-fns";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { 
  ProjectCrew, 
  ProjectTaskAssignment,
  ProjectScheduleEvent,
  ProjectWithDetails,
  User as UserType,
  ProjectTask,
  InsertProjectTaskAssignment
} from "@shared/schema";

interface CrewAllocationProps {
  projectId?: number;
  showAllProjects?: boolean;
  selectedDateRange?: {
    start: Date;
    end: Date;
  };
  onCrewMemberClick?: (crewMember: ProjectCrew) => void;
  onAssignmentUpdate?: (assignment: ProjectTaskAssignment) => void;
}

interface CrewMemberWithDetails extends ProjectCrew {
  currentAssignments?: ProjectTaskAssignment[];
  upcomingSchedule?: ProjectScheduleEvent[];
  utilizationRate?: number;
  totalHours?: number;
  totalCost?: number;
  availability?: 'available' | 'partially_available' | 'fully_booked' | 'unavailable';
}

interface AllocationMatrixCell {
  date: Date;
  assignments: ProjectTaskAssignment[];
  scheduleEvents: ProjectScheduleEvent[];
  totalHours: number;
  capacity: number;
  utilization: number;
  conflicts: boolean;
}

interface SkillRequirement {
  skill: string;
  level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  required: boolean;
}

const getAvailabilityColor = (availability: string) => {
  switch (availability) {
    case 'available': return 'bg-green-100 text-green-800 border-green-200';
    case 'partially_available': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'fully_booked': return 'bg-red-100 text-red-800 border-red-200';
    case 'unavailable': return 'bg-gray-100 text-gray-600 border-gray-200';
    default: return 'bg-gray-100 text-gray-600 border-gray-200';
  }
};

const getUtilizationColor = (utilization: number) => {
  if (utilization <= 50) return 'bg-green-500';
  if (utilization <= 80) return 'bg-yellow-500';
  if (utilization <= 100) return 'bg-orange-500';
  return 'bg-red-500';
};

const SKILL_CATEGORIES = [
  'carpentry', 'electrical', 'plumbing', 'roofing', 'flooring', 
  'painting', 'drywall', 'hvac', 'concrete', 'landscaping',
  'project_management', 'safety', 'equipment_operation', 'quality_control'
];

export default function CrewAllocation({
  projectId,
  showAllProjects = false,
  selectedDateRange = {
    start: startOfWeek(new Date()),
    end: endOfWeek(new Date())
  },
  onCrewMemberClick,
  onAssignmentUpdate
}: CrewAllocationProps) {
  const [activeTab, setActiveTab] = useState('matrix');
  const [selectedCrewMember, setSelectedCrewMember] = useState<ProjectCrew | null>(null);
  const [isAssignmentDialogOpen, setIsAssignmentDialogOpen] = useState(false);
  const [draggedAssignment, setDraggedAssignment] = useState<ProjectTaskAssignment | null>(null);
  const [skillFilter, setSkillFilter] = useState<string>('all');
  const [availabilityFilter, setAvailabilityFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'utilization' | 'cost' | 'availability'>('name');
  
  const { toast } = useToast();

  // Fetch crew members
  const { data: crewMembers = [], isLoading: crewLoading } = useQuery<ProjectCrew[]>({
    queryKey: ["/api/projects", projectId, "crew"],
    enabled: !!projectId,
  });

  // Fetch task assignments
  const { data: taskAssignments = [] } = useQuery<ProjectTaskAssignment[]>({
    queryKey: ["/api/projects", projectId, "task-assignments"],
    enabled: !!projectId,
  });

  // Fetch schedule events
  const { data: scheduleEvents = [] } = useQuery<ProjectScheduleEvent[]>({
    queryKey: ["/api/schedule-events", { projectId }],
    enabled: !!projectId,
  });

  // Fetch project tasks
  const { data: projectTasks = [] } = useQuery<ProjectTask[]>({
    queryKey: ["/api/projects", projectId, "tasks"],
    enabled: !!projectId,
  });

  // Fetch all projects if needed
  const { data: projects = [] } = useQuery<ProjectWithDetails[]>({
    queryKey: ["/api/projects"],
    enabled: showAllProjects,
  });

  // Create or update assignment mutation
  const upsertAssignmentMutation = useMutation({
    mutationFn: (assignmentData: Partial<InsertProjectTaskAssignment>) => 
      assignmentData.id 
        ? apiRequest(`/api/task-assignments/${assignmentData.id}`, {
            method: 'PATCH',
            body: assignmentData
          })
        : apiRequest('/api/task-assignments', {
            method: 'POST',
            body: assignmentData
          }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "task-assignments"] });
      toast({
        title: "Assignment Updated",
        description: "Crew assignment has been updated successfully."
      });
    },
    onError: (error) => {
      console.error('Failed to update assignment:', error);
      toast({
        title: "Assignment Failed",
        description: "Failed to update crew assignment. Please try again.",
        variant: "destructive"
      });
    }
  });

  // Enhanced crew members with allocation details
  const crewMembersWithDetails: CrewMemberWithDetails[] = useMemo(() => {
    return crewMembers.map(crew => {
      const assignments = taskAssignments.filter(ta => ta.crewMemberId === crew.id);
      const scheduleForCrew = scheduleEvents.filter(se => 
        se.resourceType === 'crew_member' && se.resourceId === crew.id
      );

      // Calculate utilization
      const totalPlannedHours = assignments.reduce((sum, assignment) => 
        sum + (parseFloat(assignment.plannedHours || '0')), 0);
      const totalActualHours = assignments.reduce((sum, assignment) => 
        sum + (parseFloat(assignment.actualHours || '0')), 0);
      const hourlyRate = parseFloat(crew.hourlyRate || '0');
      const totalCost = totalActualHours * hourlyRate;

      // Determine availability based on current workload
      const capacity = parseFloat(crew.maxHoursPerWeek || '40');
      const utilizationRate = capacity > 0 ? (totalPlannedHours / capacity) * 100 : 0;
      
      let availability: 'available' | 'partially_available' | 'fully_booked' | 'unavailable';
      if (!crew.isActive) availability = 'unavailable';
      else if (utilizationRate <= 50) availability = 'available';
      else if (utilizationRate <= 90) availability = 'partially_available';
      else availability = 'fully_booked';

      return {
        ...crew,
        currentAssignments: assignments,
        upcomingSchedule: scheduleForCrew,
        utilizationRate,
        totalHours: totalActualHours,
        totalCost,
        availability
      };
    });
  }, [crewMembers, taskAssignments, scheduleEvents]);

  // Generate allocation matrix
  const allocationMatrix = useMemo(() => {
    const dateRange = eachDayOfInterval({
      start: selectedDateRange.start,
      end: selectedDateRange.end
    });

    const matrix = crewMembersWithDetails.map(crew => ({
      crewMember: crew,
      allocations: dateRange.map(date => {
        const dayAssignments = crew.currentAssignments?.filter(assignment => {
          const start = assignment.plannedStartDate ? new Date(assignment.plannedStartDate) : null;
          const end = assignment.plannedEndDate ? new Date(assignment.plannedEndDate) : null;
          return start && end && 
                 isBefore(start, date) && isAfter(end, date) ||
                 format(start || new Date(), 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd') ||
                 format(end || new Date(), 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd');
        }) || [];

        const dayEvents = crew.upcomingSchedule?.filter(event => {
          const eventDate = new Date(event.startDateTime);
          return format(eventDate, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd');
        }) || [];

        const totalHours = dayAssignments.reduce((sum, assignment) => 
          sum + (parseFloat(assignment.plannedHours || '0') / 7), 0); // Assuming weekly hours spread over 7 days

        const capacity = parseFloat(crew.maxHoursPerDay || '8');
        const utilization = capacity > 0 ? (totalHours / capacity) * 100 : 0;
        const conflicts = utilization > 100;

        return {
          date,
          assignments: dayAssignments,
          scheduleEvents: dayEvents,
          totalHours,
          capacity,
          utilization,
          conflicts
        };
      })
    }));

    return matrix;
  }, [crewMembersWithDetails, selectedDateRange]);

  // Filter and sort crew members
  const filteredCrewMembers = useMemo(() => {
    let filtered = crewMembersWithDetails;

    // Apply skill filter
    if (skillFilter !== 'all') {
      filtered = filtered.filter(crew => {
        const skills = crew.skills ? (typeof crew.skills === 'string' ? JSON.parse(crew.skills) : crew.skills) : [];
        return skills.some((skill: any) => skill.skill === skillFilter);
      });
    }

    // Apply availability filter
    if (availabilityFilter !== 'all') {
      filtered = filtered.filter(crew => crew.availability === availabilityFilter);
    }

    // Sort crew members
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'utilization':
          return (b.utilizationRate || 0) - (a.utilizationRate || 0);
        case 'cost':
          return (b.totalCost || 0) - (a.totalCost || 0);
        case 'availability':
          const availabilityOrder = { available: 0, partially_available: 1, fully_booked: 2, unavailable: 3 };
          return (availabilityOrder[a.availability || 'unavailable'] || 3) - 
                 (availabilityOrder[b.availability || 'unavailable'] || 3);
        default:
          return (a.externalContractorName || a.user?.firstName || '').localeCompare(
                 b.externalContractorName || b.user?.firstName || '');
      }
    });

    return filtered;
  }, [crewMembersWithDetails, skillFilter, availabilityFilter, sortBy]);

  // Handle drag and drop for reassignments
  const handleDragStart = (event: DragStartEvent) => {
    const assignment = taskAssignments.find(ta => ta.id === parseInt(event.active.id as string));
    setDraggedAssignment(assignment || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over || !draggedAssignment) return;

    const newCrewMemberId = parseInt(over.id as string);
    if (draggedAssignment.crewMemberId !== newCrewMemberId) {
      upsertAssignmentMutation.mutate({
        ...draggedAssignment,
        crewMemberId: newCrewMemberId
      });
    }

    setDraggedAssignment(null);
  };

  // Calculate team metrics
  const teamMetrics = useMemo(() => {
    const activeMembers = crewMembersWithDetails.filter(crew => crew.isActive);
    const totalCapacity = activeMembers.reduce((sum, crew) => 
      sum + parseFloat(crew.maxHoursPerWeek || '40'), 0);
    const totalUtilized = activeMembers.reduce((sum, crew) => 
      sum + (crew.totalHours || 0), 0);
    const averageUtilization = activeMembers.length > 0 
      ? activeMembers.reduce((sum, crew) => sum + (crew.utilizationRate || 0), 0) / activeMembers.length
      : 0;
    const totalCost = activeMembers.reduce((sum, crew) => sum + (crew.totalCost || 0), 0);

    return {
      totalMembers: activeMembers.length,
      totalCapacity,
      totalUtilized,
      averageUtilization,
      totalCost,
      availableMembers: activeMembers.filter(crew => crew.availability === 'available').length,
      overAllocated: activeMembers.filter(crew => (crew.utilizationRate || 0) > 100).length
    };
  }, [crewMembersWithDetails]);

  if (crewLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Users className="mr-2 h-5 w-5" />
            Crew Allocation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-96 flex items-center justify-center">
            <div className="animate-pulse text-gray-500">Loading crew allocation...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <Card className="h-full">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center">
              <Users className="mr-2 h-5 w-5" />
              Crew Allocation Manager
            </CardTitle>
            <div className="flex items-center space-x-2">
              {teamMetrics.overAllocated > 0 && (
                <Badge variant="destructive" className="flex items-center">
                  <AlertTriangle className="mr-1 h-3 w-3" />
                  {teamMetrics.overAllocated} Over-allocated
                </Badge>
              )}
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setIsAssignmentDialogOpen(true)}
                data-testid="button-new-assignment"
              >
                <Plus className="mr-1 h-4 w-4" />
                New Assignment
              </Button>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="matrix" data-testid="tab-matrix">Allocation Matrix</TabsTrigger>
              <TabsTrigger value="overview" data-testid="tab-overview">Crew Overview</TabsTrigger>
              <TabsTrigger value="metrics" data-testid="tab-metrics">Team Metrics</TabsTrigger>
              <TabsTrigger value="filters" data-testid="tab-filters">Filters & Settings</TabsTrigger>
            </TabsList>

            <TabsContent value="matrix" className="space-y-4">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[200px]">Crew Member</TableHead>
                      {eachDayOfInterval({ start: selectedDateRange.start, end: selectedDateRange.end }).map(date => (
                        <TableHead key={date.toISOString()} className="text-center min-w-[100px]">
                          <div className="flex flex-col">
                            <span className="text-xs font-normal">
                              {format(date, 'EEE')}
                            </span>
                            <span className="font-medium">
                              {format(date, 'MM/dd')}
                            </span>
                          </div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allocationMatrix.map(({ crewMember, allocations }) => (
                      <TableRow key={crewMember.id} data-testid={`crew-row-${crewMember.id}`}>
                        <TableCell>
                          <div className="flex items-center space-x-3">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={crewMember.user?.email} />
                              <AvatarFallback>
                                {crewMember.externalContractorName?.[0] || 
                                 crewMember.user?.firstName?.[0] || 'C'}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium">
                                {crewMember.externalContractorName || 
                                 `${crewMember.user?.firstName} ${crewMember.user?.lastName}`}
                              </div>
                              <div className="text-sm text-gray-500">{crewMember.role}</div>
                              <Badge className={`${getAvailabilityColor(crewMember.availability || 'unavailable')} border text-xs`}>
                                {crewMember.availability?.replace('_', ' ')}
                              </Badge>
                            </div>
                          </div>
                        </TableCell>
                        {allocations.map((allocation, index) => (
                          <TableCell key={index} className="p-2 text-center">
                            <div className="relative">
                              <div 
                                className={cn(
                                  "h-8 rounded-lg flex items-center justify-center text-xs font-medium",
                                  allocation.conflicts ? "bg-red-100 text-red-800 border-2 border-red-300" :
                                  allocation.utilization > 80 ? "bg-yellow-100 text-yellow-800" :
                                  allocation.utilization > 50 ? "bg-blue-100 text-blue-800" :
                                  allocation.totalHours > 0 ? "bg-green-100 text-green-800" : "bg-gray-50"
                                )}
                                title={`${allocation.totalHours.toFixed(1)}h / ${allocation.capacity}h (${allocation.utilization.toFixed(0)}%)`}
                                data-testid={`allocation-cell-${crewMember.id}-${index}`}
                              >
                                {allocation.totalHours > 0 ? `${allocation.totalHours.toFixed(1)}h` : ''}
                              </div>
                              {allocation.conflicts && (
                                <AlertTriangle className="absolute -top-1 -right-1 h-3 w-3 text-red-500" />
                              )}
                            </div>
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="overview" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredCrewMembers.map(crew => (
                  <Card 
                    key={crew.id} 
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => {
                      setSelectedCrewMember(crew);
                      onCrewMemberClick?.(crew);
                    }}
                    data-testid={`crew-card-${crew.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center space-x-3 mb-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={crew.user?.email} />
                          <AvatarFallback>
                            {crew.externalContractorName?.[0] || crew.user?.firstName?.[0] || 'C'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <h4 className="font-medium">
                            {crew.externalContractorName || 
                             `${crew.user?.firstName} ${crew.user?.lastName}`}
                          </h4>
                          <p className="text-sm text-gray-500">{crew.role}</p>
                        </div>
                        <Badge className={`${getAvailabilityColor(crew.availability || 'unavailable')} border`}>
                          {crew.availability?.replace('_', ' ')}
                        </Badge>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center text-gray-600">
                            <Clock className="mr-1 h-3 w-3" />
                            Utilization
                          </span>
                          <span className="font-medium">{(crew.utilizationRate || 0).toFixed(0)}%</span>
                        </div>
                        <Progress 
                          value={Math.min(crew.utilizationRate || 0, 100)} 
                          className="h-2" 
                        />

                        <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center text-gray-600">
                            <DollarSign className="mr-1 h-3 w-3" />
                            Total Cost
                          </span>
                          <span className="font-medium">${(crew.totalCost || 0).toLocaleString()}</span>
                        </div>

                        <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center text-gray-600">
                            <Calendar className="mr-1 h-3 w-3" />
                            Active Tasks
                          </span>
                          <span className="font-medium">{crew.currentAssignments?.length || 0}</span>
                        </div>

                        {crew.phone && (
                          <div className="flex items-center text-xs text-gray-500 pt-2 border-t">
                            <Phone className="mr-1 h-3 w-3" />
                            {crew.phone}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="metrics" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-2">
                      <Users className="h-4 w-4 text-blue-500" />
                      <div>
                        <p className="text-sm text-gray-600">Total Members</p>
                        <p className="text-2xl font-bold">{teamMetrics.totalMembers}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-2">
                      <BarChart3 className="h-4 w-4 text-green-500" />
                      <div>
                        <p className="text-sm text-gray-600">Avg Utilization</p>
                        <p className="text-2xl font-bold">{teamMetrics.averageUtilization.toFixed(0)}%</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-2">
                      <DollarSign className="h-4 w-4 text-yellow-500" />
                      <div>
                        <p className="text-sm text-gray-600">Total Cost</p>
                        <p className="text-2xl font-bold">${teamMetrics.totalCost.toLocaleString()}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      <div>
                        <p className="text-sm text-gray-600">Available</p>
                        <p className="text-2xl font-bold">{teamMetrics.availableMembers}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Team Capacity Overview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span>Total Weekly Capacity</span>
                      <span className="font-bold">{teamMetrics.totalCapacity}h</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Currently Utilized</span>
                      <span className="font-bold">{teamMetrics.totalUtilized.toFixed(1)}h</span>
                    </div>
                    <Progress 
                      value={(teamMetrics.totalUtilized / teamMetrics.totalCapacity) * 100} 
                      className="h-3" 
                    />
                    <div className="text-sm text-gray-500">
                      {((teamMetrics.totalUtilized / teamMetrics.totalCapacity) * 100).toFixed(1)}% of total capacity utilized
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="filters" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">
                    Filter by Skill
                  </label>
                  <Select value={skillFilter} onValueChange={setSkillFilter}>
                    <SelectTrigger data-testid="select-skill-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Skills</SelectItem>
                      {SKILL_CATEGORIES.map(skill => (
                        <SelectItem key={skill} value={skill}>
                          {skill.replace('_', ' ').toUpperCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">
                    Filter by Availability
                  </label>
                  <Select value={availabilityFilter} onValueChange={setAvailabilityFilter}>
                    <SelectTrigger data-testid="select-availability-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="available">Available</SelectItem>
                      <SelectItem value="partially_available">Partially Available</SelectItem>
                      <SelectItem value="fully_booked">Fully Booked</SelectItem>
                      <SelectItem value="unavailable">Unavailable</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">
                    Sort by
                  </label>
                  <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
                    <SelectTrigger data-testid="select-sort-by">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="name">Name</SelectItem>
                      <SelectItem value="utilization">Utilization</SelectItem>
                      <SelectItem value="cost">Total Cost</SelectItem>
                      <SelectItem value="availability">Availability</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <DragOverlay>
        {draggedAssignment && (
          <div className="bg-white p-2 rounded-lg shadow-lg border">
            <div className="font-medium">Assignment</div>
            <div className="text-sm text-gray-500">Moving to new crew member...</div>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}