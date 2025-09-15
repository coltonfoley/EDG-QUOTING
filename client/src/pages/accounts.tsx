import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AppHeader } from "@/components/app-header";
import { AccountForm } from "@/components/forms/account-form";
import { RoleManager } from "@/components/forms/role-manager";
import { ActivityFeed } from "@/components/forms/activity-feed";
import { AccountHealthScoring } from "@/components/business-intelligence/account-health-scoring";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { 
  Plus, 
  Search, 
  Building2, 
  Users, 
  Target, 
  Phone, 
  Mail, 
  MapPin, 
  Eye,
  Edit,
  MoreHorizontal,
  Filter,
  Download,
  ChevronDown,
  X,
  Save,
  Grid,
  List,
  SlidersHorizontal,
  FileText
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useAuth } from "@/hooks/useAuth";
import type { Account, Contact, Opportunity, InsertAccount } from "@shared/schema";

interface AccountWithDetails extends Account {
  roles: string[];
  contactCount?: number;
  opportunityCount?: number;
  totalValue?: number;
}

interface SavedFilter {
  id: string;
  name: string;
  filters: {
    searchTerm: string;
    filterByType: string;
    filterByRole: string;
    showOnlyWithOpportunities: boolean;
    showOnlyWithRecentActivity: boolean;
    minOpportunityCount: number;
  };
}

