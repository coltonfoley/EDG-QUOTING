import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2 } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/utils';
import type { Product, Color, ProductColor } from '@shared/schema';

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

interface ProductColorSelection {
  [productId: number]: number[]; // Array of selected color IDs
}

interface CategoryColorSelection {
  [category: string]: number | null; // Selected color ID for category
}

// Category order matching the PDF
const CATEGORY_ORDER = [
  'Extrusion',
  'Gutters',
  'Louvers',
  'Posts',
  'Motors',
  'Control Box, Remote, and Rain Sensor',
  'Connection Brackets - Fasteners - Caulk',
  'Shop Drawings',
  'Sales & Marketing'
];

export function SundanceCatalogConfigurator({ 
  quoteId, 
  onInsert, 
  onCancel 
}: SundanceCatalogConfiguratorProps) {
  const { toast } = useToast();
  const [quantities, setQuantities] = useState<ProductQuantity>({});
  const [selectedColors, setSelectedColors] = useState<ProductColorSelection>({});
  const [categoryColors, setCategoryColors] = useState<CategoryColorSelection>({});

  const { data: products, isLoading } = useQuery<Product[]>({
    queryKey: ['/api/products', 'Sundance'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/products?manufacturer=Sundance');
      return response.json();
    },
  });

  // Fetch all product colors for Sundance products using batch endpoint
  const { data: productColorsMap } = useQuery<Record<number, (ProductColor & { color: Color })[]>>({
    queryKey: ['/api/product-colors', 'Sundance'],
    queryFn: async () => {
      if (!products || products.length === 0) return {};
      
      const productIds = products.map(p => p.id).join(',');
      const response = await apiRequest('GET', `/api/products/colors/batch?productIds=${productIds}`);
      const colorMap = await response.json();
      
      return colorMap;
    },
    enabled: !!products && products.length > 0,
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

  // Categorize products and maintain specified order
  const categorizedProducts: CategoryProducts = products?.reduce((acc, product) => {
    const category = product.category || 'Other';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(product);
    return acc;
  }, {} as CategoryProducts) || {};

  // Get ordered categories (matching PDF order, then any additional categories)
  const orderedCategories = [
    ...CATEGORY_ORDER.filter(cat => categorizedProducts[cat]),
    ...Object.keys(categorizedProducts).filter(cat => !CATEGORY_ORDER.includes(cat))
  ];

  const handleQuantityChange = (productId: number, value: string) => {
    const numValue = parseInt(value) || 0;
    if (numValue < 0) return;
    
    setQuantities(prev => ({
      ...prev,
      [productId]: numValue,
    }));
  };

  const handleCategoryColorChange = (category: string, colorId: number | null) => {
    setCategoryColors(prev => ({
      ...prev,
      [category]: colorId
    }));
  };

  const handleColorToggle = (productId: number, colorId: number) => {
    setSelectedColors(prev => {
      const current = prev[productId] || [];
      const exists = current.includes(colorId);
      
      return {
        ...prev,
        [productId]: exists 
          ? current.filter(id => id !== colorId)
          : [...current, colorId]
      };
    });
  };

  // Get all unique colors available in a category
  const getCategoryColors = (category: string): (ProductColor & { color: Color })[] => {
    const categoryProducts = categorizedProducts[category] || [];
    const colorMap = new Map<number, ProductColor & { color: Color }>();
    
    categoryProducts.forEach(product => {
      const productColors = productColorsMap?.[product.id] || [];
      productColors.forEach(pc => {
        if (!colorMap.has(pc.colorId)) {
          colorMap.set(pc.colorId, pc);
        }
      });
    });
    
    return Array.from(colorMap.values());
  };

  // Get effective color for a product (individual override or category default)
  const getEffectiveColors = (productId: number, category: string): number[] => {
    // If product has individual color selection, use that
    if (selectedColors[productId] && selectedColors[productId].length > 0) {
      return selectedColors[productId];
    }
    
    // Otherwise, use category color if available and product supports this color
    const categoryColorId = categoryColors[category];
    if (categoryColorId) {
      const productColors = productColorsMap?.[productId] || [];
      const hasColor = productColors.some(pc => pc.colorId === categoryColorId);
      if (hasColor) {
        return [categoryColorId];
      }
    }
    
    return [];
  };

  const handleInsert = () => {
    const items = Object.entries(quantities)
      .filter(([_, qty]) => qty > 0)
      .map(([productId, quantity]) => {
        const product = products!.find(p => p.id === parseInt(productId));
        const category = product?.category || 'Other';
        const effectiveColors = getEffectiveColors(parseInt(productId), category);
        const colorDetails = effectiveColors.map(colorId => {
          const productColorEntry = productColorsMap?.[parseInt(productId)]?.find(pc => pc.colorId === colorId);
          return productColorEntry?.color;
        }).filter(Boolean);

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
          },
          // Include selected colors in configData
          configData: {
            colors: colorDetails,
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
            {orderedCategories.map((category) => {
              const categoryProducts = categorizedProducts[category];
              const categoryAvailableColors = getCategoryColors(category);
              const hasCategoryColors = categoryAvailableColors.length > 0;
              
              return (
                <div key={category} className="space-y-3">
                  <div className="bg-gray-100 dark:bg-gray-800 px-3 py-2 rounded">
                    <div className="flex items-center justify-between gap-4">
                      <h4 className="font-semibold text-sm">
                        {category}
                      </h4>
                      {hasCategoryColors && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Category Color:</span>
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleCategoryColorChange(category, null)}
                              className={`w-6 h-6 rounded-full border-2 transition-all flex items-center justify-center ${
                                !categoryColors[category]
                                  ? 'border-blue-500 bg-white dark:bg-gray-700'
                                  : 'border-gray-300 hover:border-gray-400 bg-white dark:bg-gray-700'
                              }`}
                              title="No category color"
                              data-testid={`category-color-none-${category}`}
                            >
                              <span className="text-xs text-gray-400">∅</span>
                            </button>
                            {categoryAvailableColors.map((pc) => (
                              <button
                                key={pc.color.id}
                                onClick={() => handleCategoryColorChange(category, pc.color.id)}
                                className={`w-6 h-6 rounded-full border-2 transition-all ${
                                  categoryColors[category] === pc.color.id
                                    ? 'border-blue-500 scale-110 shadow-md'
                                    : 'border-gray-300 hover:border-gray-400'
                                }`}
                                style={{ backgroundColor: pc.color.hexCode }}
                                title={pc.color.name}
                                data-testid={`category-color-${category}-${pc.color.id}`}
                              >
                                {categoryColors[category] === pc.color.id && (
                                  <span className="text-white text-xs font-bold">✓</span>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {categoryProducts.map((product) => {
                      const productColors = productColorsMap?.[product.id] || [];
                      const hasColors = productColors.length > 0;
                      const effectiveColors = getEffectiveColors(product.id, category);
                      const hasIndividualOverride = selectedColors[product.id]?.length > 0;
                      
                      return (
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
                          {hasColors && (
                            <div className="flex gap-1 mt-2 flex-wrap items-center">
                              {hasIndividualOverride && (
                                <span className="text-xs text-blue-600 dark:text-blue-400 mr-1" title="Individual color override">
                                  ⚡
                                </span>
                              )}
                              {!hasIndividualOverride && effectiveColors.length > 0 && (
                                <span className="text-xs text-muted-foreground mr-1" title="Using category color">
                                  ↓
                                </span>
                              )}
                              {productColors.map((pc) => {
                                const isSelected = selectedColors[product.id]?.includes(pc.color.id);
                                const isEffective = effectiveColors.includes(pc.color.id);
                                
                                return (
                                  <button
                                    key={pc.color.id}
                                    onClick={() => handleColorToggle(product.id, pc.color.id)}
                                    className={`w-6 h-6 rounded-full border-2 transition-all ${
                                      isSelected
                                        ? 'border-blue-500 scale-110 shadow-md'
                                        : isEffective && !hasIndividualOverride
                                        ? 'border-green-400 scale-105'
                                        : 'border-gray-300 hover:border-gray-400'
                                    }`}
                                    style={{ backgroundColor: pc.color.hexCode }}
                                    title={`${pc.color.name}${isEffective && !isSelected ? ' (from category)' : ''}`}
                                    data-testid={`color-${product.id}-${pc.color.id}`}
                                  >
                                    {isSelected && (
                                      <span className="text-white text-xs font-bold">✓</span>
                                    )}
                                  </button>
                                );
                              })}
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
                    );
                    })}
                  </div>
                </div>
              );
            })}
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
