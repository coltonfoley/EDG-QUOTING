import { LogOut, CloudRain } from "lucide-react";
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
import { cn } from "@/lib/utils";

export function AppHeader() {
  const [location] = useLocation();
  const { user, logoutMutation } = useAuth();
  const showBanner = location === "/";
  const useLeadLayout = location.startsWith("/leads");
  const navItems = [
    { href: "/", label: "Home", active: location === "/" },
    { href: "/leads", label: "Leads", active: location.startsWith("/leads") },
    { href: "/accounts", label: "Clients", active: location.startsWith("/accounts") },
    { href: "/quotes", label: "Quotes", active: location.startsWith("/quotes") },
    { href: "/pipeline", label: "Pipeline", active: location === "/pipeline" },
    { href: "/products", label: "Products", active: location.startsWith("/products") },
    ...(user?.role === "admin" ? [{ href: "/admin", label: "Admin", active: location.startsWith("/admin") }] : []),
  ];

  const handleLogout = () => {
    logoutMutation.mutate();
  };
  
  return (
    <>
      {showBanner && (
        <div className="bg-black text-edg-brand-teal px-4 py-2">
          <div className="max-w-7xl mx-auto flex items-center justify-center gap-2 text-sm font-medium">
            <CloudRain className="h-4 w-4" />
            <span>Turn quotes into contracts.</span>
          </div>
        </div>
      )}
      <header className="bg-card shadow-sm border-b border-border">
      <div className={cn(
        "mx-auto sm:px-6 lg:px-8",
        useLeadLayout ? "max-w-[1450px] px-3" : "max-w-7xl px-4",
      )}>
        <div className="flex justify-between items-center h-16">
          <div className={cn(
            "flex items-center sm:space-x-8",
            useLeadLayout ? "min-w-0 space-x-4" : "space-x-8",
          )}>
            <div className="flex-shrink-0 flex items-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 820 160"
                className={cn(
                  "sm:h-16 sm:w-auto",
                  useLeadLayout ? "h-10 w-36 sm:mr-3" : "mr-2 h-12 w-48 sm:mr-3",
                )}
                role="img"
                aria-label="EDG Rainmaker — primary logo"
              >
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
                  <text x="0" y="56" fontSize="62" fontWeight="800" className="fill-[#0b1115] dark:fill-white"
                        fontFamily="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif">Rainmaker</text>
                  <text x="2" y="84" fontSize="16" fontWeight="600" className="fill-[#6b7785] dark:fill-[#aab4c0]"
                        fontFamily="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
                        letterSpacing=".22em" style={{textTransform: 'uppercase'}}>by EDG</text>
                </g>
              </svg>
            </div>
            <nav className="hidden xl:flex space-x-6" aria-label="Primary navigation">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "text-sm font-medium transition-colors hover:text-edg-teal",
                    item.active ? "border-b-2 border-edg-teal pb-4 text-edg-teal" : "text-edg-grey",
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className={cn(
            "flex items-center sm:space-x-4",
            useLeadLayout ? "space-x-1" : "space-x-4",
          )}>
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className={cn(
                    "flex items-center space-x-2 hover:bg-muted",
                    useLeadLayout ? "px-2 sm:px-4" : undefined,
                  )}
                  aria-label="Open user menu"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-edg-teal text-white font-medium text-xs">
                      {user?.firstName?.[0]}{user?.lastName?.[0] || user?.username?.[0]}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:inline text-sm font-medium text-edg-black">
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
                <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
      <nav className="xl:hidden overflow-x-auto border-t border-border px-4" aria-label="Mobile primary navigation">
        <div className="flex min-w-max gap-5">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "py-3 text-sm font-medium whitespace-nowrap transition-colors hover:text-edg-teal",
                item.active ? "border-b-2 border-edg-teal text-edg-teal" : "text-edg-grey",
              )}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </header>
    </>
  );
}
