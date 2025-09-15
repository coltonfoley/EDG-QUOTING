import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Calendar, momentLocalizer, View } from "react-big-calendar";
import moment from "moment";
import { DndContext, DragEndEvent, DragOverlay } from "@dnd-kit/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { 
  Calendar as CalendarIcon, 
  Users, 
  Wrench, 
  Truck, 
  User,
  AlertTriangle,
  Filter,
  Eye,
  Plus,
  Settings
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { 
  ProjectScheduleEvent, 
  ProjectCrew, 
  ProjectEquipment, 
  ProjectWithDetails,
  User as UserType
} from "@shared/schema";

import "react-big-calendar/lib/css/react-big-calendar.css";

const localizer = momentLocalizer(moment);

interface ResourceCalendarProps {
  projectId?: number;
  showAllProjects?: boolean;
  selectedResourceTypes?: string[];
  onEventClick?: (event: CalendarEvent) => void;
  onEventCreate?: (event: Partial<CalendarEvent>) => void;
  onEventUpdate?: (event: CalendarEvent) => void;
}

interface CalendarEvent {
  id: number;
  title: string;
  start: Date;
  end: Date;
  resource: {
    id: number;
    type: 'crew_member' | 'equipment' | 'vehicle' | 'external_contractor';
    name: string;
  };
  project: {
    id: number;
    name: string;
    color?: string;
  };
  status: string;
  location?: string;
  notes?: string;
  isAllDay: boolean;
}

interface ResourceFilter {
  type: string;
  resourceId?: number;
  status?: string;
}

const getResourceTypeIcon = (type: string) => {
  switch (type) {
    case 'crew_member': return <Users className="h-4 w-4" />;
    case 'equipment': return <Wrench className="h-4 w-4" />;
    case 'vehicle': return <Truck className="h-4 w-4" />;
    case 'external_contractor': return <User className="h-4 w-4" />;
    default: return <CalendarIcon className="h-4 w-4" />;
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'scheduled': return 'bg-blue-100 border-blue-300 text-blue-800';
    case 'in_progress': return 'bg-green-100 border-green-300 text-green-800';
    case 'completed': return 'bg-gray-100 border-gray-300 text-gray-600';
    case 'cancelled': return 'bg-red-100 border-red-300 text-red-800';
    case 'rescheduled': return 'bg-yellow-100 border-yellow-300 text-yellow-800';
    default: return 'bg-gray-100 border-gray-300 text-gray-600';
  }
};

const getProjectColor = (projectId: number): string => {
  const colors = [
    '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
    '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6B7280'
  ];
  return colors[projectId % colors.length];
};

