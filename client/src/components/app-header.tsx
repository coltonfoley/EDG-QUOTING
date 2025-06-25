import { HardHat, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Link, useLocation } from "wouter";

export function AppHeader() {
  const [location] = useLocation();
  
  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-8">
            <div className="flex-shrink-0 flex items-center">
              <HardHat className="text-construction-blue text-2xl mr-3 h-8 w-8" />
              <h1 className="text-xl font-bold text-charcoal">ProBuild Estimator</h1>
            </div>
            <nav className="hidden md:flex space-x-6">
              <Link href="/quotes" className={`text-sm font-medium transition-colors hover:text-construction-blue ${
                location.startsWith('/quotes') || location === '/' 
                  ? 'text-construction-blue border-b-2 border-construction-blue pb-4' 
                  : 'text-accent-grey'
              }`}>
                Quotes
              </Link>
              <Link href="/products" className={`text-sm font-medium transition-colors hover:text-construction-blue ${
                location.startsWith('/products') 
                  ? 'text-construction-blue border-b-2 border-construction-blue pb-4' 
                  : 'text-accent-grey'
              }`}>
                Products
              </Link>
            </nav>
          </div>
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="icon" className="text-accent-grey hover:text-charcoal">
              <Bell className="h-5 w-5" />
            </Button>
            <div className="flex items-center space-x-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-4.0.3&w=100&h=100&fit=crop&crop=face" alt="User avatar" />
                <AvatarFallback>JS</AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium text-charcoal">John Smith</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
