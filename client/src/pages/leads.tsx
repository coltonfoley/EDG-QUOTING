import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppHeader } from "@/components/app-header";
import { KanbanBoard } from "@/components/kanban-board";
import { LeadModal } from "@/components/lead-modal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, Users, DollarSign, TrendingUp, UserCheck } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Lead } from "@shared/schema";

export default function LeadsPage() {
  // Modal and editing state
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [leadModalStage, setLeadModalStage] = useState<string | undefined>(undefined);
  
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();

  // Fetch leads data for stats
  const { data: leads, isLoading, error } = useQuery<Lead[]>({
    queryKey: ["/api/leads"],
    enabled: isAuthenticated,
  });

  // Delete mutation
  const deleteLeadMutation = useMutation({
    mutationFn: async (leadId: number) => {
      return await apiRequest("DELETE", `/api/leads/${leadId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      toast({
        title: "Lead deleted",
        description: "The lead has been successfully deleted.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete lead. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Convert to customer/quote mutation (placeholder for future implementation)
  const convertLeadMutation = useMutation({
    mutationFn: async (lead: Lead) => {
      // This would create a customer and potentially a quote
      // For now, just show a success message
      return Promise.resolve();
    },
    onSuccess: (_, lead) => {
      toast({
        title: "Lead converted",
        description: `Lead "${lead.title}" has been converted to a customer.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to convert lead. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        navigate("/auth");
      }, 500);
      return;
    }
  }, [isAuthenticated, authLoading, toast, navigate]);

  // Handle unauthorized errors
  useEffect(() => {
    if (error && isUnauthorizedError(error as Error)) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        navigate("/auth");
      }, 500);
      return;
    }
  }, [error, toast, navigate]);

  // Calculate stats
  const totalLeads = leads?.length || 0;
  const totalValue = leads?.reduce((sum, lead) => {
    const value = parseFloat(lead.value?.toString() || '0');
    return sum + (isNaN(value) ? 0 : value);
  }, 0) || 0;

  const activeLeads = leads?.filter(lead => 
    lead.stage !== 'closed_won' && lead.stage !== 'closed_lost'
  ).length || 0;

  const conversionRate = totalLeads > 0 
    ? ((leads?.filter(lead => lead.stage === 'closed_won').length || 0) / totalLeads * 100)
    : 0;

  // Modal handlers
  const handleAddLead = (stage?: string) => {
    setEditingLead(null);
    setLeadModalStage(stage);
    setIsLeadModalOpen(true);
  };

  const handleEditLead = (lead: Lead) => {
    setEditingLead(lead);
    setLeadModalStage(undefined);
    setIsLeadModalOpen(true);
  };

  const handleConvertLead = (lead: Lead) => {
    convertLeadMutation.mutate(lead);
  };

  const handleDeleteLead = (lead: Lead) => {
    if (window.confirm(`Are you sure you want to delete the lead "${lead.title}"?`)) {
      deleteLeadMutation.mutate(lead.id);
    }
  };

  const handleLeadModalClose = () => {
    setIsLeadModalOpen(false);
    setEditingLead(null);
    setLeadModalStage(undefined);
  };

  const handleLeadSaved = (lead: Lead) => {
    // The modal will handle closing itself
    // React Query will automatically refetch the leads data
    toast({
      title: editingLead ? "Lead updated" : "Lead created",
      description: editingLead 
        ? `Lead "${lead.title}" has been updated successfully.`
        : `Lead "${lead.title}" has been created successfully.`,
    });
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header skeleton */}
          <div className="flex justify-between items-center mb-8">
            <div>
              <Skeleton className="h-9 w-64 mb-2" />
              <Skeleton className="h-5 w-96" />
            </div>
            <Skeleton className="h-10 w-32" />
          </div>
          
          {/* Stats cards skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <div className="flex items-center">
                    <Skeleton className="h-8 w-8 rounded" />
                    <div className="ml-4 space-y-2">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-7 w-24" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          
          {/* Kanban skeleton */}
          <Card>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7 gap-4">
                {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                  <div key={i} className="space-y-4">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-32 w-full" />
                    <Skeleton className="h-24 w-full" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50" data-testid="leads-page">
      <AppHeader />
      
      <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900" data-testid="page-title">
              CRM - Lead Management
            </h1>
            <p className="mt-2 text-gray-600" data-testid="page-description">
              Manage your sales pipeline and track leads through every stage of the sales process
            </p>
          </div>
          <div className="flex space-x-4">
            <Button 
              onClick={() => handleAddLead()} 
              className="bg-edg-teal hover:bg-edg-teal-dark text-white"
              data-testid="button-add-lead"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add New Lead
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card data-testid="stat-total-leads">
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Users className="h-6 w-6 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Leads</p>
                  <p className="text-2xl font-bold text-gray-900" data-testid="total-leads-count">
                    {totalLeads.toLocaleString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="stat-active-leads">
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <TrendingUp className="h-6 w-6 text-orange-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Active Leads</p>
                  <p className="text-2xl font-bold text-gray-900" data-testid="active-leads-count">
                    {activeLeads.toLocaleString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="stat-total-value">
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="p-2 bg-green-100 rounded-lg">
                  <DollarSign className="h-6 w-6 text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Pipeline Value</p>
                  <p className="text-2xl font-bold text-gray-900" data-testid="total-value-amount">
                    {formatCurrency(totalValue)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="stat-conversion-rate">
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <UserCheck className="h-6 w-6 text-purple-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Conversion Rate</p>
                  <div className="flex items-center">
                    <p className="text-2xl font-bold text-gray-900" data-testid="conversion-rate-percentage">
                      {conversionRate.toFixed(1)}%
                    </p>
                    <Badge 
                      className={`ml-2 ${
                        conversionRate >= 20 
                          ? "bg-green-100 text-green-800" 
                          : conversionRate >= 10 
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-red-100 text-red-800"
                      }`}
                      data-testid="conversion-rate-badge"
                    >
                      {conversionRate >= 20 ? "Excellent" : conversionRate >= 10 ? "Good" : "Needs Work"}
                    </Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Kanban Board */}
        <Card className="overflow-hidden">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-semibold" data-testid="kanban-board-title">
              Sales Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 pt-0">
            <div className="h-[calc(100vh-400px)] min-h-96">
              <KanbanBoard
                onAddLead={handleAddLead}
                onEditLead={handleEditLead}
                onConvertLead={handleConvertLead}
                onDeleteLead={handleDeleteLead}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lead Modal */}
      <LeadModal
        open={isLeadModalOpen}
        onOpenChange={handleLeadModalClose}
        lead={editingLead || undefined}
        onLeadSaved={handleLeadSaved}
      />
    </div>
  );
}