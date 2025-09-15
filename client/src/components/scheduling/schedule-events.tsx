import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { 
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  Users,
  Wrench,
  Truck,
  User,
  Plus,
  Edit,
  Trash,
  Eye,
  Copy,
  RefreshCw,
  FileText,
  AlertTriangle,
  CheckCircle2,
  X,
  Save,
  MoreHorizontal
} from "lucide-react";
import { format, addDays, addWeeks, addMonths, parseISO, startOfDay, endOfDay, isAfter, isBefore } from "date-fns";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { insertProjectScheduleEventSchema } from "@shared/schema";
import type { 
  ProjectScheduleEvent,
  ProjectCrew,
  ProjectEquipment,
  ProjectTask,
  ProjectWithDetails,
  InsertProjectScheduleEvent
} from "@shared/schema";

interface ScheduleEventsProps {
  projectId?: number;
  showAllProjects?: boolean;
  selectedDate?: Date;
  preSelectedResource?: {
    id: number;
    type: 'crew_member' | 'equipment' | 'vehicle' | 'external_contractor';
  };
  onEventCreated?: (event: ProjectScheduleEvent) => void;
  onEventUpdated?: (event: ProjectScheduleEvent) => void;
  onEventDeleted?: (eventId: number) => void;
}

interface RecurrencePattern {
  frequency: 'none' | 'daily' | 'weekly' | 'monthly';
  interval: number;
  endDate?: Date;
  occurrences?: number;
}

const eventFormSchema = insertProjectScheduleEventSchema.extend({
  startDate: z.date(),
  startTime: z.string().min(1, "Start time is required"),
  endDate: z.date(),
  endTime: z.string().min(1, "End time is required"),
  recurrence: z.object({
    frequency: z.enum(['none', 'daily', 'weekly', 'monthly']),
    interval: z.number().min(1).max(99),
    endDate: z.date().optional(),
    occurrences: z.number().min(1).max(365).optional()
  }).optional()
});

type EventFormData = z.infer<typeof eventFormSchema>;

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
    case 'scheduled': return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'in_progress': return 'bg-green-100 text-green-800 border-green-200';
    case 'completed': return 'bg-gray-100 text-gray-600 border-gray-200';
    case 'cancelled': return 'bg-red-100 text-red-800 border-red-200';
    case 'rescheduled': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    default: return 'bg-gray-100 text-gray-600 border-gray-200';
  }
};

