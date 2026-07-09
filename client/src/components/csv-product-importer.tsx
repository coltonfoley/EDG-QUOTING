import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle, ArrowRight, Download, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { readSpreadsheetRows, spreadsheetRowsToRecords, spreadsheetRowsToCsv } from "@shared/spreadsheet";

interface CSVRow {
  [key: string]: string | number;
}

interface ColumnMapping {
  csvColumn: string;
  productField: 'name' | 'manufacturer' | 'category' | 'retailPrice' | 'cost' | 'unit' | 'description' | 'skip';
}

interface PreviewProduct {
  name: string;
  manufacturer?: string;
  category?: string;
  unit?: string;
  description?: string;
  retailPrice: number;
  cost: number;
  manufacturerDiscount: number;
	  supplierDiscountPercent: number;
}

const PRODUCT_FIELDS = [
  { value: 'name', label: 'Product Name' },
  { value: 'manufacturer', label: 'Manufacturer' },
  { value: 'category', label: 'Category' },
	  { value: 'retailPrice', label: 'Manufacturer MSRP' },
	  { value: 'cost', label: 'EDG Cost' },
  { value: 'unit', label: 'Unit' },
  { value: 'description', label: 'Description' },
  { value: 'skip', label: 'Skip this column' },
];

export function CSVProductImporter() {
  const [file, setFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<CSVRow[]>([]);
  const [csvColumns, setCsvColumns] = useState<string[]>([]);
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  const [previewData, setPreviewData] = useState<PreviewProduct[]>([]);
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview'>('upload');
  const [errors, setErrors] = useState<string[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [importErrors, setImportErrors] = useState<string[]>([]);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const autoDetectMapping = (columns: string[]): ColumnMapping[] => {
    return columns.map(col => {
      const lowerCol = col.toLowerCase().trim();
      
      if (lowerCol.includes('desc') || lowerCol.includes('detail')) {
        return { csvColumn: col, productField: 'description' as const };
      }
      if (lowerCol.includes('name') || lowerCol.includes('product')) {
        return { csvColumn: col, productField: 'name' as const };
      }
      if (lowerCol.includes('manufacturer') || lowerCol.includes('brand') || lowerCol.includes('mfr')) {
        return { csvColumn: col, productField: 'manufacturer' as const };
      }
      if (lowerCol.includes('category') || lowerCol.includes('type')) {
        return { csvColumn: col, productField: 'category' as const };
      }
      if (lowerCol.includes('retail') || lowerCol.includes('dealer') || lowerCol.includes('msrp') || lowerCol.includes('list price')) {
        return { csvColumn: col, productField: 'retailPrice' as const };
      }
      if (lowerCol.includes('cost') || lowerCol.includes('your price') || lowerCol.includes('net')) {
        return { csvColumn: col, productField: 'cost' as const };
      }
      if (lowerCol.includes('unit') || lowerCol.includes('uom') || lowerCol === 'um') {
        return { csvColumn: col, productField: 'unit' as const };
      }
      
      return { csvColumn: col, productField: 'skip' as const };
    });
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setErrors([]);
    setImportErrors([]);
    setIsParsing(true);

    try {
      const buffer = await selectedFile.arrayBuffer();
      const format = selectedFile.name.toLowerCase().endsWith(".csv") ? "csv" : "excel";
      const rows = await readSpreadsheetRows(buffer, format);
      const jsonData = spreadsheetRowsToRecords(rows) as CSVRow[];

      if (jsonData.length === 0) {
        setErrors(["File appears to be empty"]);
        return;
      }

      const columns = Object.keys(jsonData[0]);
      const mappings = autoDetectMapping(columns);

      setCsvData(jsonData);
      setCsvColumns(columns);
      setColumnMappings(mappings);
      setStep('mapping');

    } catch (error) {
      setErrors(["Failed to parse file. Please ensure it's a valid CSV or Excel file."]);
    } finally {
      setIsParsing(false);
    }
  };

  const updateMapping = (csvColumn: string, productField: string) => {
    setColumnMappings(prev => 
      prev.map(mapping => 
        mapping.csvColumn === csvColumn 
          ? { ...mapping, productField: productField as ColumnMapping['productField'] }
          : mapping
      )
    );
  };

  const parsePrice = (priceStr: string): number | null => {
    // Remove currency symbols, commas, and spaces
    const cleaned = priceStr.trim().replace(/[$,\s]/g, '');
    
    // Check if it's empty or just a dash/hyphen
    if (!cleaned || cleaned === '-' || cleaned === '–' || cleaned === '—') {
      return null;
    }
    
    const value = parseFloat(cleaned);
    return isNaN(value) ? null : value;
  };

  const generatePreview = () => {
    const validationErrors: string[] = [];
    const preview: PreviewProduct[] = [];
    let skippedRows = 0;

    const nameMapping = columnMappings.find(m => m.productField === 'name');
    const manufacturerMapping = columnMappings.find(m => m.productField === 'manufacturer');
    const categoryMapping = columnMappings.find(m => m.productField === 'category');
    const retailPriceMapping = columnMappings.find(m => m.productField === 'retailPrice');
    const costMapping = columnMappings.find(m => m.productField === 'cost');
    const unitMapping = columnMappings.find(m => m.productField === 'unit');
    const descMapping = columnMappings.find(m => m.productField === 'description');

    if (!nameMapping) {
      validationErrors.push("Product Name is required - please map a column to Product Name");
    }
    if (!retailPriceMapping) {
	      validationErrors.push("Manufacturer MSRP is required - please map a column to Manufacturer MSRP");
    }

    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    csvData.forEach((row, index) => {
      const rowNum = index + 1;
      const name = nameMapping ? String(row[nameMapping.csvColumn] || '').trim() : '';
      
      // Only include mapped fields - undefined if not mapped
      const manufacturer = manufacturerMapping ? String(row[manufacturerMapping.csvColumn] || '').trim() || undefined : undefined;
      const category = categoryMapping ? String(row[categoryMapping.csvColumn] || '').trim() || undefined : undefined;
      const unit = unitMapping ? String(row[unitMapping.csvColumn] || '').trim() || undefined : undefined;
      const description = descMapping ? String(row[descMapping.csvColumn] || '').trim() || undefined : undefined;
      
      const retailPriceStr = retailPriceMapping ? String(row[retailPriceMapping.csvColumn] || '') : '';
      const costStr = costMapping ? String(row[costMapping.csvColumn] || '') : '';

      if (!name) {
        skippedRows++;
        return; // Skip rows without names
      }

      const retailPrice = parsePrice(retailPriceStr);
	      const cost = costMapping ? parsePrice(costStr) : retailPrice;

      // Skip rows with no valid retail price
      if (retailPrice === null || retailPrice <= 0) {
        skippedRows++;
        return;
      }

	      // If cost is not mapped or invalid, default EDG cost to MSRP.
	      const actualCost = cost !== null && cost >= 0 ? cost : retailPrice;

      const manufacturerDiscount = retailPrice - actualCost;
	      const supplierDiscountPercent = retailPrice > 0 ? ((manufacturerDiscount / retailPrice) * 100) : 0;

      preview.push({
        name,
        manufacturer,
        category,
        unit,
        description,
        retailPrice,
        cost: actualCost,
        manufacturerDiscount,
	        supplierDiscountPercent,
      });
    });

    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    setPreviewData(preview);
    setErrors([]);
    
    // Show info about skipped rows if any
    if (skippedRows > 0) {
      toast({
        title: "Rows Skipped",
        description: `${skippedRows} rows skipped (missing name or invalid price)`,
      });
    }
    
    setStep('preview');
  };

  const importMutation = useMutation({
    mutationFn: async (products: PreviewProduct[]) => {
      const response = await apiRequest("POST", "/api/admin/import-csv-products", {
        products
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Import Successful",
        description: `Created: ${data.created}, Updated: ${data.updated}`,
      });
      if (data.errors && data.errors.length > 0) {
        setImportErrors(data.errors);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      
      if (!data.errors || data.errors.length === 0) {
        setFile(null);
        setCsvData([]);
        setCsvColumns([]);
        setColumnMappings([]);
        setPreviewData([]);
        setStep('upload');
        setErrors([]);
        setImportErrors([]);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Import Failed",
        description: error.message || "Failed to import products",
        variant: "destructive",
      });
    },
  });

  const handleImport = () => {
    importMutation.mutate(previewData);
  };

  const resetImporter = () => {
    setFile(null);
    setCsvData([]);
    setCsvColumns([]);
    setColumnMappings([]);
    setPreviewData([]);
    setStep('upload');
    setErrors([]);
  };

  const downloadSampleCSV = async () => {
    const sampleData = [
	      { 'Product Name': 'Example Product 1', 'Category': 'Materials', 'Manufacturer MSRP': '100.00', 'EDG Cost': '70.00', 'Unit': 'each' },
	      { 'Product Name': 'Example Product 2', 'Category': 'Labor', 'Manufacturer MSRP': '150.00', 'EDG Cost': '100.00', 'Unit': 'hour' },
    ];

    const headers = Object.keys(sampleData[0]);
    const rows = [headers, ...sampleData.map((row) => headers.map((header) => row[header as keyof typeof row]))];
    const blob = new Blob([spreadsheetRowsToCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "sample_products.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          CSV Product Importer
        </CardTitle>
        <CardDescription>
          Import products from a CSV file with custom column mapping
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {step === 'upload' && (
          <div className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              {isParsing ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-12 w-12 text-gray-400 animate-spin" />
                  <h3 className="text-lg font-medium">Parsing file...</h3>
                  <p className="text-sm text-gray-500">Reading and analyzing your spreadsheet</p>
                </div>
              ) : (
                <>
                  <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                  <div className="space-y-2">
                    <h3 className="text-lg font-medium">Upload CSV File</h3>
                    <p className="text-sm text-gray-500">
                      CSV or Excel files with product information
                    </p>
                  </div>
                </>
              )}
              <Input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileChange}
                className="mt-4 max-w-xs mx-auto"
                disabled={isParsing}
                data-testid="input-csv-file"
              />
            </div>

            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={downloadSampleCSV}
                className="gap-2"
                data-testid="button-download-sample"
              >
                <Download className="h-4 w-4" />
                Download Sample CSV
              </Button>
            </div>

            {errors.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {errors.map((error, index) => (
                    <div key={index}>{error}</div>
                  ))}
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {step === 'mapping' && (
          <div className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Map your CSV columns to product fields. We've auto-detected likely matches, but you can adjust them below.
              </AlertDescription>
            </Alert>

            <div className="space-y-3">
              {columnMappings.map((mapping) => (
                <div key={mapping.csvColumn} className="flex items-center gap-4 p-3 border rounded-lg">
                  <div className="flex-1">
                    <div className="font-medium text-sm">{mapping.csvColumn}</div>
                    <div className="text-xs text-gray-500">CSV Column</div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-gray-400" />
                  <div className="flex-1">
                    <Select
                      value={mapping.productField}
                      onValueChange={(value) => updateMapping(mapping.csvColumn, value)}
                    >
                      <SelectTrigger data-testid={`select-mapping-${mapping.csvColumn}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRODUCT_FIELDS.map(field => (
                          <SelectItem key={field.value} value={field.value}>
                            {field.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
            </div>

            {errors.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {errors.map((error, index) => (
                    <div key={index}>{error}</div>
                  ))}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={resetImporter} data-testid="button-cancel-mapping">
                Cancel
              </Button>
              <Button onClick={generatePreview} className="bg-edg-black hover:bg-edg-grey text-white" data-testid="button-preview-data">
                Preview Data
              </Button>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4">
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                Found {previewData.length} valid products. Review below and click Import to add them to your catalog.
              </AlertDescription>
            </Alert>

            <div className="bg-gray-50 p-4 rounded-lg max-h-96 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-100">
                  <tr className="border-b">
                    <th className="text-left py-2 px-2">Name</th>
                    <th className="text-left py-2 px-2">Manufacturer</th>
                    <th className="text-left py-2 px-2">Category</th>
                    <th className="text-left py-2 px-2">Unit</th>
	                    <th className="text-right py-2 px-2">Manufacturer MSRP</th>
	                    <th className="text-right py-2 px-2">EDG Cost</th>
	                    <th className="text-right py-2 px-2">Supplier Discount</th>
	                    <th className="text-right py-2 px-2">Discount %</th>
                  </tr>
                </thead>
                <tbody>
                  {previewData.map((product, index) => (
                    <tr key={index} className="border-b" data-testid={`row-preview-${index}`}>
                      <td className="py-1 px-2">{product.name}</td>
                      <td className="py-1 px-2">{product.manufacturer || '-'}</td>
                      <td className="py-1 px-2">{product.category || '-'}</td>
                      <td className="py-1 px-2">{product.unit || '-'}</td>
                      <td className="py-1 px-2 text-right">${product.retailPrice.toFixed(2)}</td>
                      <td className="py-1 px-2 text-right text-green-600">${product.cost.toFixed(2)}</td>
                      <td className="py-1 px-2 text-right text-blue-600">${product.manufacturerDiscount.toFixed(2)}</td>
	                      <td className="py-1 px-2 text-right text-purple-600">{product.supplierDiscountPercent.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {importErrors.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="font-semibold mb-2">Import completed with {importErrors.length} error(s):</div>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    {importErrors.slice(0, 10).map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                    {importErrors.length > 10 && (
                      <li>... and {importErrors.length - 10} more</li>
                    )}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => { setStep('mapping'); setImportErrors([]); }} data-testid="button-back-to-mapping">
                Back to Mapping
              </Button>
              <Button 
                onClick={handleImport} 
                disabled={importMutation.isPending}
                className="bg-edg-black hover:bg-edg-grey text-white"
                data-testid="button-import-products"
              >
                {importMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Importing...
                  </>
                ) : `Import ${previewData.length} Products`}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
