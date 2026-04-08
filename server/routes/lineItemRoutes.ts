import type { Express } from "express";
import { storage } from "../storage";
import { z } from "zod";
import { isAuthenticated } from "../replitAuth";
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
import { nanoid } from "nanoid";

/**
 * Server-side calculation verification utility
 * 
 * Ensures calculation integrity by recalculating line item totals server-side.
 * This prevents client-side manipulation and ensures consistency.
 * 
 * Calculation Order (must match client-side):
 * 1. Calculate base total: quantity × unitPrice
 * 2. Apply manufacturer discount to base total
 * 3. Apply tariff to increase cost (if applicable)
 * 4. Apply markup to the tariff-adjusted amount
 * 
 * Validation Rules:
 * - Quantity: 0.01 to 999,999
 * - Unit Price: 0 to 10,000,000
 * - Markup: 0 to 1000 (percentage or fixed)
 * - Discount: 0 to 100% or 0 to base total (fixed)
 * - Tariff: 0 to 100%
 * - All results rounded to 2 decimal places
 * - Tolerance for comparison: ±$0.01 (for floating-point precision)
 * 
 * @param quantity - Number of items
 * @param unitPrice - Price per item
 * @param markupType - "percentage" or "dollar"
 * @param markupValue - Markup amount
 * @param discountType - Manufacturer discount type
 * @param discountValue - Manufacturer discount amount
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

      const lineItemData = insertLineItemSchema.parse({ 
        ...req.body, 
        quoteId: params.data.quoteId,
        position: maxPosition + 1
      });
      
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

      if (error instanceof z.ZodError) {
        console.error("Line item validation error:", JSON.stringify(error.errors, null, 2));
        console.error("Request body:", JSON.stringify(req.body, null, 2));
        return res.status(400).json({ message: "Invalid line item data", errors: error.errors });
      }
      console.error("Line item creation error:", error);
      console.error("Request body:", JSON.stringify(req.body, null, 2));
      res.status(500).json({ message: "Internal server error" });
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

      // Authorization check: validate ownership and same quote
      const ownership = await storage.validateLineItemsOwnership(validatedData.data.ids, req.user?.id);
      if (!ownership.isValid) {
        return res.status(403).json({ message: "Unauthorized: You can only delete your own line items from the same quote" });
      }

      // Additional quote ownership validation
      if (ownership.quoteId && !await storage.validateQuoteOwnership(ownership.quoteId, req.user?.id)) {
        return res.status(403).json({ message: "Unauthorized: You don't have access to this quote" });
      }

      const deletedCount = await storage.bulkDeleteLineItems(validatedData.data.ids);
      res.json({ deletedCount });
    } catch (error) {
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

      // Authorization check: validate ownership and same quote
      const ownership = await storage.validateLineItemsOwnership(validatedData.data.ids, req.user?.id);
      if (!ownership.isValid) {
        return res.status(403).json({ message: "Unauthorized: You can only update your own line items from the same quote" });
      }

      // Additional quote ownership validation
      if (ownership.quoteId && !await storage.validateQuoteOwnership(ownership.quoteId, req.user?.id)) {
        return res.status(403).json({ message: "Unauthorized: You don't have access to this quote" });
      }

      const updatedCount = await storage.bulkUpdateLineItems(validatedData.data.ids, validatedData.data.updates);
      res.json({ updatedCount });
    } catch (error) {
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
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid line item data", errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
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
      
      const deleted = await storage.deleteLineItem(params.data.id);
      if (!deleted) {
        return res.status(404).json({ message: "Line item not found" });
      }
      res.status(204).send();
    } catch (error) {
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

      const deleted = await storage.deleteGroup(params.data.groupId);
      if (!deleted) {
        return res.status(404).json({ message: "Group not found" });
      }
      res.status(204).send();
    } catch (error) {
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
      const { items } = req.body as { 
        items: { 
          productId: number; 
          quantity: number;
          productSnapshot: any;
          configData?: any;
        }[] 
      };

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "Items array is required" });
      }

      // Validate that all items have product snapshots with required fields
      for (const item of items) {
        if (!item.productSnapshot) {
          return res.status(400).json({ message: "Product snapshot is required for all items" });
        }
        const required = ['name', 'manufacturer', 'retailPrice', 'defaultDiscountType', 'defaultDiscountValue'];
        for (const field of required) {
          if (item.productSnapshot[field] === undefined) {
            return res.status(400).json({ message: `Product snapshot missing required field: ${field}` });
          }
        }
      }

      // Get manufacturer from first product snapshot
      const manufacturer = items[0].productSnapshot.manufacturer;
      
      // Calculate total from snapshots
      const total = items.reduce((sum, item) => {
        return sum + (parseFloat(item.productSnapshot.retailPrice) * item.quantity);
      }, 0);

      // Get existing groups to determine position
      const existingGroups = await storage.getGroupsByQuoteId(quoteId);
      const maxPosition = existingGroups.length > 0 
        ? Math.max(...existingGroups.map(g => g.position)) 
        : -1;

      // Create group with full configuration data (manufacturer + product snapshots)
      const groupId = nanoid();
      const groupTitle = `${manufacturer} Configuration`;
      
      await storage.createGroup({
        id: groupId,
        quoteId,
        title: groupTitle,
        position: maxPosition + 1,
        isCollapsed: false,
        configData: { 
          manufacturer, 
          items,
          configuredAt: new Date().toISOString(),
          total
        }
      });

      // Get existing line items to determine position
      const existingItems = await storage.getLineItemsByQuoteId(quoteId);
      const groupItems = existingItems.filter(item => item.groupId === groupId);
      let itemPosition = groupItems.length;

      // Create line items using product snapshots for historical accuracy
      for (const item of items) {
        const snapshot = item.productSnapshot;

        // Calculate our actual cost by applying the manufacturer discount to retail price
        // This matches the "From Catalog" pattern where discount is baked into unitPrice
        let unitPrice = parseFloat(snapshot.retailPrice);
        if (snapshot.defaultDiscountType === 'percentage') {
          const discountPercent = parseFloat(snapshot.defaultDiscountValue) / 100;
          unitPrice = unitPrice * (1 - discountPercent);
        } else if (snapshot.defaultDiscountType === 'dollar') {
          unitPrice = unitPrice - parseFloat(snapshot.defaultDiscountValue);
        }

        await storage.createLineItem({
          quoteId,
          productId: item.productId,
          description: snapshot.name,
          quantity: item.quantity.toString(),
          retailPrice: snapshot.retailPrice,
          unitPrice: unitPrice.toFixed(2),
          // Set markup and discount to 0 since manufacturer discount is already applied to unitPrice
          // This matches the "From Catalog" pattern
          markupType: "percentage",
          markupValue: "0",
          discountType: "percentage",
          discountValue: "0",
          isTaxable: true,
          groupId,
          position: itemPosition++,
          configData: item.configData ? JSON.stringify(item.configData) : undefined,
        });
      }

      res.status(201).json({ 
        success: true, 
        groupId,
        message: "Configuration inserted successfully" 
      });
    } catch (error) {
      console.error("Error creating configuration:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
}
