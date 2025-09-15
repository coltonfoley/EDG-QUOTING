import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Menu, 
  Home, 
  BarChart3, 
  Building2, 
  Users, 
  Target, 
  FileText, 
  Truck, 
  HardHat, 
  Package, 
  Settings,
  Bell,
  Search
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import type { Account, Contact, Opportunity } from "@shared/schema";

interface NavigationItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
  adminOnly?: boolean;
}

export function MobileResponsiveNav() {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();
  const { user } = useAuth();
  
  // Get data for badges
  const { data: accounts = [] } = useQuery<Account[]>({ queryKey: ["/api/accounts"] });
  const { data: contacts = [] } = useQuery<Contact[]>({ queryKey: ["/api/contacts"] });
  const { data: opportunities = [] } = useQuery<Opportunity[]>({ queryKey: ["/api/opportunities"] });
  
  const activeOpportunities = opportunities.filter(opp => 
    !['project_complete', 'closed_lost'].includes(opp.stage)
  );
  
  const navigationItems: NavigationItem[] = [
    {
      href: "/",
      label: "Home",
      icon: <Home className="h-5 w-5" />
    },
    {
      href: "/dashboard",
      label: "Dashboard",
      icon: <BarChart3 className="h-5 w-5" />
    },
    {
      href: "/accounts",
      label: "Accounts",
      icon: <Building2 className="h-5 w-5" />,
      badge: accounts.length
    },
    {
      href: "/contacts",
      label: "Contacts", 
      icon: <Users className="h-5 w-5" />,
      badge: contacts.length
    },
    {
      href: "/opportunities",
      label: "Opportunities",
      icon: <Target className="h-5 w-5" />,
      badge: activeOpportunities.length
    },
    {
      href: "/quotes",
      label: "Quotes",
      icon: <FileText className="h-5 w-5" />
    },
    {
      href: "/vendors",
      label: "Vendors",
      icon: <Truck className="h-5 w-5" />
    },
    {
      href: "/contractors",
      label: "Contractors",
      icon: <HardHat className="h-5 w-5" />
    },
    {
      href: "/suppliers",
      label: "Suppliers",
      icon: <Package className="h-5 w-5" />
    },
    {
      href: "/products",
      label: "Products",
      icon: <Package className="h-5 w-5" />
    },
    {
      href: "/contracts",
      label: "Contracts",
      icon: <FileText className="h-5 w-5" />
    },
    {
      href: "/admin",
      label: "Admin",
      icon: <Settings className="h-5 w-5" />,
      adminOnly: true
    }
  ];
  
  const filteredItems = navigationItems.filter(item => 
    !item.adminOnly || (item.adminOnly && user?.role === 'admin')
  );
  
  const isActive = (href: string) => {
    if (href === "/") return location === "/";
    return location.startsWith(href);
  };
  
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="lg:hidden text-edg-grey hover:text-edg-black"
          data-testid="button-mobile-menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-80 p-0">
        <SheetHeader className="p-6 pb-4">
          <SheetTitle className="text-left">Navigation Menu</SheetTitle>
        </SheetHeader>
        
        <ScrollArea className="h-full px-6 pb-6">
          {/* Quick Actions */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-600 mb-3">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="justify-start gap-2"
                onClick={() => setOpen(false)}
                data-testid="button-mobile-search"
              >
                <Search className="h-4 w-4" />
                Search
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="justify-start gap-2"
                onClick={() => setOpen(false)}
                data-testid="button-mobile-notifications"
              >
                <Bell className="h-4 w-4" />
                Alerts
              </Button>
            </div>
          </div>
          
          <Separator className="mb-6" />
          
          {/* Navigation Items */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-gray-600 mb-3">Pages</h3>
            {filteredItems.map((item) => (
              <Link key={item.href} href={item.href}>
                <Button
                  variant={isActive(item.href) ? "default" : "ghost"}
                  className="w-full justify-start gap-3 h-11"
                  onClick={() => setOpen(false)}
                  data-testid={`link-mobile-${item.label.toLowerCase()}`}
                >
                  {item.icon}
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <Badge 
                      variant={isActive(item.href) ? "secondary" : "outline"} 
                      className="ml-auto"
                    >
                      {item.badge}
                    </Badge>
                  )}
                </Button>
              </Link>
            ))}
          </div>
          
          <Separator className="my-6" />
          
          {/* User Info */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-600">Account</h3>
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <div className="h-8 w-8 bg-edg-teal text-edg-black rounded-full flex items-center justify-center text-sm font-medium">
                {user?.firstName?.[0]}{user?.lastName?.[0] || user?.username?.[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user?.username}
                </p>
                {user?.email && (
                  <p className="text-xs text-gray-500 truncate">{user.email}</p>
                )}
              </div>
            </div>
          </div>
          
          {/* System Stats */}
          <div className="mt-6 space-y-3">
            <h3 className="text-sm font-medium text-gray-600">System Overview</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-blue-50 rounded-lg text-center">
                <div className="text-lg font-bold text-blue-600">{accounts.length}</div>
                <div className="text-xs text-blue-600">Accounts</div>
              </div>
              <div className="p-3 bg-green-50 rounded-lg text-center">
                <div className="text-lg font-bold text-green-600">{contacts.length}</div>
                <div className="text-xs text-green-600">Contacts</div>
              </div>
              <div className="p-3 bg-purple-50 rounded-lg text-center">
                <div className="text-lg font-bold text-purple-600">{opportunities.length}</div>
                <div className="text-xs text-purple-600">Opportunities</div>
              </div>
              <div className="p-3 bg-orange-50 rounded-lg text-center">
                <div className="text-lg font-bold text-orange-600">{activeOpportunities.length}</div>
                <div className="text-xs text-orange-600">Active</div>
              </div>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

export default MobileResponsiveNav;