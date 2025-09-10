import { useState, useMemo } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Trash2, Edit, Plus, Package, Search, Filter, X } from "lucide-react";
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

  const handleUpdateItem = (item: LineItem, field: string, value: any) => {
    updateLineItemMutation.mutate({
      id: item.id,
      data: { [field]: value },
    });
  };

  const handleBlurUpdate = (item: LineItem, field: string) => {
    const editingValue = (editingValues[item.id] as any)?.[field];
    if (editingValue !== undefined && editingValue !== (item as any)[field]) {
      handleUpdateItem(item, field, editingValue);
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
        <div className="overflow-x-auto">
          <table className="w-full table-fixed divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-2 text-left text-xs font-medium text-edg-grey uppercase w-1/5">
                  Description
                </th>
                <th className="px-1 py-2 text-center text-xs font-medium text-edg-grey uppercase w-12">
                  Qty
                </th>
                <th className="px-1 py-2 text-center text-xs font-medium text-edg-grey uppercase w-20">
                  Unit Price
                </th>
                <th className="px-1 py-2 text-center text-xs font-medium text-edg-grey uppercase w-20">
                  Retail Price
                </th>
                <th className="px-1 py-2 text-center text-xs font-medium text-edg-grey uppercase w-16">
                  Discount
                </th>
                <th className="px-1 py-2 text-center text-xs font-medium text-edg-grey uppercase w-16">
                  Markup
                </th>
                <th className="px-1 py-2 text-right text-xs font-medium text-edg-grey uppercase w-16">
                  Margin
                </th>
                <th className="px-1 py-2 text-right text-xs font-medium text-edg-grey uppercase w-20">
                  Total
                </th>
                <th className="px-1 py-2 text-center text-xs font-medium text-edg-grey uppercase w-12">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {lineItems.map((item) => {
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
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-2 py-2">
                      <Input
                        value={editingValues[item.id]?.description !== undefined ? editingValues[item.id].description : item.description}
                        onChange={(e) => updateEditingValue(item.id, "description", e.target.value)}
                        onBlur={() => handleBlurUpdate(item, "description")}
                        className="border-none bg-transparent focus:ring-2 focus:ring-edg-teal focus:border-transparent text-xs"
                      />
                    </td>
                    <td className="px-1 py-2 text-center">
                      <Input
                        type="number"
                        step="1"
                        min="0"
                        value={editingValues[item.id]?.quantity !== undefined ? editingValues[item.id].quantity : item.quantity}
                        onChange={(e) => updateEditingValue(item.id, "quantity", e.target.value)}
                        onBlur={() => {
                          const value = editingValues[item.id]?.quantity;
                          if (value !== undefined) {
                            const numValue = value === '' ? 0 : parseFloat(value as string);
                            if (!isNaN(numValue)) {
                              handleUpdateItem(item, "quantity", numValue);
                            }
                          }
                        }}
                        className="w-full text-center text-xs"
                      />
                    </td>
                    <td className="px-1 py-2 text-center">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editingValues[item.id]?.unitPrice !== undefined ? editingValues[item.id].unitPrice : item.unitPrice}
                        onChange={(e) => updateEditingValue(item.id, "unitPrice", e.target.value)}
                        onBlur={() => {
                          const value = editingValues[item.id]?.unitPrice;
                          if (value !== undefined) {
                            const numValue = value === '' ? 0 : parseFloat(value as string);
                            if (!isNaN(numValue)) {
                              handleUpdateItem(item, "unitPrice", numValue);
                            }
                          }
                        }}
                        className="w-full text-center text-xs"
                      />
                    </td>
                    <td className="px-1 py-2 text-center">
                      {item.retailPrice && (parseFloat(item.discountValue.toString()) > 0 || parseFloat(item.retailPrice.toString()) !== parseFloat(item.unitPrice.toString())) ? (
                        <div className="text-xs">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={editingValues[item.id]?.retailPrice?.toString() ?? item.retailPrice?.toString() ?? ""}
                            onChange={(e) => updateEditingValue(item.id, "retailPrice", e.target.value)}
                            onBlur={() => {
                              const value = editingValues[item.id]?.retailPrice;
                              if (value !== undefined) {
                                const numValue = value === '' ? null : parseFloat(value as string);
                                if (value === '' || !isNaN(numValue!)) {
                                  handleUpdateItem(item, "retailPrice", numValue);
                                }
                              }
                            }}
                            className="w-full text-center text-xs"
                            data-testid={`input-retail-price-${item.id}`}
                          />
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs" data-testid={`text-no-retail-price-${item.id}`}>-</span>
                      )}
                    </td>
                    <td className="px-1 py-2 text-center">
                      <div className="flex items-center justify-center space-x-1">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={editingValues[item.id]?.discountValue !== undefined ? editingValues[item.id].discountValue : item.discountValue}
                          onChange={(e) => updateEditingValue(item.id, "discountValue", e.target.value)}
                          onBlur={() => {
                            const value = editingValues[item.id]?.discountValue;
                            if (value !== undefined) {
                              const numValue = value === '' ? 0 : parseFloat(value as string);
                              if (!isNaN(numValue)) {
                                handleUpdateItem(item, "discountValue", numValue);
                              }
                            }
                          }}
                          className="w-10 text-center text-xs"
                        />
                        <Select
                          value={item.discountType}
                          onValueChange={(value) => handleUpdateItem(item, "discountType", value)}
                        >
                          <SelectTrigger className="w-8 text-xs h-6">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="percentage">%</SelectItem>
                            <SelectItem value="dollar">$</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </td>
                    <td className="px-1 py-2 text-center">
                      <div className="flex items-center justify-center space-x-1">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={editingValues[item.id]?.markupValue !== undefined ? editingValues[item.id].markupValue : item.markupValue}
                          onChange={(e) => updateEditingValue(item.id, "markupValue", e.target.value)}
                          onBlur={() => {
                            const value = editingValues[item.id]?.markupValue;
                            if (value !== undefined) {
                              const numValue = value === '' ? 0 : parseFloat(value as string);
                              if (!isNaN(numValue)) {
                                handleUpdateItem(item, "markupValue", numValue);
                              }
                            }
                          }}
                          className="w-10 text-center text-xs"
                        />
                        <Select
                          value={item.markupType}
                          onValueChange={(value) => handleUpdateItem(item, "markupType", value)}
                        >
                          <SelectTrigger className="w-8 text-xs h-6">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="percentage">%</SelectItem>
                            <SelectItem value="dollar">$</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </td>
                    <td className="px-1 py-2 text-right text-xs font-medium text-success-green">
                      {formatCurrency(margin)}
                    </td>
                    <td className="px-1 py-2 text-right text-xs font-medium text-edg-black">
                      {formatCurrency(total)}
                    </td>
                    <td className="px-1 py-2 text-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteItem(item.id)}
                        className="border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400 hover:text-red-700 p-1"
                        data-testid={`button-delete-${item.id}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                );
              })}

              {showNewItemForm && (
                <tr className="bg-blue-50">
                  <td className="px-2 py-2">
                    <Input
                      placeholder="Description"
                      value={newItem.description}
                      onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                      className="border border-gray-300 text-xs"
                    />
                  </td>
                  <td className="px-1 py-2 text-center">
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      value={newItem.quantity}
                      onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })}
                      className="w-full text-center text-xs"
                      placeholder="1"
                    />
                  </td>
                  <td className="px-1 py-2 text-center">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={newItem.unitPrice}
                      onChange={(e) => setNewItem({ ...newItem, unitPrice: e.target.value })}
                      className="w-full text-center text-xs"
                      placeholder="0.00"
                      data-testid="input-unit-price-new"
                    />
                  </td>
                  <td className="px-1 py-2 text-center">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={newItem.retailPrice}
                      onChange={(e) => setNewItem({ ...newItem, retailPrice: e.target.value })}
                      className="w-full text-center text-xs"
                      placeholder="0.00"
                      data-testid="input-retail-price-new"
                    />
                  </td>
                  <td className="px-1 py-2 text-center">
                    <div className="flex items-center justify-center space-x-1">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={newItem.discountValue}
                        onChange={(e) => setNewItem({ ...newItem, discountValue: e.target.value })}
                        className="w-10 text-center text-xs"
                        placeholder="0"
                      />
                      <Select
                        value={newItem.discountType}
                        onValueChange={(value) => setNewItem({ ...newItem, discountType: value as "percentage" | "dollar" })}
                      >
                        <SelectTrigger className="w-8 text-xs h-6">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percentage">%</SelectItem>
                          <SelectItem value="dollar">$</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </td>
                  <td className="px-1 py-2 text-center">
                    <div className="flex items-center justify-center space-x-1">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={newItem.markupValue}
                        onChange={(e) => setNewItem({ ...newItem, markupValue: e.target.value })}
                        className="w-10 text-center text-xs"
                        placeholder="0"
                      />
                      <Select
                        value={newItem.markupType}
                        onValueChange={(value) => setNewItem({ ...newItem, markupType: value as "percentage" | "dollar" })}
                      >
                        <SelectTrigger className="w-8 text-xs h-6">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percentage">%</SelectItem>
                          <SelectItem value="dollar">$</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </td>
                  <td className="px-1 py-2 text-right text-xs font-medium text-success-green">
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
                  <td className="px-1 py-2 text-right text-xs font-medium text-edg-black">
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
                  <td className="px-1 py-2 text-center space-x-1">
                    <Button
                      size="sm"
                      onClick={handleAddItem}
                      disabled={!newItem.description || createLineItemMutation.isPending}
                      className="bg-edg-black hover:bg-edg-grey text-edg-white text-xs p-1"
                    >
                      Save
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowNewItemForm(false)}
                      className="text-xs p-1"
                    >
                      Cancel
                    </Button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
