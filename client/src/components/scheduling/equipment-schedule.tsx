import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Calendar } from "react-big-calendar";
import moment from "moment";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { 
  Wrench,
  Calendar as CalendarIcon,
  Clock,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Settings,
  Truck,
  MapPin,
  Plus,
  Edit,
  Eye,
  Trash,
  RefreshCw,
  Bell,
  BarChart3,
  TrendingUp,
  FileText,
  Filter
} from "lucide-react";
import { format, parseISO, addDays, differenceInDays, isAfter, isBefore, startOfDay, endOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { 
  ProjectEquipment,
  ProjectScheduleEvent,
  ProjectWithDetails
} from "@shared/schema";

interface EquipmentScheduleProps {
  projectId?: number;
  showAllProjects?: boolean;
  selectedEquipmentId?: number;
  dateRange?: {
    start: Date;
    end: Date;
  };
  onEquipmentScheduled?: (equipmentId: number, event: EquipmentScheduleEvent) => void;
  onMaintenanceScheduled?: (equipmentId: number, maintenance: MaintenanceEvent) => void;
}

interface EquipmentScheduleEvent {
  id?: number;
  equipmentId: number;
  projectId: number;
  title: string;
  startDate: Date;
  endDate: Date;
  location?: string;
  assignedTo?: string;
  status: 'scheduled' | 'in_use' | 'completed' | 'cancelled';
  costPerDay?: number;
  totalCost?: number;
  notes?: string;
  returnDate?: Date;
  condition?: 'good' | 'fair' | 'needs_repair' | 'broken';
}

interface MaintenanceEvent {
  id?: number;
  equipmentId: number;
  type: 'routine' | 'repair' | 'inspection' | 'calibration' | 'overhaul';
  scheduledDate: Date;
  estimatedDuration: number; // hours
  assignedTechnician?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'scheduled' | 'in_progress' | 'completed' | 'overdue';
  estimatedCost?: number;
  actualCost?: number;
  description: string;
  notes?: string;
  completedDate?: Date;
  nextMaintenanceDate?: Date;
}

interface EquipmentUtilization {
  equipmentId: number;
  equipmentName: string;
  totalScheduledDays: number;
  totalAvailableDays: number;
  utilizationRate: number;
  totalRevenue: number;
  maintenanceCost: number;
  profitability: number;
  upcomingMaintenance: MaintenanceEvent[];
  currentStatus: 'available' | 'in_use' | 'maintenance' | 'out_of_service';
  condition: 'good' | 'fair' | 'needs_repair' | 'broken';
}

const getEquipmentStatusColor = (status: string) => {
  switch (status) {
    case 'available': return 'bg-green-100 text-green-800 border-green-200';
    case 'in_use': return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'maintenance': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'out_of_service': return 'bg-red-100 text-red-800 border-red-200';
    default: return 'bg-gray-100 text-gray-600 border-gray-200';
  }
};

const getConditionColor = (condition: string) => {
  switch (condition) {
    case 'good': return 'bg-green-100 text-green-800';
    case 'fair': return 'bg-yellow-100 text-yellow-800';
    case 'needs_repair': return 'bg-orange-100 text-orange-800';
    case 'broken': return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-600';
  }
};

const getMaintenanceTypeIcon = (type: string) => {
  switch (type) {
    case 'routine': return <Settings className="h-4 w-4" />;
    case 'repair': return <Wrench className="h-4 w-4" />;
    case 'inspection': return <Eye className="h-4 w-4" />;
    case 'calibration': return <BarChart3 className="h-4 w-4" />;
    case 'overhaul': return <RefreshCw className="h-4 w-4" />;
    default: return <Settings className="h-4 w-4" />;
  }
};

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'low': return 'bg-gray-100 text-gray-600';
    case 'medium': return 'bg-blue-100 text-blue-600';
    case 'high': return 'bg-orange-100 text-orange-600';
    case 'urgent': return 'bg-red-100 text-red-600';
    default: return 'bg-gray-100 text-gray-600';
  }
};

