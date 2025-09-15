import { Bell, LogOut, Users, Building2, UserCheck, Target, Truck, HardHat, Package, Search, Command, FileText, Settings, Shield, ClipboardList, TrendingUp, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import logoPath from "@assets/my-logo.png_1753970984943.jpg";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { QuickActionsMenu } from "@/components/workflow/quick-actions-menu";
import { KeyboardShortcuts, useCommonShortcuts } from "@/components/workflow/keyboard-shortcuts";
import type { Account, Contact, Opportunity } from "@shared/schema";

interface GlobalSearchResult {
  type: 'account' | 'contact' | 'opportunity';
  id: number;
  title: string;
  subtitle: string;
  url: string;
}

function GlobalSearchDialog() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  
  const { data: accounts = [] } = useQuery<Account[]>({ queryKey: ["/api/accounts"] });
  const { data: contacts = [] } = useQuery<Contact[]>({ queryKey: ["/api/contacts"] });
  const { data: opportunities = [] } = useQuery<Opportunity[]>({ queryKey: ["/api/opportunities"] });
  
  // Memoize arrays to prevent infinite loops
  const stableAccounts = useMemo(() => accounts, [accounts.length, accounts.map(a => a.id).join(',')]);
  const stableContacts = useMemo(() => contacts, [contacts.length, contacts.map(c => c.id).join(',')]);
  const stableOpportunities = useMemo(() => opportunities, [opportunities.length, opportunities.map(o => o.id).join(',')]);
  
  useEffect(() => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }
    
    const query = searchQuery.toLowerCase();
    const searchResults: GlobalSearchResult[] = [];
    
    // Search accounts
    stableAccounts.forEach(account => {
      const matches = account.name.toLowerCase().includes(query) ||
                     (account.email && account.email.toLowerCase().includes(query)) ||
                     (account.phone && account.phone.toLowerCase().includes(query));
      
      if (matches) {
        searchResults.push({
          type: 'account',
          id: account.id,
          title: account.name,
          subtitle: account.type === 'company' ? 'Company' : 'Individual',
          url: `/accounts?id=${account.id}`
        });
      }
    });
    
    // Search contacts
    stableContacts.forEach(contact => {
      const fullName = `${contact.firstName} ${contact.lastName}`;
      const matches = fullName.toLowerCase().includes(query) ||
                     (contact.email && contact.email.toLowerCase().includes(query)) ||
                     (contact.phone && contact.phone.toLowerCase().includes(query)) ||
                     (contact.title && contact.title.toLowerCase().includes(query));
      
      if (matches) {
        const account = stableAccounts.find(a => a.id === contact.accountId);
        searchResults.push({
          type: 'contact',
          id: contact.id,
          title: fullName,
          subtitle: account ? `Contact at ${account.name}` : 'Contact',
          url: `/contacts?id=${contact.id}`
        });
      }
    });
    
    // Search opportunities
    stableOpportunities.forEach(opportunity => {
      const matches = opportunity.name.toLowerCase().includes(query) ||
                     (opportunity.notes && opportunity.notes.toLowerCase().includes(query)) ||
                     (opportunity.source && opportunity.source.toLowerCase().includes(query));
      
      if (matches) {
        const account = stableAccounts.find(a => a.id === opportunity.accountId);
        searchResults.push({
          type: 'opportunity',
          id: opportunity.id,
          title: opportunity.name,
          subtitle: account ? `Opportunity for ${account.name}` : 'Opportunity',
          url: `/opportunities?id=${opportunity.id}`
        });
      }
    });
    
    setResults(searchResults.slice(0, 10)); // Limit to 10 results
  }, [searchQuery, stableAccounts, stableContacts, stableOpportunities]);
  
  const handleResultClick = (url: string) => {
    setIsOpen(false);
    setSearchQuery("");
    window.location.href = url;
  };
  
  const getResultIcon = (type: string) => {
    switch (type) {
      case 'account': return <Building2 className="h-4 w-4" />;
      case 'contact': return <Users className="h-4 w-4" />;
      case 'opportunity': return <Target className="h-4 w-4" />;
      default: return <Search className="h-4 w-4" />;
    }
  };
  
  const getResultBadgeColor = (type: string) => {
    switch (type) {
      case 'account': return 'bg-blue-100 text-blue-800';
      case 'contact': return 'bg-green-100 text-green-800';
      case 'opportunity': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="text-edg-grey hover:text-edg-black" data-testid="button-global-search">
          <Search className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Command className="h-5 w-5" />
            Global Search
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search accounts, contacts, opportunities..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-global-search"
              autoFocus
            />
          </div>
          
          {results.length > 0 && (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {results.map((result, index) => (
                <Card 
                  key={`${result.type}-${result.id}`} 
                  className="cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => handleResultClick(result.url)}
                  data-testid={`search-result-${index}`}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        {getResultIcon(result.type)}
                        <div>
                          <div className="font-medium text-sm">{result.title}</div>
                          <div className="text-xs text-gray-500">{result.subtitle}</div>
                        </div>
                      </div>
                      <Badge className={`text-xs ${getResultBadgeColor(result.type)}`}>
                        {result.type.charAt(0).toUpperCase() + result.type.slice(1)}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          
          {searchQuery.trim() && results.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <Search className="h-12 w-12 mx-auto mb-2 text-gray-300" />
              <p>No results found for "{searchQuery}"</p>
              <p className="text-sm">Try searching with different keywords</p>
            </div>
          )}
          
          {!searchQuery.trim() && (
            <div className="text-center py-8 text-gray-500">
              <Command className="h-12 w-12 mx-auto mb-2 text-gray-300" />
              <p>Start typing to search across all CRM data</p>
              <p className="text-sm">Search accounts, contacts, and opportunities</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AppHeader() {
  const [location] = useLocation();
  const { user, logoutMutation } = useAuth();
  const shortcuts = useCommonShortcuts();

  const handleLogout = () => {
    logoutMutation.mutate();
  };
  
  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-8">
            <div className="flex-shrink-0 flex items-center">
              <img src={logoPath} alt="EDG Patio & Shade" className="h-8 mr-3" />
              <span className="text-sm text-edg-grey">Estimator</span>
            </div>
            <nav className="hidden lg:flex space-x-6">
              {/* Dashboard */}
              <Link href="/dashboard" className={`text-sm font-medium transition-colors hover:text-edg-teal ${
                location.startsWith('/dashboard') || location === '/'
                  ? 'text-edg-teal border-b-2 border-edg-teal pb-4' 
                  : 'text-edg-grey'
              }`} data-testid="link-dashboard">
                Dashboard
              </Link>
              
              {/* CRM Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    className={`text-sm font-medium transition-colors hover:text-edg-teal h-auto p-0 border-b-2 pb-4 ${
                      location.startsWith('/accounts') || location.startsWith('/contacts') || location.startsWith('/opportunities') || location.startsWith('/business-partners') || location.startsWith('/vendors') || location.startsWith('/contractors') || location.startsWith('/suppliers')
                        ? 'text-edg-teal border-edg-teal' 
                        : 'text-edg-grey border-transparent'
                    }`}
                    data-testid="dropdown-crm"
                  >
                    <Users className="mr-1 h-4 w-4" />
                    CRM
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuLabel className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Customer Relations
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/accounts" className="flex items-center gap-2 w-full" data-testid="link-accounts">
                      <Building2 className="h-4 w-4" />
                      Accounts
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/contacts" className="flex items-center gap-2 w-full" data-testid="link-contacts">
                      <UserCheck className="h-4 w-4" />
                      Contacts
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/opportunities" className="flex items-center gap-2 w-full" data-testid="link-opportunities">
                      <Target className="h-4 w-4" />
                      Opportunities
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/business-partners" className="flex items-center gap-2 w-full" data-testid="link-business-partners">
                      <HardHat className="h-4 w-4" />
                      Business Partners
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              {/* Sales Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    className={`text-sm font-medium transition-colors hover:text-edg-teal h-auto p-0 border-b-2 pb-4 ${
                      location.startsWith('/quotes') || location.startsWith('/products') || location.startsWith('/contracts')
                        ? 'text-edg-teal border-edg-teal' 
                        : 'text-edg-grey border-transparent'
                    }`}
                    data-testid="dropdown-sales"
                  >
                    <Target className="mr-1 h-4 w-4" />
                    Sales
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuLabel className="flex items-center gap-2">
                    <Target className="h-4 w-4" />
                    Sales Operations
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/quotes" className="flex items-center gap-2 w-full" data-testid="link-quotes">
                      <FileText className="h-4 w-4" />
                      Quotes
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/products" className="flex items-center gap-2 w-full" data-testid="link-products">
                      <Package className="h-4 w-4" />
                      Products
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/contracts" className="flex items-center gap-2 w-full" data-testid="link-contracts">
                      <Truck className="h-4 w-4" />
                      Contracts
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              {/* Projects Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    className={`text-sm font-medium transition-colors hover:text-edg-teal h-auto p-0 border-b-2 pb-4 ${
                      location.startsWith('/projects') || location.startsWith('/project-dashboard') || location.startsWith('/project-details')
                        ? 'text-edg-teal border-edg-teal' 
                        : 'text-edg-grey border-transparent'
                    }`}
                    data-testid="dropdown-projects"
                  >
                    <ClipboardList className="mr-1 h-4 w-4" />
                    Projects
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuLabel className="flex items-center gap-2">
                    <ClipboardList className="h-4 w-4" />
                    Project Management
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/project-dashboard" className="flex items-center gap-2 w-full" data-testid="link-project-dashboard">
                      <TrendingUp className="h-4 w-4" />
                      Dashboard
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/projects" className="flex items-center gap-2 w-full" data-testid="link-projects">
                      <Building2 className="h-4 w-4" />
                      All Projects
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/projects/new" className="flex items-center gap-2 w-full" data-testid="link-new-project">
                      <Calendar className="h-4 w-4" />
                      New Project
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/schedule" className="flex items-center gap-2 w-full" data-testid="link-schedule">
                      <Calendar className="h-4 w-4" />
                      Scheduling
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              {/* Admin Dropdown - Only show to admins */}
              {user?.role === 'admin' && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      className={`text-sm font-medium transition-colors hover:text-edg-teal h-auto p-0 border-b-2 pb-4 ${
                        location.startsWith('/admin')
                          ? 'text-edg-teal border-edg-teal' 
                          : 'text-edg-grey border-transparent'
                      }`}
                      data-testid="dropdown-admin"
                    >
                      <Settings className="mr-1 h-4 w-4" />
                      Admin
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    <DropdownMenuLabel className="flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      Administration
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/admin" className="flex items-center gap-2 w-full" data-testid="link-admin-users">
                        <Users className="h-4 w-4" />
                        User Management
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/admin/templates" className="flex items-center gap-2 w-full" data-testid="link-admin-templates">
                        <FileText className="h-4 w-4" />
                        Templates
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </nav>
          </div>
          <div className="flex items-center space-x-4">
            <GlobalSearchDialog />
            
            <QuickActionsMenu 
              onGlobalSearch={() => {
                // Trigger global search dialog
                const searchButton = document.querySelector('[data-testid="button-global-search"]') as HTMLButtonElement;
                searchButton?.click();
              }}
            />
            
            <KeyboardShortcuts shortcuts={shortcuts} enabled={true} />
            
            <Button variant="ghost" size="icon" className="text-edg-grey hover:text-edg-black">
              <Bell className="h-5 w-5" />
            </Button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center space-x-2 hover:bg-gray-50">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-edg-teal text-edg-black font-medium text-xs">
                      {user?.firstName?.[0]}{user?.lastName?.[0] || user?.username?.[0]}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium text-edg-black">
                    {user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user?.username}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">
                      {user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user?.username}
                    </p>
                    {user?.email && (
                      <p className="text-xs leading-none text-gray-600">
                        {user.email}
                      </p>
                    )}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </header>
  );
}


