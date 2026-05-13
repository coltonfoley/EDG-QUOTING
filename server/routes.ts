import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { setupAuth, isAuthenticated, sanitizeUser } from "./replitAuth";
import {
  insertContractTemplateSchema,
  createUserSchema,
  updateUserSchema,
  idParamSchema,
  bulkUpdateProductsSchema,
} from "./validation-schemas";
import multer from "multer";
import { extractProductsFromPriceSheet, analyzePriceSheetColumns } from "./openai";

import { registerAccountRoutes } from "./routes/accountRoutes";
import { registerQuoteRoutes } from "./routes/quoteRoutes";
import { registerLineItemRoutes } from "./routes/lineItemRoutes";
import { registerProductRoutes } from "./routes/productRoutes";
import { registerImageRoutes } from "./routes/imageRoutes";
import { registerAIAssistantRoutes } from "./routes/aiAssistantRoutes";
import { registerLeadIntakeRoutes } from "./routes/leadIntakeRoutes";
import { deriveProductCostFields } from "@shared/pricing";

const STORAGE_USAGE_CACHE_MS = 5 * 60 * 1000;

let storageUsageCache: {
  expiresAt: number;
  data: {
    provider: string;
    usedBytes: number;
    quotaBytes: number | null;
    objectCount: number;
    calculatedAt: string;
  };
} | null = null;

function getConfiguredStorageQuotaBytes(): number | null {
  const quotaGb = Number(process.env.BLOB_STORAGE_QUOTA_GB || "5");
  if (!Number.isFinite(quotaGb) || quotaGb <= 0) {
    return null;
  }

  return Math.round(quotaGb * 1024 * 1024 * 1024);
}

const updateSundancePricingDefaultSchema = z.object({
  markupType: z.literal("percentage").optional(),
  markupValue: z.union([z.string(), z.number()])
    .transform((value) => {
      const numericValue = typeof value === "number" ? value : Number(value);
      return numericValue;
    })
    .refine((value) => Number.isFinite(value), "Markup value must be a valid number")
    .refine((value) => value >= 0 && value <= 1000, "Markup value must be between 0 and 1000"),
});

function serializeSundancePricingDefault(pricingDefault?: {
  scope?: string | null;
  markupType?: string | null;
  markupValue?: string | number | null;
  updatedAt?: Date | string | null;
}) {
  return {
    scope: "sundance",
    markupType: pricingDefault?.markupType || "percentage",
    markupValue: pricingDefault?.markupValue?.toString() || "100",
    updatedAt: pricingDefault?.updatedAt || null,
  };
}

