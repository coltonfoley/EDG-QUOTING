import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle, Calculator } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import * as XLSX from "xlsx";
import { apiRequest } from "@/lib/queryClient";
import type { Product } from "@shared/schema";

interface PricingTableUploaderProps {
  productId: number;
  onUploadComplete?: () => void;
}

interface PricingData {
  lengthMin: number;
  lengthMax: number;
  widthMin: number;
  widthMax: number;
  retailPrice: number;
  basePrice: number;
}

export function PricingTableUploader({ productId, onUploadComplete }: PricingTableUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PricingData[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [skippedCount, setSkippedCount] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sourceUnit, setSourceUnit] = useState<"feet" | "inches" | "meters">("feet");

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch product details to get discount settings
  const { data: product, isLoading: isLoadingProduct } = useQuery({
    queryKey: ["/api/products", productId],
    queryFn: async (): Promise<Product> => {
      const response = await apiRequest("GET", `/api/products/${productId}`);
      return await response.json();
    },
  });

  const calculateBasePrice = (retailPrice: number): number => {
    if (!product) return retailPrice;
    
    const discountValue = parseFloat(product.defaultDiscountValue.toString());
    
    if (product.defaultDiscountType === 'percentage') {
      return retailPrice * (1 - discountValue / 100);
    } else {
      // dollar discount
      return Math.max(0, retailPrice - discountValue);
    }
  };

  const uploadMutation = useMutation({
    mutationFn: async (pricingData: PricingData[]) => {
      const response = await apiRequest("POST", `/api/products/${productId}/pricing-tables/bulk-upload`, {
        pricingData,
        sourceUnit
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: data.message || "Pricing data uploaded successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/products", productId, "pricing-tables"] });
      setFile(null);
      setPreview([]);
      setErrors([]);
      onUploadComplete?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload pricing data",
        variant: "destructive",
      });
    },
  });

  const validatePricingData = (data: any[]): { valid: PricingData[]; errors: string[]; skipped: number } => {
    const valid: PricingData[] = [];
    const errors: string[] = [];
    let skipped = 0;

    if (!product) {
      errors.push('Product information not loaded');
      return { valid, errors, skipped };
    }

    data.forEach((row, index) => {
      const rowNum = index + 1;
      
      // Check for required columns (support various naming conventions)
      const requiredColumns = [
        { names: ['LengthMin', 'lengthMin', 'Length Min'], key: 'lengthMin' },
        { names: ['LengthMax', 'lengthMax', 'Length Max'], key: 'lengthMax' },
        { names: ['WidthMin', 'widthMin', 'Width Min'], key: 'widthMin' },
        { names: ['WidthMax', 'widthMax', 'Width Max'], key: 'widthMax' },
        { names: ['RetailPrice', 'retailPrice', 'Retail Price', 'Price', 'price'], key: 'retailPrice' }
      ];

      const values: any = {};
      
      for (const column of requiredColumns) {
        let found = false;
        for (const name of column.names) {
          if (row.hasOwnProperty(name)) {
            values[column.key] = row[name];
            found = true;
            break;
          }
        }
        
        if (!found) {
          errors.push(`Row ${rowNum}: Missing '${column.names[0]}' column`);
          return;
        }
      }

      // Check if retail price indicates "not available" - skip these rows
      const priceStr = String(values.retailPrice || '').trim().toLowerCase();
      if (priceStr === 'n/a' || priceStr === 'na' || priceStr === '' || 
          priceStr === 'null' || priceStr === 'undefined' || priceStr === '-') {
        skipped++;
        return; // Skip this row - not an error, just not manufacturable
      }

      // Validate numeric values
      const lengthMinNum = parseFloat(values.lengthMin);
      const lengthMaxNum = parseFloat(values.lengthMax);
      const widthMinNum = parseFloat(values.widthMin);
      const widthMaxNum = parseFloat(values.widthMax);
      const retailPriceNum = parseFloat(values.retailPrice);

      if (isNaN(lengthMinNum) || lengthMinNum <= 0) {
        errors.push(`Row ${rowNum}: Invalid lengthMin value '${values.lengthMin}'`);
        return;
      }

      if (isNaN(lengthMaxNum) || lengthMaxNum <= 0) {
        errors.push(`Row ${rowNum}: Invalid lengthMax value '${values.lengthMax}'`);
        return;
      }

      if (isNaN(widthMinNum) || widthMinNum <= 0) {
        errors.push(`Row ${rowNum}: Invalid widthMin value '${values.widthMin}'`);
        return;
      }

      if (isNaN(widthMaxNum) || widthMaxNum <= 0) {
        errors.push(`Row ${rowNum}: Invalid widthMax value '${values.widthMax}'`);
        return;
      }

      if (isNaN(retailPriceNum) || retailPriceNum <= 0) {
        errors.push(`Row ${rowNum}: Invalid retail price value '${values.retailPrice}'`);
        return;
      }

      // Validate that min < max
      if (lengthMinNum >= lengthMaxNum) {
        errors.push(`Row ${rowNum}: LengthMin (${lengthMinNum}) must be less than LengthMax (${lengthMaxNum})`);
        return;
      }

      if (widthMinNum >= widthMaxNum) {
        errors.push(`Row ${rowNum}: WidthMin (${widthMinNum}) must be less than WidthMax (${widthMaxNum})`);
        return;
      }

      const basePrice = calculateBasePrice(retailPriceNum);

      valid.push({
        lengthMin: lengthMinNum,
        lengthMax: lengthMaxNum,
        widthMin: widthMinNum,
        widthMax: widthMaxNum,
        retailPrice: retailPriceNum,
        basePrice: basePrice,
      });
    });

    return { valid, errors, skipped };
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setIsProcessing(true);
    setErrors([]);
    setPreview([]);
    setSkippedCount(0);

    try {
      if (!product) {
        setErrors(["Product information not loaded. Please wait and try again."]);
        return;
      }

      const buffer = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(sheet);

      if (jsonData.length === 0) {
        setErrors(["File appears to be empty"]);
        return;
      }

      const { valid, errors, skipped } = validatePricingData(jsonData);
      
      if (errors.length > 0) {
        setErrors(errors);
      }
      
      setSkippedCount(skipped);
      
      if (valid.length > 0) {
        setPreview(valid.slice(0, 10)); // Show first 10 rows for preview
      }

    } catch (error) {
      setErrors(["Failed to parse file. Please ensure it's a valid Excel or CSV file."]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpload = () => {
    if (!file || preview.length === 0) return;

    // Process full file again for upload
    const processFile = async () => {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(sheet);
      
      const { valid } = validatePricingData(jsonData);
      uploadMutation.mutate(valid);
    };

    processFile();
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          Bulk Upload Pricing Table
        </CardTitle>
        <CardDescription>
          Upload an Excel or CSV file with banded pricing data to quickly populate the pricing table. N/A entries will be skipped automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-4">
          {/* Source Unit Selector */}
          <div className="space-y-2">
            <Label htmlFor="source-unit">Source Dimension Unit</Label>
            <Select value={sourceUnit} onValueChange={(value: "feet" | "inches" | "meters") => setSourceUnit(value)}>
              <SelectTrigger id="source-unit" className="w-full sm:w-64" data-testid="select-source-unit">
                <SelectValue placeholder="Select unit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="feet">Feet (ft) - Common for US manufacturers</SelectItem>
                <SelectItem value="inches">Inches (in) - Direct measurement</SelectItem>
                <SelectItem value="meters">Meters (m) - Metric system</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-gray-500">
              Select the unit used in your CSV file. All dimensions will be converted to inches for storage.
            </p>
          </div>

          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
            <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <div className="space-y-2">
              <h3 className="text-lg font-medium">Choose a file to upload</h3>
              <p className="text-sm text-gray-500">
                Excel (.xlsx, .xls) or CSV files with LengthMin, LengthMax, WidthMin, WidthMax, RetailPrice columns
              </p>
            </div>
            <Input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              className="mt-4 max-w-xs mx-auto"
              disabled={isProcessing || uploadMutation.isPending}
              data-testid="input-pricing-file"
            />
          </div>

          {file && (
            <Alert>
              <FileSpreadsheet className="h-4 w-4" />
              <AlertDescription>
                Selected file: <strong>{file.name}</strong> ({(file.size / 1024).toFixed(1)} KB)
              </AlertDescription>
            </Alert>
          )}

          {/* Expected Format Info */}
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Expected format:</strong> Your file should have columns: "LengthMin", "LengthMax", "WidthMin", "WidthMax", and "RetailPrice". 
              Each row represents a size band (e.g., Length 12.0-12.5 × Width 8.0-8.5 = $2,500).
              <br />
              <strong>Retail Pricing:</strong> Upload retail/manufacturer prices - cost prices will be calculated automatically using the product's discount settings.
              <br />
              <strong>N/A values:</strong> Use "N/A" or leave empty for non-manufacturable size combinations - these will be skipped automatically.
            </AlertDescription>
          </Alert>

          {/* Discount Info */}
          {product && (
            <Alert className="border-blue-200 bg-blue-50">
              <Calculator className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-800">
                <strong>Automatic Cost Calculation:</strong> {product.defaultDiscountType === 'percentage' 
                  ? `${product.defaultDiscountValue}% discount will be applied to retail prices to calculate cost prices`
                  : `$${product.defaultDiscountValue} will be subtracted from retail prices to calculate cost prices`
                }.
              </AlertDescription>
            </Alert>
          )}

          {isLoadingProduct && (
            <div className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          )}

          {/* Errors */}
          {errors.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="font-semibold mb-2">Found {errors.length} error(s):</div>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {errors.slice(0, 5).map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                  {errors.length > 5 && (
                    <li className="text-gray-600">... and {errors.length - 5} more</li>
                  )}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Skipped Info */}
          {skippedCount > 0 && (
            <Alert className="border-yellow-200 bg-yellow-50">
              <AlertCircle className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-yellow-800">
                Skipped {skippedCount} row(s) with N/A or empty retail prices (non-manufacturable sizes).
              </AlertDescription>
            </Alert>
          )}

          {/* Preview */}
          {preview.length > 0 && (
            <div className="space-y-2">
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  Found {preview.length} valid entries {skippedCount > 0 && `(${skippedCount} skipped)`} - showing first 10:
                </AlertDescription>
              </Alert>
              
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2">Length Range (ft)</th>
                        <th className="text-left py-2">Width Range (ft)</th>
                        <th className="text-left py-2">Retail Price</th>
                        <th className="text-left py-2">Cost Price</th>
                        <th className="text-left py-2">Margin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((item, index) => {
                        const margin = ((item.retailPrice - item.basePrice) / item.retailPrice * 100).toFixed(1);
                        return (
                          <tr key={index} className="border-b">
                            <td className="py-1">{item.lengthMin} - {item.lengthMax}</td>
                            <td className="py-1">{item.widthMin} - {item.widthMax}</td>
                            <td className="py-1">${item.retailPrice.toLocaleString()}</td>
                            <td className="py-1 text-green-600">${item.basePrice.toLocaleString()}</td>
                            <td className="py-1 text-blue-600">{margin}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Upload Button */}
          <div className="flex justify-end space-x-3">
            <Button
              onClick={handleUpload}
              disabled={!file || preview.length === 0 || errors.length > 0 || uploadMutation.isPending || isLoadingProduct}
              className="bg-edg-black hover:bg-edg-grey text-white"
            >
              {uploadMutation.isPending ? "Uploading..." : `Upload ${preview.length} Entries`}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}