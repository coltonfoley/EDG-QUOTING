import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import { AppHeader } from "@/components/app-header";
import { PageLoadError } from "@/components/error-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Package, PackageCheck, Edit, Trash2, Search, Grid, List, Filter, X, Settings, FileText, Image, Loader2, Palette, Percent, Save } from "lucide-react";
import { DimensionalPricingManager } from "@/components/dimensional-pricing-manager";
import { ProductImportWorkspace, ProductTable } from "@/components/product-catalog-sections";
import { formatCurrency } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { deriveProductCostFields, getProductPricingBreakdown } from "@shared/pricing";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertProductSchema, type Product, type Color } from "@shared/schema";
import { z } from "zod";
import { Checkbox } from "@/components/ui/checkbox";

const productFormSchema = insertProductSchema.extend({
  selectedColorIds: z.array(z.number()).optional(), // Frontend-only field for color selection
});
type ProductFormData = z.infer<typeof productFormSchema>;

type PricingDefaultResponse = {
  scope: string;
  markupType: "percentage";
  markupValue: string;
  updatedAt: string | null;
};

type ProductSection = "products" | "import";
type PricingFilter = "all" | "needs-cost";

const bulkUpdateSchema = z.object({
  manufacturer: z.string().optional(),
  retailPrice: z.string().optional(),
  costPrice: z.string().optional(),
  defaultDiscountType: z.enum(["percentage", "dollar"]).optional(),
  defaultDiscountValue: z.string().optional(),
  unit: z.string().optional(),
});

type BulkUpdateData = z.infer<typeof bulkUpdateSchema>;

const PRODUCT_CATALOG_LIMIT = 10000;
const BULK_PRODUCT_LIMIT = 500;

const DEFAULT_PRODUCT_VALUES: ProductFormData = {
  name: "",
  sku: "",
  description: "",
  manufacturer: "",
  category: "",
  productType: "simple",
  retailPrice: "0",
  costPrice: "",
  defaultDiscountType: "dollar",
  defaultDiscountValue: "0",
  unit: "each",
  selectedColorIds: [],
};

