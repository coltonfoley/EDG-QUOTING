import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, ClipboardList, FileText, Users, LogOut } from "lucide-react";
import { Link } from "wouter";

export default function Home() {
  const { user, logoutMutation } = useAuth();

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center">
            <Building2 className="h-8 w-8 text-teal-600 mr-3" />
            <h1 className="text-2xl font-bold text-slate-900">EDG Patio & Shade</h1>
          </div>
          <div className="flex items-center gap-4">
            {user && (
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-teal-600 flex items-center justify-center text-white text-sm font-medium">
                  {user.firstName?.[0] || user.username?.[0] || 'U'}
                </div>
                <span className="text-slate-700">
                  {user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user.username}
                </span>
              </div>
            )}
            <Button 
              onClick={handleLogout}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-slate-900 mb-2">Welcome back!</h2>
          <p className="text-slate-600">Manage your quotes and grow your business.</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <Link href="/quotes">
            <Card className="cursor-pointer hover:shadow-lg transition-shadow">
              <CardHeader className="text-center">
                <ClipboardList className="h-12 w-12 text-teal-600 mx-auto mb-4" />
                <CardTitle className="text-xl">Quotes</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-center">
                  View, create, and manage all your project quotes in one place.
                </CardDescription>
              </CardContent>
            </Card>
          </Link>

          <Link href="/products">
            <Card className="cursor-pointer hover:shadow-lg transition-shadow">
              <CardHeader className="text-center">
                <Building2 className="h-12 w-12 text-teal-600 mx-auto mb-4" />
                <CardTitle className="text-xl">Products</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-center">
                  Manage your catalog of products and services with pricing.
                </CardDescription>
              </CardContent>
            </Card>
          </Link>

          <Link href="/quote-builder">
            <Card className="cursor-pointer hover:shadow-lg transition-shadow">
              <CardHeader className="text-center">
                <FileText className="h-12 w-12 text-teal-600 mx-auto mb-4" />
                <CardTitle className="text-xl">New Quote</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-center">
                  Create a new quote for a customer project.
                </CardDescription>
              </CardContent>
            </Card>
          </Link>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-teal-600" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-600">
                Your recent quotes and activities will appear here.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-teal-600" />
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link href="/quote-builder">
                <Button variant="outline" className="w-full justify-start">
                  Create New Quote
                </Button>
              </Link>
              <Link href="/products">
                <Button variant="outline" className="w-full justify-start">
                  Add Product
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}