import { useState, useMemo } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { LeadCard } from "./lead-card";
import { KanbanColumn } from "./kanban-column";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Lead } from "@shared/schema";

interface KanbanBoardProps {
  leads: Lead[];
  isLoading?: boolean;
  onLeadClick?: (lead: Lead) => void;
}

const COLUMNS = [
  { id: "new", title: "New", color: "bg-gray-100 text-gray-800" },
  { id: "contacted", title: "Contacted", color: "bg-blue-100 text-blue-800" },
  { id: "quoted", title: "Quoted", color: "bg-orange-100 text-orange-800" },
  { id: "won", title: "Won", color: "bg-green-100 text-green-800" },
  { id: "lost", title: "Lost", color: "bg-red-100 text-red-800" },
] as const;

export function KanbanBoard({ leads, isLoading = false, onLeadClick }: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const { toast } = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor)
  );

  // Group leads by status
  const leadsByStatus = useMemo(() => {
    const groups: Record<string, Lead[]> = {};
    COLUMNS.forEach(column => {
      groups[column.id] = leads.filter(lead => lead.status === column.id);
    });
    return groups;
  }, [leads]);

  // Find the active lead being dragged
  const activeLead = useMemo(() => {
    if (!activeId) return null;
    return leads.find(lead => lead.id.toString() === activeId) || null;
  }, [activeId, leads]);

  // Update lead status mutation with proper optimistic updates and rollback
  const updateLeadMutation = useMutation({
    mutationFn: async ({ leadId, status }: { leadId: number; status: string }) => {
      return await apiRequest("PUT", `/api/leads/${leadId}`, { status });
    },
    onMutate: async ({ leadId, status }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["/api/leads"] });
      
      // Snapshot the previous value
      const previousLeads = queryClient.getQueryData<Lead[]>(["/api/leads"]);
      
      // Optimistically update the lead status in the cache
      queryClient.setQueryData<Lead[]>(["/api/leads"], (oldLeads) => {
        if (!oldLeads) return oldLeads;
        return oldLeads.map(l => 
          l.id === leadId ? { ...l, status: status as any } : l
        );
      });
      
      // Return context with snapshot for rollback
      return { previousLeads };
    },
    onSuccess: (_, { leadId, status }) => {
      const lead = leads.find(l => l.id === leadId);
      const columnTitle = COLUMNS.find(c => c.id === status)?.title || status;
      toast({
        title: "Lead updated",
        description: `${lead?.name || 'Lead'} moved to ${columnTitle}`,
      });
    },
    onError: (error: any, variables, context) => {
      // Rollback to previous state on error
      if (context?.previousLeads) {
        queryClient.setQueryData(["/api/leads"], context.previousLeads);
      }
      
      toast({
        title: "Error",
        description: error.message || "Failed to update lead status",
        variant: "destructive",
      });
    },
    onSettled: () => {
      // Always refetch after mutation settles
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
    },
  });

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id.toString());
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const leadId = parseInt(active.id.toString());
    
    // Find the current lead
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;

    // Determine destination status - over.id can be either a column ID or a lead ID
    const validColumnIds = COLUMNS.map(col => col.id) as string[];
    let destinationStatus: string;
    
    if (validColumnIds.includes(over.id.toString())) {
      // Dropped directly on a column
      destinationStatus = over.id.toString();
    } else {
      // Dropped on another lead - find that lead's status
      const targetLead = leads.find(l => l.id.toString() === over.id.toString());
      if (!targetLead) return; // Invalid drop target
      destinationStatus = targetLead.status;
    }
    
    // Don't update if status hasn't changed
    if (lead.status === destinationStatus) return;

    // Validate the destination status
    if (!validColumnIds.includes(destinationStatus)) return;

    // Update the lead status on the server (optimistic updates handled by mutation)
    updateLeadMutation.mutate({ leadId, status: destinationStatus });
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {COLUMNS.map(column => (
          <Card key={column.id} className="h-96">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">{column.title}</CardTitle>
                <Badge variant="secondary" className="animate-pulse">•</Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-3">
                {[1, 2].map(i => (
                  <div key={i} className="h-24 bg-gray-100 rounded-md animate-pulse" />
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4" data-testid="kanban-board">
        {COLUMNS.map(column => (
          <KanbanColumn
            key={column.id}
            id={column.id}
            title={column.title}
            color={column.color}
            leads={leadsByStatus[column.id] || []}
            onLeadClick={onLeadClick}
            isAcceptingDrop={activeId !== null}
            data-testid={`kanban-column-${column.id}`}
          />
        ))}
      </div>

      <DragOverlay>
        {activeLead && (
          <LeadCard
            lead={activeLead}
            isDragging
            data-testid="drag-overlay-lead"
          />
        )}
      </DragOverlay>
    </DndContext>
  );
}