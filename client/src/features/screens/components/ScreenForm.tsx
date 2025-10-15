import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { PriceTile } from "./PriceTile";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useEffect, useState } from "react";

const schema = z.object({
  type: z.enum(["INSECT","SOLAR","VINYL"]).default("INSECT"),
  widthIn: z.coerce.number().min(24).max(240),
  heightIn: z.coerce.number().min(24).max(192),
  remotesQty: z.coerce.number().min(0).max(10).default(1),
  uChannelLf: z.coerce.number().min(0).max(1000).default(0),
  colorNonStandard: z.boolean().default(false),
  fabricKey: z.string().optional()
});

type FormVals = z.infer<typeof schema>;

type ScreenFormProps = {
  onAdd: (payload: any) => void;
};

export default function ScreenForm(props: ScreenFormProps) {
  const { register, watch, handleSubmit, formState: { errors } } = useForm<FormVals>({
    resolver: zodResolver(schema),
    defaultValues: { type: "INSECT", widthIn: 72, heightIn: 84, remotesQty: 1, uChannelLf: 0, colorNonStandard: false }
  });

  const vals = watch();
  const [priceData, setPriceData] = useState<any>(null);
  
  // Fetch screen products from database
  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ['/api/products'],
    select: (data: any[]) => data.filter(p => p.manufacturer === "Gaposa" && p.productType === "configurable")
  });

  // Map screen types to product IDs
  const productMap: Record<string, any> = {
    INSECT: products.find(p => p.name.includes("Insect")),
    SOLAR: products.find(p => p.name.includes("Solar")),
    VINYL: products.find(p => p.name.includes("Vinyl"))
  };

  const currentProduct = productMap[vals.type];

  // Calculate price when dimensions or options change
  useEffect(() => {
    if (!currentProduct) {
      setPriceData(null);
      return;
    }

    const calculatePrice = async () => {
      try {
        const response: any = await apiRequest('POST', '/api/screens/calculate-price', {
          productId: currentProduct.id,
          widthIn: vals.widthIn,
          heightIn: vals.heightIn,
          options: {
            remotesQty: vals.remotesQty,
            uChannelLf: vals.uChannelLf,
            colorNonStandard: vals.colorNonStandard,
            fabricKey: vals.fabricKey || ""
          }
        });
        
        // Find housing rule based on dimensions
        const housingRules = currentProduct.housingRules || [];
        let housingRule = null;
        if (housingRules.length > 0) {
          housingRule = housingRules.find((rule: any) => 
            vals.widthIn <= rule.maxW && vals.heightIn <= rule.maxH
          ) || housingRules[housingRules.length - 1];
        }

        setPriceData({
          ...response,
          housing: housingRule,
          total: response.totalPrice // Add legacy 'total' field for backward compatibility
        });
      } catch (error: any) {
        console.error("Error calculating price:", error);
        // Always show user-friendly error message, never set to null
        if (error?.message?.includes("No pricing found")) {
          setPriceData({ error: "No pricing available for these dimensions" });
        } else {
          setPriceData({ error: "Unable to calculate price. Please try different dimensions." });
        }
      }
    };

    calculatePrice();
  }, [currentProduct, vals.widthIn, vals.heightIn, vals.remotesQty, vals.uChannelLf, vals.colorNonStandard, vals.fabricKey]);

  const onSubmit = (v: FormVals) => {
    if (!priceData || !priceData.totalPrice) {
      // Show validation error if trying to submit without valid price
      return;
    }
    const { totalPrice, housing } = priceData;
    const housingDesc = housing ? `(${housing.housing}/${housing.roller})` : "";
    props.onAdd({
      description: `${v.type} Screen ${v.widthIn}" x ${v.heightIn}" ${housingDesc}`,
      quantity: "1",
      unitPrice: (totalPrice || 0).toString(),
      markupType: "percentage",
      markupValue: "0",
      discountType: "percentage",
      discountValue: "0",
      isTaxable: true,
      configData: { 
        screenType: v.type,
        dimensions: { width: v.widthIn, height: v.heightIn },
        housing, 
        remotes: v.remotesQty,
        uChannelLf: v.uChannelLf,
        colorNonStandard: v.colorNonStandard,
        productId: currentProduct?.id
      }
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid md:grid-cols-3 gap-6">
      <div className="md:col-span-2 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Type</label>
          <select 
            {...register("type")} 
            className="mt-1 w-full border rounded-lg p-2 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-700"
            data-testid="select-screen-type"
          >
            <option value="INSECT">Insect (Gaposa)</option>
            <option value="SOLAR">Solar (Gaposa)</option>
            <option value="VINYL">Vinyl Windows (Gaposa)</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Width (in)</label>
            <input 
              type="number" 
              {...register("widthIn")} 
              className="mt-1 w-full border rounded-lg p-2 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-700" 
              data-testid="input-width"
            />
            {errors.widthIn && <p className="text-xs text-red-600 mt-1">{errors.widthIn.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Height (in)</label>
            <input 
              type="number" 
              {...register("heightIn")} 
              className="mt-1 w-full border rounded-lg p-2 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-700" 
              data-testid="input-height"
            />
            {errors.heightIn && <p className="text-xs text-red-600 mt-1">{errors.heightIn.message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Remotes (qty)</label>
            <input 
              type="number" 
              {...register("remotesQty")} 
              className="mt-1 w-full border rounded-lg p-2 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-700" 
              data-testid="input-remotes"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">U-Channel (LF)</label>
            <input 
              type="number" 
              {...register("uChannelLf")} 
              className="mt-1 w-full border rounded-lg p-2 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-700" 
              data-testid="input-uchannel"
            />
          </div>
          <div className="flex items-end gap-2">
            <input 
              id="color" 
              type="checkbox" 
              {...register("colorNonStandard")} 
              className="h-4 w-4"
              data-testid="checkbox-color"
            />
            <label htmlFor="color" className="text-sm text-gray-700 dark:text-gray-300">Non-standard color</label>
          </div>
        </div>

        <button 
          type="submit" 
          disabled={!priceData || productsLoading || !priceData?.totalPrice || priceData?.error}
          className="rounded-xl bg-black dark:bg-white text-white dark:text-black px-4 py-2 hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="button-add-to-quote"
          title={priceData?.error ? priceData.error : undefined}
        >
          Add to Quote
        </button>
      </div>

      <div>
        <div className="mb-4 text-sm text-gray-600 dark:text-gray-400">
          {currentProduct && (
            <>Max height: <b>{currentProduct.maxLength}"</b></>
          )}
        </div>
        <div className="mb-4">
          {productsLoading ? (
            <div className="text-sm text-gray-600 dark:text-gray-400">Loading products...</div>
          ) : priceData?.error ? (
            <div className="text-sm text-red-700 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 p-2 rounded-lg" data-testid="alert-pricing-error">
              {priceData.error}
            </div>
          ) : !priceData ? (
            <div className="text-sm text-orange-700 bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 p-2 rounded-lg" data-testid="alert-invalid-dimensions">
              Enter valid dimensions to see price
            </div>
          ) : null}
        </div>
        <div>
          <PriceTile
            total={priceData?.total || priceData?.totalPrice || null}
            housing={priceData?.housing}
            notes={priceData && !priceData.error ? [`Base: $${priceData.basePrice}`, `Adders: $${priceData.adders?.total || 0}`] : undefined}
          />
        </div>
      </div>
    </form>
  );
}
