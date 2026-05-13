import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import { AppHeader } from "@/components/app-header";
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
import { Plus, Package, PackageCheck, Edit, Trash2, Search, Grid, List, Filter, X, Settings, Camera, FileText, Image, Loader2, Palette } from "lucide-react";
import { DimensionalPricingManager } from "@/components/dimensional-pricing-manager";
import { LoadingSpinner } from "@/components/loading-spinner";
import { formatCurrency } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertProductSchema, type Product, type ProductWithDetails, type Color } from "@shared/schema";
import { z } from "zod";
import { Checkbox } from "@/components/ui/checkbox";

const productFormSchema = insertProductSchema.extend({
  cost: z.string().optional(), // Frontend-only field for cost input
  selectedColorIds: z.array(z.number()).optional(), // Frontend-only field for color selection
});
type ProductFormData = z.infer<typeof productFormSchema>;

const PRODUCT_PAGE_SIZE = 200;

const DEFAULT_PRODUCT_VALUES: ProductFormData = {
  name: "",
  sku: "",
  description: "",
  manufacturer: "",
  category: "",
  productType: "simple",
  retailPrice: "0",
  defaultDiscountType: "dollar",
  defaultDiscountValue: "0",
  cost: "0",
  unit: "each",
  selectedColorIds: [],
};

