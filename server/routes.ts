import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { setupAuth, isAuthenticated } from "./replitAuth";
import {
  insertContractTemplateSchema,
  createUserSchema,
  updateUserSchema,
  idParamSchema,
  bulkUpdateProductsSchema,
} from "./validation-schemas";
import { nanoid } from "nanoid";
import multer from "multer";
import { extractProductsFromPriceSheet } from "./openai";

import { registerAccountRoutes } from "./routes/accountRoutes";
import { registerQuoteRoutes } from "./routes/quoteRoutes";
import { registerLineItemRoutes } from "./routes/lineItemRoutes";
import { registerProductRoutes } from "./routes/productRoutes";
import { registerImageRoutes } from "./routes/imageRoutes";
import { registerAIAssistantRoutes } from "./routes/aiAssistantRoutes";

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
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
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

  registerImageRoutes(app);
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
      res.json(users);
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
      res.status(201).json(user);
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

      res.json(updatedUser);
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

          const manufacturerDiscount = retailPrice - cost;

          let existingProduct = productLookupByName.get(name.toLowerCase().trim());
          if (!existingProduct && sku) {
            existingProduct = productLookupBySku.get(sku.toUpperCase());
          }

          if (existingProduct) {
            const updateData: any = {
              retailPrice: retailPrice.toString(),
              defaultDiscountType: 'dollar',
              defaultDiscountValue: manufacturerDiscount.toString(),
            };
            
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
              description: description || '',
              manufacturer: manufacturer || 'Imported',
              category: category || null,
              retailPrice: retailPrice.toString(),
              defaultDiscountType: 'dollar' as const,
              defaultDiscountValue: manufacturerDiscount.toString(),
              unit: unit || 'each',
            };
            
            const newProduct = await storage.createProduct(productData);
            productLookupByName.set(name.toLowerCase().trim(), newProduct);
            if (sku) {
              productLookupBySku.set(sku.toUpperCase(), newProduct);
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

      const useSSE = (req.headers.accept || '').includes('text/event-stream');
      console.log(`AI product import: ${file.originalname} (${fileType}, ${(file.size / 1024).toFixed(1)} KB, sse=${useSSE})`);

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
        });

        res.write(`data: ${JSON.stringify({
          type: 'complete',
          success: true,
          products: result.products,
          detectedManufacturer: result.detectedManufacturer,
          totalExtracted: result.products.length,
        })}\n\n`);
        res.end();
      } else {
        const result = await extractProductsFromPriceSheet(file.buffer, fileType, file.originalname);
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

  app.get('/api/quickbooks/connect', isAuthenticated, async (req, res) => {
    try {
      const { createQuickBooksService } = await import('./quickbooks');
      const qbService = createQuickBooksService();
      
      if (!qbService) {
        return res.status(500).json({ message: 'QuickBooks integration not configured' });
      }

      const state = nanoid();
      (req.session as any).qbState = state;
      
      req.session.save((err) => {
        if (err) {
          console.error('Failed to save session state:', err);
          return res.status(500).json({ message: 'Failed to save session state' });
        }
        
        const authUrl = qbService.getAuthorizationUrl(state);
        console.log('QuickBooks OAuth initiated with state:', state);
        res.json({ authUrl });
      });
    } catch (error) {
      console.error('Error initiating QuickBooks connection:', error);
      res.status(500).json({ message: 'Failed to initiate QuickBooks connection' });
    }
  });

  app.get('/api/quickbooks/callback', async (req, res) => {
    try {
      const { code, state, realmId } = req.query;
      
      console.log('QuickBooks callback received:', { 
        hasCode: !!code, 
        hasState: !!state, 
        hasRealmId: !!realmId,
        sessionState: (req.session as any).qbState 
      });
      
      if (!code || !state || !realmId) {
        console.error('QuickBooks callback missing params:', { code: !!code, state: !!state, realmId: !!realmId });
        return res.redirect('/admin/quickbooks?qb_error=missing_params');
      }

      const sessionState = (req.session as any).qbState;
      if (state !== sessionState) {
        console.error('QuickBooks callback state mismatch:', { 
          receivedState: state, 
          sessionState: sessionState,
          sessionExists: !!req.session
        });
        return res.redirect('/admin/quickbooks?qb_error=invalid_state');
      }

      const { createQuickBooksService } = await import('./quickbooks');
      const qbService = createQuickBooksService();
      
      if (!qbService) {
        console.error('QuickBooks service not configured');
        return res.redirect('/admin/quickbooks?qb_error=not_configured');
      }

      console.log('Exchanging code for tokens...');
      const tokens = await qbService.exchangeCodeForTokens(code as string);
      const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000);
      
      console.log('Saving QuickBooks settings for realmId:', realmId);
      await storage.saveQuickBooksSettings({
        realmId: realmId as string,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: expiresAt
      });

      delete (req.session as any).qbState;
      console.log('QuickBooks connection successful!');
      res.redirect('/admin/quickbooks?qb_connected=true');
    } catch (error: any) {
      console.error('Error in QuickBooks callback:', error);
      const errorMessage = error.message || 'auth_failed';
      const encodedError = encodeURIComponent(errorMessage);
      res.redirect(`/admin/quickbooks?qb_error=${encodedError}`);
    }
  });

  app.get('/api/quickbooks/status', isAuthenticated, async (req, res) => {
    try {
      const settings = await storage.getQuickBooksSettings();
      res.json({ 
        connected: !!settings && settings.isActive,
        realmId: settings?.realmId || null
      });
    } catch (error) {
      console.error('Error checking QuickBooks status:', error);
      res.status(500).json({ message: 'Failed to check QuickBooks status' });
    }
  });

  app.post('/api/quickbooks/disconnect', isAuthenticated, async (req, res) => {
    try {
      const { createQuickBooksService } = await import('./quickbooks');
      const qbService = createQuickBooksService();
      
      if (qbService) {
        await qbService.revokeTokens();
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error disconnecting QuickBooks:', error);
      res.status(500).json({ message: 'Failed to disconnect QuickBooks' });
    }
  });

  app.post('/api/quickbooks/sync-quote/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const { createQuickBooksService } = await import('./quickbooks');
      const qbService = createQuickBooksService();
      
      if (!qbService) {
        return res.status(500).json({ message: 'QuickBooks integration not configured' });
      }

      const quote = await storage.getQuoteWithDetails(id);
      if (!quote) {
        return res.status(404).json({ message: 'Quote not found' });
      }

      if (!quote.account) {
        return res.status(400).json({ message: 'Quote must have an associated customer' });
      }

      await storage.updateQuoteQbSync(id, {
        qbSyncStatus: 'pending',
        qbSyncError: undefined
      });

      let qbCustomerId = quote.account.qbCustomerId;

      if (!qbCustomerId) {
        const qbCustomer = await qbService.createCustomer({
          name: quote.account.name,
          email: quote.account.email,
          phone: quote.account.phone,
          billingAddress: quote.account.billingAddress || undefined
        });

        if (!qbCustomer) {
          await storage.updateQuoteQbSync(id, {
            qbSyncStatus: 'error',
            qbSyncError: 'Failed to create customer in QuickBooks'
          });
          return res.status(500).json({ message: 'Failed to create customer in QuickBooks' });
        }

        qbCustomerId = qbCustomer.id;
        await storage.updateAccountQbCustomerId(quote.account.id, qbCustomerId);
      }

      const lineItems = quote.lineItems.map(item => ({
        description: item.description,
        quantity: item.quantity,
        amount: parseFloat(item.unitPrice) * parseFloat(item.quantity)
      }));

      const estimate = await qbService.createEstimate({
        quoteNumber: quote.quoteNumber,
        customerId: qbCustomerId,
        lineItems,
        taxRate: parseFloat(quote.taxRate || '0'),
        discount: parseFloat(quote.discount || '0'),
        shipping: parseFloat(quote.shipping || '0'),
        isShippingTaxable: quote.isShippingTaxable ?? undefined,
        projectName: quote.projectName || undefined,
        notes: quote.notes || undefined
      });

      if (!estimate) {
        await storage.updateQuoteQbSync(id, {
          qbSyncStatus: 'error',
          qbSyncError: 'Failed to create estimate in QuickBooks'
        });
        return res.status(500).json({ message: 'Failed to create estimate in QuickBooks' });
      }

      await storage.updateQuoteQbSync(id, {
        qbEstimateId: estimate.id,
        qbSyncStatus: 'synced',
        qbSyncedAt: new Date(),
        qbSyncError: undefined
      });

      res.json({ 
        success: true, 
        estimateId: estimate.id,
        docNumber: estimate.docNumber
      });
    } catch (error: any) {
      console.error('Error syncing quote to QuickBooks:', error);
      
      const { id } = req.params;
      await storage.updateQuoteQbSync(parseInt(id), {
        qbSyncStatus: 'error',
        qbSyncError: error.message || 'Unknown error occurred'
      });
      
      res.status(500).json({ message: error.message || 'Failed to sync quote to QuickBooks' });
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
