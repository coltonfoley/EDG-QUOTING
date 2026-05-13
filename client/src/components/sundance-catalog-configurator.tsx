import { useMemo, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Check, ClipboardList, Loader2, Minus, PackageCheck, Palette, Plus, Search, X } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/utils';
import type { Product, Color, ProductColor } from '@shared/schema';
import { calculateCustomerLineTotal, calculateCustomerUnitPrice, getProductPricingBreakdown } from '@shared/pricing';

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

type PricingDefaultResponse = {
  scope: string;
  markupType: 'percentage';
  markupValue: string;
  updatedAt: string | null;
};

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

// Product order within categories (by product name/SKU)
// Products not listed will appear at the end sorted by ID for stability
const PRODUCT_ORDER: Record<string, string[]> = {
  'Motors': [
    'motor1perbay',
    'motorbrksd',
    'timotionmotorcoverblk',
  ],
  'Louvers': [
    'lvr8',       // Louvers - 8'
    'lvr10',      // Louvers - 10'
    'lvr12',      // Louvers - 12'
    'lvr14',      // Louvers - 14'
    'lvrendcap',  // Louver End Cap
    'rivets',     // Rivets
    'pvtbar20',   // Pivot Bar 7' 6"
    'pvtbarber',  // Pivot Bar Bearing
    'pvtbarspacer', // Pivot Bar Spacer
    'louverspsd', // Louver Spring Pins
    'louverber',  // Louver Bearing
    'beartemp',   // Bearing Template
    'lvrgasket',  // Louver Gasket Bumper
  ],
};

// Helper function to get sort order for a product within its category
function getProductSortOrder(product: Product, category: string): number {
  const categoryOrder = PRODUCT_ORDER[category];
  if (!categoryOrder) return -1; // No ordering defined for this category
  
  const productSku = getProductSku(product);
  const index = categoryOrder.findIndex(sku => 
    sku.toLowerCase() === productSku.toLowerCase()
  );
  
  return index >= 0 ? index : categoryOrder.length; // Unlisted items go after listed ones
}

function getProductSku(product: Product): string {
  return product.sku?.trim() || product.name;
}

