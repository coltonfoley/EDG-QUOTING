import type { Express } from "express";
import { storage } from "../storage";
import { z } from "zod";
import { db, ensureProductCatalogColumns } from "../db";
import { products, insertColorSchema, insertProductColorSchema } from "@shared/schema";
import { ilike, and } from "drizzle-orm";
import { isAuthenticated } from "../auth";
import {
  insertProductSchema,
  insertPricingTableSchema,
  idParamSchema,
  productIdParamSchema,
  calculatePriceSchema,
  bulkUploadPricingSchema
} from "../validation-schemas";
import {
  normalizePricingBand,
  pricingUnitFactor,
  PricingBandValidationError,
  PricingManualReviewError,
  type PricingDimensionUnit,
} from "../pricingBands";

function sendPricingError(res: any, error: unknown): boolean {
  if (error instanceof PricingBandValidationError) {
    res.status(error.status).json({ message: error.message, code: error.code, issues: error.issues });
    return true;
  }
  if (error instanceof PricingManualReviewError) {
    res.status(error.status).json({ message: error.message, code: error.code });
    return true;
  }
  return false;
}

function normalizePartialPricingDimensions(data: Record<string, any>, sourceUnit: PricingDimensionUnit) {
  const factor = pricingUnitFactor(sourceUnit);
  const normalized = { ...data };
  for (const field of ["lengthMin", "lengthMax", "widthMin", "widthMax"] as const) {
    if (normalized[field] !== undefined) {
      normalized[field] = (Number(normalized[field]) * factor).toFixed(2);
    }
  }
  return normalized;
}

const pricingDimensionUnitSchema = z.enum(["feet", "inches", "meters"]);

/**
 * Helper function to strip internal validation metadata from API responses
 * Removes any internal metadata fields that shouldn't be returned to clients
 */
function stripValidationMetadata(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(stripValidationMetadata);
  } else if (obj && typeof obj === 'object') {
    const { _categoryValidation, _categoryUpdate, ...cleanObj } = obj;
    const result: any = {};
    for (const [key, value] of Object.entries(cleanObj)) {
      result[key] = stripValidationMetadata(value);
    }
    return result;
  }
  return obj;
}

