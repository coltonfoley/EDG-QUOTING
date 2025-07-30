import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, ClipboardList, FileText, Users } from "lucide-react";
import { Link } from "wouter";
import { AppHeader } from "@/components/app-header";

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader />

      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-edg-black mb-2">Dashboard</h2>
          <p className="text-edg-grey">Welcome back! Manage your quotes and grow your business.</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <Link href="/quotes">
            <Card className="cursor-pointer hover:shadow-lg transition-shadow">
              <CardHeader className="text-center">
                <ClipboardList className="h-12 w-12 text-edg-teal mx-auto mb-4" />
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
                <Building2 className="h-12 w-12 text-edg-teal mx-auto mb-4" />
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
                <FileText className="h-12 w-12 text-edg-teal mx-auto mb-4" />
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
                <Users className="h-5 w-5 text-edg-teal" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-edg-grey">
                Your recent quotes and activities will appear here.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-edg-teal" />
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
      </main>
    </div>
  );
}