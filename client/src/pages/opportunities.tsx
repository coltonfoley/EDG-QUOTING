import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { AppHeader } from "@/components/app-header";
import { OpportunityForm } from "@/components/forms/opportunity-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Plus, 
  Search, 
  DollarSign, 
  TrendingUp, 
  Calendar,
  Building2,
  User,
  Target,
  FileText,
  Eye,
  Edit,
  MoreHorizontal,
  ExternalLink
} from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useAuth } from "@/hooks/useAuth";
import { RoleManager } from "@/components/forms/role-manager";
import { ActivityFeed } from "@/components/forms/activity-feed";
import type { Opportunity, Account, Contact, User as UserType, InsertOpportunity } from "@shared/schema";

interface OpportunityWithDetails extends Opportunity {
  account?: Account;
  primaryContact?: Contact;
}

const OPPORTUNITY_STAGES = [
  { 
    id: "inquiry", 
    label: "Inquiry", 
    color: "bg-gray-100 border-gray-300",
    textColor: "text-gray-700",
    badgeColor: "bg-gray-500"
  },
  { 
    id: "estimating", 
    label: "Estimating", 
    color: "bg-blue-100 border-blue-300",
    textColor: "text-blue-700",
    badgeColor: "bg-blue-500"
  },
  { 
    id: "proposal_sent", 
    label: "Proposal Sent", 
    color: "bg-yellow-100 border-yellow-300",
    textColor: "text-yellow-700",
    badgeColor: "bg-yellow-500"
  },
  { 
    id: "contract_signed", 
    label: "Contract Signed", 
    color: "bg-green-100 border-green-300",
    textColor: "text-green-700",
    badgeColor: "bg-green-500"
  },
  { 
    id: "project_complete", 
    label: "Project Complete", 
    color: "bg-emerald-100 border-emerald-300",
    textColor: "text-emerald-700",
    badgeColor: "bg-emerald-500"
  },
  { 
    id: "closed_lost", 
    label: "Closed Lost", 
    color: "bg-red-100 border-red-300",
    textColor: "text-red-700",
    badgeColor: "bg-red-500"
  }
];

interface OpportunityCardProps {
  opportunity: OpportunityWithDetails;
  onView: () => void;
  onEdit: () => void;
  isDragging?: boolean;
}