async function requireAdmin(req: any, res: any, next: any) {
  try {
    const currentUser = await storage.getUser(req.user?.id);
    if (currentUser?.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    next();
  } catch (error) {
    console.error("Error checking admin access:", error);
    res.status(500).json({ message: "Failed to verify admin access" });
  }
}

/**
 * Helper function to build manufacturer filtering
 * Phase B: Only manufacturer field is supported
 */
function buildManufacturerFilter(manufacturerQuery?: string) {
  const filters = [];
  
  if (manufacturerQuery) {
    filters.push(ilike(products.manufacturer, `%${manufacturerQuery}%`));
  }
  
  return filters;
}

export function registerProductRoutes(app: Express) {
  app.use("/api/products", isAuthenticated, async (_req, res, next) => {
    try {
      await ensureProductCatalogColumns();
      next();
    } catch (error) {
      console.error("Error preparing product catalog columns:", error);
      res.status(500).json({ message: "Product catalog is temporarily unavailable" });
    }
  });

  // Product catalog routes (protected)
  // Get list of manufacturers
  app.get("/api/products/manufacturers", isAuthenticated, async (req, res) => {
    try {
      const manufacturers = await db
        .selectDistinct({ manufacturer: products.manufacturer })
        .from(products)
        .orderBy(products.manufacturer);
      
      res.json(manufacturers.map(m => m.manufacturer).filter(Boolean));
    } catch (error) {
      console.error("Error fetching manufacturers:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/products", isAuthenticated, async (req, res) => {
    try {
      const manufacturerFilter = req.query.manufacturer as string;
      const limit = Math.min(parseInt(req.query.limit as string) || 200, 10000);
      const offset = parseInt(req.query.offset as string) || 0;
      
      let productList;
      
      if (manufacturerFilter) {
        const filters = buildManufacturerFilter(manufacturerFilter);
        if (filters.length > 0) {
          productList = await db
            .select()
            .from(products)
            .where(and(...filters))
            .orderBy(products.manufacturer, products.category, products.sku, products.name)
            .limit(limit)
            .offset(offset);
        } else {
          productList = await db
            .select()
            .from(products)
            .orderBy(products.manufacturer, products.category, products.sku, products.name)
            .limit(limit)
            .offset(offset);
        }
      } else {
        productList = await db
          .select()
          .from(products)
          .orderBy(products.manufacturer, products.category, products.sku, products.name)
          .limit(limit)
          .offset(offset);
      }
      
      const cleanProducts = stripValidationMetadata(productList);
      res.json(cleanProducts);
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/products/:id", isAuthenticated, async (req, res) => {
    try {
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }
      
      const product = await storage.getProduct(params.data.id);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      const cleanProduct = stripValidationMetadata(product);
      res.json(cleanProduct);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/products", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const productData = insertProductSchema.parse(req.body);
      const cleanProductData = stripValidationMetadata(productData);
      const product = await storage.createProduct(cleanProductData);
      
      const cleanProduct = stripValidationMetadata(product);
      res.status(201).json(cleanProduct);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid product data", errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/products/:id", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }
      
      const updateFields: any = {};
      const body = req.body;
      
      if (body.name !== undefined) updateFields.name = body.name;
      if (body.sku !== undefined) updateFields.sku = body.sku;
      if (body.description !== undefined) updateFields.description = body.description;
      if (body.category !== undefined) updateFields.category = body.category;
      if (body.manufacturer !== undefined) updateFields.manufacturer = body.manufacturer;
      if (body.productType !== undefined) updateFields.productType = body.productType;
      if (body.retailPrice !== undefined) updateFields.retailPrice = body.retailPrice;
      if (body.costPrice !== undefined) updateFields.costPrice = body.costPrice;
      if (body.defaultDiscountType !== undefined) updateFields.defaultDiscountType = body.defaultDiscountType;
      if (body.defaultDiscountValue !== undefined) updateFields.defaultDiscountValue = body.defaultDiscountValue;
      if (body.unit !== undefined) updateFields.unit = body.unit;
      if (body.minLength !== undefined) updateFields.minLength = body.minLength;
      if (body.maxLength !== undefined) updateFields.maxLength = body.maxLength;
      if (body.minWidth !== undefined) updateFields.minWidth = body.minWidth;
      if (body.maxWidth !== undefined) updateFields.maxWidth = body.maxWidth;
      if (body.primaryImage !== undefined) updateFields.primaryImage = body.primaryImage;
      if (body.galleryImages !== undefined) updateFields.galleryImages = body.galleryImages;
      if (body.specificationSheets !== undefined) updateFields.specificationSheets = body.specificationSheets;
      if (body.configFields !== undefined) updateFields.configFields = body.configFields;
      
      const productData = updateFields;
      const cleanProductData = stripValidationMetadata(productData);
      const product = await storage.updateProduct(params.data.id, cleanProductData);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      const cleanProduct = stripValidationMetadata(product);
      res.json(cleanProduct);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid product data", errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/products/:id", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }
      
      const deleted = await storage.deleteProduct(params.data.id);
      if (!deleted) {
        return res.status(404).json({ message: "Product not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Enhanced product endpoint with pricing tables
  app.get("/api/products/:id/with-details", isAuthenticated, async (req, res) => {
    try {
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }
      
      const productWithDetails = await storage.getProductWithDetails(params.data.id);
      if (!productWithDetails) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      const cleanProductWithDetails = stripValidationMetadata(productWithDetails);
      res.json(cleanProductWithDetails);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Pricing tables routes
  app.get("/api/products/:productId/pricing-tables", isAuthenticated, async (req, res) => {
    try {
      const params = productIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }
      
      const pricingTables = await storage.getPricingTablesByProductId(params.data.productId);
      res.json(pricingTables);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/products/:productId/pricing-tables", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const params = productIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }
      
      const sourceUnit = pricingDimensionUnitSchema.parse(req.body.sourceUnit || "feet");
      const pricingData = insertPricingTableSchema.parse({
        ...normalizePartialPricingDimensions(req.body, sourceUnit),
        productId: params.data.productId,
      });
      const pricingTable = await storage.createPricingTable(pricingData);
      res.status(201).json(pricingTable);
    } catch (error) {
      if (sendPricingError(res, error)) return;
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid pricing table data", errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/pricing-tables/:id", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const sourceUnit = pricingDimensionUnitSchema.parse(req.body.sourceUnit || "feet");
      const pricingData = insertPricingTableSchema.partial().parse(
        normalizePartialPricingDimensions(req.body, sourceUnit),
      );
      const pricingTable = await storage.updatePricingTable(id, pricingData);
      if (!pricingTable) {
        return res.status(404).json({ message: "Pricing table not found" });
      }
      res.json(pricingTable);
    } catch (error) {
      if (sendPricingError(res, error)) return;
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid pricing table data", errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/pricing-tables/:id", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deletePricingTable(id);
      if (!deleted) {
        return res.status(404).json({ message: "Pricing table not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Color routes
  app.get("/api/colors", isAuthenticated, async (req, res) => {
    try {
      const colors = await storage.getAllColors();
      res.json(colors);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/colors", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const colorData = insertColorSchema.parse(req.body);
      const color = await storage.createColor(colorData);
      res.status(201).json(color);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid color data", errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/colors/:id", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const colorData = insertColorSchema.partial().parse(req.body);
      const color = await storage.updateColor(id, colorData);
      if (!color) {
        return res.status(404).json({ message: "Color not found" });
      }
      res.json(color);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid color data", errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/colors/:id", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteColor(id);
      if (!deleted) {
        return res.status(404).json({ message: "Color not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Product color routes
  app.get("/api/products/colors/batch", isAuthenticated, async (req, res) => {
    try {
      const productIdsParam = req.query.productIds as string;
      if (!productIdsParam) {
        return res.status(400).json({ message: "productIds query parameter is required" });
      }
      const productIds = productIdsParam.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
      const productColorsMap = await storage.getBatchProductColors(productIds);
      res.json(productColorsMap);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/products/:productId/colors", isAuthenticated, async (req, res) => {
    try {
      const productId = parseInt(req.params.productId);
      const productColors = await storage.getProductColors(productId);
      res.json(productColors);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/products/:productId/colors", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const productId = parseInt(req.params.productId);
      const productColorData = insertProductColorSchema.parse({ ...req.body, productId });
      const productColor = await storage.createProductColor(productColorData);
      res.status(201).json(productColor);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid product color data", errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/product-colors/:id", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteProductColor(id);
      if (!deleted) {
        return res.status(404).json({ message: "Product color not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Calculate pricing for configurable products
  app.post("/api/products/:productId/calculate-price", isAuthenticated, async (req, res) => {
    try {
      const params = productIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }
      
      const validatedData = calculatePriceSchema.safeParse(req.body);
      if (!validatedData.success) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: validatedData.error.errors 
        });
      }
      
      const { length, width, sourceUnit } = validatedData.data;
      const factor = pricingUnitFactor(sourceUnit);
      const lengthInches = length * factor;
      const widthInches = width * factor;
      const price = await storage.calculateConfigurableProductPrice(params.data.productId, lengthInches, widthInches);
      const actorUserId = Number((req as any).user?.id);
      await storage.recordBusinessEvent({
        eventType: "dimensional_price_resolved",
        productId: params.data.productId,
        actorUserId: Number.isInteger(actorUserId) && actorUserId > 0 ? actorUserId : null,
      });
      
      res.json({ price, length, width, sourceUnit, lengthInches, widthInches });
    } catch (error) {
      if (sendPricingError(res, error)) return;
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Recalculate pricing tables when discount changes
  app.post("/api/products/:productId/recalculate-pricing", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const productId = parseInt(req.params.productId);
      
      const product = await storage.getProduct(productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      const result = await storage.recalculatePricingTables(productId);
      res.json({ 
        message: `Successfully recalculated ${result.updated} pricing entries`,
        updated: result.updated 
      });
    } catch (error) {
      console.error("Error recalculating pricing:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Bulk upload pricing table data
  app.post("/api/products/:productId/pricing-tables/bulk-upload", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const params = productIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }
      
      const validatedData = bulkUploadPricingSchema.safeParse(req.body);
      if (!validatedData.success) {
        return res.status(400).json({ 
          message: "Invalid pricing data", 
          errors: validatedData.error.errors 
        });
      }

      const sourceUnit = validatedData.data.sourceUnit || 'feet';
      const normalizedPricing = validatedData.data.pricingData.map((item) => ({
          productId: params.data.productId,
          ...normalizePricingBand(item, sourceUnit),
        }));
      const results = await storage.replacePricingTablesForProduct(params.data.productId, normalizedPricing);

      res.status(201).json({ 
        message: `Successfully uploaded ${results.length} pricing entries (converted from ${sourceUnit} to inches)`,
        data: results
      });
    } catch (error) {
      if (sendPricingError(res, error)) return;
      console.error("Error bulk uploading pricing data:", error);
      res.status(500).json({ message: "Failed to upload pricing data" });
    }
  });
}
