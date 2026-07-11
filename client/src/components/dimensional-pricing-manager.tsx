import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Plus, Edit, Trash2, DollarSign, Upload, TrendingDown, RefreshCw } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertPricingTableSchema, type PricingTable, type Product } from "@shared/schema";
import { z } from "zod";
import { formatCurrency } from "@/lib/utils";
import { PricingTableUploader } from "./pricing-table-uploader";

const pricingFormSchema = insertPricingTableSchema.omit({ productId: true });
type PricingFormData = z.infer<typeof pricingFormSchema>;

// Helper function to calculate discounted price
function calculateDiscountedPrice(retailPrice: string, discountType: string, discountValue: string): string {
  const retail = parseFloat(retailPrice) || 0;
  const discount = parseFloat(discountValue) || 0;
  
  if (discountType === 'percentage') {
    return (retail * (1 - discount / 100)).toFixed(2);
  } else {
    return Math.max(0, retail - discount).toFixed(2);
  }
}

// Helper function to calculate discount percentage
function calculateDiscountPercentage(retailPrice: number, costPrice: number): number {
  if (retailPrice === 0) return 0;
  return ((retailPrice - costPrice) / retailPrice) * 100;
}

function storedInchesToFeet(value: string): string {
  const inches = Number(value);
  return Number.isFinite(inches) ? (inches / 12).toFixed(2) : value;
}

interface DimensionalPricingManagerProps {
  productId: number;
  productName: string;
}

