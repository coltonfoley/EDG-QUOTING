import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
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
import { Plus, Package, Edit, Trash2, Search, Grid, List, Filter, X, Settings, Camera, FileText, Image, Loader2 } from "lucide-react";
import { DimensionalPricingManager } from "@/components/dimensional-pricing-manager";
import { LoadingSpinner } from "@/components/loading-spinner";
import { formatCurrency } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertProductSchema, type Product, type ProductWithDetails } from "@shared/schema";
import { z } from "zod";

const productFormSchema = insertProductSchema;
type ProductFormData = z.infer<typeof productFormSchema>;

export default function Products() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedManufacturer, setSelectedManufacturer] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "table">("table");
  const [showPricingManager, setShowPricingManager] = useState(false);
  const [managingPricingProduct, setManagingPricingProduct] = useState<Product | null>(null);
  
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: products, isLoading } = useQuery<Product[]>({
    queryKey: ["/api/products"],
    queryFn: async () => {
      const response = await fetch("/api/products");
      if (!response.ok) {
        throw new Error("Failed to fetch products");
      }
      return response.json();
    }
  });

  const form = useForm<ProductFormData>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      name: "",
      description: "",
      manufacturer: "",
      productType: "simple",
      retailPrice: undefined,
      defaultUnitPrice: "0",
      defaultDiscountType: "percentage",
      defaultDiscountValue: "0",
      unit: "each",
    },
  });

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
    onError: () => {
      toast({ title: "Error", description: "Failed to create product", variant: "destructive" });
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
    onError: () => {
      toast({ title: "Error", description: "Failed to update product", variant: "destructive" });
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


  const handleSubmit = (data: ProductFormData) => {
    if (editingProduct) {
      updateProductMutation.mutate({ id: editingProduct.id, data });
    } else {
      createProductMutation.mutate(data);
    }
  };


  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    
    form.reset({
      name: product.name,
      description: product.description || "",
      manufacturer: product.manufacturer || "",
      productType: product.productType || "simple",
      retailPrice: product.retailPrice,
      defaultUnitPrice: product.defaultUnitPrice,
      defaultDiscountType: product.defaultDiscountType,
      defaultDiscountValue: product.defaultDiscountValue,
      unit: product.unit || "each",
      minLength: product.minLength,
      maxLength: product.maxLength,
      minWidth: product.minWidth,
      maxWidth: product.maxWidth,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this product?")) {
      deleteProductMutation.mutate(id);
    }
  };

  const handleManagePricing = (product: Product) => {
    setManagingPricingProduct(product);
    setShowPricingManager(true);
  };

  // Get unique manufacturers and filter/search products
  const manufacturers = useMemo(() => {
    if (!products) return [];
    const uniqueManufacturers = Array.from(new Set(products.map(p => p.manufacturer || "Unknown")));
    return uniqueManufacturers.sort();
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    
    return products.filter(product => {
      const matchesSearch = searchTerm === "" || 
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (product.description || "").toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesManufacturer = selectedManufacturer === "all" || 
        (product.manufacturer || "Unknown") === selectedManufacturer;
      
      return matchesSearch && matchesManufacturer;
    });
  }, [products, searchTerm, selectedManufacturer]);

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
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-3xl font-bold text-edg-black">Product Catalog</h2>
            <p className="text-edg-grey mt-2">Manage reusable products and services • {filteredProducts.length} products</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button 
                className="bg-edg-black hover:bg-edg-grey text-edg-white"
                onClick={() => {
                  setEditingProduct(null);
                  form.reset();
                }}
                data-testid="button-new-product"
              >
                <Plus className="mr-2 h-4 w-4" />
                New Product
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
                  
                  {/* Product Type Selection */}
                  <FormField
                    control={form.control}
                    name="productType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Product Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || "simple"}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="simple">Simple Product</SelectItem>
                            <SelectItem value="configurable">Configurable Product (Dimensional Pricing)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Conditional message for configurable products */}
                  {form.watch("productType") === "configurable" && (
                    <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                      <p className="text-sm text-blue-800">
                        <strong>Configurable Product:</strong> This product will use dimensional pricing tables (length × width) instead of a fixed unit price. 
                        You can set up pricing tables after creating the product.
                      </p>
                    </div>
                  )}

                  {/* Pricing Section */}
                  {form.watch("productType") !== "configurable" && (
                    <div className="space-y-4">
                      <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                        <p className="text-sm text-blue-800">
                          <strong>Pricing Options:</strong> Enter either a Retail Price with Manufacturer Discount, OR enter your Direct Cost. 
                          If you enter a retail price, your cost will be calculated automatically.
                        </p>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="retailPrice"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Retail Price (Optional)</FormLabel>
                              <FormControl>
                                <Input 
                                  type="number" 
                                  step="0.01" 
                                  {...field} 
                                  value={field.value || ""} 
                                  placeholder="MSRP or list price" 
                                />
                              </FormControl>
                              <p className="text-xs text-gray-500">Manufacturer's suggested retail price</p>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="defaultUnitPrice"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>
                                {form.watch("retailPrice") ? "Cost (Calculated)" : "Direct Cost"}
                              </FormLabel>
                              <FormControl>
                                <Input 
                                  type="number" 
                                  step="0.01" 
                                  {...field}
                                  disabled={!!form.watch("retailPrice")}
                                  placeholder={form.watch("retailPrice") ? "Auto-calculated from retail" : "Your cost"}
                                />
                              </FormControl>
                              <p className="text-xs text-gray-500">
                                {form.watch("retailPrice") ? "Retail - manufacturer discount" : "Your actual cost"}
                              </p>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                  </div>

                  {/* Manufacturer Discount Section */}
                  <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
                    <FormField
                      control={form.control}
                      name="defaultDiscountValue"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Manufacturer Discount
                            {form.watch("retailPrice") && (
                              <span className="text-xs text-gray-500 font-normal ml-2">(applied to retail price)</span>
                            )}
                          </FormLabel>
                          <div className="flex space-x-1">
                            <FormControl>
                              <Input type="number" step="0.01" {...field} className="flex-1" />
                            </FormControl>
                            <FormField
                              control={form.control}
                              name="defaultDiscountType"
                              render={({ field: discountField }) => (
                                <Select onValueChange={discountField.onChange} defaultValue={discountField.value}>
                                  <SelectTrigger className="w-16">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="percentage">%</SelectItem>
                                    <SelectItem value="dollar">$</SelectItem>
                                  </SelectContent>
                                </Select>
                              )}
                            />
                          </div>
                          <p className="text-xs text-gray-500">
                            {form.watch("retailPrice") 
                              ? `Your discount off retail price (Cost = ${formatCurrency(parseFloat(form.watch("retailPrice") || "0"))} - discount)` 
                              : "Leave at 0 if using direct cost"}
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
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
        {(searchTerm || selectedManufacturer !== "all") && (
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
          </div>
        )}

        {!products || products.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Package className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No products yet</h3>
              <p className="text-gray-500 mb-6">Create your first product to start building a reusable catalog.</p>
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-edg-black hover:bg-edg-grey text-edg-white" data-testid="button-create-first-product">
                    <Plus className="mr-2 h-4 w-4" />
                    Create First Product
                  </Button>
                </DialogTrigger>
              </Dialog>
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
                            <Badge variant={product.productType === "configurable" ? "default" : "secondary"} className="mt-1">
                              {product.productType === "configurable" ? "Configurable" : "Simple"}
                            </Badge>
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
                              ) : (
                                `${formatCurrency(product.defaultUnitPrice)} per ${product.unit}`
                              )}
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
              <TableHead>Manufacturer</TableHead>
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
                  <Badge variant="outline" data-testid={`text-manufacturer-${product.id}`}>{product.manufacturer || "Unknown"}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={product.productType === "configurable" ? "default" : "secondary"}>
                    {product.productType === "configurable" ? "Configurable" : "Simple"}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-gray-600">{product.unit}</TableCell>
                <TableCell className="text-right font-medium">
                  {product.productType === "configurable" ? (
                    <span className="text-sm text-gray-500">Dimensional</span>
                  ) : (
                    formatCurrency(product.defaultUnitPrice)
                  )}
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