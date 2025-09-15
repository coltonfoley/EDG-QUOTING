import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Search, 
  Building2, 
  Users, 
  Phone, 
  Mail, 
  MapPin, 
  Eye,
  Plus,
  Truck,
  HardHat,
  Package,
  Handshake
} from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useAuth } from "@/hooks/useAuth";
import type { Account, Contact } from "@shared/schema";

interface PartnerWithDetails extends Account {
  contactCount?: number;
  roles: string[];
}

type PartnerType = "all" | "vendor" | "contractor" | "supplier";

export default function BusinessPartnersPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterByType, setFilterByType] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [activeTab, setActiveTab] = useState<PartnerType>("all");
  
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  // Fetch all accounts
  const { data: accounts = [], isLoading: accountsLoading, error: accountsError } = useQuery<Account[]>({
    queryKey: ["/api/accounts"],
    enabled: isAuthenticated,
  });

  // Fetch contacts for relationship data
  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
    enabled: isAuthenticated,
  });

  // Fetch account roles
  const { data: accountRoles = [] } = useQuery<{accountId: number, roles: string[]}[]>({
    queryKey: ["/api/accounts/roles"],
    queryFn: async () => {
      if (!accounts.length) return [];
      const rolePromises = accounts.map(async (account) => {
        try {
          const roles = await apiRequest("GET", `/api/accounts/${account.id}/roles`);
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

  // Filter accounts that have business partner roles
  const businessPartners: PartnerWithDetails[] = useMemo(() => {
    return accounts
      .map(account => {
        // Find roles for this account
        const accountRoleData = accountRoles.find(ar => ar.accountId === account.id);
        const roles = accountRoleData ? accountRoleData.roles : [];
        const accountContacts = contacts.filter(c => c.accountId === account.id);
        
        return {
          ...account,
          roles,
          contactCount: accountContacts.length,
        };
      })
      .filter(account => 
        account.roles.includes('vendor') || 
        account.roles.includes('contractor') || 
        account.roles.includes('supplier')
      );
  }, [accounts, contacts, accountRoles]);

  // Filter partners based on active tab, search, and filters
  const filteredPartners = useMemo(() => {
    let filtered = businessPartners;

    // Tab filter
    if (activeTab !== "all") {
      filtered = filtered.filter(partner => partner.roles.includes(activeTab));
    }

    // Search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(partner =>
        partner.name.toLowerCase().includes(term) ||
        (partner.email && partner.email.toLowerCase().includes(term)) ||
        (partner.phone && partner.phone.toLowerCase().includes(term))
      );
    }

    // Type filter
    if (filterByType !== "all") {
      filtered = filtered.filter(partner => partner.type === filterByType);
    }

    return filtered;
  }, [businessPartners, activeTab, searchTerm, filterByType]);

  // Get counts for each tab
  const tabCounts = useMemo(() => {
    const vendors = businessPartners.filter(p => p.roles.includes('vendor')).length;
    const contractors = businessPartners.filter(p => p.roles.includes('contractor')).length;
    const suppliers = businessPartners.filter(p => p.roles.includes('supplier')).length;
    
    return {
      all: businessPartners.length,
      vendor: vendors,
      contractor: contractors,
      supplier: suppliers
    };
  }, [businessPartners]);

  // Get partner role badges
  const getPartnerRoleBadges = (roles: string[]) => {
    const partnerRoles = roles.filter(role => ['vendor', 'contractor', 'supplier'].includes(role));
    return partnerRoles.map(role => {
      const config = {
        vendor: { label: 'Vendor', color: 'bg-purple-100 text-purple-700', icon: Truck },
        contractor: { label: 'Contractor', color: 'bg-orange-100 text-orange-700', icon: HardHat },
        supplier: { label: 'Supplier', color: 'bg-teal-100 text-teal-700', icon: Package },
      }[role as keyof typeof config];
      
      if (!config) return null;
      const Icon = config.icon;
      
      return (
        <Badge key={role} className={`${config.color} border-0`}>
          <Icon className="w-3 h-3 mr-1" />
          {config.label}
        </Badge>
      );
    });
  };

  // Get tab title with icon
  const getTabTitle = (type: PartnerType) => {
    const configs = {
      all: { label: 'All Partners', icon: Handshake },
      vendor: { label: 'Vendors', icon: Truck },
      contractor: { label: 'Contractors', icon: HardHat },
      supplier: { label: 'Suppliers', icon: Package },
    };
    
    const config = configs[type];
    const Icon = config.icon;
    const count = tabCounts[type];
    
    return (
      <div className="flex items-center space-x-2">
        <Icon className="w-4 h-4" />
        <span>{config.label}</span>
        <Badge variant="secondary" className="ml-1">{count}</Badge>
      </div>
    );
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

  const renderPartnerCard = (partner: PartnerWithDetails) => (
    <Card key={partner.id} className="h-full hover:shadow-lg transition-shadow duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3 flex-1">
            <Avatar className="h-12 w-12">
              <AvatarFallback className="bg-edg-teal text-edg-white font-semibold">
                {partner.name.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-edg-black truncate" data-testid={`text-partner-name-${partner.id}`}>
                {partner.name}
              </h3>
              <div className="flex items-center space-x-2 mt-1">
                {getPartnerRoleBadges(partner.roles)}
              </div>
            </div>
          </div>
          <Badge variant={partner.type === 'company' ? 'default' : 'secondary'}>
            {partner.type === 'company' ? 'Company' : 'Individual'}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        <div className="space-y-2 text-sm text-edg-grey">
          {partner.email && (
            <div className="flex items-center space-x-2">
              <Mail className="h-4 w-4 text-edg-teal" />
              <span className="truncate" data-testid={`text-partner-email-${partner.id}`}>{partner.email}</span>
            </div>
          )}
          {partner.phone && (
            <div className="flex items-center space-x-2">
              <Phone className="h-4 w-4 text-edg-teal" />
              <span data-testid={`text-partner-phone-${partner.id}`}>{partner.phone}</span>
            </div>
          )}
          {partner.address && (
            <div className="flex items-center space-x-2">
              <MapPin className="h-4 w-4 text-edg-teal" />
              <span className="truncate" data-testid={`text-partner-address-${partner.id}`}>{partner.address}</span>
            </div>
          )}
          {partner.contactCount && partner.contactCount > 0 && (
            <div className="flex items-center space-x-2">
              <Users className="h-4 w-4 text-edg-teal" />
              <span data-testid={`text-partner-contacts-${partner.id}`}>
                {partner.contactCount} contact{partner.contactCount !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>
        
        <div className="flex justify-end mt-4">
          <Link href={`/accounts?id=${partner.id}`}>
            <Button variant="outline" size="sm" data-testid={`button-view-partner-${partner.id}`}>
              <Eye className="mr-2 h-4 w-4" />
              View Details
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );

  const renderPartnerList = (partner: PartnerWithDetails) => (
    <Card key={partner.id} className="mb-3">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4 flex-1">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-edg-teal text-edg-white font-semibold">
                {partner.name.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-3 mb-1">
                <h3 className="font-medium text-edg-black" data-testid={`text-partner-name-${partner.id}`}>
                  {partner.name}
                </h3>
                <div className="flex items-center space-x-1">
                  {getPartnerRoleBadges(partner.roles)}
                </div>
                <Badge variant={partner.type === 'company' ? 'default' : 'secondary'}>
                  {partner.type === 'company' ? 'Company' : 'Individual'}
                </Badge>
              </div>
              
              <div className="flex items-center space-x-6 text-sm text-edg-grey">
                {partner.email && (
                  <div className="flex items-center space-x-1">
                    <Mail className="h-3 w-3" />
                    <span data-testid={`text-partner-email-${partner.id}`}>{partner.email}</span>
                  </div>
                )}
                {partner.phone && (
                  <div className="flex items-center space-x-1">
                    <Phone className="h-3 w-3" />
                    <span data-testid={`text-partner-phone-${partner.id}`}>{partner.phone}</span>
                  </div>
                )}
                {partner.contactCount && partner.contactCount > 0 && (
                  <div className="flex items-center space-x-1">
                    <Users className="h-3 w-3" />
                    <span data-testid={`text-partner-contacts-${partner.id}`}>
                      {partner.contactCount} contact{partner.contactCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <Link href={`/accounts?id=${partner.id}`}>
            <Button variant="outline" size="sm" data-testid={`button-view-partner-${partner.id}`}>
              <Eye className="mr-2 h-4 w-4" />
              View Details
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start mb-8 space-y-4 lg:space-y-0">
          <div>
            <div className="flex items-center space-x-3 mb-2">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Handshake className="h-6 w-6 text-blue-600" />
              </div>
              <h2 className="text-3xl font-bold text-edg-black">Business Partners</h2>
            </div>
            <p className="text-edg-grey">Manage your vendors, contractors, and supplier relationships</p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
            {/* View Mode Toggle */}
            <div className="flex border rounded-lg p-1">
              <Button
                variant={viewMode === "grid" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("grid")}
                className="px-3"
                data-testid="button-grid-view"
              >
                Grid
              </Button>
              <Button
                variant={viewMode === "list" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("list")}
                className="px-3"
                data-testid="button-list-view"
              >
                List
              </Button>
            </div>

            {/* Add Partner Button */}
            <Link href="/accounts">
              <Button className="bg-edg-black hover:bg-edg-grey text-edg-white" data-testid="button-add-partner">
                <Plus className="mr-2 h-4 w-4" />
                Add Partner
              </Button>
            </Link>
          </div>
        </div>

        {/* Partner Type Tabs */}
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as PartnerType)} className="mb-8">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="all" data-testid="tab-all-partners">
              {getTabTitle("all")}
            </TabsTrigger>
            <TabsTrigger value="vendor" data-testid="tab-vendors">
              {getTabTitle("vendor")}
            </TabsTrigger>
            <TabsTrigger value="contractor" data-testid="tab-contractors">
              {getTabTitle("contractor")}
            </TabsTrigger>
            <TabsTrigger value="supplier" data-testid="tab-suppliers">
              {getTabTitle("supplier")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="space-y-6">
            {/* Filters */}
            <div className="flex flex-col lg:flex-row lg:items-center space-y-4 lg:space-y-0 lg:space-x-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-edg-grey h-4 w-4" />
                <Input
                  placeholder="Search partners..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-partners"
                />
              </div>
              
              <Select value={filterByType} onValueChange={setFilterByType}>
                <SelectTrigger className="w-full lg:w-[200px]" data-testid="select-filter-type">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="company">Companies</SelectItem>
                  <SelectItem value="individual">Individuals</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Results */}
            {accountsLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(6)].map((_, i) => (
                  <Card key={i} className="h-[200px]">
                    <CardHeader>
                      <Skeleton className="h-12 w-12 rounded-full" />
                      <Skeleton className="h-4 w-3/4" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-3 w-full mb-2" />
                      <Skeleton className="h-3 w-2/3" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : filteredPartners.length === 0 ? (
              <div className="text-center py-12">
                <div className="p-4 bg-gray-100 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                  <Handshake className="h-8 w-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-medium text-edg-black mb-2">No partners found</h3>
                <p className="text-edg-grey mb-4">
                  {searchTerm || filterByType !== "all" 
                    ? "Try adjusting your search criteria" 
                    : "Start by adding your first business partner"}
                </p>
                <Link href="/accounts">
                  <Button data-testid="button-add-first-partner">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Partner
                  </Button>
                </Link>
              </div>
            ) : (
              <>
                {viewMode === "grid" ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredPartners.map(renderPartnerCard)}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredPartners.map(renderPartnerList)}
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}