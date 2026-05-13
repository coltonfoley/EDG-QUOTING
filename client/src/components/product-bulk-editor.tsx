import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, CheckCircle2, Package, Settings } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Product } from "@shared/schema";
import { getProductPricingBreakdown } from "@shared/pricing";

const PRODUCTS_PER_PAGE = 50;

const bulkUpdateSchema = z.object({
  manufacturer: z.string().optional(),
  retailPrice: z.string().optional(),
  costPrice: z.string().optional(),
  defaultDiscountType: z.enum(["percentage", "dollar"]).optional(),
  defaultDiscountValue: z.string().optional(),
  unit: z.string().optional(),
});

type BulkUpdateData = z.infer<typeof bulkUpdateSchema>;

export function ProductBulkEditor() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedProducts, setSelectedProducts] = useState<number[]>([]);
  const [showBulkEditForm, setShowBulkEditForm] = useState(false);
  const [selectedManufacturer, setSelectedManufacturer] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [discountFilter, setDiscountFilter] = useState<string>("all");
  const [productPage, setProductPage] = useState(0);

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ["/api/products", { limit: 10000 }],
    queryFn: async () => {
      const res = await fetch("/api/products?limit=10000", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch products");
      return res.json();
    },
  });

  const manufacturers = useMemo(() => {
    const uniqueManufacturers = Array.from(new Set(
      products.map(p => p.manufacturer || "Unspecified")
    ));
    return uniqueManufacturers.sort();
  }, [products]);

  const getDiscountInfo = (product: Product) => {
    const pricing = getProductPricingBreakdown(product);
    const hasDiscount = pricing.supplierDiscountAmount > 0;
    const discountLabel = hasDiscount
      ? `$${pricing.supplierDiscountAmount.toFixed(2)} (${pricing.supplierDiscountPercent.toFixed(1)}%)`
      : "";

    return {
      hasDiscount,
      edgCost: pricing.edgCost,
      discountLabel,
      manufacturerMsrp: pricing.manufacturerMsrp,
    };
  };

  const manufacturerFilteredProducts = useMemo(() => {
    if (selectedManufacturer === "all") return products;
    return products.filter(p => (p.manufacturer || "Unspecified") === selectedManufacturer);
  }, [products, selectedManufacturer]);

  const productStats = useMemo(() => {
    const withDiscount = manufacturerFilteredProducts.filter(p => getProductPricingBreakdown(p).supplierDiscountAmount > 0).length;
    return {
      total: manufacturerFilteredProducts.length,
      withDiscount,
      withoutDiscount: manufacturerFilteredProducts.length - withDiscount,
    };
  }, [manufacturerFilteredProducts]);

  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      const productManufacturer = product.manufacturer || "Unspecified";
      const matchesManufacturer = selectedManufacturer === "all" || productManufacturer === selectedManufacturer;
      const matchesSearch = searchTerm === "" ||
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (product.sku || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (product.description || "").toLowerCase().includes(searchTerm.toLowerCase());
      const discountVal = getProductPricingBreakdown(product).supplierDiscountAmount;
      const matchesDiscount = discountFilter === "all" ||
        (discountFilter === "with" && discountVal > 0) ||
        (discountFilter === "without" && discountVal === 0);

      return matchesManufacturer && matchesSearch && matchesDiscount;
    });
  }, [products, selectedManufacturer, searchTerm, discountFilter]);

  const totalPages = Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE);
  const paginatedProducts = filteredProducts.slice(
    productPage * PRODUCTS_PER_PAGE,
    (productPage + 1) * PRODUCTS_PER_PAGE
  );

  useEffect(() => {
    setProductPage(0);
  }, [selectedManufacturer, searchTerm, discountFilter]);

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

  const bulkUpdateMutation = useMutation({
    mutationFn: async (data: BulkUpdateData) => {
      const updates = Object.fromEntries(
        Object.entries(data).filter(([, value]) => value !== undefined && value !== "")
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
      const errorMessage = error.errors
        ? error.errors.map((e: any) => e.message).join(", ")
        : error.message || "Failed to update products";

      toast({
        title: "Update failed",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const handleSelectAll = (checked: boolean) => {
    setSelectedProducts(checked ? filteredProducts.map(p => p.id) : []);
  };

  const handleSelectProduct = (productId: number, checked: boolean) => {
    if (checked) {
      setSelectedProducts(prev => [...prev, productId]);
    } else {
      setSelectedProducts(prev => prev.filter(id => id !== productId));
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
      <div className="flex items-center justify-between gap-4">
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
            data-testid="button-bulk-edit-products"
          >
            <Settings className="h-4 w-4 mr-2" />
            Edit {selectedProducts.length} Products
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <button
          type="button"
          className={`p-3 rounded-lg border text-left transition-colors ${discountFilter === "all" ? "bg-gray-100 border-gray-400" : "bg-white border-gray-200 hover:bg-gray-50"}`}
          onClick={() => setDiscountFilter("all")}
        >
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">
              {selectedManufacturer === "all" ? "All Products" : selectedManufacturer}
            </span>
          </div>
          <p className="text-2xl font-bold mt-1">{productStats.total}</p>
        </button>
        <button
          type="button"
          className={`p-3 rounded-lg border text-left transition-colors ${discountFilter === "with" ? "bg-emerald-50 border-emerald-400" : "bg-white border-gray-200 hover:bg-emerald-50/50"}`}
          onClick={() => setDiscountFilter("with")}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span className="text-sm font-medium text-emerald-700">Supplier Discount Set</span>
          </div>
          <p className="text-2xl font-bold mt-1 text-emerald-700">{productStats.withDiscount}</p>
        </button>
        <button
          type="button"
          className={`p-3 rounded-lg border text-left transition-colors ${discountFilter === "without" ? "bg-amber-50 border-amber-400" : "bg-white border-gray-200 hover:bg-amber-50/50"}`}
          onClick={() => setDiscountFilter("without")}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span className="text-sm font-medium text-amber-700">No Supplier Discount</span>
          </div>
          <p className="text-2xl font-bold mt-1 text-amber-700">{productStats.withoutDiscount}</p>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 rounded-lg bg-gray-50 p-4 md:grid-cols-2">
        <div>
          <Label htmlFor="manufacturer-filter" data-testid="label-manufacturer-filter">Filter by Manufacturer</Label>
          <Select value={selectedManufacturer} onValueChange={setSelectedManufacturer}>
            <SelectTrigger id="manufacturer-filter" data-testid="select-manufacturer-filter">
              <SelectValue placeholder="Select manufacturer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" data-testid="option-all-manufacturers">All Manufacturers</SelectItem>
              {manufacturers.map((manufacturer) => (
                <SelectItem key={manufacturer} value={manufacturer} data-testid={`option-manufacturer-${manufacturer.replace(/\s+/g, "-").toLowerCase()}`}>
                  {manufacturer}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="search-products" data-testid="label-search-products">Search Products</Label>
          <Input
            id="search-products"
            data-testid="input-search-products"
            type="text"
            placeholder="Search by name, SKU, or description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {filteredProducts.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Package className="h-16 w-16 mx-auto mb-4 text-gray-300" />
          <p>No products found matching your criteria.</p>
          <p className="text-sm">Try adjusting your filters or importing products first.</p>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <input
                      type="checkbox"
                      checked={selectedProducts.length === filteredProducts.length && filteredProducts.length > 0}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="rounded border-gray-300"
                      data-testid="checkbox-select-all-products"
                      title={`Select all ${filteredProducts.length} filtered products`}
                    />
                  </TableHead>
                  <TableHead>Product Name</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead data-testid="header-manufacturer">Manufacturer</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">Manufacturer MSRP</TableHead>
                  <TableHead className="text-center">Supplier Discount</TableHead>
                  <TableHead className="text-right">EDG Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedProducts.map((product) => {
                  const info = getDiscountInfo(product);
                  return (
                    <TableRow key={product.id} className={!info.hasDiscount ? "bg-amber-50/50" : ""}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedProducts.includes(product.id)}
                          onChange={(e) => handleSelectProduct(product.id, e.target.checked)}
                          className="rounded border-gray-300"
                        />
                      </TableCell>
                      <TableCell className="font-medium" data-testid={`text-product-name-${product.id}`}>{product.name}</TableCell>
                      <TableCell>
                        {product.sku ? (
                          <Badge variant="outline" data-testid={`text-product-sku-${product.id}`}>{product.sku}</Badge>
                        ) : (
                          <span className="text-sm text-gray-400">None</span>
                        )}
                      </TableCell>
                      <TableCell data-testid={`text-manufacturer-${product.id}`}>{product.manufacturer || "Unspecified"}</TableCell>
                      <TableCell>{product.unit}</TableCell>
                      <TableCell className="text-right text-gray-500">
                        ${info.manufacturerMsrp.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-center">
                        {info.hasDiscount ? (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                            {info.discountLabel} off
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200">
                            None
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {info.hasDiscount ? (
                          <span className="text-emerald-700">${info.edgCost.toFixed(2)}</span>
                        ) : (
                          <span className="text-amber-600">${info.edgCost.toFixed(2)}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-sm text-gray-500">
                Showing {productPage * PRODUCTS_PER_PAGE + 1} - {Math.min((productPage + 1) * PRODUCTS_PER_PAGE, filteredProducts.length)} of {filteredProducts.length}
                {selectedProducts.length > 0 && (
                  <span className="ml-2 font-medium text-teal-700">({selectedProducts.length} selected)</span>
                )}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setProductPage(p => Math.max(0, p - 1))}
                  disabled={productPage === 0}
                >
                  Previous
                </Button>
                <span className="text-sm self-center text-gray-600">
                  Page {productPage + 1} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setProductPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={productPage >= totalPages - 1}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <Dialog open={showBulkEditForm} onOpenChange={setShowBulkEditForm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bulk Edit Products</DialogTitle>
            <p className="text-sm text-gray-600">
              Update {selectedProducts.length} selected products. Leave fields blank to keep current values.
            </p>
          </DialogHeader>
          <Form {...bulkUpdateForm}>
            <form onSubmit={bulkUpdateForm.handleSubmit(handleBulkUpdate)} className="space-y-4">
              <FormField
                control={bulkUpdateForm.control}
                name="manufacturer"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel data-testid="label-manufacturer-bulk">Manufacturer</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Leave blank to keep current" data-testid="input-manufacturer-bulk" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={bulkUpdateForm.control}
                name="retailPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Manufacturer MSRP</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" step="0.01" placeholder="Leave blank to keep current" />
                    </FormControl>
                    <p className="text-xs text-gray-500">Optional supplier list price before EDG discount</p>
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
                      <Input {...field} type="number" step="0.01" placeholder="Leave blank to keep current" />
                    </FormControl>
                    <p className="text-xs text-gray-500">Internal cost basis for future quote lines</p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={bulkUpdateForm.control}
                  name="defaultDiscountType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Supplier Discount Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
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
                        <Input {...field} placeholder="e.g., 20" />
                      </FormControl>
                      <p className="text-xs text-gray-500">Advanced: discount off Manufacturer MSRP</p>
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
                      <Input {...field} placeholder="e.g., each, sq ft, linear ft" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowBulkEditForm(false)}
                >
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
