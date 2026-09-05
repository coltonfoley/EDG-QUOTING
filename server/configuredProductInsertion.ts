import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { businessEvents, groups, lineItems, pricingDefaults, products, quoteApprovalDrawings, quotes } from "@shared/schema";
import { calculateCustomerLineTotal, resolveProductCost } from "@shared/pricing";
import { isPortalOnlySundanceService, SUNDANCE_SERVICE_QUOTE_REVIEW_MESSAGE } from "@shared/sundanceServiceQuotePolicy";
import { appendQuoteApprovalDrawingInternalNoteSql } from "./approvalDrawingSql";
import { appendBusinessEvent } from "./businessEvents";
import { db, ensurePricingDefaultsTable, ensureProductCatalogColumns, ensureQuoteApprovalDrawingTables } from "./db";
import { assertQuoteMutationAllowed } from "./quoteLock";

const productSnapshotSchema = z.object({
  name: z.string().trim().min(1).max(500),
  sku: z.string().trim().max(200).nullable().optional(),
  description: z.string().max(10_000).nullable().optional(),
  category: z.string().max(500).nullable().optional(),
  manufacturer: z.string().trim().min(1).max(500),
  retailPrice: z.union([z.string(), z.number()]),
  costPrice: z.union([z.string(), z.number()]).nullable().optional(),
  unit: z.string().max(100).nullable().optional(),
  defaultDiscountType: z.string().min(1).max(100),
  defaultDiscountValue: z.union([z.string(), z.number()]),
}).passthrough();

export const configuredProductInsertionSchema = z.object({
  requestId: z.string().uuid(),
  items: z.array(z.object({
    productId: z.number().int().positive().nullable(),
    quantity: z.number().finite().positive().max(999_999),
    productSnapshot: productSnapshotSchema,
    configData: z.record(z.string(), z.unknown()).nullable().optional(),
  })).min(1).max(500),
});

export type ConfiguredProductInsertionRequest = z.infer<typeof configuredProductInsertionSchema>;
export type ConfiguredProductInsertionResult = { success: true; groupId: string; replayed: boolean };

export class ConfiguredProductInsertionError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(code: string, message: string, status = 409) {
    super(message);
    this.name = "ConfiguredProductInsertionError";
    this.code = code;
    this.status = status;
  }
}

