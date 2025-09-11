import { useState, useMemo, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Trash2, Edit, Plus, Package, Search, Filter, X, ChevronDown, ChevronUp, Save, XCircle, Percent, DollarSign, Check, CheckSquare, Square, Minus, Users, Tags, Settings, Eye, EyeOff, Calculator, Receipt, TrendingUp, ShoppingCart, Layers, Target } from "lucide-react";
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
  
  // Progressive disclosure state
  const [showAdvancedFields, setShowAdvancedFields] = useState<boolean>(() => {
    // Load preference from sessionStorage, default to false (simple view)
    const saved = sessionStorage.getItem('line-items-show-advanced');
    return saved ? JSON.parse(saved) : false;
  });

  // Bulk selection states
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [showBulkDiscountDialog, setShowBulkDiscountDialog] = useState(false);
  const [showBulkMarkupDialog, setShowBulkMarkupDialog] = useState(false);
  const [bulkDiscountType, setBulkDiscountType] = useState<"percentage" | "dollar">("percentage");
  const [bulkDiscountValue, setBulkDiscountValue] = useState("");
  const [bulkMarkupType, setBulkMarkupType] = useState<"percentage" | "dollar">("percentage");
  const [bulkMarkupValue, setBulkMarkupValue] = useState("");

  // Responsive detection
  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    
    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);
    
    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);

  // Persist advanced fields preference
  useEffect(() => {
    sessionStorage.setItem('line-items-show-advanced', JSON.stringify(showAdvancedFields));
  }, [showAdvancedFields]);

  // Toggle advanced fields display
  const toggleAdvancedFields = () => {
    setShowAdvancedFields(prev => !prev);
  };

  // Clear selected items when line items data changes to avoid stale IDs
  useEffect(() => {
    const validIds = new Set(lineItems.map(item => item.id));
    const currentSelectedIds = Array.from(selectedItems);
    const hasStaleIds = currentSelectedIds.some(id => !validIds.has(id));
    
    if (hasStaleIds) {
      const validSelectedIds = currentSelectedIds.filter(id => validIds.has(id));
      setSelectedItems(new Set(validSelectedIds));
    }
  }, [lineItems, selectedItems]);

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

  // Bulk operation mutations
  const bulkDeleteLineItemsMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const response = await apiRequest("DELETE", "/api/line-items/bulk", { ids });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      queryClient.invalidateQueries({ queryKey: [`/api/quotes/${quoteId}`] });
      setSelectedItems(new Set());
      setShowBulkDeleteDialog(false);
      toast({ title: `Successfully deleted ${data.deletedCount} line items` });
    },
    onError: (error: any) => {
      console.error("Bulk delete error:", error);
      let errorMessage = "Failed to delete line items";
      if (error?.response?.status === 403) {
        errorMessage = "Unauthorized: You can only delete your own line items";
      } else if (error?.response?.status === 400) {
        errorMessage = error?.response?.data?.message || "Invalid data provided";
      }
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
    },
  });

  const bulkUpdateLineItemsMutation = useMutation({
    mutationFn: async ({ ids, updates }: { ids: number[]; updates: Record<string, any> }) => {
      const response = await apiRequest("PUT", "/api/line-items/bulk", { ids, updates });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      queryClient.invalidateQueries({ queryKey: [`/api/quotes/${quoteId}`] });
      setSelectedItems(new Set());
      setShowBulkDiscountDialog(false);
      setShowBulkMarkupDialog(false);
      setBulkDiscountValue("");
      setBulkMarkupValue("");
      toast({ title: `Successfully updated ${data.updatedCount} line items` });
    },
    onError: (error: any) => {
      console.error("Bulk update error:", error);
      let errorMessage = "Failed to update line items";
      if (error?.response?.status === 403) {
        errorMessage = "Unauthorized: You can only update your own line items";
      } else if (error?.response?.status === 400) {
        errorMessage = error?.response?.data?.message || "Invalid data provided";
      }
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
    },
  });

  // Selection helper functions
  const handleSelectItem = (itemId: number, checked: boolean) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(itemId);
      } else {
        newSet.delete(itemId);
      }
      return newSet;
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedItems(new Set(lineItems.map(item => item.id)));
    } else {
      setSelectedItems(new Set());
    }
  };

  const clearSelection = () => {
    setSelectedItems(new Set());
  };

  // Bulk operation handlers
  const handleBulkDelete = () => {
    if (selectedItems.size === 0) return;
    setShowBulkDeleteDialog(true);
  };

  const confirmBulkDelete = () => {
    if (selectedItems.size === 0) return;
    bulkDeleteLineItemsMutation.mutate(Array.from(selectedItems));
  };

  const handleBulkDiscount = () => {
    if (selectedItems.size === 0) return;
    setBulkDiscountValue("");
    setBulkDiscountType("percentage");
    setShowBulkDiscountDialog(true);
  };

  const confirmBulkDiscount = () => {
    if (selectedItems.size === 0 || !bulkDiscountValue) return;
    
    const discountValue = parseFloat(bulkDiscountValue);
    
    // Frontend validation with user feedback
    if (isNaN(discountValue) || discountValue < 0) {
      toast({ 
        title: "Invalid discount value", 
        description: "Discount value must be a positive number", 
        variant: "destructive" 
      });
      return;
    }
    
    if (bulkDiscountType === 'percentage' && discountValue > 100) {
      toast({ 
        title: "Invalid discount percentage", 
        description: "Discount percentage cannot exceed 100%", 
        variant: "destructive" 
      });
      return;
    }
    
    if (bulkDiscountType === 'dollar' && discountValue > 10000) {
      toast({ 
        title: "Invalid discount amount", 
        description: "Discount amount seems unusually high. Please verify.", 
        variant: "destructive" 
      });
      return;
    }
    
    const updates = {
      discountType: bulkDiscountType,
      discountValue: discountValue.toString()
    };
    bulkUpdateLineItemsMutation.mutate({
      ids: Array.from(selectedItems),
      updates
    });
  };

  const handleBulkMarkup = () => {
    if (selectedItems.size === 0) return;
    setBulkMarkupValue("");
    setBulkMarkupType("percentage");
    setShowBulkMarkupDialog(true);
  };

  const confirmBulkMarkup = () => {
    if (selectedItems.size === 0 || !bulkMarkupValue) return;
    
    const markupValue = parseFloat(bulkMarkupValue);
    
    // Frontend validation with user feedback
    if (isNaN(markupValue) || markupValue < 0) {
      toast({ 
        title: "Invalid markup value", 
        description: "Markup value must be a positive number", 
        variant: "destructive" 
      });
      return;
    }
    
    if (bulkMarkupType === 'percentage' && markupValue > 1000) {
      toast({ 
        title: "Invalid markup percentage", 
        description: "Markup percentage cannot exceed 1000%", 
        variant: "destructive" 
      });
      return;
    }
    
    if (bulkMarkupType === 'dollar' && markupValue > 10000) {
      toast({ 
        title: "Invalid markup amount", 
        description: "Markup amount seems unusually high. Please verify.", 
        variant: "destructive" 
      });
      return;
    }
    
    const updates = {
      markupType: bulkMarkupType,
      markupValue: markupValue.toString()
    };
    bulkUpdateLineItemsMutation.mutate({
      ids: Array.from(selectedItems),
      updates
    });
  };

  // Computed values for selection state
  const selectedCount = selectedItems.size;
  const allSelected = lineItems.length > 0 && selectedItems.size === lineItems.length;
  const someSelected = selectedItems.size > 0 && selectedItems.size < lineItems.length;

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

  // Render discount/markup control component
  const DiscountMarkupControl = ({
    label,
    editingValue,
    originalValue,
    type,
    onValueChange,
    onTypeChange,
    isEditing = false,
    testIdPrefix,
    variant = "mobile" // "mobile" or "desktop"
  }: {
    label: string;
    editingValue: string | undefined;
    originalValue: number;
    type: "percentage" | "dollar";
    onValueChange: (value: string) => void;
    onTypeChange: (type: "percentage" | "dollar") => void;
    isEditing?: boolean;
    testIdPrefix: string;
    variant?: "mobile" | "desktop";
  }) => {
    const displayValue = safeInputValue(editingValue, originalValue);
    
    if (!isEditing) {
      return (
        <div className={`text-sm py-2 ${variant === 'desktop' ? '' : 'bg-gray-50 border border-gray-200 rounded-md px-3 py-2 text-center'}`}>
          {originalValue} {type === 'percentage' ? '%' : '$'}
        </div>
      );
    }

    const isMobileVariant = variant === "mobile";
    
    return (
      <div className={`space-y-2 ${isMobileVariant ? 'bg-white border border-edg-teal rounded-md p-3' : 'border border-edg-teal rounded-md p-2 bg-white'}`}>
        <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
        
        {/* Value Input */}
        <Input
          type="number"
          step="0.01"
          min="0"
          value={displayValue}
          onChange={(e) => onValueChange(e.target.value)}
          className={`text-center text-sm border-gray-300 focus:border-edg-teal focus:ring-edg-teal bg-white ${
            isMobileVariant ? 'h-10' : 'h-8'
          }`}
          placeholder="0"
          data-testid={testIdPrefix}
        />
        
        {/* Type Selection - Radio Buttons */}
        <div className={`flex gap-1 ${isMobileVariant ? 'justify-center' : ''}`}>
          <button
            type="button"
            onClick={() => onTypeChange("percentage")}
            className={`flex items-center justify-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
              type === "percentage" 
                ? "bg-edg-teal text-white" 
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            } ${isMobileVariant ? 'flex-1 h-8' : 'h-6'}`}
            data-testid={`${testIdPrefix}-type-percentage`}
          >
            <Percent className={`${isMobileVariant ? 'h-3 w-3' : 'h-3 w-3'}`} />
            %
          </button>
          <button
            type="button"
            onClick={() => onTypeChange("dollar")}
            className={`flex items-center justify-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
              type === "dollar" 
                ? "bg-edg-teal text-white" 
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            } ${isMobileVariant ? 'flex-1 h-8' : 'h-6'}`}
            data-testid={`${testIdPrefix}-type-dollar`}
          >
            <DollarSign className={`${isMobileVariant ? 'h-3 w-3' : 'h-3 w-3'}`} />
            $
          </button>
        </div>
      </div>
    );
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
      <div key={item.id} className={`border rounded-lg p-4 mb-4 bg-white transition-shadow relative ${
        isEditing 
          ? 'border-edg-teal shadow-md bg-blue-50' 
          : selectedItems.has(item.id)
          ? 'border-blue-400 shadow-md bg-blue-50'
          : 'border-gray-200 hover:shadow-sm'
      }`}>
        {/* Selection Checkbox - Top Right */}
        <div className="absolute top-3 right-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleSelectItem(item.id, !selectedItems.has(item.id))}
            className="p-1 h-8 w-8"
            disabled={isEditing}
            data-testid={`checkbox-mobile-${item.id}`}
          >
            {selectedItems.has(item.id) ? (
              <CheckSquare className="h-5 w-5 text-edg-teal" />
            ) : (
              <Square className="h-5 w-5 text-gray-400" />
            )}
          </Button>
        </div>

        {/* Main Info - Always Visible */}
        <div className="space-y-3 pr-10">{/* Add padding-right to avoid overlap with checkbox */}
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
              {showAdvancedFields && (
                <>
                  {/* Discount Controls */}
                  <DiscountMarkupControl
                    label="Discount"
                    editingValue={editingValues[item.id]?.discountValue}
                    originalValue={item.discountValue}
                    type={currentDiscountType}
                    onValueChange={(value) => updateEditingValue(item.id, "discountValue", value)}
                    onTypeChange={(type) => updateEditingValue(item.id, "discountType", type)}
                    isEditing={isEditing}
                    testIdPrefix={`input-discount-value-${item.id}`}
                    variant="mobile"
                  />

                  {/* Markup Controls */}
                  <DiscountMarkupControl
                    label="Markup"
                    editingValue={editingValues[item.id]?.markupValue}
                    originalValue={item.markupValue}
                    type={currentMarkupType}
                    onValueChange={(value) => updateEditingValue(item.id, "markupValue", value)}
                    onTypeChange={(type) => updateEditingValue(item.id, "markupType", type)}
                    isEditing={isEditing}
                    testIdPrefix={`input-markup-value-${item.id}`}
                    variant="mobile"
                  />

                  {/* Margin Display */}
                  <div className="bg-green-50 border border-green-200 rounded-md p-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-green-800">Margin:</span>
                      <span className="text-sm font-semibold text-green-600">{formatCurrency(margin)}</span>
                    </div>
                  </div>
                </>
              )}
              {!showAdvancedFields && (
                <div className="text-center py-4 text-gray-500">
                  <p className="text-sm">Advanced fields hidden</p>
                  <p className="text-xs">Use "Show Advanced" toggle to see discount, markup, and margin details</p>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>
    );
  };

  return (
    <Card className="mb-6 shadow-sm border-gray-200 bg-white">
      <CardHeader className="border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white px-6 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <CardTitle className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Receipt className="h-5 w-5 text-edg-teal" />
              Line Items
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={toggleAdvancedFields}
              className={`flex items-center gap-2 transition-all duration-200 font-medium ${
                showAdvancedFields 
                  ? 'border-edg-teal text-edg-teal bg-edg-teal bg-opacity-10 shadow-sm' 
                  : 'border-gray-300 text-gray-600 hover:border-edg-teal hover:text-edg-teal hover:bg-gray-50'
              }`}
              data-testid="button-toggle-advanced-fields"
            >
              {showAdvancedFields ? (
                <>
                  <EyeOff className="h-4 w-4" />
                  Hide Advanced
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4" />
                  Show Advanced
                </>
              )}
            </Button>
          </div>
          <div className="mt-3 sm:mt-0 flex space-x-2">
            <Dialog open={showProductDialog} onOpenChange={setShowProductDialog}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="border-edg-teal text-edg-teal hover:bg-edg-teal hover:text-white font-medium transition-all duration-200 shadow-sm"
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
              className="bg-edg-teal hover:bg-edg-dark-teal text-white font-semibold shadow-md transition-all duration-200 hover:shadow-lg"
            >
              <Plus className="mr-2 h-4 w-4" />
              Custom Item
            </Button>
          </div>
        </div>
      </CardHeader>

      {/* Bulk Action Bar */}
      {selectedCount > 0 && (
        <div className="bg-gradient-to-r from-blue-50 to-blue-100 border-y border-blue-200 px-6 py-4 shadow-inner">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Users className="h-4 w-4 text-blue-600" />
              <span className="text-base font-semibold text-blue-900">
                {selectedCount} item{selectedCount === 1 ? '' : 's'} selected
              </span>
            </div>
            
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkDiscount}
                className="border-blue-300 text-blue-700 hover:bg-blue-100 font-medium transition-all duration-200 hover:shadow-sm"
                data-testid="button-bulk-discount"
              >
                <Percent className="h-4 w-4 mr-1" />
                Apply Discount
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkMarkup}
                className="border-blue-300 text-blue-700 hover:bg-blue-100 font-medium transition-all duration-200 hover:shadow-sm"
                data-testid="button-bulk-markup"
              >
                <Tags className="h-4 w-4 mr-1" />
                Apply Markup
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkDelete}
                className="border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400 font-medium transition-all duration-200 hover:shadow-sm"
                data-testid="button-bulk-delete"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete Selected
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={clearSelection}
                className="text-gray-500 hover:text-gray-700"
                data-testid="button-clear-selection"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <CardContent className="p-0">
        {isMobile ? (
          // Mobile Card Layout
          <div className="p-4 space-y-4">
            {/* Mobile Select All Header */}
            {lineItems.length > 0 && (
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                <div className="flex items-center space-x-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSelectAll(!allSelected)}
                    className="p-1 h-8 w-8"
                    data-testid="button-select-all-mobile"
                  >
                    {allSelected ? (
                      <CheckSquare className="h-5 w-5 text-edg-teal" />
                    ) : someSelected ? (
                      <Minus className="h-5 w-5 text-edg-teal" />
                    ) : (
                      <Square className="h-5 w-5 text-gray-400" />
                    )}
                  </Button>
                  <span className="text-sm font-medium text-gray-700">
                    Select All ({selectedCount} of {lineItems.length} selected)
                  </span>
                </div>
                {selectedCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearSelection}
                    className="text-gray-500 hover:text-gray-700"
                    data-testid="button-clear-selection-mobile"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )}
            
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
                  {showAdvancedFields && (
                    <div className="space-y-3 pt-3 border-t border-blue-200">
                      <div className="grid grid-cols-2 gap-4">
                        <DiscountMarkupControl
                          label="Discount"
                          editingValue={newItem.discountValue}
                          originalValue={0}
                          type={newItem.discountType}
                          onValueChange={(value) => setNewItem({ ...newItem, discountValue: value })}
                          onTypeChange={(type) => setNewItem({ ...newItem, discountType: type })}
                          isEditing={true}
                          testIdPrefix="input-discount-new-mobile"
                          variant="mobile"
                        />
                        <DiscountMarkupControl
                          label="Markup"
                          editingValue={newItem.markupValue}
                          originalValue={0}
                          type={newItem.markupType}
                          onValueChange={(value) => setNewItem({ ...newItem, markupValue: value })}
                          onTypeChange={(type) => setNewItem({ ...newItem, markupType: type })}
                          isEditing={true}
                          testIdPrefix="input-markup-new-mobile"
                          variant="mobile"
                        />
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
                  )}

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
            <table className="w-full table-fixed divide-y divide-gray-200 bg-white">
            <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
              <tr>
                <th className="px-3 py-4 text-center text-xs font-bold text-gray-700 uppercase tracking-wide w-12">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSelectAll(!allSelected)}
                    className="p-1 h-6 w-6"
                    data-testid="button-select-all"
                  >
                    {allSelected ? (
                      <CheckSquare className="h-4 w-4 text-edg-teal" />
                    ) : someSelected ? (
                      <Minus className="h-4 w-4 text-edg-teal" />
                    ) : (
                      <Square className="h-4 w-4 text-gray-400" />
                    )}
                  </Button>
                </th>
                <th className="px-4 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wide w-56">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-edg-teal" />
                    Description
                  </div>
                </th>
                <th className="px-3 py-4 text-center text-xs font-bold text-gray-700 uppercase tracking-wide w-20">
                  <div className="flex items-center justify-center gap-1">
                    <Calculator className="h-4 w-4 text-edg-teal" />
                    Qty
                  </div>
                </th>
                <th className="px-3 py-4 text-center text-xs font-bold text-gray-700 uppercase tracking-wide w-28">
                  <div className="flex items-center justify-center gap-1">
                    <DollarSign className="h-4 w-4 text-edg-teal" />
                    Unit Price
                  </div>
                </th>
                {showAdvancedFields && (
                  <th className="px-3 py-4 text-center text-xs font-bold text-gray-700 uppercase tracking-wide w-32">
                    <div className="flex items-center justify-center gap-1">
                      <Percent className="h-4 w-4 text-orange-500" />
                      Discount
                    </div>
                  </th>
                )}
                {showAdvancedFields && (
                  <th className="px-3 py-4 text-center text-xs font-bold text-gray-700 uppercase tracking-wide w-32">
                    <div className="flex items-center justify-center gap-1">
                      <TrendingUp className="h-4 w-4 text-green-500" />
                      Markup
                    </div>
                  </th>
                )}
                {showAdvancedFields && (
                  <th className="px-3 py-4 text-right text-xs font-bold text-gray-700 uppercase tracking-wide w-24">
                    <div className="flex items-center justify-end gap-1">
                      <Target className="h-4 w-4 text-emerald-500" />
                      Margin
                    </div>
                  </th>
                )}
                <th className="px-3 py-4 text-right text-xs font-bold text-gray-700 uppercase tracking-wide w-28">
                  <div className="flex items-center justify-end gap-1">
                    <Receipt className="h-4 w-4 text-edg-teal" />
                    Total
                  </div>
                </th>
                <th className="px-3 py-4 text-center text-xs font-bold text-gray-700 uppercase tracking-wide w-20">
                  <div className="flex items-center justify-center gap-1">
                    <Settings className="h-4 w-4 text-gray-500" />
                    Actions
                  </div>
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
                  <tr key={item.id} className={`transition-all duration-200 ${
                    isEditing 
                      ? 'bg-gradient-to-r from-blue-50 to-blue-100 border-l-4 border-edg-teal shadow-sm'
                      : selectedItems.has(item.id)
                      ? 'bg-gradient-to-r from-blue-50 to-blue-100 border-l-4 border-blue-400 shadow-sm'
                      : 'hover:bg-gradient-to-r hover:from-gray-50 hover:to-gray-100 hover:shadow-sm'
                  }`}>
                    <td className="px-2 py-3 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSelectItem(item.id, !selectedItems.has(item.id))}
                        className="p-1 h-6 w-6"
                        disabled={isEditing}
                        data-testid={`checkbox-${item.id}`}
                      >
                        {selectedItems.has(item.id) ? (
                          <CheckSquare className="h-4 w-4 text-edg-teal" />
                        ) : (
                          <Square className="h-4 w-4 text-gray-400" />
                        )}
                      </Button>
                    </td>
                    <td className="px-3 py-3">
                      <div>
                        {isEditing ? (
                          <Input
                            value={safeInputValue(editingValues[item.id]?.description, item.description)}
                            onChange={(e) => updateEditingValue(item.id, "description", e.target.value)}
                            className="text-sm font-medium border-2 border-edg-teal focus:ring-2 focus:ring-edg-teal/20 bg-white shadow-sm transition-all duration-200"
                            data-testid={`input-description-${item.id}`}
                            autoFocus
                          />
                        ) : (
                          <div className="text-sm py-2 px-1 text-gray-900 font-semibold leading-relaxed">
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
                          className="w-full text-center text-sm font-semibold border-2 border-edg-teal focus:ring-2 focus:ring-edg-teal/20 bg-white shadow-sm transition-all duration-200"
                          data-testid={`input-quantity-${item.id}`}
                        />
                      ) : (
                        <div className="text-sm py-2 font-bold text-gray-800 bg-gray-50 rounded-md border border-gray-200 px-2">
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
                          className="w-full text-center text-sm font-semibold border-2 border-edg-teal focus:ring-2 focus:ring-edg-teal/20 bg-white shadow-sm transition-all duration-200"
                          data-testid={`input-unit-price-${item.id}`}
                        />
                      ) : (
                        <div className="text-sm py-2 font-bold text-edg-teal bg-edg-teal/5 rounded-md border border-edg-teal/20 px-2">
                          {formatCurrency(item.unitPrice)}
                        </div>
                      )}
                    </td>
                    {showAdvancedFields && (
                      <td className="px-2 py-3 text-center">
                        <DiscountMarkupControl
                          label=""
                          editingValue={editingValues[item.id]?.discountValue}
                          originalValue={item.discountValue}
                          type={currentDiscountType}
                          onValueChange={(value) => updateEditingValue(item.id, "discountValue", value)}
                          onTypeChange={(type) => updateEditingValue(item.id, "discountType", type)}
                          isEditing={isEditing}
                          testIdPrefix={`input-discount-value-${item.id}`}
                          variant="desktop"
                        />
                      </td>
                    )}
                    {showAdvancedFields && (
                      <td className="px-2 py-3 text-center">
                        <DiscountMarkupControl
                          label=""
                          editingValue={editingValues[item.id]?.markupValue}
                          originalValue={item.markupValue}
                          type={currentMarkupType}
                          onValueChange={(value) => updateEditingValue(item.id, "markupValue", value)}
                          onTypeChange={(type) => updateEditingValue(item.id, "markupType", type)}
                          isEditing={isEditing}
                          testIdPrefix={`input-markup-value-${item.id}`}
                          variant="desktop"
                        />
                      </td>
                    )}
                    {showAdvancedFields && (
                      <td className="px-3 py-4 text-right">
                        <div className="text-sm font-bold text-emerald-600 bg-emerald-50 rounded-md border border-emerald-200 py-2 px-3">
                          {formatCurrency(margin)}
                        </div>
                      </td>
                    )}
                    <td className="px-3 py-4 text-right">
                      <div className="text-base font-bold text-gray-900 bg-gray-100 rounded-lg border-2 border-gray-300 py-3 px-4 shadow-sm">
                        {formatCurrency(total)}
                      </div>
                    </td>
                    <td className="px-2 py-3 text-center">
                      {isEditing ? (
                        <div className="flex items-center justify-center space-x-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleCancelEdit}
                            className="text-gray-600 hover:text-red-600 hover:bg-red-50 transition-all duration-200"
                            data-testid={`button-cancel-edit-${item.id}`}
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleSaveEdit(item)}
                            disabled={updateLineItemMutation.isPending}
                            className="bg-edg-teal text-white hover:bg-edg-dark-teal shadow-md hover:shadow-lg transition-all duration-200"
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
                            className="border-gray-300 text-gray-700 hover:border-edg-teal hover:text-edg-teal hover:bg-edg-teal/5 transition-all duration-200"
                            data-testid={`button-edit-${item.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteItem(item.id)}
                            className="border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400 hover:text-red-700 hover:shadow-md transition-all duration-200"
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
                  <td className="px-2 py-3 text-center">
                    {/* Empty cell for checkbox column alignment */}
                  </td>
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
                  {showAdvancedFields && (
                    <td className="px-2 py-3 text-center">
                      <DiscountMarkupControl
                        label=""
                        editingValue={newItem.discountValue}
                        originalValue={0}
                        type={newItem.discountType}
                        onValueChange={(value) => setNewItem({ ...newItem, discountValue: value })}
                        onTypeChange={(type) => setNewItem({ ...newItem, discountType: type })}
                        isEditing={true}
                        testIdPrefix="input-discount-new"
                        variant="desktop"
                      />
                    </td>
                  )}
                  {showAdvancedFields && (
                    <td className="px-2 py-3 text-center">
                      <DiscountMarkupControl
                        label=""
                        editingValue={newItem.markupValue}
                        originalValue={0}
                        type={newItem.markupType}
                        onValueChange={(value) => setNewItem({ ...newItem, markupValue: value })}
                        onTypeChange={(type) => setNewItem({ ...newItem, markupType: type })}
                        isEditing={true}
                        testIdPrefix="input-markup-new"
                        variant="desktop"
                      />
                    </td>
                  )}
                  {showAdvancedFields && (
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
                  )}
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

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Bulk Delete</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Are you sure you want to delete the following {selectedCount} line item{selectedCount === 1 ? '' : 's'}?
            </p>
            
            <div className="bg-red-50 border border-red-200 rounded-md p-3 max-h-48 overflow-y-auto">
              {lineItems
                .filter(item => selectedItems.has(item.id))
                .map(item => (
                  <div key={item.id} className="text-sm text-red-800 py-1 border-b border-red-200 last:border-b-0">
                    • {item.description}
                  </div>
                ))
              }
            </div>
            
            <p className="text-xs text-red-600">
              This action cannot be undone.
            </p>
            
            <div className="flex justify-end space-x-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowBulkDeleteDialog(false)}
                data-testid="button-cancel-bulk-delete"
              >
                Cancel
              </Button>
              <Button
                onClick={confirmBulkDelete}
                disabled={bulkDeleteLineItemsMutation.isPending}
                className="bg-red-600 hover:bg-red-700 text-white"
                data-testid="button-confirm-bulk-delete"
              >
                {bulkDeleteLineItemsMutation.isPending ? "Deleting..." : `Delete ${selectedCount} Item${selectedCount === 1 ? '' : 's'}`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Discount Dialog */}
      <Dialog open={showBulkDiscountDialog} onOpenChange={setShowBulkDiscountDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Apply Bulk Discount</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Apply a discount to {selectedCount} selected line item{selectedCount === 1 ? '' : 's'}.
            </p>
            
            {!showAdvancedFields && (
              <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                <p className="text-sm text-blue-800">
                  💡 <strong>Tip:</strong> Enable "Show Advanced" to see discount values in the table after applying.
                </p>
              </div>
            )}
            
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">
                Discount Value
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0"
                value={bulkDiscountValue}
                onChange={(e) => {
                  const value = e.target.value;
                  const numValue = parseFloat(value);
                  
                  // Allow empty string for user editing
                  if (value === '' || (!isNaN(numValue) && numValue >= 0)) {
                    setBulkDiscountValue(value);
                  }
                }}
                className={`text-center ${
                  bulkDiscountValue && (
                    isNaN(parseFloat(bulkDiscountValue)) ||
                    parseFloat(bulkDiscountValue) < 0 ||
                    (bulkDiscountType === 'percentage' && parseFloat(bulkDiscountValue) > 100)
                  ) ? 'border-red-300 focus:border-red-500' : ''
                }`}
                data-testid="input-bulk-discount-value"
              />
              
              <div className="flex space-x-2">
                <Button
                  type="button"
                  variant={bulkDiscountType === "percentage" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setBulkDiscountType("percentage")}
                  className="flex-1"
                  data-testid="button-bulk-discount-percentage"
                >
                  <Percent className="h-4 w-4 mr-1" />
                  Percentage
                </Button>
                <Button
                  type="button"
                  variant={bulkDiscountType === "dollar" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setBulkDiscountType("dollar")}
                  className="flex-1"
                  data-testid="button-bulk-discount-dollar"
                >
                  <DollarSign className="h-4 w-4 mr-1" />
                  Dollar
                </Button>
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowBulkDiscountDialog(false)}
                data-testid="button-cancel-bulk-discount"
              >
                Cancel
              </Button>
              <Button
                onClick={confirmBulkDiscount}
                disabled={!bulkDiscountValue || bulkUpdateLineItemsMutation.isPending}
                className="bg-edg-teal hover:bg-edg-teal/90 text-white"
                data-testid="button-confirm-bulk-discount"
              >
                {bulkUpdateLineItemsMutation.isPending ? "Applying..." : "Apply Discount"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Markup Dialog */}
      <Dialog open={showBulkMarkupDialog} onOpenChange={setShowBulkMarkupDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Apply Bulk Markup</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Apply a markup to {selectedCount} selected line item{selectedCount === 1 ? '' : 's'}.
            </p>
            
            {!showAdvancedFields && (
              <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                <p className="text-sm text-blue-800">
                  💡 <strong>Tip:</strong> Enable "Show Advanced" to see markup values in the table after applying.
                </p>
              </div>
            )}
            
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">
                Markup Value
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0"
                value={bulkMarkupValue}
                onChange={(e) => {
                  const value = e.target.value;
                  const numValue = parseFloat(value);
                  
                  // Allow empty string for user editing
                  if (value === '' || (!isNaN(numValue) && numValue >= 0)) {
                    setBulkMarkupValue(value);
                  }
                }}
                className={`text-center ${
                  bulkMarkupValue && (
                    isNaN(parseFloat(bulkMarkupValue)) ||
                    parseFloat(bulkMarkupValue) < 0 ||
                    (bulkMarkupType === 'percentage' && parseFloat(bulkMarkupValue) > 1000)
                  ) ? 'border-red-300 focus:border-red-500' : ''
                }`}
                data-testid="input-bulk-markup-value"
              />
              
              <div className="flex space-x-2">
                <Button
                  type="button"
                  variant={bulkMarkupType === "percentage" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setBulkMarkupType("percentage")}
                  className="flex-1"
                  data-testid="button-bulk-markup-percentage"
                >
                  <Percent className="h-4 w-4 mr-1" />
                  Percentage
                </Button>
                <Button
                  type="button"
                  variant={bulkMarkupType === "dollar" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setBulkMarkupType("dollar")}
                  className="flex-1"
                  data-testid="button-bulk-markup-dollar"
                >
                  <DollarSign className="h-4 w-4 mr-1" />
                  Dollar
                </Button>
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowBulkMarkupDialog(false)}
                data-testid="button-cancel-bulk-markup"
              >
                Cancel
              </Button>
              <Button
                onClick={confirmBulkMarkup}
                disabled={!bulkMarkupValue || bulkUpdateLineItemsMutation.isPending}
                className="bg-edg-teal hover:bg-edg-teal/90 text-white"
                data-testid="button-confirm-bulk-markup"
              >
                {bulkUpdateLineItemsMutation.isPending ? "Applying..." : "Apply Markup"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
