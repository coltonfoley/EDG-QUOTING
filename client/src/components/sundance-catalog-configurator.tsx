import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2 } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/utils';
import type { Product } from '@shared/schema';

interface SundanceCatalogConfiguratorProps {
  quoteId: number;
  onInsert: () => void;
  onCancel: () => void;
}

interface CategoryProducts {
  [category: string]: Product[];
}

interface ProductQuantity {
  [productId: number]: number;
}

export function SundanceCatalogConfigurator({ 
  quoteId, 
  onInsert, 
  onCancel 
}: SundanceCatalogConfiguratorProps) {
  const { toast } = useToast();
  const [quantities, setQuantities] = useState<ProductQuantity>({});

  const { data: products, isLoading } = useQuery<Product[]>({
    queryKey: ['/api/products', 'Sundance'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/products?manufacturer=Sundance');
      return response.json();
    },
  });

  const insertMutation = useMutation({
    mutationFn: async (configData: { items: { productId: number; quantity: number }[] }) => {
      const response = await apiRequest('POST', `/api/quotes/${quoteId}/configure-product`, configData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/quotes/${quoteId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/quotes/${quoteId}/groups`] });
      toast({
        title: 'Configuration inserted',
        description: 'Products added to quote successfully',
      });
      onInsert();
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const categorizedProducts: CategoryProducts = products?.reduce((acc, product) => {
    const category = product.category || 'Other';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(product);
    return acc;
  }, {} as CategoryProducts) || {};

  const handleQuantityChange = (productId: number, value: string) => {
    const numValue = parseInt(value) || 0;
    if (numValue < 0) return;
    
    setQuantities(prev => ({
      ...prev,
      [productId]: numValue,
    }));
  };

  const handleInsert = () => {
    const items = Object.entries(quantities)
      .filter(([_, qty]) => qty > 0)
      .map(([productId, quantity]) => {
        const product = products!.find(p => p.id === parseInt(productId));
        return {
          productId: parseInt(productId),
          quantity,
          // Include full product snapshot for historical accuracy
          productSnapshot: {
            name: product!.name,
            description: product!.description,
            category: product!.category,
            manufacturer: product!.manufacturer,
            retailPrice: product!.retailPrice,
            unit: product!.unit,
            defaultDiscountType: product!.defaultDiscountType,
            defaultDiscountValue: product!.defaultDiscountValue,
          }
        };
      });

    if (items.length === 0) {
      toast({
        title: 'No items selected',
        description: 'Please select at least one product',
        variant: 'destructive',
      });
      return;
    }

    insertMutation.mutate({ items });
  };

  const calculateSubtotal = () => {
    if (!products) return 0;
    
    return Object.entries(quantities).reduce((total, [productId, qty]) => {
      const product = products.find(p => p.id === parseInt(productId));
      if (!product || qty === 0) return total;
      return total + (parseFloat(product.retailPrice) * qty);
    }, 0);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  const subtotal = calculateSubtotal();
  const selectedCount = Object.values(quantities).filter(q => q > 0).length;

  const selectedItems = Object.entries(quantities)
    .filter(([_, qty]) => qty > 0)
    .map(([productId, quantity]) => {
      const product = products!.find(p => p.id === parseInt(productId));
      return product ? { product, quantity } : null;
    })
    .filter(Boolean) as { product: Product; quantity: number }[];

  return (
    <div className="flex gap-6" style={{ height: 'calc(80vh - 200px)' }}>
      {/* Left Column - Product Catalog */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="mb-4 p-4 bg-muted rounded-lg flex-shrink-0">
          <h3 className="font-semibold text-lg">Sundance Louvered Roof</h3>
          <p className="text-sm text-muted-foreground">Cover any space with a Sundance Louvered Roof to enjoy more time outside</p>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <div className="space-y-6 pb-4 pr-2">
            {Object.entries(categorizedProducts).map(([category, categoryProducts]) => (
              <div key={category} className="space-y-3">
                <h4 className="font-semibold text-sm bg-gray-100 dark:bg-gray-800 px-3 py-2 rounded">
                  {category}
                </h4>
                <div className="space-y-2">
                  {categoryProducts.map((product) => (
                    <div 
                      key={product.id} 
                      className="grid grid-cols-[1fr_100px_120px_120px] gap-4 items-center p-3 rounded hover:bg-muted/50 transition-colors"
                      data-testid={`product-${product.id}`}
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate" title={product.name}>
                          {product.name}
                        </div>
                        {product.description && (
                          <div className="text-xs text-muted-foreground truncate" title={product.description}>
                            {product.description}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <Input
                          type="number"
                          min="0"
                          value={quantities[product.id] || 0}
                          onChange={(e) => handleQuantityChange(product.id, e.target.value)}
                          className="h-9 text-center"
                          data-testid={`input-quantity-${product.id}`}
                        />
                      </div>
                      <div className="text-right text-sm font-medium" data-testid={`text-unit-price-${product.id}`}>
                        {formatCurrency(parseFloat(product.retailPrice))}
                      </div>
                      <div className="text-right text-sm font-semibold" data-testid={`text-total-${product.id}`}>
                        {formatCurrency((quantities[product.id] || 0) * parseFloat(product.retailPrice))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Right Column - Selection Summary */}
      <div className="w-80 flex flex-col flex-shrink-0 border-l pl-6">
        <div className="mb-4">
          <h3 className="font-semibold text-lg">Selection Summary</h3>
          <p className="text-sm text-muted-foreground">
            {selectedCount} {selectedCount === 1 ? 'item' : 'items'} selected
          </p>
        </div>

        <ScrollArea className="flex-1 -mr-6 pr-6">
          {selectedItems.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">No items selected</p>
              <p className="text-xs mt-1">Add products from the catalog</p>
            </div>
          ) : (
            <div className="space-y-3">
              {selectedItems.map(({ product, quantity }) => (
                <div 
                  key={product.id} 
                  className="p-3 border rounded-lg space-y-2"
                  data-testid={`summary-item-${product.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm" title={product.name}>
                        {product.name}
                      </div>
                      {product.category && (
                        <div className="text-xs text-muted-foreground">
                          {product.category}
                        </div>
                      )}
                    </div>
                    <div className="text-right text-sm font-semibold whitespace-nowrap">
                      {formatCurrency(quantity * parseFloat(product.retailPrice))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="0"
                      value={quantity}
                      onChange={(e) => handleQuantityChange(product.id, e.target.value)}
                      className="h-8 text-center w-20"
                      data-testid={`summary-input-quantity-${product.id}`}
                    />
                    <span className="text-xs text-muted-foreground">×</span>
                    <span className="text-xs text-muted-foreground">
                      {formatCurrency(parseFloat(product.retailPrice))}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="mt-4 pt-4 border-t space-y-4">
          <div className="flex justify-between items-center">
            <span className="font-semibold">Subtotal</span>
            <span className="text-lg font-bold" data-testid="text-configurator-subtotal">
              {formatCurrency(subtotal)}
            </span>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={onCancel}
              className="flex-1"
              data-testid="button-cancel-config"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleInsert}
              disabled={insertMutation.isPending || selectedCount === 0}
              className="flex-1"
              data-testid="button-insert-config"
            >
              {insertMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Inserting...
                </>
              ) : (
                'Insert Configuration'
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
