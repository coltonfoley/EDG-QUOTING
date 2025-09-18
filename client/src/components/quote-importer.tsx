import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, FileText, Edit3, Check, X, Users, Trash2, AlertCircle, FileCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { calculateQuoteTotals } from "@/lib/utils";
import type { QuoteWithDetails, QuoteListItem } from "@shared/schema";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";

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
  sourceFileName?: string;
}

interface ProcessedPDF {
  file: File;
  data: ExtractedQuote | null;
  error: string | null;
  status: "pending" | "processing" | "success" | "failed";
}

interface QuoteImporterProps {
  onImportComplete?: () => void;
  onClose?: () => void;
}

export function QuoteImporter({ onImportComplete, onClose }: QuoteImporterProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [processedPDFs, setProcessedPDFs] = useState<ProcessedPDF[]>([]);
  const [currentProcessingIndex, setCurrentProcessingIndex] = useState<number>(-1);
  const [consolidatedData, setConsolidatedData] = useState<ExtractedQuote[]>([]);
  const [editedData, setEditedData] = useState<ExtractedQuote | null>(null);
  const [activeTab, setActiveTab] = useState("upload");
  const [importType, setImportType] = useState<"new" | "existing">("new");
  const [selectedQuoteId, setSelectedQuoteId] = useState<string>("");
  const [bulkMarkupValue, setBulkMarkupValue] = useState<string>("");
  const [accountMode, setAccountMode] = useState<"new" | "existing">("new");
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [importMode, setImportMode] = useState<"combined" | "separate">("combined");

  const { toast } = useToast();

  // Fetch existing quotes for "add to existing" option
  const { data: quotesData } = useQuery<QuoteWithDetails[]>({
    queryKey: ["/api/quotes"],
    enabled: importType === "existing",
  });

  // Fetch existing accounts for account selection
  const { data: accountsData } = useQuery<any[]>({
    queryKey: ["/api/accounts"],
    enabled: activeTab === "preview" && accountMode === "existing",
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

  // Update customer fields when an existing account is selected
  useEffect(() => {
    if (accountMode === "existing" && selectedAccountId && accountsData && editedData) {
      const selectedAccount = accountsData.find(acc => acc.id.toString() === selectedAccountId);
      if (selectedAccount) {
        setEditedData({
          ...editedData,
          customer: {
            name: selectedAccount.name || editedData.customer.name,
            email: selectedAccount.email || editedData.customer.email,
            phone: selectedAccount.phone || editedData.customer.phone,
            company: selectedAccount.company || editedData.customer.company,
            address: editedData.customer.address, // Keep address from PDF if available
          },
        });
      }
    }
  }, [selectedAccountId, accountMode, accountsData]);

  // Combine data from all successfully processed PDFs
  useEffect(() => {
    const successfulPDFs = processedPDFs.filter(p => p.status === "success" && p.data);
    if (successfulPDFs.length > 0) {
      const allData = successfulPDFs.map(p => ({
        ...p.data!,
        sourceFileName: p.file.name
      }));
      setConsolidatedData(allData);
      
      // Create combined data for editing
      const firstQuote = allData[0];
      const combinedLineItems = allData.flatMap(quote => 
        quote.lineItems.map(item => ({
          ...item,
          description: `[${quote.sourceFileName}] ${item.description}`
        }))
      );
      
      const combined: ExtractedQuote = {
        ...firstQuote,
        lineItems: combinedLineItems,
        sourceFileName: "Combined from " + allData.length + " PDFs"
      };
      
      setEditedData(combined);
    }
  }, [processedPDFs]);

  // Process a single PDF
  const processSinglePDF = async (file: File, index: number) => {
    setCurrentProcessingIndex(index);
    
    // Update status to processing
    setProcessedPDFs(prev => prev.map((p, i) => 
      i === index ? { ...p, status: "processing" as const } : p
    ));
    
    try {
      const formData = new FormData();
      formData.append("pdf", file);
      
      const response = await apiRequest("POST", "/api/quotes/import-pdf", formData, { timeout: 120000 });
      const data = await response.json();
      
      if (data.success && data.data) {
        // Update with success
        setProcessedPDFs(prev => prev.map((p, i) => 
          i === index ? { 
            ...p, 
            status: "success" as const, 
            data: { ...data.data, sourceFileName: file.name },
            error: null 
          } : p
        ));
        
        // Auto-select account for first successful PDF
        if (index === 0 && accountsData && data.data.customer) {
          const matchingAccount = accountsData.find(
            (account: any) => 
              account.email?.toLowerCase() === data.data.customer.email?.toLowerCase() ||
              account.name?.toLowerCase() === data.data.customer.name?.toLowerCase()
          );
          if (matchingAccount) {
            setAccountMode("existing");
            setSelectedAccountId(matchingAccount.id.toString());
          }
        }
        
        return true;
      } else {
        // Update with failure
        setProcessedPDFs(prev => prev.map((p, i) => 
          i === index ? { 
            ...p, 
            status: "failed" as const, 
            error: data.message || "Failed to extract quote data",
            data: null 
          } : p
        ));
        return false;
      }
    } catch (error: any) {
      // Update with error
      setProcessedPDFs(prev => prev.map((p, i) => 
        i === index ? { 
          ...p, 
          status: "failed" as const, 
          error: error.message || "Failed to process PDF",
          data: null 
        } : p
      ));
      return false;
    }
  };

  // Process all PDFs sequentially
  const processAllPDFs = async () => {
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < processedPDFs.length; i++) {
      if (processedPDFs[i].status === "pending") {
        const success = await processSinglePDF(processedPDFs[i].file, i);
        if (success) {
          successCount++;
        } else {
          failCount++;
        }
      }
    }
    
    setCurrentProcessingIndex(-1);
    
    // Show summary toast
    if (successCount > 0 && failCount === 0) {
      toast({
        title: "All PDFs Processed",
        description: `Successfully processed ${successCount} PDF${successCount > 1 ? 's' : ''}`
      });
      setActiveTab("preview");
    } else if (successCount > 0 && failCount > 0) {
      toast({
        title: "Partial Success",
        description: `Processed ${successCount} PDF${successCount > 1 ? 's' : ''}, ${failCount} failed`,
        variant: "default"
      });
      setActiveTab("preview");
    } else {
      toast({
        title: "Processing Failed",
        description: "All PDFs failed to process",
        variant: "destructive"
      });
    }
  };

  // Retry failed PDFs
  const retryFailedPDFs = async () => {
    const failedIndexes = processedPDFs
      .map((p, i) => p.status === "failed" ? i : -1)
      .filter(i => i >= 0);
    
    // Reset failed PDFs to pending
    setProcessedPDFs(prev => prev.map((p, i) => 
      failedIndexes.includes(i) ? { ...p, status: "pending" as const, error: null } : p
    ));
    
    // Process only the failed ones
    await processAllPDFs();
  };

  // Import quote mutation
  const importMutation = useMutation({
    mutationFn: async (data: ExtractedQuote) => {
      try {
        if (importType === "new") {
        // Create new quote with extracted data
        let accountId: number;
        
        if (accountMode === "new") {
          // Determine how to create the account based on whether both name and company are present
          const companyName = data.customer.company?.trim();
          const personName = data.customer.name?.trim();
          const hasCompany = companyName && companyName !== "";
          const hasPersonName = personName && personName !== "";
          
          if (hasCompany && hasPersonName && companyName && personName) {
            // Both company and person name exist - create/find company as account and person as contact
            
            // First, search for existing company account
            const searchResponse = await apiRequest("GET", `/api/accounts/search?q=${encodeURIComponent(companyName)}`, null, { timeout: 10000 });
            const searchResults = await searchResponse.json();
            
            // Check if company already exists (match by company name)
            let companyAccount = searchResults.find(
              (acc: any) => acc.name?.toLowerCase() === companyName.toLowerCase() || 
              acc.company?.toLowerCase() === companyName.toLowerCase()
            );
            
            if (!companyAccount) {
              // Create the company as a new account
              const companyData = {
                name: companyName,
                email: data.customer.email || `info@${companyName.toLowerCase().replace(/\s+/g, '')}.com`,
                phone: data.customer.phone || "000-000-0000",
                company: companyName,
                accountType: "commercial",
                billingAddress: data.customer.address || null,
              };
              
              const companyResponse = await apiRequest("POST", "/api/accounts", companyData, { timeout: 10000 });
              companyAccount = await companyResponse.json();
            }
            
            accountId = companyAccount.id;
            
            // Create the person as a contact for this company
            const contactData = {
              accountId: companyAccount.id,
              firstName: personName.split(' ')[0] || "First",
              lastName: personName.split(' ').slice(1).join(' ') || "Last",
              email: data.customer.email || `contact@${companyName.toLowerCase().replace(/\s+/g, '')}.com`,
              phone: data.customer.phone || null,
              role: "primary_contact",
              isPrimary: true,
            };
            
            await apiRequest("POST", "/api/contacts", contactData, { timeout: 10000 });
            
          } else if (hasCompany && !hasPersonName && companyName) {
            // Only company exists - create as account
            const companyData = {
              name: companyName,
              email: data.customer.email || `info@${companyName.toLowerCase().replace(/\s+/g, '')}.com`,
              phone: data.customer.phone || "000-000-0000",
              company: companyName,
              accountType: "commercial",
              billingAddress: data.customer.address || null,
            };
            
            const companyResponse = await apiRequest("POST", "/api/accounts", companyData, { timeout: 10000 });
            const company = await companyResponse.json();
            accountId = company.id;
            
          } else {
            // Only person name exists (or neither) - create as individual account
            const customerData = {
              name: data.customer.name || "Customer Name",
              email: data.customer.email || "customer@example.com",
              phone: data.customer.phone || "000-000-0000",
              company: null, // Don't set company for individual accounts
              accountType: "homeowner", // Individual account type
              billingAddress: data.customer.address || null,
            };
            
            const customerResponse = await apiRequest("POST", "/api/accounts", customerData, { timeout: 10000 });
            const customer = await customerResponse.json();
            accountId = customer.id;
          }
        } else {
          // Use existing account
          accountId = parseInt(selectedAccountId);
        }
        
        const quoteData = {
          accountId: accountId,
          customerId: accountId, // Backend requires this for backward compatibility
          quoteNumber: data.quoteNumber || `QT-${Date.now()}`,
          projectName: data.projectDescription || "Imported Project",
          projectAddress: data.customer.address || "",
          estimatedStartDate: "",
          notes: data.notes || "",
          taxRate: (data.taxRate || 0).toString(),
          discount: (data.discountAmount || 0).toString(),
          shipping: "0", // Required field for quote validation
          status: "draft" as const,
        };
        
        const quoteResponse = await apiRequest("POST", "/api/quotes", quoteData, { timeout: 10000 });
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
            discountType: "percentage", // Required field
            discountValue: "0", // Required field
          });
        }
        
        return { quote, accountId };
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
            discountType: "percentage", // Required field
            discountValue: "0", // Required field
          });
        }
        
        return { quoteId: selectedQuoteId };
      }
      } catch (error: any) {
        console.error("Import error:", error);
        const errorMessage = error?.response?.data?.message || error?.message || "Failed to import quote";
        throw new Error(errorMessage);
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
    onError: (error: any) => {
      console.error("Import mutation error:", error);
      toast({
        title: "Import Failed",
        description: error.message || "Failed to import quote data",
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    const pdfFiles: File[] = [];
    const nonPdfFiles: string[] = [];
    
    for (let i = 0; i < files.length; i++) {
      if (files[i].type === "application/pdf") {
        pdfFiles.push(files[i]);
      } else {
        nonPdfFiles.push(files[i].name);
      }
    }
    
    if (nonPdfFiles.length > 0) {
      toast({
        title: "Invalid Files Skipped",
        description: `Non-PDF files were skipped: ${nonPdfFiles.join(", ")}`,
        variant: "default",
      });
    }
    
    if (pdfFiles.length > 0) {
      setSelectedFiles(pdfFiles);
      setProcessedPDFs(pdfFiles.map(file => ({
        file,
        data: null,
        error: null,
        status: "pending" as const
      })));
      
      // Reset other state when new files are selected
      setConsolidatedData([]);
      setEditedData(null);
      setActiveTab("upload");
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setProcessedPDFs(prev => prev.filter((_, i) => i !== index));
    
    if (selectedFiles.length <= 1) {
      setConsolidatedData([]);
      setEditedData(null);
    }
  };

  const clearAllFiles = () => {
    setSelectedFiles([]);
    setProcessedPDFs([]);
    setConsolidatedData([]);
    setEditedData(null);
    setCurrentProcessingIndex(-1);
    setActiveTab("upload");
  };

  const handleProcessPdfs = () => {
    if (processedPDFs.length > 0) {
      processAllPDFs();
    }
  };

  const handleImport = async () => {
    if (importMode === "combined" && editedData) {
      importMutation.mutate(editedData);
    } else if (importMode === "separate" && consolidatedData.length > 0) {
      // Import each PDF as a separate quote
      let successCount = 0;
      let failCount = 0;
      
      for (const quoteData of consolidatedData) {
        try {
          await importMutation.mutateAsync(quoteData);
          successCount++;
        } catch (error) {
          failCount++;
        }
      }
      
      if (successCount > 0) {
        toast({
          title: "Import Complete",
          description: `Created ${successCount} quote${successCount > 1 ? 's' : ''}${failCount > 0 ? `, ${failCount} failed` : ''}`,
        });
        onImportComplete?.();
        onClose?.();
      }
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
            <TabsTrigger value="upload">Upload PDF{selectedFiles.length > 1 ? 's' : ''}</TabsTrigger>
            <TabsTrigger value="preview" disabled={!editedData}>
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
                  Select PDF Quote(s) to Import
                </Label>
                <p className="text-sm text-gray-500">
                  Upload one or more PDF quotes from external configurators or contractors
                </p>
                <p className="text-xs text-blue-600 bg-blue-50 p-2 rounded">
                  💡 Pro tip: You can upload multiple PDFs to combine quotes from different suppliers into one project
                </p>
                <Input
                  id="pdf-upload"
                  type="file"
                  accept=".pdf"
                  multiple
                  onChange={handleFileSelect}
                  className="max-w-sm mx-auto"
                  data-testid="input-pdf-upload"
                />
              </div>
            </div>

            {selectedFiles.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">
                    {selectedFiles.length} PDF{selectedFiles.length > 1 ? 's' : ''} selected
                  </h3>
                  {selectedFiles.length > 1 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={clearAllFiles}
                      data-testid="button-clear-all-files"
                    >
                      <X className="h-3 w-3 mr-1" />
                      Clear All
                    </Button>
                  )}
                </div>

                <ScrollArea className="h-[200px] w-full rounded-md border p-4">
                  <div className="space-y-2">
                    {processedPDFs.map((pdf, index) => (
                      <div
                        key={index}
                        className={`flex items-center justify-between p-3 rounded-lg ${
                          pdf.status === 'failed' ? 'bg-red-50' :
                          pdf.status === 'success' ? 'bg-green-50' :
                          pdf.status === 'processing' ? 'bg-blue-50' :
                          'bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-2 flex-1">
                          {pdf.status === 'processing' ? (
                            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                          ) : pdf.status === 'success' ? (
                            <FileCheck className="h-4 w-4 text-green-600" />
                          ) : pdf.status === 'failed' ? (
                            <AlertCircle className="h-4 w-4 text-red-600" />
                          ) : (
                            <FileText className="h-4 w-4 text-gray-600" />
                          )}
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{pdf.file.name}</span>
                              <Badge variant="secondary" className="text-xs">
                                {(pdf.file.size / 1024 / 1024).toFixed(2)} MB
                              </Badge>
                            </div>
                            {currentProcessingIndex === index && (
                              <p className="text-xs text-blue-600 mt-1">
                                Processing file {index + 1} of {processedPDFs.length}...
                              </p>
                            )}
                            {pdf.error && (
                              <p className="text-xs text-red-600 mt-1">{pdf.error}</p>
                            )}
                            {pdf.status === 'success' && pdf.data && (
                              <p className="text-xs text-green-600 mt-1">
                                Extracted {pdf.data.lineItems.length} line items
                              </p>
                            )}
                          </div>
                        </div>
                        {pdf.status !== 'processing' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeFile(index)}
                            data-testid={`button-remove-file-${index}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>

                <div className="flex gap-2">
                  <Button
                    onClick={handleProcessPdfs}
                    disabled={currentProcessingIndex >= 0 || processedPDFs.every(p => p.status !== 'pending')}
                    className="flex-1"
                    data-testid="button-process-pdfs"
                  >
                    {currentProcessingIndex >= 0 ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Processing {currentProcessingIndex + 1} of {processedPDFs.length}...
                      </>
                    ) : (
                      <>Process {selectedFiles.length > 1 ? 'All PDFs' : 'PDF'}</>
                    )}
                  </Button>
                  
                  {processedPDFs.some(p => p.status === 'failed') && (
                    <Button
                      variant="outline"
                      onClick={retryFailedPDFs}
                      disabled={currentProcessingIndex >= 0}
                      data-testid="button-retry-failed"
                    >
                      Retry Failed
                    </Button>
                  )}
                </div>
              </div>
            )}
          </TabsContent>

          {/* Preview & Edit Tab */}
          <TabsContent value="preview" className="space-y-6">
            {editedData && (
              <>
                {/* Processing Summary for Multiple PDFs */}
                {selectedFiles.length > 1 && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      <div className="space-y-1">
                        <p className="font-medium">Processing Summary:</p>
                        <p className="text-sm">
                          • Successfully processed {processedPDFs.filter(p => p.status === 'success').length} of {processedPDFs.length} PDFs
                        </p>
                        {consolidatedData.length > 0 && (
                          <p className="text-sm">
                            • Total line items: {consolidatedData.reduce((acc, q) => acc + q.lineItems.length, 0)}
                          </p>
                        )}
                        {importMode === "combined" && (
                          <p className="text-sm text-blue-600">
                            • All items will be combined into a single quote
                          </p>
                        )}
                      </div>
                    </AlertDescription>
                  </Alert>
                )}

                {/* Account Selection */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    <h3 className="text-lg font-semibold">Account Selection</h3>
                  </div>
                  <div className="space-y-4">
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          checked={accountMode === "new"}
                          onChange={() => {
                            setAccountMode("new");
                            setSelectedAccountId("");
                          }}
                          className="w-4 h-4"
                        />
                        <span>Create New Account</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          checked={accountMode === "existing"}
                          onChange={() => setAccountMode("existing")}
                          className="w-4 h-4"
                        />
                        <span>Use Existing Account</span>
                      </label>
                    </div>
                    
                    {accountMode === "existing" && (
                      <div>
                        <Label htmlFor="account-select">Select Account</Label>
                        <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                          <SelectTrigger id="account-select">
                            <SelectValue placeholder="Select an existing account" />
                          </SelectTrigger>
                          <SelectContent>
                            {accountsData?.map((account: any) => (
                              <SelectItem key={account.id} value={account.id.toString()}>
                                {account.name} ({account.email})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Customer Information */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Edit3 className="h-4 w-4" />
                    <h3 className="text-lg font-semibold">
                      {accountMode === "new" ? "New Account Details" : "Quote Contact Information"}
                    </h3>
                    {accountMode === "existing" && (
                      <span className="text-sm text-gray-500">
                        (These details are from the PDF and won't update the selected account)
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="customer-name">Customer Name</Label>
                      <Input
                        id="customer-name"
                        value={editedData.customer.name}
                        onChange={(e) => updateCustomerField("name", e.target.value)}
                        disabled={accountMode === "existing"}
                      />
                    </div>
                    <div>
                      <Label htmlFor="customer-email">Email</Label>
                      <Input
                        id="customer-email"
                        value={editedData.customer.email || ""}
                        onChange={(e) => updateCustomerField("email", e.target.value)}
                        disabled={accountMode === "existing"}
                      />
                    </div>
                    <div>
                      <Label htmlFor="customer-phone">Phone</Label>
                      <Input
                        id="customer-phone"
                        value={editedData.customer.phone || ""}
                        onChange={(e) => updateCustomerField("phone", e.target.value)}
                        disabled={accountMode === "existing"}
                      />
                    </div>
                    <div>
                      <Label htmlFor="customer-company">Company</Label>
                      <Input
                        id="customer-company"
                        value={editedData.customer.company || ""}
                        onChange={(e) => updateCustomerField("company", e.target.value)}
                        disabled={accountMode === "existing"}
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
                    <h3 className="text-lg font-semibold">
                      Line Items {selectedFiles.length > 1 && `(${editedData.lineItems.length} total from ${consolidatedData.length} PDFs)`}
                    </h3>
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
              
              {/* Import Mode Selection for Multiple PDFs */}
              {selectedFiles.length > 1 && (
                <div className="space-y-4">
                  <Label>How should the PDFs be imported?</Label>
                  <RadioGroup value={importMode} onValueChange={(value) => setImportMode(value as "combined" | "separate")}>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="combined" id="combined" />
                      <Label htmlFor="combined" className="font-normal cursor-pointer">
                        Combine all PDFs into a single quote (recommended)
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="separate" id="separate" />
                      <Label htmlFor="separate" className="font-normal cursor-pointer">
                        Create separate quotes for each PDF ({consolidatedData.length} quotes will be created)
                      </Label>
                    </div>
                  </RadioGroup>
                  <Separator />
                </div>
              )}
              
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
                    Import {importMode === 'separate' && selectedFiles.length > 1 ? 
                      `${consolidatedData.length} Quotes` : 
                      selectedFiles.length > 1 ? 'Combined Quote' : 'Quote'
                    }
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