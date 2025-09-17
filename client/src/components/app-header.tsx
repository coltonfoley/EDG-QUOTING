import { Bell, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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

export function AppHeader() {
  const [location] = useLocation();
  const { user, logoutMutation } = useAuth();

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
            <nav className="hidden md:flex space-x-6">
              <Link href="/" className={`text-sm font-medium transition-colors hover:text-edg-teal ${
                location === '/' 
                  ? 'text-edg-teal border-b-2 border-edg-teal pb-4' 
                  : 'text-edg-grey'
              }`}>
                Home
              </Link>
              <Link href="/quotes" className={`text-sm font-medium transition-colors hover:text-edg-teal ${
                location.startsWith('/quotes')
                  ? 'text-edg-teal border-b-2 border-edg-teal pb-4' 
                  : 'text-edg-grey'
              }`}>
                Quotes
              </Link>
              <Link href="/products" className={`text-sm font-medium transition-colors hover:text-edg-teal ${
                location.startsWith('/products') 
                  ? 'text-edg-teal border-b-2 border-edg-teal pb-4' 
                  : 'text-edg-grey'
              }`}>
                Products
              </Link>
              <Link href="/leads" className={`text-sm font-medium transition-colors hover:text-edg-teal ${
                location.startsWith('/leads') 
                  ? 'text-edg-teal border-b-2 border-edg-teal pb-4' 
                  : 'text-edg-grey'
              }`}>
                Leads
              </Link>
              <Link href="/contracts" className={`text-sm font-medium transition-colors hover:text-edg-teal ${
                location.startsWith('/contracts') 
                  ? 'text-edg-teal border-b-2 border-edg-teal pb-4' 
                  : 'text-edg-grey'
              }`}>
                Contracts
              </Link>
              {user?.role === 'admin' && (
                <Link href="/admin" className={`text-sm font-medium transition-colors hover:text-edg-teal ${
                  location.startsWith('/admin') 
                    ? 'text-edg-teal border-b-2 border-edg-teal pb-4' 
                    : 'text-edg-grey'
                }`}>
                  Admin
                </Link>
              )}
            </nav>
          </div>
          <div className="flex items-center space-x-4">
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


