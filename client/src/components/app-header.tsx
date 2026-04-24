import { Bell, LogOut, CloudRain, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { ThemeToggle } from "@/components/theme-toggle";

export function AppHeader() {
  const [location] = useLocation();
  const { user, logoutMutation } = useAuth();

  const handleLogout = () => {
    logoutMutation.mutate();
  };
  
  return (
    <>
      <div className="bg-black text-edg-brand-teal px-4 py-2">
        <div className="max-w-7xl mx-auto flex items-center justify-center gap-2 text-sm font-medium">
          <CloudRain className="h-4 w-4" />
          <span>Turn quotes into contracts - Make it rain! 💧</span>
        </div>
      </div>
      <header className="bg-card shadow-sm border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-8">
            <div className="flex-shrink-0 flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 820 160" className="h-16 mr-3" role="img" aria-label="EDG Rainmaker — primary logo (light)">
                <defs>
                  <linearGradient id="tealGrad1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00bfa5"/>
                    <stop offset="100%" stopColor="#00897b"/>
                  </linearGradient>
                  <clipPath id="dropClip1">
                    <path d="M70 20 C70 20, 34 66, 34 94 C34 118, 51 134, 70 134 C89 134, 106 118, 106 94 C106 66, 70 20, 70 20 Z"/>
                  </clipPath>
                </defs>

                <path d="M70 20 C70 20, 34 66, 34 94 C34 118, 51 134, 70 134 C89 134, 106 118, 106 94 C106 66, 70 20, 70 20 Z" fill="url(#tealGrad1)"/>
                <g clipPath="url(#dropClip1)" transform="rotate(-18 70 77)">
                  <g opacity=".18">
                    <rect x="10" y="24" width="160" height="10" fill="#ffffff"/>
                    <rect x="10" y="44" width="160" height="10" fill="#ffffff"/>
                    <rect x="10" y="64" width="160" height="10" fill="#ffffff"/>
                    <rect x="10" y="84" width="160" height="10" fill="#ffffff"/>
                    <rect x="10" y="104" width="160" height="10" fill="#ffffff"/>
                  </g>
                </g>

                <g transform="translate(136, 40)">
                  <text x="0" y="56" fontSize="62" fontWeight="800" fill="#0b1115"
                        fontFamily="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif">Rainmaker</text>
                  <text x="2" y="84" fontSize="16" fontWeight="600" fill="#6b7785"
                        fontFamily="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
                        letterSpacing=".22em" style={{textTransform: 'uppercase'}}>by EDG</text>
                </g>
              </svg>
            </div>
            <nav className="hidden md:flex space-x-6">
              <Link href="/" className={`text-sm font-medium transition-colors hover:text-edg-teal ${
                location === '/' 
                  ? 'text-edg-teal border-b-2 border-edg-teal pb-4' 
                  : 'text-edg-grey'
              }`}>
                Home
              </Link>
              <Link href="/accounts" className={`text-sm font-medium transition-colors hover:text-edg-teal ${
                location.startsWith('/accounts')
                  ? 'text-edg-teal border-b-2 border-edg-teal pb-4' 
                  : 'text-edg-grey'
              }`}>
                Accounts
              </Link>
              <Link href="/quotes" className={`text-sm font-medium transition-colors hover:text-edg-teal ${
                location.startsWith('/quotes')
                  ? 'text-edg-teal border-b-2 border-edg-teal pb-4' 
                  : 'text-edg-grey'
              }`}>
                Quotes
              </Link>
              <Link href="/pipeline" className={`text-sm font-medium transition-colors hover:text-edg-teal ${
                location === '/pipeline'
                  ? 'text-edg-teal border-b-2 border-edg-teal pb-4' 
                  : 'text-edg-grey'
              }`}>
                Pipeline
              </Link>
              <Link href="/products" className={`text-sm font-medium transition-colors hover:text-edg-teal ${
                location.startsWith('/products') 
                  ? 'text-edg-teal border-b-2 border-edg-teal pb-4' 
                  : 'text-edg-grey'
              }`}>
                Products
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
            <ThemeToggle />
            <Button variant="ghost" size="icon" className="text-edg-grey hover:text-edg-black">
              <Bell className="h-5 w-5" />
            </Button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center space-x-2 hover:bg-muted">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-edg-teal text-white font-medium text-xs">
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
                      <p className="text-xs leading-none text-muted-foreground">
                        {user.email}
                      </p>
                    )}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <Link href="/change-password">
                  <DropdownMenuItem className="cursor-pointer">
                    <KeyRound className="mr-2 h-4 w-4" />
                    <span>Change Password</span>
                  </DropdownMenuItem>
                </Link>
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
    </>
  );
}
