import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Trash2, Edit, Plus, Package } from "lucide-react";
import { formatCurrency, calculateLineItemTotal } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { LineItem, Product } from "@shared/schema";

interface LineItemsTableProps {
  quoteId: number;
  lineItems: LineItem[];
}

export function LineItemsTable({ quoteId, lineItems }: LineItemsTableProps) {
  const [editingItem, setEditingItem] = useState<number | null>(null);
  const [newItem, setNewItem] = useState({
    description: "",
    quantity: "1",
    unitPrice: "0",
    markupType: "percentage" as "percentage" | "dollar",
    markupValue: "0",
  });
  const [showNewItemForm, setShowNewItemForm] = useState(false);
  const [showProductDialog, setShowProductDialog] = useState(false);

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
        unitPrice: "0",
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      queryClient.invalidateQueries({ queryKey: [`/api/quotes/${quoteId}`] });
      setEditingItem(null);
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

  const handleAddItem = () => {
    const itemData = {
      description: newItem.description,
      quantity: newItem.quantity,
      unitPrice: newItem.unitPrice,
      markupType: newItem.markupType,
      markupValue: newItem.markupValue,
    };

    createLineItemMutation.mutate(itemData);
  };

  const handleUpdateItem = (item: LineItem, field: string, value: any) => {
    updateLineItemMutation.mutate({
      id: item.id,
      data: { [field]: value },
    });
  };

  const handleDeleteItem = (id: number) => {
    if (confirm("Are you sure you want to delete this line item?")) {
      deleteLineItemMutation.mutate(id);
    }
  };

  const handleAddFromProduct = (product: Product) => {
    setNewItem({
      description: product.name,
      quantity: "1",
      unitPrice: product.defaultUnitPrice,
      markupType: product.defaultMarkupType as "percentage" | "dollar",
      markupValue: product.defaultMarkupValue,
    });
    setShowProductDialog(false);
    setShowNewItemForm(true);
  };

  const groupedProducts = products?.reduce((groups, product) => {
    const category = product.category || "Uncategorized";
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(product);
    return groups;
  }, {} as Record<string, Product[]>) || {};

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
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Select Product from Catalog</DialogTitle>
                </DialogHeader>
                {!products || products.length === 0 ? (
                  <div className="text-center py-8">
                    <Package className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                    <p className="text-gray-500">No products in catalog. Create products first.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {Object.entries(groupedProducts).map(([category, categoryProducts]) => (
                      <div key={category}>
                        <h3 className="text-lg font-semibold text-edg-black mb-3">{category}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {categoryProducts.map((product) => (
                            <div
                              key={product.id}
                              className="p-4 border border-gray-200 rounded-lg hover:border-edg-teal cursor-pointer transition-colors"
                              onClick={() => handleAddFromProduct(product)}
                            >
                              <div className="flex justify-between items-start mb-2">
                                <h4 className="font-medium text-edg-black">{product.name}</h4>
                                <span className="text-sm font-medium text-edg-teal">
                                  {formatCurrency(product.defaultUnitPrice)}
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
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-accent-grey uppercase tracking-wider">
                  Description
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-accent-grey uppercase tracking-wider">
                  Qty
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-accent-grey uppercase tracking-wider">
                  Unit Price
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-accent-grey uppercase tracking-wider">
                  Markup
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-accent-grey uppercase tracking-wider">
                  Total
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-accent-grey uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {lineItems.map((item) => {
                const total = calculateLineItemTotal(
                  item.quantity,
                  item.unitPrice,
                  item.markupType,
                  item.markupValue
                );

                return (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 max-w-xs">
                      <Input
                        value={item.description}
                        onChange={(e) => handleUpdateItem(item, "description", e.target.value)}
                        className="border-none bg-transparent focus:ring-2 focus:ring-construction-blue focus:border-transparent"
                      />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Input
                        type="number"
                        step="0.01"
                        value={item.quantity}
                        onChange={(e) => handleUpdateItem(item, "quantity", parseFloat(e.target.value) || 0)}
                        className="w-28 text-center"
                      />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Input
                        type="number"
                        step="0.01"
                        value={item.unitPrice}
                        onChange={(e) => handleUpdateItem(item, "unitPrice", parseFloat(e.target.value) || 0)}
                        className="w-32 text-center"
                      />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center space-x-1">
                        <Input
                          type="number"
                          step="0.01"
                          value={item.markupValue}
                          onChange={(e) => handleUpdateItem(item, "markupValue", parseFloat(e.target.value) || 0)}
                          className="w-20 text-center"
                        />
                        <Select
                          value={item.markupType}
                          onValueChange={(value) => handleUpdateItem(item, "markupType", value)}
                        >
                          <SelectTrigger className="w-16">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="percentage">%</SelectItem>
                            <SelectItem value="dollar">$</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-medium text-charcoal">
                      {formatCurrency(total)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteItem(item.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}

              {showNewItemForm && (
                <tr className="bg-blue-50">
                  <td className="px-6 py-4">
                    <Input
                      placeholder="Description"
                      value={newItem.description}
                      onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                      className="border border-gray-300"
                    />
                  </td>
                  <td className="px-6 py-4 text-center">
                    <Input
                      type="number"
                      step="0.01"
                      value={newItem.quantity}
                      onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })}
                      className="w-28 text-center"
                    />
                  </td>
                  <td className="px-6 py-4 text-center">
                    <Input
                      type="number"
                      step="0.01"
                      value={newItem.unitPrice}
                      onChange={(e) => setNewItem({ ...newItem, unitPrice: e.target.value })}
                      className="w-32 text-center"
                    />
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center space-x-1">
                      <Input
                        type="number"
                        step="0.01"
                        value={newItem.markupValue}
                        onChange={(e) => setNewItem({ ...newItem, markupValue: e.target.value })}
                        className="w-20 text-center"
                      />
                      <Select
                        value={newItem.markupType}
                        onValueChange={(value) => setNewItem({ ...newItem, markupType: value as "percentage" | "dollar" })}
                      >
                        <SelectTrigger className="w-16">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percentage">%</SelectItem>
                          <SelectItem value="dollar">$</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right text-sm font-medium text-charcoal">
                    {formatCurrency(
                      calculateLineItemTotal(
                        newItem.quantity,
                        newItem.unitPrice,
                        newItem.markupType,
                        newItem.markupValue
                      )
                    )}
                  </td>
                  <td className="px-6 py-4 text-center space-x-2">
                    <Button
                      size="sm"
                      onClick={handleAddItem}
                      disabled={!newItem.description || createLineItemMutation.isPending}
                      className="bg-construction-blue hover:bg-blue-700 text-white"
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
      </CardContent>
    </Card>
  );
}