export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);

  app.get('/api/user', async (req: any, res) => {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'ETag': ''
    });
    
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    try {
      const user = await storage.getUser(req.user?.id);
      console.log(`✅ User authenticated: ${user?.username} (ID: ${user?.id})`);
      res.json(sanitizeUser(user));
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.get('/api/pricing-defaults/sundance', isAuthenticated, async (_req, res) => {
    try {
      const pricingDefault = await storage.getPricingDefault("sundance");
      res.json(serializeSundancePricingDefault(pricingDefault));
    } catch (error) {
      console.error("Error fetching Sundance pricing default:", error);
      res.status(500).json({ message: "Failed to fetch Sundance pricing default" });
    }
  });

  app.put('/api/pricing-defaults/sundance', isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.user?.id);
      if (currentUser?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const validatedData = updateSundancePricingDefaultSchema.safeParse(req.body);
      if (!validatedData.success) {
        return res.status(400).json({
          message: "Invalid request data",
          errors: validatedData.error.errors,
        });
      }

      const pricingDefault = await storage.upsertPricingDefault("sundance", {
        markupType: "percentage",
        markupValue: validatedData.data.markupValue.toString(),
      });

      res.json(serializeSundancePricingDefault(pricingDefault));
    } catch (error) {
      console.error("Error updating Sundance pricing default:", error);
      res.status(500).json({ message: "Failed to update Sundance pricing default" });
    }
  });

  app.get('/api/users', isAuthenticated, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      const mappedUsers = users.map(user => ({
        id: user.id,
        username: user.username,
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email,
        role: user.role
      }));
      res.json(mappedUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.get('/api/storage/usage', isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.user?.id);
      if (currentUser?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const provider = process.env.OBJECT_STORAGE_PROVIDER || "replit";
      if (provider !== "vercel-blob") {
        return res.json({
          provider,
          usedBytes: 0,
          quotaBytes: null,
          objectCount: 0,
          calculatedAt: new Date().toISOString(),
          unavailableReason: "Storage usage is only available for Vercel Blob.",
        });
      }

      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        return res.status(503).json({
          message: "Storage usage is not configured",
        });
      }

      const now = Date.now();
      if (storageUsageCache && storageUsageCache.expiresAt > now) {
        return res.json({ ...storageUsageCache.data, cached: true });
      }

      const { list } = await import("@vercel/blob");
      let cursor: string | undefined;
      let usedBytes = 0;
      let objectCount = 0;

      do {
        const result = await list({ cursor, limit: 1000 });
        cursor = result.cursor;
        for (const blob of result.blobs) {
          usedBytes += blob.size || 0;
          objectCount += 1;
        }
      } while (cursor);

      const data = {
        provider,
        usedBytes,
        quotaBytes: getConfiguredStorageQuotaBytes(),
        objectCount,
        calculatedAt: new Date().toISOString(),
      };

      storageUsageCache = {
        expiresAt: now + STORAGE_USAGE_CACHE_MS,
        data,
      };

      res.json({ ...data, cached: false });
    } catch (error) {
      console.error("Error fetching storage usage:", error);
      res.status(500).json({ message: "Failed to fetch storage usage" });
    }
  });

  registerImageRoutes(app);
  registerLeadIntakeRoutes(app);
  registerAccountRoutes(app);
  registerQuoteRoutes(app);
  registerLineItemRoutes(app);
  registerProductRoutes(app);
  registerAIAssistantRoutes(app);

  app.put('/api/user/change-password', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const schema = z.object({
        currentPassword: z.string().min(1, "Current password is required"),
        newPassword: z.string()
          .min(8, "Password must be at least 8 characters")
          .max(128, "Password is too long")
          .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
          .regex(/[a-z]/, "Password must contain at least one lowercase letter")
          .regex(/[0-9]/, "Password must contain at least one number"),
      });

      const validated = schema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ message: "Invalid data", errors: validated.error.errors });
      }

      const { comparePasswords } = await import("./replitAuth");
      const isValid = await comparePasswords(validated.data.currentPassword, user.password);
      if (!isValid) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }

      await storage.updateUser(user.id, { password: validated.data.newPassword });
      res.json({ message: "Password updated successfully" });
    } catch (error) {
      console.error("Error changing password:", error);
      res.status(500).json({ message: "Failed to change password" });
    }
  });

  app.get('/api/admin/users', isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.user?.id);
      if (currentUser?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const users = await storage.getAllUsers();
      res.json(users.map(sanitizeUser));
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.post('/api/admin/users', isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.user?.id);
      if (currentUser?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const validatedData = createUserSchema.safeParse(req.body);
      if (!validatedData.success) {
        return res.status(400).json({ 
          message: "Invalid user data", 
          errors: validatedData.error.errors 
        });
      }

      const existingUser = await storage.getUserByUsername(validatedData.data.username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const user = await storage.createUser(validatedData.data);
      res.status(201).json(sanitizeUser(user));
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(500).json({ message: "Failed to create user" });
    }
  });

  app.put('/api/admin/users/:id', isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.user?.id);
      if (currentUser?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const userId = req.params.id;
      
      const validatedData = updateUserSchema.safeParse(req.body);
      if (!validatedData.success) {
        return res.status(400).json({ 
          message: "Invalid user data", 
          errors: validatedData.error.errors 
        });
      }

      if (validatedData.data.username) {
        const existingUser = await storage.getUserByUsername(validatedData.data.username);
        if (existingUser && existingUser.id.toString() !== userId.toString()) {
          return res.status(400).json({ message: "Username already exists" });
        }
      }

      const updatedUser = await storage.updateUser(userId, validatedData.data);
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json(sanitizeUser(updatedUser));
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  app.delete('/api/admin/users/:id', isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.user?.id);
      if (currentUser?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const userId = req.params.id;
      if (userId.toString() === req.user?.id?.toString()) {
        return res.status(400).json({ message: "Cannot delete your own account" });
      }

      await storage.deleteUser(userId);
      res.json({ message: "User deleted successfully" });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  app.post('/api/admin/import-csv-products', isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.user?.id);
      if (currentUser?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { products } = req.body;

      if (!products || !Array.isArray(products)) {
        return res.status(400).json({ message: "Products array is required" });
      }

      let created = 0;
      let updated = 0;
      const errors: string[] = [];

      const allProducts = await storage.getAllProducts();
      const productLookupByName = new Map<string, typeof allProducts[0]>();
      const productLookupBySku = new Map<string, typeof allProducts[0]>();
      const skuRegex = /\(([A-Z0-9][A-Z0-9\-]+)\)\s*$/i;
      for (const p of allProducts) {
        productLookupByName.set(p.name.toLowerCase().trim(), p);
        if (p.sku) {
          productLookupBySku.set(p.sku.toUpperCase().trim(), p);
        }
        const skuMatch = p.name.match(skuRegex);
        if (skuMatch) {
          productLookupBySku.set(skuMatch[1].toUpperCase(), p);
        }
      }

      for (const product of products) {
        try {
          const { name, sku, manufacturer, category, unit, description, retailPrice, cost } = product;

          if (!name || typeof retailPrice !== 'number' || typeof cost !== 'number') {
            errors.push(`Invalid product data for: ${name || 'unnamed'}`);
            continue;
          }

          const normalizedCost = cost > 0 ? cost : retailPrice;
          const pricingFields = deriveProductCostFields(retailPrice, normalizedCost);

          let existingProduct = productLookupByName.get(name.toLowerCase().trim());
          if (!existingProduct && sku) {
            existingProduct = productLookupBySku.get(sku.toUpperCase().trim());
          }

          if (existingProduct) {
            const updateData: any = {
              retailPrice: retailPrice.toString(),
              costPrice: pricingFields.costPrice,
              defaultDiscountType: pricingFields.defaultDiscountType,
              defaultDiscountValue: pricingFields.defaultDiscountValue,
            };
            if (sku !== undefined) {
              updateData.sku = sku ? sku.trim() : null;
            }
            if (manufacturer !== undefined) {
              updateData.manufacturer = manufacturer;
            }
            if (category !== undefined) {
              updateData.category = category;
            }
            if (unit !== undefined) {
              updateData.unit = unit;
            }
            if (description !== undefined) {
              updateData.description = description;
            }
            
            await storage.updateProduct(existingProduct.id, updateData);
            updated++;
          } else {
            const productData = {
              name: name.trim(),
              sku: sku ? sku.trim() : null,
              description: description || '',
              manufacturer: manufacturer || 'Imported',
              category: category || null,
              retailPrice: retailPrice.toString(),
              costPrice: pricingFields.costPrice,
              defaultDiscountType: pricingFields.defaultDiscountType,
              defaultDiscountValue: pricingFields.defaultDiscountValue,
              unit: unit || 'each',
            };
            
            const newProduct = await storage.createProduct(productData);
            productLookupByName.set(name.toLowerCase().trim(), newProduct);
            if (sku) {
              productLookupBySku.set(sku.toUpperCase().trim(), newProduct);
            }
            created++;
          }
        } catch (error) {
          console.error(`Error processing product ${product.name}:`, error);
          errors.push(`Failed to process: ${product.name}`);
        }
      }

      res.json({
        created,
        updated,
        errors,
        total: products.length,
      });
    } catch (error) {
      console.error("CSV import error:", error);
      res.status(500).json({ message: "Failed to import products" });
    }
  });

  const aiUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = [
        'text/csv',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/pdf',
        'application/octet-stream',
      ];
      if (allowed.includes(file.mimetype) || file.originalname.match(/\.(csv|xlsx|xls|pdf)$/i)) {
        cb(null, true);
      } else {
        cb(new Error('Unsupported file type. Please upload CSV, Excel, or PDF files.'));
      }
    },
  });

  app.post('/api/admin/analyze-price-sheet', isAuthenticated, (req: any, res: any, next: any) => {
    aiUpload.single('file')(req, res, (err: any) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ message: 'File too large. Maximum size is 50MB.' });
        }
        return res.status(400).json({ message: err.message || 'File upload error' });
      }
      next();
    });
  }, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.user?.id);
      if (currentUser?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const file = req.file;
      const ext = file.originalname.toLowerCase().split('.').pop();
      let fileType: 'csv' | 'excel' | 'pdf';

      if (ext === 'pdf') {
        fileType = 'pdf';
      } else if (ext === 'csv') {
        fileType = 'csv';
      } else {
        fileType = 'excel';
      }

      const analysis = await analyzePriceSheetColumns(file.buffer, fileType, file.originalname);
      if (!analysis) {
        return res.json({ needsColumnSelection: false });
      }

      res.json({
        needsColumnSelection: true,
        detectedColumns: analysis.detectedColumns,
        detectedManufacturer: analysis.detectedManufacturer,
        totalRows: analysis.totalRows,
      });
    } catch (error: any) {
      console.error("Price sheet analysis error:", error);
      res.status(500).json({ message: "Failed to analyze file." });
    }
  });

  app.post('/api/admin/import-products-ai', isAuthenticated, (req: any, res: any, next: any) => {
    aiUpload.single('file')(req, res, (err: any) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ message: 'File too large. Maximum size is 50MB.' });
        }
        return res.status(400).json({ message: err.message || 'File upload error' });
      }
      next();
    });
  }, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.user?.id);
      if (currentUser?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const file = req.file;
      const ext = file.originalname.toLowerCase().split('.').pop();
      let fileType: 'csv' | 'excel' | 'pdf';

      if (ext === 'pdf') {
        fileType = 'pdf';
      } else if (ext === 'csv') {
        fileType = 'csv';
      } else {
        fileType = 'excel';
      }

      const columnOptions: { retailPriceColumn?: number; costColumn?: number } = {};
      const retailCol = req.body?.retailPriceColumn;
      const costCol = req.body?.costColumn;
      if (retailCol !== undefined && retailCol !== null && retailCol !== '') {
        columnOptions.retailPriceColumn = parseInt(retailCol, 10);
      }
      if (costCol !== undefined && costCol !== null && costCol !== '') {
        columnOptions.costColumn = parseInt(costCol, 10);
      }

      const useSSE = (req.headers.accept || '').includes('text/event-stream');
      console.log(`AI product import: ${file.originalname} (${fileType}, ${(file.size / 1024).toFixed(1)} KB, sse=${useSSE}, cols=${JSON.stringify(columnOptions)})`);

      if (useSSE) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });

        const sendProgress = (data: any) => {
          res.write(`data: ${JSON.stringify({ type: 'progress', ...data })}\n\n`);
        };

        const result = await extractProductsFromPriceSheet(file.buffer, fileType, file.originalname, (progress) => {
          sendProgress(progress);
        }, Object.keys(columnOptions).length > 0 ? columnOptions : undefined);

        res.write(`data: ${JSON.stringify({
          type: 'complete',
          success: true,
          products: result.products,
          detectedManufacturer: result.detectedManufacturer,
          totalExtracted: result.products.length,
        })}\n\n`);
        res.end();
      } else {
        const result = await extractProductsFromPriceSheet(file.buffer, fileType, file.originalname, undefined, Object.keys(columnOptions).length > 0 ? columnOptions : undefined);
        res.json({
          success: true,
          products: result.products,
          detectedManufacturer: result.detectedManufacturer,
          totalExtracted: result.products.length,
        });
      }
    } catch (error: any) {
      console.error("AI product import error:", error);
      if (error.message?.includes('Unsupported file type')) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to process file with AI. Please try again." });
    }
  });

  app.post('/api/admin/bulk-update-products', isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.user?.id);
      if (currentUser?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const validatedData = bulkUpdateProductsSchema.safeParse(req.body);
      if (!validatedData.success) {
        console.error("Bulk update validation failed:", JSON.stringify(validatedData.error.errors, null, 2));
        console.error("Request body:", JSON.stringify(req.body, null, 2));
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: validatedData.error.errors 
        });
      }

      const updatedCount = await storage.bulkUpdateProducts(
        validatedData.data.productIds, 
        validatedData.data.updates
      );
      
      res.json({
        message: `Successfully updated ${updatedCount} products`,
        updatedCount
      });
    } catch (error) {
      console.error("Bulk update error:", error);
      res.status(500).json({ message: "Failed to bulk update products" });
    }
  });

  app.get('/api/contract-templates', isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.user?.id);
      if (currentUser?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const templates = await storage.getAllContractTemplates();
      res.json(templates);
    } catch (error) {
      console.error("Error fetching contract templates:", error);
      res.status(500).json({ message: "Failed to fetch contract templates" });
    }
  });

  app.get('/api/contract-templates/:id', isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.user?.id);
      if (currentUser?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const id = parseInt(req.params.id);
      const template = await storage.getContractTemplate(id);
      if (!template) {
        return res.status(404).json({ message: "Contract template not found" });
      }
      res.json(template);
    } catch (error) {
      console.error("Error fetching contract template:", error);
      res.status(500).json({ message: "Failed to fetch contract template" });
    }
  });

  app.post('/api/contract-templates', isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.user?.id);
      if (currentUser?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const validatedData = insertContractTemplateSchema.parse(req.body);
      const template = await storage.createContractTemplate(validatedData);
      res.status(201).json(template);
    } catch (error) {
      console.error("Error creating contract template:", error);
      res.status(500).json({ message: "Failed to create contract template" });
    }
  });

  app.put('/api/contract-templates/:id', isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.user?.id);
      if (currentUser?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const id = parseInt(req.params.id);
      const validatedData = insertContractTemplateSchema.partial().parse(req.body);
      const template = await storage.updateContractTemplate(id, validatedData);
      
      if (!template) {
        return res.status(404).json({ message: "Contract template not found" });
      }
      
      res.json(template);
    } catch (error) {
      console.error("Error updating contract template:", error);
      res.status(500).json({ message: "Failed to update contract template" });
    }
  });

  app.delete('/api/contract-templates/:id', isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.user?.id);
      if (currentUser?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const id = parseInt(req.params.id);
      const success = await storage.deleteContractTemplate(id);
      
      if (!success) {
        return res.status(404).json({ message: "Contract template not found" });
      }
      
      res.json({ message: "Contract template deleted successfully" });
    } catch (error) {
      console.error("Error deleting contract template:", error);
      res.status(500).json({ message: "Failed to delete contract template" });
    }
  });

  app.post('/api/issue-reports', async (req, res) => {
    try {
      const { insertIssueReportSchema } = await import("./validation-schemas");
      const validatedData = insertIssueReportSchema.parse(req.body);
      
      if ((req as any).user?.id) {
        validatedData.userId = typeof (req as any).user.id === 'string' ? parseInt((req as any).user.id) : (req as any).user.id;
      }
      
      const issueReport = await storage.createIssueReport(validatedData);
      res.status(201).json(issueReport);
    } catch (error) {
      console.error("Error creating issue report:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create issue report" });
    }
  });

  app.get('/api/issue-reports', isAuthenticated, async (req, res) => {
    try {
      const issueReports = await storage.getAllIssueReports();
      res.json(issueReports);
    } catch (error) {
      console.error("Error fetching issue reports:", error);
      res.status(500).json({ message: "Failed to fetch issue reports" });
    }
  });

  app.get('/api/issue-reports/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const issueReport = await storage.getIssueReport(id);
      
      if (!issueReport) {
        return res.status(404).json({ message: "Issue report not found" });
      }
      
      res.json(issueReport);
    } catch (error) {
      console.error("Error fetching issue report:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to fetch issue report" });
    }
  });

  app.put('/api/issue-reports/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      
      const updateData = z.object({
        status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
        priority: z.enum(["low", "medium", "high", "critical"]).optional(),
        assignedTo: z.number().int().positive().optional().nullable(),
      }).parse(req.body);
      
      const issueReport = await storage.updateIssueReport(id, updateData);
      
      if (!issueReport) {
        return res.status(404).json({ message: "Issue report not found" });
      }
      
      res.json(issueReport);
    } catch (error) {
      console.error("Error updating issue report:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update issue report" });
    }
  });

  app.post("/api/google-contacts/sync", isAuthenticated, async (req, res) => {
    try {
      const { userEmail } = req.body;
      
      if (!userEmail) {
        return res.status(400).json({ message: 'User email is required for Google Contacts sync' });
      }

      const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
      if (!serviceAccountKey) {
        return res.status(400).json({ 
          message: 'Google Contacts not configured', 
          configured: false 
        });
      }

      const { GoogleContactsSyncEngine } = await import('./googleContactsSync');
      const syncEngine = new GoogleContactsSyncEngine(userEmail);

      const result = await syncEngine.performFullSync();

      res.json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      console.error('Error syncing Google Contacts:', error);
      res.status(500).json({ message: error.message || 'Failed to sync Google Contacts' });
    }
  });

  app.get("/api/google-contacts/status", isAuthenticated, async (req, res) => {
    try {
      const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
      
      res.json({
        configured: !!serviceAccountKey,
        lastSync: null,
      });
    } catch (error: any) {
      console.error('Error getting Google Contacts status:', error);
      res.status(500).json({ message: error.message || 'Failed to get status' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
