import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, FileText, AlertCircle, CheckCircle, ArrowRight, Eye, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface ExtractedProduct {
  name: string;
  price: number;
  unit: string;
  category: string | null;
  description: string | null;
}

interface ExtractionResult {
  manufacturer: string;
  manufacturerExists: boolean;
  existingManufacturers: string[];
  products: ExtractedProduct[];
  filename: string;
}

export function PDFProductImporter() {
  const [file, setFile] = useState<File | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractionResult | null>(null);
  const [step, setStep] = useState<'upload' | 'preview'>('upload');
  const [editedProducts, setEditedProducts] = useState<ExtractedProduct[]>([]);
  const [editedManufacturer, setEditedManufacturer] = useState<string>("");

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const extractMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('pdf', file);
      
      const response = await fetch('/api/products/import-from-pdf', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to extract products from PDF');
      }

      return response.json();
    },
    onSuccess: (data: ExtractionResult) => {
      setExtractedData(data);
      setEditedProducts(data.products);
      setEditedManufacturer(data.manufacturer);
      setStep('preview');
      toast({
        title: "Products Extracted",
        description: `Found ${data.products.length} products from ${data.manufacturer}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Extraction Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const importMutation = useMutation({
    mutationFn: async (data: { manufacturer: string; products: ExtractedProduct[] }) => {
      return apiRequest('/api/products/bulk-import', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
      toast({
        title: "Import Successful",
        description: `Imported ${data.imported} products`,
      });
      // Reset to upload step
      setFile(null);
      setExtractedData(null);
      setEditedProducts([]);
      setEditedManufacturer("");
      setStep('upload');
    },
    onError: (error: Error) => {
      toast({
        title: "Import Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
    } else {
      toast({
        title: "Invalid File",
        description: "Please select a PDF file",
        variant: "destructive",
      });
    }
  };

  const handleExtract = () => {
    if (file) {
      extractMutation.mutate(file);
    }
  };

  const handleImport = () => {
    if (editedManufacturer && editedProducts.length > 0) {
      importMutation.mutate({
        manufacturer: editedManufacturer,
        products: editedProducts
      });
    }
  };

  const updateProductField = (index: number, field: keyof ExtractedProduct, value: any) => {
    setEditedProducts(prev => 
      prev.map((product, i) => 
        i === index ? { ...product, [field]: value } : product
      )
    );
  };

  const deleteProduct = (index: number) => {
    setEditedProducts(prev => prev.filter((_, i) => i !== index));
  };

  const resetToUpload = () => {
    setFile(null);
    setExtractedData(null);
    setEditedProducts([]);
    setEditedManufacturer("");
    setStep('upload');
  };

  if (step === 'upload') {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Import Products from PDF
          </CardTitle>
          <CardDescription>
            Upload a manufacturer price list PDF to automatically extract and import products
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-8 text-center">
            <Upload className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <Input
              type="file"
              accept=".pdf"
              onChange={handleFileChange}
              className="hidden"
              id="pdf-upload"
              data-testid="input-pdf-upload"
            />
            <label htmlFor="pdf-upload">
              <Button variant="outline" className="cursor-pointer" asChild>
                <span>Select PDF File</span>
              </Button>
            </label>
            {file && (
              <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
                Selected: {file.name}
              </p>
            )}
          </div>

          {file && (
            <Button 
              onClick={handleExtract} 
              disabled={extractMutation.isPending}
              className="w-full"
              data-testid="button-extract-products"
            >
              {extractMutation.isPending ? (
                <>Processing PDF...</>
              ) : (
                <>
                  <ArrowRight className="h-4 w-4 mr-2" />
                  Extract Products
                </>
              )}
            </Button>
          )}

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>How it works:</strong>
              <ol className="list-decimal list-inside mt-2 space-y-1 text-sm">
                <li>Upload a manufacturer price list PDF</li>
                <li>AI extracts products, prices, and categories</li>
                <li>Review and edit the extracted data</li>
                <li>Bulk import all products at once</li>
              </ol>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // Preview step
  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Review Extracted Products
            </CardTitle>
            <CardDescription>
              Review and edit products before importing
            </CardDescription>
          </div>
          <Button variant="ghost" onClick={resetToUpload} data-testid="button-back-to-upload">
            ← Back
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Manufacturer Info */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Manufacturer</label>
          <div className="flex gap-2 items-center">
            <Input
              value={editedManufacturer}
              onChange={(e) => setEditedManufacturer(e.target.value)}
              placeholder="Manufacturer name"
              className="max-w-md"
              data-testid="input-manufacturer-name"
            />
            {extractedData?.manufacturerExists ? (
              <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                <CheckCircle className="h-3 w-3 mr-1" />
                Existing
              </Badge>
            ) : (
              <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100">
                New Manufacturer
              </Badge>
            )}
          </div>
          {extractedData?.existingManufacturers && extractedData.existingManufacturers.length > 0 && (
            <p className="text-xs text-gray-500">
              Existing manufacturers: {extractedData.existingManufacturers.join(', ')}
            </p>
          )}
        </div>

        {/* Products Table */}
        <div className="border rounded-lg">
          <div className="max-h-[500px] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-white dark:bg-gray-950 z-10">
                <TableRow>
                  <TableHead className="w-[300px]">Product Name</TableHead>
                  <TableHead className="w-[120px]">Price</TableHead>
                  <TableHead className="w-[100px]">Unit</TableHead>
                  <TableHead className="w-[150px]">Category</TableHead>
                  <TableHead className="w-[200px]">Description</TableHead>
                  <TableHead className="w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {editedProducts.map((product, index) => (
                  <TableRow key={index} data-testid={`row-product-${index}`}>
                    <TableCell>
                      <Input
                        value={product.name}
                        onChange={(e) => updateProductField(index, 'name', e.target.value)}
                        className="min-w-[250px]"
                        data-testid={`input-product-name-${index}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        value={product.price}
                        onChange={(e) => updateProductField(index, 'price', parseFloat(e.target.value))}
                        className="w-[100px]"
                        data-testid={`input-product-price-${index}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={product.unit}
                        onChange={(e) => updateProductField(index, 'unit', e.target.value)}
                        className="w-[80px]"
                        data-testid={`input-product-unit-${index}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={product.category || ''}
                        onChange={(e) => updateProductField(index, 'category', e.target.value || null)}
                        placeholder="Optional"
                        className="w-[130px]"
                        data-testid={`input-product-category-${index}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={product.description || ''}
                        onChange={(e) => updateProductField(index, 'description', e.target.value || null)}
                        placeholder="Optional"
                        className="min-w-[180px]"
                        data-testid={`input-product-description-${index}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteProduct(index)}
                        data-testid={`button-delete-product-${index}`}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Summary and Import */}
        <div className="flex items-center justify-between pt-4 border-t">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {editedProducts.length} product{editedProducts.length !== 1 ? 's' : ''} ready to import
          </div>
          <Button
            onClick={handleImport}
            disabled={importMutation.isPending || !editedManufacturer || editedProducts.length === 0}
            size="lg"
            data-testid="button-import-products"
          >
            {importMutation.isPending ? (
              <>Importing...</>
            ) : (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                Import {editedProducts.length} Products
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
