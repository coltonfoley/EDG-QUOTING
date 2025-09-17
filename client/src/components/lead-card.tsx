import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  Building2, 
  Mail, 
  Phone, 
  DollarSign, 
  Calendar,
  User,
  MoreHorizontal,
  ExternalLink
} from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import type { Lead } from "@shared/schema";

interface LeadCardProps {
  lead: Lead;
  isDragging?: boolean;
  className?: string;
  onEdit?: (lead: Lead) => void;
  onConvert?: (lead: Lead) => void;
  onDelete?: (lead: Lead) => void;
}

export function LeadCard({ 
  lead, 
  isDragging = false,
  className,
  onEdit,
  onConvert,
  onDelete
}: LeadCardProps) {
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      case "medium":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      case "low":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    }
  };

  const getStageColor = (stage: string) => {
    switch (stage) {
      case "new":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "contacted":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
      case "qualified":
        return "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200";
      case "proposal":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
      case "negotiation":
        return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
      case "closed_won":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "closed_lost":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    }
  };

  const formatDate = (dateString: string | Date) => {
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) return "Today";
    if (diffDays === 2) return "Yesterday";
    if (diffDays <= 7) return `${diffDays - 1} days ago`;
    return date.toLocaleDateString();
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Card 
      className={cn(
        "transition-all duration-200 hover:shadow-md cursor-grab active:cursor-grabbing",
        isDragging && "opacity-50 rotate-1 shadow-lg scale-105",
        className
      )}
      data-testid={`lead-card-${lead.id}`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm truncate" data-testid={`lead-title-${lead.id}`}>
              {lead.title}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <User className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground truncate" data-testid={`lead-contact-${lead.id}`}>
                {lead.contactName}
              </span>
            </div>
            {lead.company && (
              <div className="flex items-center gap-2 mt-1">
                <Building2 className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground truncate" data-testid={`lead-company-${lead.id}`}>
                  {lead.company}
                </span>
              </div>
            )}
          </div>
          
          <div className="flex flex-col gap-1 items-end">
            <Badge 
              className={getPriorityColor(lead.priority)}
              data-testid={`lead-priority-${lead.id}`}
            >
              {lead.priority}
            </Badge>
            {lead.assignedTo && (
              <Tooltip>
                <TooltipTrigger>
                  <Avatar className="h-6 w-6" data-testid={`lead-assigned-${lead.id}`}>
                    <AvatarFallback className="text-xs">
                      {getInitials(`User ${lead.assignedTo}`)}
                    </AvatarFallback>
                  </Avatar>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Assigned to User {lead.assignedTo}</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-3">
        {/* Contact Information */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Mail className="h-3 w-3" />
            <span className="truncate" data-testid={`lead-email-${lead.id}`}>{lead.email}</span>
          </div>
          {lead.phone && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Phone className="h-3 w-3" />
              <span data-testid={`lead-phone-${lead.id}`}>{lead.phone}</span>
            </div>
          )}
        </div>

        {/* Value and Source */}
        <div className="flex items-center justify-between">
          {lead.value && (
            <div className="flex items-center gap-1">
              <DollarSign className="h-3 w-3 text-green-600" />
              <span className="text-sm font-medium text-green-600" data-testid={`lead-value-${lead.id}`}>
                {formatCurrency(Number(lead.value))}
              </span>
            </div>
          )}
          {lead.source && (
            <Badge variant="outline" className="text-xs" data-testid={`lead-source-${lead.id}`}>
              {lead.source}
            </Badge>
          )}
        </div>

        {/* Description */}
        {lead.description && (
          <p className="text-xs text-muted-foreground line-clamp-2" data-testid={`lead-description-${lead.id}`}>
            {lead.description}
          </p>
        )}

        {/* Footer with date and actions */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span data-testid={`lead-created-${lead.id}`}>
              {formatDate(lead.createdAt || '')}
            </span>
          </div>
          
          <div className="flex items-center gap-1">
            {lead.stage !== 'closed_won' && lead.stage !== 'closed_lost' && onConvert && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      onConvert(lead);
                    }}
                    data-testid={`button-convert-lead-${lead.id}`}
                  >
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Convert to Customer</p>
                </TooltipContent>
              </Tooltip>
            )}
            
            {onEdit && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(lead);
                    }}
                    data-testid={`button-edit-lead-${lead.id}`}
                  >
                    <MoreHorizontal className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>More Actions</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}