export default function Products() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [catalogView, setCatalogView] = useState<"all" | "sundance">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedManufacturer, setSelectedManufacturer] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "table">("table");
  const [showPricingManager, setShowPricingManager] = useState(false);
  const [managingPricingProduct, setManagingPricingProduct] = useState<Product | null>(null);
  const [page, setPage] = useState(0);
  
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: products, isLoading } = useQuery<Product[]>({
    queryKey: ["/api/products", {
      limit: catalogView === "sundance" ? 10000 : PRODUCT_PAGE_SIZE,
      offset: catalogView === "sundance" ? 0 : page * PRODUCT_PAGE_SIZE,
      manufacturer: catalogView === "sundance" ? "Sundance" : undefined,
    }],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: String(catalogView === "sundance" ? 10000 : PRODUCT_PAGE_SIZE),
        offset: String(catalogView === "sundance" ? 0 : page * PRODUCT_PAGE_SIZE),
      });
      if (catalogView === "sundance") {
        params.set("manufacturer", "Sundance");
      }
      const response = await fetch(`/api/products?${params}`);
      if (!response.ok) {
        throw new Error("Failed to fetch products");
      }
      return response.json();
    }
  });

  const { data: allColors } = useQuery<Color[]>({
    queryKey: ["/api/colors"],
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

  useEffect(() => {
    setPage(0);
    setSelectedManufacturer("all");
    setSelectedCategory("all");
    setSearchTerm("");
  }, [catalogView]);

  const openCreateProductDialog = () => {
    setEditingProduct(null);
    form.reset({
      ...DEFAULT_PRODUCT_VALUES,
      ...(catalogView === "sundance" ? {
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


  const handleSubmit = async (formData: ProductFormData) => {
    // Calculate manufacturer discount from retail - cost
    const retail = parseFloat(formData.retailPrice || "0");
    const cost = parseFloat(formData.cost || "0");
    const manufacturerDiscount = Math.max(0, retail - cost);
    
    // Prepare data with calculated discount, omitting frontend-only fields
    const { cost: _, selectedColorIds, sku, ...productData } = formData;
    const data = {
      ...productData,
      sku: sku?.trim() || null,
      defaultDiscountType: "dollar" as const,
      defaultDiscountValue: manufacturerDiscount.toFixed(2),
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
    
    // Calculate cost from retail - discount for display
    const retail = parseFloat(product.retailPrice || "0");
    const discountValue = parseFloat(product.defaultDiscountValue || "0");
    let cost = 0;
    if (product.defaultDiscountType === "percentage") {
      cost = retail * (1 - discountValue / 100);
    } else {
      cost = Math.max(0, retail - discountValue);
    }
    
    form.reset({
      name: product.name,
      sku: product.sku || "",
      description: product.description || "",
      manufacturer: product.manufacturer || "",
      category: product.category || "",
      productType: product.productType || "simple",
      retailPrice: product.retailPrice,
      defaultDiscountType: product.defaultDiscountType,
      defaultDiscountValue: product.defaultDiscountValue,
      cost: cost.toFixed(2),
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
      
      return matchesSearch && matchesManufacturer && matchesCategory;
    });
  }, [products, searchTerm, selectedManufacturer, selectedCategory]);

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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
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

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Tabs value={catalogView} onValueChange={(value) => setCatalogView(value as "all" | "sundance")}>
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="all">All Products</TabsTrigger>
              <TabsTrigger value="sundance">Sundance Catalog</TabsTrigger>
            </TabsList>
          </Tabs>
          {catalogView === "sundance" && (
            <Card className="mt-4 border-edg-teal/30 bg-edg-teal/5">
              <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-start">
                <PackageCheck className="mt-0.5 h-5 w-5 shrink-0 text-edg-teal" />
                <div>
                  <h3 className="text-sm font-semibold text-edg-black">Builder source of truth</h3>
                  <p className="mt-1 text-sm text-edg-grey">
                    These are the approved Sundance parts the quote builder reads from. If a part is not here, it should not appear in the Sundance Builder.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-3xl font-bold text-edg-black">
              {catalogView === "sundance" ? "Sundance Catalog" : "Product Catalog"}
            </h2>
            <p className="text-edg-grey mt-2">
              {catalogView === "sundance"
                ? `Manage the approved parts used by the Sundance Builder • ${filteredProducts.length} parts`
                : `Manage reusable products and services • ${filteredProducts.length} products`}
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button 
                className="bg-edg-black hover:bg-edg-grey text-edg-white"
                onClick={openCreateProductDialog}
                data-testid="button-new-product"
              >
                <Plus className="mr-2 h-4 w-4" />
                {catalogView === "sundance" ? "New Sundance Part" : "New Product"}
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
	                          <p className="text-xs text-gray-500">This is the short code the Sundance Builder and Ops handoff should use.</p>
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
                        <strong>Dimensional pricing item:</strong> Use this only when the product price depends on length and width tables. Sundance parts should usually stay as simple catalog items.
                      </p>
                    </div>
                  )}

                  {/* Pricing Section */}
                  {form.watch("productType") !== "configurable" && (
                    <div className="space-y-4">
                      <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                        <p className="text-sm text-blue-800">
                          <strong>Pricing:</strong> Enter the Retail Price (MSRP) and Your Cost. The system will calculate the manufacturer discount automatically.
                        </p>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="retailPrice"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Retail Price (MSRP)</FormLabel>
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
                              <p className="text-xs text-gray-500">Manufacturer's suggested retail price</p>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="cost"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Your Cost</FormLabel>
                              <FormControl>
                                <Input 
                                  type="number" 
                                  step="0.01" 
                                  {...field} 
                                  value={field.value || ""} 
                                  placeholder="What you pay" 
                                  data-testid="input-cost"
                                />
                              </FormControl>
                              <p className="text-xs text-gray-500">
                                {form.watch("retailPrice") && form.watch("cost") 
                                  ? `Discount: $${Math.max(0, parseFloat(form.watch("retailPrice") || "0") - parseFloat(form.watch("cost") || "0")).toFixed(2)}` 
                                  : "Your actual cost for this product"}
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
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search products..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              data-testid="input-search-products"
            />
          </div>
          
          <div className="flex gap-2">
            <Select value={selectedManufacturer} onValueChange={setSelectedManufacturer} data-testid="select-manufacturer-filter">
              <SelectTrigger className="w-48">
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

            <div className="flex border rounded-md">
              <Button
                variant={viewMode === "table" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("table")}
                className="rounded-r-none"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "grid" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("grid")}
                className="rounded-l-none"
              >
                <Grid className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Active Filters */}
        {(searchTerm || selectedManufacturer !== "all" || selectedCategory !== "all") && (
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
          </div>
        )}

        {!products || products.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Package className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {catalogView === "sundance" ? "No Sundance parts yet" : "No products yet"}
              </h3>
              <p className="text-gray-500 mb-6">
                {catalogView === "sundance"
                  ? "Create the first approved part for the Sundance Builder."
                  : "Create your first product to start building a reusable catalog."}
              </p>
              <Button
                className="bg-edg-black hover:bg-edg-grey text-edg-white"
                onClick={openCreateProductDialog}
                data-testid="button-create-first-product"
              >
                <Plus className="mr-2 h-4 w-4" />
                {catalogView === "sundance" ? "Create Sundance Part" : "Create First Product"}
              </Button>
            </CardContent>
          </Card>
        ) : filteredProducts.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Package className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No products found</h3>
              <p className="text-gray-500 mb-6">Try adjusting your search or filter criteria.</p>
              <Button
                variant="outline"
                onClick={() => {
                  setSearchTerm("");
                  setSelectedManufacturer("all");
                  setSelectedCategory("all");
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
                        </div>
                      </CardHeader>
                      <CardContent>
                        {product.description && (
                          <p className="text-sm text-accent-grey mb-3">{product.description}</p>
                        )}
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-edg-grey">Unit Price:</span>
                            <span className="font-medium">
                              {product.productType === "configurable" ? (
                                <span className="text-gray-500">Dimensional Pricing</span>
                              ) : (() => {
                                const retail = parseFloat(product.retailPrice?.toString() || "0");
                                const discountValue = parseFloat(product.defaultDiscountValue?.toString() || "0");
                                let cost = 0;
                                if (product.defaultDiscountType === "percentage") {
                                  cost = retail * (1 - discountValue / 100);
                                } else {
                                  cost = Math.max(0, retail - discountValue);
                                }
                                return `${formatCurrency(cost)} per ${product.unit}`;
                              })()}
                            </span>
                          </div>
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
          <div className="flex items-center justify-between mt-4">
            <span className="text-sm text-muted-foreground">
              Page {page + 1} — showing {products.length} products
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage(p => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={products.length < PRODUCT_PAGE_SIZE}
                onClick={() => setPage(p => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

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

interface ProductTableProps {
  products: Product[];
  onEdit: (product: Product) => void;
  onDelete: (id: number) => void;
  onManagePricing: (product: Product) => void;
}

function ProductTable({ products, onEdit, onDelete, onManagePricing }: ProductTableProps) {
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
	            <TableRow>
	              <TableHead className="w-[80px]">Image</TableHead>
	              <TableHead className="w-[280px]">Product Name</TableHead>
	              <TableHead>SKU</TableHead>
	              <TableHead>Manufacturer</TableHead>
	              <TableHead>Category</TableHead>
	              <TableHead>Type</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead className="text-right">Unit Price</TableHead>
              <TableHead className="w-[130px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((product) => {
              // Get primary image or first gallery image
              const galleryImages = product.galleryImages as any[] | null;
              const specificationSheets = product.specificationSheets as any[] | null;
              const primaryImageUrl = product.primaryImage || 
                (galleryImages && Array.isArray(galleryImages) && galleryImages.length > 0 
                  ? (galleryImages[0] as any)?.url 
                  : null);
              
              return (
              <TableRow key={product.id} className="hover:bg-gray-50">
                <TableCell>
                  <div className="relative w-12 h-12 rounded-md overflow-hidden bg-gray-100 flex-shrink-0">
                    {primaryImageUrl ? (
                      <img
                        src={primaryImageUrl}
                        alt={product.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          // Fallback to placeholder if image fails to load
                          e.currentTarget.style.display = 'none';
                          e.currentTarget.parentElement?.classList.add('flex', 'items-center', 'justify-center');
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className="h-6 w-6 text-gray-400" />
                      </div>
                    )}
                    
                    {/* Gallery indicator */}
                    {galleryImages && Array.isArray(galleryImages) && galleryImages.length > 1 && (
                      <div className="absolute -top-1 -right-1 bg-black text-white text-xs w-4 h-4 rounded-full flex items-center justify-center">
                        {galleryImages.length}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div>
                    <div className="font-medium">{product.name}</div>
                    {product.description && (
                      <div className="text-sm text-gray-500 truncate max-w-xs">
                        {product.description}
                      </div>
                    )}
                    {/* Technical docs indicator */}
                    {specificationSheets && Array.isArray(specificationSheets) && specificationSheets.length > 0 && (
                      <div className="flex items-center gap-1 mt-1">
                        <FileText className="h-3 w-3 text-blue-600" />
                        <span className="text-xs text-blue-600">{specificationSheets.length} docs</span>
                      </div>
                    )}
                  </div>
	                </TableCell>
	                <TableCell>
	                  {product.sku ? (
	                    <Badge variant="outline" data-testid={`text-sku-${product.id}`}>{product.sku}</Badge>
	                  ) : (
	                    <span className="text-sm text-gray-400">None</span>
	                  )}
	                </TableCell>
	                <TableCell>
	                  <Badge variant="outline" data-testid={`text-manufacturer-${product.id}`}>{product.manufacturer || "Unknown"}</Badge>
                </TableCell>
                <TableCell>
                  {product.category ? (
                    <span className="text-sm text-gray-600">{product.category}</span>
                  ) : (
                    <span className="text-sm text-gray-400">Uncategorized</span>
                  )}
                </TableCell>
	                <TableCell>
	                  <Badge variant={product.productType === "configurable" ? "default" : "secondary"}>
	                    {product.productType === "configurable" ? "Dimensional" : "Simple"}
	                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-gray-600">{product.unit}</TableCell>
                <TableCell className="text-right font-medium">
                  {product.productType === "configurable" ? (
                    <span className="text-sm text-gray-500">Dimensional</span>
                  ) : (() => {
                    const retail = parseFloat(product.retailPrice?.toString() || "0");
                    const discountValue = parseFloat(product.defaultDiscountValue?.toString() || "0");
                    let cost = 0;
                    if (product.defaultDiscountType === "percentage") {
                      cost = retail * (1 - discountValue / 100);
                    } else {
                      cost = Math.max(0, retail - discountValue);
                    }
                    return formatCurrency(cost);
                  })()}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(product)}
                      className="text-edg-teal hover:text-edg-dark-teal h-8 w-8 p-0"
                      title="Edit Product"
                      data-testid={`button-edit-table-${product.id}`}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    {product.productType === "configurable" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onManagePricing(product)}
                        className="text-blue-600 hover:text-blue-800 h-8 w-8 p-0"
                        title="Manage Pricing Tables"
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(product.id)}
                      className="text-red-600 hover:text-red-800 h-8 w-8 p-0"
                      title="Delete Product"
                      data-testid={`button-delete-table-${product.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
