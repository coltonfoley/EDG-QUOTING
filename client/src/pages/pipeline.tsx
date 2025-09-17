import { useState, useMemo, useEffect, useCallback, memo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AppHeader } from "@/components/app-header";
import { PipelineCard } from "@/components/pipeline-card";
import { LeadCreationModal } from "@/components/lead-creation-modal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatCurrency, cn } from "@/lib/utils";
import { 
  DndContext, 
  DragOverlay,
  closestCenter,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { 
  TrendingUp, 
  DollarSign, 
  Target, 
  Clock,
  Filter,
  ChevronRight,
  AlertCircle,
  Plus
} from "lucide-react";
import { format, subDays, startOfDay, endOfDay, isWithinInterval } from "date-fns";
import type { QuoteWithDetails } from "@shared/schema";

// Deal stages configuration - 8 required stages per CRM requirements
const DEAL_STAGES = [
  { id: 'new_lead', label: 'New Lead', color: 'bg-blue-100 border-blue-300 text-blue-800' },
  { id: 'qualifying', label: 'Qualifying', color: 'bg-purple-100 border-purple-300 text-purple-800' },
  { id: 'consultation_scheduled', label: 'Consultation Scheduled', color: 'bg-indigo-100 border-indigo-300 text-indigo-800' },
  { id: 'building_estimate', label: 'Building Estimate', color: 'bg-cyan-100 border-cyan-300 text-cyan-800' },
  { id: 'quote_sent', label: 'Quote Sent', color: 'bg-yellow-100 border-yellow-300 text-yellow-800' },
  { id: 'closed_won', label: 'Closed-Won', color: 'bg-green-100 border-green-300 text-green-800' },
  { id: 'closed_lost', label: 'Closed-Lost', color: 'bg-red-100 border-red-300 text-red-800' },
  { id: 'on_hold', label: 'On Hold', color: 'bg-gray-100 border-gray-300 text-gray-800' }
];

// Sortable Column Component - Memoized for performance
const SortableColumn = memo(function SortableColumn({ 
  stage, 
  quotes, 
  activeId 
}: { 
  stage: typeof DEAL_STAGES[0]; 
  quotes: QuoteWithDetails[];
  activeId: string | null;
}) {
  const {
    setNodeRef,
    isOver,
  } = useSortable({
    id: stage.id,
    data: {
      type: 'column',
      stage: stage.id
    }
  });

  // Calculate column total
  const columnTotal = quotes.reduce((sum, quote) => {
    const quoteTotal = quote.lineItems.reduce((itemSum, item) => {
      const qty = parseFloat(item.quantity.toString());
      const price = parseFloat(item.unitPrice.toString());
      const markup = parseFloat(item.markupValue.toString());
      const baseTotal = qty * price;
      const total = item.markupType === 'percentage' 
        ? baseTotal + (baseTotal * (markup / 100))
        : baseTotal + markup;
      return itemSum + total;
    }, 0);
    return sum + quoteTotal;
  }, 0);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex-shrink-0 w-80 flex flex-col h-full",
        isOver && "opacity-80"
      )}
    >
      <div className={cn(
        "rounded-t-lg border-2 px-4 py-3 flex items-center justify-between",
        stage.color
      )}>
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">{stage.label}</h3>
          <Badge variant="secondary" className="text-xs">
            {quotes.length}
          </Badge>
        </div>
        {columnTotal > 0 && (
          <span className="text-xs font-medium">
            {formatCurrency(columnTotal)}
          </span>
        )}
      </div>
      
      <ScrollArea className="flex-1 bg-gray-50 border-2 border-t-0 rounded-b-lg p-2">
        <div className="space-y-2 min-h-[200px]">
          <SortableContext
            items={quotes.map(q => q.id)}
            strategy={verticalListSortingStrategy}
          >
            {quotes.map((quote) => (
              <SortableQuote key={quote.id} quote={quote} />
            ))}
          </SortableContext>
          {quotes.length === 0 && !activeId && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No deals in this stage
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
});

