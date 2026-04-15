import { useState, useRef, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Upload, Sparkles, AlertCircle, CheckCircle, Loader2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface ExtractedProduct {
  sku: string | null;
  name: string;
  manufacturer: string | null;
  category: string | null;
  unit: string | null;
  price: number;
  cost: number | null;
  description: string | null;
  confidence?: number;
}

interface AIExtractionResult {
  success: boolean;
  products: ExtractedProduct[];
  detectedManufacturer: string | null;
  totalExtracted: number;
}

interface ProgressState {
  phase: string;
  current: number;
  total: number;
  productsFound: number;
}

type Step = 'upload' | 'processing' | 'preview' | 'results';

const PHASE_LABELS: Record<string, string> = {
  reading: 'Reading file...',
  reading_pdf: 'Parsing PDF...',
  extracting: 'AI is extracting products...',
  extracting_vision: 'Analyzing pages with vision AI...',
  converting_pages: 'Converting PDF pages...',
  done: 'Extraction complete!',
};

export function AIProductImporter() {
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<Step>('upload');
  const [extractedProducts, setExtractedProducts] = useState<ExtractedProduct[]>([]);
  const [detectedManufacturer, setDetectedManufacturer] = useState<string>('');
  const [manufacturerOverride, setManufacturerOverride] = useState<string>('');
  const [errors, setErrors] = useState<string[]>([]);
  const [importResults, setImportResults] = useState<{ created: number; updated: number; skipped: number; errors: string[] } | null>(null);
  const [removedIndices, setRemovedIndices] = useState<Set<number>>(new Set());
  const [editingCell, setEditingCell] = useState<{ row: number; field: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const startExtraction = useCallback(async (fileToUpload: File) => {
    setIsExtracting(true);
    setProgress(null);
    setErrors([]);
    setStep('processing');

    try {
      const formData = new FormData();
      formData.append('file', fileToUpload);

      const response = await fetch('/api/admin/import-products-ai', {
        method: 'POST',
        body: formData,
        credentials: 'include',
        headers: { 'Accept': 'text/event-stream' },
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ message: 'Failed to process file' }));
        throw new Error(err.message);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let result: AIExtractionResult | null = null;

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const dataMatch = line.match(/^data: (.+)$/m);
            if (!dataMatch) continue;
            try {
              const parsed = JSON.parse(dataMatch[1]);
              if (parsed.type === 'progress') {
                setProgress({ phase: parsed.phase, current: parsed.current, total: parsed.total, productsFound: parsed.productsFound });
              } else if (parsed.type === 'complete') {
                result = parsed;
              }
            } catch {}
          }
        }
      }

      if (!result) {
        throw new Error('No result received from server');
      }

      setExtractedProducts(result.products);
      setDetectedManufacturer(result.detectedManufacturer || '');
      setManufacturerOverride(result.detectedManufacturer || '');
      setRemovedIndices(new Set());
      if (result.products.length === 0) {
        setErrors(['No products could be extracted from this file. Try a different file or use the manual CSV import.']);
        setStep('upload');
      } else {
        setStep('preview');
      }
    } catch (error: any) {
      setErrors([error.message || 'Failed to extract products']);
      setStep('upload');
    } finally {
      setIsExtracting(false);
      setProgress(null);
    }
  }, []);

  const importMutation = useMutation({
    mutationFn: async (products: Array<{ name: string; manufacturer?: string; category?: string; unit?: string; description?: string; retailPrice: number; cost: number }>) => {
      const response = await apiRequest("POST", "/api/admin/import-csv-products", { products });
      return response.json();
    },
    onSuccess: (data) => {
      const totalSubmitted = extractedProducts.filter((_, i) => !removedIndices.has(i)).length;
      const skipped = totalSubmitted - data.created - data.updated - (data.errors?.length || 0);
      setImportResults({ created: data.created, updated: data.updated, skipped: Math.max(0, skipped), errors: data.errors || [] });
      setStep('results');
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({
        title: "Import Complete",
        description: `${data.created} created, ${data.updated} updated`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Import Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = useCallback((selectedFile: File) => {
    const ext = selectedFile.name.toLowerCase().split('.').pop();
    if (!['csv', 'xlsx', 'xls', 'pdf'].includes(ext || '')) {
      setErrors(['Unsupported file type. Please upload CSV, Excel (.xlsx/.xls), or PDF files.']);
      return;
    }
    setFile(selectedFile);
    setErrors([]);
    startExtraction(selectedFile);
  }, [startExtraction]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (selected) handleFileSelect(selected);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFileSelect(dropped);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleRemoveProduct = (index: number) => {
    setRemovedIndices(prev => new Set([...prev, index]));
  };

  const handleCellEdit = (index: number, field: string, value: string) => {
    setExtractedProducts(prev => prev.map((p, i) => {
      if (i !== index) return p;
      if (field === 'price' || field === 'cost') {
        const num = parseFloat(value);
        return { ...p, [field]: isNaN(num) ? p[field as keyof ExtractedProduct] : num };
      }
      return { ...p, [field]: value || null };
    }));
  };

  const handleImport = () => {
    const batchMfr = manufacturerOverride.trim();
    const products = extractedProducts
      .filter((_, i) => !removedIndices.has(i))
      .map(p => ({
        name: p.name,
        manufacturer: p.manufacturer || batchMfr || 'Imported',
        category: p.category || undefined,
        unit: p.unit || 'each',
        description: p.description || undefined,
        retailPrice: p.price,
        cost: p.cost ?? 0,
      }));

    if (products.length === 0) {
      toast({ title: "No products to import", variant: "destructive" });
      return;
    }

    importMutation.mutate(products);
  };

  const resetImporter = () => {
    setFile(null);
    setStep('upload');
    setExtractedProducts([]);
    setDetectedManufacturer('');
    setManufacturerOverride('');
    setErrors([]);
    setImportResults(null);
    setRemovedIndices(new Set());
    setEditingCell(null);
    setProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const activeProducts = extractedProducts.filter((_, i) => !removedIndices.has(i));

  const getConfidenceBadge = (confidence?: number) => {
    if (confidence === undefined) return null;
    if (confidence >= 0.9) return <Badge variant="default" className="bg-green-100 text-green-800 text-xs">High</Badge>;
    if (confidence >= 0.7) return <Badge variant="default" className="bg-yellow-100 text-yellow-800 text-xs">Medium</Badge>;
    return <Badge variant="default" className="bg-red-100 text-red-800 text-xs">Low</Badge>;
  };

  const getProgressPercent = () => {
    if (!progress || progress.total === 0) return 0;
    if (progress.phase === 'done') return 100;
    return Math.round((progress.current / progress.total) * 100);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-teal-600" />
          AI Price Sheet Import
        </CardTitle>
        <CardDescription>
          Drop any manufacturer price sheet and AI will extract the products automatically
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {step === 'upload' && (
          <div className="space-y-4">
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                isDragOver ? 'border-teal-500 bg-teal-50' : 'border-gray-300 hover:border-gray-400'
              }`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium mb-1">Drop your price sheet here</h3>
              <p className="text-sm text-gray-500 mb-1">
                or click to browse
              </p>
              <p className="text-xs text-gray-400">
                Supports CSV, Excel (.xlsx/.xls), and PDF files
              </p>
              <Input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls,.pdf"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            {errors.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {errors.map((error, i) => <div key={i}>{error}</div>)}
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {step === 'processing' && (
          <div className="text-center py-12 space-y-4">
            <Loader2 className="mx-auto h-12 w-12 text-teal-600 animate-spin mb-4" />
            <h3 className="text-lg font-medium mb-2">AI is reading your price sheet...</h3>
            <p className="text-sm text-gray-500 mb-1">
              Analyzing <strong>{file?.name}</strong>
            </p>

            {progress && (
              <div className="max-w-md mx-auto space-y-2">
                <Progress value={getProgressPercent()} className="h-2" />
                <div className="flex justify-between items-center text-xs text-gray-500">
                  <span>{PHASE_LABELS[progress.phase] || progress.phase}</span>
                  <span>
                    {progress.total > 1 && `Chunk ${progress.current}/${progress.total} · `}
                    {progress.productsFound} products found
                  </span>
                </div>
              </div>
            )}

            {!progress && (
              <p className="text-xs text-gray-400">
                This may take 10-30 seconds depending on file size
              </p>
            )}
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4">
            <Alert className="border-teal-200 bg-teal-50">
              <Sparkles className="h-4 w-4 text-teal-600" />
              <AlertDescription className="text-teal-800">
                AI extracted <strong>{activeProducts.length}</strong> products from <strong>{file?.name}</strong>.
                Review below, edit any values, then click Import.
              </AlertDescription>
            </Alert>

            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <label className="text-sm font-medium whitespace-nowrap">Batch Manufacturer:</label>
              <Input
                value={manufacturerOverride}
                onChange={(e) => setManufacturerOverride(e.target.value)}
                placeholder="Apply to products without a manufacturer"
                className="max-w-sm"
              />
              {detectedManufacturer && manufacturerOverride !== detectedManufacturer && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setManufacturerOverride(detectedManufacturer)}
                  className="text-xs text-teal-600"
                >
                  Use detected: {detectedManufacturer}
                </Button>
              )}
            </div>

            <div className="bg-gray-50 rounded-lg max-h-[500px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-100 z-10">
                  <tr className="border-b">
                    <th className="text-left py-2 px-2 w-8"></th>
                    <th className="text-left py-2 px-2">Name</th>
                    <th className="text-left py-2 px-2">Manufacturer</th>
                    <th className="text-left py-2 px-2">Category</th>
                    <th className="text-left py-2 px-2">Unit</th>
                    <th className="text-right py-2 px-2">Retail Price</th>
                    <th className="text-right py-2 px-2">Cost</th>
                    <th className="text-center py-2 px-2">Confidence</th>
                    <th className="text-center py-2 px-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {extractedProducts.map((product, index) => {
                    if (removedIndices.has(index)) return null;
                    return (
                      <tr key={index} className="border-b hover:bg-white/50">
                        <td className="py-1 px-2 text-gray-400 text-xs">{index + 1}</td>
                        <td className="py-1 px-2">
                          {editingCell?.row === index && editingCell.field === 'name' ? (
                            <Input
                              autoFocus
                              defaultValue={product.name}
                              className="h-7 text-sm"
                              onBlur={(e) => { handleCellEdit(index, 'name', e.target.value); setEditingCell(null); }}
                              onKeyDown={(e) => { if (e.key === 'Enter') { handleCellEdit(index, 'name', (e.target as HTMLInputElement).value); setEditingCell(null); } }}
                            />
                          ) : (
                            <span className="cursor-pointer hover:underline" onClick={() => setEditingCell({ row: index, field: 'name' })}>
                              {product.name}
                            </span>
                          )}
                        </td>
                        <td className="py-1 px-2">
                          {editingCell?.row === index && editingCell.field === 'manufacturer' ? (
                            <Input
                              autoFocus
                              defaultValue={product.manufacturer || ''}
                              className="h-7 text-sm"
                              onBlur={(e) => { handleCellEdit(index, 'manufacturer', e.target.value); setEditingCell(null); }}
                              onKeyDown={(e) => { if (e.key === 'Enter') { handleCellEdit(index, 'manufacturer', (e.target as HTMLInputElement).value); setEditingCell(null); } }}
                            />
                          ) : (
                            <span className="cursor-pointer hover:underline text-gray-600" onClick={() => setEditingCell({ row: index, field: 'manufacturer' })}>
                              {product.manufacturer || <span className="text-gray-400 italic">batch</span>}
                            </span>
                          )}
                        </td>
                        <td className="py-1 px-2">
                          {editingCell?.row === index && editingCell.field === 'category' ? (
                            <Input
                              autoFocus
                              defaultValue={product.category || ''}
                              className="h-7 text-sm"
                              onBlur={(e) => { handleCellEdit(index, 'category', e.target.value); setEditingCell(null); }}
                              onKeyDown={(e) => { if (e.key === 'Enter') { handleCellEdit(index, 'category', (e.target as HTMLInputElement).value); setEditingCell(null); } }}
                            />
                          ) : (
                            <span className="cursor-pointer hover:underline text-gray-600" onClick={() => setEditingCell({ row: index, field: 'category' })}>
                              {product.category || '—'}
                            </span>
                          )}
                        </td>
                        <td className="py-1 px-2 text-gray-600">{product.unit || 'each'}</td>
                        <td className="py-1 px-2 text-right">
                          {editingCell?.row === index && editingCell.field === 'price' ? (
                            <Input
                              autoFocus
                              type="number"
                              step="0.01"
                              defaultValue={product.price}
                              className="h-7 text-sm text-right w-24 ml-auto"
                              onBlur={(e) => { handleCellEdit(index, 'price', e.target.value); setEditingCell(null); }}
                              onKeyDown={(e) => { if (e.key === 'Enter') { handleCellEdit(index, 'price', (e.target as HTMLInputElement).value); setEditingCell(null); } }}
                            />
                          ) : (
                            <span className="cursor-pointer hover:underline" onClick={() => setEditingCell({ row: index, field: 'price' })}>
                              ${product.price.toFixed(2)}
                            </span>
                          )}
                        </td>
                        <td className="py-1 px-2 text-right text-green-600">
                          {editingCell?.row === index && editingCell.field === 'cost' ? (
                            <Input
                              autoFocus
                              type="number"
                              step="0.01"
                              defaultValue={product.cost ?? 0}
                              className="h-7 text-sm text-right w-24 ml-auto"
                              onBlur={(e) => { handleCellEdit(index, 'cost', e.target.value); setEditingCell(null); }}
                              onKeyDown={(e) => { if (e.key === 'Enter') { handleCellEdit(index, 'cost', (e.target as HTMLInputElement).value); setEditingCell(null); } }}
                            />
                          ) : (
                            <span className="cursor-pointer hover:underline" onClick={() => setEditingCell({ row: index, field: 'cost' })}>
                              ${(product.cost ?? 0).toFixed(2)}
                            </span>
                          )}
                        </td>
                        <td className="py-1 px-2 text-center">
                          {getConfidenceBadge(product.confidence)}
                        </td>
                        <td className="py-1 px-2 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-gray-400 hover:text-red-500"
                            onClick={() => handleRemoveProduct(index)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {removedIndices.size > 0 && (
              <p className="text-xs text-gray-500">
                {removedIndices.size} product(s) removed from import
              </p>
            )}

            <div className="flex justify-between items-center">
              <Button variant="outline" onClick={resetImporter}>
                Start Over
              </Button>
              <div className="flex gap-3">
                <span className="text-sm text-gray-500 self-center">
                  {activeProducts.length} products ready
                </span>
                <Button
                  onClick={handleImport}
                  disabled={importMutation.isPending || activeProducts.length === 0}
                  className="bg-edg-black hover:bg-edg-grey text-white"
                >
                  {importMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>Import {activeProducts.length} Products</>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === 'results' && importResults && (
          <div className="space-y-4">
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                <strong>Import Complete!</strong>
                <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                  <div>Created: <strong>{importResults.created}</strong></div>
                  <div>Updated: <strong>{importResults.updated}</strong></div>
                  <div>Skipped: <strong>{importResults.skipped}</strong></div>
                </div>
              </AlertDescription>
            </Alert>

            {importResults.errors.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="font-semibold mb-1">{importResults.errors.length} error(s):</div>
                  <ul className="list-disc list-inside text-sm space-y-1">
                    {importResults.errors.slice(0, 10).map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                    {importResults.errors.length > 10 && (
                      <li>... and {importResults.errors.length - 10} more</li>
                    )}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            <div className="flex justify-center">
              <Button onClick={resetImporter} className="bg-edg-black hover:bg-edg-grey text-white">
                Import Another File
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