export default function Products() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productSection, setProductSection] = useState<ProductSection>("products");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedManufacturer, setSelectedManufacturer] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [pricingFilter, setPricingFilter] = useState<PricingFilter>("all");
  const [viewMode, setViewMode] = useState<"grid" | "table">("table");
  const [showPricingManager, setShowPricingManager] = useState(false);
  const [managingPricingProduct, setManagingPricingProduct] = useState<Product | null>(null);
  const [sundanceMarginValue, setSundanceMarginValue] = useState("100");
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([]);
  const [showBulkEditForm, setShowBulkEditForm] = useState(false);
  
  
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "admin";
  const isProductsSection = productSection === "products";
  const isSundanceSection = isProductsSection && selectedManufacturer === "Sundance";

  const { data: products, isLoading, error: productsError, refetch: refetchProducts } = useQuery<Product[]>({
    queryKey: ["/api/products", {
      limit: PRODUCT_CATALOG_LIMIT,
    }],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: String(PRODUCT_CATALOG_LIMIT),
      });
      const response = await fetch(`/api/products?${params}`);
      if (!response.ok) {
        throw new Error("Failed to fetch products");
      }
      return response.json();
    },
    enabled: isProductsSection,
  });

  const { data: allColors } = useQuery<Color[]>({
    queryKey: ["/api/colors"],
  });

  const { data: sundancePricingDefault, isLoading: isSundancePricingDefaultLoading } = useQuery<PricingDefaultResponse>({
    queryKey: ["/api/pricing-defaults/sundance"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/pricing-defaults/sundance");
      return response.json();
    },
    enabled: isSundanceSection,
  });

  const { data: productColors } = useQuery<Array<{ id: number; productId: number; colorId: number; color: Color }>>({
    queryKey: ["/api/products", editingProduct?.id, "colors"],
    queryFn: async () => {
      if (!editingProduct?.id) return [];
      const response = await fetch(`/api/products/${editingProduct.id}/colors`);
      if (!response.ok) {
        throw new Error("Failed to fetch product colors");
      }
      return response.json();
    },
    enabled: !!editingProduct?.id,
  });

  const form = useForm<ProductFormData>({
    resolver: zodResolver(productFormSchema),
    defaultValues: DEFAULT_PRODUCT_VALUES,
  });

  const bulkUpdateForm = useForm<BulkUpdateData>({
    resolver: zodResolver(bulkUpdateSchema),
    defaultValues: {
      manufacturer: "",
      retailPrice: "",
      costPrice: "",
      defaultDiscountType: undefined,
      defaultDiscountValue: "",
      unit: "",
    },
  });

  useEffect(() => {
    if (sundancePricingDefault?.markupValue) {
      setSundanceMarginValue(parseFloat(sundancePricingDefault.markupValue).toString());
    }
  }, [sundancePricingDefault?.markupValue]);

  useEffect(() => {
    setSelectedManufacturer("all");
    setSelectedCategory("all");
    setSearchTerm("");
    setPricingFilter("all");
    setSelectedProductIds([]);
  }, [productSection]);

  const openCreateProductDialog = () => {
    setEditingProduct(null);
    form.reset({
      ...DEFAULT_PRODUCT_VALUES,
      ...(isSundanceSection ? {
        manufacturer: "Sundance",
        category: "Motors",
      } : {}),
    });
    setIsDialogOpen(true);
  };

  const createProductMutation = useMutation({
    mutationFn: async (data: ProductFormData) => {
      const response = await apiRequest("POST", "/api/products", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setIsDialogOpen(false);
      form.reset();
      toast({ title: "Product created successfully" });
    },
    onError: (error: any) => {
      const errorMessage = error?.details?.errors?.[0]?.message || error?.message || "Failed to create product";
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
    },
  });

  const updateProductMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: ProductFormData }) => {
      const response = await apiRequest("PUT", `/api/products/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setIsDialogOpen(false);
      setEditingProduct(null);
      form.reset();
      toast({ title: "Product updated successfully" });
    },
    onError: (error: any) => {
      const errorMessage = error?.details?.errors?.[0]?.message || error?.message || "Failed to update product";
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
    },
  });

  const deleteProductMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/products/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: "Product deleted successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete product", variant: "destructive" });
    },
  });

  const updateSundanceMarginMutation = useMutation({
    mutationFn: async (markupValue: string) => {
      const response = await apiRequest("PUT", "/api/pricing-defaults/sundance", {
        markupType: "percentage",
        markupValue,
      });
      return response.json();
    },
    onSuccess: (updatedPricingDefault: PricingDefaultResponse) => {
      queryClient.setQueryData(["/api/pricing-defaults/sundance"], updatedPricingDefault);
      setSundanceMarginValue(parseFloat(updatedPricingDefault.markupValue).toString());
      toast({ title: "Sundance standard margin saved" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to save Sundance standard margin",
        variant: "destructive",
      });
    },
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: async (data: BulkUpdateData) => {
      const updates = Object.fromEntries(
        Object.entries(data).filter(([, value]) => value !== undefined && value !== "")
      );

      if (Object.keys(updates).length === 0) {
        throw new Error("Enter at least one field to update.");
      }

      const response = await apiRequest("POST", "/api/admin/bulk-update-products", {
        productIds: selectedProductIds,
        updates,
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Products updated",
        description: `Updated ${data.updatedCount} product${data.updatedCount === 1 ? "" : "s"}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setSelectedProductIds([]);
      setShowBulkEditForm(false);
      bulkUpdateForm.reset();
    },
    onError: (error: any) => {
      const errorMessage = error?.errors
        ? error.errors.map((e: any) => e.message).join(", ")
        : error?.message || "Failed to update products";

      toast({
        title: "Bulk update failed",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });


  const handleSubmit = async (formData: ProductFormData) => {
    const { supplierDiscountAmount: _supplierDiscountAmount, supplierDiscountPercent: _supplierDiscountPercent, ...pricingFields } = deriveProductCostFields(
      formData.retailPrice,
      formData.costPrice ?? formData.retailPrice
    );
    
    // Prepare data with calculated discount, omitting frontend-only fields
    const { selectedColorIds, sku, ...productData } = formData;
    const data = {
      ...productData,
      sku: sku?.trim() || null,
      ...pricingFields,
    };
    
    if (editingProduct) {
      // Update product first
      await updateProductMutation.mutateAsync({ id: editingProduct.id, data });
      
      // Update color associations
      if (selectedColorIds) {
        await updateProductColors(editingProduct.id, selectedColorIds);
      }
    } else {
      // Create product first
      const newProduct = await createProductMutation.mutateAsync(data);
      
      // Add color associations
      if (selectedColorIds && selectedColorIds.length > 0 && newProduct?.id) {
        await updateProductColors(newProduct.id, selectedColorIds);
      }
    }
  };

  const updateProductColors = async (productId: number, selectedColorIds: number[]) => {
    try {
      // Get current product colors
      const currentColors = await fetch(`/api/products/${productId}/colors`).then(res => res.json());
      const currentColorIds = currentColors.map((pc: any) => pc.colorId);
      
      // Remove colors that are no longer selected
      const colorsToRemove = currentColors.filter((pc: any) => !selectedColorIds.includes(pc.colorId));
      for (const pc of colorsToRemove) {
        await apiRequest("DELETE", `/api/product-colors/${pc.id}`);
      }
      
      // Add newly selected colors
      const colorsToAdd = selectedColorIds.filter(colorId => !currentColorIds.includes(colorId));
      for (const colorId of colorsToAdd) {
        await apiRequest("POST", `/api/products/${productId}/colors`, { colorId });
      }
      
      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ["/api/products", productId, "colors"] });
    } catch (error) {
      console.error("Error updating product colors:", error);
      toast({ 
        title: "Warning", 
        description: "Product saved but there was an issue updating colors", 
        variant: "destructive" 
      });
    }
  };


  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    
    const pricing = getProductPricingBreakdown(product);
    
    form.reset({
      name: product.name,
      sku: product.sku || "",
      description: product.description || "",
      manufacturer: product.manufacturer || "",
      category: product.category || "",
      productType: product.productType || "simple",
      retailPrice: product.retailPrice,
      costPrice: pricing.edgCost.toFixed(2),
      defaultDiscountType: product.defaultDiscountType,
      defaultDiscountValue: product.defaultDiscountValue,
      unit: product.unit || "each",
      minLength: product.minLength,
      maxLength: product.maxLength,
      minWidth: product.minWidth,
      maxWidth: product.maxWidth,
      selectedColorIds: [], // Will be populated when productColors loads
    });
    setIsDialogOpen(true);
  };

  // Update selected colors when editing product and colors are loaded
  useEffect(() => {
    if (editingProduct && productColors) {
      const colorIds = productColors.map(pc => pc.colorId);
      form.setValue("selectedColorIds", colorIds);
    }
  }, [editingProduct, productColors]);

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this product?")) {
      deleteProductMutation.mutate(id);
    }
  };

  const handleManagePricing = (product: Product) => {
    setManagingPricingProduct(product);
    setShowPricingManager(true);
  };

  const handleSaveSundanceMargin = () => {
    const numericValue = Number(sundanceMarginValue);
    if (!Number.isFinite(numericValue) || numericValue < 0 || numericValue > 1000) {
      toast({
        title: "Invalid margin",
        description: "Enter a percentage from 0 to 1000.",
        variant: "destructive",
      });
      return;
    }

    updateSundanceMarginMutation.mutate(numericValue.toString());
  };

  const handleBulkUpdate = (data: BulkUpdateData) => {
    if (selectedProductIds.length === 0) {
      toast({
        title: "No products selected",
        description: "Select products from the table first.",
        variant: "destructive",
      });
      return;
    }

    bulkUpdateMutation.mutate(data);
  };

  const handleSelectProduct = (productId: number, checked: boolean) => {
    setSelectedProductIds((currentIds) => {
      if (checked) {
        if (currentIds.includes(productId)) {
          return currentIds;
        }
        if (currentIds.length >= BULK_PRODUCT_LIMIT) {
          toast({
            title: "Selection limit reached",
            description: "Bulk editing is limited to 500 products at a time.",
          });
          return currentIds;
        }
        return [...currentIds, productId];
      }

      return currentIds.filter((id) => id !== productId);
    });
  };

  // Get unique manufacturers and categories, and filter/search products
  const manufacturers = useMemo(() => {
    if (!products) return [];
    const uniqueManufacturers = Array.from(new Set(products.map(p => p.manufacturer || "Unknown")));
    return uniqueManufacturers.sort();
  }, [products]);

  const categories = useMemo(() => {
    if (!products) return [];
    
    const productsToConsider = selectedManufacturer === "all" 
      ? products 
      : products.filter(p => (p.manufacturer || "Unknown") === selectedManufacturer);
    
    const uniqueCategories = Array.from(new Set(productsToConsider.map(p => p.category || "Uncategorized").filter(Boolean)));
    return uniqueCategories.sort();
  }, [products, selectedManufacturer]);

  useEffect(() => {
    if (selectedCategory !== "all" && !categories.includes(selectedCategory)) {
      setSelectedCategory("all");
    }
  }, [selectedManufacturer, categories, selectedCategory]);

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    
    return products.filter(product => {
      const matchesSearch = searchTerm === "" || 
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (product.sku || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (product.description || "").toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesManufacturer = selectedManufacturer === "all" || 
        (product.manufacturer || "Unknown") === selectedManufacturer;
      
      const matchesCategory = selectedCategory === "all" ||
        (product.category || "Uncategorized") === selectedCategory;

      const pricing = getProductPricingBreakdown(product);
      const matchesPricing = pricingFilter === "all" ||
        (pricingFilter === "needs-cost" && product.productType !== "configurable" && pricing.edgCost <= 0);

      return matchesSearch && matchesManufacturer && matchesCategory && matchesPricing;
    });
  }, [products, searchTerm, selectedManufacturer, selectedCategory, pricingFilter]);

  const filteredProductIds = useMemo(() => filteredProducts.map((product) => product.id), [filteredProducts]);
  const filteredProductIdSet = useMemo(() => new Set(filteredProductIds), [filteredProductIds]);
  const selectedVisibleProductCount = selectedProductIds.filter((id) => filteredProductIdSet.has(id)).length;
  const allVisibleProductsSelected = filteredProductIds.length > 0 && selectedVisibleProductCount === filteredProductIds.length;

  useEffect(() => {
    setSelectedProductIds((currentIds) => currentIds.filter((id) => filteredProductIdSet.has(id)));
  }, [filteredProductIdSet]);

  const handleSelectAllVisibleProducts = (checked: boolean) => {
    setSelectedProductIds((currentIds) => {
      const filteredIds = new Set(filteredProductIds);
      if (!checked) {
        return currentIds.filter((id) => !filteredIds.has(id));
      }

      const nextIds = Array.from(new Set([...currentIds, ...filteredProductIds])).slice(0, BULK_PRODUCT_LIMIT);
      if (filteredProductIds.length > BULK_PRODUCT_LIMIT) {
        toast({
          title: "Selected first 500 products",
          description: "Bulk editing is limited to 500 products at a time.",
        });
      }
      return nextIds;
    });
  };

  const groupedProducts = useMemo(() => {
    return filteredProducts.reduce((groups, product) => {
      const manufacturer = product.manufacturer || "Unknown";
      if (!groups[manufacturer]) {
        groups[manufacturer] = [];
      }
      groups[manufacturer].push(product);
      return groups;
    }, {} as Record<string, Product[]>);
  }, [filteredProducts]);

  if (isProductsSection && isLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <AppHeader />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header Skeleton */}
          <div className="flex justify-between items-center mb-6">
            <div>
              <Skeleton className="h-8 w-48 mb-2" />
              <Skeleton className="h-5 w-64" />
            </div>
            <Skeleton className="h-10 w-32" />
          </div>
          
          {/* Filters skeleton */}
          <div className="flex gap-4 mb-6">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-10 w-40" />
            <Skeleton className="h-10 w-32" />
          </div>
          
          {viewMode === "table" ? (
            /* Table view skeleton */
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead><Skeleton className="h-4 w-20" /></TableHead>
                      <TableHead><Skeleton className="h-4 w-32" /></TableHead>
                      <TableHead><Skeleton className="h-4 w-24" /></TableHead>
                      <TableHead><Skeleton className="h-4 w-20" /></TableHead>
                      <TableHead><Skeleton className="h-4 w-28" /></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <Skeleton className="h-5 w-48" />
                            <Skeleton className="h-4 w-64" />
                          </div>
                        </TableCell>
                        <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Skeleton className="h-8 w-8" />
                            <Skeleton className="h-8 w-8" />
                            <Skeleton className="h-8 w-8" />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : (
            /* Grid view skeleton */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Card key={i}>
                  <CardContent className="p-6">
                    <Skeleton className="h-32 w-full mb-4" />
                    <Skeleton className="h-6 w-32 mb-2" />
                    <Skeleton className="h-4 w-full mb-1" />
                    <Skeleton className="h-4 w-3/4 mb-4" />
                    <div className="flex justify-between items-center">
                      <Skeleton className="h-6 w-20" />
                      <Skeleton className="h-8 w-24" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (isProductsSection && productsError) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <PageLoadError
          title="Product catalog couldn't be loaded"
          description="Rainmaker could not retrieve products and pricing. The catalog is unavailable rather than empty."
          onRetry={() => void refetchProducts()}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <div
            className={`grid w-full rounded-md bg-muted p-1 ${isAdmin ? "max-w-md grid-cols-2" : "max-w-xs grid-cols-1"}`}
            role="group"
            aria-label="Product sections"
          >
            <Button
              type="button"
              variant={productSection === "products" ? "default" : "ghost"}
              aria-pressed={productSection === "products"}
              onClick={() => setProductSection("products")}
              data-testid="product-section-products"
            >
              Products
            </Button>
            {isAdmin && (
              <Button
                type="button"
                variant={productSection === "import" ? "default" : "ghost"}
                aria-pressed={productSection === "import"}
                onClick={() => setProductSection("import")}
                data-testid="product-section-import"
              >
                Import
              </Button>
            )}
          </div>
          {isProductsSection && isSundanceSection && (
            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
              <Card className="border-edg-teal/30 bg-edg-teal/5">
                <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-start">
                  <PackageCheck className="mt-0.5 h-5 w-5 shrink-0 text-edg-teal" />
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Sundance Builder Parts</h3>
                    <p className="mt-1 text-sm text-edg-grey">
                      This is the Products list filtered to Manufacturer: Sundance. The Sundance Builder uses these same products.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <Percent className="mt-0.5 h-5 w-5 shrink-0 text-edg-teal" />
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">Standard Margin</h3>
                        <p className="mt-1 text-sm text-edg-grey">Standard margin (markup on cost)</p>
                      </div>
                    </div>
                    {!isAdmin && <Badge variant="outline">View only</Badge>}
                  </div>

                  <div className="mt-4 flex items-end gap-2">
                    <div className="min-w-0 flex-1">
                      <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="sundance-standard-margin">
                        Markup %
                      </label>
                      <Input
                        id="sundance-standard-margin"
                        type="number"
                        min="0"
                        max="1000"
                        step="0.01"
                        value={sundanceMarginValue}
                        onChange={(event) => setSundanceMarginValue(event.target.value)}
                        disabled={!isAdmin || isSundancePricingDefaultLoading || updateSundanceMarginMutation.isPending}
                        data-testid="input-sundance-standard-margin"
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleSaveSundanceMargin}
                      disabled={!isAdmin || isSundancePricingDefaultLoading || updateSundanceMarginMutation.isPending}
                      data-testid="button-save-sundance-standard-margin"
                    >
                      {updateSundanceMarginMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      <span className="ml-2">Save</span>
                    </Button>
                  </div>

                  <p className="mt-2 text-xs text-edg-grey">
                    Applies to new Sundance quote lines only.
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {productSection === "import" ? (
          <ProductImportWorkspace />
        ) : (
          <>
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              {isSundanceSection ? "Sundance Builder Parts" : "Products"}
            </h1>
            <p className="text-edg-grey mt-2">
              {isSundanceSection
                ? `Filtered from Products by Manufacturer: Sundance • ${filteredProducts.length} parts`
                : `Manage reusable products and services • ${filteredProducts.length} products`}
            </p>
          </div>
          {isAdmin && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button 
                className="bg-edg-black hover:bg-edg-grey text-edg-white"
                onClick={openCreateProductDialog}
                data-testid="button-new-product"
              >
                <Plus className="mr-2 h-4 w-4" />
                {isSundanceSection ? "New Sundance Part" : "New Product"}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingProduct ? "Edit Product" : "Create New Product"}
                </DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
                  <Tabs defaultValue="basic" className="w-full">
                    <TabsList className="grid w-full grid-cols-1">
                      <TabsTrigger value="basic" className="flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        Product Details
                      </TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="basic" className="space-y-4 mt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
	                    <FormField
	                      control={form.control}
	                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Product Name</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
	                    />
	                    <FormField
	                      control={form.control}
	                      name="sku"
	                      render={({ field }) => (
	                        <FormItem>
	                          <FormLabel>SKU / Product Code</FormLabel>
	                          <FormControl>
	                            <Input {...field} value={field.value || ""} placeholder="e.g. timotionmotorcoverblk" data-testid="input-sku" />
	                          </FormControl>
	                          <p className="text-xs text-muted-foreground">This short code is used by the Sundance Builder and saved quote line items.</p>
	                          <FormMessage />
	                        </FormItem>
	                      )}
	                    />
	                    <FormField
	                      control={form.control}
                      name="manufacturer"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Manufacturer</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ""} placeholder="e.g. Brustor, SunSetter, Sunsail" data-testid="input-manufacturer" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Category</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ""} placeholder="e.g. Extrusions, Gutters, Louvers" data-testid="input-category" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea {...field} value={field.value || ""} rows={3} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  {form.watch("productType") === "configurable" && (
                    <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                      <p className="text-sm text-blue-800">
                        <strong>Dimensional pricing item:</strong> Use this only when the product price depends on length and width tables. Sundance parts should usually stay as simple products.
                      </p>
                    </div>
                  )}

                  {/* Pricing Section */}
                  {form.watch("productType") !== "configurable" && (
                    <div className="space-y-4">
                      <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                        <p className="text-sm text-blue-800">
                          <strong>Pricing:</strong> Enter the Manufacturer MSRP and EDG Cost. Rainmaker saves both, then calculates the supplier discount for compatibility.
                        </p>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="retailPrice"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Manufacturer MSRP</FormLabel>
                              <FormControl>
                                <Input 
                                  type="number" 
                                  step="0.01" 
                                  {...field} 
                                  value={field.value || ""} 
                                  placeholder="Manufacturer's list price" 
                                  data-testid="input-retail-price"
                                />
                              </FormControl>
                              <p className="text-xs text-gray-500">Supplier list price before EDG's discount</p>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="costPrice"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>EDG Cost</FormLabel>
                              <FormControl>
                                <Input 
                                  type="number" 
                                  step="0.01" 
                                  {...field} 
                                  value={field.value || ""} 
                                  placeholder="What EDG pays"
                                  data-testid="input-cost"
                                />
                              </FormControl>
                              <p className="text-xs text-gray-500">
                                {form.watch("retailPrice") && form.watch("costPrice")
                                  ? `Supplier discount: $${Math.max(0, parseFloat(form.watch("retailPrice") || "0") - parseFloat(form.watch("costPrice") || "0")).toFixed(2)}`
                                  : "Internal EDG cost for this product"}
                              </p>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  )}

                  <FormField
                    control={form.control}
                    name="unit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Unit</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="each">Each</SelectItem>
                            <SelectItem value="sq ft">Sq Ft</SelectItem>
                            <SelectItem value="linear ft">Linear Ft</SelectItem>
                            <SelectItem value="cubic yard">Cubic Yard</SelectItem>
                            <SelectItem value="hour">Hour</SelectItem>
                            <SelectItem value="day">Day</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Color Selection */}
                  {allColors && allColors.length > 0 && (
                    <FormField
                      control={form.control}
                      name="selectedColorIds"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <Palette className="h-4 w-4" />
                            Available Colors
                          </FormLabel>
                          <FormControl>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-4 border rounded-md bg-gray-50">
                              {allColors.map((color) => (
                                <div key={color.id} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`color-${color.id}`}
                                    checked={field.value?.includes(color.id)}
                                    onCheckedChange={(checked) => {
                                      const currentValues = field.value || [];
                                      if (checked) {
                                        field.onChange([...currentValues, color.id]);
                                      } else {
                                        field.onChange(currentValues.filter((id) => id !== color.id));
                                      }
                                    }}
                                    data-testid={`checkbox-color-${color.id}`}
                                  />
                                  <label
                                    htmlFor={`color-${color.id}`}
                                    className="flex items-center gap-2 cursor-pointer text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                  >
                                    <div
                                      className="w-6 h-6 rounded-full border-2 border-gray-300"
                                      style={{ backgroundColor: color.hexCode }}
                                      title={color.hexCode}
                                    />
                                    <span>{color.name}</span>
                                  </label>
                                </div>
                              ))}
                            </div>
                          </FormControl>
                          <p className="text-xs text-gray-500">
                            Select the colors available for this product
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                    </TabsContent>
                    
                  </Tabs>
                  
                  <div className="flex justify-end space-x-3 pt-4 border-t">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      className="bg-edg-black hover:bg-edg-grey text-edg-white"
                      disabled={createProductMutation.isPending || updateProductMutation.isPending}
                      data-testid="button-submit-product"
                    >
                      {(createProductMutation.isPending || updateProductMutation.isPending) ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {editingProduct ? "Updating..." : "Creating..."}
                        </>
                      ) : (
                        <>{editingProduct ? "Update" : "Create"} Product</>
                      )}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
          )}
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <Button
            type="button"
            variant={selectedManufacturer === "all" && pricingFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setSelectedManufacturer("all");
              setPricingFilter("all");
            }}
            data-testid="button-filter-all-products"
          >
            All Products
          </Button>
          <Button
            type="button"
            variant={selectedManufacturer === "Sundance" && pricingFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setSelectedManufacturer("Sundance");
              setPricingFilter("all");
            }}
            data-testid="button-filter-sundance-products"
          >
            Sundance Builder Parts
          </Button>
          <Button
            type="button"
            variant={pricingFilter === "needs-cost" ? "default" : "outline"}
            size="sm"
            onClick={() => setPricingFilter(pricingFilter === "needs-cost" ? "all" : "needs-cost")}
            data-testid="button-filter-needs-cost"
          >
            Needs Cost
          </Button>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              aria-label="Search products"
              placeholder="Search products..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              data-testid="input-search-products"
            />
          </div>
          
          <div className="grid min-w-0 grid-cols-1 gap-2 sm:flex">
            <Select value={selectedManufacturer} onValueChange={setSelectedManufacturer} data-testid="select-manufacturer-filter">
              <SelectTrigger className="w-full sm:w-48" aria-label="Filter products by manufacturer">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="All Manufacturers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Manufacturers</SelectItem>
                {manufacturers.map(manufacturer => (
                  <SelectItem key={manufacturer} value={manufacturer}>
                    {manufacturer}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedCategory} onValueChange={setSelectedCategory} data-testid="select-category-filter">
              <SelectTrigger className="w-full sm:w-48" aria-label="Filter products by category">
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

            <div className="flex w-fit rounded-md border">
              <Button
                variant={viewMode === "table" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("table")}
                className="rounded-r-none"
                aria-label="Table view"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "grid" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("grid")}
                className="rounded-l-none"
                aria-label="Grid view"
              >
                <Grid className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Active Filters */}
        {(searchTerm || selectedManufacturer !== "all" || selectedCategory !== "all" || pricingFilter !== "all") && (
          <div className="flex gap-2 mb-4">
            {searchTerm && (
              <Badge variant="secondary" className="flex items-center gap-1" data-testid="filter-search-active">
                Search: "{searchTerm}"
                <X className="h-3 w-3 cursor-pointer" onClick={() => setSearchTerm("")} />
              </Badge>
            )}
            {selectedManufacturer !== "all" && (
              <Badge variant="secondary" className="flex items-center gap-1" data-testid="filter-manufacturer-active">
                Manufacturer: {selectedManufacturer}
                <X className="h-3 w-3 cursor-pointer" onClick={() => setSelectedManufacturer("all")} />
              </Badge>
            )}
            {selectedCategory !== "all" && (
              <Badge variant="secondary" className="flex items-center gap-1" data-testid="filter-category-active">
                Category: {selectedCategory}
                <X className="h-3 w-3 cursor-pointer" onClick={() => setSelectedCategory("all")} />
              </Badge>
            )}
            {pricingFilter !== "all" && (
              <Badge variant="secondary" className="flex items-center gap-1" data-testid="filter-pricing-active">
                Needs Cost
                <X className="h-3 w-3 cursor-pointer" onClick={() => setPricingFilter("all")} />
              </Badge>
            )}
          </div>
        )}

        {isAdmin && selectedProductIds.length > 0 && (
          <div className="mb-4 flex flex-col gap-3 rounded-md border border-edg-teal/30 bg-edg-teal/5 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-edg-black">
                {selectedProductIds.length} product{selectedProductIds.length === 1 ? "" : "s"} selected
              </p>
              <p className="text-xs text-edg-grey">
                Bulk edit updates only the products you checked in this Products list.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSelectedProductIds([])}
              >
                Clear
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-edg-teal hover:bg-edg-teal/90 text-white"
                onClick={() => setShowBulkEditForm(true)}
                data-testid="button-open-bulk-edit"
              >
                <Settings className="mr-2 h-4 w-4" />
                Edit Selected
              </Button>
            </div>
          </div>
        )}

        {!products || products.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Package className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">
                {isSundanceSection ? "No Sundance parts yet" : "No products yet"}
              </h3>
              <p className="text-muted-foreground mb-6">
                {isAdmin
                  ? isSundanceSection
                    ? "Create the first approved part for the Sundance Builder."
                    : "Create your first product to start building the Products list."
                  : "Ask an admin to add products."}
              </p>
              {isAdmin && (
                <Button
                  className="bg-edg-black hover:bg-edg-grey text-edg-white"
                  onClick={openCreateProductDialog}
                  data-testid="button-create-first-product"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {isSundanceSection ? "Create Sundance Part" : "Create First Product"}
                </Button>
              )}
            </CardContent>
          </Card>
        ) : filteredProducts.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Package className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No products found</h3>
              <p className="text-muted-foreground mb-6">Try adjusting your search or filter criteria.</p>
              <Button
                variant="outline"
                onClick={() => {
	                  setSearchTerm("");
	                  setSelectedManufacturer("all");
	                  setSelectedCategory("all");
                  setPricingFilter("all");
	                }}
                data-testid="button-clear-filters"
              >
                Clear Filters
              </Button>
            </CardContent>
          </Card>
        ) : viewMode === "table" ? (
          <ProductTable 
            products={filteredProducts} 
            onEdit={handleEdit} 
	            onDelete={handleDelete}
	            onManagePricing={handleManagePricing}
	            canManage={isAdmin}
            selectedProductIds={selectedProductIds}
            onSelectProduct={handleSelectProduct}
            onSelectAll={handleSelectAllVisibleProducts}
            allVisibleSelected={allVisibleProductsSelected}
            someVisibleSelected={selectedVisibleProductCount > 0 && !allVisibleProductsSelected}
	          />
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedProducts).map(([manufacturer, manufacturerProducts]) => (
              <div key={manufacturer}>
                <h3 className="text-xl font-semibold text-charcoal mb-4 flex items-center gap-2" data-testid={`text-manufacturer-${manufacturer.toLowerCase().replace(/\s+/g, '-')}`}>
                  {manufacturer}
                  <Badge variant="outline">{manufacturerProducts.length}</Badge>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {manufacturerProducts.map((product) => {
                    // Get primary image or first gallery image
                    const galleryImages = product.galleryImages as any[] | null;
                    const specificationSheets = product.specificationSheets as any[] | null;
                    const primaryImageUrl = product.primaryImage || 
                      (galleryImages && Array.isArray(galleryImages) && galleryImages.length > 0 
                        ? (galleryImages[0] as any)?.url 
                        : null);
                    
                    return (
                    <Card key={product.id} className="hover:shadow-md transition-shadow overflow-hidden">
                      {/* Product Image */}
                      <div className="relative h-48 bg-gray-100 overflow-hidden">
                        {primaryImageUrl ? (
                          <img
                            src={primaryImageUrl}
                            alt={product.name}
                            className="w-full h-full object-cover transition-transform hover:scale-105"
                            onError={(e) => {
                              // Fallback to placeholder if image fails to load
                              e.currentTarget.style.display = 'none';
                              e.currentTarget.parentElement?.classList.add('flex', 'items-center', 'justify-center');
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gray-100">
                            <div className="text-center">
                              <Package className="mx-auto h-12 w-12 text-gray-400 mb-2" />
                              <p className="text-sm text-gray-500">No Image</p>
                            </div>
                          </div>
                        )}
                        
                        {/* Image count badge for gallery images */}
                        {galleryImages && Array.isArray(galleryImages) && galleryImages.length > 1 && (
                          <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                            <Image className="h-3 w-3" />
                            {galleryImages.length}
                          </div>
                        )}
                        
                        {/* Specification sheets indicator */}
                        {specificationSheets && Array.isArray(specificationSheets) && specificationSheets.length > 0 && (
                          <div className="absolute top-2 left-2 bg-blue-600/80 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                            <FileText className="h-3 w-3" />
                            {specificationSheets.length}
                          </div>
                        )}
                      </div>
                      
	                      <CardHeader className="pb-3">
	                        <div className="flex justify-between items-start">
	                          <div>
	                            <CardTitle className="text-lg">{product.name}</CardTitle>
	                            <div className="mt-2 flex flex-wrap gap-2">
	                              {product.sku && (
	                                <Badge variant="outline">{product.sku}</Badge>
	                              )}
	                              <Badge variant={product.productType === "configurable" ? "default" : "secondary"}>
	                                {product.productType === "configurable" ? "Dimensional" : "Simple"}
	                              </Badge>
	                            </div>
	                          </div>
                          {isAdmin && (
                            <div className="flex space-x-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEdit(product)}
                                className="text-edg-teal hover:text-edg-dark-teal"
                                title="Edit Product"
                                data-testid={`button-edit-${product.id}`}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              {product.productType === "configurable" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleManagePricing(product)}
                                  className="text-blue-600 hover:text-blue-800"
                                  title="Manage Pricing Tables"
                                >
                                  <Settings className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(product.id)}
                                className="text-red-600 hover:text-red-800"
                                title="Delete Product"
                                data-testid={`button-delete-${product.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent>
                        {product.description && (
                          <p className="text-sm text-accent-grey mb-3">{product.description}</p>
                        )}
                        <div className="space-y-2">
	                          <div className="flex justify-between text-sm">
	                            <span className="text-edg-grey">EDG Cost:</span>
	                            <span className="font-medium">
	                              {product.productType === "configurable" ? (
	                                <span className="text-gray-500">Dimensional Pricing</span>
	                              ) : (() => {
	                                const pricing = getProductPricingBreakdown(product);
	                                return `${formatCurrency(pricing.edgCost)} per ${product.unit}`;
	                              })()}
	                            </span>
	                          </div>
	                          {product.productType !== "configurable" && (
	                            <div className="flex justify-between text-sm">
	                              <span className="text-edg-grey">Manufacturer MSRP:</span>
	                              <span className="font-medium">{formatCurrency(getProductPricingBreakdown(product).manufacturerMsrp)}</span>
	                            </div>
	                          )}
                        </div>
                      </CardContent>
                    </Card>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {products && (
          <div className="mt-4">
            <span className="text-sm text-muted-foreground">
              Showing {filteredProducts.length} of {products.length} loaded products
            </span>
          </div>
        )}
          </>
        )}
      </div>

      <Dialog open={showBulkEditForm} onOpenChange={setShowBulkEditForm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bulk Edit Selected Products</DialogTitle>
            <p className="text-sm text-gray-600">
              Update {selectedProductIds.length} selected product{selectedProductIds.length === 1 ? "" : "s"}. Leave fields blank to keep current values.
            </p>
          </DialogHeader>
          <Form {...bulkUpdateForm}>
            <form onSubmit={bulkUpdateForm.handleSubmit(handleBulkUpdate)} className="space-y-4">
              <FormField
                control={bulkUpdateForm.control}
                name="manufacturer"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Manufacturer</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Leave blank to keep current" data-testid="input-bulk-manufacturer" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={bulkUpdateForm.control}
                  name="retailPrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Manufacturer MSRP</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" step="0.01" placeholder="No change" data-testid="input-bulk-msrp" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={bulkUpdateForm.control}
                  name="costPrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>EDG Cost</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" step="0.01" placeholder="No change" data-testid="input-bulk-cost" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={bulkUpdateForm.control}
                  name="defaultDiscountType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Supplier Discount Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-bulk-discount-type">
                            <SelectValue placeholder="No change" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="percentage">Percentage</SelectItem>
                          <SelectItem value="dollar">Dollar Amount</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={bulkUpdateForm.control}
                  name="defaultDiscountValue"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Supplier Discount Value</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="No change" data-testid="input-bulk-discount-value" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={bulkUpdateForm.control}
                name="unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="No change" data-testid="input-bulk-unit" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setShowBulkEditForm(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={bulkUpdateMutation.isPending}
                  className="bg-edg-teal hover:bg-edg-teal/90 text-white"
                  data-testid="button-submit-bulk-edit"
                >
                  {bulkUpdateMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    "Update Selected"
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Dimensional Pricing Manager Dialog */}
      <Dialog open={showPricingManager} onOpenChange={setShowPricingManager}>
        <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Manage Pricing Tables - {managingPricingProduct?.name}
            </DialogTitle>
          </DialogHeader>
          {managingPricingProduct && (
            <DimensionalPricingManager
              productId={managingPricingProduct.id}
              productName={managingPricingProduct.name}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