export default function AccountsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterByType, setFilterByType] = useState<string>("all");
  const [filterByRole, setFilterByRole] = useState<string>("all");
  const [showOnlyWithOpportunities, setShowOnlyWithOpportunities] = useState(false);
  const [showOnlyWithRecentActivity, setShowOnlyWithRecentActivity] = useState(false);
  const [minOpportunityCount, setMinOpportunityCount] = useState(0);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedAccountIds, setSelectedAccountIds] = useState<number[]>([]);
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [saveFilterDialogOpen, setSaveFilterDialogOpen] = useState(false);
  const [filterName, setFilterName] = useState("");
  
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  // Fetch accounts
  const { data: accounts = [], isLoading: accountsLoading, error: accountsError } = useQuery<Account[]>({
    queryKey: ["/api/accounts"],
    enabled: isAuthenticated,
  });

  // Fetch contacts for relationship data
  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
    enabled: isAuthenticated,
  });

  // Fetch opportunities for relationship data
  const { data: opportunities = [] } = useQuery<Opportunity[]>({
    queryKey: ["/api/opportunities"],
    enabled: isAuthenticated,
  });

  // Fetch account roles for each account
  const { data: accountRoles = [] } = useQuery<{accountId: number, roles: string[]}[]>({
    queryKey: ["/api/accounts/roles"],
    queryFn: async () => {
      if (!accounts.length) return [];
      const rolePromises = accounts.map(async (account) => {
        try {
          const roles = await apiRequest("GET", `/api/accounts/${account.id}/roles`, {});
          return { accountId: account.id, roles: roles.map((r: any) => r.role) };
        } catch (error) {
          console.error(`Failed to fetch roles for account ${account.id}:`, error);
          return { accountId: account.id, roles: [] };
        }
      });
      return Promise.all(rolePromises);
    },
    enabled: isAuthenticated && accounts.length > 0,
  });

  // Enrich accounts with additional data
  const enrichedAccounts: AccountWithDetails[] = useMemo(() => {
    return accounts.map(account => {
      const accountContacts = contacts.filter(c => c.accountId === account.id);
      const accountOpportunities = opportunities.filter(o => o.accountId === account.id);
      const totalValue = accountOpportunities.reduce((sum, opp) => {
        return sum + (opp.amount ? parseFloat(opp.amount.toString()) : 0);
      }, 0);

      // Find roles for this account
      const accountRoleData = accountRoles.find(ar => ar.accountId === account.id);
      const roles = accountRoleData ? accountRoleData.roles : [];

      return {
        ...account,
        roles,
        contactCount: accountContacts.length,
        opportunityCount: accountOpportunities.length,
        totalValue,
      };
    });
  }, [accounts, contacts, opportunities, accountRoles]);

  // Create account mutation
  const createAccountMutation = useMutation({
    mutationFn: async (accountData: InsertAccount) => {
      return await apiRequest("POST", "/api/accounts", accountData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      toast({
        title: "Account created",
        description: "New account has been successfully created.",
      });
      setCreateDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create account. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Update account mutation
  const updateAccountMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<InsertAccount> }) => {
      return await apiRequest("PUT", `/api/accounts/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      toast({
        title: "Account updated",
        description: "Account has been successfully updated.",
      });
      setEditDialogOpen(false);
      setSelectedAccount(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update account. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Enhanced filtering with advanced options
  const filteredAccounts = useMemo(() => {
    let filtered = enrichedAccounts;

    // Search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(account =>
        account.name.toLowerCase().includes(term) ||
        (account.email && account.email.toLowerCase().includes(term)) ||
        (account.phone && account.phone.toLowerCase().includes(term)) ||
        (account.billingAddress && account.billingAddress.toLowerCase().includes(term)) ||
        (account.shippingAddress && account.shippingAddress.toLowerCase().includes(term))
      );
    }

    // Type filter
    if (filterByType !== "all") {
      filtered = filtered.filter(account => account.type === filterByType);
    }

    // Role filter
    if (filterByRole !== "all") {
      filtered = filtered.filter(account => account.roles.includes(filterByRole));
    }

    // Show only accounts with opportunities
    if (showOnlyWithOpportunities) {
      filtered = filtered.filter(account => account.opportunityCount && account.opportunityCount > 0);
    }

    // Show only accounts with recent activity (last 30 days)
    if (showOnlyWithRecentActivity) {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      filtered = filtered.filter(account => new Date(account.updatedAt) >= thirtyDaysAgo);
    }

    // Minimum opportunity count filter
    if (minOpportunityCount > 0) {
      filtered = filtered.filter(account => account.opportunityCount && account.opportunityCount >= minOpportunityCount);
    }

    return filtered;
  }, [enrichedAccounts, searchTerm, filterByType, filterByRole, showOnlyWithOpportunities, showOnlyWithRecentActivity, minOpportunityCount]);

  // Handle saved filters
  const saveCurrentFilter = () => {
    if (!filterName.trim()) return;
    
    const newFilter: SavedFilter = {
      id: Date.now().toString(),
      name: filterName,
      filters: {
        searchTerm,
        filterByType,
        filterByRole,
        showOnlyWithOpportunities,
        showOnlyWithRecentActivity,
        minOpportunityCount,
      }
    };
    
    setSavedFilters(prev => [...prev, newFilter]);
    setFilterName("");
    setSaveFilterDialogOpen(false);
    toast({
      title: "Filter saved",
      description: `Filter "${newFilter.name}" has been saved.`,
    });
  };

  const applySavedFilter = (filter: SavedFilter) => {
    setSearchTerm(filter.filters.searchTerm);
    setFilterByType(filter.filters.filterByType);
    setFilterByRole(filter.filters.filterByRole);
    setShowOnlyWithOpportunities(filter.filters.showOnlyWithOpportunities);
    setShowOnlyWithRecentActivity(filter.filters.showOnlyWithRecentActivity);
    setMinOpportunityCount(filter.filters.minOpportunityCount);
  };

  const clearAllFilters = () => {
    setSearchTerm("");
    setFilterByType("all");
    setFilterByRole("all");
    setShowOnlyWithOpportunities(false);
    setShowOnlyWithRecentActivity(false);
    setMinOpportunityCount(0);
  };

  // Bulk operations
  const handleSelectAll = () => {
    if (selectedAccountIds.length === filteredAccounts.length) {
      setSelectedAccountIds([]);
    } else {
      setSelectedAccountIds(filteredAccounts.map(account => account.id));
    }
  };

  const handleSelectAccount = (accountId: number) => {
    setSelectedAccountIds(prev => 
      prev.includes(accountId) 
        ? prev.filter(id => id !== accountId)
        : [...prev, accountId]
    );
  };

  // Export functionality
  const exportAccounts = () => {
    const csvData = filteredAccounts.map(account => ({
      Name: account.name,
      Type: account.type,
      Email: account.email || '',
      Phone: account.phone || '',
      'Billing Address': account.billingAddress || '',
      'Contact Count': account.contactCount || 0,
      'Opportunity Count': account.opportunityCount || 0,
      'Total Value': account.totalValue || 0,
      Roles: account.roles.join(', '),
      'Created Date': new Date(account.createdAt).toLocaleDateString(),
    }));
    
    const csvString = [
      Object.keys(csvData[0] || {}).join(','),
      ...csvData.map(row => Object.values(row).map(val => `"${val}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvString], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `accounts-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Export successful",
      description: `Exported ${filteredAccounts.length} accounts to CSV.`,
    });
  };

  const hasActiveFilters = searchTerm || filterByType !== 'all' || filterByRole !== 'all' || 
                          showOnlyWithOpportunities || showOnlyWithRecentActivity || minOpportunityCount > 0;

  const handleCreateAccount = (data: InsertAccount) => {
    createAccountMutation.mutate(data);
  };

  const handleUpdateAccount = (data: Partial<InsertAccount>) => {
    if (selectedAccount) {
      updateAccountMutation.mutate({ id: selectedAccount.id, data });
    }
  };

  const handleViewAccount = (account: Account) => {
    setSelectedAccount(account);
    setDetailSheetOpen(true);
  };

  const handleEditAccount = (account: Account) => {
    setSelectedAccount(account);
    setEditDialogOpen(true);
  };

  // Handle authentication errors
  if (accountsError && isUnauthorizedError(accountsError as Error)) {
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
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col gap-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold text-edg-black">Accounts</h1>
              <p className="text-edg-grey mt-1">Manage your business accounts and relationships</p>
              {hasActiveFilters && (
                <p className="text-sm text-blue-600 mt-1">
                  {filteredAccounts.length} of {enrichedAccounts.length} accounts shown
                </p>
              )}
            </div>
            
            <div className="flex items-center gap-3">
              {selectedAccountIds.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">{selectedAccountIds.length} selected</span>
                  <Button variant="outline" size="sm" data-testid="button-bulk-export">
                    <Download className="mr-2 h-4 w-4" />
                    Export Selected
                  </Button>
                </div>
              )}
              
              <Button variant="outline" onClick={exportAccounts} data-testid="button-export-accounts">
                <Download className="mr-2 h-4 w-4" />
                Export All
              </Button>
              
              {/* View Mode Toggle */}
              <div className="flex border rounded-lg p-1">
                <Button
                  variant={viewMode === "grid" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("grid")}
                  className="px-3"
                  data-testid="button-grid-view"
                >
                  <Grid className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === "list" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("list")}
                  className="px-3"
                  data-testid="button-list-view"
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
              
              <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-create-account">
                    <Plus className="mr-2 h-4 w-4" />
                    New Account
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[600px]">
                  <DialogHeader>
                    <DialogTitle>Create Account</DialogTitle>
                  </DialogHeader>
                  <AccountForm
                    onSuccess={() => setCreateDialogOpen(false)}
                    onCancel={() => setCreateDialogOpen(false)}
                  />
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>

        {/* Enhanced Search and Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="space-y-4">
              {/* Main Search and Quick Filters */}
              <div className="flex flex-col md:flex-row gap-4">
                {/* Search */}
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-edg-grey h-4 w-4" />
                  <Input
                    placeholder="Search accounts by name, email, phone, address..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                    data-testid="input-search-accounts"
                  />
                </div>
                
                {/* Quick Filters */}
                <div className="flex gap-2">
                  <Select value={filterByType} onValueChange={setFilterByType}>
                    <SelectTrigger className="w-[140px]" data-testid="select-filter-type">
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="company">Company</SelectItem>
                      <SelectItem value="individual">Individual</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <Select value={filterByRole} onValueChange={setFilterByRole}>
                    <SelectTrigger className="w-[140px]" data-testid="select-filter-role">
                      <SelectValue placeholder="Role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Roles</SelectItem>
                      <SelectItem value="lead">Lead</SelectItem>
                      <SelectItem value="client">Client</SelectItem>
                      <SelectItem value="vendor">Vendor</SelectItem>
                      <SelectItem value="contractor">Contractor</SelectItem>
                      <SelectItem value="supplier">Supplier</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  {/* Advanced Filters Toggle */}
                  <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
                    <CollapsibleTrigger asChild>
                      <Button variant="outline" data-testid="button-advanced-filters">
                        <SlidersHorizontal className="mr-2 h-4 w-4" />
                        Advanced
                        <ChevronDown className={`ml-2 h-4 w-4 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
                      </Button>
                    </CollapsibleTrigger>
                  </Collapsible>
                  
                  {/* Clear Filters */}
                  {hasActiveFilters && (
                    <Button variant="ghost" onClick={clearAllFilters} data-testid="button-clear-filters">
                      <X className="mr-2 h-4 w-4" />
                      Clear
                    </Button>
                  )}
                </div>
              </div>
              
              {/* Advanced Filters */}
              <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
                <CollapsibleContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
                    {/* Opportunity Filters */}
                    <div className="space-y-3">
                      <h4 className="font-medium text-sm">Opportunity Filters</h4>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="has-opportunities"
                          checked={showOnlyWithOpportunities}
                          onCheckedChange={setShowOnlyWithOpportunities}
                          data-testid="checkbox-has-opportunities"
                        />
                        <label htmlFor="has-opportunities" className="text-sm">Has opportunities</label>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm">Min. opportunities:</label>
                        <Input
                          type="number"
                          min="0"
                          value={minOpportunityCount}
                          onChange={(e) => setMinOpportunityCount(parseInt(e.target.value) || 0)}
                          className="w-full"
                          data-testid="input-min-opportunities"
                        />
                      </div>
                    </div>
                    
                    {/* Activity Filters */}
                    <div className="space-y-3">
                      <h4 className="font-medium text-sm">Activity Filters</h4>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="recent-activity"
                          checked={showOnlyWithRecentActivity}
                          onCheckedChange={setShowOnlyWithRecentActivity}
                          data-testid="checkbox-recent-activity"
                        />
                        <label htmlFor="recent-activity" className="text-sm">Active in last 30 days</label>
                      </div>
                    </div>
                    
                    {/* Saved Filters */}
                    <div className="space-y-3">
                      <h4 className="font-medium text-sm">Saved Filters</h4>
                      <div className="flex gap-2">
                        <Dialog open={saveFilterDialogOpen} onOpenChange={setSaveFilterDialogOpen}>
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm" data-testid="button-save-filter">
                              <Save className="mr-2 h-4 w-4" />
                              Save Current
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-[400px]">
                            <DialogHeader>
                              <DialogTitle>Save Filter</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                              <Input
                                placeholder="Filter name..."
                                value={filterName}
                                onChange={(e) => setFilterName(e.target.value)}
                                data-testid="input-filter-name"
                              />
                              <div className="flex justify-end gap-2">
                                <Button variant="outline" onClick={() => setSaveFilterDialogOpen(false)}>
                                  Cancel
                                </Button>
                                <Button onClick={saveCurrentFilter} disabled={!filterName.trim()}>
                                  Save
                                </Button>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                      
                      {savedFilters.length > 0 && (
                        <div className="space-y-1">
                          {savedFilters.map(filter => (
                            <Button
                              key={filter.id}
                              variant="ghost"
                              size="sm"
                              onClick={() => applySavedFilter(filter)}
                              className="w-full justify-start h-8"
                              data-testid={`button-saved-filter-${filter.id}`}
                            >
                              <FileText className="mr-2 h-3 w-3" />
                              {filter.name}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
              
              {/* Bulk Actions Bar */}
              {selectedAccountIds.length > 0 && (
                <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={selectedAccountIds.length === filteredAccounts.length}
                      onCheckedChange={handleSelectAll}
                      data-testid="checkbox-select-all"
                    />
                    <span className="text-sm font-medium">
                      {selectedAccountIds.length} of {filteredAccounts.length} accounts selected
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" data-testid="button-bulk-email">
                      <Mail className="mr-2 h-4 w-4" />
                      Send Email
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setSelectedAccountIds([])} data-testid="button-deselect-all">
                      <X className="mr-2 h-4 w-4" />
                      Deselect All
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Account List */}
        {accountsLoading ? (
          <div className={viewMode === "grid" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" : "space-y-4"}>
            {[...Array(6)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <div className="flex items-center space-x-4">
                    <Skeleton className="h-12 w-12 rounded-full" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredAccounts.length > 0 ? (
          viewMode === "grid" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredAccounts.map((account) => (
                <Card key={account.id} className="hover:shadow-lg transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <Avatar className="h-12 w-12">
                          <AvatarFallback className="bg-edg-teal text-edg-black font-medium">
                            {account.name.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <h3 className="font-semibold text-lg">{account.name}</h3>
                          <Badge variant="secondary" className="text-xs mt-1">
                            {account.type === 'company' ? 'Company' : 'Individual'}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewAccount(account)}
                          data-testid={`button-view-account-${account.id}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditAccount(account)}
                          data-testid={`button-edit-account-${account.id}`}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2 text-sm text-gray-600">
                      {account.email && (
                        <div className="flex items-center space-x-2">
                          <Mail className="h-4 w-4" />
                          <span className="truncate">{account.email}</span>
                        </div>
                      )}
                      {account.phone && (
                        <div className="flex items-center space-x-2">
                          <Phone className="h-4 w-4" />
                          <span>{account.phone}</span>
                        </div>
                      )}
                      {account.billingAddress && (
                        <div className="flex items-center space-x-2">
                          <MapPin className="h-4 w-4" />
                          <span className="truncate">{account.billingAddress}</span>
                        </div>
                      )}
                    </div>

                    {/* Role Badges */}
                    <div className="mt-4 pt-4 border-t">
                      <div className="flex flex-wrap gap-1 mb-3">
                        {account.roles.length > 0 ? account.roles.map(role => {
                          const roleColors = {
                            lead: "bg-blue-500 text-white",
                            client: "bg-green-500 text-white", 
                            vendor: "bg-purple-500 text-white",
                            contractor: "bg-orange-500 text-white",
                            supplier: "bg-teal-500 text-white"
                          };
                          return (
                            <Badge 
                              key={role} 
                              className={`text-xs ${roleColors[role as keyof typeof roleColors] || 'bg-gray-500 text-white'}`}
                              data-testid={`badge-account-role-${role}`}
                            >
                              {role.charAt(0).toUpperCase() + role.slice(1)}
                            </Badge>
                          );
                        }) : (
                          <Badge variant="secondary" className="text-xs text-gray-500">
                            No roles
                          </Badge>
                        )}
                      </div>
                    
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4 text-sm text-gray-500">
                          <div className="flex items-center space-x-1">
                            <Users className="h-4 w-4" />
                            <span>{account.contactCount || 0}</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Target className="h-4 w-4" />
                            <span>{account.opportunityCount || 0}</span>
                          </div>
                        </div>
                        {account.totalValue && account.totalValue > 0 && (
                          <Badge variant="secondary" className="bg-green-100 text-green-800">
                            ${account.totalValue.toLocaleString()}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="divide-y">
                  {filteredAccounts.map((account) => (
                    <div key={account.id} className="p-6 hover:bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback className="bg-edg-teal text-edg-black font-medium">
                              {account.name.substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <h3 className="font-semibold">{account.name}</h3>
                            <div className="flex items-center space-x-4 text-sm text-gray-500 mt-1">
                              <Badge variant="secondary" className="text-xs">
                                {account.type === 'company' ? 'Company' : 'Individual'}
                              </Badge>
                              <div className="flex flex-wrap gap-1">
                                {account.roles.length > 0 ? account.roles.map(role => {
                                  const roleColors = {
                                    lead: "bg-blue-500 text-white",
                                    client: "bg-green-500 text-white",
                                    vendor: "bg-purple-500 text-white", 
                                    contractor: "bg-orange-500 text-white",
                                    supplier: "bg-teal-500 text-white"
                                  };
                                  return (
                                    <Badge 
                                      key={role} 
                                      className={`text-xs ${roleColors[role as keyof typeof roleColors] || 'bg-gray-500 text-white'}`}
                                      data-testid={`badge-account-role-${role}`}
                                    >
                                      {role.charAt(0).toUpperCase() + role.slice(1)}
                                    </Badge>
                                  );
                                }) : null}
                              </div>
                              {account.email && <span>{account.email}</span>}
                              {account.phone && <span>{account.phone}</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-4">
                          <div className="flex items-center space-x-4 text-sm text-gray-500">
                            <div className="flex items-center space-x-1">
                              <Users className="h-4 w-4" />
                              <span>{account.contactCount || 0}</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <Target className="h-4 w-4" />
                              <span>{account.opportunityCount || 0}</span>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewAccount(account)}
                              data-testid={`button-view-account-${account.id}`}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditAccount(account)}
                              data-testid={`button-edit-account-${account.id}`}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )
        ) : (
          <Card>
            <CardContent className="text-center py-12">
              <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No accounts found</h3>
              <p className="text-gray-500 mb-6">
                {searchTerm || filterByType !== "all" || filterByRole !== "all"
                  ? "Try adjusting your search or filters"
                  : "Get started by creating your first account"
                }
              </p>
              {!searchTerm && filterByType === "all" && filterByRole === "all" && (
                <Button
                  onClick={() => setCreateDialogOpen(true)}
                  className="bg-edg-black hover:bg-edg-grey"
                  data-testid="button-create-first-account"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create First Account
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Edit Account Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Account</DialogTitle>
          </DialogHeader>
          {selectedAccount && (
            <AccountForm
              initialData={selectedAccount}
              onSubmit={handleUpdateAccount}
              onCancel={() => {
                setEditDialogOpen(false);
                setSelectedAccount(null);
              }}
              isLoading={updateAccountMutation.isPending}
              submitLabel="Update Account"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Account Detail Sheet */}
      <Sheet open={detailSheetOpen} onOpenChange={setDetailSheetOpen}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center space-x-3">
              {selectedAccount && (
                <>
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-edg-teal text-edg-black font-medium">
                      {selectedAccount.name.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="font-semibold">{selectedAccount.name}</div>
                    <Badge variant="secondary" className="text-xs">
                      {selectedAccount.type === 'company' ? 'Company' : 'Individual'}
                    </Badge>
                  </div>
                </>
              )}
            </SheetTitle>
          </SheetHeader>

          {selectedAccount && (
            <div className="mt-6 space-y-6">
              {/* Account Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Account Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedAccount.email && (
                    <div className="flex items-center space-x-3">
                      <Mail className="h-5 w-5 text-gray-400" />
                      <span>{selectedAccount.email}</span>
                    </div>
                  )}
                  {selectedAccount.phone && (
                    <div className="flex items-center space-x-3">
                      <Phone className="h-5 w-5 text-gray-400" />
                      <span>{selectedAccount.phone}</span>
                    </div>
                  )}
                  {selectedAccount.billingAddress && (
                    <div className="flex items-start space-x-3">
                      <MapPin className="h-5 w-5 text-gray-400 mt-0.5" />
                      <div>
                        <p className="font-medium">Billing Address</p>
                        <p className="text-gray-600">{selectedAccount.billingAddress}</p>
                      </div>
                    </div>
                  )}
                  {selectedAccount.shippingAddress && (
                    <div className="flex items-start space-x-3">
                      <MapPin className="h-5 w-5 text-gray-400 mt-0.5" />
                      <div>
                        <p className="font-medium">Shipping Address</p>
                        <p className="text-gray-600">{selectedAccount.shippingAddress}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Tabs defaultValue="roles" className="space-y-4">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="roles">Roles</TabsTrigger>
                  <TabsTrigger value="health">Health Score</TabsTrigger>
                  <TabsTrigger value="contacts">Contacts</TabsTrigger>
                  <TabsTrigger value="activities">Activities</TabsTrigger>
                </TabsList>

                <TabsContent value="roles">
                  <RoleManager
                    entityType="account"
                    entityId={selectedAccount.id}
                    entityName={selectedAccount.name}
                    currentRoles={enrichedAccounts.find(acc => acc.id === selectedAccount.id)?.roles || []}
                    onRolesUpdated={() => {
                      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
                      queryClient.invalidateQueries({ queryKey: ["/api/accounts/roles"] });
                    }}
                  />
                </TabsContent>

                <TabsContent value="health">
                  <AccountHealthScoring
                    account={enrichedAccounts.find(acc => acc.id === selectedAccount.id) || selectedAccount as AccountWithDetails}
                    contacts={contacts}
                    opportunities={opportunities}
                    allAccounts={enrichedAccounts}
                  />
                </TabsContent>

                <TabsContent value="contacts">
                  <Card>
                    <CardHeader>
                      <CardTitle>Contacts</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {contacts.filter(c => c.accountId === selectedAccount.id).length > 0 ? (
                        <div className="space-y-3">
                          {contacts
                            .filter(c => c.accountId === selectedAccount.id)
                            .map((contact) => (
                              <div key={contact.id} className="flex items-center justify-between p-3 border rounded-lg">
                                <div className="flex items-center space-x-3">
                                  <Avatar className="h-8 w-8">
                                    <AvatarFallback className="bg-blue-100 text-blue-600 text-xs">
                                      {contact.firstName[0]}{contact.lastName[0]}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div>
                                    <p className="font-medium">{contact.firstName} {contact.lastName}</p>
                                    {contact.title && <p className="text-sm text-gray-500">{contact.title}</p>}
                                  </div>
                                </div>
                                <div className="text-sm text-gray-500">
                                  {contact.email || contact.phone}
                                </div>
                              </div>
                            ))}
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <Users className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                          <p className="text-gray-500">No contacts added yet</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="activities">
                  <ActivityFeed
                    entityType="account"
                    entityId={selectedAccount.id}
                    entityName={selectedAccount.name}
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