export default function ScheduleEventsManager({
  projectId,
  showAllProjects = false,
  selectedDate,
  preSelectedResource,
  onEventCreated,
  onEventUpdated,
  onEventDeleted
}: ScheduleEventsProps) {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<ProjectScheduleEvent | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedResourceType, setSelectedResourceType] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<Date>(selectedDate || new Date());
  
  const { toast } = useToast();

  // Form for creating/editing events
  const form = useForm<EventFormData>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      title: '',
      resourceType: preSelectedResource?.type || 'crew_member',
      resourceId: preSelectedResource?.id || 0,
      status: 'scheduled',
      isAllDay: false,
      location: '',
      notes: '',
      startDate: selectedDate || new Date(),
      startTime: '09:00',
      endDate: selectedDate || new Date(),
      endTime: '17:00',
      recurrence: {
        frequency: 'none',
        interval: 1
      }
    }
  });

  // Fetch schedule events
  const { data: scheduleEvents = [], isLoading: eventsLoading, refetch: refetchEvents } = useQuery({
    queryKey: ["/api/schedule-events", { 
      projectId: showAllProjects ? undefined : projectId,
      startDate: startOfDay(dateFilter).toISOString(),
      endDate: endOfDay(dateFilter).toISOString()
    }],
    enabled: showAllProjects || !!projectId,
  });

  // Fetch crew members
  const { data: crewMembers = [] } = useQuery<ProjectCrew[]>({
    queryKey: ["/api/projects", projectId, "crew"],
    enabled: !!projectId,
  });

  // Fetch equipment
  const { data: equipment = [] } = useQuery<ProjectEquipment[]>({
    queryKey: ["/api/projects", projectId, "equipment"],
    enabled: !!projectId,
  });

  // Fetch project tasks
  const { data: tasks = [] } = useQuery<ProjectTask[]>({
    queryKey: ["/api/projects", projectId, "tasks"],
    enabled: !!projectId,
  });

  // Create event mutation
  const createEventMutation = useMutation({
    mutationFn: (eventData: InsertProjectScheduleEvent) => 
      apiRequest('/api/schedule-events', {
        method: 'POST',
        body: eventData
      }),
    onSuccess: (newEvent) => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedule-events"] });
      toast({
        title: "Event Created",
        description: "Schedule event has been created successfully."
      });
      setIsCreateModalOpen(false);
      form.reset();
      onEventCreated?.(newEvent);
    },
    onError: (error) => {
      console.error('Failed to create event:', error);
      toast({
        title: "Creation Failed",
        description: "Failed to create schedule event. Please try again.",
        variant: "destructive"
      });
    }
  });

  // Update event mutation
  const updateEventMutation = useMutation({
    mutationFn: ({ id, ...eventData }: Partial<ProjectScheduleEvent>) => 
      apiRequest(`/api/schedule-events/${id}`, {
        method: 'PATCH',
        body: eventData
      }),
    onSuccess: (updatedEvent) => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedule-events"] });
      toast({
        title: "Event Updated",
        description: "Schedule event has been updated successfully."
      });
      setIsEditModalOpen(false);
      setSelectedEvent(null);
      onEventUpdated?.(updatedEvent);
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

  // Delete event mutation
  const deleteEventMutation = useMutation({
    mutationFn: (eventId: number) => 
      apiRequest(`/api/schedule-events/${eventId}`, {
        method: 'DELETE'
      }),
    onSuccess: (_, eventId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedule-events"] });
      toast({
        title: "Event Deleted",
        description: "Schedule event has been deleted successfully."
      });
      setIsViewModalOpen(false);
      setSelectedEvent(null);
      onEventDeleted?.(eventId);
    },
    onError: (error) => {
      console.error('Failed to delete event:', error);
      toast({
        title: "Deletion Failed",
        description: "Failed to delete schedule event. Please try again.",
        variant: "destructive"
      });
    }
  });

  // Generate recurring events
  const generateRecurringEvents = (baseEvent: EventFormData): InsertProjectScheduleEvent[] => {
    const events: InsertProjectScheduleEvent[] = [];
    const { recurrence } = baseEvent;
    
    if (!recurrence || recurrence.frequency === 'none') {
      // Single event
      const startDateTime = new Date(baseEvent.startDate);
      const [startHour, startMinute] = baseEvent.startTime.split(':');
      startDateTime.setHours(parseInt(startHour), parseInt(startMinute));
      
      const endDateTime = new Date(baseEvent.endDate);
      const [endHour, endMinute] = baseEvent.endTime.split(':');
      endDateTime.setHours(parseInt(endHour), parseInt(endMinute));
      
      events.push({
        ...baseEvent,
        projectId: projectId!,
        startDateTime: startDateTime.toISOString(),
        endDateTime: endDateTime.toISOString(),
      });
      
      return events;
    }
    
    // Generate recurring events
    let currentDate = new Date(baseEvent.startDate);
    const maxOccurrences = recurrence.occurrences || 100;
    const endDate = recurrence.endDate || addMonths(new Date(), 12);
    
    for (let i = 0; i < maxOccurrences && isBefore(currentDate, endDate); i++) {
      const startDateTime = new Date(currentDate);
      const [startHour, startMinute] = baseEvent.startTime.split(':');
      startDateTime.setHours(parseInt(startHour), parseInt(startMinute));
      
      const endDateTime = new Date(currentDate);
      const [endHour, endMinute] = baseEvent.endTime.split(':');
      endDateTime.setHours(parseInt(endHour), parseInt(endMinute));
      
      events.push({
        ...baseEvent,
        projectId: projectId!,
        title: `${baseEvent.title} ${i > 0 ? `(${i + 1})` : ''}`,
        startDateTime: startDateTime.toISOString(),
        endDateTime: endDateTime.toISOString(),
      });
      
      // Calculate next occurrence
      switch (recurrence.frequency) {
        case 'daily':
          currentDate = addDays(currentDate, recurrence.interval);
          break;
        case 'weekly':
          currentDate = addWeeks(currentDate, recurrence.interval);
          break;
        case 'monthly':
          currentDate = addMonths(currentDate, recurrence.interval);
          break;
      }
    }
    
    return events;
  };

  // Handle form submission
  const onSubmit = async (data: EventFormData) => {
    try {
      const recurringEvents = generateRecurringEvents(data);
      
      // Create all events
      for (const eventData of recurringEvents) {
        await createEventMutation.mutateAsync(eventData);
      }
      
      if (recurringEvents.length > 1) {
        toast({
          title: "Recurring Events Created",
          description: `Successfully created ${recurringEvents.length} recurring events.`
        });
      }
    } catch (error) {
      console.error('Failed to create recurring events:', error);
    }
  };

  // Handle event editing
  const handleEditEvent = (event: ProjectScheduleEvent) => {
    const startDateTime = parseISO(event.startDateTime);
    const endDateTime = parseISO(event.endDateTime);
    
    form.reset({
      title: event.title,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      taskId: event.taskId || undefined,
      status: event.status,
      isAllDay: event.isAllDay,
      location: event.location || '',
      notes: event.notes || '',
      startDate: startDateTime,
      startTime: format(startDateTime, 'HH:mm'),
      endDate: endDateTime,
      endTime: format(endDateTime, 'HH:mm'),
      recurrence: {
        frequency: 'none',
        interval: 1
      }
    });
    
    setSelectedEvent(event);
    setIsEditModalOpen(true);
  };

  // Handle event update
  const handleUpdateEvent = async (data: EventFormData) => {
    if (!selectedEvent) return;
    
    const startDateTime = new Date(data.startDate);
    const [startHour, startMinute] = data.startTime.split(':');
    startDateTime.setHours(parseInt(startHour), parseInt(startMinute));
    
    const endDateTime = new Date(data.endDate);
    const [endHour, endMinute] = data.endTime.split(':');
    endDateTime.setHours(parseInt(endHour), parseInt(endMinute));
    
    await updateEventMutation.mutateAsync({
      id: selectedEvent.id,
      title: data.title,
      resourceType: data.resourceType,
      resourceId: data.resourceId,
      taskId: data.taskId,
      status: data.status,
      isAllDay: data.isAllDay,
      location: data.location,
      notes: data.notes,
      startDateTime: startDateTime.toISOString(),
      endDateTime: endDateTime.toISOString(),
    });
  };

  // Get resource name
  const getResourceName = (resourceType: string, resourceId: number): string => {
    switch (resourceType) {
      case 'crew_member':
        const crew = crewMembers.find(c => c.id === resourceId);
        return crew?.externalContractorName || 
               (crew?.user ? `${crew.user.firstName} ${crew.user.lastName}` : 'Unknown Crew');
      case 'equipment':
        const equip = equipment.find(e => e.id === resourceId);
        return equip?.name || 'Unknown Equipment';
      default:
        return 'Unknown Resource';
    }
  };

  // Filter events based on current filters
  const filteredEvents = scheduleEvents.filter(event => {
    if (selectedResourceType !== 'all' && event.resourceType !== selectedResourceType) {
      return false;
    }
    if (statusFilter !== 'all' && event.status !== statusFilter) {
      return false;
    }
    return true;
  });

  // Check for conflicts
  const checkForConflicts = (event: ProjectScheduleEvent): ProjectScheduleEvent[] => {
    return scheduleEvents.filter(otherEvent => {
      if (otherEvent.id === event.id) return false;
      if (otherEvent.resourceType !== event.resourceType || otherEvent.resourceId !== event.resourceId) return false;
      if (otherEvent.status === 'cancelled') return false;
      
      const eventStart = new Date(event.startDateTime);
      const eventEnd = new Date(event.endDateTime);
      const otherStart = new Date(otherEvent.startDateTime);
      const otherEnd = new Date(otherEvent.endDateTime);
      
      return (eventStart < otherEnd && eventEnd > otherStart);
    });
  };

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center">
            <CalendarIcon className="mr-2 h-5 w-5" />
            Schedule Events Manager
          </CardTitle>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchEvents()}
              data-testid="button-refresh-events"
            >
              <RefreshCw className="mr-1 h-4 w-4" />
              Refresh
            </Button>
            <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
              <DialogTrigger asChild>
                <Button size="sm" data-testid="button-create-event">
                  <Plus className="mr-1 h-4 w-4" />
                  New Event
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create Schedule Event</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    {/* Event Details */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="title"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Event Title</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Enter event title" data-testid="input-event-title" />
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
                            <FormLabel>Status</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-event-status">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="scheduled">Scheduled</SelectItem>
                                <SelectItem value="in_progress">In Progress</SelectItem>
                                <SelectItem value="completed">Completed</SelectItem>
                                <SelectItem value="cancelled">Cancelled</SelectItem>
                                <SelectItem value="rescheduled">Rescheduled</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Resource Selection */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="resourceType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Resource Type</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-resource-type">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="crew_member">
                                  <div className="flex items-center">
                                    <Users className="mr-2 h-4 w-4" />
                                    Crew Member
                                  </div>
                                </SelectItem>
                                <SelectItem value="equipment">
                                  <div className="flex items-center">
                                    <Wrench className="mr-2 h-4 w-4" />
                                    Equipment
                                  </div>
                                </SelectItem>
                                <SelectItem value="vehicle">
                                  <div className="flex items-center">
                                    <Truck className="mr-2 h-4 w-4" />
                                    Vehicle
                                  </div>
                                </SelectItem>
                                <SelectItem value="external_contractor">
                                  <div className="flex items-center">
                                    <User className="mr-2 h-4 w-4" />
                                    External Contractor
                                  </div>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="resourceId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Select Resource</FormLabel>
                            <Select 
                              onValueChange={(value) => field.onChange(parseInt(value))} 
                              value={field.value?.toString()}
                            >
                              <FormControl>
                                <SelectTrigger data-testid="select-resource">
                                  <SelectValue placeholder="Select a resource" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {form.watch('resourceType') === 'crew_member' && 
                                  crewMembers.map(crew => (
                                    <SelectItem key={crew.id} value={crew.id.toString()}>
                                      {crew.externalContractorName || 
                                       `${crew.user?.firstName} ${crew.user?.lastName}`}
                                    </SelectItem>
                                  ))
                                }
                                {form.watch('resourceType') === 'equipment' && 
                                  equipment.map(equip => (
                                    <SelectItem key={equip.id} value={equip.id.toString()}>
                                      {equip.name}
                                    </SelectItem>
                                  ))
                                }
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Date and Time */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <FormField
                          control={form.control}
                          name="startDate"
                          render={({ field }) => (
                            <FormItem className="flex flex-col">
                              <FormLabel>Start Date</FormLabel>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <FormControl>
                                    <Button
                                      variant="outline"
                                      className={cn(
                                        "pl-3 text-left font-normal",
                                        !field.value && "text-muted-foreground"
                                      )}
                                      data-testid="button-start-date"
                                    >
                                      {field.value ? (
                                        format(field.value, "PPP")
                                      ) : (
                                        <span>Pick start date</span>
                                      )}
                                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                    </Button>
                                  </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                  <Calendar
                                    mode="single"
                                    selected={field.value}
                                    onSelect={field.onChange}
                                    disabled={(date) => isBefore(date, new Date())}
                                    initialFocus
                                  />
                                </PopoverContent>
                              </Popover>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="startTime"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Start Time</FormLabel>
                              <FormControl>
                                <Input 
                                  type="time" 
                                  {...field} 
                                  data-testid="input-start-time"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="space-y-2">
                        <FormField
                          control={form.control}
                          name="endDate"
                          render={({ field }) => (
                            <FormItem className="flex flex-col">
                              <FormLabel>End Date</FormLabel>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <FormControl>
                                    <Button
                                      variant="outline"
                                      className={cn(
                                        "pl-3 text-left font-normal",
                                        !field.value && "text-muted-foreground"
                                      )}
                                      data-testid="button-end-date"
                                    >
                                      {field.value ? (
                                        format(field.value, "PPP")
                                      ) : (
                                        <span>Pick end date</span>
                                      )}
                                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                    </Button>
                                  </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                  <Calendar
                                    mode="single"
                                    selected={field.value}
                                    onSelect={field.onChange}
                                    disabled={(date) => isBefore(date, form.watch('startDate'))}
                                    initialFocus
                                  />
                                </PopoverContent>
                              </Popover>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="endTime"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>End Time</FormLabel>
                              <FormControl>
                                <Input 
                                  type="time" 
                                  {...field}
                                  data-testid="input-end-time"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>

                    {/* All Day Toggle */}
                    <FormField
                      control={form.control}
                      name="isAllDay"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel>All Day Event</FormLabel>
                            <p className="text-sm text-muted-foreground">
                              This event runs for the entire day
                            </p>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-all-day"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    {/* Location and Task */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="location"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Location</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Event location" data-testid="input-location" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="taskId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Related Task (Optional)</FormLabel>
                            <Select 
                              onValueChange={(value) => field.onChange(value ? parseInt(value) : undefined)} 
                              value={field.value?.toString() || ''}
                            >
                              <FormControl>
                                <SelectTrigger data-testid="select-related-task">
                                  <SelectValue placeholder="Select a task" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="">No task</SelectItem>
                                {tasks.map(task => (
                                  <SelectItem key={task.id} value={task.id.toString()}>
                                    {task.title}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Notes */}
                    <FormField
                      control={form.control}
                      name="notes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Notes</FormLabel>
                          <FormControl>
                            <Textarea 
                              {...field} 
                              placeholder="Additional notes for this event"
                              className="min-h-[80px]"
                              data-testid="textarea-notes"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Recurrence Pattern */}
                    <div className="space-y-4">
                      <Separator />
                      <h4 className="text-sm font-medium">Recurrence Pattern</h4>
                      
                      <FormField
                        control={form.control}
                        name="recurrence.frequency"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Frequency</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-recurrence-frequency">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="none">No Recurrence</SelectItem>
                                <SelectItem value="daily">Daily</SelectItem>
                                <SelectItem value="weekly">Weekly</SelectItem>
                                <SelectItem value="monthly">Monthly</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      {form.watch('recurrence.frequency') !== 'none' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="recurrence.interval"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Every</FormLabel>
                                <FormControl>
                                  <Input 
                                    type="number" 
                                    min="1" 
                                    max="99"
                                    {...field}
                                    onChange={(e) => field.onChange(parseInt(e.target.value))}
                                    data-testid="input-recurrence-interval"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          
                          <FormField
                            control={form.control}
                            name="recurrence.occurrences"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Number of Occurrences</FormLabel>
                                <FormControl>
                                  <Input 
                                    type="number" 
                                    min="1" 
                                    max="365"
                                    {...field}
                                    onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                                    data-testid="input-recurrence-occurrences"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      )}
                    </div>

                    <DialogFooter>
                      <Button 
                        type="button" 
                        variant="outline" 
                        onClick={() => setIsCreateModalOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button 
                        type="submit" 
                        disabled={createEventMutation.isPending}
                        data-testid="button-save-event"
                      >
                        {createEventMutation.isPending ? (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                            Creating...
                          </>
                        ) : (
                          <>
                            <Save className="mr-2 h-4 w-4" />
                            Create Event
                          </>
                        )}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6">
        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Select value={selectedResourceType} onValueChange={setSelectedResourceType}>
            <SelectTrigger data-testid="select-resource-type-filter">
              <SelectValue placeholder="Filter by resource type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="crew_member">Crew Members</SelectItem>
              <SelectItem value="equipment">Equipment</SelectItem>
              <SelectItem value="vehicle">Vehicles</SelectItem>
              <SelectItem value="external_contractor">External Contractors</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger data-testid="select-status-filter">
              <SelectValue placeholder="Filter by status" />
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

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" data-testid="button-date-filter">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(dateFilter, "PPP")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dateFilter}
                onSelect={(date) => date && setDateFilter(date)}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          <div className="text-sm text-gray-500 flex items-center">
            <FileText className="mr-1 h-4 w-4" />
            {filteredEvents.length} events found
          </div>
        </div>

        {/* Events List */}
        <div className="space-y-4">
          {eventsLoading ? (
            <div className="text-center py-8">
              <div className="animate-pulse text-gray-500">Loading events...</div>
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="text-center py-8">
              <CalendarIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <p className="text-gray-500">No events found for the selected filters.</p>
              <Button 
                onClick={() => setIsCreateModalOpen(true)} 
                className="mt-4"
                data-testid="button-create-first-event"
              >
                <Plus className="mr-1 h-4 w-4" />
                Create First Event
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredEvents.map(event => {
                const conflicts = checkForConflicts(event);
                const hasConflicts = conflicts.length > 0;
                
                return (
                  <Card 
                    key={event.id} 
                    className={cn(
                      "cursor-pointer hover:shadow-md transition-shadow",
                      hasConflicts && "border-red-200 bg-red-50"
                    )}
                    onClick={() => {
                      setSelectedEvent(event);
                      setIsViewModalOpen(true);
                    }}
                    data-testid={`event-card-${event.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h4 className="font-medium text-gray-900 truncate">
                            {event.title}
                          </h4>
                          <p className="text-sm text-gray-500 mt-1">
                            {getResourceName(event.resourceType, event.resourceId)}
                          </p>
                        </div>
                        <div className="flex items-center space-x-2">
                          {hasConflicts && (
                            <AlertTriangle className="h-4 w-4 text-red-500" />
                          )}
                          <Badge className={`${getStatusColor(event.status)} border text-xs`}>
                            {event.status.replace('_', ' ')}
                          </Badge>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center text-sm text-gray-600">
                          <Clock className="mr-2 h-4 w-4" />
                          {event.isAllDay ? (
                            'All day'
                          ) : (
                            `${format(parseISO(event.startDateTime), 'HH:mm')} - ${format(parseISO(event.endDateTime), 'HH:mm')}`
                          )}
                        </div>

                        <div className="flex items-center text-sm text-gray-600">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {format(parseISO(event.startDateTime), 'MMM dd, yyyy')}
                        </div>

                        {event.location && (
                          <div className="flex items-center text-sm text-gray-600">
                            <MapPin className="mr-2 h-4 w-4" />
                            {event.location}
                          </div>
                        )}

                        <div className="flex items-center text-sm text-gray-600">
                          {getResourceTypeIcon(event.resourceType)}
                          <span className="ml-2 capitalize">
                            {event.resourceType.replace('_', ' ')}
                          </span>
                        </div>
                      </div>

                      {hasConflicts && (
                        <div className="mt-3 pt-3 border-t border-red-200">
                          <div className="text-xs text-red-600 flex items-center">
                            <AlertTriangle className="mr-1 h-3 w-3" />
                            {conflicts.length} scheduling conflict{conflicts.length > 1 ? 's' : ''}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>

      {/* Event Details Modal */}
      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              Event Details
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => selectedEvent && handleEditEvent(selectedEvent)}
                  data-testid="button-edit-event"
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (selectedEvent) {
                      navigator.clipboard.writeText(`${selectedEvent.title} - ${format(parseISO(selectedEvent.startDateTime), 'PPP p')}`);
                      toast({ title: "Copied", description: "Event details copied to clipboard." });
                    }
                  }}
                  data-testid="button-copy-event"
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => selectedEvent && deleteEventMutation.mutate(selectedEvent.id)}
                  disabled={deleteEventMutation.isPending}
                  data-testid="button-delete-event"
                >
                  <Trash className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>
          
          {selectedEvent && (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-lg">{selectedEvent.title}</h3>
                <Badge className={`${getStatusColor(selectedEvent.status)} border mt-2`}>
                  {selectedEvent.status.replace('_', ' ').toUpperCase()}
                </Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">Resource</label>
                  <div className="flex items-center mt-1">
                    {getResourceTypeIcon(selectedEvent.resourceType)}
                    <span className="ml-2">
                      {getResourceName(selectedEvent.resourceType, selectedEvent.resourceId)}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700">Date & Time</label>
                  <div className="mt-1">
                    <div>{format(parseISO(selectedEvent.startDateTime), 'PPP')}</div>
                    <div className="text-sm text-gray-500">
                      {selectedEvent.isAllDay ? (
                        'All day'
                      ) : (
                        `${format(parseISO(selectedEvent.startDateTime), 'p')} - ${format(parseISO(selectedEvent.endDateTime), 'p')}`
                      )}
                    </div>
                  </div>
                </div>

                {selectedEvent.location && (
                  <div>
                    <label className="text-sm font-medium text-gray-700">Location</label>
                    <div className="mt-1">{selectedEvent.location}</div>
                  </div>
                )}

                <div>
                  <label className="text-sm font-medium text-gray-700">Resource Type</label>
                  <div className="mt-1 capitalize">{selectedEvent.resourceType.replace('_', ' ')}</div>
                </div>
              </div>

              {selectedEvent.notes && (
                <div>
                  <label className="text-sm font-medium text-gray-700">Notes</label>
                  <div className="mt-1 p-3 bg-gray-50 rounded-lg">
                    {selectedEvent.notes}
                  </div>
                </div>
              )}

              {/* Show conflicts if any */}
              {(() => {
                const conflicts = checkForConflicts(selectedEvent);
                return conflicts.length > 0 && (
                  <div>
                    <label className="text-sm font-medium text-red-700">Scheduling Conflicts</label>
                    <div className="mt-1 space-y-2">
                      {conflicts.map(conflict => (
                        <div key={conflict.id} className="p-2 bg-red-50 border border-red-200 rounded">
                          <div className="font-medium">{conflict.title}</div>
                          <div className="text-sm text-red-600">
                            {format(parseISO(conflict.startDateTime), 'p')} - {format(parseISO(conflict.endDateTime), 'p')}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Event Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Schedule Event</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleUpdateEvent)} className="space-y-4">
              {/* Same form fields as create modal - abbreviated for brevity */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Event Title</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-edit-event-title" />
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
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-edit-event-status">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="scheduled">Scheduled</SelectItem>
                          <SelectItem value="in_progress">In Progress</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                          <SelectItem value="rescheduled">Rescheduled</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsEditModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={updateEventMutation.isPending}
                  data-testid="button-update-event"
                >
                  {updateEventMutation.isPending ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Update Event
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}