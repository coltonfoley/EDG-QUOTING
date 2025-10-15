import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, AlertCircle, FileSpreadsheet, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PricingExample {
  widthMin: number;
  widthMax: number;
  heightMin: number;
  heightMax: number;
  retailPrice: number;
}

const exampleData: PricingExample[] = [
  { widthMin: 4, widthMax: 5, heightMin: 7, heightMax: 8, retailPrice: 4200 },
  { widthMin: 4, widthMax: 5, heightMin: 8, heightMax: 9, retailPrice: 4318 },
  { widthMin: 5, widthMax: 6, heightMin: 7, heightMax: 8, retailPrice: 4352 },
  { widthMin: 5, widthMax: 6, heightMin: 8, heightMax: 9, retailPrice: 4475 },
];

export function ScreenPricingParser() {
  const { toast } = useToast();

  const downloadTemplate = () => {
    const headers = ['WidthMin', 'WidthMax', 'HeightMin', 'HeightMax', 'RetailPrice'];
    const rows = exampleData.map(entry => [
      entry.widthMin,
      entry.widthMax,
      entry.heightMin,
      entry.heightMax,
      entry.retailPrice
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'screen_pricing_template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Template Downloaded",
      description: "Use this as a reference to format your pricing data",
    });
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          Screen Pricing Converter
        </CardTitle>
        <CardDescription>
          Convert your manufacturer's PDF pricing matrix to CSV format for bulk import
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>How to convert your PDF pricing matrix:</strong>
            <ol className="mt-2 space-y-2 text-sm list-decimal list-inside">
              <li>Open your manufacturer's PDF pricing sheet</li>
              <li>Create a new spreadsheet (Excel, Google Sheets, etc.)</li>
              <li>Add columns: <code className="bg-gray-100 px-1 rounded">WidthMin, WidthMax, HeightMin, HeightMax, RetailPrice</code></li>
              <li>For each price in the PDF matrix:
                <ul className="ml-6 mt-1 space-y-1 list-disc list-inside text-xs">
                  <li>WidthMin = row width value (e.g., 4)</li>
                  <li>WidthMax = row width + 1 (e.g., 5)</li>
                  <li>HeightMin = column height value (e.g., 7)</li>
                  <li>HeightMax = column height + 1 (e.g., 8)</li>
                  <li>RetailPrice = price from that cell (e.g., 4200)</li>
                </ul>
              </li>
              <li>Export as CSV and use in "Manage Pricing" for your product</li>
            </ol>
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Example Format</h3>
            <Button 
              onClick={downloadTemplate} 
              size="sm" 
              className="gap-2"
              data-testid="button-download-template"
            >
              <Download className="h-4 w-4" />
              Download Template
            </Button>
          </div>
          
          <div className="border rounded-md overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Width Min</TableHead>
                  <TableHead>Width Max</TableHead>
                  <TableHead>Height Min</TableHead>
                  <TableHead>Height Max</TableHead>
                  <TableHead>Retail Price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exampleData.map((entry, index) => (
                  <TableRow key={index}>
                    <TableCell>{entry.widthMin}'</TableCell>
                    <TableCell>{entry.widthMax}'</TableCell>
                    <TableCell>{entry.heightMin}'</TableCell>
                    <TableCell>{entry.heightMax}'</TableCell>
                    <TableCell>${entry.retailPrice.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <Alert className="border-green-200 bg-green-50">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            <strong>Example Conversion:</strong> If your PDF shows Width 4' × Height 7' = $4,200, create a row with:
            <br />
            <code className="bg-white px-2 py-1 rounded mt-1 inline-block">4, 5, 7, 8, 4200</code>
          </AlertDescription>
        </Alert>

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-sm">
            <strong>Tip:</strong> Download the template above to see the exact format needed. You can copy-paste your data following this structure, then save as CSV.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