export function SundanceCatalogConfigurator({ 
  quoteId, 
  onInsert, 
  onCancel 
}: SundanceCatalogConfiguratorProps) {
  const { toast } = useToast();
  const [quantities, setQuantities] = useState<ProductQuantity>({});
  const [selectedColors, setSelectedColors] = useState<ProductColorSelection>({});
  const [categoryColors, setCategoryColors] = useState<CategoryColorSelection>({});
  const [searchTerm, setSearchTerm] = useState('');

  const { data: products, isLoading } = useQuery<Product[]>({
    queryKey: ['/api/products', 'Sundance'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/products?manufacturer=Sundance');
      return response.json();
    },
  });

  const sundanceProducts = useMemo<Product[]>(() => {
    return products || [];
  }, [products]);

  const { data: sundancePricingDefault } = useQuery<PricingDefaultResponse>({
    queryKey: ['/api/pricing-defaults/sundance'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/pricing-defaults/sundance');
      return response.json();
    },
  });

  const sundanceMarkupValue = useMemo(
    () => parseFloat(sundancePricingDefault?.markupValue || '100') || 0,
    [sundancePricingDefault?.markupValue]
  );

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
    mutationFn: async (configData: {
      items: {
        productId: number;
        quantity: number;
        productSnapshot: Record<string, unknown>;
        configData?: Record<string, unknown>;
      }[];
    }) => {
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

  const categorizedProducts = useMemo<CategoryProducts>(() => {
    const grouped = sundanceProducts.reduce((acc, product) => {
      const category = product.category || 'Other';
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(product);
      return acc;
    }, {} as CategoryProducts);

    Object.keys(grouped).forEach(category => {
      grouped[category].sort((a, b) => {
        if (PRODUCT_ORDER[category]) {
          const orderA = getProductSortOrder(a, category);
          const orderB = getProductSortOrder(b, category);
          if (orderA !== orderB) return orderA - orderB;
        }
        return a.id - b.id;
      });
    });

    return grouped;
  }, [sundanceProducts]);

  const orderedCategories = useMemo(() => [
    ...CATEGORY_ORDER.filter(cat => categorizedProducts[cat]),
    ...Object.keys(categorizedProducts).filter(cat => !CATEGORY_ORDER.includes(cat)),
  ], [categorizedProducts]);

  const filteredCategorizedProducts = useMemo<CategoryProducts>(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (!normalizedSearch) {
      return categorizedProducts;
    }

    return orderedCategories.reduce((acc, category) => {
      const matchingProducts = (categorizedProducts[category] || []).filter(product => {
        return [
          product.name,
          product.description || '',
          product.category || '',
        ].some(value => value.toLowerCase().includes(normalizedSearch));
      });

      if (matchingProducts.length > 0) {
        acc[category] = matchingProducts;
      }

      return acc;
    }, {} as CategoryProducts);
  }, [categorizedProducts, orderedCategories, searchTerm]);

  const visibleCategories = useMemo(
    () => orderedCategories.filter(category => (filteredCategorizedProducts[category] || []).length > 0),
    [filteredCategorizedProducts, orderedCategories]
  );

  const handleQuantityChange = (productId: number, value: string) => {
    const numValue = parseInt(value) || 0;
    if (numValue < 0) return;
    
    setQuantities(prev => ({
      ...prev,
      [productId]: numValue,
    }));
  };

  const handleQuantityStep = (productId: number, direction: 1 | -1) => {
    setQuantities(prev => {
      const nextValue = Math.max(0, (prev[productId] || 0) + direction);
      return {
        ...prev,
        [productId]: nextValue,
      };
    });
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

  const selectedItems = useMemo(() => Object.entries(quantities)
    .filter(([_, qty]) => qty > 0)
    .map(([productId, quantity]) => {
      const product = sundanceProducts.find(p => p.id === parseInt(productId));
      return product ? { product, quantity } : null;
    })
    .filter(Boolean) as { product: Product; quantity: number }[], [sundanceProducts, quantities]);

  const edgCostSubtotal = useMemo(() => selectedItems.reduce((total, { product, quantity }) => {
    return total + (getProductPricingBreakdown(product).edgCost * quantity);
  }, 0), [selectedItems]);

  const customerSubtotal = useMemo(() => selectedItems.reduce((total, { product, quantity }) => {
    return total + calculateCustomerLineTotal(
      quantity,
      getProductPricingBreakdown(product).edgCost,
      'percentage',
      sundanceMarkupValue
    );
  }, 0), [selectedItems, sundanceMarkupValue]);

  const selectedCount = selectedItems.length;
  const selectedUnitCount = useMemo(
    () => selectedItems.reduce((total, item) => total + item.quantity, 0),
    [selectedItems]
  );
  const catalogProductCount = sundanceProducts.length;

  const getSelectedColorDetails = (product: Product) => {
    const category = product.category || 'Other';
    return getEffectiveColors(product.id, category)
      .map(colorId => productColorsMap?.[product.id]?.find(pc => pc.colorId === colorId)?.color)
      .filter(Boolean) as Color[];
  };

  const handleInsert = () => {
    const items = Object.entries(quantities)
      .filter(([_, qty]) => qty > 0)
      .map(([productId, quantity]) => {
        const parsedProductId = parseInt(productId);
        const product = sundanceProducts.find(p => p.id === parsedProductId);
        const category = product?.category || 'Other';
        const effectiveColors = getEffectiveColors(parsedProductId, category);
        const colorDetails = effectiveColors.map(colorId => {
          const productColorEntry = productColorsMap?.[parsedProductId]?.find(pc => pc.colorId === colorId);
          return productColorEntry?.color;
        }).filter(Boolean);

        return {
          productId: parsedProductId,
          quantity,
          // Include full product snapshot for historical accuracy
          productSnapshot: {
            name: product!.name,
            sku: getProductSku(product!),
            description: product!.description,
            category: product!.category,
            manufacturer: product!.manufacturer,
            retailPrice: product!.retailPrice,
            costPrice: getProductPricingBreakdown(product!).edgCost.toFixed(2),
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4" style={{ height: 'min(72vh, 760px)' }}>
      <div className="grid gap-4 rounded-lg border bg-slate-950 p-4 text-white shadow-sm md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <PackageCheck className="h-5 w-5 text-edg-teal" />
            <h3 className="text-lg font-semibold tracking-normal">Sundance Louvered Roof</h3>
            <Badge className="bg-edg-teal text-white hover:bg-edg-teal">Approved catalog</Badge>
          </div>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-300">
            Choose parts, apply color defaults, and review the package before it becomes quote line items.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-md border border-white/10 bg-white/10 px-3 py-2">
            <div className="text-lg font-semibold">{catalogProductCount}</div>
            <div className="text-xs text-slate-300">Catalog items</div>
          </div>
          <div className="rounded-md border border-white/10 bg-white/10 px-3 py-2">
            <div className="text-lg font-semibold">{selectedCount}</div>
            <div className="text-xs text-slate-300">Selected lines</div>
          </div>
          <div className="rounded-md border border-white/10 bg-white/10 px-3 py-2">
            <div className="text-lg font-semibold">{selectedUnitCount}</div>
            <div className="text-xs text-slate-300">Total units</div>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 xl:flex-row">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-background">
          <div className="space-y-3 border-b bg-muted/30 p-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search Sundance parts, categories, or descriptions"
                  className="h-10 pl-9"
                  data-testid="input-sundance-search"
                />
              </div>
              {searchTerm && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSearchTerm('')}
                  data-testid="button-clear-sundance-search"
                >
                  <X className="mr-2 h-4 w-4" />
                  Clear
                </Button>
              )}
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1">
              {orderedCategories.map((category) => {
                const productTotal = categorizedProducts[category]?.length || 0;
                const visibleTotal = filteredCategorizedProducts[category]?.length || 0;
                const isHiddenBySearch = searchTerm && visibleTotal === 0;

                return (
                  <button
                    key={category}
                    type="button"
                    disabled={!!isHiddenBySearch}
                    onClick={() => document.getElementById(`sundance-category-${category}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    className={`whitespace-nowrap rounded-md border px-3 py-2 text-xs font-medium transition ${
                      isHiddenBySearch
                        ? 'cursor-not-allowed border-transparent bg-muted/40 text-muted-foreground/50'
                        : 'border-border bg-background text-foreground hover:border-edg-teal hover:text-edg-teal'
                    }`}
                  >
                    {category}
                    <span className="ml-2 text-muted-foreground">{searchTerm ? visibleTotal : productTotal}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="hidden grid-cols-[minmax(0,1fr)_150px_100px_112px] gap-4 border-b bg-muted/20 px-4 py-2 text-xs font-semibold uppercase tracking-normal text-muted-foreground md:grid">
            <div>Part</div>
            <div className="text-center">Qty</div>
            <div className="text-right">EDG Cost</div>
            <div className="text-right">Customer total</div>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-5 p-4">
              {visibleCategories.length === 0 ? (
                <div className="flex min-h-60 flex-col items-center justify-center rounded-lg border border-dashed text-center">
                  <Search className="mb-3 h-6 w-6 text-muted-foreground" />
                  <p className="text-sm font-medium">No Sundance parts found</p>
                  <p className="mt-1 text-xs text-muted-foreground">Try a different part name or category.</p>
                </div>
              ) : visibleCategories.map((category) => {
                const categoryProducts = filteredCategorizedProducts[category];
                const categoryAvailableColors = getCategoryColors(category);
                const hasCategoryColors = categoryAvailableColors.length > 0;

                return (
                  <section key={category} id={`sundance-category-${category}`} className="scroll-mt-4 space-y-3">
                  <div className="rounded-md border bg-muted/30 px-3 py-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <h4 className="text-sm font-semibold">{category}</h4>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {categoryProducts.length} {categoryProducts.length === 1 ? 'part' : 'parts'}
                        </p>
                      </div>
                      {hasCategoryColors && (
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                            <Palette className="h-3.5 w-3.5" />
                            Category color
                          </div>
                          <div className="flex flex-wrap gap-1">
                            <button
                              type="button"
                              onClick={() => handleCategoryColorChange(category, null)}
                              className={`flex h-7 w-7 items-center justify-center rounded-full border-2 transition-all ${
                                !categoryColors[category]
                                  ? 'border-blue-500 bg-white dark:bg-gray-700'
                                  : 'border-gray-300 hover:border-gray-400 bg-white dark:bg-gray-700'
                              }`}
                              title="No category color"
                              data-testid={`category-color-none-${category}`}
                            >
                              <X className="h-3 w-3 text-gray-400" />
                            </button>
                            {categoryAvailableColors.map((pc) => (
                              <button
                                key={pc.color.id}
                                type="button"
                                onClick={() => handleCategoryColorChange(category, pc.color.id)}
                                className={`flex h-7 w-7 items-center justify-center rounded-full border-2 transition-all ${
                                  categoryColors[category] === pc.color.id
                                    ? 'border-blue-500 scale-110 shadow-md'
                                    : 'border-gray-300 hover:border-gray-400'
                                }`}
                                style={{ backgroundColor: pc.color.hexCode }}
                                title={pc.color.name}
                                data-testid={`category-color-${category}-${pc.color.id}`}
                              >
                                {categoryColors[category] === pc.color.id && (
                                  <Check className="h-3 w-3 text-white drop-shadow" />
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
                      const productSku = getProductSku(product);
                      const productColors = productColorsMap?.[product.id] || [];
                      const hasColors = productColors.length > 0;
                      const effectiveColors = getEffectiveColors(product.id, category);
                      const hasIndividualOverride = selectedColors[product.id]?.length > 0;
                      
                      return (
                        <div
                          key={product.id}
                          className={`grid gap-3 rounded-md border px-3 py-3 transition-colors md:grid-cols-[minmax(0,1fr)_150px_100px_112px] md:items-center ${
                            (quantities[product.id] || 0) > 0
                              ? 'border-edg-teal/40 bg-edg-teal/5'
                              : 'border-transparent hover:border-border hover:bg-muted/40'
                          }`}
                          data-testid={`product-${product.id}`}
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="truncate text-sm font-medium" title={product.name}>
                                {product.name}
                              </div>
                              <Badge variant="outline" className="h-5 text-[10px]">
                                {productSku}
                              </Badge>
                              {(quantities[product.id] || 0) > 0 && (
                                <Badge variant="secondary" className="h-5 text-[11px]">Added</Badge>
                              )}
                            </div>
                            {product.description && (
                              <div className="mt-1 truncate text-xs text-muted-foreground" title={product.description}>
                                {product.description}
                              </div>
                            )}
                            {hasColors && (
                              <div className="mt-2 flex flex-wrap items-center gap-1">
                                {hasIndividualOverride && (
                                  <Badge variant="outline" className="mr-1 h-5 text-[10px]">Custom color</Badge>
                                )}
                                {!hasIndividualOverride && effectiveColors.length > 0 && (
                                  <Badge variant="outline" className="mr-1 h-5 text-[10px]">Category color</Badge>
                                )}
                                {productColors.map((pc) => {
                                  const isSelected = selectedColors[product.id]?.includes(pc.color.id);
                                  const isEffective = effectiveColors.includes(pc.color.id);

                                  return (
                                    <button
                                      key={pc.color.id}
                                      type="button"
                                      onClick={() => handleColorToggle(product.id, pc.color.id)}
                                      className={`flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all ${
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
                                        <Check className="h-3 w-3 text-white drop-shadow" />
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        <div className="flex items-center justify-between gap-3 md:justify-center">
                          <span className="text-xs font-medium text-muted-foreground md:hidden">Qty</span>
                          <div className="flex h-9 w-36 items-center overflow-hidden rounded-md border bg-background">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={`Decrease quantity for ${product.name}`}
                              onClick={() => handleQuantityStep(product.id, -1)}
                              className="h-9 w-9 shrink-0 rounded-none"
                              data-testid={`button-decrement-${product.id}`}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <Input
                              type="number"
                              min="0"
                              value={quantities[product.id] || 0}
                              onChange={(e) => handleQuantityChange(product.id, e.target.value)}
                              className="h-9 w-14 shrink-0 border-0 px-1 text-center shadow-none focus-visible:ring-0"
                              data-testid={`input-quantity-${product.id}`}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={`Increase quantity for ${product.name}`}
                              onClick={() => handleQuantityStep(product.id, 1)}
                              className="h-9 w-9 shrink-0 rounded-none"
                              data-testid={`button-increment-${product.id}`}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-sm md:block md:text-right" data-testid={`text-unit-price-${product.id}`}>
                          <span className="text-xs font-medium text-muted-foreground md:hidden">EDG Cost</span>
                          <span className="font-medium">{formatCurrency(getProductPricingBreakdown(product).edgCost)}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm md:block md:text-right" data-testid={`text-total-${product.id}`}>
                          <span className="text-xs font-medium text-muted-foreground md:hidden">Customer total</span>
                          <span className="font-semibold">{formatCurrency(calculateCustomerLineTotal(
                            quantities[product.id] || 0,
                            getProductPricingBreakdown(product).edgCost,
                            'percentage',
                            sundanceMarkupValue
                          ))}</span>
                        </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      <aside className="flex min-h-0 w-full flex-col rounded-lg border bg-background xl:w-80 xl:flex-shrink-0">
        <div className="border-b p-4">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-edg-teal" />
            <h3 className="text-base font-semibold">Package Review</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            {selectedCount} {selectedCount === 1 ? 'line' : 'lines'} selected
          </p>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          {selectedItems.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center text-muted-foreground">
              <PackageCheck className="mb-3 h-8 w-8" />
              <p className="text-sm font-medium text-foreground">No Sundance parts selected</p>
              <p className="mt-1 text-xs leading-5">Add quantities on the left and this panel becomes the final review before insert.</p>
            </div>
          ) : (
            <div className="space-y-3 p-4">
              {selectedItems.map(({ product, quantity }) => {
                const colorDetails = getSelectedColorDetails(product);

                return (
                  <div
                    key={product.id}
                    className="space-y-2 rounded-md border p-3"
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
                        {formatCurrency(calculateCustomerLineTotal(
                          quantity,
                          getProductPricingBreakdown(product).edgCost,
                          'percentage',
                          sundanceMarkupValue
                        ))}
                      </div>
                    </div>
                    {colorDetails.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {colorDetails.map((color) => (
                          <span key={color.id} className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] text-muted-foreground">
                            <span className="h-2.5 w-2.5 rounded-full border" style={{ backgroundColor: color.hexCode }} />
                            {color.name}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Input
                        type="number"
                        min="0"
                        value={quantity}
                        onChange={(e) => handleQuantityChange(product.id, e.target.value)}
                        className="h-8 text-center w-20"
                        data-testid={`summary-input-quantity-${product.id}`}
                      />
                      <span>
                        EDG cost {formatCurrency(getProductPricingBreakdown(product).edgCost)} each • customer unit {formatCurrency(calculateCustomerUnitPrice(getProductPricingBreakdown(product).edgCost, 'percentage', sundanceMarkupValue))}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <div className="space-y-4 border-t p-4">
          <div className="space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">EDG cost subtotal</span>
              <span className="font-medium">{formatCurrency(edgCostSubtotal)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-semibold">Estimated customer subtotal</span>
              <span className="text-lg font-bold" data-testid="text-configurator-subtotal">
                {formatCurrency(customerSubtotal)}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button 
              variant="outline" 
              onClick={onCancel}
              data-testid="button-cancel-config"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleInsert}
              disabled={insertMutation.isPending || selectedCount === 0}
              data-testid="button-insert-config"
            >
              {insertMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Inserting...
                </>
              ) : (
                'Insert Package'
              )}
            </Button>
          </div>
        </div>
      </aside>
      </div>
    </div>
  );
}
