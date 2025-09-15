import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/app-header";
import { KanbanBoard } from "@/components/kanban-board";
import { LeadDetailModal } from "@/components/lead-detail-modal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Users, DollarSign, TrendingUp, AlertCircle, UserPlus } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useAuth } from "@/hooks/useAuth";
import type { Lead, User } from "@shared/schema";

// Lead creation form schema
const createLeadSchema = z.object({
  name: z.string().min(1, "Lead name is required"),
  email: z.string().email("Valid email is required").or(z.literal("")),
  phone: z.string().optional(),
  company: z.string().optional(),
  value: z.string().optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
  assignedTo: z.string().optional(),
});

type CreateLeadFormData = z.infer<typeof createLeadSchema>;

export default function CRMPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterByAssigned, setFilterByAssigned] = useState<string>("all");
  const [filterByStatus, setFilterByStatus] = useState<string>("all");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null);
  const [leadModalOpen, setLeadModalOpen] = useState(false);
  
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  // Fetch leads
  const { data: leads = [], isLoading: leadsLoading, error: leadsError } = useQuery<Lead[]>({
    queryKey: ["/api/leads"],
    enabled: isAuthenticated,
  });

  // Fetch users for assignment dropdown
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
    enabled: isAuthenticated,
  });

  // Create lead form
  const form = useForm<CreateLeadFormData>({
    resolver: zodResolver(createLeadSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      company: "",
      value: "",
      source: "",
      notes: "",
      assignedTo: "",
    },
  });

  // Create lead mutation
  const createLeadMutation = useMutation({
    mutationFn: async (leadData: CreateLeadFormData) => {
      const processedData = {
        ...leadData,
        email: leadData.email || undefined,
        phone: leadData.phone || undefined,
        company: leadData.company || undefined,
        value: leadData.value ? parseFloat(leadData.value) : undefined,
        source: leadData.source || undefined,
        notes: leadData.notes || undefined,
        assignedTo: leadData.assignedTo || undefined,
      };
      return await apiRequest("POST", "/api/leads", processedData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      toast({
        title: "Lead created",
        description: "New lead has been successfully created.",
      });
      form.reset();
      setCreateDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create lead. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Filter leads based on search and filters
  const filteredLeads = useMemo(() => {
    let filtered = leads;

    // Search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(lead =>
        lead.name.toLowerCase().includes(term) ||
        (lead.email && lead.email.toLowerCase().includes(term)) ||
        (lead.company && lead.company.toLowerCase().includes(term)) ||
        (lead.phone && lead.phone.toLowerCase().includes(term))
      );
    }

    // Assigned user filter
    if (filterByAssigned !== "all") {
      if (filterByAssigned === "unassigned") {
        filtered = filtered.filter(lead => !lead.assignedTo);
      } else {
        filtered = filtered.filter(lead => lead.assignedTo === filterByAssigned);
      }
    }

    // Status filter
    if (filterByStatus !== "all") {
      filtered = filtered.filter(lead => lead.status === filterByStatus);
    }

    return filtered;
  }, [leads, searchTerm, filterByAssigned, filterByStatus]);

  // Calculate stats
  const stats = useMemo(() => {
    const totalLeads = filteredLeads.length;
    const totalValue = filteredLeads.reduce((sum, lead) => {
      return sum + (lead.value ? parseFloat(lead.value.toString()) : 0);
    }, 0);
    const wonLeads = filteredLeads.filter(lead => lead.status === 'won').length;
    const conversionRate = totalLeads > 0 ? (wonLeads / totalLeads) * 100 : 0;

    return {
      totalLeads,
      totalValue,
      conversionRate,
      activeLeads: filteredLeads.filter(lead => !['won', 'lost'].includes(lead.status)).length,
    };
  }, [filteredLeads]);

  const handleLeadClick = (lead: Lead) => {
    setSelectedLeadId(lead.id);
    setLeadModalOpen(true);
  };

  const handleModalClose = () => {
    setLeadModalOpen(false);
    setSelectedLeadId(null);
  };

  const handleCreateSubmit = (data: CreateLeadFormData) => {
    createLeadMutation.mutate(data);
  };

  // Handle authentication errors
  if (leadsError && isUnauthorizedError(leadsError as Error)) {
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

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      
      <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start mb-8 space-y-4 lg:space-y-0">
          <div>
            <h2 className="text-3xl font-bold text-edg-black">Lead Management</h2>
            <p className="text-edg-grey mt-2">Manage and track your sales pipeline</p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-edg-grey h-4 w-4" />
              <Input
                placeholder="Search leads..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 w-full sm:w-80"
                data-testid="search-leads"
              />
            </div>

            {/* Add Lead Button */}
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-edg-black hover:bg-edg-grey text-edg-white w-full sm:w-auto" data-testid="button-add-lead">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Lead
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Add New Lead</DialogTitle>
                </DialogHeader>
                
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(handleCreateSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name *</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-lead-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input type="email" {...field} data-testid="input-lead-email" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="company"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Company</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-lead-company" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="value"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Estimated Value</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" {...field} data-testid="input-lead-value" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="source"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Source</FormLabel>
                          <FormControl>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <SelectTrigger data-testid="select-lead-source">
                                <SelectValue placeholder="Select source" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="web">Website</SelectItem>
                                <SelectItem value="referral">Referral</SelectItem>
                                <SelectItem value="cold_call">Cold Call</SelectItem>
                                <SelectItem value="trade_show">Trade Show</SelectItem>
                                <SelectItem value="social_media">Social Media</SelectItem>
                                <SelectItem value="other">Other</SelectItem>
                              </SelectContent>
                            </Select>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex justify-end space-x-2 pt-4">
                      <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)} data-testid="button-cancel-lead">
                        Cancel
                      </Button>
                      <Button type="submit" disabled={createLeadMutation.isPending} data-testid="button-save-lead">
                        {createLeadMutation.isPending ? "Creating..." : "Create Lead"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center space-y-3 sm:space-y-0 sm:space-x-4 mb-6">
          <Select value={filterByAssigned} onValueChange={setFilterByAssigned}>
            <SelectTrigger className="w-full sm:w-48" data-testid="filter-assigned">
              <SelectValue placeholder="All Users" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Users</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {users.map(user => (
                <SelectItem key={user.id} value={user.id}>
                  {user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.username}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterByStatus} onValueChange={setFilterByStatus}>
            <SelectTrigger className="w-full sm:w-48" data-testid="filter-status">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="contacted">Contacted</SelectItem>
              <SelectItem value="quoted">Quoted</SelectItem>
              <SelectItem value="won">Won</SelectItem>
              <SelectItem value="lost">Lost</SelectItem>
            </SelectContent>
          </Select>

          {/* Results count */}
          {(searchTerm || filterByAssigned !== "all" || filterByStatus !== "all") && (
            <div className="text-sm text-edg-grey" data-testid="filter-results">
              Showing {filteredLeads.length} of {leads.length} leads
            </div>
          )}
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Users className="h-8 w-8 text-edg-teal" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-edg-grey">Total Leads</p>
                  <p className="text-2xl font-bold text-edg-black" data-testid="stat-total-leads">{stats.totalLeads}</p>
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
                  <p className="text-2xl font-bold text-edg-black" data-testid="stat-pipeline-value">
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
                  <p className="text-2xl font-bold text-edg-black" data-testid="stat-conversion-rate">
                    {stats.conversionRate.toFixed(1)}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <AlertCircle className="h-8 w-8 text-edg-teal" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-edg-grey">Active Leads</p>
                  <p className="text-2xl font-bold text-edg-black" data-testid="stat-active-leads">{stats.activeLeads}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Kanban Board */}
        <div className="mb-8">
          {leadsLoading ? (
            <KanbanBoard leads={[]} isLoading={true} onLeadClick={handleLeadClick} />
          ) : filteredLeads.length === 0 && leads.length === 0 ? (
            <Card className="p-12 text-center">
              <UserPlus className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No leads yet</h3>
              <p className="text-gray-500 mb-6">Get started by creating your first lead to track in the pipeline.</p>
              <Button 
                onClick={() => setCreateDialogOpen(true)}
                className="bg-edg-black hover:bg-edg-grey text-white"
                data-testid="button-create-first-lead"
              >
                <Plus className="mr-2 h-4 w-4" />
                Create Your First Lead
              </Button>
            </Card>
          ) : filteredLeads.length === 0 ? (
            <Card className="p-12 text-center">
              <Search className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No leads found</h3>
              <p className="text-gray-500 mb-6">Try adjusting your search or filter criteria.</p>
              <Button 
                variant="outline"
                onClick={() => {
                  setSearchTerm("");
                  setFilterByAssigned("all");
                  setFilterByStatus("all");
                }}
                data-testid="button-clear-filters"
              >
                Clear Filters
              </Button>
            </Card>
          ) : (
            <KanbanBoard 
              leads={filteredLeads} 
              isLoading={leadsLoading} 
              onLeadClick={handleLeadClick}
            />
          )}
        </div>

        {/* Lead Detail Modal */}
        <LeadDetailModal
          leadId={selectedLeadId}
          open={leadModalOpen}
          onClose={handleModalClose}
          users={users}
        />
      </div>
    </div>
  );
}