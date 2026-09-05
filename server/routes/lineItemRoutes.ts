import type { Express } from "express";
import { storage } from "../storage";
import { z } from "zod";
import { isAuthenticated } from "../auth";
import {
  insertLineItemSchema,
  insertGroupSchema,
  groupIdParamSchema,
  reorderLineItemsSchema,
  reorderGroupsSchema,
  idParamSchema,
  queryIdParamSchema,
  bulkDeleteSchema,
  bulkUpdateSchema
} from "../validation-schemas";
import { sendQuoteSignedLockResponse } from "../quoteLock";
import { redactedErrorType, validationIssueSummary } from "../redactedLogging";
import { ConfiguredProductInsertionError, configuredProductInsertionSchema } from "../configuredProductInsertion";
import { assertNativeQuoteSkuSupported, SundanceServiceQuoteReviewError } from "@shared/sundanceServiceQuotePolicy";

/**
 * Server-side calculation verification utility
 * 
 * Ensures calculation integrity by recalculating line item totals server-side.
 * This prevents client-side manipulation and ensures consistency.
 * 
 * Calculation Order (must match client-side):
 * 1. Calculate base total: quantity × unitPrice
 * 2. Apply saved line discount to base total
 * 3. Apply tariff to increase cost (if applicable)
 * 4. Apply markup to the tariff-adjusted amount
 * 
 * Validation Rules:
 * - Quantity: 0.01 to 999,999
 * - Unit Price / EDG cost basis: 0 to 10,000,000
 * - Markup: 0 to 1000 (percentage or fixed)
 * - Discount: 0 to 100% or 0 to base total (fixed)
 * - Tariff: 0 to 100%
 * - All results rounded to 2 decimal places
 * - Tolerance for comparison: ±$0.01 (for floating-point precision)
 * 
 * @param quantity - Number of items
 * @param unitPrice - EDG cost basis per item
 * @param markupType - "percentage" or "dollar"
 * @param markupValue - Markup amount
 * @param discountType - Saved line discount type
 * @param discountValue - Saved line discount amount
 * @param tariffRate - Tariff percentage to increase cost
 * @param isTariffApplicable - Whether tariff should be applied
 * @param expectedTotal - Client-calculated total to verify
 * @returns Validation result with calculated vs expected values
 */
