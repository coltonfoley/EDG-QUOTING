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
import { Plus, Package, Edit, Trash2, Search, Grid, List, Filter, X, Settings, Camera, FileText, Image, Upload, FileSpreadsheet, AlertCircle, CheckCircle } from "lucide-react";
import { DimensionalPricingManager } from "@/components/dimensional-pricing-manager";
import { PricingTableUploader } from "@/components/pricing-table-uploader";
import { Label } from "@/components/ui/label";
import { ImageUploader, type UploadedImage } from "@/components/image-uploader";
import { formatCurrency } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertProductSchema, type Product, type ProductWithDetails, type ProductImage, type User } from "@shared/schema";
import { z } from "zod";
import { Checkbox } from "@/components/ui/checkbox";

const productFormSchema = insertProductSchema;
type ProductFormData = z.infer<typeof productFormSchema>;

const bulkUpdateSchema = z.object({
  category: z.string().optional(),
  defaultMarkupType: z.enum(["percentage", "dollar"]).optional(),
  defaultMarkupValue: z.string().optional(),
  unit: z.string().optional(),
});

type BulkUpdateData = z.infer<typeof bulkUpdateSchema>;

export default function Products() {
  const [activeTab, setActiveTab] = useState("products");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "table">("table");
  const [showPricingManager, setShowPricingManager] = useState(false);
  const [managingPricingProduct, setManagingPricingProduct] = useState<Product | null>(null);
  
  // Image management state
  const [primaryImage, setPrimaryImage] = useState<UploadedImage[]>([]);
  const [galleryImages, setGalleryImages] = useState<UploadedImage[]>([]);
  const [specificationSheets, setSpecificationSheets] = useState<UploadedImage[]>([]);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: products, isLoading } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const form = useForm<ProductFormData>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      name: "",
      description: "",
      category: "",
      productType: "simple",
      defaultUnitPrice: "0",
      defaultMarkupType: "percentage",
      defaultMarkupValue: "25",
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
      setPrimaryImage([]);
      setGalleryImages([]);
      setSpecificationSheets([]);
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
      setPrimaryImage([]);
      setGalleryImages([]);
      setSpecificationSheets([]);
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

  const convertUploadedImagesToProductImages = (images: UploadedImage[], imageType: 'primary' | 'gallery' | 'specification'): ProductImage[] => {
    return images.map((img, index) => ({
      url: img.url || img.preview,
      filename: img.metadata.filename || '',
      caption: img.metadata.caption,
      altText: img.metadata.altText,
      uploadedAt: img.metadata.uploadedAt || new Date().toISOString(),
      size: img.metadata.size,
      thumbnailUrl: img.metadata.thumbnailUrl,
      type: imageType,
      sortOrder: index
    }));
  };

  const convertProductImagesToUploaded = (images: ProductImage[] | null | undefined, type: string): UploadedImage[] => {
    if (!images || !Array.isArray(images)) return [];
    return images.map((img, index) => ({
      id: `existing-${type}-${index}`,
      file: new File([], img.filename || 'image.jpg', { type: 'image/jpeg' }),
      preview: img.url,
      uploadProgress: 100,
      uploaded: true,
      url: img.url,
      metadata: {
        url: img.url,
        filename: img.filename || 'Image',
        caption: img.caption,
        altText: img.altText,
        uploadedAt: img.uploadedAt || new Date().toISOString(),
        size: img.size,
        thumbnailUrl: img.thumbnailUrl,
      },
    }));
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    
    // Load existing images
    if (product.primaryImage) {
      setPrimaryImage([{
        id: 'existing-primary-0',
        file: new File([], 'primary.jpg', { type: 'image/jpeg' }),
        preview: product.primaryImage,
        uploadProgress: 100,
        uploaded: true,
        url: product.primaryImage,
        metadata: {
          url: product.primaryImage,
          filename: 'Primary Image',
          uploadedAt: new Date().toISOString(),
        },
      }]);
    } else {
      setPrimaryImage([]);
    }
    
    setGalleryImages(convertProductImagesToUploaded(product.galleryImages as ProductImage[], 'gallery'));
    setSpecificationSheets(convertProductImagesToUploaded(product.specificationSheets as ProductImage[], 'specification'));
    
    form.reset({
      name: product.name,
      description: product.description || "",
      category: product.category || "",
      productType: product.productType || "simple",
      defaultUnitPrice: product.defaultUnitPrice,
      defaultMarkupType: product.defaultMarkupType,
      defaultMarkupValue: product.defaultMarkupValue,
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

  const onSubmit = (data: ProductFormData) => {
    const productData = {
      ...data,
      primaryImage: primaryImage.length > 0 ? (primaryImage[0].url || primaryImage[0].preview) : null,
      galleryImages: convertUploadedImagesToProductImages(galleryImages, 'gallery'),
      specificationSheets: convertUploadedImagesToProductImages(specificationSheets, 'specification'),
    };

    if (editingProduct) {
      updateProductMutation.mutate({ id: editingProduct.id, data: productData });
    } else {
      createProductMutation.mutate(productData);
    }
  };

  const categories = useMemo(() => {
    if (!products) return [];
    const uniqueCategories = Array.from(new Set(products.map(p => p.category || "Uncategorized")));
    return uniqueCategories.sort();
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    
    return products.filter(product => {
      const matchesSearch = searchTerm === "" || 
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (product.description || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (product.category || "").toLowerCase().includes(searchTerm.toLowerCase());
      
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-64 mb-6"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-48 bg-gray-200 rounded-lg"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Main Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-edg-black mb-2">Product Management</h1>
          <p className="text-edg-grey">Manage your product catalog, pricing, and bulk operations</p>
          
          {/* Main Navigation Tabs */}
          <div className="flex space-x-1 mt-6 border-b">
            <button 
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "products" 
                  ? "text-edg-black border-b-2 border-edg-black bg-white" 
                  : "text-gray-600 hover:text-edg-black hover:border-b-2 hover:border-gray-300"
              }`}
              onClick={() => setActiveTab("products")}
              data-testid="button-products-tab"
            >
              <Package className="inline mr-2 h-4 w-4" />
              Products
            </button>
            <button 
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "bulk-tools" 
                  ? "text-edg-black border-b-2 border-edg-black bg-white" 
                  : "text-gray-600 hover:text-edg-black hover:border-b-2 hover:border-gray-300"
              }`}
              onClick={() => setActiveTab("bulk-tools")}
              data-testid="button-bulk-tools-tab"
            >
              <Settings className="inline mr-2 h-4 w-4" />
              Bulk Tools
            </button>
          </div>
        </div>

        {/* Products Tab Content */}
        {activeTab === "products" && (
          <div>
            {/* Product Creation Header */}
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
                  setPrimaryImage([]);
                  setGalleryImages([]);
                  setSpecificationSheets([]);
                }}
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
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  {/* Basic Information */}
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Product Name</FormLabel>
                            <FormControl>
                              <Input placeholder="Enter product name" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="category"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Category</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g., Lumber, Hardware, Tools" {...field} />
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
                            <Textarea placeholder="Product description..." {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Product Type */}
                  <FormField
                    control={form.control}
                    name="productType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Product Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select product type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="simple">Simple Product (fixed pricing)</SelectItem>
                            <SelectItem value="configurable">Configurable Product (dimensional pricing)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Pricing Information */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium">Pricing Information</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="defaultUnitPrice"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Default Unit Price</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.01" placeholder="0.00" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="unit"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Unit of Measure</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g., each, ft, lb, sq ft" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="defaultMarkupType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Default Markup Type</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="percentage">Percentage (%)</SelectItem>
                                <SelectItem value="dollar">Fixed Dollar ($)</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="defaultMarkupValue"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Default Markup Value</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step={form.watch("defaultMarkupType") === "percentage" ? "0.1" : "0.01"}
                                placeholder="25"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="defaultDiscountType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Default Discount Type</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="percentage">Percentage (%)</SelectItem>
                                <SelectItem value="dollar">Fixed Dollar ($)</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="defaultDiscountValue"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Default Discount Value</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step={form.watch("defaultDiscountType") === "percentage" ? "0.1" : "0.01"}
                                placeholder="0"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  {/* Configurable Product Dimensions */}
                  {form.watch("productType") === "configurable" && (
                    <div className="space-y-4">
                      <h3 className="text-lg font-medium">Dimension Constraints</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Length Range</Label>
                          <div className="flex gap-2 items-center">
                            <FormField
                              control={form.control}
                              name="minLength"
                              render={({ field }) => (
                                <FormItem className="flex-1">
                                  <FormControl>
                                    <Input type="number" placeholder="Min" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <span className="text-gray-500">to</span>
                            <FormField
                              control={form.control}
                              name="maxLength"
                              render={({ field }) => (
                                <FormItem className="flex-1">
                                  <FormControl>
                                    <Input type="number" placeholder="Max" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Width Range</Label>
                          <div className="flex gap-2 items-center">
                            <FormField
                              control={form.control}
                              name="minWidth"
                              render={({ field }) => (
                                <FormItem className="flex-1">
                                  <FormControl>
                                    <Input type="number" placeholder="Min" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <span className="text-gray-500">to</span>
                            <FormField
                              control={form.control}
                              name="maxWidth"
                              render={({ field }) => (
                                <FormItem className="flex-1">
                                  <FormControl>
                                    <Input type="number" placeholder="Max" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Images Section */}
                  <div className="space-y-6">
                    <h3 className="text-lg font-medium flex items-center gap-2">
                      <Camera className="h-5 w-5" />
                      Product Images
                    </h3>
                    
                    {/* Primary Image */}
                    <div>
                      <Label className="text-sm font-medium mb-2 block">Primary Image</Label>
                      <ImageUploader
                        images={primaryImage}
                        onImagesChange={setPrimaryImage}
                        maxImages={1}
                        acceptedTypes={['image/*']}
                        className="h-32"
                      />
                      <p className="text-xs text-gray-500 mt-1">Main product image shown in listings</p>
                    </div>

                    {/* Gallery Images */}
                    <div>
                      <Label className="text-sm font-medium mb-2 block">Gallery Images</Label>
                      <ImageUploader
                        images={galleryImages}
                        onImagesChange={setGalleryImages}
                        maxImages={10}
                        acceptedTypes={['image/*']}
                        className="h-24"
                      />
                      <p className="text-xs text-gray-500 mt-1">Additional product photos (up to 10)</p>
                    </div>

                    {/* Specification Sheets */}
                    <div>
                      <Label className="text-sm font-medium mb-2 block flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Technical Documents
                      </Label>
                      <ImageUploader
                        images={specificationSheets}
                        onImagesChange={setSpecificationSheets}
                        maxImages={5}
                        acceptedTypes={['image/*', '.pdf']}
                        className="h-20"
                      />
                      <p className="text-xs text-gray-500 mt-1">Spec sheets, manuals, installation guides (up to 5 files)</p>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t">
                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button 
                      type="submit" 
                      disabled={createProductMutation.isPending || updateProductMutation.isPending}
                      className="bg-edg-black hover:bg-edg-grey text-edg-white"
                    >
                      {createProductMutation.isPending || updateProductMutation.isPending ? "Saving..." : 
                       editingProduct ? "Update Product" : "Create Product"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search and Filter Controls */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search products by name, description, or category..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <div className="flex gap-2">
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <div className="flex gap-1 border rounded-lg p-1">
              <Button
                variant={viewMode === "table" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setViewMode("table")}
                className="h-8 w-8 p-0"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "grid" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setViewMode("grid")}
                className="h-8 w-8 p-0"
              >
                <Grid className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Products Display */}
        {!products || products.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Package className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No products yet</h3>
              <p className="text-gray-500 mb-6">Create your first product to start building a reusable catalog.</p>
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-edg-black hover:bg-edg-grey text-edg-white">
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
                  setSelectedCategory("all");
                }}
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
            {Object.entries(groupedProducts).map(([category, categoryProducts]) => (
              <div key={category}>
                <h3 className="text-xl font-semibold text-charcoal mb-4 flex items-center gap-2">
                  {category}
                  <Badge variant="outline">{categoryProducts.length}</Badge>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {categoryProducts.map((product) => {
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
                        
                        {/* Gallery count indicator */}
                        {galleryImages && Array.isArray(galleryImages) && galleryImages.length > 0 && (
                          <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                            <Image className="inline h-3 w-3 mr-1" />
                            {galleryImages.length}
                          </div>
                        )}
                        
                        {/* Technical docs indicator */}
                        {specificationSheets && Array.isArray(specificationSheets) && specificationSheets.length > 0 && (
                          <div className="absolute top-2 right-2 bg-blue-600 text-white text-xs px-2 py-1 rounded">
                            <FileText className="inline h-3 w-3 mr-1" />
                            {specificationSheets.length}
                          </div>
                        )}
                        
                        {/* Action Buttons */}
                        <div className="absolute bottom-2 right-2 flex gap-1">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleEdit(product)}
                            className="h-8 w-8 p-0 bg-white/90 hover:bg-white"
                            title="Edit Product"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          {product.productType === "configurable" && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleManagePricing(product)}
                              className="h-8 w-8 p-0 bg-blue-600/90 hover:bg-blue-600 text-white"
                              title="Manage Pricing Tables"
                            >
                              <Settings className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleDelete(product.id)}
                            className="h-8 w-8 p-0 bg-red-600/90 hover:bg-red-600 text-white"
                            title="Delete Product"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Product Details */}
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="font-semibold text-lg text-edg-black truncate">{product.name}</h4>
                          <Badge variant={product.productType === "configurable" ? "default" : "secondary"} className="ml-2 flex-shrink-0">
                            {product.productType === "configurable" ? "Config" : "Simple"}
                          </Badge>
                        </div>
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
                          <div className="flex justify-between text-sm">
                            <span className="text-edg-grey">Default Markup:</span>
                            <span className="font-medium text-edg-teal">
                              {product.defaultMarkupValue}{product.defaultMarkupType === 'percentage' ? '%' : ' $'}
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
        )}

        {/* Bulk Tools Tab Content */}
        {activeTab === "bulk-tools" && (
          <div className="space-y-8">
            {/* Price List Uploader */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Price List Uploader
                </CardTitle>
                <p className="text-sm text-gray-600">
                  Upload Excel, CSV, or PDF files to bulk import product pricing data using AI extraction.
                </p>
              </CardHeader>
              <CardContent>
                <PriceListUploader />
              </CardContent>
            </Card>

            {/* Bulk Product Editor */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Bulk Product Editor
                </CardTitle>
                <p className="text-sm text-gray-600">
                  Select multiple products and update their category, markup, or units all at once.
                </p>
              </CardHeader>
              <CardContent>
                <ProductBulkEditor />
              </CardContent>
            </Card>
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
              <TableHead>Category</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead className="text-right">Unit Price</TableHead>
              <TableHead className="text-right">Markup</TableHead>
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
                  <Badge variant="outline">{product.category || "Uncategorized"}</Badge>
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
                <TableCell className="text-right">
                  <span className="text-edg-teal font-medium">
                    {product.defaultMarkupValue}{product.defaultMarkupType === 'percentage' ? '%' : '$'}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(product)}
                      className="text-edg-teal hover:text-edg-dark-teal h-8 w-8 p-0"
                      title="Edit Product"
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

// Price List Uploader Component
function PriceListUploader() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<{
    created: number;
    updated: number;
    skipped: number;
    errors: string[];
  } | null>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file type
    const allowedTypes = ['application/pdf', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'image/jpeg', 'image/png', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Please upload a PDF, Excel file, or image (JPG/PNG)",
        variant: "destructive"
      });
      return;
    }

    setUploading(true);
    setResults(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/admin/upload-price-list', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Upload failed');
      }

      const data = await response.json();
      setResults({
        created: data.created,
        updated: data.updated,
        skipped: data.skipped,
        errors: data.errors || [],
      });

      toast({
        title: "Price list processed successfully",
        description: `Created: ${data.created}, Updated: ${data.updated}, Skipped: ${data.skipped}`,
      });

      // Invalidate products cache to refresh the bulk editor
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });

      // Clear the input
      event.target.value = '';
    } catch (error: any) {
      console.error('Upload error:', error);
      toast({
        title: "Upload failed",
        description: error.message || "Failed to process price list",
        variant: "destructive"
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="text-sm text-gray-600 mb-4">
        Upload a manufacturer price list (PDF, Excel, or image) to automatically extract and import products into your catalog.
      </div>
      
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
        <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <label htmlFor="price-list-upload" className="cursor-pointer">
          <span className="text-edg-teal hover:text-edg-teal/80 font-medium">
            Click to upload
          </span>
          <span className="text-gray-600"> or drag and drop</span>
        </label>
        <p className="text-xs text-gray-500 mt-2">PDF, Excel (.xls, .xlsx), or images (JPG, PNG) up to 10MB</p>
        <input
          id="price-list-upload"
          type="file"
          onChange={handleFileUpload}
          accept=".pdf,.xls,.xlsx,.jpg,.jpeg,.png"
          className="hidden"
          disabled={uploading}
        />
      </div>

      {uploading && (
        <div className="flex items-center justify-center py-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-edg-teal"></div>
          <span className="ml-2 text-gray-600">Processing price list...</span>
        </div>
      )}

      {results && (
        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-semibold mb-3 flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            Import Results
          </h4>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{results.created}</div>
              <div className="text-gray-600">Products Created</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{results.updated}</div>
              <div className="text-gray-600">Products Updated</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-600">{results.skipped}</div>
              <div className="text-gray-600">Products Skipped</div>
            </div>
          </div>
          
          {results.errors.length > 0 && (
            <div className="mt-4 p-3 bg-red-50 rounded border border-red-200">
              <h5 className="font-medium text-red-800 mb-2 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Processing Errors
              </h5>
              <ul className="text-sm text-red-700 space-y-1">
                {results.errors.map((error, index) => (
                  <li key={index}>• {error}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Product Bulk Editor Component
function ProductBulkEditor() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedProducts, setSelectedProducts] = useState<number[]>([]);
  const [showBulkEditForm, setShowBulkEditForm] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Fetch all products
  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  // Get unique categories
  const categories = useMemo(() => {
    if (!products) return [];
    const uniqueCategories = Array.from(new Set(products.map(p => p.category || "Uncategorized")));
    return uniqueCategories.sort();
  }, [products]);

  // Filter products by category and search term
  const filteredProducts = useMemo(() => {
    if (!products) return [];
    
    return products.filter(product => {
      const matchesCategory = selectedCategory === "all" || 
        (product.category || "Uncategorized") === selectedCategory;
      
      const matchesSearch = searchTerm === "" || 
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (product.description || "").toLowerCase().includes(searchTerm.toLowerCase());
      
      return matchesCategory && matchesSearch;
    });
  }, [products, selectedCategory, searchTerm]);

  const bulkUpdateForm = useForm<BulkUpdateData>({
    resolver: zodResolver(bulkUpdateSchema),
    defaultValues: {
      category: "",
      defaultMarkupType: "percentage",
      defaultMarkupValue: "",
      unit: "",
    },
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: async (data: BulkUpdateData) => {
      // Remove empty fields
      const updates = Object.fromEntries(
        Object.entries(data).filter(([_, value]) => value && value !== "")
      );
      
      const response = await apiRequest("POST", "/api/admin/bulk-update-products", {
        productIds: selectedProducts,
        updates,
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Products updated successfully",
        description: `Updated ${data.updatedCount} products`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setSelectedProducts([]);
      setShowBulkEditForm(false);
      bulkUpdateForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Update failed",
        description: error.message || "Failed to update products",
        variant: "destructive",
      });
    },
  });

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedProducts(filteredProducts.map(p => p.id));
    } else {
      setSelectedProducts([]);
    }
  };

  const handleSelectProduct = (productId: number, checked: boolean) => {
    if (checked) {
      setSelectedProducts([...selectedProducts, productId]);
    } else {
      setSelectedProducts(selectedProducts.filter(id => id !== productId));
    }
  };

  const handleBulkUpdate = (data: BulkUpdateData) => {
    bulkUpdateMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-edg-teal"></div>
        <span className="ml-2 text-gray-600">Loading products...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Bulk Product Editor</h3>
          <p className="text-sm text-gray-600">
            {filteredProducts.length} products available for bulk editing
          </p>
        </div>
        
        {selectedProducts.length > 0 && (
          <Button
            onClick={() => setShowBulkEditForm(true)}
            className="bg-edg-teal hover:bg-edg-teal/90 text-white"
          >
            <Settings className="h-4 w-4 mr-2" />
            Edit {selectedProducts.length} Products
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category} value={category}>
                {category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Products Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">
                  <Checkbox
                    checked={selectedProducts.length === filteredProducts.length}
                    onCheckedChange={handleSelectAll}
                    indeterminate={selectedProducts.length > 0 && selectedProducts.length < filteredProducts.length}
                  />
                </TableHead>
                <TableHead>Product Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Markup</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.map((product) => (
                <TableRow key={product.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedProducts.includes(product.id)}
                      onCheckedChange={(checked) => handleSelectProduct(product.id, checked as boolean)}
                    />
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{product.name}</div>
                      {product.description && (
                        <div className="text-sm text-gray-500 truncate max-w-xs">
                          {product.description}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{product.category || "Uncategorized"}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">{product.unit}</TableCell>
                  <TableCell className="text-right font-medium">
                    {product.productType === "configurable" ? (
                      <span className="text-sm text-gray-500">Dimensional</span>
                    ) : (
                      formatCurrency(product.defaultUnitPrice)
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="text-edg-teal font-medium">
                      {product.defaultMarkupValue}{product.defaultMarkupType === 'percentage' ? '%' : '$'}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Bulk Edit Form Dialog */}
      <Dialog open={showBulkEditForm} onOpenChange={setShowBulkEditForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk Edit {selectedProducts.length} Products</DialogTitle>
          </DialogHeader>
          <Form {...bulkUpdateForm}>
            <form onSubmit={bulkUpdateForm.handleSubmit(handleBulkUpdate)} className="space-y-4">
              <FormField
                control={bulkUpdateForm.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category (optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Leave blank to keep existing" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={bulkUpdateForm.control}
                  name="defaultMarkupType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Markup Type (optional)</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="percentage">Percentage (%)</SelectItem>
                          <SelectItem value="dollar">Fixed Dollar ($)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={bulkUpdateForm.control}
                  name="defaultMarkupValue"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Markup Value (optional)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.1"
                          placeholder="Leave blank to keep existing"
                          {...field}
                        />
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
                    <FormLabel>Unit (optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., each, ft, lb - leave blank to keep existing" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setShowBulkEditForm(false)}>
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={bulkUpdateMutation.isPending}
                  className="bg-edg-teal hover:bg-edg-teal/90 text-white"
                >
                  {bulkUpdateMutation.isPending ? "Updating..." : "Update Products"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}