export default function EquipmentSchedule({
  projectId,
  showAllProjects = false,
  selectedEquipmentId,
  dateRange = {
    start: new Date(),
    end: addDays(new Date(), 30)
  },
  onEquipmentScheduled,
  onMaintenanceScheduled
}: EquipmentScheduleProps) {
  const [activeTab, setActiveTab] = useState('calendar');
  const [selectedEquipment, setSelectedEquipment] = useState<number | null>(selectedEquipmentId || null);
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
  const [isMaintenanceDialogOpen, setIsMaintenanceDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [conditionFilter, setConditionFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'week' | 'month'>('month');
  
  // Mock data - in real implementation, these would come from API
  const [equipmentScheduleEvents, setEquipmentScheduleEvents] = useState<EquipmentScheduleEvent[]>([
    {
      id: 1,
      equipmentId: 1,
      projectId: projectId || 1,
      title: 'Excavator - Site Prep',
      startDate: new Date(),
      endDate: addDays(new Date(), 5),
      location: 'Main Construction Site',
      status: 'in_use',
      costPerDay: 350,
      totalCost: 1750,
      assignedTo: 'John Doe',
      condition: 'good'
    }
  ]);

  const [maintenanceEvents, setMaintenanceEvents] = useState<MaintenanceEvent[]>([
    {
      id: 1,
      equipmentId: 1,
      type: 'routine',
      scheduledDate: addDays(new Date(), 7),
      estimatedDuration: 4,
      priority: 'medium',
      status: 'scheduled',
      estimatedCost: 200,
      description: 'Routine maintenance and oil change',
      assignedTechnician: 'Mike Smith'
    }
  ]);
  
  const { toast } = useToast();

  // Fetch equipment
  const { data: equipment = [], isLoading: equipmentLoading } = useQuery<ProjectEquipment[]>({
    queryKey: ["/api/projects", projectId, "equipment"],
    enabled: !!projectId,
  });

  // Fetch schedule events
  const { data: scheduleEvents = [] } = useQuery<ProjectScheduleEvent[]>({
    queryKey: ["/api/schedule-events", { 
      projectId,
      resourceType: 'equipment',
      startDate: dateRange.start.toISOString(),
      endDate: dateRange.end.toISOString()
    }],
    enabled: !!projectId,
  });

  // Calculate equipment utilization
  const equipmentUtilization: EquipmentUtilization[] = useMemo(() => {
    return equipment.map(equip => {
      const equipmentEvents = equipmentScheduleEvents.filter(event => 
        event.equipmentId === equip.id &&
        event.status !== 'cancelled'
      );

      const totalScheduledDays = equipmentEvents.reduce((sum, event) => {
        return sum + differenceInDays(event.endDate, event.startDate) + 1;
      }, 0);

      const totalAvailableDays = differenceInDays(dateRange.end, dateRange.start) + 1;
      const utilizationRate = totalAvailableDays > 0 ? (totalScheduledDays / totalAvailableDays) * 100 : 0;

      const totalRevenue = equipmentEvents.reduce((sum, event) => 
        sum + (event.totalCost || 0), 0);

      const equipmentMaintenance = maintenanceEvents.filter(maintenance => 
        maintenance.equipmentId === equip.id);
      
      const maintenanceCost = equipmentMaintenance.reduce((sum, maintenance) => 
        sum + (maintenance.actualCost || maintenance.estimatedCost || 0), 0);

      const profitability = totalRevenue - maintenanceCost;

      const upcomingMaintenance = equipmentMaintenance.filter(maintenance => 
        maintenance.status === 'scheduled' || maintenance.status === 'overdue'
      );

      // Determine current status
      const currentEvent = equipmentEvents.find(event => 
        event.status === 'in_use' &&
        isAfter(new Date(), event.startDate) &&
        isBefore(new Date(), event.endDate)
      );

      const hasScheduledMaintenance = upcomingMaintenance.some(maintenance => 
        Math.abs(differenceInDays(maintenance.scheduledDate, new Date())) <= 1
      );

      let currentStatus: 'available' | 'in_use' | 'maintenance' | 'out_of_service';
      if (equip.condition === 'broken') currentStatus = 'out_of_service';
      else if (hasScheduledMaintenance) currentStatus = 'maintenance';
      else if (currentEvent) currentStatus = 'in_use';
      else currentStatus = 'available';

      return {
        equipmentId: equip.id,
        equipmentName: equip.name,
        totalScheduledDays,
        totalAvailableDays,
        utilizationRate,
        totalRevenue,
        maintenanceCost,
        profitability,
        upcomingMaintenance,
        currentStatus,
        condition: equip.condition as any
      };
    });
  }, [equipment, equipmentScheduleEvents, maintenanceEvents, dateRange]);

  // Helper function to get equipment name
  const getEquipmentName = (equipmentId: number): string => {
    const equip = equipment.find(e => e.id === equipmentId);
    return equip?.description || 'Unknown Equipment';
  };

  // Create calendar events
  const calendarEvents = useMemo(() => {
    const scheduleCalendarEvents = equipmentScheduleEvents
      .filter(event => {
        if (selectedEquipment && event.equipmentId !== selectedEquipment) return false;
        if (statusFilter !== 'all' && event.status !== statusFilter) return false;
        return true;
      })
      .map(event => ({
        id: `schedule-${event.id}`,
        title: `${event.title} - ${getEquipmentName(event.equipmentId)}`,
        start: event.startDate,
        end: event.endDate,
        resource: {
          id: event.equipmentId,
          type: 'equipment',
          name: getEquipmentName(event.equipmentId)
        },
        eventType: 'schedule',
        status: event.status,
        location: event.location,
        assignedTo: event.assignedTo,
        cost: event.totalCost
      }));

    const maintenanceCalendarEvents = maintenanceEvents
      .filter(maintenance => {
        if (selectedEquipment && maintenance.equipmentId !== selectedEquipment) return false;
        return true;
      })
      .map(maintenance => ({
        id: `maintenance-${maintenance.id}`,
        title: `Maintenance: ${maintenance.type} - ${getEquipmentName(maintenance.equipmentId)}`,
        start: maintenance.scheduledDate,
        end: addDays(maintenance.scheduledDate, Math.ceil(maintenance.estimatedDuration / 8)),
        resource: {
          id: maintenance.equipmentId,
          type: 'equipment',
          name: getEquipmentName(maintenance.equipmentId)
        },
        eventType: 'maintenance',
        maintenanceType: maintenance.type,
        priority: maintenance.priority,
        status: maintenance.status,
        technician: maintenance.assignedTechnician
      }));

    return [...scheduleCalendarEvents, ...maintenanceCalendarEvents];
  }, [equipmentScheduleEvents, maintenanceEvents, selectedEquipment, statusFilter, equipment]);

  // Handle equipment scheduling
  const handleEquipmentSchedule = (scheduleData: Partial<EquipmentScheduleEvent>) => {
    const newEvent: EquipmentScheduleEvent = {
      id: Math.max(...equipmentScheduleEvents.map(e => e.id || 0)) + 1,
      equipmentId: scheduleData.equipmentId!,
      projectId: scheduleData.projectId || projectId!,
      title: scheduleData.title!,
      startDate: scheduleData.startDate!,
      endDate: scheduleData.endDate!,
      status: 'scheduled',
      location: scheduleData.location,
      assignedTo: scheduleData.assignedTo,
      costPerDay: scheduleData.costPerDay,
      totalCost: scheduleData.totalCost,
      notes: scheduleData.notes,
      condition: 'good'
    };

    setEquipmentScheduleEvents(prev => [...prev, newEvent]);
    onEquipmentScheduled?.(newEvent.equipmentId, newEvent);
    
    toast({
      title: "Equipment Scheduled",
      description: `${getEquipmentName(newEvent.equipmentId)} has been scheduled successfully.`
    });
    
    setIsScheduleDialogOpen(false);
  };

  // Handle maintenance scheduling
  const handleMaintenanceSchedule = (maintenanceData: Partial<MaintenanceEvent>) => {
    const newMaintenance: MaintenanceEvent = {
      id: Math.max(...maintenanceEvents.map(m => m.id || 0)) + 1,
      equipmentId: maintenanceData.equipmentId!,
      type: maintenanceData.type!,
      scheduledDate: maintenanceData.scheduledDate!,
      estimatedDuration: maintenanceData.estimatedDuration!,
      priority: maintenanceData.priority!,
      status: 'scheduled',
      description: maintenanceData.description!,
      assignedTechnician: maintenanceData.assignedTechnician,
      estimatedCost: maintenanceData.estimatedCost,
      notes: maintenanceData.notes
    };

    setMaintenanceEvents(prev => [...prev, newMaintenance]);
    onMaintenanceScheduled?.(newMaintenance.equipmentId, newMaintenance);
    
    toast({
      title: "Maintenance Scheduled",
      description: `Maintenance for ${getEquipmentName(newMaintenance.equipmentId)} has been scheduled.`
    });
    
    setIsMaintenanceDialogOpen(false);
  };

  // Get overdue maintenance alerts
  const overdueMaintenanceAlerts = maintenanceEvents.filter(maintenance => 
    maintenance.status === 'scheduled' && isBefore(maintenance.scheduledDate, new Date())
  );

  if (equipmentLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Wrench className="mr-2 h-5 w-5" />
            Equipment Schedule
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-96 flex items-center justify-center">
            <div className="animate-pulse text-gray-500">Loading equipment schedule...</div>
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
            <Wrench className="mr-2 h-5 w-5" />
            Equipment Scheduling & Management
          </CardTitle>
          <div className="flex items-center space-x-2">
            {overdueMaintenanceAlerts.length > 0 && (
              <Badge variant="destructive" className="flex items-center">
                <Bell className="mr-1 h-3 w-3" />
                {overdueMaintenanceAlerts.length} Overdue
              </Badge>
            )}
            <Dialog open={isScheduleDialogOpen} onOpenChange={setIsScheduleDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" data-testid="button-schedule-equipment">
                  <Plus className="mr-1 h-4 w-4" />
                  Schedule Equipment
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Schedule Equipment</DialogTitle>
                </DialogHeader>
                <EquipmentScheduleForm onSubmit={handleEquipmentSchedule} />
              </DialogContent>
            </Dialog>
            <Dialog open={isMaintenanceDialogOpen} onOpenChange={setIsMaintenanceDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-schedule-maintenance">
                  <Settings className="mr-1 h-4 w-4" />
                  Schedule Maintenance
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Schedule Maintenance</DialogTitle>
                </DialogHeader>
                <MaintenanceScheduleForm onSubmit={handleMaintenanceSchedule} />
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-6">
        {/* Overdue maintenance alerts */}
        {overdueMaintenanceAlerts.length > 0 && (
          <Alert className="mb-4 border-red-200 bg-red-50">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <AlertDescription>
              <strong>{overdueMaintenanceAlerts.length} maintenance items are overdue:</strong>
              <ul className="mt-2 space-y-1">
                {overdueMaintenanceAlerts.slice(0, 3).map(maintenance => (
                  <li key={maintenance.id} className="text-sm">
                    • {getEquipmentName(maintenance.equipmentId)} - {maintenance.description}
                    ({format(maintenance.scheduledDate, 'MMM dd')})
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="calendar" data-testid="tab-calendar">Calendar</TabsTrigger>
            <TabsTrigger value="utilization" data-testid="tab-utilization">Utilization</TabsTrigger>
            <TabsTrigger value="maintenance" data-testid="tab-maintenance">Maintenance</TabsTrigger>
            <TabsTrigger value="costs" data-testid="tab-costs">Costs & Revenue</TabsTrigger>
            <TabsTrigger value="alerts" data-testid="tab-alerts">Alerts & Notifications</TabsTrigger>
          </TabsList>

          <TabsContent value="calendar" className="space-y-4">
            <div className="flex items-center space-x-4 mb-4">
              <Select value={selectedEquipment?.toString() || 'all'} onValueChange={(value) => 
                setSelectedEquipment(value === 'all' ? null : parseInt(value))
              }>
                <SelectTrigger className="w-64" data-testid="select-equipment-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Equipment</SelectItem>
                  {equipment.map(equip => (
                    <SelectItem key={equip.id} value={equip.id.toString()}>
                      <div className="flex items-center space-x-2">
                        <Wrench className="h-4 w-4" />
                        <span>{equip.name}</span>
                        <Badge className={`${getConditionColor(equip.condition)} text-xs ml-2`}>
                          {equip.condition}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-48" data-testid="select-status-filter">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="in_use">In Use</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
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
                events={calendarEvents}
                startAccessor="start"
                endAccessor="end"
                view={viewMode}
                onView={() => {}}
                selectable={false}
                components={{
                  event: ({ event }) => (
                    <div className={cn(
                      "p-1 rounded text-xs border-l-2 truncate",
                      event.eventType === 'maintenance' 
                        ? "bg-orange-100 text-orange-800 border-orange-300"
                        : event.status === 'in_use' 
                        ? "bg-blue-100 text-blue-800 border-blue-300"
                        : "bg-green-100 text-green-800 border-green-300"
                    )}>
                      <div className="flex items-center space-x-1">
                        {event.eventType === 'maintenance' ? (
                          getMaintenanceTypeIcon(event.maintenanceType)
                        ) : (
                          <Wrench className="h-3 w-3" />
                        )}
                        <span className="font-medium truncate">{event.title}</span>
                      </div>
                      {event.location && (
                        <div className="text-xs opacity-75 truncate">
                          <MapPin className="inline h-2 w-2 mr-1" />
                          {event.location}
                        </div>
                      )}
                      {event.cost && (
                        <div className="text-xs font-medium">
                          ${event.cost.toLocaleString()}
                        </div>
                      )}
                    </div>
                  )
                }}
                eventPropGetter={(event: any) => ({
                  style: {
                    backgroundColor: event.eventType === 'maintenance' ? '#f97316' : 
                                   event.status === 'in_use' ? '#3b82f6' : '#10b981',
                    borderColor: event.eventType === 'maintenance' ? '#ea580c' : 
                               event.status === 'in_use' ? '#2563eb' : '#059669',
                    color: 'white'
                  }
                })}
                className="bg-white rounded-lg border"
                data-testid="equipment-calendar"
              />
            </div>
          </TabsContent>

          <TabsContent value="utilization" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {equipmentUtilization.map(utilization => (
                <Card 
                  key={utilization.equipmentId}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setSelectedEquipment(utilization.equipmentId)}
                  data-testid={`utilization-card-${utilization.equipmentId}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h4 className="font-medium">{utilization.equipmentName}</h4>
                        <p className="text-sm text-gray-500">Equipment ID: {utilization.equipmentId}</p>
                      </div>
                      <div className="flex flex-col items-end space-y-1">
                        <Badge className={`${getEquipmentStatusColor(utilization.currentStatus)} border text-xs`}>
                          {utilization.currentStatus.replace('_', ' ')}
                        </Badge>
                        <Badge className={`${getConditionColor(utilization.condition)} text-xs`}>
                          {utilization.condition}
                        </Badge>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="flex items-center text-gray-600">
                            <BarChart3 className="mr-1 h-3 w-3" />
                            Utilization
                          </span>
                          <span className="font-medium">{utilization.utilizationRate.toFixed(0)}%</span>
                        </div>
                        <Progress 
                          value={Math.min(utilization.utilizationRate, 100)} 
                          className="h-2" 
                        />
                        <div className="flex justify-between text-xs text-gray-500 mt-1">
                          <span>{utilization.totalScheduledDays} scheduled days</span>
                          <span>{utilization.totalAvailableDays} total days</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <div className="flex items-center text-gray-600 mb-1">
                            <DollarSign className="mr-1 h-3 w-3" />
                            Revenue
                          </div>
                          <div className="font-medium">${utilization.totalRevenue.toLocaleString()}</div>
                        </div>
                        <div>
                          <div className="flex items-center text-gray-600 mb-1">
                            <Settings className="mr-1 h-3 w-3" />
                            Maintenance
                          </div>
                          <div className="font-medium">${utilization.maintenanceCost.toLocaleString()}</div>
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center text-gray-600">
                            <TrendingUp className="mr-1 h-3 w-3" />
                            Profitability
                          </span>
                          <span className={cn(
                            "font-medium",
                            utilization.profitability >= 0 ? "text-green-600" : "text-red-600"
                          )}>
                            ${utilization.profitability.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {utilization.upcomingMaintenance.length > 0 && (
                        <div className="pt-2 border-t">
                          <div className="text-xs text-gray-500 mb-1">
                            Upcoming Maintenance ({utilization.upcomingMaintenance.length})
                          </div>
                          {utilization.upcomingMaintenance.slice(0, 2).map(maintenance => (
                            <div key={maintenance.id} className="text-xs bg-gray-50 rounded p-1 mb-1">
                              <div className="flex items-center justify-between">
                                <span className="capitalize">{maintenance.type}</span>
                                <Badge className={`${getPriorityColor(maintenance.priority)} text-xs`}>
                                  {maintenance.priority}
                                </Badge>
                              </div>
                              <div className="text-gray-500">
                                {format(maintenance.scheduledDate, 'MMM dd, yyyy')}
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

          <TabsContent value="maintenance" className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Equipment</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Scheduled Date</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {maintenanceEvents.map(maintenance => (
                  <TableRow key={maintenance.id} data-testid={`maintenance-row-${maintenance.id}`}>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Wrench className="h-4 w-4 text-gray-500" />
                        <span>{getEquipmentName(maintenance.equipmentId)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        {getMaintenanceTypeIcon(maintenance.type)}
                        <span className="capitalize">{maintenance.type}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div>{format(maintenance.scheduledDate, 'MMM dd, yyyy')}</div>
                        {isBefore(maintenance.scheduledDate, new Date()) && maintenance.status === 'scheduled' && (
                          <Badge variant="destructive" className="text-xs mt-1">
                            Overdue
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{maintenance.estimatedDuration}h</TableCell>
                    <TableCell>
                      <Badge className={`${getPriorityColor(maintenance.priority)} border`}>
                        {maintenance.priority}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={cn(
                        "border",
                        maintenance.status === 'completed' ? 'bg-green-100 text-green-800 border-green-200' :
                        maintenance.status === 'in_progress' ? 'bg-blue-100 text-blue-800 border-blue-200' :
                        maintenance.status === 'overdue' ? 'bg-red-100 text-red-800 border-red-200' :
                        'bg-yellow-100 text-yellow-800 border-yellow-200'
                      )}>
                        {maintenance.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      ${(maintenance.actualCost || maintenance.estimatedCost || 0).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Button variant="ghost" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>

          <TabsContent value="costs" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Summary metrics */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <DollarSign className="h-4 w-4 text-green-500" />
                    <div>
                      <p className="text-sm text-gray-600">Total Revenue</p>
                      <p className="text-2xl font-bold">
                        ${equipmentUtilization.reduce((sum, util) => sum + util.totalRevenue, 0).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <Settings className="h-4 w-4 text-orange-500" />
                    <div>
                      <p className="text-sm text-gray-600">Maintenance Cost</p>
                      <p className="text-2xl font-bold">
                        ${equipmentUtilization.reduce((sum, util) => sum + util.maintenanceCost, 0).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <TrendingUp className="h-4 w-4 text-blue-500" />
                    <div>
                      <p className="text-sm text-gray-600">Net Profit</p>
                      <p className="text-2xl font-bold">
                        ${equipmentUtilization.reduce((sum, util) => sum + util.profitability, 0).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <BarChart3 className="h-4 w-4 text-purple-500" />
                    <div>
                      <p className="text-sm text-gray-600">Avg Utilization</p>
                      <p className="text-2xl font-bold">
                        {(equipmentUtilization.reduce((sum, util) => sum + util.utilizationRate, 0) / 
                          Math.max(equipmentUtilization.length, 1)).toFixed(0)}%
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Cost Breakdown by Equipment</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Equipment</TableHead>
                      <TableHead>Revenue</TableHead>
                      <TableHead>Maintenance Cost</TableHead>
                      <TableHead>Net Profit</TableHead>
                      <TableHead>ROI</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {equipmentUtilization.map(utilization => {
                      const roi = utilization.totalRevenue > 0 
                        ? ((utilization.profitability / utilization.totalRevenue) * 100) 
                        : 0;
                      
                      return (
                        <TableRow key={utilization.equipmentId}>
                          <TableCell>{utilization.equipmentName}</TableCell>
                          <TableCell className="text-green-600 font-medium">
                            ${utilization.totalRevenue.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-red-600 font-medium">
                            ${utilization.maintenanceCost.toLocaleString()}
                          </TableCell>
                          <TableCell className={cn(
                            "font-medium",
                            utilization.profitability >= 0 ? "text-green-600" : "text-red-600"
                          )}>
                            ${utilization.profitability.toLocaleString()}
                          </TableCell>
                          <TableCell className={cn(
                            "font-medium",
                            roi >= 0 ? "text-green-600" : "text-red-600"
                          )}>
                            {roi.toFixed(1)}%
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="alerts" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Overdue Maintenance */}
              {overdueMaintenanceAlerts.length > 0 && (
                <Card className="border-red-200">
                  <CardHeader>
                    <CardTitle className="text-red-700 flex items-center">
                      <AlertTriangle className="mr-2 h-5 w-5" />
                      Overdue Maintenance ({overdueMaintenanceAlerts.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {overdueMaintenanceAlerts.map(maintenance => (
                        <div key={maintenance.id} className="p-3 bg-red-50 border border-red-200 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-medium text-red-800">
                              {getEquipmentName(maintenance.equipmentId)}
                            </h4>
                            <Badge className={`${getPriorityColor(maintenance.priority)} border`}>
                              {maintenance.priority}
                            </Badge>
                          </div>
                          <p className="text-sm text-red-700">{maintenance.description}</p>
                          <p className="text-xs text-red-600 mt-1">
                            Due: {format(maintenance.scheduledDate, 'MMM dd, yyyy')} 
                            ({differenceInDays(new Date(), maintenance.scheduledDate)} days overdue)
                          </p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Equipment Status Alerts */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <CheckCircle2 className="mr-2 h-5 w-5" />
                    Equipment Status
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {equipment.filter(equip => equip.condition !== 'good').map(equip => (
                      <div key={equip.id} className="p-3 border rounded-lg">
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium">{equip.name}</h4>
                          <Badge className={`${getConditionColor(equip.condition)} border`}>
                            {equip.condition}
                          </Badge>
                        </div>
                        {equip.condition === 'broken' && (
                          <p className="text-sm text-red-600 mt-1">
                            Equipment is out of service - requires immediate attention
                          </p>
                        )}
                        {equip.condition === 'needs_repair' && (
                          <p className="text-sm text-orange-600 mt-1">
                            Equipment needs repair - schedule maintenance soon
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// Equipment Schedule Form Component
function EquipmentScheduleForm({ onSubmit }: { onSubmit: (data: Partial<EquipmentScheduleEvent>) => void }) {
  const [formData, setFormData] = useState<Partial<EquipmentScheduleEvent>>({
    startDate: new Date(),
    endDate: addDays(new Date(), 1),
    costPerDay: 0
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const totalDays = formData.startDate && formData.endDate 
      ? differenceInDays(formData.endDate, formData.startDate) + 1 
      : 1;
    const totalCost = (formData.costPerDay || 0) * totalDays;
    onSubmit({ ...formData, totalCost });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-sm font-medium">Equipment</label>
        <Select onValueChange={(value) => setFormData(prev => ({ ...prev, equipmentId: parseInt(value) }))}>
          <SelectTrigger data-testid="select-equipment">
            <SelectValue placeholder="Select equipment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Excavator CAT 320</SelectItem>
            <SelectItem value="2">Bulldozer D6T</SelectItem>
            <SelectItem value="3">Crane 50T</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="text-sm font-medium">Title</label>
        <Input
          value={formData.title || ''}
          onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
          placeholder="Equipment usage title"
          data-testid="input-title"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Start Date</label>
          <Input
            type="date"
            value={formData.startDate ? format(formData.startDate, 'yyyy-MM-dd') : ''}
            onChange={(e) => setFormData(prev => ({ ...prev, startDate: new Date(e.target.value) }))}
            data-testid="input-start-date"
          />
        </div>
        <div>
          <label className="text-sm font-medium">End Date</label>
          <Input
            type="date"
            value={formData.endDate ? format(formData.endDate, 'yyyy-MM-dd') : ''}
            onChange={(e) => setFormData(prev => ({ ...prev, endDate: new Date(e.target.value) }))}
            data-testid="input-end-date"
          />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Location</label>
        <Input
          value={formData.location || ''}
          onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
          placeholder="Usage location"
          data-testid="input-location"
        />
      </div>

      <div>
        <label className="text-sm font-medium">Cost per Day ($)</label>
        <Input
          type="number"
          value={formData.costPerDay || ''}
          onChange={(e) => setFormData(prev => ({ ...prev, costPerDay: parseFloat(e.target.value) }))}
          placeholder="0"
          data-testid="input-cost-per-day"
        />
      </div>

      <div>
        <label className="text-sm font-medium">Assigned To</label>
        <Input
          value={formData.assignedTo || ''}
          onChange={(e) => setFormData(prev => ({ ...prev, assignedTo: e.target.value }))}
          placeholder="Person responsible"
          data-testid="input-assigned-to"
        />
      </div>

      <div className="flex justify-end">
        <Button type="submit" data-testid="button-submit-schedule">
          Schedule Equipment
        </Button>
      </div>
    </form>
  );
}

// Maintenance Schedule Form Component  
function MaintenanceScheduleForm({ onSubmit }: { onSubmit: (data: Partial<MaintenanceEvent>) => void }) {
  const [formData, setFormData] = useState<Partial<MaintenanceEvent>>({
    scheduledDate: new Date(),
    estimatedDuration: 4,
    priority: 'medium',
    type: 'routine'
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-sm font-medium">Equipment</label>
        <Select onValueChange={(value) => setFormData(prev => ({ ...prev, equipmentId: parseInt(value) }))}>
          <SelectTrigger data-testid="select-maintenance-equipment">
            <SelectValue placeholder="Select equipment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Excavator CAT 320</SelectItem>
            <SelectItem value="2">Bulldozer D6T</SelectItem>
            <SelectItem value="3">Crane 50T</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Maintenance Type</label>
          <Select 
            value={formData.type} 
            onValueChange={(value: any) => setFormData(prev => ({ ...prev, type: value }))}
          >
            <SelectTrigger data-testid="select-maintenance-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="routine">Routine</SelectItem>
              <SelectItem value="repair">Repair</SelectItem>
              <SelectItem value="inspection">Inspection</SelectItem>
              <SelectItem value="calibration">Calibration</SelectItem>
              <SelectItem value="overhaul">Overhaul</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-sm font-medium">Priority</label>
          <Select 
            value={formData.priority} 
            onValueChange={(value: any) => setFormData(prev => ({ ...prev, priority: value }))}
          >
            <SelectTrigger data-testid="select-maintenance-priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Scheduled Date</label>
          <Input
            type="date"
            value={formData.scheduledDate ? format(formData.scheduledDate, 'yyyy-MM-dd') : ''}
            onChange={(e) => setFormData(prev => ({ ...prev, scheduledDate: new Date(e.target.value) }))}
            data-testid="input-scheduled-date"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Duration (hours)</label>
          <Input
            type="number"
            value={formData.estimatedDuration || ''}
            onChange={(e) => setFormData(prev => ({ ...prev, estimatedDuration: parseInt(e.target.value) }))}
            data-testid="input-duration"
          />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Description</label>
        <Textarea
          value={formData.description || ''}
          onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
          placeholder="Maintenance description"
          data-testid="textarea-description"
        />
      </div>

      <div>
        <label className="text-sm font-medium">Estimated Cost ($)</label>
        <Input
          type="number"
          value={formData.estimatedCost || ''}
          onChange={(e) => setFormData(prev => ({ ...prev, estimatedCost: parseFloat(e.target.value) }))}
          placeholder="0"
          data-testid="input-estimated-cost"
        />
      </div>

      <div className="flex justify-end">
        <Button type="submit" data-testid="button-submit-maintenance">
          Schedule Maintenance
        </Button>
      </div>
    </form>
  );
}