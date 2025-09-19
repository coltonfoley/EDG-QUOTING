import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, Package, Search, Filter, X, FileText, Loader2 } from "lucide-react";
import { formatCurrency, calculateLineItemTotal, calculateLineItemMargin, applyDiscountToPrice, isValidNumber, clampValue, roundCurrency } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { LineItem, Product } from "@shared/schema";

interface LineItemsTableProps {
  quoteId: number;
  lineItems: LineItem[];
}

export function LineItemsTable({ quoteId, lineItems }: LineItemsTableProps) {
  // Check if quote is new (not saved yet)
  const isUnsavedQuote = !quoteId || quoteId === 0;
  
  const [newItem, setNewItem] = useState({
    description: "",
    quantity: "1",
    retailPrice: "",
    unitPrice: "0",
    discountType: "percentage" as "percentage" | "dollar",
    discountValue: "0",
    markupType: "percentage" as "percentage" | "dollar",
    markupValue: "0",
  });
  const [showNewItemForm, setShowNewItemForm] = useState(false);
  const [showProductDialog, setShowProductDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [showDimensionDialog, setShowDimensionDialog] = useState(false);
  const [selectedConfigurableProduct, setSelectedConfigurableProduct] = useState<Product | null>(null);
  const [dimensions, setDimensions] = useState({ length: "", width: "" });
  const [calculatedPrice, setCalculatedPrice] = useState<number | null>(null);
  const [isCleaningDescriptions, setIsCleaningDescriptions] = useState(false);
  
  // Debounced save timeout refs
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  
  // Refs for tracking pending mutations to cancel them on unmount
  const pendingMutations = useRef<{
    create: any;
    update: Record<string, any>;
    delete: any;
    calculate: any;
  }>({
    create: null,
    update: {},
    delete: null,
    calculate: null,
  });
  
  // Local state for immediate edit feedback
  const [localValues, setLocalValues] = useState<Record<string, { 
    description: string; 
    quantity: string; 
    unitPrice: string; 
    markupType: string; 
    markupValue: string; 
  }>>({});
  
  // Validation error states
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [newItemErrors, setNewItemErrors] = useState<Record<string, string>>({});

  // Cleanup debounce timers and cancel pending mutations on unmount
  useEffect(() => {
    return () => {
      // Clear debounce timers
      Object.values(debounceTimers.current).forEach(timer => clearTimeout(timer));
      
      // Cancel all pending mutations using React Query's built-in cancellation
      try {
        if (pendingMutations.current.create) {
          pendingMutations.current.create.abort?.();
        }
        if (pendingMutations.current.delete) {
          pendingMutations.current.delete.abort?.();
        }
        if (pendingMutations.current.calculate) {
          pendingMutations.current.calculate.abort?.();
        }
        Object.values(pendingMutations.current.update).forEach(mutation => {
          if (mutation?.abort) {
            mutation.abort();
          }
        });
      } catch (error) {
        // Silently handle any abort errors during cleanup
      }
    };
  }, []);

  // Initialize local values when lineItems change
  useEffect(() => {
    const newLocalValues: Record<string, { 
      description: string; 
      quantity: string; 
      unitPrice: string; 
      markupType: string; 
      markupValue: string; 
    }> = {};
    lineItems.forEach(item => {
      newLocalValues[item.id] = {
        description: item.description,
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toString(),
        markupType: item.markupType,
        markupValue: item.markupValue.toString()
      };
    });
    setLocalValues(newLocalValues);
  }, [lineItems]);

  // Helper function to get current value (local or from props)
  const getCurrentValue = (itemId: number, field: 'description' | 'quantity' | 'unitPrice' | 'markupType' | 'markupValue') => {
    return localValues[itemId]?.[field] ?? 
      (field === 'description' ? lineItems.find(item => item.id === itemId)?.description || '' :
       field === 'quantity' ? lineItems.find(item => item.id === itemId)?.quantity.toString() || '0' :
       field === 'unitPrice' ? lineItems.find(item => item.id === itemId)?.unitPrice.toString() || '0' :
       field === 'markupType' ? lineItems.find(item => item.id === itemId)?.markupType || 'percentage' :
       lineItems.find(item => item.id === itemId)?.markupValue.toString() || '0');
  };

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: products } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  // Helper function to get product by ID
  const getProductById = (productId: number | null) => {
    if (!productId || !products) return null;
    return products.find(p => p.id === productId) || null;
  };

  // Immediate local update with debounced server save
  const handleFieldChange = useCallback((itemId: number, field: string, value: any) => {
    const key = `${itemId}-${field}`;
    
    // Update local state immediately for instant feedback
    setLocalValues(prev => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] ?? {}),
        [field]: value
      }
    }));
    
    // Clear existing timer for this field
    if (debounceTimers.current[key]) {
      clearTimeout(debounceTimers.current[key]);
    }
    
    // Validate the value
    let validationError = "";
    if (field === "description") {
      if (!value || value.trim().length === 0) {
        validationError = "Description is required";
      } else if (value.trim().length < 2) {
        validationError = "Description must be at least 2 characters";
      } else if (value.length > 500) {
        validationError = "Description must be less than 500 characters";
      }
    } else if (field === "quantity") {
      const num = parseFloat(value);
      if (!value || isNaN(num) || num <= 0) {
        validationError = "Quantity must be greater than 0";
      } else if (num > 999999) {
        validationError = "Quantity must be less than 999,999";
      }
    } else if (field === "unitPrice") {
      const num = parseFloat(value);
      if (!value && value !== "0") {
        validationError = "Unit price is required";
      } else if (isNaN(num) || num < 0) {
        validationError = "Unit price must be a valid positive number";
      } else if (num > 10000000) {
        validationError = "Unit price must be less than $10,000,000";
      }
    } else if (field === "markupValue") {
      const num = parseFloat(value);
      if (!value && value !== "0") {
        validationError = "Markup value is required";
      } else if (isNaN(num) || num < 0) {
        validationError = "Markup must be a valid positive number";
      } else if (num > 1000) {
        validationError = "Markup must be less than 1000";
      }
    } else if (field === "markupType") {
      if (!value || (value !== "percentage" && value !== "dollar")) {
        validationError = "Markup type must be percentage or dollar";
      }
    }
    
    // Update validation errors
    setValidationErrors(prev => {
      const newErrors = { ...prev };
      if (validationError) {
        newErrors[key] = validationError;
      } else {
        delete newErrors[key];
      }
      return newErrors;
    });
    
    // Only proceed with save if no validation error
    if (!validationError) {
      // Set new timer for debounced save
      debounceTimers.current[key] = setTimeout(() => {
        try {
          let updateData;
          if (field === "quantity" || field === "unitPrice" || field === "markupValue") {
            updateData = { [field]: parseFloat(value) || 0 };
          } else {
            updateData = { [field]: value };
          }
          updateLineItemMutation.mutate({ id: itemId, data: updateData });
        } catch (error) {
          // Handle any synchronous errors during mutation
          const err = error as Error;
          if (err?.name !== 'AbortError' && !err?.message?.includes('aborted') && !err?.message?.includes('signal is aborted')) {
            console.error('Error in debounced save:', error);
          }
        } finally {
          delete debounceTimers.current[key];
        }
      }, 300);
    }
  }, []);
  
  // Keyboard navigation helper
  const handleKeyDown = useCallback((e: React.KeyboardEvent, rowIndex: number, column: 'description' | 'quantity' | 'unitPrice' | 'markupValue') => {
    const totalRows = lineItems.length;
    
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        // Move up a row
        if (rowIndex > 0) {
          const columnTestId = column === 'unitPrice' ? 'unit-price' : 
                              column === 'markupValue' ? 'markup-value' : column;
          const prevInput = document.querySelector(`[data-testid="input-${columnTestId}-${lineItems[rowIndex - 1].id}"]`) as HTMLInputElement;
          prevInput?.focus();
        }
      } else {
        // Move down a row
        if (rowIndex < totalRows - 1) {
          const columnTestId = column === 'unitPrice' ? 'unit-price' : 
                              column === 'markupValue' ? 'markup-value' : column;
          const nextInput = document.querySelector(`[data-testid="input-${columnTestId}-${lineItems[rowIndex + 1].id}"]`) as HTMLInputElement;
          nextInput?.focus();
        }
      }
    }
  }, [lineItems]);

  const createLineItemMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", `/api/quotes/${quoteId}/line-items`, data);
      return response.json();
    },
    onSuccess: () => {
      // Clear the pending mutation reference
      pendingMutations.current.create = null;
      
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      queryClient.invalidateQueries({ queryKey: [`/api/quotes/${quoteId}`] });
      setNewItem({
        description: "",
        quantity: "1",
        retailPrice: "",
        unitPrice: "0",
        discountType: "percentage",
        discountValue: "0",
        markupType: "percentage",
        markupValue: "0",
      });
      setShowNewItemForm(false);
      toast({ title: "Line item added successfully" });
    },
    onError: (error: any) => {
      // Clear the pending mutation reference
      pendingMutations.current.create = null;
      
      // Check if the error is due to abort and handle gracefully
      if (error?.name === 'AbortError' || error?.message?.includes('aborted') || error?.message?.includes('signal is aborted')) {
        // Silent abort - don't show error toast for user-initiated cancellations
        return;
      }
      toast({ title: "Error", description: "Failed to add line item", variant: "destructive" });
    },
  });

  const updateLineItemMutation = useMutation({
    mutationFn: async ({ id, data, skipInvalidation }: { id: number; data: any; skipInvalidation?: boolean }) => {
      const response = await apiRequest("PUT", `/api/line-items/${id}`, data);
      return { ...response.json(), skipInvalidation };
    },
    onSuccess: (result, { id }) => {
      // Clear the pending mutation reference
      const updateKey = `update-${id}`;
      delete pendingMutations.current.update[updateKey];
      
      // Only invalidate if not skipping (batch operations will handle invalidation separately)
      if (!result.skipInvalidation) {
        queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
        queryClient.invalidateQueries({ queryKey: [`/api/quotes/${quoteId}`] });
      }
      
      // Clear validation errors for this item on successful save
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        Object.keys(newErrors).forEach(key => {
          if (key.startsWith(`${id}-`)) {
            delete newErrors[key];
          }
        });
        return newErrors;
      });
    },
    onError: (error: any, variables) => {
      // Clear the pending mutation reference
      const updateKey = `update-${variables.id}`;
      delete pendingMutations.current.update[updateKey];
      
      // Check if the error is due to abort and handle gracefully
      if (error?.name === 'AbortError' || error?.message?.includes('aborted') || error?.message?.includes('signal is aborted')) {
        // Silent abort - don't show error toast for user-initiated cancellations
        return;
      }
      toast({ title: "Error", description: "Failed to update line item", variant: "destructive" });
    },
  });

  const deleteLineItemMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/line-items/${id}`);
    },
    onSuccess: () => {
      // Clear the pending mutation reference
      pendingMutations.current.delete = null;
      
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      queryClient.invalidateQueries({ queryKey: [`/api/quotes/${quoteId}`] });
      toast({ title: "Line item deleted successfully" });
    },
    onError: (error: any) => {
      // Clear the pending mutation reference
      pendingMutations.current.delete = null;
      
      // Check if the error is due to abort and handle gracefully
      if (error?.name === 'AbortError' || error?.message?.includes('aborted') || error?.message?.includes('signal is aborted')) {
        // Silent abort - don't show error toast for user-initiated cancellations
        return;
      }
      toast({ title: "Error", description: "Failed to delete line item", variant: "destructive" });
    },
  });

  const calculatePricingMutation = useMutation({
    mutationFn: async ({ productId, length, width }: { productId: number; length: number; width: number }) => {
      const response = await apiRequest("POST", "/api/products/calculate-pricing", {
        productId,
        length,
        width,
      });
      return response.json();
    },
    onSuccess: (data) => {
      // Clear the pending mutation reference
      pendingMutations.current.calculate = null;
      
      setCalculatedPrice(data.price);
      // Update newItem with calculated price after successful calculation
      if (selectedConfigurableProduct) {
        setNewItem(prev => ({
          ...prev,
          description: `${selectedConfigurableProduct.name} (${dimensions.length}" x ${dimensions.width}")`,
          unitPrice: data.price?.toString() || selectedConfigurableProduct.defaultUnitPrice?.toString() || "0",
        }));
      }
    },
    onError: (error: any) => {
      // Clear the pending mutation reference
      pendingMutations.current.calculate = null;
      
      // Check if the error is due to abort and handle gracefully
      if (error?.name === 'AbortError' || error?.message?.includes('aborted') || error?.message?.includes('signal is aborted')) {
        // Silent abort - don't show error toast for user-initiated cancellations
        return;
      }
      toast({ title: "Error", description: "Failed to calculate pricing", variant: "destructive" });
    },
  });

  const handleDeleteItem = async (id: number) => {
    deleteLineItemMutation.mutate(id);
  };

  const handleAddItem = async () => {
    const quantity = parseFloat(newItem.quantity) || 0;
    const unitPrice = parseFloat(newItem.unitPrice) || 0;
    const discountValue = parseFloat(newItem.discountValue) || 0;
    const markupValue = parseFloat(newItem.markupValue) || 0;

    const data = {
      description: newItem.description,
      quantity,
      unitPrice,
      discountType: newItem.discountType,
      discountValue,
      markupType: newItem.markupType,
      markupValue,
    };

    createLineItemMutation.mutate(data);
  };

  const handleProductSelect = (product: Product) => {
    if (product.productType === "configurable") {
      setSelectedConfigurableProduct(product);
      setShowProductDialog(false);
      setShowDimensionDialog(true);
    } else {
      setNewItem({
        ...newItem,
        description: product.name,
        unitPrice: product.defaultUnitPrice?.toString() || "0",
      });
      setShowProductDialog(false);
    }
  };

  const handleDimensionSubmit = () => {
    if (selectedConfigurableProduct) {
      const length = parseFloat(dimensions.length) || 0;
      const width = parseFloat(dimensions.width) || 0;

      calculatePricingMutation.mutate({
        productId: selectedConfigurableProduct.id,
        length,
        width,
      }, {
        onSuccess: () => {
          // Close dialog and reset dimensions only after successful calculation
          setShowDimensionDialog(false);
          setDimensions({ length: "", width: "" });
        }
      });
    }
  };

  // Clean descriptions function to remove PDF filename prefixes
  const cleanDescriptions = async () => {
    if (!lineItems.length) {
      toast({ title: "No Items", description: "No line items to clean", variant: "destructive" });
      return;
    }

    // Find items that have filename prefixes to clean
    const itemsToClean = lineItems.filter(item => 
      /^\[.*?\]\s+/.test(item.description)
    );

    if (itemsToClean.length === 0) {
      toast({ title: "Nothing to Clean", description: "No filename prefixes found in descriptions" });
      return;
    }

    setIsCleaningDescriptions(true);
    let successCount = 0;
    let errorCount = 0;

    // Cancel any outstanding debounced saves to prevent race conditions
    Object.values(debounceTimers.current).forEach(timer => clearTimeout(timer));
    debounceTimers.current = {};

    try {
      // Update each item that needs cleaning (with batch invalidation)
      for (const item of itemsToClean) {
        try {
          const cleanedDescription = item.description.replace(/^\[.*?\]\s+/, '');
          
          // Update local state immediately for feedback
          setLocalValues(prev => ({
            ...prev,
            [item.id]: {
              ...(prev[item.id] ?? {}),
              description: cleanedDescription
            }
          }));

          // Update on server with skipInvalidation to prevent individual query refetches
          await updateLineItemMutation.mutateAsync({ 
            id: item.id, 
            data: { description: cleanedDescription },
            skipInvalidation: true
          });
          
          successCount++;
        } catch (error) {
          errorCount++;
          console.error(`Failed to clean description for item ${item.id}:`, error);
        }
      }

      // Perform batch invalidation after all updates are complete
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      queryClient.invalidateQueries({ queryKey: [`/api/quotes/${quoteId}`] });

      // Show results
      if (successCount > 0 && errorCount === 0) {
        toast({ 
          title: "Descriptions Cleaned", 
          description: `Successfully cleaned ${successCount} description${successCount > 1 ? 's' : ''}` 
        });
      } else if (successCount > 0 && errorCount > 0) {
        toast({ 
          title: "Partial Success", 
          description: `Cleaned ${successCount} descriptions, ${errorCount} failed`,
          variant: "default"
        });
      } else {
        toast({ 
          title: "Cleanup Failed", 
          description: "Failed to clean any descriptions",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({ 
        title: "Error", 
        description: "An error occurred while cleaning descriptions",
        variant: "destructive"
      });
    } finally {
      setIsCleaningDescriptions(false);
    }
  };

  // Product filtering logic
  const categories = useMemo(() => {
    if (!products) return [];
    const uniqueCategories = Array.from(new Set(products.map(p => p.category || "Uncategorized")));
    return uniqueCategories.sort();
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    
    return products.filter(product => {
      const matchesSearch = searchTerm === "" || 
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (product.description || "").toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesCategory = selectedCategory === "all" || 
        (product.category || "Uncategorized") === selectedCategory;
      
      return matchesSearch && matchesCategory;
    });
  }, [products, searchTerm, selectedCategory]);

  const groupedProducts = useMemo(() => {
    return filteredProducts.reduce((groups, product) => {
      const category = product.category || "Uncategorized";
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(product);
      return groups;
    }, {} as Record<string, Product[]>);
  }, [filteredProducts]);

  return (
    <div className="mb-6">
      <div className="border-b border-gray-300 bg-white px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Line Items
          </h2>
          <div className="flex space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={cleanDescriptions}
              disabled={isUnsavedQuote || isCleaningDescriptions}
              data-testid="button-clean-descriptions"
            >
              {isCleaningDescriptions ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileText className="mr-2 h-4 w-4" />
              )}
              Clean Descriptions
            </Button>
            <Dialog open={showProductDialog} onOpenChange={setShowProductDialog}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="text-sm"
                  disabled={isUnsavedQuote}
                >
                  <Package className="mr-2 h-4 w-4" />
                  From Catalog
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
                <DialogHeader>
                  <DialogTitle>Select Product from Catalog</DialogTitle>
                </DialogHeader>
                
                <div className="flex flex-col h-full max-h-[70vh]">
                  {/* Search and Filter Controls */}
                  <div className="flex gap-4 mb-4 p-1">
                    <div className="flex-1 relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                      <Input
                        placeholder="Search products..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9"
                        data-testid="input-product-search"
                      />
                    </div>
                    
                    <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                      <SelectTrigger className="w-48">
                        <SelectValue>
                          <div className="flex items-center gap-2">
                            <Filter className="h-4 w-4" />
                            {selectedCategory === "all" ? "All Categories" : selectedCategory}
                          </div>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {categories.map(category => (
                          <SelectItem key={category} value={category}>
                            {category}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Products List */}
                  <div className="flex-1 overflow-y-auto border rounded-lg">
                    {Object.entries(groupedProducts).length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        No products found. Try adjusting your search or filters.
                      </div>
                    ) : (
                      Object.entries(groupedProducts).map(([category, categoryProducts]) => (
                        <div key={category} className="border-b border-gray-100 last:border-b-0">
                          <div className="bg-gray-50 px-4 py-2 font-medium text-gray-900 text-sm sticky top-0">
                            {category} ({categoryProducts.length})
                          </div>
                          {categoryProducts.map((product) => (
                            <div 
                              key={product.id}
                              className="p-4 border-b border-gray-50 last:border-b-0 hover:bg-gray-50 cursor-pointer transition-colors"
                              onClick={() => handleProductSelect(product)}
                              data-testid={`product-${product.id}`}
                            >
                              <div className="flex justify-between items-start">
                                <div className="flex-1">
                                  <h4 className="font-medium text-gray-900">{product.name}</h4>
                                  {product.description && (
                                    <p className="text-sm text-gray-600 mt-1">{product.description}</p>
                                  )}
                                  <div className="flex items-center gap-4 mt-2">
                                    {product.defaultUnitPrice && (
                                      <span className="text-sm font-medium text-gray-900">
                                        {formatCurrency(Number(product.defaultUnitPrice))}
                                      </span>
                                    )}
                                    {product.productType === 'configurable' && (
                                      <Badge variant="outline" className="text-purple-700 border-purple-300">
                                        Configurable
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Button
              onClick={() => setShowNewItemForm(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm"
              disabled={isUnsavedQuote}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Item
            </Button>
          </div>
        </div>
      </div>

      <div className="bg-white">
        {/* Alert message for unsaved quotes */}
        {isUnsavedQuote && (
          <div className="p-4 border-b border-gray-300 bg-blue-50">
            <div className="text-blue-800 text-sm">
              <strong>Save the quote first</strong> - You need to save the quote before you can add line items.
            </div>
          </div>
        )}
        
        <div className="overflow-x-auto">
          <table className="w-full border border-gray-300 divide-y divide-gray-300">
            <colgroup>
              <col style={{width: '30%'}} /> {/* Description */}
              <col style={{width: '80px'}} /> {/* Quantity */}
              <col style={{width: '100px'}} /> {/* Cost */}
              <col style={{width: '80px'}} /> {/* Markup% */}
              <col style={{width: '120px'}} /> {/* Price */}
              <col style={{width: '100px'}} /> {/* Margin$ */}
              <col style={{width: '140px'}} /> {/* Total */}
              <col style={{width: '80px'}} /> {/* Actions */}
            </colgroup>
            <thead>
              <tr className="bg-gray-100">
                <th className="border-r border-gray-300 px-3 py-2 text-left text-sm font-medium text-gray-700">
                  Description
                </th>
                <th className="border-r border-gray-300 px-3 py-2 text-center text-sm font-medium text-gray-700">
                  QTY
                </th>
                <th className="border-r border-gray-300 px-3 py-2 text-center text-sm font-medium text-gray-700 hidden lg:table-cell">
                  Cost
                </th>
                <th className="border-r border-gray-300 px-3 py-2 text-center text-sm font-medium text-gray-700 hidden lg:table-cell">
                  Markup%
                </th>
                <th className="border-r border-gray-300 px-3 py-2 text-center text-sm font-medium text-gray-700">
                  Price
                </th>
                <th className="border-r border-gray-300 px-3 py-2 text-center text-sm font-medium text-gray-700 hidden md:table-cell">
                  Margin$
                </th>
                <th className="border-r border-gray-300 px-3 py-2 text-center text-sm font-medium text-gray-700">
                  Total
                </th>
                <th className="px-3 py-2 text-center text-sm font-medium text-gray-700">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-300">
              {lineItems.map((item, rowIndex) => {
                // Calculate values using current local values
                const currentCost = parseFloat(getCurrentValue(item.id, 'unitPrice')) || 0;
                const currentMarkupValue = parseFloat(getCurrentValue(item.id, 'markupValue')) || 0;
                const currentMarkupType = getCurrentValue(item.id, 'markupType') || 'percentage';
                const currentQuantity = parseFloat(getCurrentValue(item.id, 'quantity')) || 0;
                
                // Calculate price (cost + markup)
                let price = currentCost;
                if (currentMarkupType === 'percentage') {
                  price = currentCost + (currentCost * (currentMarkupValue / 100));
                } else {
                  price = currentCost + currentMarkupValue;
                }
                
                // Calculate margin (profit amount)
                const marginAmount = calculateLineItemMargin(
                  currentQuantity,
                  currentCost,
                  currentMarkupType,
                  currentMarkupValue,
                  item.discountType,
                  item.discountValue
                );
                
                // Calculate total
                const total = calculateLineItemTotal(
                  currentQuantity,
                  currentCost,
                  currentMarkupType,
                  currentMarkupValue,
                  item.discountType,
                  item.discountValue
                );
                
                return (
                  <tr key={item.id} className="hover:bg-gray-50">
                    {/* Description - Always visible */}
                    <td className="border-r border-gray-300 px-3 py-1">
                      <Input
                        value={getCurrentValue(item.id, 'description')}
                        onChange={(e) => handleFieldChange(item.id, "description", e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, rowIndex, 'description')}
                        className="border-0 bg-transparent p-1 text-sm focus:ring-1 focus:ring-blue-500"
                        data-testid={`input-description-${item.id}`}
                      />
                      {validationErrors[`${item.id}-description`] && (
                        <div className="text-xs text-red-500 mt-1">{validationErrors[`${item.id}-description`]}</div>
                      )}
                    </td>
                    
                    {/* Quantity - Always visible */}
                    <td className="border-r border-gray-300 px-3 py-1">
                      <Input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={getCurrentValue(item.id, 'quantity')}
                        onChange={(e) => handleFieldChange(item.id, "quantity", e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, rowIndex, 'quantity')}
                        className="border-0 bg-transparent p-1 text-sm text-center tabular-nums focus:ring-1 focus:ring-blue-500"
                        data-testid={`input-quantity-${item.id}`}
                      />
                      {validationErrors[`${item.id}-quantity`] && (
                        <div className="text-xs text-red-500 mt-1">{validationErrors[`${item.id}-quantity`]}</div>
                      )}
                    </td>
                    
                    {/* Cost - Hidden on tablet/mobile */}
                    <td className="border-r border-gray-300 px-3 py-1 hidden lg:table-cell">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={getCurrentValue(item.id, 'unitPrice')}
                        onChange={(e) => handleFieldChange(item.id, "unitPrice", e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, rowIndex, 'unitPrice')}
                        className="border-0 bg-transparent p-1 text-sm text-center tabular-nums focus:ring-1 focus:ring-blue-500"
                        data-testid={`input-cost-${item.id}`}
                      />
                      {validationErrors[`${item.id}-unitPrice`] && (
                        <div className="text-xs text-red-500 mt-1">{validationErrors[`${item.id}-unitPrice`]}</div>
                      )}
                    </td>
                    
                    {/* Markup% - Hidden on tablet/mobile */}
                    <td className="border-r border-gray-300 px-3 py-1 hidden lg:table-cell">
                      <div className="flex items-center space-x-1">
                        <Input
                          type="number"
                          step="0.1"
                          min="0"
                          max="1000"
                          value={getCurrentValue(item.id, 'markupValue')}
                          onChange={(e) => handleFieldChange(item.id, "markupValue", e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, rowIndex, 'markupValue')}
                          className="border-0 bg-transparent p-1 text-sm text-center tabular-nums focus:ring-1 focus:ring-blue-500 w-16"
                          data-testid={`input-markup-value-${item.id}`}
                        />
                        <Select
                          value={getCurrentValue(item.id, 'markupType')}
                          onValueChange={(value) => handleFieldChange(item.id, "markupType", value)}
                        >
                          <SelectTrigger className="h-6 w-8 border-0 bg-transparent text-xs p-0 focus:ring-1 focus:ring-blue-500">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="percentage">%</SelectItem>
                            <SelectItem value="dollar">$</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {validationErrors[`${item.id}-markupValue`] && (
                        <div className="text-xs text-red-500 mt-1">{validationErrors[`${item.id}-markupValue`]}</div>
                      )}
                    </td>
                    
                    {/* Price - Always visible */}
                    <td className="border-r border-gray-300 px-3 py-2 text-center text-sm tabular-nums font-medium">
                      {formatCurrency(price)}
                    </td>
                    
                    {/* Margin$ - Hidden on mobile */}
                    <td className={`border-r border-gray-300 px-3 py-2 text-center text-sm tabular-nums font-medium hidden md:table-cell ${
                      marginAmount >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {formatCurrency(marginAmount)}
                    </td>
                    
                    {/* Total - Always visible */}
                    <td className="border-r border-gray-300 px-3 py-2 text-center text-sm tabular-nums font-medium">
                      {formatCurrency(total)}
                    </td>
                    
                    {/* Actions - Always visible */}
                    <td className="px-3 py-2 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteItem(item.id)}
                        className="h-6 w-6 p-0 text-red-600 hover:text-red-800"
                        data-testid={`button-delete-${item.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
          
        {/* New Item Form */}
        {showNewItemForm && !isUnsavedQuote && (
          <div className="border-t border-gray-300 p-4 bg-gray-50">
            <h4 className="font-medium text-gray-900 mb-3">Add New Item</h4>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
              {/* Description */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <Input
                  placeholder="Item description"
                  value={newItem.description}
                  onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                  className="text-sm"
                  data-testid="input-description-new"
                />
                {newItemErrors.description && (
                  <div className="text-xs text-red-500 mt-1">{newItemErrors.description}</div>
                )}
              </div>
              
              {/* Quantity */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={newItem.quantity}
                  onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })}
                  className="text-sm text-center tabular-nums"
                  data-testid="input-quantity-new"
                />
                {newItemErrors.quantity && (
                  <div className="text-xs text-red-500 mt-1">{newItemErrors.quantity}</div>
                )}
              </div>
              
              {/* Cost */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cost</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={newItem.unitPrice}
                  onChange={(e) => setNewItem({ ...newItem, unitPrice: e.target.value })}
                  className="text-sm text-center tabular-nums"
                  data-testid="input-cost-new"
                />
                {newItemErrors.unitPrice && (
                  <div className="text-xs text-red-500 mt-1">{newItemErrors.unitPrice}</div>
                )}
              </div>
              
              {/* Markup% */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Markup</label>
                <div className="flex items-center space-x-1">
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    max="1000"
                    value={newItem.markupValue}
                    onChange={(e) => setNewItem({ ...newItem, markupValue: e.target.value })}
                    className="text-sm text-center tabular-nums"
                    data-testid="input-markup-value-new"
                  />
                  <Select
                    value={newItem.markupType}
                    onValueChange={(value) => setNewItem({ ...newItem, markupType: value as "percentage" | "dollar" })}
                  >
                    <SelectTrigger className="w-12 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">%</SelectItem>
                      <SelectItem value="dollar">$</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {newItemErrors.markupValue && (
                  <div className="text-xs text-red-500 mt-1">{newItemErrors.markupValue}</div>
                )}
              </div>
              
              {/* Add Button */}
              <div className="flex items-end">
                <Button
                  onClick={handleAddItem}
                  disabled={!newItem.description || createLineItemMutation.isPending}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm"
                  data-testid="button-save-new-item"
                >
                  {createLineItemMutation.isPending ? "Adding..." : "Add Item"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Dimension Dialog */}
      <Dialog open={showDimensionDialog} onOpenChange={setShowDimensionDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Enter Dimensions</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Please enter the dimensions for <strong>{selectedConfigurableProduct?.name}</strong>
            </p>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Length (inches)</label>
                <Input
                  type="number"
                  step="0.1"
                  min="0.1"
                  placeholder="0"
                  value={dimensions.length}
                  onChange={(e) => setDimensions({ ...dimensions, length: e.target.value })}
                  className="text-center"
                  data-testid="input-dimension-length"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Width (inches)</label>
                <Input
                  type="number"
                  step="0.1"
                  min="0.1"
                  placeholder="0"
                  value={dimensions.width}
                  onChange={(e) => setDimensions({ ...dimensions, width: e.target.value })}
                  className="text-center"
                  data-testid="input-dimension-width"
                />
              </div>
            </div>

            {calculatedPrice !== null && (
              <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                <p className="text-sm text-blue-800">
                  <strong>Calculated Price:</strong> {formatCurrency(calculatedPrice)}
                </p>
              </div>
            )}
            
            <div className="flex justify-end space-x-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowDimensionDialog(false)}
                data-testid="button-cancel-dimensions"
              >
                Cancel
              </Button>
              <Button
                onClick={handleDimensionSubmit}
                disabled={!dimensions.length || !dimensions.width || calculatePricingMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700 text-white"
                data-testid="button-confirm-dimensions"
              >
                {calculatePricingMutation.isPending ? "Calculating..." : "Add to Quote"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}