import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { LeadCard } from "./lead-card";
import type { Lead } from "@shared/schema";

interface SortableLeadCardProps {
  lead: Lead;
  onClick?: () => void;
}

export function SortableLeadCard({ lead, onClick }: SortableLeadCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: lead.id.toString(),
  });

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
      className="touch-none"
      data-testid={`sortable-lead-card-${lead.id}`}
    >
      <LeadCard
        lead={lead}
        isDragging={isDragging}
        onClick={onClick}
      />
    </div>
  );
}