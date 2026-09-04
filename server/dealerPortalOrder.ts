import { createHash, timingSafeEqual } from "node:crypto";

import { z } from "zod";

const addressSchema = z.object({
  line1: z.string().trim().min(3).max(160),
  line2: z.string().trim().max(160).nullable(),
  city: z.string().trim().min(2).max(100),
  region: z.string().trim().min(2).max(80),
  postalCode: z.string().trim().min(3).max(20),
  country: z.enum(["US", "CA"]),
});

const materialLineSchema = z.object({
  role: z.string().trim().min(1).max(100),
  sku: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(240),
  quantity: z.number().int().positive().max(999999),
  color: z.string().trim().max(80).nullable(),
  customerUnitPriceCents: z.number().int().positive().max(1_000_000_000),
  customerLineTotalCents: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

export const dealerPortalOrderSchema = z.object({
  portalOrderId: z.string().uuid(),
  portalCompanyId: z.string().uuid(),
  snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
  // Both are released 2 x 8 packages. 26.1 added the continuous 8–14 ft
  // width band; retain 25.3 for historical order retries. Working 3 x 10
  // and admin settings versions remain outside the purchasing contract.
  rulesVersion: z.enum(["2026-08-25.3", "2026-08-26.1"]),
  projectName: z.string().trim().min(1).max(200),
  purchaseOrderNumber: z.string().trim().max(100).nullable(),
  company: z.object({
    name: z.string().trim().min(2).max(200),
    billingEmail: z.string().email().trim().toLowerCase().max(254),
    billingPhone: z.string().trim().min(7).max(32),
    billingAddress: addressSchema,
  }),
  fulfillment: z.enum(["Pickup", "Delivery"]),
  shippingAddress: addressSchema.nullable(),
  agreement: z.object({
    version: z.string().trim().min(1).max(60),
    signerName: z.string().trim().min(2).max(120),
    acceptedAt: z.string().datetime(),
  }),
  quickBooks: z.object({
    invoiceId: z.string().trim().min(1).max(120),
    invoiceNumber: z.string().trim().min(1).max(120),
    depositPaidAt: z.string().datetime(),
    depositAmountCents: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  }),
  materials: z.object({
    currency: z.literal("USD"),
    customerTotalCents: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    lines: z.array(materialLineSchema).min(1).max(250),
  }),
}).superRefine((order, context) => {
  if (order.fulfillment === "Delivery" && !order.shippingAddress) {
    context.addIssue({ code: "custom", path: ["shippingAddress"], message: "Delivery requires a shipping address." });
  }
  if (order.fulfillment === "Pickup" && order.shippingAddress) {
    context.addIssue({ code: "custom", path: ["shippingAddress"], message: "Pickup must not include a shipping address." });
  }
  const beamLines = order.materials.lines.filter((line) => line.role.startsWith("beam-"));
  if (!beamLines.length || beamLines.some((line) => !line.role.startsWith("beam-2x8-"))) {
    context.addIssue({ code: "custom", path: ["materials", "lines"], message: "Only approved 2 x 8 beam roles are accepted." });
  }
  const calculatedTotal = order.materials.lines.reduce((sum, line) => {
    if (line.customerUnitPriceCents * line.quantity !== line.customerLineTotalCents) {
      context.addIssue({ code: "custom", path: ["materials", "lines"], message: `Line ${line.sku} has contradictory money.` });
    }
    return sum + line.customerLineTotalCents;
  }, 0);
  if (calculatedTotal !== order.materials.customerTotalCents) {
    context.addIssue({ code: "custom", path: ["materials", "customerTotalCents"], message: "Material lines do not match the frozen total." });
  }
  if (Math.round(order.materials.customerTotalCents / 2) !== order.quickBooks.depositAmountCents) {
    context.addIssue({ code: "custom", path: ["quickBooks", "depositAmountCents"], message: "The paid deposit does not match the frozen 50 percent amount." });
  }
});

export type DealerPortalOrder = z.infer<typeof dealerPortalOrderSchema>;

export function isDealerPortalOrderKeyValid(supplied: string | undefined, configured: string | undefined) {
  if (!supplied || !configured || configured.length < 32) return false;
  const suppliedBuffer = Buffer.from(supplied);
  const configuredBuffer = Buffer.from(configured);
  return suppliedBuffer.length === configuredBuffer.length && timingSafeEqual(suppliedBuffer, configuredBuffer);
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

export function hashDealerPortalOrder(order: DealerPortalOrder) {
  return createHash("sha256").update(JSON.stringify(canonicalize(order))).digest("hex");
}

export function validateDealerPortalCatalogMatch(
  order: DealerPortalOrder,
  products: Array<{ id: number; sku: string | null; name: string; manufacturer: string | null; unit: string | null; costPrice: string }>,
) {
  const bySku = new Map(products.filter((product) => product.sku).map((product) => [product.sku!, product]));
  return order.materials.lines.map((line) => {
    const product = bySku.get(line.sku);
    if (!product || product.manufacturer !== "Sundance") {
      throw new Error(`Rainmaker product ${line.sku} is missing or not Sundance.`);
    }
    const cost = Number(product.costPrice);
    if (!Number.isFinite(cost) || cost <= 0 || cost > 10_000_000) throw new Error(`Rainmaker product ${line.sku} has no valid cost.`);
    return { line, product, cost };
  });
}

export function dealerPortalFrozenPricingFields(
  order: DealerPortalOrder,
  line: DealerPortalOrder["materials"]["lines"][number],
  cost: number,
) {
  return {
    priceSource: "dealer_portal_frozen_catalog",
    sourceMetadata: {
      portalOrderId: order.portalOrderId,
      snapshotHash: order.snapshotHash,
      rulesVersion: order.rulesVersion,
      customerUnitPriceCents: line.customerUnitPriceCents,
      customerLineTotalCents: line.customerLineTotalCents,
    },
    retailPrice: (line.customerUnitPriceCents / 100).toFixed(2),
    unitPrice: cost.toFixed(2),
    // Frozen sale revenue is read from its evidence, never recalculated from
    // today's markup. Keep the real cost for gross-profit reporting.
    markupType: "percentage",
    markupValue: "0",
    discountType: "percentage",
    discountValue: "0",
  };
}
