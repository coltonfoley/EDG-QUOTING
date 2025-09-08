import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";
import { apiRequest } from "@/lib/queryClient";

interface PricingTableUploaderProps {
  productId: number;
  onUploadComplete?: () => void;
}

interface PricingData {
  length: number;
  width: number;
  price: number;
}

export function PricingTableUploader({ productId, onUploadComplete }: PricingTableUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PricingData[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async (pricingData: PricingData[]) => {
      const response = await apiRequest("POST", `/api/products/${productId}/pricing-tables/bulk-upload`, {
        pricingData
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: data.message || "Pricing data uploaded successfully",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/products/${productId}/pricing-tables`] });
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

  const validatePricingData = (data: any[]): { valid: PricingData[]; errors: string[] } => {
    const valid: PricingData[] = [];
    const errors: string[] = [];

    data.forEach((row, index) => {
      const rowNum = index + 1;
      
      // Check for required columns
      if (!row.hasOwnProperty('Length') && !row.hasOwnProperty('length')) {
        errors.push(`Row ${rowNum}: Missing 'Length' column`);
        return;
      }
      
      if (!row.hasOwnProperty('Width') && !row.hasOwnProperty('width')) {
        errors.push(`Row ${rowNum}: Missing 'Width' column`);
        return;
      }
      
      if (!row.hasOwnProperty('Price') && !row.hasOwnProperty('price')) {
        errors.push(`Row ${rowNum}: Missing 'Price' column`);
        return;
      }

      // Get values (try both cases)
      const length = row.Length || row.length;
      const width = row.Width || row.width;
      const price = row.Price || row.price;

      // Validate numeric values
      const lengthNum = parseFloat(length);
      const widthNum = parseFloat(width);
      const priceNum = parseFloat(price);

      if (isNaN(lengthNum) || lengthNum <= 0) {
        errors.push(`Row ${rowNum}: Invalid length value '${length}'`);
        return;
      }

      if (isNaN(widthNum) || widthNum <= 0) {
        errors.push(`Row ${rowNum}: Invalid width value '${width}'`);
        return;
      }

      if (isNaN(priceNum) || priceNum <= 0) {
        errors.push(`Row ${rowNum}: Invalid price value '${price}'`);
        return;
      }

      valid.push({
        length: lengthNum,
        width: widthNum,
        price: priceNum,
      });
    });

    return { valid, errors };
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setIsProcessing(true);
    setErrors([]);
    setPreview([]);

    try {
      const buffer = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(sheet);

      if (jsonData.length === 0) {
        setErrors(["File appears to be empty"]);
        return;
      }

      const { valid, errors } = validatePricingData(jsonData);
      
      if (errors.length > 0) {
        setErrors(errors);
      }
      
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
          Upload an Excel or CSV file with Length, Width, and Price columns to quickly populate the pricing table.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-4">
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
            <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <div className="space-y-2">
              <h3 className="text-lg font-medium">Choose a file to upload</h3>
              <p className="text-sm text-gray-500">
                Excel (.xlsx, .xls) or CSV files with Length, Width, Price columns
              </p>
            </div>
            <Input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              className="mt-4 max-w-xs mx-auto"
              disabled={isProcessing || uploadMutation.isPending}
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
              <strong>Expected format:</strong> Your file should have columns named "Length", "Width", and "Price". 
              Each row represents one pricing entry (e.g., 12' × 8' = $2,500).
            </AlertDescription>
          </Alert>

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

          {/* Preview */}
          {preview.length > 0 && (
            <div className="space-y-2">
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  Preview of valid entries (showing first 10 of {preview.length}):
                </AlertDescription>
              </Alert>
              
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2">Length (ft)</th>
                        <th className="text-left py-2">Width (ft)</th>
                        <th className="text-left py-2">Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((item, index) => (
                        <tr key={index} className="border-b">
                          <td className="py-1">{item.length}</td>
                          <td className="py-1">{item.width}</td>
                          <td className="py-1">${item.price.toLocaleString()}</td>
                        </tr>
                      ))}
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
              disabled={!file || preview.length === 0 || errors.length > 0 || uploadMutation.isPending}
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