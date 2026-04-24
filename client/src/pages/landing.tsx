import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, ClipboardList, FileText, Users } from "lucide-react";
import logoPath from "@assets/my-logo.png_1753970984943.jpg";

export default function Landing() {
  const handleLogin = () => {
    window.location.href = "/auth";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <div className="flex items-center justify-center mb-8">
            <img src={logoPath} alt="Rainmaker, by EDG" className="h-16 mr-6" />
          </div>
          <h2 className="text-2xl text-foreground mb-4">Quote Management System</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
            Professional quote creation and management platform for construction projects. 
            Streamline your quoting process with our comprehensive business tools.
          </p>
          <Button 
            onClick={handleLogin}
            size="lg"
            className="bg-edg-teal hover:bg-edg-dark-teal text-white px-8 py-3 text-lg"
          >
            Team Login
          </Button>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
          <Card className="text-center">
            <CardHeader>
              <ClipboardList className="h-8 w-8 text-teal-600 mx-auto mb-2" />
              <CardTitle className="text-lg">Quote Creation</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Create professional quotes with detailed line items, pricing, and project information.
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="text-center">
            <CardHeader>
              <Users className="h-8 w-8 text-teal-600 mx-auto mb-2" />
              <CardTitle className="text-lg">Customer Management</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Manage customer information and track quote history across all customers.
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="text-center">
            <CardHeader>
              <Building2 className="h-8 w-8 text-teal-600 mx-auto mb-2" />
              <CardTitle className="text-lg">Product Catalog</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Maintain a catalog of products and services with pricing and markup settings.
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="text-center">
            <CardHeader>
              <FileText className="h-8 w-8 text-teal-600 mx-auto mb-2" />
              <CardTitle className="text-lg">PDF Generation</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Generate professional PDF quotes with company branding and terms.
              </CardDescription>
            </CardContent>
          </Card>
        </div>

        <div className="mt-16 text-center">
          <p className="text-muted-foreground">
            Secure team access powered by Replit authentication
          </p>
        </div>
      </div>
    </div>
  );
}
