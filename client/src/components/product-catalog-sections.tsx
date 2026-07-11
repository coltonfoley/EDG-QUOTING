import { AIProductImporter } from "@/components/ai-product-importer";
import { CSVProductImporter } from "@/components/csv-product-importer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency } from "@/lib/utils";
import { getProductPricingBreakdown } from "@shared/pricing";
import type { Product } from "@shared/schema";
import { Edit, FileSpreadsheet, FileText, Package, Settings, Sparkles, Trash2 } from "lucide-react";

interface ProductTableProps {
  products: Product[];
  onEdit: (product: Product) => void;
  onDelete: (id: number) => void;
  onManagePricing: (product: Product) => void;
  canManage: boolean;
  selectedProductIds: number[];
  onSelectProduct: (productId: number, checked: boolean) => void;
  onSelectAll: (checked: boolean) => void;
  allVisibleSelected: boolean;
  someVisibleSelected: boolean;
}

export function ProductImportWorkspace() {
  return (
    <Card>
      <CardHeader>
        <h1 className="flex items-center gap-2 text-2xl font-semibold leading-none tracking-tight">
          <Package className="h-5 w-5" />
          Product Import
        </h1>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="ai" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="ai" className="gap-2" data-testid="product-import-tab-ai">
              <Sparkles className="h-4 w-4" />
              AI Import
            </TabsTrigger>
            <TabsTrigger value="manual" className="gap-2" data-testid="product-import-tab-manual">
              <FileSpreadsheet className="h-4 w-4" />
              Manual CSV Import
            </TabsTrigger>
          </TabsList>
          <TabsContent value="ai">
            <AIProductImporter />
          </TabsContent>
          <TabsContent value="manual">
            <CSVProductImporter />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

export function ProductTable({
  products,
  onEdit,
  onDelete,
  onManagePricing,
  canManage,
  selectedProductIds,
  onSelectProduct,
  onSelectAll,
  allVisibleSelected,
  someVisibleSelected,
}: ProductTableProps) {
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              {canManage && (
                <TableHead className="w-12">
                  <Checkbox
                    checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                    onCheckedChange={(checked) => onSelectAll(checked === true)}
                    aria-label="Select all visible products"
                    data-testid="checkbox-select-all-products"
                  />
                </TableHead>
              )}
              <TableHead className="w-[80px]">Image</TableHead>
              <TableHead className="w-[280px]">Product Name</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Manufacturer</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead className="text-right">Manufacturer MSRP</TableHead>
              <TableHead className="text-right">EDG Cost</TableHead>
              {canManage && <TableHead className="w-[130px]">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((product) => {
              const galleryImages = product.galleryImages as any[] | null;
              const specificationSheets = product.specificationSheets as any[] | null;
              const primaryImageUrl = product.primaryImage ||
                (galleryImages && Array.isArray(galleryImages) && galleryImages.length > 0
                  ? (galleryImages[0] as any)?.url
                  : null);

              return (
                <TableRow key={product.id} className="hover:bg-gray-50">
                  {canManage && (
                    <TableCell>
                      <Checkbox
                        checked={selectedProductIds.includes(product.id)}
                        onCheckedChange={(checked) => onSelectProduct(product.id, checked === true)}
                        aria-label={`Select ${product.name}`}
                        data-testid={`checkbox-select-product-${product.id}`}
                      />
                    </TableCell>
                  )}
                  <TableCell>
                    <div className="relative w-12 h-12 rounded-md overflow-hidden bg-gray-100 flex-shrink-0">
                      {primaryImageUrl ? (
                        <img
                          src={primaryImageUrl}
                          alt={product.name}
                          className="w-full h-full object-cover"
                          onError={(event) => {
                            event.currentTarget.style.display = "none";
                            event.currentTarget.parentElement?.classList.add("flex", "items-center", "justify-center");
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="h-6 w-6 text-gray-400" />
                        </div>
                      )}

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
                        <div className="text-sm text-muted-foreground truncate max-w-xs">
                          {product.description}
                        </div>
                      )}
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
                      <span className="text-sm text-muted-foreground">None</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" data-testid={`text-manufacturer-${product.id}`}>
                      {product.manufacturer || "Unknown"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {product.category ? (
                      <span className="text-sm text-muted-foreground">{product.category}</span>
                    ) : (
                      <span className="text-sm text-muted-foreground">Uncategorized</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={product.productType === "configurable" ? "default" : "secondary"}>
                      {product.productType === "configurable" ? "Dimensional" : "Simple"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{product.unit}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {product.productType === "configurable" ? (
                      <span className="text-sm text-muted-foreground">Dimensional</span>
                    ) : formatCurrency(getProductPricingBreakdown(product).manufacturerMsrp)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {product.productType === "configurable" ? (
                      <span className="text-sm text-muted-foreground">Dimensional</span>
                    ) : formatCurrency(getProductPricingBreakdown(product).edgCost)}
                  </TableCell>
                  {canManage && (
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
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
