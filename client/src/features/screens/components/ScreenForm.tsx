import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import insectMatrix from "../data/insect_matrix.json";
import solarMatrix from "../data/solar_matrix.json";
import vinylMatrix from "../data/vinyl_matrix.json";
import { priceScreen, Matrix } from "../pricing/lookup";
import { PriceTile } from "./PriceTile";

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
  
  // Select the appropriate matrix based on type
  const matrixMap: Record<string, Matrix> = {
    INSECT: insectMatrix as Matrix,
    SOLAR: solarMatrix as Matrix,
    VINYL: vinylMatrix as Matrix,
  };
  
  const matrix = matrixMap[vals.type] || (insectMatrix as Matrix);

  const computed = (() => {
    try {
      if (vals.heightIn > matrix.meta.heightMax) return null;
      return priceScreen(matrix, vals.widthIn, vals.heightIn, {
        remotesQty: vals.remotesQty,
        uChannelLf: vals.uChannelLf,
        colorNonStandard: vals.colorNonStandard,
        fabricKey: vals.fabricKey
      });
    } catch {
      return null;
    }
  })();

  const onSubmit = (v: FormVals) => {
    if (!computed) return;
    const { total, housing, notes } = computed;
    props.onAdd({
      description: `${v.type} Screen ${v.widthIn}" x ${v.heightIn}" (${housing.housing}/${housing.roller})`,
      quantity: 1,
      unitPrice: total,
      markupType: "percentage",
      markupValue: 0,
      discountType: "percentage",
      discountValue: 0,
      isTaxable: true,
      configData: { 
        screenType: v.type,
        dimensions: { width: v.widthIn, height: v.heightIn },
        housing, 
        remotes: v.remotesQty,
        uChannelLf: v.uChannelLf,
        colorNonStandard: v.colorNonStandard,
        notes 
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
          className="rounded-xl bg-black dark:bg-white text-white dark:text-black px-4 py-2 hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
          data-testid="button-add-to-quote"
        >
          Add to Quote
        </button>
      </div>

      <div>
        <div className="mb-4 text-sm text-gray-600 dark:text-gray-400">
          Max height enforced: <b>{matrix.meta.heightMax}"</b>
        </div>
        <div className="mb-4">
          {computed ? null : (
            <div className="text-sm text-orange-700 bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 p-2 rounded-lg" data-testid="alert-invalid-dimensions">
              Enter valid dimensions to see price
            </div>
          )}
        </div>
        <div>
          <PriceTile
            total={computed ? computed.total : null}
            housing={computed?.housing}
            notes={computed?.notes}
          />
        </div>
      </div>
    </form>
  );
}