export async function executeConfiguredProductInsertion(
  quoteId: number,
  input: ConfiguredProductInsertionRequest,
  actorUserId?: number | null,
): Promise<ConfiguredProductInsertionResult> {
  const data = configuredProductInsertionSchema.parse(input);
  await Promise.all([
    ensureProductCatalogColumns(),
    ensurePricingDefaultsTable(),
    ensureQuoteApprovalDrawingTables(),
  ]);

  const groupId = `config-${data.requestId}`;
  const eventKey = `sundance_configuration_inserted:${quoteId}:${data.requestId}`;

  return db.transaction(async (tx) => {
    const [quote] = await tx.select().from(quotes).where(eq(quotes.id, quoteId)).for("update");
    if (!quote) throw new ConfiguredProductInsertionError("QUOTE_NOT_FOUND", "Quote not found", 404);
    assertQuoteMutationAllowed(quote);

    const [existingGroup] = await tx
      .select({ id: groups.id })
      .from(groups)
      .where(and(eq(groups.id, groupId), eq(groups.quoteId, quoteId)))
      .limit(1);
    const [completedEvent] = await tx
      .select({ id: businessEvents.id })
      .from(businessEvents)
      .where(eq(businessEvents.eventKey, eventKey))
      .limit(1);
    if (existingGroup && completedEvent) {
      return { success: true, groupId, replayed: true };
    }
    if (existingGroup || completedEvent) {
      throw new ConfiguredProductInsertionError(
        "CONFIGURATION_INCOMPLETE",
        "A prior configuration attempt is incomplete. Review the quote before retrying.",
      );
    }

    const catalogIds = Array.from(new Set(data.items.flatMap((item) => item.productId ? [item.productId] : [])));
    const catalogRows = catalogIds.length > 0
      ? await tx.select().from(products).where(inArray(products.id, catalogIds))
      : [];
    const catalogById = new Map(catalogRows.map((product) => [product.id, product]));

    const resolvedItems = data.items.map((item) => {
      if (!item.productId) return item;
      const product = catalogById.get(item.productId);
      if (!product) {
        throw new ConfiguredProductInsertionError(
          "CATALOG_PRODUCT_NOT_FOUND",
          `Catalog product ${item.productId} no longer exists. Refresh the builder before inserting this configuration.`,
          400,
        );
      }
      return {
        ...item,
        productSnapshot: {
          ...item.productSnapshot,
          id: product.id,
          name: product.name,
          sku: product.sku,
          manufacturer: product.manufacturer,
          category: product.category,
          productType: product.productType,
          unit: product.unit,
          retailPrice: product.retailPrice,
          costPrice: product.costPrice,
          defaultDiscountType: product.defaultDiscountType,
          defaultDiscountValue: product.defaultDiscountValue,
        },
      };
    });

    if (resolvedItems.some(item => isPortalOnlySundanceService(item.productSnapshot.sku))) {
      throw new ConfiguredProductInsertionError("SUNDANCE_SERVICE_REVIEW_REQUIRED", SUNDANCE_SERVICE_QUOTE_REVIEW_MESSAGE, 400);
    }

    const manufacturer = resolvedItems[0].productSnapshot.manufacturer;
    const isSundance = manufacturer.trim().toLowerCase() === "sundance";
    const [pricingDefault] = isSundance
      ? await tx.select().from(pricingDefaults).where(eq(pricingDefaults.scope, "sundance")).limit(1)
      : [];
    const markupType = isSundance ? (pricingDefault?.markupType || "percentage") : "percentage";
    const markupValue = isSundance ? (pricingDefault?.markupValue?.toString() || "100") : "0";
    const total = resolvedItems.reduce((sum, item) => sum + calculateCustomerLineTotal(
      item.quantity,
      resolveProductCost(item.productSnapshot),
      markupType,
      markupValue,
    ), 0);

    const [positionRow] = await tx
      .select({ maxPosition: sql<number>`coalesce(max(${groups.position}), -1)` })
      .from(groups)
      .where(eq(groups.quoteId, quoteId));
    await tx.insert(groups).values({
      id: groupId,
      quoteId,
      title: `${manufacturer} Configuration`,
      position: Number(positionRow?.maxPosition ?? -1) + 1,
      isCollapsed: false,
      configData: {
        manufacturer,
        items: resolvedItems,
        configuredAt: new Date().toISOString(),
        total,
      },
    });

    await tx.insert(lineItems).values(resolvedItems.map((item, position) => {
      const snapshot = item.productSnapshot;
      const unitPrice = resolveProductCost(snapshot);
      return {
        quoteId,
        productId: item.productId,
        sku: isSundance ? (snapshot.sku || snapshot.name) : snapshot.sku,
        manufacturer: snapshot.manufacturer,
        unit: snapshot.unit || null,
        priceSource: "configured_catalog",
        sourceMetadata: {
          productSnapshot: snapshot,
          configuration: item.configData || null,
          enteredUnitPrice: unitPrice.toFixed(2),
        },
        description: snapshot.name,
        quantity: item.quantity.toString(),
        retailPrice: snapshot.retailPrice.toString(),
        unitPrice: unitPrice.toFixed(2),
        markupType,
        markupValue,
        discountType: "percentage",
        discountValue: "0",
        isTaxable: true,
        groupId,
        position,
        configData: item.configData || undefined,
      };
    }));

    await tx.update(quotes).set({
      updatedAt: sql`GREATEST(CURRENT_TIMESTAMP, COALESCE(${quotes.updatedAt}, CURRENT_TIMESTAMP) + INTERVAL '1 millisecond')`,
    }).where(eq(quotes.id, quoteId));

    const revisionNote = appendQuoteApprovalDrawingInternalNoteSql("Revision needed: configured package added after drawing readiness");
    const now = new Date();
    await tx.update(quoteApprovalDrawings).set({
      status: "revision_needed",
      orderStatus: "blocked",
      publicSnapshot: null,
      internalNotes: revisionNote,
      updatedAt: now,
    }).where(and(
      eq(quoteApprovalDrawings.quoteId, quoteId),
      inArray(quoteApprovalDrawings.status, ["ready_for_agreement", "sent_for_signature"]),
    ));
    await tx.update(quoteApprovalDrawings).set({
      orderStatus: "blocked",
      orderReadyBy: null,
      orderReadyAt: null,
      orderReadyOverrideReason: null,
      internalNotes: revisionNote,
      updatedAt: now,
    }).where(and(
      eq(quoteApprovalDrawings.quoteId, quoteId),
      eq(quoteApprovalDrawings.status, "signed_locked"),
    ));

    await appendBusinessEvent(tx, {
      eventType: "sundance_configuration_inserted",
      eventKey,
      quoteId,
      actorUserId,
    });

    return { success: true, groupId, replayed: false };
  });
}
