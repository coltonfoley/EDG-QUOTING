import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ScreenPricingParser } from "@/components/screen-pricing-parser";
import { CheckCircle, Circle, FileSpreadsheet, Settings, Upload } from "lucide-react";
import type { Product } from "@shared/schema";

const SCREEN_PRODUCTS = [
  {
    id: "commercial-vinyl",
    name: "Commercial/Residential Screen - Vinyl Windows (Gaposa Motor)",
    manufacturer: "Diamond Screens",
    description: "MTV Commercial/Residential System with Vinyl Windows",
    pdfFileName: "Commercial Residential System with Vinyl Windows with Gaposa Motor_1760547199040.pdf",
    minWidth: 4,
    maxWidth: 26,
    minHeight: 7,
    maxHeight: 18,
  },
  {
    id: "residential-insect",
    name: "Residential Screen - Insect Mesh (Gaposa Motor)",
    manufacturer: "Diamond Screens",
    description: "MTD Residential System with Gaposa Motor (Insect Mesh)",
    pdfFileName: "Residential System With Gaposa Motor Insect Screen_1760547199041.pdf",
    minWidth: 4,
    maxWidth: 27,
    minHeight: 7,
    maxHeight: 20,
  },
  {
    id: "residential-solar",
    name: "Residential Screen - Solar (Gaposa Motor)",
    manufacturer: "Diamond Screens",
    description: "MTD Residential System with Gaposa Motor (Solar Screen)",
    pdfFileName: "Residential System With Gaposa Motor Solar Screen_1760547199041.pdf",
    minWidth: 4,
    maxWidth: 30,
    minHeight: 7,
    maxHeight: 20,
  },
];

export default function ScreenSetup() {
  const [activeTab, setActiveTab] = useState("commercial-vinyl");

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  // Check which screen products already exist
  const existingScreenProducts = SCREEN_PRODUCTS.map(screen => {
    const existing = products.find(p => 
      p.name === screen.name && p.manufacturer === screen.manufacturer
    );
    return {
      ...screen,
      exists: !!existing,
      productId: existing?.id,
    };
  });

  return (
    <div className="container mx-auto p-6 max-w-7xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Screen Product Setup</h1>
        <p className="text-muted-foreground">
          Set up your Diamond Screens products with automated pricing import from manufacturer PDFs
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {existingScreenProducts.map((screen) => (
          <Card key={screen.id} className="relative">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-base">{screen.name}</CardTitle>
                  <CardDescription className="text-xs">
                    {screen.minWidth}' - {screen.maxWidth}' × {screen.minHeight}' - {screen.maxHeight}'
                  </CardDescription>
                </div>
                {screen.exists ? (
                  <Badge variant="default" className="bg-green-600 gap-1">
                    <CheckCircle className="h-3 w-3" />
                    Created
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="gap-1">
                    <Circle className="h-3 w-3" />
                    Not Created
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{screen.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Setup Workflow
          </CardTitle>
          <CardDescription>
            Follow these steps to set up your screen products with accurate pricing
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="commercial-vinyl" className="gap-2">
                <FileSpreadsheet className="h-4 w-4" />
                Commercial Vinyl
              </TabsTrigger>
              <TabsTrigger value="residential-insect" className="gap-2">
                <FileSpreadsheet className="h-4 w-4" />
                Residential Insect
              </TabsTrigger>
              <TabsTrigger value="residential-solar" className="gap-2">
                <FileSpreadsheet className="h-4 w-4" />
                Residential Solar
              </TabsTrigger>
            </TabsList>

            {SCREEN_PRODUCTS.map((screen) => {
              const screenStatus = existingScreenProducts.find(s => s.id === screen.id);
              
              return (
                <TabsContent key={screen.id} value={screen.id} className="space-y-6">
                  <div className="space-y-4">
                    <Alert>
                      <Upload className="h-4 w-4" />
                      <AlertDescription>
                        <strong>Setup Instructions for {screen.name}</strong>
                        <ol className="mt-2 space-y-2 text-sm list-decimal list-inside">
                          <li>
                            <strong>Convert PDF to CSV:</strong> Use the converter below with your manufacturer's PDF ({screen.pdfFileName}) to create a CSV pricing file
                          </li>
                          {!screenStatus?.exists ? (
                            <li>
                              <strong>Create Product:</strong> Go to Products page and create a new configurable product with:
                              <ul className="ml-6 mt-1 space-y-1 list-disc list-inside text-xs text-muted-foreground">
                                <li>Name: {screen.name}</li>
                                <li>Manufacturer: {screen.manufacturer}</li>
                                <li>Product Type: Configurable</li>
                                <li>Min/Max Width: {screen.minWidth}' - {screen.maxWidth}'</li>
                                <li>Min/Max Height: {screen.minHeight}' - {screen.maxHeight}'</li>
                                <li>Dimension Label 1: Width</li>
                                <li>Dimension Label 2: Height</li>
                              </ul>
                            </li>
                          ) : (
                            <li className="text-green-600">
                              <strong>Product Created ✓</strong> Product already exists (ID: {screenStatus.productId})
                            </li>
                          )}
                          <li>
                            <strong>Upload Pricing:</strong> In the product, click "Manage Pricing" and upload your CSV file
                          </li>
                          <li>
                            <strong>Test Configuration:</strong> Create a test quote and add this screen to verify pricing calculation
                          </li>
                        </ol>
                      </AlertDescription>
                    </Alert>

                    <ScreenPricingParser />

                    {!screenStatus?.exists && (
                      <Alert className="border-blue-200 bg-blue-50">
                        <AlertDescription className="text-blue-800">
                          <strong>Next Step:</strong> After converting your PDF pricing to CSV format, go to the{" "}
                          <a href="/products" className="underline font-semibold">Products page</a>{" "}
                          to create this screen product with the specifications above.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                </TabsContent>
              );
            })}
          </Tabs>
        </CardContent>
      </Card>

      <Alert>
        <CheckCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>Pro Tip:</strong> After setting up all products, test the configuration by creating a quote
          and adding a screen product. The dimension dialog will appear, allowing you to enter width × height,
          and the system will automatically calculate the price from your uploaded pricing tables.
        </AlertDescription>
      </Alert>
    </div>
  );
}
