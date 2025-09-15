import { formatDistanceToNow } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Building, DollarSign, Calendar, CheckSquare, User } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { Lead } from "@shared/schema";

interface LeadCardProps {
  lead: Lead;
  taskCount?: number;
  isDragging?: boolean;
  onClick?: () => void;
}

export function LeadCard({ lead, taskCount = 0, isDragging = false, onClick }: LeadCardProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "new":
        return "bg-gray-100 text-gray-800";
      case "contacted":
        return "bg-blue-100 text-blue-800";
      case "qualified":
        return "bg-yellow-100 text-yellow-800";
      case "quoted":
        return "bg-orange-100 text-orange-800";
      case "won":
        return "bg-green-100 text-green-800";
      case "lost":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word.charAt(0).toUpperCase())
      .slice(0, 2)
      .join('');
  };

  return (
    <Card 
      className={`cursor-pointer transition-all duration-200 hover:shadow-md ${
        isDragging ? 'opacity-50 rotate-3 shadow-lg' : ''
      }`}
      onClick={onClick}
      data-testid={`lead-card-${lead.id}`}
    >
      <CardContent className="p-4">
        {/* Header with name and status */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-edg-black truncate" data-testid={`lead-name-${lead.id}`}>
              {lead.name}
            </h3>
            {lead.company && (
              <div className="flex items-center text-sm text-edg-grey mt-1">
                <Building className="h-3 w-3 mr-1 flex-shrink-0" />
                <span className="truncate" data-testid={`lead-company-${lead.id}`}>{lead.company}</span>
              </div>
            )}
          </div>
          <Badge 
            className={`${getStatusColor(lead.status)} ml-2 flex-shrink-0`}
            data-testid={`lead-status-${lead.id}`}
          >
            {lead.status.charAt(0).toUpperCase() + lead.status.slice(1)}
          </Badge>
        </div>

        {/* Contact info */}
        {lead.email && (
          <div className="text-sm text-edg-grey mb-2 truncate" data-testid={`lead-email-${lead.id}`}>
            {lead.email}
          </div>
        )}

        {/* Value */}
        {lead.value && (
          <div className="flex items-center text-sm mb-3">
            <DollarSign className="h-4 w-4 text-edg-teal mr-1" />
            <span className="font-medium text-edg-black" data-testid={`lead-value-${lead.id}`}>
              {formatCurrency(parseFloat(lead.value.toString()))}
            </span>
          </div>
        )}

        {/* Footer with metadata */}
        <div className="flex items-center justify-between text-xs text-edg-grey">
          {/* Created date */}
          <div className="flex items-center">
            <Calendar className="h-3 w-3 mr-1" />
            <span data-testid={`lead-created-${lead.id}`}>
              {lead.createdAt ? formatDistanceToNow(new Date(lead.createdAt), { addSuffix: true }) : 'Unknown'}
            </span>
          </div>

          {/* Task count and assigned user */}
          <div className="flex items-center space-x-2">
            {taskCount > 0 && (
              <div className="flex items-center">
                <CheckSquare className="h-3 w-3 mr-1" />
                <span data-testid={`lead-task-count-${lead.id}`}>{taskCount}</span>
              </div>
            )}
            
            {lead.assignedTo && (
              <Avatar className="h-5 w-5">
                <AvatarFallback className="text-xs bg-edg-teal text-white" data-testid={`lead-assigned-${lead.id}`}>
                  {lead.assignedTo.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            )}
          </div>
        </div>

        {/* Source indicator */}
        {lead.source && (
          <div className="mt-2 pt-2 border-t border-gray-100">
            <div className="flex items-center text-xs text-edg-grey">
              <User className="h-3 w-3 mr-1" />
              <span className="capitalize" data-testid={`lead-source-${lead.id}`}>
                {lead.source.replace('_', ' ')}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}