// Sortable Quote Card Component - Memoized for performance
const SortableQuote = memo(function SortableQuote({ quote }: { quote: QuoteWithDetails }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: quote.id,
    data: {
      type: 'quote',
      quote
    }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
    >
      <PipelineCard quote={quote} isDragging={isDragging} />
    </div>
  );
});

export default function Pipeline() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRep, setFilterRep] = useState("all");
  const [filterDateRange, setFilterDateRange] = useState("all");
  const [filterAccountType, setFilterAccountType] = useState("all");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [leadModalOpen, setLeadModalOpen] = useState(false);
  const [lostReasonDialog, setLostReasonDialog] = useState<{
    open: boolean;
    quoteId: number | null;
    quoteName: string;
  }>({ open: false, quoteId: null, quoteName: '' });
  const [lostReason, setLostReason] = useState("");
  const { toast } = useToast();

  // Sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor)
  );

  // Fetch quotes
  const { data: quotes, isLoading, error } = useQuery<QuoteWithDetails[]>({
    queryKey: ["/api/quotes"],
  });

  // Fetch users for rep filter
  const { data: users } = useQuery<any[]>({
    queryKey: ["/api/users"],
  });

  // Update stage mutation
  const updateStageMutation = useMutation({
    mutationFn: async ({ 
      quoteId, 
      dealStage, 
      lostReason 
    }: { 
      quoteId: number; 
      dealStage: string; 
      lostReason?: string;
    }) => {
      const payload: any = { deal_stage: dealStage };
      if (lostReason) {
        payload.lost_reason = lostReason;
      }
      return await apiRequest("PATCH", `/api/quotes/${quoteId}/stage`, payload);
    },
    onMutate: async ({ quoteId, dealStage }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["/api/quotes"] });

      // Snapshot the previous value
      const previousQuotes = queryClient.getQueryData<QuoteWithDetails[]>(["/api/quotes"]);

      // Optimistically update
      queryClient.setQueryData<QuoteWithDetails[]>(["/api/quotes"], (old) => {
        if (!old) return old;
        return old.map(quote => 
          quote.id === quoteId 
            ? { ...quote, dealStage } 
            : quote
        );
      });

      return { previousQuotes };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousQuotes) {
        queryClient.setQueryData(["/api/quotes"], context.previousQuotes);
      }
      toast({
        title: "Error",
        description: "Failed to update deal stage. Please try again.",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      toast({
        title: "Success",
        description: "Deal stage updated successfully.",
      });
    },
  });

  // Filter quotes
  const filteredQuotes = useMemo(() => {
    if (!quotes) return [];

    let filtered = [...quotes];

    // Search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(quote => 
        quote.quoteNumber.toLowerCase().includes(term) ||
        quote.customer.name.toLowerCase().includes(term) ||
        quote.projectName?.toLowerCase().includes(term) ||
        quote.customer.company?.toLowerCase().includes(term)
      );
    }

    // Rep filter - convert assignedRepId to string for comparison
    if (filterRep !== "all") {
      filtered = filtered.filter(quote => {
        const repId = quote.assignedRepId ? String(quote.assignedRepId) : null;
        return repId === filterRep;
      });
    }

    // Date range filter
    if (filterDateRange !== "all") {
      const now = new Date();
      let startDate: Date;
      
      switch (filterDateRange) {
        case "today":
          startDate = startOfDay(now);
          break;
        case "week":
          startDate = subDays(now, 7);
          break;
        case "month":
          startDate = subDays(now, 30);
          break;
        case "quarter":
          startDate = subDays(now, 90);
          break;
        default:
          startDate = new Date(0);
      }

      const endDate = endOfDay(now);
      
      filtered = filtered.filter(quote => {
        const createdAt = new Date(quote.createdAt || '');
        return isWithinInterval(createdAt, { start: startDate, end: endDate });
      });
    }

    // Account type filter
    if (filterAccountType !== "all") {
      filtered = filtered.filter(quote => quote.customer.accountType === filterAccountType);
    }

    return filtered;
  }, [quotes, searchTerm, filterRep, filterDateRange, filterAccountType]);

  // Group quotes by stage
  const quotesByStage = useMemo(() => {
    const grouped: Record<string, QuoteWithDetails[]> = {};
    
    DEAL_STAGES.forEach(stage => {
      grouped[stage.id] = [];
    });

    filteredQuotes.forEach(quote => {
      const stage = quote.dealStage || 'lead';
      if (grouped[stage]) {
        grouped[stage].push(quote);
      }
    });

    return grouped;
  }, [filteredQuotes]);

  // Calculate stats
  const stats = useMemo(() => {
    const totalDeals = filteredQuotes.length;
    const totalValue = filteredQuotes.reduce((sum, quote) => {
      const quoteTotal = quote.lineItems.reduce((itemSum, item) => {
        const qty = parseFloat(item.quantity.toString());
        const price = parseFloat(item.unitPrice.toString());
        const markup = parseFloat(item.markupValue.toString());
        const baseTotal = qty * price;
        const total = item.markupType === 'percentage' 
          ? baseTotal + (baseTotal * (markup / 100))
          : baseTotal + markup;
        return itemSum + total;
      }, 0);
      return sum + quoteTotal;
    }, 0);

    const wonDeals = filteredQuotes.filter(q => q.dealStage === 'won').length;
    const conversionRate = totalDeals > 0 ? (wonDeals / totalDeals) * 100 : 0;

    const avgDealSize = totalDeals > 0 ? totalValue / totalDeals : 0;

    return {
      totalDeals,
      totalValue,
      conversionRate,
      avgDealSize
    };
  }, [filteredQuotes]);

  // Drag handlers - Memoized with useCallback
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    // Handle column hover effect
  }, []);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeData = active.data.current as { type: string; quote?: QuoteWithDetails };
    const overData = over.data.current as { type: string; stage?: string; quote?: QuoteWithDetails };

    // Handle drops on both columns and cards
    let targetStage: string | undefined;
    
    if (overData.type === 'column') {
      // Dropped directly on a column
      targetStage = overData.stage;
    } else if (overData.type === 'quote') {
      // Dropped on another quote card - find which column it's in
      const targetQuote = overData.quote;
      if (targetQuote) {
        targetStage = targetQuote.dealStage || 'lead';
      }
    }

    if (activeData.type === 'quote' && targetStage) {
      const quote = activeData.quote;

      if (quote && targetStage && quote.dealStage !== targetStage) {
        // If moving to closed_lost, show dialog for lost reason
        if (targetStage === 'closed_lost') {
          setLostReasonDialog({
            open: true,
            quoteId: quote.id,
            quoteName: quote.projectName || quote.quoteNumber
          });
          setLostReason("");
        } else {
          // Update stage directly
          updateStageMutation.mutate({
            quoteId: quote.id,
            dealStage: targetStage
          });
        }
      }
    }
  };

  // Handle lost reason submission - Memoized
  const handleLostReasonSubmit = useCallback(() => {
    if (lostReasonDialog.quoteId && lostReason.trim()) {
      updateStageMutation.mutate({
        quoteId: lostReasonDialog.quoteId,
        dealStage: 'closed_lost',
        lostReason: lostReason.trim()
      });
      setLostReasonDialog({ open: false, quoteId: null, quoteName: '' });
      setLostReason("");
    }
  }, [lostReasonDialog.quoteId, lostReason, updateStageMutation]);

  // Find active quote for drag overlay
  const activeQuote = activeId 
    ? filteredQuotes.find(q => q.id === parseInt(activeId))
    : null;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Skeleton className="h-12 w-48 mb-8" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      
      <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold text-edg-black">Sales Pipeline</h2>
            <p className="text-edg-grey mt-2">Track and manage your sales opportunities</p>
          </div>
          <Button 
            onClick={() => setLeadModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-700"
            data-testid="button-new-lead"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Lead
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Target className="h-8 w-8 text-edg-teal" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-edg-grey">Total Deals</p>
                  <p className="text-2xl font-bold text-edg-black">{stats.totalDeals}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <DollarSign className="h-8 w-8 text-edg-teal" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-edg-grey">Pipeline Value</p>
                  <p className="text-2xl font-bold text-edg-black">
                    {formatCurrency(stats.totalValue)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <TrendingUp className="h-8 w-8 text-edg-teal" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-edg-grey">Conversion Rate</p>
                  <p className="text-2xl font-bold text-edg-black">
                    {stats.conversionRate.toFixed(1)}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Clock className="h-8 w-8 text-edg-teal" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-edg-grey">Avg Deal Size</p>
                  <p className="text-2xl font-bold text-edg-black">
                    {formatCurrency(stats.avgDealSize)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-4 items-center">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-edg-grey" />
                <span className="text-sm font-medium text-edg-grey">Filters:</span>
              </div>
              
              <Input
                placeholder="Search deals..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-64"
                data-testid="input-search"
              />

              <Select value={filterRep} onValueChange={setFilterRep}>
                <SelectTrigger className="w-48" data-testid="select-filter-rep">
                  <SelectValue placeholder="All Reps" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Reps</SelectItem>
                  {users?.map((user) => (
                    <SelectItem key={user.id} value={String(user.id)} data-testid={`option-rep-${user.id}`}>
                      {user.firstName || user.username} {user.lastName || ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterDateRange} onValueChange={setFilterDateRange}>
                <SelectTrigger className="w-40" data-testid="select-filter-date">
                  <SelectValue placeholder="All Time" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" data-testid="option-date-all">All Time</SelectItem>
                  <SelectItem value="today" data-testid="option-date-today">Today</SelectItem>
                  <SelectItem value="week" data-testid="option-date-week">Past Week</SelectItem>
                  <SelectItem value="month" data-testid="option-date-month">Past Month</SelectItem>
                  <SelectItem value="quarter" data-testid="option-date-quarter">Past Quarter</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filterAccountType} onValueChange={setFilterAccountType}>
                <SelectTrigger className="w-48" data-testid="select-filter-type">
                  <SelectValue placeholder="All Account Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" data-testid="option-account-all">All Account Types</SelectItem>
                  <SelectItem value="homeowner" data-testid="option-account-homeowner">Homeowner</SelectItem>
                  <SelectItem value="general_contractor" data-testid="option-account-gc">General Contractor</SelectItem>
                  <SelectItem value="commercial" data-testid="option-account-commercial">Commercial</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Pipeline Board */}
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <ScrollArea className="w-full">
              <div className="p-4">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCorners}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDragEnd={handleDragEnd}
                >
                  <div className="flex gap-4 h-[600px]">
                    {DEAL_STAGES.map((stage) => (
                      <SortableColumn
                        key={stage.id}
                        stage={stage}
                        quotes={quotesByStage[stage.id] || []}
                        activeId={activeId}
                      />
                    ))}
                  </div>
                  
                  <DragOverlay>
                    {activeQuote ? (
                      <PipelineCard quote={activeQuote} isDragging />
                    ) : null}
                  </DragOverlay>
                </DndContext>
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Lead Creation Modal */}
      <LeadCreationModal 
        open={leadModalOpen} 
        onClose={() => setLeadModalOpen(false)} 
      />

      {/* Lost Reason Dialog */}
      <Dialog open={lostReasonDialog.open} onOpenChange={(open) => {
        if (!open) {
          setLostReasonDialog({ open: false, quoteId: null, quoteName: '' });
          setLostReason("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Deal as Lost</DialogTitle>
            <DialogDescription>
              Please provide a reason for losing this deal: <strong>{lostReasonDialog.quoteName}</strong>
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-yellow-500 mt-0.5" />
              <p className="text-sm text-muted-foreground">
                This information helps us understand why deals are lost and improve our sales process.
              </p>
            </div>
            
            <Textarea
              placeholder="Enter the reason for losing this deal (e.g., Budget constraints, Went with competitor, Project cancelled)..."
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              rows={4}
              data-testid="textarea-lost-reason"
            />
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setLostReasonDialog({ open: false, quoteId: null, quoteName: '' });
                setLostReason("");
              }}
              data-testid="button-cancel-lost"
            >
              Cancel
            </Button>
            <Button
              onClick={handleLostReasonSubmit}
              disabled={!lostReason.trim() || updateStageMutation.isPending}
              data-testid="button-confirm-lost"
            >
              {updateStageMutation.isPending ? "Updating..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}