export function DimensionalPricingManager({ productId, productName }: DimensionalPricingManagerProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [isRecalculateDialogOpen, setIsRecalculateDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<PricingTable | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch product details to get discount information
  const { data: product } = useQuery<Product>({
    queryKey: ["/api/products", productId],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/products/${productId}`);
      return response.json();
    },
  });

  const { data: pricingTables, isLoading } = useQuery<PricingTable[]>({
    queryKey: ["/api/products", productId, "pricing-tables"],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/products/${productId}/pricing-tables`);
      return response.json();
    },
  });

  const form = useForm<PricingFormData>({
    resolver: zodResolver(pricingFormSchema),
    defaultValues: {
      lengthMin: "",
      lengthMax: "",
      widthMin: "",
      widthMax: "",
      retailPrice: "",
      basePrice: "",
    },
  });

  // Watch retail price for auto-calculation
  const retailPrice = useWatch({ control: form.control, name: "retailPrice" });
  
  // Auto-calculate base price when retail price changes
  useEffect(() => {
    if (retailPrice && product && !editingEntry) {
      const calculatedBasePrice = calculateDiscountedPrice(
        retailPrice,
        product.defaultDiscountType,
        product.defaultDiscountValue
      );
      form.setValue("basePrice", calculatedBasePrice);
    }
  }, [retailPrice, product, form, editingEntry]);

  const createPricingMutation = useMutation({
    mutationFn: async (data: PricingFormData) => {
      const response = await apiRequest("POST", `/api/products/${productId}/pricing-tables`, { ...data, sourceUnit: "feet" });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products", productId, "pricing-tables"] });
      setIsDialogOpen(false);
      form.reset();
      toast({ title: "Pricing entry created successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Pricing entry rejected", description: error?.message || "Failed to create pricing entry", variant: "destructive" });
    },
  });

  const updatePricingMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: PricingFormData }) => {
      const response = await apiRequest("PUT", `/api/pricing-tables/${id}`, { ...data, sourceUnit: "feet" });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products", productId, "pricing-tables"] });
      setIsDialogOpen(false);
      setEditingEntry(null);
      form.reset();
      toast({ title: "Pricing entry updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Pricing entry rejected", description: error?.message || "Failed to update pricing entry", variant: "destructive" });
    },
  });

  const deletePricingMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/pricing-tables/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products", productId, "pricing-tables"] });
      toast({ title: "Pricing entry deleted successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete pricing entry", variant: "destructive" });
    },
  });

  const recalculatePricingMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/products/${productId}/recalculate-pricing`);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/products", productId, "pricing-tables"] });
      setIsRecalculateDialogOpen(false);
      toast({
        title: "Pricing recalculated successfully",
        description: `Updated ${data.updated} pricing entries with current discount rates`
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to recalculate pricing entries", variant: "destructive" });
    },
  });

  const handleSubmit = (data: PricingFormData) => {
    if (editingEntry) {
      updatePricingMutation.mutate({ id: editingEntry.id, data });
    } else {
      createPricingMutation.mutate(data);
    }
  };

  const handleEdit = (entry: PricingTable) => {
    setEditingEntry(entry);
    form.reset({
      lengthMin: storedInchesToFeet(entry.lengthMin),
      lengthMax: storedInchesToFeet(entry.lengthMax),
      widthMin: storedInchesToFeet(entry.widthMin),
      widthMax: storedInchesToFeet(entry.widthMax),
      retailPrice: entry.retailPrice,
      basePrice: entry.basePrice,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this pricing entry?")) {
      deletePricingMutation.mutate(id);
    }
  };

  const handleNewEntry = () => {
    setEditingEntry(null);
    form.reset();
    setIsDialogOpen(true);
  };

  if (isLoading) {
    return <div className="text-center py-4">Loading pricing tables...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Dimensional Pricing Table</h3>
          <p className="text-sm text-gray-600">
            Configure Manufacturer MSRP and EDG Cost for {productName} based on length and width dimensions
          </p>
          {product && (
            <p className="text-xs text-blue-600 mt-1">
	              Supplier discount: {product.defaultDiscountType === 'percentage' ? `${product.defaultDiscountValue}%` : `$${product.defaultDiscountValue}`} off Manufacturer MSRP
            </p>
          )}
        </div>
        <div className="flex space-x-3">
          <AlertDialog open={isRecalculateDialogOpen} onOpenChange={setIsRecalculateDialogOpen}>
            <AlertDialogTrigger asChild>
              <Button 
                variant="outline" 
                className="border-orange-500 text-orange-600 hover:bg-orange-500 hover:text-white"
                data-testid="button-recalculate-costs"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Recalculate EDG Costs
                {product && (
                  <span className="ml-2 text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded">
                    {product.defaultDiscountType === 'percentage' ? `${product.defaultDiscountValue}%` : `$${product.defaultDiscountValue}`}
                  </span>
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
		                <AlertDialogTitle>Recalculate All EDG Costs?</AlertDialogTitle>
                <AlertDialogDescription className="space-y-2">
                  <p>
	                    This will update all EDG costs in the pricing table based on the current supplier discount settings.
                  </p>
                  {product && (
                    <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                      <div className="flex items-center space-x-2 text-sm">
                        <TrendingDown className="h-4 w-4 text-orange-600" />
                        <span className="font-medium text-orange-900">
	                          Current supplier discount: {product.defaultDiscountType === 'percentage' ? `${product.defaultDiscountValue}%` : `$${product.defaultDiscountValue}`} off Manufacturer MSRP
                        </span>
                      </div>
                      <p className="text-xs text-orange-700 mt-1">
	                        All EDG costs will be recalculated using this discount rate
                      </p>
                    </div>
                  )}
                  <p className="text-sm font-medium text-gray-900">
                    {pricingTables?.length || 0} pricing entries will be updated.
                  </p>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="button-cancel-recalculate">
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => recalculatePricingMutation.mutate()}
                  disabled={recalculatePricingMutation.isPending}
                  className="bg-orange-600 hover:bg-orange-700"
                  data-testid="button-confirm-recalculate"
                >
                  {recalculatePricingMutation.isPending ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Recalculating...
                    </>
                  ) : (
                    'Recalculate All'
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="border-edg-teal text-edg-teal hover:bg-edg-teal hover:text-white">
                <Upload className="mr-2 h-4 w-4" />
                Upload CSV
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Bulk Upload Pricing Data</DialogTitle>
              </DialogHeader>
              <PricingTableUploader 
                productId={productId} 
                onUploadComplete={() => setIsUploadDialogOpen(false)}
              />
            </DialogContent>
          </Dialog>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={handleNewEntry} className="bg-edg-black hover:bg-edg-grey text-white">
                <Plus className="mr-2 h-4 w-4" />
                Add Pricing Entry
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingEntry ? "Edit Pricing Entry" : "Add New Pricing Entry"}
              </DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="lengthMin"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Length Min (ft)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.1" placeholder="12.0" {...field} />
                          </FormControl>
                          {field.value && !isNaN(parseFloat(field.value)) && (
                            <p className="text-xs text-gray-500 mt-1">
                              {(parseFloat(field.value) * 304.8).toFixed(0)}mm
                            </p>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="lengthMax"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Length Max (ft)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.1" placeholder="12.5" {...field} />
                          </FormControl>
                          {field.value && !isNaN(parseFloat(field.value)) && (
                            <p className="text-xs text-gray-500 mt-1">
                              {(parseFloat(field.value) * 304.8).toFixed(0)}mm
                            </p>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="widthMin"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Width Min (ft)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.1" placeholder="8.0" {...field} />
                          </FormControl>
                          {field.value && !isNaN(parseFloat(field.value)) && (
                            <p className="text-xs text-gray-500 mt-1">
                              {(parseFloat(field.value) * 304.8).toFixed(0)}mm
                            </p>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="widthMax"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Width Max (ft)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.1" placeholder="8.5" {...field} />
                          </FormControl>
                          {field.value && !isNaN(parseFloat(field.value)) && (
                            <p className="text-xs text-gray-500 mt-1">
                              {(parseFloat(field.value) * 304.8).toFixed(0)}mm
                            </p>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="retailPrice"
                    render={({ field }) => (
                      <FormItem>
	                        <FormLabel>Manufacturer MSRP ($)</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            step="0.01" 
                            placeholder="4500.00" 
                            {...field}
                            data-testid="input-retail-price" 
                          />
                        </FormControl>
	                        <p className="text-xs text-gray-500">Supplier list price for this size band</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {product && retailPrice && (
                    <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <div className="flex items-center space-x-2 text-sm">
                        <TrendingDown className="h-4 w-4 text-blue-600" />
                        <span className="font-medium text-blue-900">
	                          Supplier discount: {product.defaultDiscountType === 'percentage' ? `${product.defaultDiscountValue}%` : `$${product.defaultDiscountValue}`}
                        </span>
                      </div>
                      <p className="text-xs text-blue-700 mt-1">
	                        EDG Cost will be calculated automatically from the product supplier discount
                      </p>
                    </div>
                  )}
                  <FormField
                    control={form.control}
                    name="basePrice"
                    render={({ field }) => (
                      <FormItem>
	                        <FormLabel>EDG Cost ($)</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            step="0.01" 
                            placeholder="2500.00" 
                            {...field}
                            readOnly={!editingEntry}
                            className={!editingEntry ? "bg-gray-50 text-gray-700" : ""}
                            data-testid="input-cost-price"
                          />
                        </FormControl>
                        <p className="text-xs text-gray-500">
	                          {!editingEntry ? "Automatically calculated from Manufacturer MSRP" : "EDG cost after supplier discount"}
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="flex justify-end space-x-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="bg-edg-black hover:bg-edg-grey text-white"
                    disabled={createPricingMutation.isPending || updatePricingMutation.isPending}
                  >
                    {editingEntry ? "Update" : "Add"} Entry
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {!pricingTables || pricingTables.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <DollarSign className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h4 className="text-lg font-medium text-gray-900 mb-2">No pricing entries yet</h4>
          <p className="text-gray-500 mb-4">Add dimensional pricing entries to configure this product.</p>
          <Button onClick={handleNewEntry} variant="outline">
            <Plus className="mr-2 h-4 w-4" />
            Add First Entry
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Length Range (ft)</TableHead>
                <TableHead>Width Range (ft)</TableHead>
                <TableHead>Size Band</TableHead>
	                <TableHead>Manufacturer MSRP</TableHead>
                <TableHead>Discount</TableHead>
	                <TableHead>EDG Cost</TableHead>
                <TableHead className="w-20">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pricingTables.map((entry) => {
                const retailPrice = parseFloat(entry.retailPrice);
                const costPrice = parseFloat(entry.basePrice);
                const discountPercent = calculateDiscountPercentage(retailPrice, costPrice);
                const discountAmount = retailPrice - costPrice;
                
                return (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium">{storedInchesToFeet(entry.lengthMin)} - {storedInchesToFeet(entry.lengthMax)}</TableCell>
                    <TableCell>{storedInchesToFeet(entry.widthMin)} - {storedInchesToFeet(entry.widthMax)}</TableCell>
                    <TableCell className="text-gray-600">
                      {storedInchesToFeet(entry.lengthMin)}-{storedInchesToFeet(entry.lengthMax)} × {storedInchesToFeet(entry.widthMin)}-{storedInchesToFeet(entry.widthMax)} ft
                    </TableCell>
                    <TableCell className="font-semibold" data-testid={`text-retail-price-${entry.id}`}>
                      {formatCurrency(retailPrice)}
                    </TableCell>
                    <TableCell className="text-green-600">
                      <div className="flex flex-col">
                        <span className="font-medium" data-testid={`text-discount-${entry.id}`}>
                          {discountPercent.toFixed(1)}%
                        </span>
                        <span className="text-xs text-gray-500">
                          -{formatCurrency(discountAmount)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="font-semibold text-blue-600" data-testid={`text-cost-price-${entry.id}`}>
                      {formatCurrency(costPrice)}
                    </TableCell>
                    <TableCell>
                      <div className="flex space-x-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleEdit(entry)}
                          data-testid={`button-edit-${entry.id}`}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(entry.id)}
                          className="text-red-600 hover:text-red-800"
                          data-testid={`button-delete-${entry.id}`}
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
        </div>
      )}
    </div>
  );
}
