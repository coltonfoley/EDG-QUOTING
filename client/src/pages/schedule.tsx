import { useState } from "react";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { 
  Calendar, 
  Users, 
  Target,
  Clock,
  CheckCircle2,
  Wrench,
  Plus,
  Settings,
  Filter,
  Download
} from "lucide-react";

// Import scheduling components
import ScheduleDashboard from "@/components/scheduling/schedule-dashboard";
import ResourceCalendar from "@/components/scheduling/resource-calendar";
import CrewAllocation from "@/components/scheduling/crew-allocation";
import ScheduleEventsManager from "@/components/scheduling/schedule-events";
import ResourceAvailabilityTracker from "@/components/scheduling/resource-availability";
import EquipmentSchedule from "@/components/scheduling/equipment-schedule";

export default function SchedulePage() {
  const [activeView, setActiveView] = useState("dashboard");
  const [selectedResourceId, setSelectedResourceId] = useState<number | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const { toast } = useToast();

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-edg-black">Resource Scheduling</h1>
            <p className="text-edg-grey mt-2">Manage crew, equipment, and project schedules across all projects</p>
          </div>
          
          <div className="flex items-center space-x-3">
            <Button variant="outline" size="sm" data-testid="button-filter-schedule">
              <Filter className="mr-2 h-4 w-4" />
              Filters
            </Button>
            <Button variant="outline" size="sm" data-testid="button-schedule-settings">
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </Button>
            <Button variant="outline" size="sm" data-testid="button-export-schedule">
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            <Button size="sm" data-testid="button-create-schedule-event">
              <Plus className="mr-2 h-4 w-4" />
              New Event
            </Button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <Tabs value={activeView} onValueChange={setActiveView} className="space-y-6">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="dashboard" data-testid="tab-dashboard" className="flex items-center gap-2">
              <Target className="h-4 w-4" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="calendar" data-testid="tab-calendar" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Calendar
            </TabsTrigger>
            <TabsTrigger value="crew" data-testid="tab-crew" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Crew
            </TabsTrigger>
            <TabsTrigger value="events" data-testid="tab-events" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Events
            </TabsTrigger>
            <TabsTrigger value="availability" data-testid="tab-availability" className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Availability
            </TabsTrigger>
            <TabsTrigger value="equipment" data-testid="tab-equipment" className="flex items-center gap-2">
              <Wrench className="h-4 w-4" />
              Equipment
            </TabsTrigger>
          </TabsList>

          {/* Dashboard Tab */}
          <TabsContent value="dashboard" className="space-y-6">
            <ScheduleDashboard
              showAllProjects={true}
              onNavigateToSchedule={(view, resourceId) => {
                setActiveView(view);
                if (resourceId) {
                  setSelectedResourceId(resourceId);
                }
              }}
              onCreateScheduleEvent={() => setActiveView("events")}
              onManageResource={(resourceType, resourceId) => {
                setSelectedResourceId(resourceId);
                setActiveView(resourceType === 'crew_member' ? 'crew' : 'equipment');
              }}
            />
          </TabsContent>

          {/* Calendar Tab */}
          <TabsContent value="calendar" className="space-y-6">
            <ResourceCalendar
              showAllProjects={true}
              selectedResourceTypes={['crew_member', 'equipment', 'vehicle', 'external_contractor']}
              onEventClick={(event) => {
                console.log('Event clicked:', event);
                // Handle event details view
              }}
              onEventCreate={() => setActiveView("events")}
              onEventUpdate={(event) => {
                console.log('Event updated:', event);
                toast({
                  title: "Event Updated",
                  description: "Schedule event has been updated successfully."
                });
              }}
            />
          </TabsContent>

          {/* Crew Tab */}
          <TabsContent value="crew" className="space-y-6">
            <CrewAllocation
              showAllProjects={true}
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
          </TabsContent>

          {/* Events Tab */}
          <TabsContent value="events" className="space-y-6">
            <ScheduleEventsManager
              showAllProjects={true}
              preSelectedResource={selectedResourceId ? {
                id: selectedResourceId,
                type: 'crew_member' // This would be determined dynamically in real implementation
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
          </TabsContent>

          {/* Availability Tab */}
          <TabsContent value="availability" className="space-y-6">
            <ResourceAvailabilityTracker
              selectedResourceId={selectedResourceId ?? undefined}
              showAllResources={!selectedResourceId}
              onAvailabilityUpdate={(resourceId, availability) => {
                console.log('Availability updated:', resourceId, availability);
                toast({
                  title: "Availability Updated",
                  description: "Resource availability has been updated successfully."
                });
              }}
            />
          </TabsContent>

          {/* Equipment Tab */}
          <TabsContent value="equipment" className="space-y-6">
            <EquipmentSchedule
              showAllProjects={true}
              selectedEquipmentId={selectedResourceId ?? undefined}
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
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}