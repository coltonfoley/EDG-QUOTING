import { Link } from "wouter";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatCurrency } from "@/lib/utils";
import { CalendarDays, User, Building2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { QuoteWithDetails } from "@shared/schema";

interface PipelineCardProps {
  quote: QuoteWithDetails;
  isDragging?: boolean;
}

export function PipelineCard({ quote, isDragging }: PipelineCardProps) {
  // Calculate total value
  const totalValue = quote.lineItems.reduce((sum, item) => {
    const qty = parseFloat(item.quantity.toString());
    const price = parseFloat(item.unitPrice.toString());
    const markup = parseFloat(item.markupValue.toString());
    const baseTotal = qty * price;
    const total = item.markupType === 'percentage' 
      ? baseTotal + (baseTotal * (markup / 100))
      : baseTotal + markup;
    return sum + total;
  }, 0);

  // Get stage color
  const getStageColor = (stage: string) => {
    switch (stage) {
      case "new_lead":
        return "bg-blue-100 text-blue-800";
      case "qualifying":
        return "bg-purple-100 text-purple-800";
      case "consultation_scheduled":
        return "bg-indigo-100 text-indigo-800";
      case "building_estimate":
        return "bg-yellow-100 text-yellow-800";
      case "quote_sent":
        return "bg-orange-100 text-orange-800";
      case "closed_won":
        return "bg-green-100 text-green-800";
      case "closed_lost":
        return "bg-red-100 text-red-800";
      case "on_hold":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  // Get stage label
  const getStageLabel = (stage: string) => {
    switch (stage) {
      case "new_lead": return "New Lead";
      case "qualifying": return "Qualifying";
      case "consultation_scheduled": return "Consultation Scheduled";
      case "building_estimate": return "Building Estimate";
      case "quote_sent": return "Quote Sent";
      case "closed_won": return "Closed-Won";
      case "closed_lost": return "Closed-Lost";
      case "on_hold": return "On Hold";
      default: return stage;
    }
  };

  // Get initials for avatar
  const getInitials = (name: string) => {
    const parts = name.split(' ').filter(Boolean);
    if (parts.length === 0) return '??';
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  // Get assigned rep name (if available)
  const assignedRep = quote.assignedRep;
  const repName = assignedRep ? 
    `${assignedRep.firstName || ''} ${assignedRep.lastName || ''}`.trim() || assignedRep.username : 
    null;

  return (
    <Link href={`/quotes/${quote.id}`}>
      <Card 
        className={`cursor-pointer hover:shadow-md transition-all ${
          isDragging ? 'opacity-50 rotate-3 scale-105' : 'hover:scale-[1.02]'
        }`}
        data-testid={`card-pipeline-${quote.id}`}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-sm truncate" data-testid={`text-project-${quote.id}`}>
                {quote.projectName || quote.quoteNumber}
              </h4>
              <p className="text-xs text-muted-foreground mt-1 truncate" data-testid={`text-account-${quote.id}`}>
                {quote.customer?.company || quote.customer?.name}
              </p>
            </div>
            <Badge className={getStageColor(quote.dealStage || 'new_lead')} data-testid={`badge-stage-${quote.id}`}>
              {getStageLabel(quote.dealStage || 'new_lead')}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {/* Deal Value */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium" data-testid={`text-value-${quote.id}`}>
              {formatCurrency(totalValue)}
            </span>
            {quote.estimatedStartDate && (
              <div className="flex items-center text-xs text-muted-foreground">
                <CalendarDays className="h-3 w-3 mr-1" />
                {formatDistanceToNow(new Date(quote.estimatedStartDate), { addSuffix: true })}
              </div>
            )}
          </div>

          {/* Footer with account type and assigned rep */}
          <div className="flex items-center justify-between">
            <div className="flex items-center text-xs text-muted-foreground">
              <Building2 className="h-3 w-3 mr-1" />
              <span className="capitalize">
                {quote.customer?.accountType?.replace('_', ' ') || 'N/A'}
              </span>
            </div>

            {repName && (
              <div className="flex items-center gap-1">
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="text-xs">
                    {getInitials(repName)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs text-muted-foreground">
                  {repName.split(' ')[0]}
                </span>
              </div>
            )}
            {!repName && (
              <div className="flex items-center text-xs text-muted-foreground">
                <User className="h-3 w-3 mr-1" />
                <span>Unassigned</span>
              </div>
            )}
          </div>

          {/* Lost reason if closed-lost */}
          {quote.dealStage === 'closed_lost' && quote.lostReason && (
            <div className="mt-2 text-xs text-red-600 italic">
              Lost: {quote.lostReason}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}