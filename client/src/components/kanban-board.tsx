import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LoadingSpinner } from "@/components/loading-spinner";
import { useToast } from "@/hooks/use-toast";
import { 
  Plus, 
  Users, 
  CheckCircle, 
  XCircle, 
  Phone,
  FileText,
  Handshake,
  TrendingUp,
  AlertCircle
} from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { LeadCard } from "./lead-card";
import type { Lead } from "@shared/schema";

// Lead stage configuration
const LEAD_STAGES = [
  {
    id: "new",
    label: "New",
    icon: Plus,
    color: "bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800",
    badgeColor: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    description: "Fresh leads that need initial review"
  },
  {
    id: "contacted",
    label: "Contacted", 
    icon: Phone,
    color: "bg-purple-50 border-purple-200 dark:bg-purple-950 dark:border-purple-800",
    badgeColor: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    description: "Leads that have been reached out to"
  },
  {
    id: "qualified",
    label: "Qualified",
    icon: Users,
    color: "bg-indigo-50 border-indigo-200 dark:bg-indigo-950 dark:border-indigo-800", 
    badgeColor: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
    description: "Qualified prospects with confirmed interest"
  },
  {
    id: "proposal",
    label: "Proposal",
    icon: FileText,
    color: "bg-orange-50 border-orange-200 dark:bg-orange-950 dark:border-orange-800",
    badgeColor: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200", 
    description: "Leads waiting for or reviewing proposals"
  },
  {
    id: "negotiation",
    label: "Negotiation",
    icon: Handshake,
    color: "bg-amber-50 border-amber-200 dark:bg-amber-950 dark:border-amber-800",
    badgeColor: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    description: "Active negotiations in progress"
  },
  {
    id: "closed_won", 
    label: "Closed Won",
    icon: CheckCircle,
    color: "bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800",
    badgeColor: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    description: "Successfully converted leads"
  },
  {
    id: "closed_lost",
    label: "Closed Lost", 
    icon: XCircle,
    color: "bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800",
    badgeColor: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    description: "Leads that didn't convert"
  }
] as const;

type LeadStage = typeof LEAD_STAGES[number]['id'];

// Sortable Lead Card Wrapper
interface SortableLeadCardProps {
  lead: Lead;
  onEdit?: (lead: Lead) => void;
  onConvert?: (lead: Lead) => void;
  onDelete?: (lead: Lead) => void;
}

function SortableLeadCard({ lead, onEdit, onConvert, onDelete }: SortableLeadCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lead.id.toString() });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      {...attributes} 
      {...listeners}
      data-testid={`sortable-lead-${lead.id}`}
    >
      <LeadCard
        lead={lead}
        isDragging={isDragging}
        onEdit={onEdit}
        onConvert={onConvert}
        onDelete={onDelete}
        className="mb-3"
      />
    </div>
  );
}

// Kanban Column Component
interface KanbanColumnProps {
  stage: typeof LEAD_STAGES[number];
  leads: Lead[];
  onEdit?: (lead: Lead) => void;
  onConvert?: (lead: Lead) => void;
  onDelete?: (lead: Lead) => void;
  onAddLead?: (stage: LeadStage) => void;
}