function verifyLineItemCalculation(
  quantity: number | string,
  unitPrice: number | string,
  markupType: string,
  markupValue: number | string,
  discountType: string = "percentage",
  discountValue: number | string = 0,
  tariffRate: number | string = 0,
  isTariffApplicable: boolean = false,
  expectedTotal?: number | string
): { isValid: boolean; calculatedTotal: number; expectedTotal: number; discrepancy: number } {
  // Parse values
  const qty = typeof quantity === 'string' ? parseFloat(quantity) : quantity;
  const price = typeof unitPrice === 'string' ? parseFloat(unitPrice) : unitPrice;
  const markup = typeof markupValue === 'string' ? parseFloat(markupValue) : markupValue;
  const discount = typeof discountValue === 'string' ? parseFloat(discountValue) : discountValue;
  const tariff = typeof tariffRate === 'string' ? parseFloat(tariffRate) : tariffRate;
  const expected = expectedTotal ? (typeof expectedTotal === 'string' ? parseFloat(expectedTotal) : expectedTotal) : 0;

  // Validate inputs
  if (!isFinite(qty) || qty <= 0 || qty > 999999) {
    console.warn(`⚠️ Invalid quantity: ${qty}`);
    return { isValid: false, calculatedTotal: 0, expectedTotal: expected, discrepancy: expected };
  }
  if (!isFinite(price) || price < 0 || price > 10000000) {
    console.warn(`⚠️ Invalid unit price: ${price}`);
    return { isValid: false, calculatedTotal: 0, expectedTotal: expected, discrepancy: expected };
  }
  // SAFETY: Reject negative markup values - markup must be >= 0
  if (!isFinite(markup) || markup < 0 || markup > 10000000) {
    console.warn(`⚠️ Invalid markup value: ${markup} (must be >= 0)`);
    return { isValid: false, calculatedTotal: 0, expectedTotal: expected, discrepancy: expected };
  }
  if (!isFinite(discount) || discount < 0) {
    console.warn(`⚠️ Invalid discount value: ${discount}`);
    return { isValid: false, calculatedTotal: 0, expectedTotal: expected, discrepancy: expected };
  }
  if (!isFinite(tariff) || tariff < 0) {
    console.warn(`⚠️ Invalid tariff value: ${tariff}`);
    return { isValid: false, calculatedTotal: 0, expectedTotal: expected, discrepancy: expected };
  }

  // Perform calculation with same logic as client
  const baseTotal = qty * price;
  let afterDiscount = baseTotal;
  
  if (discount > 0) {
    if (discountType === 'percentage') {
      const discountPercent = Math.min(discount, 100); // Cap at 100%
      afterDiscount = baseTotal - (baseTotal * (discountPercent / 100));
    } else {
      afterDiscount = Math.max(0, baseTotal - discount);
    }
  }
  
  // Apply tariff to increase cost (if applicable)
  let afterTariff = afterDiscount;
  if (isTariffApplicable && tariff > 0) {
    const tariffPercent = Math.min(tariff, 100); // Cap at 100%
    afterTariff = afterDiscount + (afterDiscount * (tariffPercent / 100));
  }
  
  let calculatedTotal = afterTariff;
  if (markupType === 'percentage') {
    calculatedTotal = afterTariff + (afterTariff * (markup / 100));
  } else {
    calculatedTotal = afterTariff + markup;
  }

  // Floor at $0 to prevent negative totals
  calculatedTotal = Math.max(0, calculatedTotal);

  // Round to 2 decimal places
  calculatedTotal = Math.round(calculatedTotal * 100) / 100;

  if (expectedTotal !== undefined && expected > 0) {
    const discrepancy = Math.abs(calculatedTotal - expected);
    const isValid = discrepancy < 0.01; // Allow for small rounding differences
    
    if (!isValid) {
      console.warn(`⚠️ Calculation discrepancy detected:`);
      console.warn(`   Expected: $${expected.toFixed(2)}, Calculated: $${calculatedTotal.toFixed(2)}`);
      console.warn(`   Inputs: qty=${qty}, price=${price}, markup=${markup} (${markupType}), discount=${discount} (${discountType})`);
    }
    
    return { isValid, calculatedTotal, expectedTotal: expected, discrepancy };
  }

  return { isValid: true, calculatedTotal, expectedTotal: calculatedTotal, discrepancy: 0 };
}

