import { Link } from "wouter";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { calculateLineItemsValue } from "@/lib/quote-value";
import { CalendarDays, User, Building2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { QuoteWithDetails } from "@shared/schema";
import { getDealStageById, getDealStageLabel, getDealStageColor, isLostStage } from "@shared/dealStageConstants";

interface PipelineCardProps {
  quote: QuoteWithDetails;
  isDragging?: boolean;
}

export function PipelineCard({ quote, isDragging }: PipelineCardProps) {
  const totalValue = calculateLineItemsValue(quote.lineItems);


  // Assignment feature disabled until new system is implemented
  // const isAssigned = !!quote.assignedRepId;

  return (
    <Link href={`/quotes/${quote.id}/edit`}>
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
                {quote.account?.company || quote.account?.name}
              </p>
            </div>
            <Badge className={getDealStageColor(quote.dealStage || 'new_lead')} data-testid={`badge-stage-${quote.id}`}>
              {getDealStageLabel(quote.dealStage || 'new_lead')}
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
                {quote.account?.accountType?.replace('_', ' ') || 'N/A'}
              </span>
            </div>

            <div className="flex items-center text-xs text-muted-foreground">
              <User className="h-3 w-3 mr-1" />
              <span>Rep feature disabled</span>
            </div>
          </div>

          {/* Lost reason if closed-lost */}
          {isLostStage(quote.dealStage || '') && quote.lostReason && (
            <div className="mt-2 text-xs text-red-600 italic">
              Lost: {quote.lostReason}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