function KanbanColumn({ stage, leads, onEdit, onConvert, onDelete, onAddLead }: KanbanColumnProps) {
  const leadIds = leads.map(lead => lead.id.toString());
  const stageValue = leads.reduce((sum, lead) => sum + (Number(lead.value) || 0), 0);
  const Icon = stage.icon;

  return (
    <Card className={cn("flex flex-col h-full min-w-80", stage.color)} data-testid={`kanban-column-${stage.id}`}>
      <CardHeader className="pb-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4" />
            <CardTitle className="text-sm font-medium">
              {stage.label}
            </CardTitle>
            <Badge className={stage.badgeColor} data-testid={`column-count-${stage.id}`}>
              {leads.length}
            </Badge>
          </div>
          {onAddLead && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => onAddLead(stage.id)}
              data-testid={`button-add-lead-${stage.id}`}
            >
              <Plus className="h-3 w-3" />
            </Button>
          )}
        </div>
        
        {stageValue > 0 && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <TrendingUp className="h-3 w-3" />
            <span data-testid={`column-value-${stage.id}`}>
              Total: {formatCurrency(stageValue)}
            </span>
          </div>
        )}
        
        <p className="text-xs text-muted-foreground">{stage.description}</p>
      </CardHeader>

      <CardContent className="flex-1 pt-0 overflow-hidden">
        <SortableContext items={leadIds} strategy={verticalListSortingStrategy}>
          <ScrollArea className="h-full">
            <div className="space-y-0" data-testid={`column-leads-${stage.id}`}>
              {leads.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Icon className="h-8 w-8 text-muted-foreground/50 mb-2" />
                  <p className="text-sm text-muted-foreground" data-testid={`empty-state-${stage.id}`}>
                    No leads in {stage.label.toLowerCase()}
                  </p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    Drag leads here or click + to add
                  </p>
                </div>
              ) : (
                leads.map((lead) => (
                  <SortableLeadCard
                    key={lead.id}
                    lead={lead}
                    onEdit={onEdit}
                    onConvert={onConvert}
                    onDelete={onDelete}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </SortableContext>
      </CardContent>
    </Card>
  );
}

// Main Kanban Board Component
export interface KanbanBoardProps {
  onAddLead?: (stage?: LeadStage) => void;
  onEditLead?: (lead: Lead) => void;
  onConvertLead?: (lead: Lead) => void;
  onDeleteLead?: (lead: Lead) => void;
}

export function KanbanBoard({ 
  onAddLead, 
  onEditLead, 
  onConvertLead, 
  onDeleteLead 
}: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const { toast } = useToast();

  // React Query for leads data
  const { 
    data: leads = [], 
    isLoading, 
    error, 
    refetch 
  } = useQuery<Lead[]>({
    queryKey: ['/api/leads'],
    retry: 2,
    refetchOnWindowFocus: false,
  });

  // Stage update mutation
  const updateLeadStageMutation = useMutation({
    mutationFn: async ({ leadId, stage }: { leadId: number; stage: LeadStage }) => {
      const response = await apiRequest('PATCH', `/api/leads/${leadId}/stage`, { stage });
      return response.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/leads'] });
      const stageConfig = LEAD_STAGES.find(s => s.id === variables.stage);
      toast({
        title: "Lead updated",
        description: `Lead moved to ${stageConfig?.label || variables.stage}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error updating lead",
        description: error.message || "Failed to update lead stage. Please try again.",
        variant: "destructive",
      });
      // Refetch to restore original state
      refetch();
    },
  });

  // Group leads by stage
  const leadsByStage = useMemo(() => {
    const groups: Record<LeadStage, Lead[]> = {
      new: [],
      contacted: [],
      qualified: [],
      proposal: [],
      negotiation: [],
      closed_won: [],
      closed_lost: [],
    };

    leads.forEach(lead => {
      const stage = lead.stage as LeadStage;
      if (groups[stage]) {
        groups[stage].push(lead);
      }
    });

    return groups;
  }, [leads]);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Drag handlers
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id.toString());
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const leadId = parseInt(active.id.toString());
    const targetStage = over.id.toString() as LeadStage;
    
    // Find the lead being moved
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;

    // Check if stage actually changed
    if (lead.stage === targetStage) return;

    // Optimistically update the lead stage
    queryClient.setQueryData(['/api/leads'], (oldLeads: Lead[] = []) => {
      return oldLeads.map(l => 
        l.id === leadId ? { ...l, stage: targetStage } : l
      );
    });

    // Update on server
    updateLeadStageMutation.mutate({ leadId, stage: targetStage });
  };

  // Get dragged lead for overlay
  const draggedLead = activeId ? leads.find(l => l.id.toString() === activeId) : null;

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4" data-testid="kanban-error-state">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <div className="text-center">
          <h3 className="text-lg font-semibold">Failed to load leads</h3>
          <p className="text-muted-foreground">{(error as Error).message}</p>
          <Button 
            variant="outline" 
            className="mt-2"
            onClick={() => refetch()}
            data-testid="button-retry-leads"
          >
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full" data-testid="kanban-board">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {/* Loading overlay */}
        {isLoading && (
          <div className="flex items-center justify-center h-96" data-testid="kanban-loading-state">
            <LoadingSpinner size="lg" text="Loading leads..." />
          </div>
        )}

        {/* Kanban columns */}
        {!isLoading && (
          <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7 gap-4 h-full">
            {LEAD_STAGES.map((stage) => (
              <div key={stage.id} className="min-h-0">
                <KanbanColumn
                  stage={stage}
                  leads={leadsByStage[stage.id]}
                  onEdit={onEditLead}
                  onConvert={onConvertLead}
                  onDelete={onDeleteLead}
                  onAddLead={onAddLead}
                />
              </div>
            ))}
          </div>
        )}

        {/* Drag overlay */}
        <DragOverlay>
          {draggedLead && (
            <LeadCard
              lead={draggedLead}
              isDragging={true}
              className="rotate-3 shadow-2xl"
            />
          )}
        </DragOverlay>
      </DndContext>

      {/* Loading indicator for mutations */}
      {updateLeadStageMutation.isPending && (
        <div className="fixed bottom-4 right-4 z-50" data-testid="stage-update-loading">
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <LoadingSpinner size="sm" />
              <span className="text-sm">Updating lead...</span>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}