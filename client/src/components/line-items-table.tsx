import { useState, useMemo, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Trash2, Edit, Plus, Package, Search, Filter, X, ChevronDown, ChevronUp, Save, XCircle } from "lucide-react";
import { formatCurrency, calculateLineItemTotal, calculateLineItemMargin, applyDiscountToPrice } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { LineItem, Product } from "@shared/schema";

interface LineItemsTableProps {
  quoteId: number;
  lineItems: LineItem[];
}

export function LineItemsTable({ quoteId, lineItems }: LineItemsTableProps) {
  const [editingItem, setEditingItem] = useState<number | null>(null);
  const [editingValues, setEditingValues] = useState<Record<number, Partial<LineItem>>>({});
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
  const [expandedCards, setExpandedCards] = useState<Record<number, boolean>>({});
  const [isMobile, setIsMobile] = useState(false);

  // Responsive detection
  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    
    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);
    
    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: products } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const createLineItemMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", `/api/quotes/${quoteId}/line-items`, data);
      return response.json();
    },
    onSuccess: () => {
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
    onError: () => {
      toast({ title: "Error", description: "Failed to add line item", variant: "destructive" });
    },
  });

  const updateLineItemMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const response = await apiRequest("PUT", `/api/line-items/${id}`, data);
      return response.json();
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      queryClient.invalidateQueries({ queryKey: [`/api/quotes/${quoteId}`] });
      setEditingItem(null);
      // Clear the editing value after successful update
      setEditingValues(prev => {
        const newValues = { ...prev };
        delete newValues[id];
        return newValues;
      });
      toast({ title: "Line item updated successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update line item", variant: "destructive" });
    },
  });

  const deleteLineItemMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/line-items/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      queryClient.invalidateQueries({ queryKey: [`/api/quotes/${quoteId}`] });
      toast({ title: "Line item deleted successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete line item", variant: "destructive" });
    },
  });

  const calculatePricingMutation = useMutation({
    mutationFn: async ({ productId, length, width }: { productId: number; length: number; width: number }) => {
      const response = await apiRequest("POST", `/api/products/${productId}/calculate-price`, {
        length,
        width
      });
      return response.json();
    },
    onSuccess: (data) => {
      setCalculatedPrice(data.price);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to calculate pricing", variant: "destructive" });
    },
  });

  const handleAddItem = () => {
    const itemData = {
      description: newItem.description,
      quantity: newItem.quantity,
      retailPrice: newItem.retailPrice || null,
      unitPrice: newItem.unitPrice,
      discountType: newItem.discountType,
      discountValue: newItem.discountValue,
      markupType: newItem.markupType,
      markupValue: newItem.markupValue,
    };

    createLineItemMutation.mutate(itemData);
  };

  const updateEditingValue = (itemId: number, field: string, value: any) => {
    setEditingValues(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        [field]: value
      }
    }));
  };

  const handleStartEdit = (itemId: number, item: LineItem) => {
    // If another item is being edited, cancel that edit first
    if (editingItem && editingItem !== itemId) {
      handleCancelEdit();
    }
    
    setEditingItem(itemId);
    // Initialize editing values with current item values
    setEditingValues(prev => ({
      ...prev,
      [itemId]: {
        description: item.description,
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toString(),
        discountType: item.discountType,
        discountValue: item.discountValue.toString(),
        markupType: item.markupType,
        markupValue: item.markupValue.toString()
      }
    }));
  };

  const handleCancelEdit = () => {
    if (editingItem) {
      // Clear editing values for the item being edited
      setEditingValues(prev => {
        const newValues = { ...prev };
        delete newValues[editingItem];
        return newValues;
      });
    }
    setEditingItem(null);
  };

  const handleSaveEdit = (item: LineItem) => {
    if (!editingItem || editingItem !== item.id) return;
    
    const editedValues = editingValues[item.id];
    if (!editedValues) return;

    // Prepare the data for update - only include changed fields
    const updateData: any = {};
    let hasChanges = false;

    if (editedValues.description !== undefined && editedValues.description !== item.description) {
      updateData.description = editedValues.description;
      hasChanges = true;
    }
    if (editedValues.quantity !== undefined && parseFloat(editedValues.quantity as string) !== item.quantity) {
      updateData.quantity = parseFloat(editedValues.quantity as string) || 0;
      hasChanges = true;
    }
    if (editedValues.unitPrice !== undefined && parseFloat(editedValues.unitPrice as string) !== item.unitPrice) {
      updateData.unitPrice = parseFloat(editedValues.unitPrice as string) || 0;
      hasChanges = true;
    }
    if (editedValues.discountType !== undefined && editedValues.discountType !== item.discountType) {
      updateData.discountType = editedValues.discountType;
      hasChanges = true;
    }
    if (editedValues.discountValue !== undefined && parseFloat(editedValues.discountValue as string) !== item.discountValue) {
      updateData.discountValue = parseFloat(editedValues.discountValue as string) || 0;
      hasChanges = true;
    }
    if (editedValues.markupType !== undefined && editedValues.markupType !== item.markupType) {
      updateData.markupType = editedValues.markupType;
      hasChanges = true;
    }
    if (editedValues.markupValue !== undefined && parseFloat(editedValues.markupValue as string) !== item.markupValue) {
      updateData.markupValue = parseFloat(editedValues.markupValue as string) || 0;
      hasChanges = true;
    }

    if (hasChanges) {
      updateLineItemMutation.mutate({
        id: item.id,
        data: updateData
      });
    } else {
      // No changes, just exit edit mode
      setEditingItem(null);
      setEditingValues(prev => {
        const newValues = { ...prev };
        delete newValues[item.id];
        return newValues;
      });
    }
  };

  const handleUpdateItem = (item: LineItem, field: string, value: any) => {
    updateLineItemMutation.mutate({
      id: item.id,
      data: { [field]: value },
    });
  };

  // This function is kept for select components that still need immediate updates
  const handleSelectChange = (item: LineItem, field: string, value: any) => {
    if (editingItem === item.id) {
      updateEditingValue(item.id, field, value);
    } else {
      handleUpdateItem(item, field, value);
    }
  };

  const handleDeleteItem = (id: number) => {
    if (confirm("Are you sure you want to delete this line item?")) {
      deleteLineItemMutation.mutate(id);
    }
  };

  const handleAddFromProduct = (product: Product) => {
    if (product.productType === "configurable") {
      // For configurable products, show dimension dialog
      setSelectedConfigurableProduct(product);
      setDimensions({ length: "", width: "" });
      setCalculatedPrice(null);
      setShowProductDialog(false);
      setShowDimensionDialog(true);
    } else {
      // For simple products, add directly to form
      const retailPrice = product.defaultUnitPrice;
      const discountedUnitPrice = applyDiscountToPrice(
        retailPrice,
        product.defaultDiscountType || "percentage",
        product.defaultDiscountValue || 0
      );
      
      setNewItem({
        description: product.name,
        quantity: "1",
        retailPrice: retailPrice, // Original retail price for transparency
        unitPrice: discountedUnitPrice.toString(), // Apply manufacturer discount
        discountType: product.defaultDiscountType as "percentage" | "dollar",
        discountValue: product.defaultDiscountValue,
        markupType: product.defaultMarkupType as "percentage" | "dollar",
        markupValue: product.defaultMarkupValue,
      });
      setShowProductDialog(false);
      setShowNewItemForm(true);
    }
    
    // Reset search when product is selected
    setSearchTerm("");
    setSelectedCategory("all");
  };

  const handleCalculatePricing = () => {
    if (!selectedConfigurableProduct || !dimensions.length || !dimensions.width) {
      toast({ title: "Error", description: "Please enter both length and width", variant: "destructive" });
      return;
    }

    calculatePricingMutation.mutate({
      productId: selectedConfigurableProduct.id,
      length: parseFloat(dimensions.length),
      width: parseFloat(dimensions.width)
    });
  };

  const handleConfirmConfigurableProduct = () => {
    if (!selectedConfigurableProduct || calculatedPrice === null) {
      toast({ title: "Error", description: "Please calculate pricing first", variant: "destructive" });
      return;
    }

    // Create line item with configurable product data
    const retailPrice = calculatedPrice;
    const discountedUnitPrice = applyDiscountToPrice(
      retailPrice,
      selectedConfigurableProduct.defaultDiscountType || "percentage",
      selectedConfigurableProduct.defaultDiscountValue || 0
    );
    
    const itemData = {
      description: `${selectedConfigurableProduct.name} (${dimensions.length}' × ${dimensions.width}')`,
      quantity: "1",
      retailPrice: retailPrice.toString(), // Original calculated price for transparency
      unitPrice: discountedUnitPrice.toString(), // Apply manufacturer discount to calculated price
      markupType: selectedConfigurableProduct.defaultMarkupType,
      markupValue: selectedConfigurableProduct.defaultMarkupValue,
      discountType: selectedConfigurableProduct.defaultDiscountType || "percentage",
      discountValue: selectedConfigurableProduct.defaultDiscountValue || "0",
      baseProductId: selectedConfigurableProduct.id,
      configData: {
        length: parseFloat(dimensions.length),
        width: parseFloat(dimensions.width),
        calculatedPrice: calculatedPrice
      }
    };

    createLineItemMutation.mutate(itemData);
    setShowDimensionDialog(false);
    setSelectedConfigurableProduct(null);
    setDimensions({ length: "", width: "" });
    setCalculatedPrice(null);
  };

  // Get unique categories for filtering
  const categories = useMemo(() => {
    if (!products) return [];
    const uniqueCategories = Array.from(new Set(products.map(p => p.category || "Uncategorized")));
    return uniqueCategories.sort();
  }, [products]);

  // Filter products based on search and category
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

  // Helper function to safely get input values (fixes React warnings)
  const safeInputValue = (editingValue: any, originalValue?: any): string => {
    // If we have an editing value, use it
    if (editingValue !== undefined && editingValue !== null) {
      return String(editingValue);
    }
    // Otherwise use the original value
    if (originalValue !== undefined && originalValue !== null) {
      return String(originalValue);
    }
    // Default to empty string
    return "";
  };

  // Toggle card expansion
  const toggleCardExpansion = (itemId: number) => {
    setExpandedCards(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  };

  // Render mobile card layout
  const renderMobileCard = (item: LineItem) => {
    const isExpanded = expandedCards[item.id];
    const isEditing = editingItem === item.id;
    
    // Use editing values if available, otherwise use item values
    const currentQuantity = editingValues[item.id]?.quantity !== undefined 
      ? (editingValues[item.id].quantity === '' ? 0 : parseFloat(editingValues[item.id].quantity as string) || 0)
      : item.quantity;
    const currentUnitPrice = editingValues[item.id]?.unitPrice !== undefined 
      ? (editingValues[item.id].unitPrice === '' ? 0 : parseFloat(editingValues[item.id].unitPrice as string) || 0)
      : item.unitPrice;
    const currentMarkupValue = editingValues[item.id]?.markupValue !== undefined 
      ? (editingValues[item.id].markupValue === '' ? 0 : parseFloat(editingValues[item.id].markupValue as string) || 0)
      : item.markupValue;
    const currentMarkupType = editingValues[item.id]?.markupType !== undefined 
      ? editingValues[item.id].markupType as "percentage" | "dollar"
      : item.markupType;
    const currentDiscountValue = editingValues[item.id]?.discountValue !== undefined 
      ? (editingValues[item.id].discountValue === '' ? 0 : parseFloat(editingValues[item.id].discountValue as string) || 0)
      : item.discountValue;
    const currentDiscountType = editingValues[item.id]?.discountType !== undefined 
      ? editingValues[item.id].discountType as "percentage" | "dollar"
      : item.discountType;
    
    const total = calculateLineItemTotal(
      currentQuantity,
      currentUnitPrice,
      currentMarkupType,
      currentMarkupValue,
      currentDiscountType,
      currentDiscountValue
    );
    
    const margin = calculateLineItemMargin(
      currentQuantity,
      currentUnitPrice,
      currentMarkupType,
      currentMarkupValue,
      currentDiscountType,
      currentDiscountValue
    );

    return (
      <div key={item.id} className={`border rounded-lg p-4 mb-4 bg-white transition-shadow ${
        isEditing 
          ? 'border-edg-teal shadow-md bg-blue-50' 
          : 'border-gray-200 hover:shadow-sm'
      }`}>
        {/* Main Info - Always Visible */}
        <div className="space-y-3">
          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            {isEditing ? (
              <Input
                value={safeInputValue(editingValues[item.id]?.description, item.description)}
                onChange={(e) => updateEditingValue(item.id, "description", e.target.value)}
                className="border-edg-teal focus:ring-edg-teal focus:border-edg-teal text-sm bg-white"
                data-testid={`input-description-${item.id}`}
                autoFocus
              />
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-md px-3 py-2 text-sm">
                {item.description}
              </div>
            )}
            {item.retailPrice && parseFloat(item.retailPrice.toString()) !== parseFloat(item.unitPrice.toString()) && (
              <div className="text-xs text-gray-500 mt-1">
                Retail: {formatCurrency(parseFloat(item.retailPrice.toString()))}
              </div>
            )}
          </div>

          {/* Primary Controls Row */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
              {isEditing ? (
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={safeInputValue(editingValues[item.id]?.quantity, item.quantity)}
                  onChange={(e) => updateEditingValue(item.id, "quantity", e.target.value)}
                  className="text-center text-sm border-edg-teal focus:ring-edg-teal focus:border-edg-teal bg-white"
                  data-testid={`input-quantity-${item.id}`}
                />
              ) : (
                <div className="bg-gray-50 border border-gray-200 rounded-md px-3 py-2 text-center text-sm">
                  {item.quantity}
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit Price</label>
              {isEditing ? (
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={safeInputValue(editingValues[item.id]?.unitPrice, item.unitPrice)}
                  onChange={(e) => updateEditingValue(item.id, "unitPrice", e.target.value)}
                  className="text-center text-sm border-edg-teal focus:ring-edg-teal focus:border-edg-teal bg-white"
                  data-testid={`input-unit-price-${item.id}`}
                />
              ) : (
                <div className="bg-gray-50 border border-gray-200 rounded-md px-3 py-2 text-center text-sm">
                  {formatCurrency(item.unitPrice)}
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">Total</label>
              <div className="bg-gray-50 border border-gray-200 rounded-md px-3 py-2 text-center font-semibold text-edg-black text-sm">
                {formatCurrency(total)}
              </div>
            </div>
          </div>

          {/* Action Buttons Row */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <div className="flex items-center space-x-2">
              <Collapsible open={isExpanded} onOpenChange={() => toggleCardExpansion(item.id)}>
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-gray-600 hover:text-gray-900"
                    data-testid={`button-expand-${item.id}`}
                    disabled={isEditing}
                  >
                    {isExpanded ? (
                      <><ChevronUp className="h-4 w-4 mr-1" />Hide Details</>
                    ) : (
                      <><ChevronDown className="h-4 w-4 mr-1" />Show Details</>
                    )}
                  </Button>
                </CollapsibleTrigger>
              </Collapsible>
            </div>
            
            <div className="flex items-center space-x-2">
              {isEditing ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCancelEdit}
                    className="text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                    data-testid={`button-cancel-edit-${item.id}`}
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    Cancel
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => handleSaveEdit(item)}
                    disabled={updateLineItemMutation.isPending}
                    className="bg-edg-teal text-white hover:bg-edg-teal/90"
                    data-testid={`button-save-edit-${item.id}`}
                  >
                    <Save className="h-4 w-4 mr-1" />
                    {updateLineItemMutation.isPending ? 'Saving...' : 'Save'}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleStartEdit(item.id, item)}
                    className="border-gray-300 text-gray-700 hover:bg-gray-50"
                    data-testid={`button-edit-${item.id}`}
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteItem(item.id)}
                    className="border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400 hover:text-red-700"
                    data-testid={`button-delete-${item.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Expanded Details */}
          <Collapsible open={isExpanded}>
            <CollapsibleContent className="space-y-3 pt-3 border-t border-gray-100">
              {/* Discount Controls */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Discount</label>
                <div className="grid grid-cols-2 gap-2">
                  {isEditing ? (
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={safeInputValue(editingValues[item.id]?.discountValue, item.discountValue)}
                      onChange={(e) => updateEditingValue(item.id, "discountValue", e.target.value)}
                      className="text-center text-sm border-edg-teal focus:border-edg-teal bg-white"
                      placeholder="0"
                      data-testid={`input-discount-value-${item.id}`}
                    />
                  ) : (
                    <div className="bg-gray-50 border border-gray-200 rounded-md px-3 py-2 text-center text-sm">
                      {item.discountValue}
                    </div>
                  )}
                  {isEditing ? (
                    <Select
                      value={editingValues[item.id]?.discountType !== undefined ? editingValues[item.id].discountType as string : item.discountType}
                      onValueChange={(value) => updateEditingValue(item.id, "discountType", value)}
                    >
                      <SelectTrigger className="text-sm border-edg-teal bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">%</SelectItem>
                        <SelectItem value="dollar">$</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="bg-gray-50 border border-gray-200 rounded-md px-3 py-2 text-center text-sm">
                      {item.discountType === 'percentage' ? '%' : '$'}
                    </div>
                  )}
                </div>
              </div>

              {/* Markup Controls */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Markup</label>
                <div className="grid grid-cols-2 gap-2">
                  {isEditing ? (
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={safeInputValue(editingValues[item.id]?.markupValue, item.markupValue)}
                      onChange={(e) => updateEditingValue(item.id, "markupValue", e.target.value)}
                      className="text-center text-sm border-edg-teal focus:border-edg-teal bg-white"
                      placeholder="0"
                      data-testid={`input-markup-value-${item.id}`}
                    />
                  ) : (
                    <div className="bg-gray-50 border border-gray-200 rounded-md px-3 py-2 text-center text-sm">
                      {item.markupValue}
                    </div>
                  )}
                  {isEditing ? (
                    <Select
                      value={editingValues[item.id]?.markupType !== undefined ? editingValues[item.id].markupType as string : item.markupType}
                      onValueChange={(value) => updateEditingValue(item.id, "markupType", value)}
                    >
                      <SelectTrigger className="text-sm border-edg-teal bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">%</SelectItem>
                        <SelectItem value="dollar">$</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="bg-gray-50 border border-gray-200 rounded-md px-3 py-2 text-center text-sm">
                      {item.markupType === 'percentage' ? '%' : '$'}
                    </div>
                  )}
                </div>
              </div>

              {/* Margin Display */}
              <div className="bg-green-50 border border-green-200 rounded-md p-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-green-800">Margin:</span>
                  <span className="text-sm font-semibold text-green-600">{formatCurrency(margin)}</span>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>
    );
  };

  return (
    <Card className="mb-6">
      <CardHeader className="border-b border-gray-200">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Line Items</CardTitle>
          <div className="mt-3 sm:mt-0 flex space-x-2">
            <Dialog open={showProductDialog} onOpenChange={setShowProductDialog}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="border-edg-teal text-edg-teal hover:bg-edg-light-teal hover:bg-opacity-10"
                >
                  <Package className="mr-2 h-4 w-4" />
                  From Catalog
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
                <DialogHeader>
                  <DialogTitle>Select Product from Catalog</DialogTitle>
                </DialogHeader>
                
                {!products || products.length === 0 ? (
                  <div className="text-center py-8">
                    <Package className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                    <p className="text-gray-500">No products in catalog. Create products first.</p>
                  </div>
                ) : (
                  <div className="flex flex-col flex-1 min-h-0">
                    {/* Search and Filters */}
                    <div className="flex flex-col sm:flex-row gap-4 pb-4 border-b">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                        <Input
                          placeholder="Search products..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="pl-10"
                        />
                      </div>
                      
                      <div className="flex gap-2">
                        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                          <SelectTrigger className="w-48">
                            <Filter className="h-4 w-4 mr-2" />
                            <SelectValue placeholder="All Categories" />
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
                    </div>

                    {/* Active Filters */}
                    {(searchTerm || selectedCategory !== "all") && (
                      <div className="flex gap-2 py-2">
                        {searchTerm && (
                          <Badge variant="secondary" className="flex items-center gap-1">
                            Search: "{searchTerm}"
                            <X className="h-3 w-3 cursor-pointer" onClick={() => setSearchTerm("")} />
                          </Badge>
                        )}
                        {selectedCategory !== "all" && (
                          <Badge variant="secondary" className="flex items-center gap-1">
                            Category: {selectedCategory}
                            <X className="h-3 w-3 cursor-pointer" onClick={() => setSelectedCategory("all")} />
                          </Badge>
                        )}
                      </div>
                    )}

                    {/* Product Results */}
                    <div className="flex-1 overflow-y-auto">
                      {filteredProducts.length === 0 ? (
                        <div className="text-center py-8">
                          <Package className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                          <h3 className="text-lg font-medium text-gray-900 mb-2">No products found</h3>
                          <p className="text-gray-500 mb-4">Try adjusting your search or filter criteria.</p>
                          <Button
                            variant="outline"
                            onClick={() => {
                              setSearchTerm("");
                              setSelectedCategory("all");
                            }}
                          >
                            Clear Filters
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-6 py-4">
                          {Object.entries(groupedProducts).map(([category, categoryProducts]) => (
                            <div key={category}>
                              <h3 className="text-lg font-semibold text-edg-black mb-3 flex items-center gap-2">
                                {category}
                                <Badge variant="outline">{categoryProducts.length}</Badge>
                              </h3>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {categoryProducts.map((product) => (
                                  <div
                                    key={product.id}
                                    className="p-4 border border-gray-200 rounded-lg hover:border-edg-teal cursor-pointer transition-colors"
                                    onClick={() => handleAddFromProduct(product)}
                                  >
                                    <div className="flex justify-between items-start mb-2">
                                      <div className="flex-1">
                                        <h4 className="font-medium text-edg-black">{product.name}</h4>
                                        <Badge variant={product.productType === "configurable" ? "default" : "secondary"} className="mt-1">
                                          {product.productType === "configurable" ? "Configurable" : "Simple"}
                                        </Badge>
                                      </div>
                                      <span className="text-sm font-medium text-edg-teal">
                                        {product.productType === "configurable" ? (
                                          <span className="text-gray-500">Dimensional</span>
                                        ) : (
                                          formatCurrency(product.defaultUnitPrice)
                                        )}
                                      </span>
                                    </div>
                                    {product.description && (
                                      <p className="text-sm text-edg-grey mb-2">{product.description}</p>
                                    )}
                                    <div className="flex justify-between text-xs text-edg-grey">
                                      <span>Per {product.unit}</span>
                                      <span>Markup: {product.defaultMarkupValue}{product.defaultMarkupType === 'percentage' ? '%' : '$'}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>
            <Button
              onClick={() => setShowNewItemForm(true)}
              className="bg-edg-teal hover:bg-edg-dark-teal text-edg-black"
            >
              <Plus className="mr-2 h-4 w-4" />
              Custom Item
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {isMobile ? (
          // Mobile Card Layout
          <div className="p-4 space-y-4">
            {lineItems.map(renderMobileCard)}
            
            {/* Mobile New Item Form */}
            {showNewItemForm && (
              <div className="border-2 border-dashed border-blue-300 rounded-lg p-4 bg-blue-50">
                <h4 className="font-medium text-blue-900 mb-4">Add New Item</h4>
                <div className="space-y-4">
                  {/* Description */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <Input
                      placeholder="Item description"
                      value={newItem.description}
                      onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                      className="border border-gray-300 text-sm"
                      data-testid="input-description-new"
                    />
                  </div>

                  {/* Primary Controls */}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                      <Input
                        type="number"
                        step="1"
                        min="0"
                        value={newItem.quantity}
                        onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })}
                        className="text-center text-sm"
                        placeholder="1"
                        data-testid="input-quantity-new"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Unit Price</label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={newItem.unitPrice}
                        onChange={(e) => setNewItem({ ...newItem, unitPrice: e.target.value })}
                        className="text-center text-sm"
                        placeholder="0.00"
                        data-testid="input-unit-price-new"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-900 mb-1">Total</label>
                      <div className="bg-gray-100 border border-gray-300 rounded-md px-3 py-2 text-center font-semibold text-edg-black text-sm">
                        {formatCurrency(
                          calculateLineItemTotal(
                            newItem.quantity,
                            newItem.unitPrice,
                            newItem.markupType,
                            newItem.markupValue,
                            newItem.discountType,
                            newItem.discountValue
                          )
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Advanced Controls */}
                  <div className="space-y-3 pt-3 border-t border-blue-200">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Discount</label>
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={newItem.discountValue}
                            onChange={(e) => setNewItem({ ...newItem, discountValue: e.target.value })}
                            className="text-center text-sm border-gray-300"
                            placeholder="0"
                          />
                          <Select
                            value={newItem.discountType}
                            onValueChange={(value) => setNewItem({ ...newItem, discountType: value as "percentage" | "dollar" })}
                          >
                            <SelectTrigger className="text-sm border-gray-300">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="percentage">%</SelectItem>
                              <SelectItem value="dollar">$</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Markup</label>
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={newItem.markupValue}
                            onChange={(e) => setNewItem({ ...newItem, markupValue: e.target.value })}
                            className="text-center text-sm border-gray-300"
                            placeholder="0"
                          />
                          <Select
                            value={newItem.markupType}
                            onValueChange={(value) => setNewItem({ ...newItem, markupType: value as "percentage" | "dollar" })}
                          >
                            <SelectTrigger className="text-sm border-gray-300">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="percentage">%</SelectItem>
                              <SelectItem value="dollar">$</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    {/* Margin Display */}
                    <div className="bg-green-50 border border-green-200 rounded-md p-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-green-800">Margin:</span>
                        <span className="text-sm font-semibold text-green-600">
                          {formatCurrency(
                            calculateLineItemMargin(
                              newItem.quantity,
                              newItem.unitPrice,
                              newItem.markupType,
                              newItem.markupValue,
                              newItem.discountType,
                              newItem.discountValue
                            )
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex space-x-3 pt-4">
                    <Button
                      onClick={handleAddItem}
                      disabled={!newItem.description || createLineItemMutation.isPending}
                      className="flex-1 bg-edg-black hover:bg-edg-grey text-edg-white"
                      data-testid="button-save-new-item"
                    >
                      {createLineItemMutation.isPending ? "Adding..." : "Save Item"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowNewItemForm(false)}
                      className="flex-1"
                      data-testid="button-cancel-new-item"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          // Desktop Table Layout
          <div className="overflow-x-auto">
            <table className="w-full table-fixed divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-medium text-edg-grey uppercase w-60">
                  Description
                </th>
                <th className="px-2 py-3 text-center text-xs font-medium text-edg-grey uppercase w-16">
                  Qty
                </th>
                <th className="px-2 py-3 text-center text-xs font-medium text-edg-grey uppercase w-24">
                  Unit Price
                </th>
                <th className="px-2 py-3 text-center text-xs font-medium text-edg-grey uppercase w-28">
                  Discount
                </th>
                <th className="px-2 py-3 text-center text-xs font-medium text-edg-grey uppercase w-28">
                  Markup
                </th>
                <th className="px-2 py-3 text-right text-xs font-medium text-edg-grey uppercase w-20">
                  Margin
                </th>
                <th className="px-2 py-3 text-right text-xs font-medium text-edg-grey uppercase w-24">
                  Total
                </th>
                <th className="px-2 py-3 text-center text-xs font-medium text-edg-grey uppercase w-16">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {lineItems.map((item) => {
                const isEditing = editingItem === item.id;
                
                // Use editing values if available, otherwise use item values
                const currentQuantity = editingValues[item.id]?.quantity !== undefined 
                  ? (editingValues[item.id].quantity === '' ? 0 : parseFloat(editingValues[item.id].quantity as string) || 0)
                  : item.quantity;
                const currentUnitPrice = editingValues[item.id]?.unitPrice !== undefined 
                  ? (editingValues[item.id].unitPrice === '' ? 0 : parseFloat(editingValues[item.id].unitPrice as string) || 0)
                  : item.unitPrice;
                const currentMarkupValue = editingValues[item.id]?.markupValue !== undefined 
                  ? (editingValues[item.id].markupValue === '' ? 0 : parseFloat(editingValues[item.id].markupValue as string) || 0)
                  : item.markupValue;
                const currentMarkupType = editingValues[item.id]?.markupType !== undefined 
                  ? editingValues[item.id].markupType as "percentage" | "dollar"
                  : item.markupType;
                const currentDiscountValue = editingValues[item.id]?.discountValue !== undefined 
                  ? (editingValues[item.id].discountValue === '' ? 0 : parseFloat(editingValues[item.id].discountValue as string) || 0)
                  : item.discountValue;
                const currentDiscountType = editingValues[item.id]?.discountType !== undefined 
                  ? editingValues[item.id].discountType as "percentage" | "dollar"
                  : item.discountType;
                
                const total = calculateLineItemTotal(
                  currentQuantity,
                  currentUnitPrice,
                  currentMarkupType,
                  currentMarkupValue,
                  currentDiscountType,
                  currentDiscountValue
                );
                
                const margin = calculateLineItemMargin(
                  currentQuantity,
                  currentUnitPrice,
                  currentMarkupType,
                  currentMarkupValue,
                  currentDiscountType,
                  currentDiscountValue
                );

                return (
                  <tr key={item.id} className={`${
                    isEditing 
                      ? 'bg-blue-50 border-l-4 border-edg-teal'
                      : 'hover:bg-gray-50'
                  }`}>
                    <td className="px-3 py-3">
                      <div>
                        {isEditing ? (
                          <Input
                            value={safeInputValue(editingValues[item.id]?.description, item.description)}
                            onChange={(e) => updateEditingValue(item.id, "description", e.target.value)}
                            className="border border-edg-teal focus:ring-2 focus:ring-edg-teal focus:border-edg-teal text-sm bg-white"
                            data-testid={`input-description-${item.id}`}
                            autoFocus
                          />
                        ) : (
                          <div className="text-sm py-2 px-1">
                            {item.description}
                          </div>
                        )}
                        {item.retailPrice && parseFloat(item.retailPrice.toString()) !== parseFloat(item.unitPrice.toString()) && (
                          <div className="text-xs text-gray-500 mt-1">
                            Retail: {formatCurrency(parseFloat(item.retailPrice.toString()))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-3 text-center">
                      {isEditing ? (
                        <Input
                          type="number"
                          step="1"
                          min="0"
                          value={safeInputValue(editingValues[item.id]?.quantity, item.quantity)}
                          onChange={(e) => updateEditingValue(item.id, "quantity", e.target.value)}
                          className="w-full text-center text-sm border border-edg-teal focus:ring-2 focus:ring-edg-teal bg-white"
                          data-testid={`input-quantity-${item.id}`}
                        />
                      ) : (
                        <div className="text-sm py-2">
                          {item.quantity}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-3 text-center">
                      {isEditing ? (
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={safeInputValue(editingValues[item.id]?.unitPrice, item.unitPrice)}
                          onChange={(e) => updateEditingValue(item.id, "unitPrice", e.target.value)}
                          className="w-full text-center text-sm border border-edg-teal focus:ring-2 focus:ring-edg-teal bg-white"
                          data-testid={`input-unit-price-${item.id}`}
                        />
                      ) : (
                        <div className="text-sm py-2">
                          {formatCurrency(item.unitPrice)}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-3 text-center">
                      {isEditing ? (
                        <div className="flex items-center justify-center space-x-2">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={safeInputValue(editingValues[item.id]?.discountValue, item.discountValue)}
                            onChange={(e) => updateEditingValue(item.id, "discountValue", e.target.value)}
                            className="w-20 text-center text-sm border border-edg-teal focus:ring-2 focus:ring-edg-teal bg-white"
                            data-testid={`input-discount-value-${item.id}`}
                          />
                          <Select
                            value={editingValues[item.id]?.discountType !== undefined ? editingValues[item.id].discountType as string : item.discountType}
                            onValueChange={(value) => updateEditingValue(item.id, "discountType", value)}
                          >
                            <SelectTrigger className="w-10 h-8 text-sm border border-edg-teal bg-white">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="percentage">%</SelectItem>
                              <SelectItem value="dollar">$</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      ) : (
                        <div className="text-sm py-2">
                          {item.discountValue} {item.discountType === 'percentage' ? '%' : '$'}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-3 text-center">
                      {isEditing ? (
                        <div className="flex items-center justify-center space-x-2">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={safeInputValue(editingValues[item.id]?.markupValue, item.markupValue)}
                            onChange={(e) => updateEditingValue(item.id, "markupValue", e.target.value)}
                            className="w-20 text-center text-sm border border-edg-teal focus:ring-2 focus:ring-edg-teal bg-white"
                            data-testid={`input-markup-value-${item.id}`}
                          />
                          <Select
                            value={editingValues[item.id]?.markupType !== undefined ? editingValues[item.id].markupType as string : item.markupType}
                            onValueChange={(value) => updateEditingValue(item.id, "markupType", value)}
                          >
                            <SelectTrigger className="w-10 h-8 text-sm border border-edg-teal bg-white">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="percentage">%</SelectItem>
                              <SelectItem value="dollar">$</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      ) : (
                        <div className="text-sm py-2">
                          {item.markupValue} {item.markupType === 'percentage' ? '%' : '$'}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-3 text-right text-sm font-medium text-success-green">
                      {formatCurrency(margin)}
                    </td>
                    <td className="px-2 py-3 text-right text-sm font-medium text-edg-black">
                      {formatCurrency(total)}
                    </td>
                    <td className="px-2 py-3 text-center">
                      {isEditing ? (
                        <div className="flex items-center justify-center space-x-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleCancelEdit}
                            className="text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                            data-testid={`button-cancel-edit-${item.id}`}
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleSaveEdit(item)}
                            disabled={updateLineItemMutation.isPending}
                            className="bg-edg-teal text-white hover:bg-edg-teal/90"
                            data-testid={`button-save-edit-${item.id}`}
                          >
                            <Save className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center space-x-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleStartEdit(item.id, item)}
                            className="border-gray-300 text-gray-700 hover:bg-gray-50"
                            data-testid={`button-edit-${item.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteItem(item.id)}
                            className="border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400 hover:text-red-700"
                            data-testid={`button-delete-${item.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              {showNewItemForm && (
                <tr className="bg-blue-50">
                  <td className="px-3 py-3">
                    <Input
                      placeholder="Description"
                      value={newItem.description}
                      onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                      className="border border-gray-300 text-sm"
                    />
                  </td>
                  <td className="px-2 py-3 text-center">
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      value={newItem.quantity}
                      onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })}
                      className="w-full text-center text-sm"
                      placeholder="1"
                    />
                  </td>
                  <td className="px-2 py-3 text-center">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={newItem.unitPrice}
                      onChange={(e) => setNewItem({ ...newItem, unitPrice: e.target.value })}
                      className="w-full text-center text-sm"
                      placeholder="0.00"
                      data-testid="input-unit-price-new"
                    />
                  </td>
                  <td className="px-2 py-3 text-center">
                    <div className="flex items-center justify-center space-x-2">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={newItem.discountValue}
                        onChange={(e) => setNewItem({ ...newItem, discountValue: e.target.value })}
                        className="w-12 text-center text-sm border-gray-300"
                        placeholder="0"
                      />
                      <Select
                        value={newItem.discountType}
                        onValueChange={(value) => setNewItem({ ...newItem, discountType: value as "percentage" | "dollar" })}
                      >
                        <SelectTrigger className="w-10 h-8 text-sm border-gray-300">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percentage">%</SelectItem>
                          <SelectItem value="dollar">$</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </td>
                  <td className="px-2 py-3 text-center">
                    <div className="flex items-center justify-center space-x-2">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={newItem.markupValue}
                        onChange={(e) => setNewItem({ ...newItem, markupValue: e.target.value })}
                        className="w-12 text-center text-sm border-gray-300"
                        placeholder="0"
                      />
                      <Select
                        value={newItem.markupType}
                        onValueChange={(value) => setNewItem({ ...newItem, markupType: value as "percentage" | "dollar" })}
                      >
                        <SelectTrigger className="w-10 h-8 text-sm border-gray-300">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percentage">%</SelectItem>
                          <SelectItem value="dollar">$</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </td>
                  <td className="px-2 py-3 text-right text-sm font-medium text-success-green">
                    {formatCurrency(
                      calculateLineItemMargin(
                        newItem.quantity,
                        newItem.unitPrice,
                        newItem.markupType,
                        newItem.markupValue,
                        newItem.discountType,
                        newItem.discountValue
                      )
                    )}
                  </td>
                  <td className="px-2 py-3 text-right text-sm font-medium text-edg-black">
                    {formatCurrency(
                      calculateLineItemTotal(
                        newItem.quantity,
                        newItem.unitPrice,
                        newItem.markupType,
                        newItem.markupValue,
                        newItem.discountType,
                        newItem.discountValue
                      )
                    )}
                  </td>
                  <td className="px-2 py-3 text-center space-x-2">
                    <Button
                      size="sm"
                      onClick={handleAddItem}
                      disabled={!newItem.description || createLineItemMutation.isPending}
                      className="bg-edg-black hover:bg-edg-grey text-edg-white"
                    >
                      Save
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowNewItemForm(false)}
                    >
                      Cancel
                    </Button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        )}
      </CardContent>

      {/* Dimension Configuration Dialog */}
      <Dialog open={showDimensionDialog} onOpenChange={setShowDimensionDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Configure Dimensions - {selectedConfigurableProduct?.name}
            </DialogTitle>
          </DialogHeader>
          
          {selectedConfigurableProduct && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Enter the dimensions for this configurable product to calculate pricing.
              </p>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Length (ft)
                  </label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="12.0"
                    value={dimensions.length}
                    onChange={(e) => setDimensions(prev => ({ ...prev, length: e.target.value }))}
                  />
                  {dimensions.length && !isNaN(parseFloat(dimensions.length)) && (
                    <p className="text-xs text-gray-500 mt-1">
                      {(parseFloat(dimensions.length) * 304.8).toFixed(0)}mm
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Width (ft)
                  </label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="8.0"
                    value={dimensions.width}
                    onChange={(e) => setDimensions(prev => ({ ...prev, width: e.target.value }))}
                  />
                  {dimensions.width && !isNaN(parseFloat(dimensions.width)) && (
                    <p className="text-xs text-gray-500 mt-1">
                      {(parseFloat(dimensions.width) * 304.8).toFixed(0)}mm
                    </p>
                  )}
                </div>
              </div>
              
              {dimensions.length && dimensions.width && (
                <div className="bg-blue-50 p-3 rounded-md">
                  <p className="text-sm text-blue-800">
                    Dimensions: <strong>{dimensions.length} × {dimensions.width} ft</strong>
                  </p>
                </div>
              )}
              
              <div className="flex space-x-2">
                <Button
                  onClick={handleCalculatePricing}
                  disabled={!dimensions.length || !dimensions.width || calculatePricingMutation.isPending}
                  className="flex-1"
                  variant="outline"
                >
                  {calculatePricingMutation.isPending ? "Calculating..." : "Calculate Price"}
                </Button>
              </div>
              
              {calculatedPrice !== null && (
                <div className="bg-green-50 border border-green-200 p-3 rounded-md">
                  <p className="text-sm text-green-800">
                    <strong>Calculated Price: {formatCurrency(calculatedPrice)}</strong>
                  </p>
                  <p className="text-xs text-green-600 mt-1">
                    Base price for {dimensions.length} × {dimensions.width} ft
                  </p>
                </div>
              )}
              
              <div className="flex justify-end space-x-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowDimensionDialog(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleConfirmConfigurableProduct}
                  disabled={calculatedPrice === null || createLineItemMutation.isPending}
                  className="bg-edg-black hover:bg-edg-grey text-white"
                >
                  {createLineItemMutation.isPending ? "Adding..." : "Add to Quote"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
