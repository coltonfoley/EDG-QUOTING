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
import { Plus, Package, Edit, Trash2, Search, Grid, List, Filter, X, Settings, Camera, FileText, Image } from "lucide-react";
import { DimensionalPricingManager } from "@/components/dimensional-pricing-manager";
import { ImageUploader, type UploadedImage } from "@/components/image-uploader";
import { formatCurrency } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertProductSchema, type Product, type ProductWithDetails, type ProductImage } from "@shared/schema";
import { z } from "zod";

const productFormSchema = insertProductSchema;
type ProductFormData = z.infer<typeof productFormSchema>;

export default function Products() {
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
      imageType,
      displayOrder: index,
    }));
  };

  const handleSubmit = (data: ProductFormData) => {
    // Process image data
    const processedData = {
      ...data,
      primaryImage: primaryImage.length > 0 ? primaryImage[0].url || primaryImage[0].preview : undefined,
      galleryImages: galleryImages.length > 0 ? convertUploadedImagesToProductImages(galleryImages, 'gallery') : undefined,
      specificationSheets: specificationSheets.length > 0 ? convertUploadedImagesToProductImages(specificationSheets, 'specification') : undefined,
    };
    
    if (editingProduct) {
      updateProductMutation.mutate({ id: editingProduct.id, data: processedData });
    } else {
      createProductMutation.mutate(processedData);
    }
  };

  const convertProductImagesToUploaded = (images: ProductImage[] | null | undefined, imageType: 'primary' | 'gallery' | 'specification'): UploadedImage[] => {
    if (!images || !Array.isArray(images)) return [];
    
    return images.map((img, index) => ({
      id: `existing-${imageType}-${index}`,
      file: new File([], img.filename, { type: 'image/jpeg' }), // Mock file for existing images
      preview: img.url,
      uploadProgress: 100,
      uploaded: true,
      url: img.url,
      metadata: {
        url: img.url,
        filename: img.filename,
        caption: img.caption,
        altText: img.altText,
        uploadedAt: img.uploadedAt,
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

  // Get unique categories and filter/search products
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
                <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
                  <Tabs defaultValue="basic" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="basic" className="flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        Basic Info
                      </TabsTrigger>
                      <TabsTrigger value="images" className="flex items-center gap-2">
                        <Camera className="h-4 w-4" />
                        Images & Media
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
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Category</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ""} placeholder="e.g. Concrete, Framing, Electrical" />
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

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Only show unit price for simple products */}
                    {form.watch("productType") !== "configurable" && (
                      <FormField
                        control={form.control}
                        name="defaultUnitPrice"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Unit Price</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.01" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
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
                    <FormField
                      control={form.control}
                      name="defaultMarkupValue"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Default Markup</FormLabel>
                          <div className="flex space-x-1">
                            <FormControl>
                              <Input type="number" step="0.01" {...field} className="flex-1" />
                            </FormControl>
                            <FormField
                              control={form.control}
                              name="defaultMarkupType"
                              render={({ field: markupField }) => (
                                <Select onValueChange={markupField.onChange} defaultValue={markupField.value}>
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
                          <FormLabel>Manufacturer Discount</FormLabel>
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
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                    </TabsContent>
                    
                    <TabsContent value="images" className="space-y-6 mt-4">
                      <div className="space-y-6">
                        {/* Primary Image */}
                        <ImageUploader
                          imageType="product"
                          title="Primary Product Image"
                          description="Main product photo that represents this item in catalogs and line items"
                          maxFiles={1}
                          onImagesChange={setPrimaryImage}
                          initialImages={primaryImage}
                          categoryOptions={[
                            { value: 'primary', label: 'Primary Image' }
                          ]}
                          data-testid="primary-image-uploader"
                        />
                        
                        {/* Gallery Images */}
                        <ImageUploader
                          imageType="product"
                          title="Product Gallery"
                          description="Additional product photos showcasing different angles, features, or configurations"
                          maxFiles={10}
                          onImagesChange={setGalleryImages}
                          initialImages={galleryImages}
                          categoryOptions={[
                            { value: 'gallery', label: 'Gallery Image' }
                          ]}
                          data-testid="gallery-images-uploader"
                        />
                        
                        {/* Specification Sheets */}
                        <ImageUploader
                          imageType="product"
                          title="Technical Specifications"
                          description="Technical drawings, specification sheets, installation guides, or other technical documentation"
                          maxFiles={5}
                          allowedTypes={['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']}
                          onImagesChange={setSpecificationSheets}
                          initialImages={specificationSheets}
                          categoryOptions={[
                            { value: 'specification', label: 'Technical Document' }
                          ]}
                          data-testid="specification-sheets-uploader"
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
                    >
                      {editingProduct ? "Update" : "Create"} Product
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
        {(searchTerm || selectedCategory !== "all") && (
          <div className="flex gap-2 mb-4">
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