function OpportunityCard({ opportunity, onView, onEdit, isDragging }: OpportunityCardProps) {
  const canCreateQuote = opportunity.stage === "estimating";
  
  return (
    <Card className={`cursor-grab ${isDragging ? 'opacity-50' : 'hover:shadow-md'} transition-shadow`}>
      <CardContent className="p-4">
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between">
            <h4 className="font-semibold text-sm line-clamp-2">{opportunity.name}</h4>
            <div className="flex items-center space-x-1 ml-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onView();
                }}
                className="p-1 h-6 w-6"
                data-testid={`button-view-opportunity-${opportunity.id}`}
              >
                <Eye className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                className="p-1 h-6 w-6"
                data-testid={`button-edit-opportunity-${opportunity.id}`}
              >
                <Edit className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Account & Contact */}
          <div className="space-y-2 text-xs text-gray-600">
            {opportunity.account && (
              <div className="flex items-center space-x-2">
                <Building2 className="h-3 w-3" />
                <span className="truncate">{opportunity.account.name}</span>
              </div>
            )}
            {opportunity.primaryContact && (
              <div className="flex items-center space-x-2">
                <User className="h-3 w-3" />
                <span className="truncate">
                  {opportunity.primaryContact.firstName} {opportunity.primaryContact.lastName}
                </span>
              </div>
            )}
          </div>

          {/* Amount */}
          {opportunity.amount && (
            <div className="flex items-center space-x-2">
              <DollarSign className="h-4 w-4 text-green-600" />
              <span className="font-semibold text-green-600">
                {formatCurrency(parseFloat(opportunity.amount.toString()))}
              </span>
            </div>
          )}

          {/* Expected Close Date */}
          {opportunity.expectedCloseDate && (
            <div className="flex items-center space-x-2 text-xs text-gray-500">
              <Calendar className="h-3 w-3" />
              <span>{format(new Date(opportunity.expectedCloseDate), "MMM d, yyyy")}</span>
            </div>
          )}

          {/* Assigned User */}
          {opportunity.assignedTo && (
            <div className="flex items-center space-x-2">
              <Avatar className="h-5 w-5">
                <AvatarFallback className="bg-edg-teal text-edg-black text-xs">
                  {opportunity.assignedTo.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs text-gray-500 truncate">{opportunity.assignedTo}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t">
            <div className="flex items-center space-x-2">
              {opportunity.source && (
                <Badge variant="secondary" className="text-xs">
                  {opportunity.source}
                </Badge>
              )}
            </div>
            {canCreateQuote && (
              <Link href={`/quotes/new?opportunityId=${opportunity.id}`}>
                <Button size="sm" className="bg-edg-black hover:bg-edg-grey text-xs px-2 py-1 h-6">
                  <FileText className="mr-1 h-3 w-3" />
                  Quote
                </Button>
              </Link>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function OpportunitiesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterByAccount, setFilterByAccount] = useState<string>("all");
  const [filterByAssigned, setFilterByAssigned] = useState<string>("all");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Fetch opportunities
  const { data: opportunities = [], isLoading: opportunitiesLoading, error: opportunitiesError } = useQuery<Opportunity[]>({
    queryKey: ["/api/opportunities"],
    enabled: isAuthenticated,
  });

  // Fetch accounts for relationship data and filtering
  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ["/api/accounts"],
    enabled: isAuthenticated,
  });

  // Fetch contacts for relationship data
  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
    enabled: isAuthenticated,
  });

  // Fetch users for filtering
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
    enabled: isAuthenticated,
  });

  // Enrich opportunities with account and contact data
  const enrichedOpportunities: OpportunityWithDetails[] = useMemo(() => {
    return opportunities.map(opportunity => ({
      ...opportunity,
      account: accounts.find(a => a.id === opportunity.accountId),
      primaryContact: opportunity.primaryContactId 
        ? contacts.find(c => c.id === opportunity.primaryContactId)
        : undefined,
    }));
  }, [opportunities, accounts, contacts]);

  // Create opportunity mutation
  const createOpportunityMutation = useMutation({
    mutationFn: async (opportunityData: InsertOpportunity) => {
      return await apiRequest("POST", "/api/opportunities", opportunityData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
      toast({
        title: "Opportunity created",
        description: "New opportunity has been successfully created.",
      });
      setCreateDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create opportunity. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Update opportunity mutation
  const updateOpportunityMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<InsertOpportunity> }) => {
      return await apiRequest("PUT", `/api/opportunities/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
      toast({
        title: "Opportunity updated",
        description: "Opportunity has been successfully updated.",
      });
      setEditDialogOpen(false);
      setSelectedOpportunity(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update opportunity. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Filter opportunities
  const filteredOpportunities = useMemo(() => {
    let filtered = enrichedOpportunities;

    // Search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(opp =>
        opp.name.toLowerCase().includes(term) ||
        (opp.account && opp.account.name.toLowerCase().includes(term)) ||
        (opp.primaryContact && 
          `${opp.primaryContact.firstName} ${opp.primaryContact.lastName}`.toLowerCase().includes(term))
      );
    }

    // Account filter
    if (filterByAccount !== "all") {
      filtered = filtered.filter(opp => opp.accountId.toString() === filterByAccount);
    }

    // Assigned user filter
    if (filterByAssigned !== "all") {
      if (filterByAssigned === "unassigned") {
        filtered = filtered.filter(opp => !opp.assignedTo);
      } else {
        filtered = filtered.filter(opp => opp.assignedTo === filterByAssigned);
      }
    }

    return filtered;
  }, [enrichedOpportunities, searchTerm, filterByAccount, filterByAssigned]);

  // Group opportunities by stage
  const opportunitiesByStage = useMemo(() => {
    const grouped: Record<string, OpportunityWithDetails[]> = {};
    OPPORTUNITY_STAGES.forEach(stage => {
      grouped[stage.id] = filteredOpportunities.filter(opp => opp.stage === stage.id);
    });
    return grouped;
  }, [filteredOpportunities]);

  // Calculate stats
  const stats = useMemo(() => {
    const totalOpportunities = filteredOpportunities.length;
    const totalValue = filteredOpportunities.reduce((sum, opp) => {
      return sum + (opp.amount ? parseFloat(opp.amount.toString()) : 0);
    }, 0);
    const wonOpportunities = filteredOpportunities.filter(opp => opp.stage === 'project_complete').length;
    const conversionRate = totalOpportunities > 0 ? (wonOpportunities / totalOpportunities) * 100 : 0;
    const activeOpportunities = filteredOpportunities.filter(opp => 
      !['project_complete', 'closed_lost'].includes(opp.stage)
    ).length;

    return {
      totalOpportunities,
      totalValue,
      conversionRate,
      activeOpportunities,
    };
  }, [filteredOpportunities]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over) return;

    const opportunityId = parseInt(active.id as string);
    const newStage = over.id as string;
    
    const opportunity = opportunities.find(o => o.id === opportunityId);
    if (!opportunity || opportunity.stage === newStage) return;

    updateOpportunityMutation.mutate({
      id: opportunityId,
      data: { stage: newStage }
    });

    setActiveId(null);
  };

  const handleCreateOpportunity = (data: InsertOpportunity) => {
    createOpportunityMutation.mutate(data);
  };

  const handleUpdateOpportunity = (data: Partial<InsertOpportunity>) => {
    if (selectedOpportunity) {
      updateOpportunityMutation.mutate({ id: selectedOpportunity.id, data });
    }
  };

  const handleViewOpportunity = (opportunity: Opportunity) => {
    setSelectedOpportunity(opportunity);
    setDetailSheetOpen(true);
  };

  const handleEditOpportunity = (opportunity: Opportunity) => {
    setSelectedOpportunity(opportunity);
    setEditDialogOpen(true);
  };

  // Handle authentication errors
  if (opportunitiesError && isUnauthorizedError(opportunitiesError as Error)) {
    toast({
      title: "Unauthorized",
      description: "You are logged out. Redirecting to login...",
      variant: "destructive",
    });
    setTimeout(() => {
      window.location.href = "/api/login";
    }, 1500);
    return null;
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-edg-teal"></div>
      </div>
    );
  }

  const draggingOpportunity = activeId ? opportunities.find(o => o.id === parseInt(activeId)) : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      
      <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start mb-8 space-y-4 lg:space-y-0">
          <div>
            <h2 className="text-3xl font-bold text-edg-black">Sales Pipeline</h2>
            <p className="text-edg-grey mt-2">Manage opportunities through your sales stages</p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-edg-black hover:bg-edg-grey text-edg-white" data-testid="button-create-opportunity">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Opportunity
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Create New Opportunity</DialogTitle>
                </DialogHeader>
                <OpportunityForm
                  onSubmit={handleCreateOpportunity}
                  onCancel={() => setCreateDialogOpen(false)}
                  isLoading={createOpportunityMutation.isPending}
                  submitLabel="Create Opportunity"
                />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Opportunities</CardTitle>
              <Target className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="metric-total-opportunities">
                {stats.totalOpportunities}
              </div>
              <p className="text-xs text-muted-foreground">
                {stats.activeOpportunities} active
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pipeline Value</CardTitle>
              <DollarSign className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="metric-pipeline-value">
                {formatCurrency(stats.totalValue)}
              </div>
              <p className="text-xs text-muted-foreground">
                Total estimated value
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="metric-conversion-rate">
                {stats.conversionRate.toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground">
                Opportunities won
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Deal Size</CardTitle>
              <DollarSign className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="metric-avg-deal-size">
                {stats.totalOpportunities > 0 
                  ? formatCurrency(stats.totalValue / stats.totalOpportunities)
                  : formatCurrency(0)
                }
              </div>
              <p className="text-xs text-muted-foreground">
                Average opportunity value
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-edg-grey h-4 w-4" />
                <Input
                  placeholder="Search opportunities..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-opportunities"
                />
              </div>

              {/* Account Filter */}
              <Select value={filterByAccount} onValueChange={setFilterByAccount}>
                <SelectTrigger className="w-full md:w-64" data-testid="select-filter-account">
                  <SelectValue placeholder="Filter by account" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Accounts</SelectItem>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id.toString()}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Assigned User Filter */}
              <Select value={filterByAssigned} onValueChange={setFilterByAssigned}>
                <SelectTrigger className="w-full md:w-48" data-testid="select-filter-assigned">
                  <SelectValue placeholder="Filter by assignee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Kanban Board */}
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="grid grid-cols-1 lg:grid-cols-6 gap-6">
            {OPPORTUNITY_STAGES.map((stage) => (
              <div
                key={stage.id}
                id={stage.id}
                className={`min-h-[600px] rounded-lg border-2 border-dashed p-4 ${stage.color}`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-2">
                    <h3 className={`font-semibold ${stage.textColor}`}>{stage.label}</h3>
                    <Badge className={`${stage.badgeColor} text-white`}>
                      {opportunitiesByStage[stage.id]?.length || 0}
                    </Badge>
                  </div>
                  {opportunitiesByStage[stage.id] && opportunitiesByStage[stage.id].length > 0 && (
                    <div className="text-xs text-gray-500">
                      {formatCurrency(
                        opportunitiesByStage[stage.id].reduce((sum, opp) => 
                          sum + (opp.amount ? parseFloat(opp.amount.toString()) : 0), 0
                        )
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  {opportunitiesLoading ? (
                    [...Array(3)].map((_, i) => (
                      <Card key={i}>
                        <CardContent className="p-4">
                          <div className="space-y-2">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-24" />
                            <Skeleton className="h-3 w-20" />
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    opportunitiesByStage[stage.id]?.map((opportunity) => (
                      <div key={opportunity.id} id={opportunity.id.toString()}>
                        <OpportunityCard
                          opportunity={opportunity}
                          onView={() => handleViewOpportunity(opportunity)}
                          onEdit={() => handleEditOpportunity(opportunity)}
                        />
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>

          <DragOverlay>
            {activeId && draggingOpportunity ? (
              <OpportunityCard
                opportunity={enrichedOpportunities.find(o => o.id === parseInt(activeId))!}
                onView={() => {}}
                onEdit={() => {}}
                isDragging
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Edit Opportunity Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Opportunity</DialogTitle>
          </DialogHeader>
          {selectedOpportunity && (
            <OpportunityForm
              initialData={selectedOpportunity}
              onSubmit={handleUpdateOpportunity}
              onCancel={() => {
                setEditDialogOpen(false);
                setSelectedOpportunity(null);
              }}
              isLoading={updateOpportunityMutation.isPending}
              submitLabel="Update Opportunity"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Opportunity Detail Sheet */}
      <Sheet open={detailSheetOpen} onOpenChange={setDetailSheetOpen}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center space-x-3">
              {selectedOpportunity && (
                <>
                  <div className={`p-2 rounded-full ${OPPORTUNITY_STAGES.find(s => s.id === selectedOpportunity.stage)?.badgeColor || 'bg-gray-500'}`}>
                    <Target className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <div className="font-semibold">{selectedOpportunity.name}</div>
                    <Badge variant="secondary" className="text-xs mt-1">
                      {OPPORTUNITY_STAGES.find(s => s.id === selectedOpportunity.stage)?.label}
                    </Badge>
                  </div>
                </>
              )}
            </SheetTitle>
          </SheetHeader>

          {selectedOpportunity && (
            <div className="mt-6 space-y-6">
              {/* Opportunity Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Opportunity Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedOpportunity.amount && (
                    <div className="flex items-center space-x-3">
                      <DollarSign className="h-5 w-5 text-green-500" />
                      <span className="font-semibold text-green-600">
                        {formatCurrency(parseFloat(selectedOpportunity.amount.toString()))}
                      </span>
                    </div>
                  )}
                  {selectedOpportunity.expectedCloseDate && (
                    <div className="flex items-center space-x-3">
                      <Calendar className="h-5 w-5 text-gray-400" />
                      <div>
                        <p className="font-medium">Expected Close Date</p>
                        <p className="text-gray-600">
                          {format(new Date(selectedOpportunity.expectedCloseDate), "PPP")}
                        </p>
                      </div>
                    </div>
                  )}
                  {selectedOpportunity.source && (
                    <div className="flex items-center space-x-3">
                      <ExternalLink className="h-5 w-5 text-gray-400" />
                      <div>
                        <p className="font-medium">Source</p>
                        <p className="text-gray-600">{selectedOpportunity.source}</p>
                      </div>
                    </div>
                  )}
                  {selectedOpportunity.notes && (
                    <div className="space-y-2">
                      <p className="font-medium">Notes</p>
                      <p className="text-gray-600 text-sm">{selectedOpportunity.notes}</p>
                    </div>
                  )}
                  {/* Account and Contact Links */}
                  {enrichedOpportunities.find(o => o.id === selectedOpportunity.id)?.account && (
                    <div className="flex items-center space-x-3">
                      <Building2 className="h-5 w-5 text-gray-400" />
                      <div>
                        <p className="font-medium">Account</p>
                        <Link 
                          href="/accounts" 
                          className="text-edg-teal hover:underline"
                        >
                          {enrichedOpportunities.find(o => o.id === selectedOpportunity.id)?.account?.name}
                        </Link>
                      </div>
                    </div>
                  )}
                  {enrichedOpportunities.find(o => o.id === selectedOpportunity.id)?.primaryContact && (
                    <div className="flex items-center space-x-3">
                      <User className="h-5 w-5 text-gray-400" />
                      <div>
                        <p className="font-medium">Primary Contact</p>
                        <Link 
                          href="/contacts" 
                          className="text-edg-teal hover:underline"
                        >
                          {(() => {
                            const contact = enrichedOpportunities.find(o => o.id === selectedOpportunity.id)?.primaryContact;
                            return contact ? `${contact.firstName} ${contact.lastName}` : '';
                          })()}
                        </Link>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Tabs defaultValue="activities" className="space-y-4">
                <TabsList className="grid w-full grid-cols-1">
                  <TabsTrigger value="activities">Activities</TabsTrigger>
                </TabsList>

                <TabsContent value="activities">
                  <ActivityFeed
                    entityType="opportunity"
                    entityId={selectedOpportunity.id}
                    entityName={selectedOpportunity.name}
                  />
                </TabsContent>
              </Tabs>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}