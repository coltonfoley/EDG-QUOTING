import { createHash } from "node:crypto";

import { z } from "zod";
import { sundancePortalOptionsSchema, summarizeSundancePortalOptions } from "./sundancePortalOptions";

const addressSchema = z.object({
  line1: z.string().trim().min(3).max(160),
  line2: z.string().trim().max(160).nullable(),
  city: z.string().trim().min(2).max(100),
  region: z.string().trim().min(2).max(80),
  postalCode: z.string().trim().min(3).max(20),
  country: z.enum(["US", "CA"]),
});

export const dealerPortalPricingRequestSchema = z.object({
  portalPricingRequestId: z.string().uuid(),
  portalCompanyId: z.string().uuid(),
  submittedAt: z.string().datetime(),
  projectName: z.string().trim().min(2).max(200),
  purchaseOrderNumber: z.string().trim().max(100).nullable(),
  company: z.object({
    name: z.string().trim().min(2).max(200),
    billingEmail: z.string().email().trim().toLowerCase().max(254),
    billingPhone: z.string().trim().min(7).max(32),
    billingAddress: addressSchema,
  }),
  product: z.object({
    key: z.literal("sundance-freestanding"),
    requestedLengthInches: z.number().finite().min(12).max(600),
    requestedWidthInches: z.number().finite().min(12).max(600),
    frameColor: z.enum(["White", "Adobe", "Bronze", "Black", "Other", "Not sure"]),
    louverColor: z.enum(["White", "Adobe", "Bronze", "Black", "Other", "Not sure"]),
    operation: z.enum(["Manual", "Motorized", "Not sure"]),
    rainSensor: z.enum(["Yes", "No", "Not sure"]),
    fulfillment: z.enum(["Pickup", "Delivery", "Not sure"]),
    requestReason: z.string().trim().min(10).max(2000),
    options: sundancePortalOptionsSchema.optional(),
  }),
  shippingAddress: addressSchema.nullable(),
}).superRefine((request, context) => {
  if (request.product.fulfillment === "Delivery" && !request.shippingAddress) {
    context.addIssue({ code: "custom", path: ["shippingAddress"], message: "Delivery requires a shipping address." });
  }
  if (request.product.fulfillment !== "Delivery" && request.shippingAddress) {
    context.addIssue({ code: "custom", path: ["shippingAddress"], message: "Only delivery requests include a shipping address." });
  }
  if (request.product.operation === "Manual" && request.product.rainSensor === "Yes") {
    context.addIssue({ code: "custom", path: ["product", "rainSensor"], message: "A rain sensor cannot be requested with manual operation." });
  }
});

export type DealerPortalPricingRequest = z.infer<typeof dealerPortalPricingRequestSchema>;

export function dealerPortalPricingRequestNotes(product: DealerPortalPricingRequest["product"]) {
  const requestedOptions = summarizeSundancePortalOptions(product.options);
  return {
    publicNotes: product.options?.service
      ? "Dealer pricing request for a Sundance materials package and the requested drawing or engineering service. Service scope and delivery require EDG confirmation. This request does not approve a BOM, final price, completed drawings or engineering, installation, footings, permits, or site work."
      : "Dealer pricing request for a Sundance materials package. No BOM, price, engineering, installation, footings, permits, or site work has been approved by this request.",
    internalOptionNotes: requestedOptions.length ? ["Requested options:", ...requestedOptions] : [],
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]));
  }
  return value;
}

export function hashDealerPortalPricingRequest(request: DealerPortalPricingRequest) {
  return createHash("sha256").update(JSON.stringify(canonicalize(request))).digest("hex");
}
