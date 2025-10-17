import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle, ArrowRight, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";
import { apiRequest } from "@/lib/queryClient";

interface CSVRow {
  [key: string]: string | number;
}

interface ColumnMapping {
  csvColumn: string;
  productField: 'name' | 'category' | 'retailPrice' | 'unit' | 'description' | 'skip';
}

interface PreviewProduct {
  name: string;
  category?: string;
  unit?: string;
  description?: string;
  retailPrice: number;
}

const PRODUCT_FIELDS = [
  { value: 'name', label: 'Product Name' },
  { value: 'category', label: 'Category' },
  { value: 'retailPrice', label: 'Retail/Dealer Price' },
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
  const [manufacturer, setManufacturer] = useState<string>('');
  const [discountType, setDiscountType] = useState<'percentage' | 'dollar'>('percentage');
  const [discountValue, setDiscountValue] = useState<string>('0');

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const autoDetectMapping = (columns: string[]): ColumnMapping[] => {
    return columns.map(col => {
      const lowerCol = col.toLowerCase().trim();
      
      if (lowerCol.includes('name') || lowerCol.includes('product') || lowerCol.includes('description') && lowerCol.length < 15) {
        return { csvColumn: col, productField: 'name' };
      }
      if (lowerCol.includes('category') || lowerCol.includes('type')) {
        return { csvColumn: col, productField: 'category' };
      }
      if (lowerCol.includes('retail') || lowerCol.includes('dealer') || lowerCol.includes('msrp') || lowerCol.includes('list price') || lowerCol.includes('price')) {
        return { csvColumn: col, productField: 'retailPrice' };
      }
      if (lowerCol.includes('unit') || lowerCol.includes('uom') || lowerCol === 'um') {
        return { csvColumn: col, productField: 'unit' };
      }
      if (lowerCol.includes('desc') || lowerCol.includes('detail')) {
        return { csvColumn: col, productField: 'description' };
      }
      
      return { csvColumn: col, productField: 'skip' };
    });
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setErrors([]);

    try {
      const buffer = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(sheet) as CSVRow[];

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
    const categoryMapping = columnMappings.find(m => m.productField === 'category');
    const retailPriceMapping = columnMappings.find(m => m.productField === 'retailPrice');
    const unitMapping = columnMappings.find(m => m.productField === 'unit');
    const descMapping = columnMappings.find(m => m.productField === 'description');

    if (!nameMapping) {
      validationErrors.push("Product Name is required - please map a column to Product Name");
    }
    if (!retailPriceMapping) {
      validationErrors.push("Retail/Dealer Price is required - please map a column to Retail/Dealer Price");
    }

    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    csvData.forEach((row, index) => {
      const name = nameMapping ? String(row[nameMapping.csvColumn] || '').trim() : '';
      const category = categoryMapping ? String(row[categoryMapping.csvColumn] || '').trim() || undefined : undefined;
      const unit = unitMapping ? String(row[unitMapping.csvColumn] || '').trim() || undefined : undefined;
      const description = descMapping ? String(row[descMapping.csvColumn] || '').trim() || undefined : undefined;
      const retailPriceStr = retailPriceMapping ? String(row[retailPriceMapping.csvColumn] || '') : '';

      if (!name) {
        skippedRows++;
        return;
      }

      const retailPrice = parsePrice(retailPriceStr);

      if (retailPrice === null || retailPrice <= 0) {
        skippedRows++;
        return;
      }

      preview.push({
        name,
        category,
        unit,
        description,
        retailPrice,
      });
    });

    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    setPreviewData(preview);
    setErrors([]);
    
    if (skippedRows > 0) {
      toast({
        title: "Rows Skipped",
        description: `${skippedRows} rows skipped (missing name or invalid price)`,
      });
    }
    
    setStep('preview');
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/import-csv-products", {
        products: previewData,
        manufacturer,
        discountType,
        discountValue: parseFloat(discountValue) || 0
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Import Successful",
        description: `Created: ${data.created}, Updated: ${data.updated}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      
      setFile(null);
      setCsvData([]);
      setCsvColumns([]);
      setColumnMappings([]);
      setPreviewData([]);
      setStep('upload');
      setErrors([]);
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
    if (!manufacturer.trim()) {
      setErrors(["Please enter a manufacturer name"]);
      return;
    }
    setErrors([]);
    importMutation.mutate();
  };

  const resetImporter = () => {
    setFile(null);
    setCsvData([]);
    setCsvColumns([]);
    setColumnMappings([]);
    setPreviewData([]);
    setStep('upload');
    setErrors([]);
    setManufacturer('');
    setDiscountType('percentage');
    setDiscountValue('0');
  };

  const downloadSampleCSV = () => {
    const sampleData = [
      { 'Product Name': 'Example Product 1', 'Category': 'Materials', 'Dealer Price': '100.00', 'Unit': 'each' },
      { 'Product Name': 'Example Product 2', 'Category': 'Labor', 'Dealer Price': '150.00', 'Unit': 'hour' },
    ];
    
    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Products");
    XLSX.writeFile(wb, "sample_products.csv");
  };

  const calculateCost = (retailPrice: number): number => {
    const discount = parseFloat(discountValue) || 0;
    if (discountType === 'percentage') {
      return retailPrice * (1 - discount / 100);
    } else {
      return Math.max(0, retailPrice - discount);
    }
  };

  const calculateMargin = (retailPrice: number): number => {
    const cost = calculateCost(retailPrice);
    const discountAmount = retailPrice - cost;
    return retailPrice > 0 ? (discountAmount / retailPrice) * 100 : 0;
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
              <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <div className="space-y-2">
                <h3 className="text-lg font-medium">Upload CSV File</h3>
                <p className="text-sm text-gray-500">
                  CSV or Excel files with product information
                </p>
              </div>
              <Input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileChange}
                className="mt-4 max-w-xs mx-auto"
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
                Found {previewData.length} valid products. Set manufacturer and discount details below.
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
              <div className="space-y-2">
                <label className="text-sm font-medium">Manufacturer</label>
                <Input
                  type="text"
                  placeholder="Enter manufacturer name"
                  value={manufacturer}
                  onChange={(e) => setManufacturer(e.target.value)}
                  data-testid="input-manufacturer"
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Discount Type</label>
                <Select value={discountType} onValueChange={(value: 'percentage' | 'dollar') => setDiscountType(value)}>
                  <SelectTrigger data-testid="select-discount-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                    <SelectItem value="dollar">Dollar Amount ($)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Discount Value</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder={discountType === 'percentage' ? '0' : '0.00'}
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  data-testid="input-discount-value"
                />
              </div>
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

            <div className="bg-gray-50 p-4 rounded-lg max-h-96 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-100">
                  <tr className="border-b">
                    <th className="text-left py-2 px-2">Name</th>
                    <th className="text-left py-2 px-2">Category</th>
                    <th className="text-left py-2 px-2">Unit</th>
                    <th className="text-right py-2 px-2">Retail Price</th>
                    <th className="text-right py-2 px-2">Your Cost</th>
                    <th className="text-right py-2 px-2">Discount</th>
                    <th className="text-right py-2 px-2">Margin %</th>
                  </tr>
                </thead>
                <tbody>
                  {previewData.map((product, index) => {
                    const cost = calculateCost(product.retailPrice);
                    const discount = product.retailPrice - cost;
                    const margin = calculateMargin(product.retailPrice);
                    
                    return (
                      <tr key={index} className="border-b" data-testid={`row-preview-${index}`}>
                        <td className="py-1 px-2">{product.name}</td>
                        <td className="py-1 px-2">{product.category || '-'}</td>
                        <td className="py-1 px-2">{product.unit || '-'}</td>
                        <td className="py-1 px-2 text-right">${product.retailPrice.toFixed(2)}</td>
                        <td className="py-1 px-2 text-right text-green-600">${cost.toFixed(2)}</td>
                        <td className="py-1 px-2 text-right text-blue-600">${discount.toFixed(2)}</td>
                        <td className="py-1 px-2 text-right text-purple-600">{margin.toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setStep('mapping')} data-testid="button-back-to-mapping">
                Back to Mapping
              </Button>
              <Button 
                onClick={handleImport} 
                disabled={importMutation.isPending}
                className="bg-edg-black hover:bg-edg-grey text-white"
                data-testid="button-import-products"
              >
                {importMutation.isPending ? "Importing..." : `Import ${previewData.length} Products`}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