export function registerLineItemRoutes(app: Express) {
  // Line item routes (protected)
  app.get("/api/quotes/:quoteId/line-items", isAuthenticated, async (req, res) => {
    try {
      // Validate quote ID parameter
      const params = queryIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }
      
      const lineItems = await storage.getLineItemsByQuoteId(params.data.quoteId);
      res.json(lineItems);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/quotes/:quoteId/line-items", isAuthenticated, async (req, res) => {
    try {
      // Validate quote ID parameter
      const params = queryIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }
      
      // Get existing line items to determine position for new item
      const existingItems = await storage.getLineItemsByQuoteId(params.data.quoteId);
      const groupId = req.body.groupId || null;
      const itemsInSameGroup = existingItems.filter(item => item.groupId === groupId);
      const maxPosition = itemsInSameGroup.length > 0
        ? Math.max(...itemsInSameGroup.map(item => item.position ?? 0))
        : -1;

      let lineItemData = insertLineItemSchema.parse({
        ...req.body, 
        quoteId: params.data.quoteId,
        position: maxPosition + 1
      });
      assertNativeQuoteSkuSupported(lineItemData.sku);

      if (lineItemData.productId) {
        const product = await storage.getProduct(lineItemData.productId);
        if (!product) {
          return res.status(400).json({ message: "The selected catalog product no longer exists. Refresh the catalog and choose it again." });
        }
        assertNativeQuoteSkuSupported(product.sku);
        const requestedPriceSource = req.body.priceSource === "dimensional_catalog"
          ? "dimensional_catalog"
          : "catalog_cost";
        lineItemData = {
          ...lineItemData,
          sku: product.sku,
          manufacturer: product.manufacturer,
          unit: product.unit,
          priceSource: requestedPriceSource,
          sourceMetadata: {
            productSnapshot: {
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
            configuration: lineItemData.configData || null,
            enteredUnitPrice: lineItemData.unitPrice,
          },
        };
      } else {
        lineItemData = {
          ...lineItemData,
          priceSource: "manual",
          sourceMetadata: lineItemData.sourceMetadata || { enteredUnitPrice: lineItemData.unitPrice },
        };
      }
      
      // Get quote to access tariff rate for calculation verification
      const quote = await storage.getQuote(params.data.quoteId);
      if (!quote) {
        return res.status(404).json({ message: "Quote not found" });
      }
      
      // Server-side calculation verification
      const verification = verifyLineItemCalculation(
        lineItemData.quantity,
        lineItemData.unitPrice,
        lineItemData.markupType,
        lineItemData.markupValue,
        lineItemData.discountType,
        lineItemData.discountValue,
        quote.tariffRate || 0,
        lineItemData.isTariffApplicable || false
      );
      
      if (!verification.isValid) {
        console.error(`❌ Invalid line item calculation for quote ${params.data.quoteId}`);
        return res.status(400).json({ 
          message: "Invalid calculation values",
          details: `Server calculation: $${verification.calculatedTotal.toFixed(2)}`
        });
      }
      
      const lineItem = await storage.createLineItem(lineItemData);
      res.status(201).json(lineItem);
    } catch (error) {
      if (error instanceof SundanceServiceQuoteReviewError) return res.status(400).json({ message: error.message, code: error.code });
      if (sendQuoteSignedLockResponse(res, error)) return;
      if (error instanceof z.ZodError) {
        console.error("Line item validation failed", validationIssueSummary(error));
        const errorMessages = error.errors.map(e => e.message).join(", ");
        return res.status(400).json({ message: errorMessages || "Invalid line item data", errors: error.errors });
      }
      console.error("Line item creation failed", { errorType: redactedErrorType(error) });
      res.status(500).json({ message: "Something went wrong while saving the line item. Please try again." });
    }
  });

  // Bulk operations for line items - MUST be defined before :id routes
  app.delete("/api/line-items/bulk", isAuthenticated, async (req: any, res) => {
    try {
      // Validate request body
      const validatedData = bulkDeleteSchema.safeParse(req.body);
      if (!validatedData.success) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: validatedData.error.errors 
        });
      }

      const selection = await storage.validateLineItemSelection(validatedData.data.ids);
      if (!selection.isValid) {
        return res.status(400).json({ message: "Line items must exist and belong to the same quote" });
      }

      if (selection.quoteId && !await storage.quoteExists(selection.quoteId)) {
        return res.status(404).json({ message: "Quote not found" });
      }

      const deletedCount = await storage.bulkDeleteLineItems(validatedData.data.ids);
      res.json({ deletedCount });
    } catch (error) {
      if (sendQuoteSignedLockResponse(res, error)) return;
      console.error("Bulk delete error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/line-items/bulk", isAuthenticated, async (req: any, res) => {
    try {
      // Validate request body
      const validatedData = bulkUpdateSchema.safeParse(req.body);
      if (!validatedData.success) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: validatedData.error.errors 
        });
      }

      const selection = await storage.validateLineItemSelection(validatedData.data.ids);
      if (!selection.isValid) {
        return res.status(400).json({ message: "Line items must exist and belong to the same quote" });
      }

      if (selection.quoteId && !await storage.quoteExists(selection.quoteId)) {
        return res.status(404).json({ message: "Quote not found" });
      }

      const updatedCount = await storage.bulkUpdateLineItems(validatedData.data.ids, validatedData.data.updates);
      res.json({ updatedCount });
    } catch (error) {
      if (error instanceof SundanceServiceQuoteReviewError) return res.status(400).json({ message: error.message, code: error.code });
      if (sendQuoteSignedLockResponse(res, error)) return;
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid update data", errors: error.errors });
      }
      console.error("Bulk update error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/line-items/:id", isAuthenticated, async (req, res) => {
    try {
      // Validate ID parameter
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }
      
      const lineItemData = insertLineItemSchema.partial().parse(req.body);
      
      // If pricing fields are being updated, verify calculations
      if (lineItemData.quantity !== undefined || 
          lineItemData.unitPrice !== undefined || 
          lineItemData.markupValue !== undefined || 
          lineItemData.discountValue !== undefined) {
        
        // Get existing line item for complete data
        const existingItem = await storage.getLineItem(params.data.id);
        if (!existingItem) {
          return res.status(404).json({ message: "Line item not found" });
        }
        
        // Get quote to access tariff rate for calculation verification
        const quote = await storage.getQuote(existingItem.quoteId);
        if (!quote) {
          return res.status(404).json({ message: "Quote not found" });
        }
        
        // Merge with existing data for complete calculation
        const completeData = { ...existingItem, ...lineItemData };
        
        const verification = verifyLineItemCalculation(
          completeData.quantity,
          completeData.unitPrice,
          completeData.markupType,
          completeData.markupValue,
          completeData.discountType,
          completeData.discountValue,
          quote.tariffRate || 0,
          completeData.isTariffApplicable || false
        );
        
        if (!verification.isValid) {
          console.error(`❌ Invalid line item calculation for update of item ${params.data.id}`);
          return res.status(400).json({ 
            message: "Invalid calculation values",
            details: `Server calculation: $${verification.calculatedTotal.toFixed(2)}`
          });
        }
      }
      
      const lineItem = await storage.updateLineItem(params.data.id, lineItemData);
      if (!lineItem) {
        return res.status(404).json({ message: "Line item not found" });
      }
      res.json(lineItem);
    } catch (error) {
      if (error instanceof SundanceServiceQuoteReviewError) return res.status(400).json({ message: error.message, code: error.code });
      if (sendQuoteSignedLockResponse(res, error)) return;
      if (error instanceof z.ZodError) {
        console.error("Line item update validation failed", validationIssueSummary(error));
        const errorMessages = error.errors.map(e => e.message).join(", ");
        return res.status(400).json({ message: errorMessages || "Invalid line item data", errors: error.errors });
      }
      console.error("Line item update failed", { errorType: redactedErrorType(error) });
      res.status(500).json({ message: "Something went wrong while updating the line item. Please try again." });
    }
  });

  app.delete("/api/line-items/:id", isAuthenticated, async (req, res) => {
    try {
      // Validate ID parameter
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }
      const lineItem = await storage.getLineItem(params.data.id);
      if (!lineItem) {
        return res.status(404).json({ message: "Line item not found" });
      }
      if (!(await storage.quoteExists(lineItem.quoteId))) {
        return res.status(404).json({ message: "Quote not found" });
      }

      const deleted = await storage.deleteLineItem(params.data.id);
      if (!deleted) {
        return res.status(404).json({ message: "Line item not found" });
      }
      res.status(204).send();
    } catch (error) {
      if (sendQuoteSignedLockResponse(res, error)) return;
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Line item reordering route
  app.patch("/api/line-items/reorder", isAuthenticated, async (req, res) => {
    try {
      const validatedData = reorderLineItemsSchema.safeParse(req.body);
      if (!validatedData.success) {
        return res.status(400).json({
          message: "Invalid request data",
          errors: validatedData.error.errors
        });
      }

      const { moves, quoteId } = validatedData.data;
      await storage.reorderLineItems(quoteId, moves);

      res.json({ success: true });
    } catch (error) {
      if (sendQuoteSignedLockResponse(res, error)) return;
      console.error("Error reordering line items:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Group routes
  app.get("/api/quotes/:quoteId/groups", isAuthenticated, async (req, res) => {
    try {
      const params = queryIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({
          message: "Invalid request parameters",
          errors: params.error.errors
        });
      }

      const groups = await storage.getGroupsByQuoteId(params.data.quoteId);
      res.json(groups);
    } catch (error) {
      console.error("Error fetching groups:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/quotes/:quoteId/groups", isAuthenticated, async (req, res) => {
    try {
      const params = queryIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({
          message: "Invalid request parameters",
          errors: params.error.errors
        });
      }

      const groupData = insertGroupSchema.parse({ ...req.body, quoteId: params.data.quoteId });
      const group = await storage.createGroup(groupData);
      res.status(201).json(group);
    } catch (error) {
      if (sendQuoteSignedLockResponse(res, error)) return;
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid group data", errors: error.errors });
      }
      console.error("Error creating group:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/groups/:groupId", isAuthenticated, async (req, res) => {
    try {
      const params = groupIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({
          message: "Invalid request parameters",
          errors: params.error.errors
        });
      }

      const group = await storage.getGroup(params.data.groupId);
      if (!group) {
        return res.status(404).json({ message: "Group not found" });
      }
      res.json(group);
    } catch (error) {
      console.error("Error fetching group:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/groups/:groupId", isAuthenticated, async (req, res) => {
    try {
      const params = groupIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({
          message: "Invalid request parameters",
          errors: params.error.errors
        });
      }

      const groupData = insertGroupSchema.partial().parse(req.body);
      const group = await storage.updateGroup(params.data.groupId, groupData);
      
      if (!group) {
        return res.status(404).json({ message: "Group not found" });
      }
      res.json(group);
    } catch (error) {
      if (sendQuoteSignedLockResponse(res, error)) return;
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid group data", errors: error.errors });
      }
      console.error("Error updating group:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/groups/:groupId", isAuthenticated, async (req, res) => {
    try {
      const params = groupIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({
          message: "Invalid request parameters",
          errors: params.error.errors
        });
      }

      const group = await storage.getGroup(params.data.groupId);
      if (!group) {
        return res.status(404).json({ message: "Group not found" });
      }
      if (!(await storage.quoteExists(group.quoteId))) {
        return res.status(404).json({ message: "Quote not found" });
      }

      const deleted = await storage.deleteGroup(params.data.groupId);
      if (!deleted) {
        return res.status(404).json({ message: "Group not found" });
      }
      res.status(204).send();
    } catch (error) {
      if (sendQuoteSignedLockResponse(res, error)) return;
      console.error("Error deleting group:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Group reordering route
  app.patch("/api/groups/reorder", isAuthenticated, async (req, res) => {
    try {
      const validatedData = reorderGroupsSchema.safeParse(req.body);
      if (!validatedData.success) {
        return res.status(400).json({
          message: "Invalid request data",
          errors: validatedData.error.errors
        });
      }

      const { quoteId, groupPositions } = validatedData.data;
      await storage.reorderGroups(quoteId, groupPositions);

      res.json({ success: true });
    } catch (error) {
      if (sendQuoteSignedLockResponse(res, error)) return;
      console.error("Error reordering groups:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Product configurator route - inserts group with BOM line items
  app.post("/api/quotes/:quoteId/configure-product", isAuthenticated, async (req, res) => {
    try {
      const params = queryIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({
          message: "Invalid request parameters",
          errors: params.error.errors
        });
      }

      const { quoteId } = params.data;
      const parsed = configuredProductInsertionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          message: "Configuration data needs attention",
          errors: parsed.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
        });
      }
      const actorUserId = Number((req as any).user?.id);
      const result = await storage.insertConfiguredProduct(
        quoteId,
        parsed.data,
        Number.isInteger(actorUserId) && actorUserId > 0 ? actorUserId : null,
      );
      res.status(result.replayed ? 200 : 201).json({
        ...result,
        message: result.replayed
          ? "Configuration was already inserted"
          : "Configuration inserted successfully",
      });
    } catch (error) {
      if (sendQuoteSignedLockResponse(res, error)) return;
      if (error instanceof ConfiguredProductInsertionError) {
        return res.status(error.status).json({
          message: error.message,
          code: error.code,
        });
      }
      console.error("Configured package insertion failed", { errorType: redactedErrorType(error) });
      res.status(500).json({ message: "Internal server error" });
    }
  });
}
