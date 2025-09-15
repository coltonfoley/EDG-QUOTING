import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { SortableLeadCard } from "./sortable-lead-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import type { Lead } from "@shared/schema";

interface KanbanColumnProps {
  id: string;
  title: string;
  color: string;
  leads: Lead[];
  onLeadClick?: (lead: Lead) => void;
  isAcceptingDrop?: boolean;
}

export function KanbanColumn({ 
  id, 
  title, 
  color, 
  leads, 
  onLeadClick,
  isAcceptingDrop = false 
}: KanbanColumnProps) {
  const { isOver, setNodeRef } = useDroppable({
    id,
  });

  // Calculate total value for this column
  const totalValue = leads.reduce((sum, lead) => {
    const value = lead.value ? parseFloat(lead.value.toString()) : 0;
    return sum + value;
  }, 0);

  const leadIds = leads.map(lead => lead.id.toString());

  return (
    <Card 
      className={`h-full min-h-[600px] transition-all duration-200 ${
        isOver && isAcceptingDrop ? 'ring-2 ring-edg-teal ring-opacity-50 bg-edg-teal bg-opacity-5' : ''
      }`}
      data-testid={`kanban-column-${id}`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-edg-black">
            {title}
          </CardTitle>
          <Badge 
            className={`${color} flex-shrink-0`}
            data-testid={`column-count-${id}`}
          >
            {leads.length}
          </Badge>
        </div>
        
        {/* Total value for column */}
        {totalValue > 0 && (
          <div className="text-xs text-edg-grey mt-1" data-testid={`column-value-${id}`}>
            Total: {formatCurrency(totalValue)}
          </div>
        )}
      </CardHeader>
      
      <CardContent className="pt-0 h-full">
        <div 
          ref={setNodeRef}
          className="space-y-3 min-h-[500px] pb-4"
          data-testid={`column-drop-zone-${id}`}
        >
          <SortableContext 
            items={leadIds}
            strategy={verticalListSortingStrategy}
          >
            {leads.map(lead => (
              <SortableLeadCard
                key={lead.id}
                lead={lead}
                onClick={() => onLeadClick?.(lead)}
                data-testid={`sortable-lead-${lead.id}`}
              />
            ))}
          </SortableContext>
          
          {/* Empty state */}
          {leads.length === 0 && (
            <div className="flex items-center justify-center h-32 text-edg-grey text-sm border-2 border-dashed border-gray-200 rounded-lg">
              <div className="text-center">
                <div className="text-2xl mb-2">📋</div>
                <div>No {title.toLowerCase()} leads</div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}