import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Calendar } from "react-big-calendar";
import moment from "moment";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { 
  Calendar as CalendarIcon,
  Clock,
  Users,
  UserX,
  UserCheck,
  AlertTriangle,
  CheckCircle2,
  X,
  Plus,
  Eye,
  Edit,
  Trash,
  Filter,
  Settings,
  Sun,
  Briefcase,
  Heart,
  MapPin,
  Phone,
  Mail,
  RefreshCw
} from "lucide-react";
import { format, parseISO, startOfWeek, endOfWeek, eachDayOfInterval, isWeekend, addDays, isBefore, isAfter } from "date-fns";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { 
  ProjectCrew,
  ProjectScheduleEvent,
  User as UserType
} from "@shared/schema";

interface ResourceAvailabilityProps {
  projectId?: number;
  selectedResourceId?: number;
  dateRange?: {
    start: Date;
    end: Date;
  };
  showAllResources?: boolean;
  onAvailabilityUpdate?: (resourceId: number, availability: AvailabilityEntry) => void;
}

interface AvailabilityEntry {
  id?: number;
  resourceId: number;
  resourceType: 'crew_member' | 'equipment' | 'vehicle' | 'external_contractor';
  startDate: Date;
  endDate: Date;
  type: 'vacation' | 'sick_leave' | 'personal' | 'training' | 'maintenance' | 'unavailable';
  status: 'pending' | 'approved' | 'rejected';
  reason?: string;
  notes?: string;
  requestedBy?: string;
  approvedBy?: string;
  isRecurring?: boolean;
  recurringDays?: number[]; // 0 = Sunday, 1 = Monday, etc.
}

interface ResourceAvailabilityStatus {
  resourceId: number;
  resourceType: string;
  resourceName: string;
  totalScheduledHours: number;
  availableHours: number;
  utilizationRate: number;
  status: 'available' | 'partially_available' | 'fully_booked' | 'unavailable';
  timeOffRequests: AvailabilityEntry[];
  upcomingSchedule: ProjectScheduleEvent[];
}

const getAvailabilityTypeColor = (type: string) => {
  switch (type) {
    case 'vacation': return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'sick_leave': return 'bg-red-100 text-red-800 border-red-200';
    case 'personal': return 'bg-purple-100 text-purple-800 border-purple-200';
    case 'training': return 'bg-green-100 text-green-800 border-green-200';
    case 'maintenance': return 'bg-orange-100 text-orange-800 border-orange-200';
    case 'unavailable': return 'bg-gray-100 text-gray-600 border-gray-200';
    default: return 'bg-gray-100 text-gray-600 border-gray-200';
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'approved': return 'bg-green-100 text-green-800 border-green-200';
    case 'rejected': return 'bg-red-100 text-red-800 border-red-200';
    default: return 'bg-gray-100 text-gray-600 border-gray-200';
  }
};

const getAvailabilityTypeIcon = (type: string) => {
  switch (type) {
    case 'vacation': return <Sun className="h-4 w-4" />;
    case 'sick_leave': return <Heart className="h-4 w-4" />;
    case 'personal': return <UserX className="h-4 w-4" />;
    case 'training': return <Briefcase className="h-4 w-4" />;
    case 'maintenance': return <Settings className="h-4 w-4" />;
    case 'unavailable': return <X className="h-4 w-4" />;
    default: return <Calendar className="h-4 w-4" />;
  }
};

