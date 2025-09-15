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
import { 
  Search, 
  Building2, 
  Users, 
  Phone, 
  Mail, 
  MapPin, 
  Eye,
  Plus,
  Truck
} from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useAuth } from "@/hooks/useAuth";
import type { Account, Contact } from "@shared/schema";

interface VendorWithDetails extends Account {
  contactCount?: number;
  roles: string[];
}

export default function VendorsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterByType, setFilterByType] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  
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

  // Fetch account roles to filter for vendors only
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

  // Filter accounts that have vendor role
  const vendors: VendorWithDetails[] = useMemo(() => {
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
      .filter(account => account.roles.includes('vendor')); // Only show accounts with vendor role
  }, [accounts, contacts, accountRoles]);

  // Filter vendors based on search and filters
  const filteredVendors = useMemo(() => {
    let filtered = vendors;

    // Search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(vendor =>
        vendor.name.toLowerCase().includes(term) ||
        (vendor.email && vendor.email.toLowerCase().includes(term)) ||
        (vendor.phone && vendor.phone.toLowerCase().includes(term))
      );
    }

    // Type filter
    if (filterByType !== "all") {
      filtered = filtered.filter(vendor => vendor.type === filterByType);
    }

    return filtered;
  }, [vendors, searchTerm, filterByType]);

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
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start mb-8 space-y-4 lg:space-y-0">
          <div>
            <div className="flex items-center space-x-3 mb-2">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Truck className="h-6 w-6 text-purple-600" />
              </div>
              <h2 className="text-3xl font-bold text-edg-black">Vendor Directory</h2>
            </div>
            <p className="text-edg-grey">Manage your vendor relationships and suppliers</p>
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

            {/* Add Vendor Button */}
            <Link href="/accounts">
              <Button className="bg-edg-black hover:bg-edg-grey text-edg-white" data-testid="button-add-vendor">
                <Plus className="mr-2 h-4 w-4" />
                Add Vendor
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Vendors</CardTitle>
              <Building2 className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="metric-total-vendors">
                {filteredVendors.length}
              </div>
              <p className="text-xs text-muted-foreground">
                Active vendor relationships
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Company Vendors</CardTitle>
              <Building2 className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="metric-company-vendors">
                {filteredVendors.filter(v => v.type === 'company').length}
              </div>
              <p className="text-xs text-muted-foreground">
                Business partnerships
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Individual Vendors</CardTitle>
              <Users className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="metric-individual-vendors">
                {filteredVendors.filter(v => v.type === 'individual').length}
              </div>
              <p className="text-xs text-muted-foreground">
                Independent contractors
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
                  placeholder="Search vendors..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-vendors"
                />
              </div>

              {/* Type Filter */}
              <Select value={filterByType} onValueChange={setFilterByType}>
                <SelectTrigger className="w-full md:w-48" data-testid="select-filter-type">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="company">Company</SelectItem>
                  <SelectItem value="individual">Individual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Vendor List */}
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
        ) : filteredVendors.length > 0 ? (
          viewMode === "grid" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredVendors.map((vendor) => (
                <Card key={vendor.id} className="hover:shadow-lg transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <Avatar className="h-12 w-12">
                          <AvatarFallback className="bg-purple-100 text-purple-600 font-medium">
                            {vendor.name.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <h3 className="font-semibold text-lg">{vendor.name}</h3>
                          <div className="flex items-center space-x-2 mt-1">
                            <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-800">
                              Vendor
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              {vendor.type === 'company' ? 'Company' : 'Individual'}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <Link href="/accounts">
                        <Button
                          variant="ghost"
                          size="sm"
                          data-testid={`button-view-vendor-${vendor.id}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Link>
                    </div>

                    <div className="space-y-2 text-sm text-gray-600">
                      {vendor.email && (
                        <div className="flex items-center space-x-2">
                          <Mail className="h-4 w-4" />
                          <span className="truncate">{vendor.email}</span>
                        </div>
                      )}
                      {vendor.phone && (
                        <div className="flex items-center space-x-2">
                          <Phone className="h-4 w-4" />
                          <span>{vendor.phone}</span>
                        </div>
                      )}
                      {vendor.billingAddress && (
                        <div className="flex items-center space-x-2">
                          <MapPin className="h-4 w-4" />
                          <span className="truncate">{vendor.billingAddress}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between mt-4 pt-4 border-t">
                      <div className="flex items-center space-x-1 text-sm text-gray-500">
                        <Users className="h-4 w-4" />
                        <span>{vendor.contactCount || 0} contacts</span>
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
                  {filteredVendors.map((vendor) => (
                    <div key={vendor.id} className="p-6 hover:bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback className="bg-purple-100 text-purple-600 font-medium">
                              {vendor.name.substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <h3 className="font-semibold">{vendor.name}</h3>
                            <div className="flex items-center space-x-4 text-sm text-gray-500 mt-1">
                              <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-800">
                                Vendor
                              </Badge>
                              <Badge variant="secondary" className="text-xs">
                                {vendor.type === 'company' ? 'Company' : 'Individual'}
                              </Badge>
                              {vendor.email && <span>{vendor.email}</span>}
                              {vendor.phone && <span>{vendor.phone}</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-4">
                          <div className="flex items-center space-x-1 text-sm text-gray-500">
                            <Users className="h-4 w-4" />
                            <span>{vendor.contactCount || 0}</span>
                          </div>
                          <Link href="/accounts">
                            <Button
                              variant="ghost"
                              size="sm"
                              data-testid={`button-view-vendor-${vendor.id}`}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </Link>
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
              <Truck className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No vendors found</h3>
              <p className="text-gray-500 mb-6">
                {searchTerm || filterByType !== "all"
                  ? "Try adjusting your search or filters"
                  : "Start building your vendor network by adding your first vendor"
                }
              </p>
              {!searchTerm && filterByType === "all" && (
                <Link href="/accounts">
                  <Button className="bg-edg-black hover:bg-edg-grey" data-testid="button-add-first-vendor">
                    <Plus className="mr-2 h-4 w-4" />
                    Add First Vendor
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}