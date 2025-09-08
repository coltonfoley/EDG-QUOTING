import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Plus, Edit, Trash2, DollarSign } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertPricingTableSchema, type PricingTable } from "@shared/schema";
import { z } from "zod";
import { formatCurrency } from "@/lib/utils";

const pricingFormSchema = insertPricingTableSchema.omit({ productId: true });
type PricingFormData = z.infer<typeof pricingFormSchema>;

interface DimensionalPricingManagerProps {
  productId: number;
  productName: string;
}

export function DimensionalPricingManager({ productId, productName }: DimensionalPricingManagerProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<PricingTable | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
      length: "",
      width: "",
      basePrice: "",
    },
  });

  const createPricingMutation = useMutation({
    mutationFn: async (data: PricingFormData) => {
      const response = await apiRequest("POST", `/api/products/${productId}/pricing-tables`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products", productId, "pricing-tables"] });
      setIsDialogOpen(false);
      form.reset();
      toast({ title: "Pricing entry created successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create pricing entry", variant: "destructive" });
    },
  });

  const updatePricingMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: PricingFormData }) => {
      const response = await apiRequest("PUT", `/api/pricing-tables/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products", productId, "pricing-tables"] });
      setIsDialogOpen(false);
      setEditingEntry(null);
      form.reset();
      toast({ title: "Pricing entry updated successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update pricing entry", variant: "destructive" });
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
      length: entry.length,
      width: entry.width,
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
            Configure pricing for {productName} based on length and width dimensions
          </p>
        </div>
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
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="length"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Length (ft)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.1" placeholder="12.0" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="width"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Width (ft)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.1" placeholder="8.0" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="basePrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Base Price ($)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" placeholder="2500.00" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
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
                <TableHead>Length (ft)</TableHead>
                <TableHead>Width (ft)</TableHead>
                <TableHead>Dimensions</TableHead>
                <TableHead>Base Price</TableHead>
                <TableHead className="w-20">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pricingTables.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-medium">{entry.length}</TableCell>
                  <TableCell>{entry.width}</TableCell>
                  <TableCell className="text-gray-600">
                    {entry.length} × {entry.width} ft
                  </TableCell>
                  <TableCell className="font-semibold">
                    {formatCurrency(parseFloat(entry.basePrice))}
                  </TableCell>
                  <TableCell>
                    <div className="flex space-x-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleEdit(entry)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(entry.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}