export default function ResourceAvailabilityTracker({
  projectId,
  selectedResourceId,
  dateRange = {
    start: startOfWeek(new Date()),
    end: endOfWeek(addDays(new Date(), 30))
  },
  showAllResources = false,
  onAvailabilityUpdate
}: ResourceAvailabilityProps) {
  const [activeTab, setActiveTab] = useState('calendar');
  const [selectedResource, setSelectedResource] = useState<number | null>(selectedResourceId || null);
  const [isTimeOffDialogOpen, setIsTimeOffDialogOpen] = useState(false);
  const [editingTimeOff, setEditingTimeOff] = useState<AvailabilityEntry | null>(null);
  const [timeOffFilter, setTimeOffFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'week' | 'month'>('month');
  
  const { toast } = useToast();

  // Mock availability data - in real implementation, this would come from API
  const [availabilityEntries, setAvailabilityEntries] = useState<AvailabilityEntry[]>([
    {
      id: 1,
      resourceId: 1,
      resourceType: 'crew_member',
      startDate: new Date(),
      endDate: addDays(new Date(), 3),
      type: 'vacation',
      status: 'approved',
      reason: 'Family vacation',
      notes: 'Pre-planned time off',
      requestedBy: 'john.doe',
      approvedBy: 'manager'
    },
    {
      id: 2,
      resourceId: 2,
      resourceType: 'equipment',
      startDate: addDays(new Date(), 7),
      endDate: addDays(new Date(), 9),
      type: 'maintenance',
      status: 'approved',
      reason: 'Scheduled maintenance',
      notes: 'Annual inspection and service'
    }
  ]);

  // Fetch crew members
  const { data: crewMembers = [], isLoading: crewLoading } = useQuery<ProjectCrew[]>({
    queryKey: ["/api/projects", projectId, "crew"],
    enabled: !!projectId,
  });

  // Fetch schedule events for availability calculation
  const { data: scheduleEvents = [] } = useQuery<ProjectScheduleEvent[]>({
    queryKey: ["/api/schedule-events", { 
      projectId,
      startDate: dateRange.start.toISOString(),
      endDate: dateRange.end.toISOString()
    }],
    enabled: !!projectId,
  });

  // Calculate resource availability status
  const resourceAvailabilityStatus: ResourceAvailabilityStatus[] = useMemo(() => {
    return crewMembers.map(crew => {
      const crewEvents = scheduleEvents.filter(event => 
        event.resourceType === 'crew_member' && event.resourceId === crew.id
      );
      
      const timeOffForCrew = availabilityEntries.filter(entry => 
        entry.resourceId === crew.id && entry.status !== 'rejected'
      );

      const totalScheduledHours = crewEvents.reduce((sum, event) => {
        const start = parseISO(event.startDateTime);
        const end = parseISO(event.endDateTime);
        return sum + ((end.getTime() - start.getTime()) / (1000 * 60 * 60));
      }, 0);

      const maxWeeklyHours = parseFloat(crew.maxHoursPerWeek || '40');
      const weeksInRange = Math.ceil((dateRange.end.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24 * 7));
      const totalCapacity = maxWeeklyHours * weeksInRange;
      
      // Calculate time off hours
      const timeOffHours = timeOffForCrew.reduce((sum, entry) => {
        const start = entry.startDate > dateRange.start ? entry.startDate : dateRange.start;
        const end = entry.endDate < dateRange.end ? entry.endDate : dateRange.end;
        if (start < end) {
          const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
          return sum + (days * (maxWeeklyHours / 5)); // Assuming 5 work days per week
        }
        return sum;
      }, 0);

      const availableHours = totalCapacity - timeOffHours;
      const utilizationRate = availableHours > 0 ? (totalScheduledHours / availableHours) * 100 : 0;

      let status: 'available' | 'partially_available' | 'fully_booked' | 'unavailable';
      if (!crew.isActive) status = 'unavailable';
      else if (utilizationRate <= 50) status = 'available';
      else if (utilizationRate <= 90) status = 'partially_available';
      else status = 'fully_booked';

      return {
        resourceId: crew.id,
        resourceType: 'crew_member',
        resourceName: crew.externalContractorName || 
                     `${crew.user?.firstName || ''} ${crew.user?.lastName || ''}`.trim(),
        totalScheduledHours,
        availableHours,
        utilizationRate,
        status,
        timeOffRequests: timeOffForCrew,
        upcomingSchedule: crewEvents
      };
    });
  }, [crewMembers, scheduleEvents, availabilityEntries, dateRange]);

  // Handle time off request submission
  const submitTimeOffRequest = (timeOffData: Partial<AvailabilityEntry>) => {
    const newEntry: AvailabilityEntry = {
      id: Math.max(...availabilityEntries.map(e => e.id || 0)) + 1,
      resourceId: timeOffData.resourceId!,
      resourceType: timeOffData.resourceType!,
      startDate: timeOffData.startDate!,
      endDate: timeOffData.endDate!,
      type: timeOffData.type!,
      status: 'pending',
      reason: timeOffData.reason,
      notes: timeOffData.notes,
      requestedBy: 'current_user' // In real app, get from auth context
    };

    setAvailabilityEntries(prev => [...prev, newEntry]);
    onAvailabilityUpdate?.(newEntry.resourceId, newEntry);
    
    toast({
      title: "Time Off Requested",
      description: "Your time off request has been submitted for approval."
    });
    
    setIsTimeOffDialogOpen(false);
  };

  // Handle time off approval/rejection
  const handleTimeOffApproval = (entryId: number, approved: boolean) => {
    setAvailabilityEntries(prev => 
      prev.map(entry => 
        entry.id === entryId 
          ? { 
              ...entry, 
              status: approved ? 'approved' : 'rejected',
              approvedBy: 'current_user' // In real app, get from auth context
            }
          : entry
      )
    );

    toast({
      title: approved ? "Request Approved" : "Request Rejected",
      description: `Time off request has been ${approved ? 'approved' : 'rejected'}.`
    });
  };

  // Helper function to get resource name
  const getResourceName = (resourceId: number): string => {
    const crew = crewMembers.find(c => c.id === resourceId);
    return crew?.externalContractorName || 
           crew?.firstName ||
           'Unknown Resource';
  };

  // Generate calendar events for availability
  const availabilityCalendarEvents = useMemo(() => {
    return availabilityEntries
      .filter(entry => {
        if (selectedResource && entry.resourceId !== selectedResource) return false;
        if (timeOffFilter !== 'all' && entry.type !== timeOffFilter) return false;
        if (statusFilter !== 'all' && entry.status !== statusFilter) return false;
        return true;
      })
      .map(entry => ({
        id: entry.id,
        title: `${entry.type.replace('_', ' ').toUpperCase()} - ${getResourceName(entry.resourceId)}`,
        start: entry.startDate,
        end: entry.endDate,
        resource: {
          id: entry.resourceId,
          type: entry.resourceType,
          name: getResourceName(entry.resourceId)
        },
        availabilityType: entry.type,
        status: entry.status,
        notes: entry.notes,
        reason: entry.reason
      }));
  }, [availabilityEntries, selectedResource, timeOffFilter, statusFilter, crewMembers]);

  // Filter availability status by selected resource
  const filteredAvailabilityStatus = selectedResource
    ? resourceAvailabilityStatus.filter(status => status.resourceId === selectedResource)
    : resourceAvailabilityStatus;

  if (crewLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Users className="mr-2 h-5 w-5" />
            Resource Availability
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-96 flex items-center justify-center">
            <div className="animate-pulse text-gray-500">Loading availability data...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center">
            <Users className="mr-2 h-5 w-5" />
            Resource Availability Tracker
          </CardTitle>
          <div className="flex items-center space-x-2">
            <Dialog open={isTimeOffDialogOpen} onOpenChange={setIsTimeOffDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" data-testid="button-request-time-off">
                  <Plus className="mr-1 h-4 w-4" />
                  Request Time Off
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Request Time Off</DialogTitle>
                </DialogHeader>
                <TimeOffRequestForm onSubmit={submitTimeOffRequest} />
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="calendar" data-testid="tab-calendar">Calendar View</TabsTrigger>
            <TabsTrigger value="status" data-testid="tab-status">Availability Status</TabsTrigger>
            <TabsTrigger value="requests" data-testid="tab-requests">Time Off Requests</TabsTrigger>
            <TabsTrigger value="filters" data-testid="tab-filters">Filters & Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="calendar" className="space-y-4">
            <div className="flex items-center space-x-4 mb-4">
              <Select value={selectedResource?.toString() || 'all'} onValueChange={(value) => 
                setSelectedResource(value === 'all' ? null : parseInt(value))
              }>
                <SelectTrigger className="w-64" data-testid="select-resource-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Resources</SelectItem>
                  {crewMembers.map(crew => (
                    <SelectItem key={crew.id} value={crew.id.toString()}>
                      <div className="flex items-center space-x-2">
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={crew.user?.email} />
                          <AvatarFallback>
                            {crew.externalContractorName?.[0] || crew.user?.firstName?.[0] || 'C'}
                          </AvatarFallback>
                        </Avatar>
                        <span>
                          {crew.externalContractorName || 
                           `${crew.user?.firstName} ${crew.user?.lastName}`}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={viewMode} onValueChange={(value: any) => setViewMode(value)}>
                <SelectTrigger className="w-32" data-testid="select-view-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">Week View</SelectItem>
                  <SelectItem value="month">Month View</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="h-[600px] bg-white rounded-lg border">
              <Calendar
                localizer={moment.localizer(moment)}
                events={availabilityCalendarEvents}
                startAccessor="start"
                endAccessor="end"
                view={viewMode}
                onView={() => {}}
                selectable={false}
                components={{
                  event: ({ event }) => (
                    <div className={cn(
                      "p-1 rounded text-xs border-l-2 truncate",
                      getAvailabilityTypeColor(event.availabilityType),
                      event.status === 'pending' && "opacity-75 border-dashed"
                    )}>
                      <div className="flex items-center space-x-1">
                        {getAvailabilityTypeIcon(event.availabilityType)}
                        <span className="font-medium truncate">{event.title}</span>
                      </div>
                      {event.status === 'pending' && (
                        <Badge variant="outline" className="text-xs mt-1">
                          Pending
                        </Badge>
                      )}
                    </div>
                  )
                }}
                eventPropGetter={(event: any) => ({
                  style: {
                    backgroundColor: event.status === 'approved' ? '#22c55e' : 
                                   event.status === 'rejected' ? '#ef4444' : '#f59e0b',
                    borderColor: event.status === 'approved' ? '#16a34a' : 
                               event.status === 'rejected' ? '#dc2626' : '#d97706',
                    color: 'white',
                    opacity: event.status === 'pending' ? 0.7 : 1
                  }
                })}
                className="bg-white rounded-lg border"
                data-testid="availability-calendar"
              />
            </div>
          </TabsContent>

          <TabsContent value="status" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredAvailabilityStatus.map(status => (
                <Card 
                  key={status.resourceId} 
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setSelectedResource(status.resourceId)}
                  data-testid={`availability-card-${status.resourceId}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-3 mb-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={crewMembers.find(c => c.id === status.resourceId)?.user?.email} />
                        <AvatarFallback>
                          {status.resourceName?.[0] || 'R'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <h4 className="font-medium">{status.resourceName}</h4>
                        <p className="text-sm text-gray-500 capitalize">
                          {status.resourceType.replace('_', ' ')}
                        </p>
                      </div>
                      <Badge className={cn(
                        "border",
                        status.status === 'available' ? 'bg-green-100 text-green-800 border-green-200' :
                        status.status === 'partially_available' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' :
                        status.status === 'fully_booked' ? 'bg-red-100 text-red-800 border-red-200' :
                        'bg-gray-100 text-gray-600 border-gray-200'
                      )}>
                        {status.status.replace('_', ' ')}
                      </Badge>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center text-gray-600">
                          <Clock className="mr-1 h-3 w-3" />
                          Utilization
                        </span>
                        <span className="font-medium">{status.utilizationRate.toFixed(0)}%</span>
                      </div>
                      
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className={cn(
                            "h-2 rounded-full",
                            status.utilizationRate <= 50 ? "bg-green-500" :
                            status.utilizationRate <= 80 ? "bg-yellow-500" :
                            status.utilizationRate <= 100 ? "bg-orange-500" : "bg-red-500"
                          )}
                          style={{ width: `${Math.min(status.utilizationRate, 100)}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Available Hours</span>
                        <span className="font-medium">{status.availableHours.toFixed(0)}h</span>
                      </div>

                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Scheduled Hours</span>
                        <span className="font-medium">{status.totalScheduledHours.toFixed(0)}h</span>
                      </div>

                      {status.timeOffRequests.length > 0 && (
                        <div className="pt-2 border-t">
                          <div className="text-xs text-gray-500 mb-1">
                            Upcoming Time Off ({status.timeOffRequests.length})
                          </div>
                          {status.timeOffRequests.slice(0, 2).map(request => (
                            <div key={request.id} className="text-xs bg-gray-50 rounded p-1 mb-1">
                              <div className="flex items-center justify-between">
                                <span className="capitalize">{request.type.replace('_', ' ')}</span>
                                <Badge className={`${getStatusColor(request.status)} text-xs`}>
                                  {request.status}
                                </Badge>
                              </div>
                              <div className="text-gray-500">
                                {format(request.startDate, 'MMM dd')} - {format(request.endDate, 'MMM dd')}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="requests" className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-4">
                <Select value={timeOffFilter} onValueChange={setTimeOffFilter}>
                  <SelectTrigger className="w-48" data-testid="select-time-off-filter">
                    <SelectValue placeholder="Filter by type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="vacation">Vacation</SelectItem>
                    <SelectItem value="sick_leave">Sick Leave</SelectItem>
                    <SelectItem value="personal">Personal</SelectItem>
                    <SelectItem value="training">Training</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-48" data-testid="select-status-filter">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Resource</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {availabilityEntries
                  .filter(entry => {
                    if (timeOffFilter !== 'all' && entry.type !== timeOffFilter) return false;
                    if (statusFilter !== 'all' && entry.status !== statusFilter) return false;
                    return true;
                  })
                  .map(entry => (
                    <TableRow key={entry.id} data-testid={`time-off-row-${entry.id}`}>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback>
                              {getResourceName(entry.resourceId)?.[0] || 'R'}
                            </AvatarFallback>
                          </Avatar>
                          <span>{getResourceName(entry.resourceId)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          {getAvailabilityTypeIcon(entry.type)}
                          <span className="capitalize">{entry.type.replace('_', ' ')}</span>
                        </div>
                      </TableCell>
                      <TableCell>{format(entry.startDate, 'MMM dd, yyyy')}</TableCell>
                      <TableCell>{format(entry.endDate, 'MMM dd, yyyy')}</TableCell>
                      <TableCell>
                        <Badge className={`${getStatusColor(entry.status)} border`}>
                          {entry.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-xs truncate">
                        {entry.reason || '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          {entry.status === 'pending' && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleTimeOffApproval(entry.id!, true)}
                                data-testid={`button-approve-${entry.id}`}
                              >
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleTimeOffApproval(entry.id!, false)}
                                data-testid={`button-reject-${entry.id}`}
                              >
                                <X className="h-4 w-4 text-red-500" />
                              </Button>
                            </>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              // Handle view/edit
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </TabsContent>

          <TabsContent value="filters" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-medium mb-3">Calendar Settings</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm">Show Weekends</label>
                    <Switch defaultChecked={true} />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-sm">Show Holidays</label>
                    <Switch defaultChecked={true} />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-sm">Auto-approve Maintenance</label>
                    <Switch defaultChecked={false} />
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-3">Notification Settings</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm">Email Notifications</label>
                    <Switch defaultChecked={true} />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-sm">SMS Reminders</label>
                    <Switch defaultChecked={false} />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-sm">Calendar Sync</label>
                    <Switch defaultChecked={true} />
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// Time Off Request Form Component
function TimeOffRequestForm({ onSubmit }: { onSubmit: (data: Partial<AvailabilityEntry>) => void }) {
  const [formData, setFormData] = useState<Partial<AvailabilityEntry>>({
    type: 'vacation',
    startDate: new Date(),
    endDate: addDays(new Date(), 1)
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-sm font-medium">Type of Time Off</label>
        <Select 
          value={formData.type} 
          onValueChange={(value: any) => setFormData(prev => ({ ...prev, type: value }))}
        >
          <SelectTrigger data-testid="select-time-off-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="vacation">Vacation</SelectItem>
            <SelectItem value="sick_leave">Sick Leave</SelectItem>
            <SelectItem value="personal">Personal</SelectItem>
            <SelectItem value="training">Training</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Start Date</label>
          <Input
            type="date"
            value={format(formData.startDate || new Date(), 'yyyy-MM-dd')}
            onChange={(e) => setFormData(prev => ({ ...prev, startDate: new Date(e.target.value) }))}
            data-testid="input-start-date"
          />
        </div>
        <div>
          <label className="text-sm font-medium">End Date</label>
          <Input
            type="date"
            value={format(formData.endDate || new Date(), 'yyyy-MM-dd')}
            onChange={(e) => setFormData(prev => ({ ...prev, endDate: new Date(e.target.value) }))}
            data-testid="input-end-date"
          />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Reason</label>
        <Input
          value={formData.reason || ''}
          onChange={(e) => setFormData(prev => ({ ...prev, reason: e.target.value }))}
          placeholder="Brief reason for time off"
          data-testid="input-reason"
        />
      </div>

      <div>
        <label className="text-sm font-medium">Notes</label>
        <Textarea
          value={formData.notes || ''}
          onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
          placeholder="Additional notes or details"
          className="min-h-[80px]"
          data-testid="textarea-notes"
        />
      </div>

      <div className="flex justify-end space-x-2">
        <Button type="submit" data-testid="button-submit-request">
          Submit Request
        </Button>
      </div>
    </form>
  );
}