export default function ResourceCalendar({
  projectId,
  showAllProjects = false,
  selectedResourceTypes = ['crew_member', 'equipment', 'vehicle', 'external_contractor'],
  onEventClick,
  onEventCreate,
  onEventUpdate
}: ResourceCalendarProps) {
  const [currentView, setCurrentView] = useState<View>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedResource, setSelectedResource] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState('calendar');
  const [draggedEvent, setDraggedEvent] = useState<CalendarEvent | null>(null);
  
  const { toast } = useToast();

  // Fetch schedule events
  const { data: scheduleEvents = [], isLoading: eventsLoading } = useQuery({
    queryKey: ["/api/schedule-events", { 
      projectId: showAllProjects ? undefined : projectId,
      resourceTypes: selectedResourceTypes 
    }],
    enabled: showAllProjects || !!projectId,
  });

  // Fetch crew members
  const { data: crewMembers = [] } = useQuery<ProjectCrew[]>({
    queryKey: ["/api/projects", projectId, "crew"],
    enabled: !!projectId && selectedResourceTypes.includes('crew_member'),
  });

  // Fetch equipment
  const { data: equipment = [] } = useQuery<ProjectEquipment[]>({
    queryKey: ["/api/projects", projectId, "equipment"],
    enabled: !!projectId && selectedResourceTypes.includes('equipment'),
  });

  // Fetch all projects if showing all projects
  const { data: projects = [] } = useQuery<ProjectWithDetails[]>({
    queryKey: ["/api/projects"],
    enabled: showAllProjects,
  });

  // Update event mutation
  const updateEventMutation = useMutation({
    mutationFn: (eventData: Partial<ProjectScheduleEvent>) => 
      apiRequest(`/api/schedule-events/${eventData.id}`, {
        method: 'PATCH',
        body: eventData
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedule-events"] });
      toast({
        title: "Event Updated",
        description: "Schedule event has been updated successfully."
      });
    },
    onError: (error) => {
      console.error('Failed to update event:', error);
      toast({
        title: "Update Failed",
        description: "Failed to update schedule event. Please try again.",
        variant: "destructive"
      });
    }
  });

  // Convert schedule events to calendar format
  const calendarEvents: CalendarEvent[] = useMemo(() => {
    return scheduleEvents
      .filter(event => {
        if (selectedResource !== 'all' && event.resourceId !== parseInt(selectedResource)) {
          return false;
        }
        if (statusFilter !== 'all' && event.status !== statusFilter) {
          return false;
        }
        return true;
      })
      .map(event => ({
        id: event.id,
        title: event.title,
        start: new Date(event.startDateTime),
        end: new Date(event.endDateTime),
        resource: {
          id: event.resourceId,
          type: event.resourceType,
          name: getResourceName(event.resourceType, event.resourceId)
        },
        project: {
          id: event.projectId,
          name: getProjectName(event.projectId),
          color: getProjectColor(event.projectId)
        },
        status: event.status,
        location: event.location,
        notes: event.notes,
        isAllDay: event.isAllDay
      }));
  }, [scheduleEvents, selectedResource, statusFilter, crewMembers, equipment, projects]);

  const getResourceName = (resourceType: string, resourceId: number): string => {
    switch (resourceType) {
      case 'crew_member':
        const crewMember = crewMembers.find(c => c.id === resourceId);
        return crewMember?.externalContractorName || 
               (crewMember?.user ? `${crewMember.user.firstName} ${crewMember.user.lastName}` : '');
      case 'equipment':
        const equipmentItem = equipment.find(e => e.id === resourceId);
        return equipmentItem?.name || '';
      default:
        return 'Unknown Resource';
    }
  };

  const getProjectName = (projectId: number): string => {
    if (showAllProjects) {
      const project = projects.find(p => p.id === projectId);
      return project?.name || 'Unknown Project';
    }
    return 'Current Project';
  };

  // Handle event selection
  const handleEventClick = useCallback((event: CalendarEvent) => {
    onEventClick?.(event);
  }, [onEventClick]);

  // Handle slot selection for creating new events
  const handleSlotSelect = useCallback(({ start, end }: { start: Date; end: Date }) => {
    if (onEventCreate) {
      onEventCreate({
        start,
        end,
        title: 'New Event',
        project: { id: projectId || 0, name: '' },
        resource: { id: 0, type: 'crew_member', name: '' },
        status: 'scheduled',
        isAllDay: false
      });
    }
  }, [onEventCreate, projectId]);

  // Handle event drag and drop
  const handleEventDrop = useCallback(({ event, start, end }: { 
    event: CalendarEvent; 
    start: Date; 
    end: Date; 
  }) => {
    const updatedEvent = { ...event, start, end };
    
    updateEventMutation.mutate({
      id: event.id,
      startDateTime: start.toISOString(),
      endDateTime: end.toISOString()
    });
    
    onEventUpdate?.(updatedEvent);
  }, [updateEventMutation, onEventUpdate]);

  // Handle event resize
  const handleEventResize = useCallback(({ event, start, end }: { 
    event: CalendarEvent; 
    start: Date; 
    end: Date; 
  }) => {
    const updatedEvent = { ...event, start, end };
    
    updateEventMutation.mutate({
      id: event.id,
      startDateTime: start.toISOString(),
      endDateTime: end.toISOString()
    });
    
    onEventUpdate?.(updatedEvent);
  }, [updateEventMutation, onEventUpdate]);

  // Custom event component
  const EventComponent = ({ event }: { event: CalendarEvent }) => (
    <div className={cn(
      "p-1 rounded text-xs border-l-2 truncate",
      getStatusColor(event.status)
    )} style={{ borderLeftColor: event.project.color }}>
      <div className="flex items-center space-x-1">
        {getResourceTypeIcon(event.resource.type)}
        <span className="font-medium truncate">{event.title}</span>
      </div>
      <div className="text-xs opacity-75 truncate">
        {event.resource.name} • {event.project.name}
      </div>
      {event.status === 'cancelled' && (
        <AlertTriangle className="h-3 w-3 text-red-500 absolute top-1 right-1" />
      )}
    </div>
  );

  // Get all unique resources for filtering
  const allResources = useMemo(() => {
    const resources: Array<{ id: number; name: string; type: string }> = [];
    
    crewMembers.forEach(crew => {
      resources.push({
        id: crew.id,
        name: crew.externalContractorName || 
              (crew.user ? `${crew.user.firstName} ${crew.user.lastName}` : ''),
        type: 'crew_member'
      });
    });
    
    equipment.forEach(equip => {
      resources.push({
        id: equip.id,
        name: equip.name,
        type: 'equipment'
      });
    });
    
    return resources;
  }, [crewMembers, equipment]);

  // Check for scheduling conflicts
  const getConflicts = useMemo(() => {
    const conflicts: CalendarEvent[] = [];
    const resourceSchedules = new Map<number, CalendarEvent[]>();
    
    // Group events by resource
    calendarEvents.forEach(event => {
      const resourceId = event.resource.id;
      if (!resourceSchedules.has(resourceId)) {
        resourceSchedules.set(resourceId, []);
      }
      resourceSchedules.get(resourceId)!.push(event);
    });
    
    // Check for overlapping events for each resource
    resourceSchedules.forEach(events => {
      events.sort((a, b) => a.start.getTime() - b.start.getTime());
      
      for (let i = 0; i < events.length - 1; i++) {
        const current = events[i];
        const next = events[i + 1];
        
        if (current.end > next.start && current.status !== 'cancelled' && next.status !== 'cancelled') {
          if (!conflicts.find(c => c.id === current.id)) conflicts.push(current);
          if (!conflicts.find(c => c.id === next.id)) conflicts.push(next);
        }
      }
    });
    
    return conflicts;
  }, [calendarEvents]);

  if (eventsLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <CalendarIcon className="mr-2 h-5 w-5" />
            Resource Calendar
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-96 flex items-center justify-center">
            <div className="animate-pulse text-gray-500">Loading calendar...</div>
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
            <CalendarIcon className="mr-2 h-5 w-5" />
            Resource Calendar
          </CardTitle>
          <div className="flex items-center space-x-2">
            {getConflicts.length > 0 && (
              <Badge variant="destructive" className="flex items-center">
                <AlertTriangle className="mr-1 h-3 w-3" />
                {getConflicts.length} Conflicts
              </Badge>
            )}
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => onEventCreate?.({ 
                start: new Date(), 
                end: new Date(Date.now() + 3600000),
                title: 'New Event',
                project: { id: projectId || 0, name: '' },
                resource: { id: 0, type: 'crew_member', name: '' },
                status: 'scheduled',
                isAllDay: false
              })}
              data-testid="button-create-event"
            >
              <Plus className="mr-1 h-4 w-4" />
              Add Event
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="calendar" data-testid="tab-calendar">Calendar View</TabsTrigger>
            <TabsTrigger value="filters" data-testid="tab-filters">Filters & Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="calendar" className="space-y-4">
            <div className="h-[600px]">
              <Calendar
                localizer={localizer}
                events={calendarEvents}
                startAccessor="start"
                endAccessor="end"
                view={currentView}
                onView={setCurrentView}
                date={currentDate}
                onNavigate={setCurrentDate}
                onSelectEvent={handleEventClick}
                onSelectSlot={handleSlotSelect}
                onEventDrop={handleEventDrop}
                onEventResize={handleEventResize}
                selectable
                resizable
                dragFromOutsideItem={() => draggedEvent}
                components={{
                  event: EventComponent,
                }}
                eventPropGetter={(event: CalendarEvent) => ({
                  style: {
                    backgroundColor: event.project.color || '#3B82F6',
                    borderColor: event.project.color || '#3B82F6',
                    color: 'white',
                  }
                })}
                className="bg-white rounded-lg border"
                data-testid="resource-calendar"
              />
            </div>
          </TabsContent>

          <TabsContent value="filters" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  Resource Type
                </label>
                <Select value={selectedResource} onValueChange={setSelectedResource}>
                  <SelectTrigger data-testid="select-resource">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Resources</SelectItem>
                    {allResources.map(resource => (
                      <SelectItem key={resource.id} value={resource.id.toString()}>
                        <div className="flex items-center space-x-2">
                          {getResourceTypeIcon(resource.type)}
                          <span>{resource.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  Event Status
                </label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger data-testid="select-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                    <SelectItem value="rescheduled">Rescheduled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  Calendar View
                </label>
                <Select value={currentView} onValueChange={(value: View) => setCurrentView(value)}>
                  <SelectTrigger data-testid="select-view">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="month">Month View</SelectItem>
                    <SelectItem value="week">Week View</SelectItem>
                    <SelectItem value="day">Day View</SelectItem>
                    <SelectItem value="agenda">Agenda View</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {getConflicts.length > 0 && (
              <div className="mt-6">
                <h4 className="text-sm font-medium text-red-700 mb-3 flex items-center">
                  <AlertTriangle className="mr-2 h-4 w-4" />
                  Scheduling Conflicts ({getConflicts.length})
                </h4>
                <div className="space-y-2">
                  {getConflicts.map(conflict => (
                    <div 
                      key={conflict.id} 
                      className="p-3 border border-red-200 rounded-lg bg-red-50"
                      data-testid={`conflict-${conflict.id}`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-red-800">{conflict.title}</div>
                          <div className="text-sm text-red-600">
                            {conflict.resource.name} • {moment(conflict.start).format('MMM DD, h:mm A')} - {moment(conflict.end).format('h:mm A')}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onEventClick?.(conflict)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}