import { z } from "zod";

import { SUNDANCE_SERVICES } from "./sundanceServices";

// Integration mirror of edg-dealer-portal/src/products/sundance/options.ts.
// Strict nested objects prevent unrecognized requested work from being dropped.
const frameSides = ["B1", "B2", "B3", "B4"] as const;
const sideSchema = z.enum(frameSides);
const screenFinishes = ["White", "Ivory", "Beige", "Silver Pearl", "Bronze", "Night Sky", "Dark Gray"] as const;

const screenOpeningSchema = z.object({
  side: sideSchema,
  widthInches: z.number().finite().min(12).max(600).optional(),
  heightInches: z.number().finite().min(12).max(240).optional(),
  purpose: z.enum(["solar", "insect", "privacy", "weather"]).default("solar"),
  mount: z.enum(["under-header", "face", "review"]).default("review"),
  finish: z.enum(["standard", "match-frame", "custom-ral"]).default("match-frame"),
  standardColor: z.enum(screenFinishes).optional(),
  ralCode: z.string().trim().max(40).optional(),
}).strict();

export const sundancePortalOptionsSchema = z.object({
  lighting: z.object({
    mode: z.enum(["rgb", "warm-white"]),
    sides: z.array(sideSchema).min(1).max(4)
      .refine((sides) => new Set(sides).size === sides.length, "Select each lit side once."),
  }).strict().optional(),
  service: z.enum(["drawings", "engineering", "drawings-and-engineering"]).optional(),
  cantilever: z.object({
    b3EndOverhangInches: z.number().finite().min(0).max(36),
    b4EndOverhangInches: z.number().finite().min(0).max(36),
  }).strict().optional(),
  screens: z.array(screenOpeningSchema).max(4)
    .refine((openings) => new Set(openings.map((opening) => opening.side)).size === openings.length, "Request each screen opening once.").optional(),
}).strict();

export type SundancePortalOptions = z.infer<typeof sundancePortalOptionsSchema>;

export function summarizeSundancePortalOptions(options: SundancePortalOptions | undefined): string[] {
  if (!options) return [];
  const summary: string[] = [];
  if (options.lighting) {
    summary.push(`${options.lighting.mode === "rgb" ? "RGB" : "Warm-white"} lighting requested on ${options.lighting.sides.join(", ")}; EDG confirms installed lengths, controls, power and pricing.`);
  }
  if (options.service) {
    const service = SUNDANCE_SERVICES[options.service];
    summary.push(`${service.name}: $${service.customerPrice.toLocaleString("en-US")} service price; project information and delivery arrangements to be confirmed.`);
  }
  if (options.cantilever) {
    summary.push(`Post-pair overhang requested: B3 end ${options.cantilever.b3EndOverhangInches} in; B4 end ${options.cantilever.b4EndOverhangInches} in. Nonzero distances measure outside roof end to post centerline; engineering review required.`);
  }
  for (const opening of options.screens ?? []) {
    const finish = opening.finish === "standard" ? opening.standardColor ?? "standard color to confirm"
      : opening.finish === "custom-ral" ? `custom RAL ${opening.ralCode || "to confirm"}`
        : "match frame subject to physical sample review";
    summary.push(`Screen ${opening.side}: ${opening.widthInches ?? "unmeasured"} in clear width × ${opening.heightInches ?? "unmeasured"} in clear height; ${opening.purpose}; ${opening.mount}; finish ${finish}. Fit and price require review.`);
  }
  return summary;
}
