import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, FileText, AlertCircle, CheckCircle, Loader2, Edit2, Save, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface PricingEntry {
  widthMin: number;
  widthMax: number;
  lengthMin: number;
  lengthMax: number;
  price: number;
}

interface ExtractedProduct {
  name: string;
  manufacturer: string;
  category: string | null;
  description: string | null;
  unit: string;
  widthLabel: string | null;
  lengthLabel: string | null;
  widthUnit: string;
  lengthUnit: string;
  minWidth: number | null;
  maxWidth: number | null;
  minLength: number | null;
  maxLength: number | null;
  pricingEntries: PricingEntry[];
  specialNotes: string | null;
  confidence: number;
}

export function PDFProductImporter() {
  const [file, setFile] = useState<File | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedProduct | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [step, setStep] = useState<'upload' | 'preview' | 'complete'>('upload');
  const [editingProduct, setEditingProduct] = useState<Partial<ExtractedProduct> | null>(null);
  const [defaultDiscountType, setDefaultDiscountType] = useState<'percentage' | 'dollar'>('percentage');
  const [defaultDiscountValue, setDefaultDiscountValue] = useState('0');

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.type === 'application/pdf') {
        setFile(selectedFile);
        setExtractedData(null);
        setStep('upload');
      } else {
        toast({
          title: "Invalid file type",
          description: "Please select a PDF file",
          variant: "destructive"
        });
      }
    }
  };

  const extractMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('pdf', file);
      
      const response = await fetch('/api/admin/import-pdf-product', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to extract product data');
      }

      return response.json();
    },
    onSuccess: (data) => {
      setExtractedData(data.data);
      setEditingProduct(data.data);
      setStep('preview');
      toast({
        title: "Extraction successful",
        description: `Found ${data.data.pricingEntries.length} pricing entries with ${(data.data.confidence * 100).toFixed(0)}% confidence`
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Extraction failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!editingProduct || !extractedData) throw new Error("No data to save");

      const response = await apiRequest("POST", "/api/admin/save-pdf-product", {
        productData: {
          name: editingProduct.name,
          manufacturer: editingProduct.manufacturer,
          category: editingProduct.category,
          description: editingProduct.description,
          unit: editingProduct.unit || 'each',
          minWidth: editingProduct.minWidth,
          maxWidth: editingProduct.maxWidth,
          minLength: editingProduct.minLength,
          maxLength: editingProduct.maxLength,
        },
        pricingEntries: extractedData.pricingEntries,
        defaultDiscount: {
          type: defaultDiscountType,
          value: defaultDiscountValue
        }
      });

      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
      setStep('complete');
      toast({
        title: "Product imported successfully",
        description: data.message
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Import failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const handleExtract = () => {
    if (!file) return;
    setIsExtracting(true);
    extractMutation.mutate(file);
    setIsExtracting(false);
  };

  const handleSave = () => {
    saveMutation.mutate();
  };

  const handleReset = () => {
    setFile(null);
    setExtractedData(null);
    setEditingProduct(null);
    setStep('upload');
    setDefaultDiscountType('percentage');
    setDefaultDiscountValue('0');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import Product from PDF</CardTitle>
        <CardDescription>
          Upload a manufacturer price sheet PDF and let AI extract the product details and pricing table
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Step 1: Upload */}
        {step === 'upload' && (
          <div className="space-y-4">
            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <Input
                type="file"
                accept=".pdf"
                onChange={handleFileChange}
                className="max-w-md mx-auto"
                data-testid="input-pdf-file"
              />
              {file && (
                <div className="mt-4 flex items-center justify-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span className="text-sm font-medium">{file.name}</span>
                </div>
              )}
            </div>

            {file && (
              <div className="flex justify-center">
                <Button
                  onClick={handleExtract}
                  disabled={extractMutation.isPending}
                  className="bg-edg-black hover:bg-edg-grey text-white"
                  data-testid="button-extract-pdf"
                >
                  {extractMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Extracting with AI...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Extract Product Data
                    </>
                  )}
                </Button>
              </div>
            )}

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Upload a manufacturer price sheet PDF. The AI will automatically extract the product name, 
                manufacturer, pricing table, and dimensions. Supported formats include width×height pricing grids.
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* Step 2: Preview & Edit */}
        {step === 'preview' && extractedData && editingProduct && (
          <div className="space-y-6">
            <Alert className={extractedData.confidence >= 0.8 ? "border-green-600" : "border-yellow-600"}>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Extraction confidence: {(extractedData.confidence * 100).toFixed(0)}%. 
                Review and edit the extracted data before importing.
              </AlertDescription>
            </Alert>

            {/* Product Details */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Product Details</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Product Name *</Label>
                  <Input
                    value={editingProduct.name || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                    data-testid="input-product-name"
                  />
                </div>
                
                <div>
                  <Label>Manufacturer *</Label>
                  <Input
                    value={editingProduct.manufacturer || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, manufacturer: e.target.value })}
                    data-testid="input-manufacturer"
                  />
                </div>

                <div>
                  <Label>Category</Label>
                  <Input
                    value={editingProduct.category || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, category: e.target.value })}
                    placeholder="e.g., Solar Screens"
                    data-testid="input-category"
                  />
                </div>

                <div>
                  <Label>Unit</Label>
                  <Input
                    value={editingProduct.unit || 'each'}
                    onChange={(e) => setEditingProduct({ ...editingProduct, unit: e.target.value })}
                    data-testid="input-unit"
                  />
                </div>
              </div>

              <div>
                <Label>Description</Label>
                <Textarea
                  value={editingProduct.description || ''}
                  onChange={(e) => setEditingProduct({ ...editingProduct, description: e.target.value })}
                  rows={2}
                  data-testid="input-description"
                />
              </div>

              {extractedData.specialNotes && (
                <Alert>
                  <AlertDescription>
                    <strong>Special Notes:</strong> {extractedData.specialNotes}
                  </AlertDescription>
                </Alert>
              )}
            </div>

            {/* Manufacturer Discount */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Manufacturer Discount</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Discount Type</Label>
                  <Select value={defaultDiscountType} onValueChange={(v: 'percentage' | 'dollar') => setDefaultDiscountType(v)}>
                    <SelectTrigger data-testid="select-discount-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage</SelectItem>
                      <SelectItem value="dollar">Dollar Amount</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Discount Value</Label>
                  <Input
                    type="number"
                    value={defaultDiscountValue}
                    onChange={(e) => setDefaultDiscountValue(e.target.value)}
                    placeholder="0"
                    data-testid="input-discount-value"
                  />
                </div>
              </div>
            </div>

            {/* Pricing Table Preview */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">
                Pricing Table ({extractedData.pricingEntries.length} entries)
              </h3>
              
              <div className="border rounded-lg overflow-hidden">
                <div className="max-h-96 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{extractedData.widthLabel || 'Width'} Range</TableHead>
                        <TableHead>{extractedData.lengthLabel || 'Length'} Range</TableHead>
                        <TableHead className="text-right">Retail Price</TableHead>
                        <TableHead className="text-right">Your Cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {extractedData.pricingEntries.slice(0, 100).map((entry, idx) => {
                        const retailPrice = entry.price;
                        let baseCost = retailPrice;
                        if (defaultDiscountType === 'percentage') {
                          baseCost = retailPrice * (1 - parseFloat(defaultDiscountValue) / 100);
                        } else {
                          baseCost = Math.max(0, retailPrice - parseFloat(defaultDiscountValue));
                        }

                        return (
                          <TableRow key={idx}>
                            <TableCell>{entry.widthMin}" - {entry.widthMax}"</TableCell>
                            <TableCell>{entry.lengthMin}" - {entry.lengthMax}"</TableCell>
                            <TableCell className="text-right">${retailPrice.toFixed(2)}</TableCell>
                            <TableCell className="text-right">${baseCost.toFixed(2)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {extractedData.pricingEntries.length > 100 && (
                <p className="text-sm text-muted-foreground text-center">
                  Showing first 100 of {extractedData.pricingEntries.length} entries
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-between">
              <Button
                onClick={handleReset}
                variant="outline"
                data-testid="button-cancel"
              >
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              
              <Button
                onClick={handleSave}
                disabled={!editingProduct.name || !editingProduct.manufacturer || saveMutation.isPending}
                className="bg-edg-black hover:bg-edg-grey text-white"
                data-testid="button-import-product"
              >
                {saveMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Import Product
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Complete */}
        {step === 'complete' && (
          <div className="text-center space-y-4 py-8">
            <CheckCircle className="w-16 h-16 mx-auto text-green-600" />
            <h3 className="text-xl font-semibold">Product Imported Successfully!</h3>
            <p className="text-muted-foreground">
              The product and all pricing entries have been added to your catalog.
            </p>
            <Button
              onClick={handleReset}
              className="bg-edg-black hover:bg-edg-grey text-white"
              data-testid="button-import-another"
            >
              Import Another Product
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
