import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, FileText, Edit3, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { calculateQuoteTotals } from "@/lib/utils";
import type { QuoteWithDetails, QuoteListItem } from "@shared/schema";

interface ExtractedLineItem {
  description: string;
  quantity: number;
  price: number;
  cost?: number; // Our actual cost for margin calculation
  total: number;
  unit?: string | null;
}

interface ExtractedCustomer {
  name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  address?: string | null;
}

interface ExtractedQuote {
  customer: ExtractedCustomer;
  quoteNumber?: string | null;
  date?: string | null;
  projectDescription?: string | null;
  lineItems: ExtractedLineItem[];
  subtotal?: number | null;
  taxRate?: number | null;
  taxAmount?: number | null;
  discountAmount?: number | null;
  total?: number | null;
  notes?: string | null;
  terms?: string | null;
}

interface QuoteImporterProps {
  onImportComplete?: () => void;
  onClose?: () => void;
}

export function QuoteImporter({ onImportComplete, onClose }: QuoteImporterProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedQuote | null>(null);
  const [editedData, setEditedData] = useState<ExtractedQuote | null>(null);
  const [activeTab, setActiveTab] = useState("upload");
  const [importType, setImportType] = useState<"new" | "existing">("new");
  const [selectedQuoteId, setSelectedQuoteId] = useState<string>("");
  const [bulkMarkupValue, setBulkMarkupValue] = useState<string>("");

  const { toast } = useToast();

  // Fetch existing quotes for "add to existing" option
  const { data: quotesData } = useQuery<QuoteWithDetails[]>({
    queryKey: ["/api/quotes"],
    enabled: importType === "existing",
  });

  // Transform quotes to include calculated totals
  const quotes = useMemo<QuoteListItem[]>(() => {
    if (!quotesData) return [];
    
    return quotesData.map(quote => {
      const totals = calculateQuoteTotals(
        quote.lineItems,
        quote.taxRate || "0",
        quote.discount || "0",
        quote.shipping || "0"
      );
      
      return {
        ...quote,
        total: totals.total,
      };
    });
  }, [quotesData]);

  // PDF processing mutation
  const processPdfMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("pdf", file);
      
      const response = await apiRequest("POST", "/api/quotes/import-pdf", formData);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success && data.data) {
        setExtractedData(data.data);
        setEditedData(data.data);
        setActiveTab("preview");
        toast({
          title: "PDF Processed",
          description: "Quote data extracted successfully. Please review and edit as needed.",
        });
      } else {
        toast({
          title: "Extraction Failed",
          description: data.message || "Failed to extract quote data from PDF",
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Processing Failed",
        description: error.message || "Failed to process PDF file",
        variant: "destructive",
      });
    },
  });

  // Import quote mutation
  const importMutation = useMutation({
    mutationFn: async (data: ExtractedQuote) => {
      if (importType === "new") {
        // Create new quote with extracted data
        // Ensure required customer fields have values
        const customerData = {
          name: data.customer.name || "Customer Name",
          email: data.customer.email || "customer@example.com", 
          phone: data.customer.phone || "000-000-0000",
          company: data.customer.company || null,
        };
        
        const customerResponse = await apiRequest("POST", "/api/customers", customerData);
        const customer = await customerResponse.json();
        
        const quoteData = {
          customerId: customer.id,
          quoteNumber: data.quoteNumber || `QT-${Date.now()}`,
          projectName: data.projectDescription || "Imported Project",
          projectAddress: data.customer.address || "",
          estimatedStartDate: "",
          notes: data.notes || "",
          taxRate: (data.taxRate || 0).toString(),
          discount: (data.discountAmount || 0).toString(),
          status: "draft" as const,
        };
        
        const quoteResponse = await apiRequest("POST", "/api/quotes", quoteData);
        const quote = await quoteResponse.json();
        
        // Add line items
        for (const item of data.lineItems) {
          // Calculate markup based on cost vs selling price
          let unitPrice: string;
          let markupValue: string;
          
          if (item.cost && item.cost > 0) {
            // Use cost as unit price and calculate markup to reach selling price
            unitPrice = item.cost.toString();
            const markupPercentage = ((item.price - item.cost) / item.cost) * 100;
            // Round to 2 decimal places for precision, allow negative markups
            markupValue = (Math.round(markupPercentage * 100) / 100).toString();
          } else {
            // When cost is not provided or is 0, treat PDF price as cost with no markup
            unitPrice = item.price?.toString() || "0";
            markupValue = "0";
          }
          
          await apiRequest("POST", `/api/quotes/${quote.id}/line-items`, {
            description: item.description || "Imported Item",
            quantity: item.quantity?.toString() || "1",
            unitPrice,
            markupType: "percentage",
            markupValue,
          });
        }
        
        return { quote, customer };
      } else {
        // Add line items to existing quote
        if (!selectedQuoteId) {
          throw new Error("Please select a quote to add items to");
        }
        
        for (const item of data.lineItems) {
          // Calculate markup based on cost vs selling price
          let unitPrice: string;
          let markupValue: string;
          
          if (item.cost && item.cost > 0) {
            // Use cost as unit price and calculate markup to reach selling price
            unitPrice = item.cost.toString();
            const markupPercentage = ((item.price - item.cost) / item.cost) * 100;
            // Round to 2 decimal places for precision, allow negative markups
            markupValue = (Math.round(markupPercentage * 100) / 100).toString();
          } else {
            // When cost is not provided or is 0, treat PDF price as cost with no markup
            unitPrice = item.price?.toString() || "0";
            markupValue = "0";
          }
          
          await apiRequest("POST", `/api/quotes/${selectedQuoteId}/line-items`, {
            description: item.description || "Imported Item",
            quantity: item.quantity?.toString() || "1",
            unitPrice,
            markupType: "percentage",
            markupValue,
          });
        }
        
        return { quoteId: selectedQuoteId };
      }
    },
    onSuccess: (result) => {
      toast({
        title: "Import Successful",
        description: importType === "new" 
          ? `Created new quote ${result.quote?.quoteNumber}`
          : `Added ${editedData?.lineItems.length} items to quote`,
      });
      onImportComplete?.();
      onClose?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Import Failed",
        description: error.message || "Failed to import quote data",
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === "application/pdf") {
      setSelectedFile(file);
    } else {
      toast({
        title: "Invalid File",
        description: "Please select a PDF file",
        variant: "destructive",
      });
    }
  };

  const handleProcessPdf = () => {
    if (selectedFile) {
      processPdfMutation.mutate(selectedFile);
    }
  };

  const handleImport = () => {
    if (editedData) {
      importMutation.mutate(editedData);
    }
  };

  const updateCustomerField = (field: keyof ExtractedCustomer, value: string) => {
    if (!editedData) return;
    setEditedData({
      ...editedData,
      customer: {
        ...editedData.customer,
        [field]: value,
      },
    });
  };

  const updateLineItem = (index: number, field: keyof ExtractedLineItem, value: string | number | undefined) => {
    if (!editedData) return;
    const updatedLineItems = [...editedData.lineItems];
    updatedLineItems[index] = {
      ...updatedLineItems[index],
      [field]: value,
    };
    
    // Recalculate total if quantity or price changed
    if (field === "quantity" || field === "price") {
      updatedLineItems[index].total = updatedLineItems[index].quantity * updatedLineItems[index].price;
    }
    
    setEditedData({
      ...editedData,
      lineItems: updatedLineItems,
    });
  };

  const removeLineItem = (index: number) => {
    if (!editedData) return;
    const updatedLineItems = editedData.lineItems.filter((_, i) => i !== index);
    setEditedData({
      ...editedData,
      lineItems: updatedLineItems,
    });
  };

  const applyBulkMarkup = () => {
    if (!editedData) return;
    
    const markupPercentage = parseFloat(bulkMarkupValue);
    
    // Validate markup value
    if (isNaN(markupPercentage)) {
      toast({
        title: "Invalid Markup",
        description: "Please enter a valid number for markup percentage",
        variant: "destructive",
      });
      return;
    }
    
    if (markupPercentage < 0) {
      toast({
        title: "Invalid Markup",
        description: "Markup percentage cannot be negative",
        variant: "destructive",
      });
      return;
    }
    
    const updatedLineItems = editedData.lineItems.map(item => {
      // Calculate cost from selling price and markup percentage
      // Formula: cost = selling price / (1 + markup/100)
      const cost = item.price / (1 + markupPercentage / 100);
      return {
        ...item,
        cost: Math.round(cost * 100) / 100, // Round to 2 decimal places
      };
    });
    
    setEditedData({
      ...editedData,
      lineItems: updatedLineItems,
    });
    
    toast({
      title: "Bulk Markup Applied",
      description: `Applied ${markupPercentage}% markup to all ${updatedLineItems.length} items`,
    });
    
    // Clear the input after successful application
    setBulkMarkupValue("");
  };

  const clearAllCosts = () => {
    if (!editedData) return;
    
    const updatedLineItems = editedData.lineItems.map(item => ({
      ...item,
      cost: undefined,
    }));
    
    setEditedData({
      ...editedData,
      lineItems: updatedLineItems,
    });
    
    toast({
      title: "Costs Cleared",
      description: "All cost information has been cleared",
    });
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          PDF Quote Importer
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="upload">Upload PDF</TabsTrigger>
            <TabsTrigger value="preview" disabled={!extractedData}>
              Preview & Edit
            </TabsTrigger>
            <TabsTrigger value="import" disabled={!editedData}>
              Import Options
            </TabsTrigger>
          </TabsList>

          {/* Upload Tab */}
          <TabsContent value="upload" className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <Upload className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <div className="space-y-2">
                <Label htmlFor="pdf-upload" className="text-lg font-medium cursor-pointer">
                  Select PDF Quote to Import
                </Label>
                <p className="text-sm text-gray-500">
                  Upload a PDF quote from external configurators or contractors
                </p>
                <p className="text-xs text-blue-600 bg-blue-50 p-2 rounded">
                  💡 Pro tip: You can upload multiple PDFs to combine quotes from different suppliers into one project
                </p>
                <Input
                  id="pdf-upload"
                  type="file"
                  accept=".pdf"
                  onChange={handleFileSelect}
                  className="max-w-sm mx-auto"
                />
              </div>
            </div>

            {selectedFile && (
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  <span className="font-medium">{selectedFile.name}</span>
                  <Badge variant="secondary">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </Badge>
                </div>
                <Button
                  onClick={handleProcessPdf}
                  disabled={processPdfMutation.isPending}
                >
                  {processPdfMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    "Process PDF"
                  )}
                </Button>
              </div>
            )}
          </TabsContent>

          {/* Preview & Edit Tab */}
          <TabsContent value="preview" className="space-y-6">
            {editedData && (
              <>
                {/* Customer Information */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Edit3 className="h-4 w-4" />
                    <h3 className="text-lg font-semibold">Customer Information</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="customer-name">Customer Name</Label>
                      <Input
                        id="customer-name"
                        value={editedData.customer.name}
                        onChange={(e) => updateCustomerField("name", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="customer-email">Email</Label>
                      <Input
                        id="customer-email"
                        value={editedData.customer.email || ""}
                        onChange={(e) => updateCustomerField("email", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="customer-phone">Phone</Label>
                      <Input
                        id="customer-phone"
                        value={editedData.customer.phone || ""}
                        onChange={(e) => updateCustomerField("phone", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="customer-company">Company</Label>
                      <Input
                        id="customer-company"
                        value={editedData.customer.company || ""}
                        onChange={(e) => updateCustomerField("company", e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Project Details */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Project Details</h3>
                  <div>
                    <Label htmlFor="project-description">Project Description</Label>
                    <Textarea
                      id="project-description"
                      value={editedData.projectDescription || ""}
                      onChange={(e) =>
                        setEditedData({
                          ...editedData,
                          projectDescription: e.target.value,
                        })
                      }
                      rows={3}
                    />
                  </div>
                </div>

                <Separator />

                {/* Line Items */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Line Items</h3>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="bulk-markup">Bulk Markup %:</Label>
                        <Input
                          id="bulk-markup"
                          type="number"
                          step="0.1"
                          placeholder="25"
                          className="w-20"
                          value={bulkMarkupValue}
                          onChange={(e) => setBulkMarkupValue(e.target.value)}
                          data-testid="input-bulk-markup"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={applyBulkMarkup}
                          disabled={!bulkMarkupValue.trim()}
                          data-testid="button-apply-bulk-markup"
                        >
                          Apply
                        </Button>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={clearAllCosts}
                        data-testid="button-clear-costs"
                      >
                        Clear Costs
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600">
                    💡 Enter your costs for each item to see true margins, or use bulk markup to calculate costs from selling prices
                  </p>
                  <div className="space-y-2">
                    {editedData.lineItems.map((item, index) => (
                      <div key={index} className="p-4 border rounded-lg">
                        <div className="grid grid-cols-6 gap-4 items-end">
                          <div>
                            <Label>Description</Label>
                            <Input
                              value={item.description}
                              onChange={(e) =>
                                updateLineItem(index, "description", e.target.value)
                              }
                            />
                          </div>
                          <div>
                            <Label>Quantity</Label>
                            <Input
                              type="number"
                              value={item.quantity}
                              onChange={(e) =>
                                updateLineItem(index, "quantity", parseFloat(e.target.value) || 0)
                              }
                            />
                          </div>
                          <div>
                            <Label>Our Cost</Label>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="Enter cost"
                              value={item.cost || ""}
                              onChange={(e) =>
                                updateLineItem(index, "cost", parseFloat(e.target.value) || undefined)
                              }
                              data-testid={`input-cost-${index}`}
                            />
                          </div>
                          <div>
                            <Label>Selling Price</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={item.price}
                              onChange={(e) =>
                                updateLineItem(index, "price", parseFloat(e.target.value) || 0)
                              }
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1">
                              <Label>Total</Label>
                              <div className="text-lg font-semibold">
                                ${item.total.toFixed(2)}
                              </div>
                              {item.cost && (
                                <div className="text-sm text-green-600 font-medium">
                                  Margin: ${((item.price - item.cost) * item.quantity).toFixed(2)} 
                                  ({(((item.price - item.cost) / item.cost) * 100).toFixed(1)}%)
                                </div>
                              )}
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => removeLineItem(index)}
                              data-testid={`button-remove-${index}`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button onClick={() => setActiveTab("import")}>
                    Continue to Import
                  </Button>
                </div>
              </>
            )}
          </TabsContent>

          {/* Import Options Tab */}
          <TabsContent value="import" className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Import Options</h3>
              
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id="new-quote"
                    value="new"
                    checked={importType === "new"}
                    onChange={(e) => setImportType(e.target.value as "new" | "existing")}
                  />
                  <Label htmlFor="new-quote">Create New Quote</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id="existing-quote"
                    value="existing"
                    checked={importType === "existing"}
                    onChange={(e) => setImportType(e.target.value as "new" | "existing")}
                  />
                  <Label htmlFor="existing-quote">Add to Existing Quote</Label>
                </div>
              </div>

              {importType === "existing" && (
                <div className="space-y-3">
                  <Label htmlFor="quote-select">Select Quote to Add Items To</Label>
                  <Select value={selectedQuoteId} onValueChange={setSelectedQuoteId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a quote to add items to" />
                    </SelectTrigger>
                    <SelectContent>
                      {quotes?.map((quote) => (
                        <SelectItem key={quote.id} value={quote.id.toString()}>
                          <div className="flex justify-between items-center w-full">
                            <div className="flex flex-col items-start">
                              <div className="font-semibold">{quote.quoteNumber}</div>
                              <div className="text-sm text-gray-600">
                                {quote.customer.name || 'Unknown Customer'} - {quote.projectName || 'Untitled Project'}
                              </div>
                            </div>
                            <div className="text-right text-sm">
                              <div className="font-medium">${quote.total.toFixed(2)}</div>
                              <div className="text-gray-500">{quote.lineItems.length} items</div>
                            </div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  {/* Enhanced Preview of Selected Quote */}
                  {selectedQuoteId && quotes && (
                    <div className="p-3 bg-gray-50 rounded-lg border">
                      {(() => {
                        const selectedQuote = quotes.find(q => q.id.toString() === selectedQuoteId);
                        if (!selectedQuote) return null;
                        return (
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <h4 className="font-semibold text-sm">Selected Quote: {selectedQuote.quoteNumber}</h4>
                              <Badge variant={selectedQuote.status === 'approved' ? 'default' : 'secondary'}>
                                {selectedQuote.status}
                              </Badge>
                            </div>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div>
                                <span className="text-gray-600">Customer:</span> {selectedQuote.customer.name || 'Unknown'}
                              </div>
                              <div>
                                <span className="text-gray-600">Project:</span> {selectedQuote.projectName || 'Untitled'}
                              </div>
                              <div>
                                <span className="text-gray-600">Current Items:</span> {selectedQuote.lineItems.length}
                              </div>
                              <div>
                                <span className="text-gray-600">Current Total:</span> ${selectedQuote.total.toFixed(2)}
                              </div>
                            </div>
                            <div className="text-xs text-blue-600 bg-blue-50 p-2 rounded mt-2">
                              💡 Adding {editedData?.lineItems.length || 0} new items (${editedData?.lineItems.reduce((sum, item) => sum + item.total, 0).toFixed(2) || '0.00'}) 
                              → New total: ${(selectedQuote.total + (editedData?.lineItems.reduce((sum, item) => sum + item.total, 0) || 0)).toFixed(2)}
                            </div>
                            
                            {/* Duplicate Detection Warning */}
                            {(() => {
                              if (!editedData?.lineItems || !selectedQuote.lineItems) return null;
                              const potentialDuplicates = editedData.lineItems.filter(newItem =>
                                selectedQuote.lineItems.some((existingItem: any) =>
                                  existingItem.description.toLowerCase().includes(newItem.description.toLowerCase().slice(0, 20)) ||
                                  newItem.description.toLowerCase().includes(existingItem.description.toLowerCase().slice(0, 20))
                                )
                              );
                              
                              if (potentialDuplicates.length === 0) return null;
                              
                              return (
                                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 p-2 rounded mt-1">
                                  ⚠️ Potential duplicates detected: {potentialDuplicates.length} items may already exist in this quote.
                                  <details className="mt-1">
                                    <summary className="cursor-pointer text-amber-800 font-medium">Show potential duplicates</summary>
                                    <ul className="mt-1 space-y-1 text-amber-800">
                                      {potentialDuplicates.map((item, idx) => (
                                        <li key={idx}>• {item.description}</li>
                                      ))}
                                    </ul>
                                  </details>
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}
            </div>

            <Separator />

            {/* Summary */}
            <div className="space-y-2">
              <h4 className="font-semibold">Import Summary</h4>
              <p className="text-sm text-gray-600">
                {importType === "new" 
                  ? `Creating new quote for ${editedData?.customer.name}`
                  : `Adding ${editedData?.lineItems.length} line items to selected quote`
                }
              </p>
              <p className="text-sm text-gray-600">
                Total Items: {editedData?.lineItems.length}
              </p>
              <p className="text-sm text-gray-600">
                Total Value: ${editedData?.lineItems.reduce((sum, item) => sum + item.total, 0).toFixed(2)}
              </p>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setActiveTab("preview")}>
                Back to Edit
              </Button>
              <Button
                onClick={handleImport}
                disabled={importMutation.isPending || (importType === "existing" && !selectedQuoteId)}
              >
                {importMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Import Quote
                  </>
                )}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}