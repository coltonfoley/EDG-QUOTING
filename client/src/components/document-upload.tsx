import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Upload, 
  FileText, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Plus,
  Eye,
  Loader2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Product, InsertProduct } from "@shared/schema";

interface ProcessedProduct extends InsertProduct {
  selected: boolean;
}

interface DocumentUploadProps {
  onProductsCreated?: (products: Product[]) => void;
}

export function DocumentUpload({ onProductsCreated }: DocumentUploadProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentAnalysis, setDocumentAnalysis] = useState<string>("");
  const [extractedProducts, setExtractedProducts] = useState<ProcessedProduct[]>([]);
  const [uploadStep, setUploadStep] = useState<'upload' | 'analysis' | 'extracted' | 'creating'>('upload');

  // Document analysis mutation
  const analyzeMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('document', file);
      
      const response = await fetch('/api/documents/analyze', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error(`Analysis failed: ${response.statusText}`);
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      setDocumentAnalysis(data.analysis);
      setUploadStep('analysis');
      toast({
        title: "Document analyzed",
        description: "Ready to extract products from the document"
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Analysis failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Document processing mutation
  const processMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('document', file);
      
      const response = await fetch('/api/documents/process', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error(`Processing failed: ${response.statusText}`);
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      const productsWithSelection = data.products.map((product: InsertProduct) => ({
        ...product,
        selected: true
      }));
      setExtractedProducts(productsWithSelection);
      setUploadStep('extracted');
      toast({
        title: "Products extracted!",
        description: `Found ${data.totalProducts} products in the document`
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Processing failed", 
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Create products mutation
  const createProductsMutation = useMutation({
    mutationFn: async (products: InsertProduct[]) => {
      const response = await fetch('/api/documents/create-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to create products: ${response.statusText}`);
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      onProductsCreated?.(data.products);
      
      setUploadStep('upload');
      setSelectedFile(null);
      setExtractedProducts([]);
      setDocumentAnalysis("");
      
      toast({
        title: "Products created!",
        description: `Successfully created ${data.created} products. ${data.errors.length > 0 ? `${data.errors.length} failed.` : ''}`
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create products",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setUploadStep('upload');
      setDocumentAnalysis("");
      setExtractedProducts([]);
    }
  };

  const handleAnalyze = () => {
    if (selectedFile) {
      analyzeMutation.mutate(selectedFile);
    }
  };

  const handleExtractProducts = () => {
    if (selectedFile) {
      processMutation.mutate(selectedFile);
    }
  };

  const handleCreateProducts = () => {
    const selectedProducts = extractedProducts.filter(p => p.selected);
    if (selectedProducts.length > 0) {
      setUploadStep('creating');
      createProductsMutation.mutate(selectedProducts);
    }
  };

  const toggleProductSelection = (index: number) => {
    setExtractedProducts(prev => 
      prev.map((product, i) => 
        i === index ? { ...product, selected: !product.selected } : product
      )
    );
  };

  const selectedCount = extractedProducts.filter(p => p.selected).length;

  return (
    <Card className="max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Upload className="h-5 w-5" />
          <span>AI Document Processing</span>
        </CardTitle>
        <p className="text-sm text-gray-600">
          Upload manufacturer price lists or catalogs to automatically extract and create products
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* File Upload Section */}
        <div className="space-y-4">
          <Label htmlFor="document">Upload Document</Label>
          <Input
            id="document"
            type="file"
            accept="image/*,.pdf"
            onChange={handleFileSelect}
            disabled={analyzeMutation.isPending || processMutation.isPending}
          />
          {selectedFile && (
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <FileText className="h-4 w-4" />
              <span>{selectedFile.name}</span>
              <Badge variant="outline">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</Badge>
            </div>
          )}
        </div>

        {/* Progress Steps */}
        <div className="flex items-center space-x-4">
          <div className={`flex items-center space-x-2 ${uploadStep === 'upload' ? 'text-blue-600' : uploadStep === 'analysis' || uploadStep === 'extracted' || uploadStep === 'creating' ? 'text-green-600' : 'text-gray-400'}`}>
            <div className="w-6 h-6 rounded-full border-2 flex items-center justify-center">
              {uploadStep === 'upload' ? '1' : <CheckCircle className="h-4 w-4" />}
            </div>
            <span className="text-sm font-medium">Upload</span>
          </div>
          <div className="flex-1 h-px bg-gray-200"></div>
          <div className={`flex items-center space-x-2 ${uploadStep === 'analysis' ? 'text-blue-600' : uploadStep === 'extracted' || uploadStep === 'creating' ? 'text-green-600' : 'text-gray-400'}`}>
            <div className="w-6 h-6 rounded-full border-2 flex items-center justify-center">
              {analyzeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : uploadStep === 'analysis' || uploadStep === 'extracted' || uploadStep === 'creating' ? <CheckCircle className="h-4 w-4" /> : '2'}
            </div>
            <span className="text-sm font-medium">Analyze</span>
          </div>
          <div className="flex-1 h-px bg-gray-200"></div>
          <div className={`flex items-center space-x-2 ${uploadStep === 'extracted' ? 'text-blue-600' : uploadStep === 'creating' ? 'text-green-600' : 'text-gray-400'}`}>
            <div className="w-6 h-6 rounded-full border-2 flex items-center justify-center">
              {processMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : uploadStep === 'extracted' || uploadStep === 'creating' ? <CheckCircle className="h-4 w-4" /> : '3'}
            </div>
            <span className="text-sm font-medium">Extract</span>
          </div>
          <div className="flex-1 h-px bg-gray-200"></div>
          <div className={`flex items-center space-x-2 ${uploadStep === 'creating' ? 'text-blue-600' : 'text-gray-400'}`}>
            <div className="w-6 h-6 rounded-full border-2 flex items-center justify-center">
              {createProductsMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : '4'}
            </div>
            <span className="text-sm font-medium">Create</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-3">
          {uploadStep === 'upload' && selectedFile && (
            <Button 
              onClick={handleAnalyze}
              disabled={analyzeMutation.isPending}
              className="bg-edg-black hover:bg-edg-grey"
            >
              {analyzeMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Eye className="mr-2 h-4 w-4" />
                  Analyze Document
                </>
              )}
            </Button>
          )}

          {uploadStep === 'analysis' && (
            <Button 
              onClick={handleExtractProducts}
              disabled={processMutation.isPending}
              className="bg-edg-teal hover:bg-edg-teal/80"
            >
              {processMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Extracting...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Extract Products
                </>
              )}
            </Button>
          )}

          {uploadStep === 'extracted' && extractedProducts.length > 0 && (
            <Button 
              onClick={handleCreateProducts}
              disabled={selectedCount === 0 || createProductsMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {createProductsMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Create {selectedCount} Products
                </>
              )}
            </Button>
          )}
        </div>

        {/* Document Analysis Results */}
        {documentAnalysis && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Document Analysis:</strong> {documentAnalysis}
            </AlertDescription>
          </Alert>
        )}

        {/* Extracted Products */}
        {extractedProducts.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Extracted Products</h3>
              <Badge variant="outline">{selectedCount} of {extractedProducts.length} selected</Badge>
            </div>
            
            <div className="max-h-64 overflow-y-auto space-y-2">
              {extractedProducts.map((product, index) => (
                <div key={index} className={`p-3 border rounded-md ${product.selected ? 'bg-green-50 border-green-200' : 'bg-gray-50'}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={product.selected}
                          onChange={() => toggleProductSelection(index)}
                          className="rounded"
                        />
                        <h4 className="font-medium">{product.name}</h4>
                        <Badge variant="secondary">{product.category}</Badge>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{product.description}</p>
                      <div className="flex items-center space-x-4 mt-2 text-sm">
                        <span><strong>Price:</strong> ${product.defaultUnitPrice}</span>
                        <span><strong>Unit:</strong> {product.unit}</span>
                        <span><strong>Markup:</strong> {product.defaultMarkupValue}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}