import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  insertCustomerSchema, insertQuoteSchema, insertLineItemSchema, insertProductSchema, insertContractTemplateSchema, insertProposalTemplateSchema, insertPricingTableSchema, insertProductAccessorySchema, insertLeadSchema, insertTaskSchema, insertLeadActivitySchema, insertAccountSchema, insertAccountRoleSchema, insertContactSchema, insertContactRoleSchema, insertOpportunitySchema, insertActivitySchema,
  // Project management insert schemas
  insertProjectSchema, insertProjectMilestoneSchema, insertProjectTaskSchema, insertProjectTaskDependencySchema, insertProjectTaskAssignmentSchema, insertProjectCrewSchema, insertProjectEquipmentSchema, insertProjectBudgetLineSchema, insertProjectScheduleEventSchema, insertProjectProgressSchema, insertProjectTimeEntrySchema, insertProjectMaterialSchema, insertProjectChangeOrderSchema, insertProjectPurchaseOrderSchema, insertProjectMaterialReceiptSchema, insertProjectLineItemLinkSchema, insertProjectFinancialSchema
} from "@shared/schema";
import { z } from "zod";
import { setupAuth, isAuthenticated } from "./replitAuth";
import multer from "multer";
import * as XLSX from "xlsx";
import { parsePDF } from "./pdf-parser";
import { extractProductsFromImage, extractProductsFromText, extractQuoteDataFromText } from "./openai";
import type { ExtractedProduct } from "./openai";
import DocuSignService from "./docusign";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { ObjectPermission } from "./objectAcl";

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/pdf',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/jpg',
      'image/png'
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  },
});

// ========================================
// PROJECT AUTHORIZATION MIDDLEWARE
// ========================================

// Middleware to validate project ownership or access permissions
const validateProjectAccess = (requiredPermission: 'read' | 'write' | 'admin' = 'read') => {
  return async (req: any, res: any, next: any) => {
    try {
      const projectId = parseInt(req.params.id || req.params.projectId);
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      if (!projectId || isNaN(projectId)) {
        return res.status(400).json({ message: "Valid project ID required" });
      }

      const access = await storage.validateProjectAccess(projectId, userId, requiredPermission);
      
      if (!access.isValid) {
        return res.status(403).json({ 
          message: "Insufficient permissions to access this project",
          required: requiredPermission 
        });
      }

      // Attach access information to request for downstream use
      req.projectAccess = access;
      req.projectId = projectId;
      next();
    } catch (error) {
      console.error(`Project authorization error:`, error);
      res.status(500).json({ message: "Authorization check failed" });
    }
  };
};

// Middleware for validating project task access
const validateProjectTaskAccess = async (req: any, res: any, next: any) => {
  try {
    const taskId = parseInt(req.params.id);
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    if (!taskId || isNaN(taskId)) {
      return res.status(400).json({ message: "Valid task ID required" });
    }

    const access = await storage.validateProjectTaskAccess(taskId, userId);
    
    if (!access.isValid) {
      return res.status(403).json({ message: "Insufficient permissions to access this task" });
    }

    req.taskAccess = access;
    req.taskId = taskId;
    next();
  } catch (error) {
    console.error(`Task authorization error:`, error);
    res.status(500).json({ message: "Task authorization check failed" });
  }
};

// Middleware for validating project milestone access
const validateProjectMilestoneAccess = async (req: any, res: any, next: any) => {
  try {
    const milestoneId = parseInt(req.params.id);
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    if (!milestoneId || isNaN(milestoneId)) {
      return res.status(400).json({ message: "Valid milestone ID required" });
    }

    const access = await storage.validateProjectMilestoneAccess(milestoneId, userId);
    
    if (!access.isValid) {
      return res.status(403).json({ message: "Insufficient permissions to access this milestone" });
    }

    req.milestoneAccess = access;
    req.milestoneId = milestoneId;
    next();
  } catch (error) {
    console.error(`Milestone authorization error:`, error);
    res.status(500).json({ message: "Milestone authorization check failed" });
  }
};

// Middleware for validating project crew access
const validateProjectCrewAccess = async (req: any, res: any, next: any) => {
  try {
    const crewId = parseInt(req.params.id);
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    if (!crewId || isNaN(crewId)) {
      return res.status(400).json({ message: "Valid crew ID required" });
    }

    const access = await storage.validateProjectCrewAccess(crewId, userId);
    
    if (!access.isValid) {
      return res.status(403).json({ message: "Insufficient permissions to access this crew assignment" });
    }

    req.crewAccess = access;
    req.crewId = crewId;
    next();
  } catch (error) {
    console.error(`Crew authorization error:`, error);
    res.status(500).json({ message: "Crew authorization check failed" });
  }
};

// Middleware for validating project equipment access
const validateProjectEquipmentAccess = async (req: any, res: any, next: any) => {
  try {
    const equipmentId = parseInt(req.params.id);
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    if (!equipmentId || isNaN(equipmentId)) {
      return res.status(400).json({ message: "Valid equipment ID required" });
    }

    const access = await storage.validateProjectEquipmentAccess(equipmentId, userId);
    
    if (!access.isValid) {
      return res.status(403).json({ message: "Insufficient permissions to access this equipment allocation" });
    }

    req.equipmentAccess = access;
    req.equipmentId = equipmentId;
    next();
  } catch (error) {
    console.error(`Equipment authorization error:`, error);
    res.status(500).json({ message: "Equipment authorization check failed" });
  }
};

// Middleware for validating project material access
const validateProjectMaterialAccess = async (req: any, res: any, next: any) => {
  try {
    const materialId = parseInt(req.params.id);
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    if (!materialId || isNaN(materialId)) {
      return res.status(400).json({ message: "Valid material ID required" });
    }

    const access = await storage.validateProjectMaterialAccess(materialId, userId);
    
    if (!access.isValid) {
      return res.status(403).json({ message: "Insufficient permissions to access this material" });
    }

    req.materialAccess = access;
    req.materialId = materialId;
    next();
  } catch (error) {
    console.error(`Material authorization error:`, error);
    res.status(500).json({ message: "Material authorization check failed" });
  }
};

// Middleware for validating project financial access
const validateProjectFinancialAccess = async (req: any, res: any, next: any) => {
  try {
    const projectId = parseInt(req.params.id || req.params.projectId);
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    if (!projectId || isNaN(projectId)) {
      return res.status(400).json({ message: "Valid project ID required" });
    }

    const access = await storage.validateProjectFinancialAccess(projectId, userId);
    
    if (!access.isValid) {
      return res.status(403).json({ message: "Insufficient permissions to access financial data" });
    }

    req.financialAccess = access;
    req.projectId = projectId;
    next();
  } catch (error) {
    console.error(`Financial authorization error:`, error);
    res.status(500).json({ message: "Financial authorization check failed" });
  }
};

// Helper middleware for validating account access
const validateAccountAccess = async (req: any, res: any, next: any) => {
  try {
    const accountId = parseInt(req.params.accountId || req.params.id);
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    if (!accountId || isNaN(accountId)) {
      return res.status(400).json({ message: "Valid account ID required" });
    }

    const hasAccess = await storage.validateAccountAccess(accountId, userId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Insufficient permissions to access this account" });
    }

    req.accountId = accountId;
    next();
  } catch (error) {
    console.error(`Account authorization error:`, error);
    res.status(500).json({ message: "Account authorization check failed" });
  }
};

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  setupAuth(app);

  // User authentication routes
  app.get('/api/user', async (req: any, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    try {
      const user = await storage.getUser(req.user?.id);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Real image upload endpoints using Object Storage
  // Note: Import moved to top of file below

  // Get upload URL for image uploads
  app.post("/api/images/upload-url", isAuthenticated, async (req, res) => {
    try {
      const { imageType, filename } = req.body;
      
      if (!imageType || !filename) {
        return res.status(400).json({ message: "imageType and filename are required" });
      }
      
      const objectStorageService = new ObjectStorageService();
      // Create a custom path based on image type and filename
      const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
      const timestamp = Date.now();
      const customPath = `${imageType}s/${timestamp}-${sanitizedFilename}`;
      
      const { url, objectPath } = await objectStorageService.getObjectEntityUploadURL(customPath);
      
      console.log(`🔧 Generated upload URL for ${imageType}: ${objectPath}`);
      
      res.json({ 
        uploadUrl: url, 
        objectPath: objectPath,
        publicUrl: `${req.protocol}://${req.get('host')}/objects${objectPath.replace('/objects', '')}`
      });
    } catch (error) {
      console.error("❌ Error generating upload URL:", error);
      res.status(500).json({ message: "Failed to generate upload URL" });
    }
  });

  // Set ACL policy after successful upload
  app.post("/api/images/finalize-upload", isAuthenticated, async (req, res) => {
    try {
      const { objectPath } = req.body;
      const userId = req.user?.id;
      
      if (!objectPath || !userId) {
        return res.status(400).json({ message: "objectPath and authenticated user required" });
      }
      
      const objectStorageService = new ObjectStorageService();
      
      // Set ACL policy - making images public for now (quotes are shareable)
      const normalizedPath = await objectStorageService.trySetObjectEntityAclPolicy(
        objectPath,
        {
          owner: userId,
          visibility: "public", // Images in quotes should be publicly accessible
        }
      );
      
      console.log(`✅ Finalized upload: ${normalizedPath}`);
      
      res.json({
        success: true,
        objectPath: normalizedPath,
        publicUrl: `${req.protocol}://${req.get('host')}${normalizedPath}`
      });
    } catch (error) {
      console.error("❌ Error finalizing upload:", error);
      res.status(500).json({ message: "Failed to finalize upload" });
    }
  });

  // Serve uploaded objects (with ACL check)
  app.get("/objects/:objectPath(*)", isAuthenticated, async (req, res) => {
    const userId = req.user?.id;
    const objectStorageService = new ObjectStorageService();
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(`/objects/${req.params.objectPath}`);
      const canAccess = await objectStorageService.canAccessObjectEntity({
        objectFile,
        userId: userId,
        requestedPermission: ObjectPermission.READ,
      });
      if (!canAccess) {
        return res.sendStatus(401);
      }
      await objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error accessing object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  // Image proxy endpoint to bypass CORS for object storage images
  app.get("/api/image-proxy", isAuthenticated, async (req, res) => {
    try {
      const imageUrl = req.query.url as string;
      
      if (!imageUrl) {
        return res.status(400).json({ message: "URL parameter required" });
      }
      
      // Only allow Replit storage URLs for security
      if (!imageUrl.includes('storage.replit.com') && !imageUrl.includes('/objects/')) {
        return res.status(403).json({ message: "Only Replit storage URLs allowed" });
      }
      
      console.log(`🔧 Proxying image request: ${imageUrl}`);
      
      // If it's an internal objects URL, handle directly
      if (imageUrl.includes('/objects/')) {
        const objectPath = imageUrl.split('/objects/')[1];
        const objectStorageService = new ObjectStorageService();
        try {
          const objectFile = await objectStorageService.getObjectEntityFile(`/objects/${objectPath}`);
          await objectStorageService.downloadObject(objectFile, res);
          return;
        } catch (error) {
          console.error(`❌ Failed to serve internal object: ${error}`);
          return res.status(404).json({ message: "Object not found" });
        }
      }
      
      // Fetch the image from external object storage
      const response = await fetch(imageUrl);
      
      if (!response.ok) {
        console.error(`❌ Failed to fetch image: ${response.status} ${response.statusText}`);
        return res.status(response.status).json({ message: `Failed to fetch image: ${response.statusText}` });
      }
      
      // Get the image data as buffer
      const buffer = await response.arrayBuffer();
      const contentType = response.headers.get('content-type') || 'application/octet-stream';
      
      console.log(`✅ Successfully proxied image: ${imageUrl} (${buffer.byteLength} bytes, ${contentType})`);
      
      // Set appropriate headers and send the image
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', buffer.byteLength.toString());
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
      
      res.send(Buffer.from(buffer));
      
    } catch (error) {
      console.error("❌ Image proxy error:", error);
      res.status(500).json({ message: "Failed to proxy image" });
    }
  });

  // Customer routes (protected)
  app.get("/api/customers", isAuthenticated, async (req, res) => {
    try {
      const customers = await storage.getAllCustomers();
      res.json(customers);
    } catch (error) {
      console.error("Error fetching customers:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/customers/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const customer = await storage.getCustomer(id);
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }
      res.json(customer);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/customers", isAuthenticated, async (req, res) => {
    try {
      const customerData = insertCustomerSchema.parse(req.body);
      
      // Check if customer already exists by email
      const existingCustomer = await storage.getCustomerByEmail(customerData.email);
      if (existingCustomer) {
        return res.json(existingCustomer);
      }
      
      const customer = await storage.createCustomer(customerData);
      res.status(201).json(customer);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid customer data", errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/customers/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const customerData = insertCustomerSchema.partial().parse(req.body);
      const customer = await storage.updateCustomer(id, customerData);
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }
      res.json(customer);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid customer data", errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Quote routes (protected)
  app.get("/api/quotes", isAuthenticated, async (req, res) => {
    try {
      console.log("Attempting to get all quotes...");
      const quotes = await storage.getAllQuotes();
      console.log(`Found ${quotes.length} quotes`);
      res.json(quotes);
    } catch (error) {
      console.error("Error in /api/quotes:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/quotes/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const quote = await storage.getQuoteWithDetails(id);
      if (!quote) {
        return res.status(404).json({ message: "Quote not found" });
      }
      res.json(quote);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/quotes", isAuthenticated, async (req, res) => {
    try {
      console.log("Quote creation request body:", JSON.stringify(req.body, null, 2));
      const quoteData = insertQuoteSchema.parse(req.body);
      const quote = await storage.createQuote(quoteData);
      res.status(201).json(quote);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("Quote validation errors:", JSON.stringify(error.errors, null, 2));
        return res.status(400).json({ message: "Invalid quote data", errors: error.errors });
      }
      console.error("Quote creation error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/quotes/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const quoteData = insertQuoteSchema.partial().parse(req.body);
      const quote = await storage.updateQuote(id, quoteData);
      if (!quote) {
        return res.status(404).json({ message: "Quote not found" });
      }
      res.json(quote);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid quote data", errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/quotes/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteQuote(id);
      if (!deleted) {
        return res.status(404).json({ message: "Quote not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // PDF Quote Import endpoint
  app.post("/api/quotes/import-pdf", isAuthenticated, upload.single('pdf'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No PDF file uploaded" });
      }

      if (req.file.mimetype !== 'application/pdf') {
        return res.status(400).json({ message: "File must be a PDF" });
      }

      // Extract text from PDF
      const pdfData = await parsePDF(req.file.buffer);
      if (!pdfData.text.trim()) {
        return res.status(400).json({ message: "Failed to extract text from PDF" });
      }

      // Extract quote data using AI
      const extractedQuoteData = await extractQuoteDataFromText(pdfData.text);
      
      if (!extractedQuoteData) {
        return res.status(400).json({ message: "Failed to extract quote data from PDF" });
      }

      res.json({
        success: true,
        data: extractedQuoteData,
        originalText: pdfData.text.substring(0, 500) + '...' // Preview of extracted text
      });

    } catch (error) {
      console.error("Error processing PDF quote import:", error);
      res.status(500).json({ 
        message: "Failed to process PDF quote import",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Line item routes (protected)
  app.get("/api/quotes/:quoteId/line-items", isAuthenticated, async (req, res) => {
    try {
      const quoteId = parseInt(req.params.quoteId);
      const lineItems = await storage.getLineItemsByQuoteId(quoteId);
      res.json(lineItems);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/quotes/:quoteId/line-items", isAuthenticated, async (req, res) => {
    try {
      const quoteId = parseInt(req.params.quoteId);
      const lineItemData = insertLineItemSchema.parse({ ...req.body, quoteId });
      const lineItem = await storage.createLineItem(lineItemData);
      res.status(201).json(lineItem);
    } catch (error) {

      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid line item data", errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/line-items/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const lineItemData = insertLineItemSchema.partial().parse(req.body);
      const lineItem = await storage.updateLineItem(id, lineItemData);
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
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteLineItem(id);
      if (!deleted) {
        return res.status(404).json({ message: "Line item not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Bulk operations for line items
  app.delete("/api/line-items/bulk", isAuthenticated, async (req: any, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "ids array is required and must not be empty" });
      }

      // Validate all integers
      const lineItemIds = ids.map(id => parseInt(id)).filter(id => !isNaN(id));
      if (lineItemIds.length !== ids.length) {
        return res.status(400).json({ message: "All IDs must be valid integers" });
      }

      // Authorization check: validate ownership and same quote
      const ownership = await storage.validateLineItemsOwnership(lineItemIds, req.user?.id);
      if (!ownership.isValid) {
        return res.status(403).json({ message: "Unauthorized: You can only delete your own line items from the same quote" });
      }

      // Additional quote ownership validation
      if (ownership.quoteId && !await storage.validateQuoteOwnership(ownership.quoteId, req.user?.id)) {
        return res.status(403).json({ message: "Unauthorized: You don't have access to this quote" });
      }

      const deletedCount = await storage.bulkDeleteLineItems(lineItemIds);
      res.json({ deletedCount });
    } catch (error) {
      console.error("Bulk delete error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/line-items/bulk", isAuthenticated, async (req: any, res) => {
    try {
      const { ids, updates } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "ids array is required and must not be empty" });
      }
      if (!updates || typeof updates !== 'object') {
        return res.status(400).json({ message: "updates object is required" });
      }

      // Validate all integers
      const lineItemIds = ids.map(id => parseInt(id)).filter(id => !isNaN(id));
      if (lineItemIds.length !== ids.length) {
        return res.status(400).json({ message: "All IDs must be valid integers" });
      }

      // Authorization check: validate ownership and same quote
      const ownership = await storage.validateLineItemsOwnership(lineItemIds, req.user?.id);
      if (!ownership.isValid) {
        return res.status(403).json({ message: "Unauthorized: You can only update your own line items from the same quote" });
      }

      // Additional quote ownership validation
      if (ownership.quoteId && !await storage.validateQuoteOwnership(ownership.quoteId, req.user?.id)) {
        return res.status(403).json({ message: "Unauthorized: You don't have access to this quote" });
      }

      // Whitelist allowed fields to prevent mass assignment vulnerabilities
      const allowedFields = ['discountType', 'discountValue', 'markupType', 'markupValue', 'quantity', 'unitPrice', 'description'];
      const safeUpdates: any = {};
      
      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          safeUpdates[key] = value;
        }
      }

      if (Object.keys(safeUpdates).length === 0) {
        return res.status(400).json({ message: "No valid fields provided for update" });
      }

      // Validate bounds for discount and markup values
      if (safeUpdates.discountValue !== undefined) {
        const discountValue = parseFloat(safeUpdates.discountValue);
        if (isNaN(discountValue) || discountValue < 0) {
          return res.status(400).json({ message: "Discount value must be a positive number" });
        }
        if (safeUpdates.discountType === 'percentage' && discountValue > 100) {
          return res.status(400).json({ message: "Discount percentage cannot exceed 100%" });
        }
      }

      if (safeUpdates.markupValue !== undefined) {
        const markupValue = parseFloat(safeUpdates.markupValue);
        if (isNaN(markupValue) || markupValue < 0) {
          return res.status(400).json({ message: "Markup value must be a positive number" });
        }
        if (safeUpdates.markupType === 'percentage' && markupValue > 1000) {
          return res.status(400).json({ message: "Markup percentage cannot exceed 1000%" });
        }
      }

      if (safeUpdates.quantity !== undefined) {
        const quantity = parseFloat(safeUpdates.quantity);
        if (isNaN(quantity) || quantity <= 0) {
          return res.status(400).json({ message: "Quantity must be a positive number" });
        }
      }

      if (safeUpdates.unitPrice !== undefined) {
        const unitPrice = parseFloat(safeUpdates.unitPrice);
        if (isNaN(unitPrice) || unitPrice < 0) {
          return res.status(400).json({ message: "Unit price must be a non-negative number" });
        }
      }
      
      // Validate the updates object against the schema (partial)
      const validatedUpdates = insertLineItemSchema.partial().parse(safeUpdates);
      const updatedCount = await storage.bulkUpdateLineItems(lineItemIds, validatedUpdates);
      res.json({ updatedCount });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid update data", errors: error.errors });
      }
      console.error("Bulk update error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // PDF template route - now handled client-side
  app.get("/api/quotes/:id/pdf-template", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const quote = await storage.getQuoteWithDetails(id);
      if (!quote) {
        return res.status(404).json({ message: "Quote not found" });
      }

      // Return quote data for PDF template
      res.json(quote);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Product catalog routes (protected)
  app.get("/api/products", isAuthenticated, async (req, res) => {
    try {
      const products = await storage.getAllProducts();
      res.json(products);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/products/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const product = await storage.getProduct(id);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      res.json(product);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/products", isAuthenticated, async (req, res) => {
    try {
      const productData = insertProductSchema.parse(req.body);
      const product = await storage.createProduct(productData);
      res.status(201).json(product);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid product data", errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/products/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const productData = insertProductSchema.partial().parse(req.body);
      const product = await storage.updateProduct(id, productData);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      res.json(product);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid product data", errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/products/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteProduct(id);
      if (!deleted) {
        return res.status(404).json({ message: "Product not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Enhanced product endpoint with pricing tables and accessories
  app.get("/api/products/:id/with-details", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const productWithDetails = await storage.getProductWithDetails(id);
      if (!productWithDetails) {
        return res.status(404).json({ message: "Product not found" });
      }
      res.json(productWithDetails);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Pricing tables routes
  app.get("/api/products/:productId/pricing-tables", isAuthenticated, async (req, res) => {
    try {
      const productId = parseInt(req.params.productId);
      const pricingTables = await storage.getPricingTablesByProductId(productId);
      res.json(pricingTables);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/products/:productId/pricing-tables", isAuthenticated, async (req, res) => {
    try {
      const productId = parseInt(req.params.productId);
      const pricingData = insertPricingTableSchema.parse({ ...req.body, productId });
      const pricingTable = await storage.createPricingTable(pricingData);
      res.status(201).json(pricingTable);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid pricing table data", errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/pricing-tables/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const pricingData = insertPricingTableSchema.partial().parse(req.body);
      const pricingTable = await storage.updatePricingTable(id, pricingData);
      if (!pricingTable) {
        return res.status(404).json({ message: "Pricing table not found" });
      }
      res.json(pricingTable);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid pricing table data", errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/pricing-tables/:id", isAuthenticated, async (req, res) => {
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

  // Product accessories routes
  app.get("/api/products/:productId/accessories", isAuthenticated, async (req, res) => {
    try {
      const productId = parseInt(req.params.productId);
      const accessories = await storage.getProductAccessoriesByProductId(productId);
      res.json(accessories);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/products/:productId/accessories", isAuthenticated, async (req, res) => {
    try {
      const productId = parseInt(req.params.productId);
      const accessoryData = insertProductAccessorySchema.parse({ ...req.body, baseProductId: productId });
      const accessory = await storage.createProductAccessory(accessoryData);
      res.status(201).json(accessory);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid accessory data", errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/product-accessories/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const accessoryData = insertProductAccessorySchema.partial().parse(req.body);
      const accessory = await storage.updateProductAccessory(id, accessoryData);
      if (!accessory) {
        return res.status(404).json({ message: "Product accessory not found" });
      }
      res.json(accessory);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid accessory data", errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/product-accessories/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteProductAccessory(id);
      if (!deleted) {
        return res.status(404).json({ message: "Product accessory not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Calculate pricing for configurable products
  app.post("/api/products/:productId/calculate-price", isAuthenticated, async (req, res) => {
    try {
      const productId = parseInt(req.params.productId);
      const { length, width } = req.body;
      
      if (!length || !width) {
        return res.status(400).json({ message: "Length and width are required" });
      }
      
      const price = await storage.calculateConfigurableProductPrice(productId, parseFloat(length), parseFloat(width));
      if (price === null) {
        return res.status(404).json({ message: "No pricing found for these dimensions" });
      }
      
      res.json({ price, length, width });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Recalculate pricing tables when discount changes
  app.post("/api/products/:productId/recalculate-pricing", isAuthenticated, async (req, res) => {
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
  app.post("/api/products/:productId/pricing-tables/bulk-upload", isAuthenticated, async (req, res) => {
    try {
      const productId = parseInt(req.params.productId);
      const { pricingData } = req.body;

      if (!Array.isArray(pricingData) || pricingData.length === 0) {
        return res.status(400).json({ message: "Valid pricing data array is required" });
      }

      // Validate pricing data format
      for (const item of pricingData) {
        if (!item.lengthMin || !item.lengthMax || !item.widthMin || !item.widthMax || !item.retailPrice || !item.basePrice || 
            item.lengthMin <= 0 || item.lengthMax <= 0 || item.widthMin <= 0 || item.widthMax <= 0 || item.retailPrice <= 0 || item.basePrice <= 0) {
          return res.status(400).json({ 
            message: "Each pricing entry must have valid lengthMin, lengthMax, widthMin, widthMax, retailPrice, and basePrice values" 
          });
        }
        
        // Validate that min values are less than max values
        if (item.lengthMin >= item.lengthMax || item.widthMin >= item.widthMax) {
          return res.status(400).json({ 
            message: "Min values must be less than max values for each dimension" 
          });
        }
      }

      // Clear existing pricing tables for this product
      await storage.deletePricingTablesByProductId(productId);

      const results = [];
      for (const item of pricingData) {
        const pricingTable = await storage.createPricingTable({
          productId,
          lengthMin: parseFloat(item.lengthMin.toString()).toString(),
          lengthMax: parseFloat(item.lengthMax.toString()).toString(),
          widthMin: parseFloat(item.widthMin.toString()).toString(),
          widthMax: parseFloat(item.widthMax.toString()).toString(),
          retailPrice: parseFloat(item.retailPrice.toString()).toString(),
          basePrice: parseFloat(item.basePrice.toString()).toString()
        });
        results.push(pricingTable);
      }

      res.status(201).json({ 
        message: `Successfully uploaded ${results.length} pricing entries`,
        data: results
      });
    } catch (error) {
      console.error("Error bulk uploading pricing data:", error);
      res.status(500).json({ message: "Failed to upload pricing data" });
    }
  });

  // Admin routes
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

      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const user = await storage.createUser(req.body);
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

      const userId = req.params.id; // Don't parse as int, keep as string/number as needed
      const updateData = req.body;

      // If updating username, check for conflicts
      if (updateData.username) {
        const existingUser = await storage.getUserByUsername(updateData.username);
        if (existingUser && existingUser.id.toString() !== userId.toString()) {
          return res.status(400).json({ message: "Username already exists" });
        }
      }

      const updatedUser = await storage.updateUser(userId, updateData);
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

      const userId = req.params.id; // Don't parse as int, keep as string/number as needed
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

  // Data Migration endpoints for converting customers to CRM structure
  app.get("/api/migration/status", isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.user?.id);
      if (currentUser?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const status = await storage.getMigrationStatus();
      res.json(status);
    } catch (error) {
      console.error("Error getting migration status:", error);
      res.status(500).json({ message: "Failed to get migration status" });
    }
  });

  app.post("/api/migration/customers", isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.user?.id);
      if (currentUser?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      console.log("🚀 Starting customer migration...");
      const result = await storage.migrateCustomersToAccountsAndContacts();
      
      res.json({
        success: result.success,
        message: result.success ? 
          `Successfully migrated ${result.migratedCustomers} customers to accounts and contacts` :
          `Migration completed with errors: ${result.errors.length} errors`,
        data: result
      });
    } catch (error) {
      console.error("Error during customer migration:", error);
      res.status(500).json({ 
        success: false,
        message: "Failed to migrate customers",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.post("/api/migration/quotes", isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.user?.id);
      if (currentUser?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      console.log("🚀 Starting quote migration...");
      const result = await storage.migrateQuotesToOpportunities();
      
      res.json({
        success: result.success,
        message: result.success ? 
          `Successfully migrated ${result.migratedQuotes} quotes to opportunities` :
          `Migration completed with errors: ${result.errors.length} errors`,
        data: result
      });
    } catch (error) {
      console.error("Error during quote migration:", error);
      res.status(500).json({ 
        success: false,
        message: "Failed to migrate quotes",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Price list upload endpoint
  app.post('/api/admin/upload-price-list', isAuthenticated, upload.single('file'), async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.user?.id);
      if (currentUser?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const file = req.file;
      let extractedProducts: ExtractedProduct[] = [];
      const errors: string[] = [];

      // Process based on file type
      if (file.mimetype === 'application/pdf') {
        // Process PDF
        const pdfData = await parsePDF(file.buffer);
        if (pdfData.text.trim()) {
          extractedProducts = await extractProductsFromText(pdfData.text);
          if (extractedProducts.length === 0) {
            errors.push("No products found in PDF content");
          }
        } else {
          errors.push("Failed to extract text from PDF");
        }
      } else if (file.mimetype.includes('excel') || file.mimetype.includes('spreadsheet')) {
        // Process Excel
        try {
          const workbook = XLSX.read(file.buffer, { type: 'buffer' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet);
          
          // Map Excel data to our product format
          extractedProducts = jsonData.map((row: any) => ({
            sku: row.SKU || row.sku || row['Product Code'] || row['Item #'] || undefined,
            name: row.Name || row.name || row['Product Name'] || row['Description'] || '',
            unit: row.Unit || row.unit || row['UOM'] || row['Unit of Measure'] || 'each',
            price: parseFloat(row.Price || row.price || row['Unit Price'] || row['Cost'] || '0'),
            description: row.Description || row.description || row['Notes'] || undefined,
          })).filter((p: ExtractedProduct) => p.name && p.price > 0);
          
          if (extractedProducts.length === 0) {
            errors.push("No valid products found in Excel file");
          }
        } catch (error) {
          console.error("Excel processing error:", error);
          errors.push("Failed to process Excel file");
        }
      } else if (file.mimetype.startsWith('image/')) {
        // Process Image with OpenAI Vision
        const base64Image = file.buffer.toString('base64');
        extractedProducts = await extractProductsFromImage(base64Image);
        if (extractedProducts.length === 0) {
          errors.push("No products found in image - try a higher quality image with clear text");
        }
      }

      // Process extracted products
      let created = 0;
      let updated = 0;
      let skipped = 0;

      for (const extractedProduct of extractedProducts) {
        try {
          // Check if product with SKU already exists
          let existingProduct = null;
          if (extractedProduct.sku) {
            const allProducts = await storage.getAllProducts();
            existingProduct = allProducts.find(p => 
              p.name.toLowerCase().includes(extractedProduct.sku!.toLowerCase()) ||
              (p.description && p.description.toLowerCase().includes(extractedProduct.sku!.toLowerCase()))
            );
          }

          if (existingProduct) {
            // Update existing product
            await storage.updateProduct(existingProduct.id, {
              defaultUnitPrice: extractedProduct.price.toString(),
              unit: extractedProduct.unit || existingProduct.unit,
            });
            updated++;
          } else {
            // Create new product
            await storage.createProduct({
              name: extractedProduct.sku ? `${extractedProduct.name} (${extractedProduct.sku})` : extractedProduct.name,
              description: extractedProduct.description || '',
              category: 'Imported',
              defaultUnitPrice: extractedProduct.price.toString(),
              defaultMarkupType: 'percentage',
              defaultMarkupValue: '25',
              defaultDiscountType: 'percentage',
              defaultDiscountValue: '0',
              unit: extractedProduct.unit || 'each',
            });
            created++;
          }
        } catch (error) {
          console.error(`Error processing product ${extractedProduct.name}:`, error);
          errors.push(`Failed to process: ${extractedProduct.name}`);
          skipped++;
        }
      }

      res.json({
        created,
        updated,
        skipped,
        errors,
        total: extractedProducts.length,
      });
    } catch (error) {
      console.error("Price list upload error:", error);
      res.status(500).json({ message: "Failed to process price list" });
    }
  });

  // Bulk update products endpoint
  app.post('/api/admin/bulk-update-products', isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.user?.id);
      if (currentUser?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { productIds, updates } = req.body;
      
      if (!Array.isArray(productIds) || productIds.length === 0) {
        return res.status(400).json({ message: "Product IDs array is required" });
      }

      if (!updates || typeof updates !== 'object') {
        return res.status(400).json({ message: "Updates object is required" });
      }

      const updatedCount = await storage.bulkUpdateProducts(productIds, updates);
      
      res.json({
        message: `Successfully updated ${updatedCount} products`,
        updatedCount
      });
    } catch (error) {
      console.error("Bulk update error:", error);
      res.status(500).json({ message: "Failed to bulk update products" });
    }
  });

  // Contract Template routes
  app.get('/api/contract-templates', isAuthenticated, async (req, res) => {
    try {
      const templates = await storage.getAllContractTemplates();
      res.json(templates);
    } catch (error) {
      console.error("Error fetching contract templates:", error);
      res.status(500).json({ message: "Failed to fetch contract templates" });
    }
  });

  app.get('/api/contract-templates/:id', isAuthenticated, async (req, res) => {
    try {
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

  // Proposal template routes (protected)
  app.get('/api/proposal-templates', isAuthenticated, async (req, res) => {
    try {
      const includeInactive = req.query.includeInactive === 'true';
      const templates = await storage.getAllProposalTemplates(includeInactive);
      res.json(templates);
    } catch (error) {
      console.error("Error fetching proposal templates:", error);
      res.status(500).json({ message: "Failed to fetch proposal templates" });
    }
  });

  app.get('/api/proposal-templates/:id', isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id) || id <= 0) {
        return res.status(400).json({ message: "Invalid template ID. Must be a positive integer." });
      }

      const template = await storage.getProposalTemplate(id);
      if (!template) {
        return res.status(404).json({ message: "Proposal template not found" });
      }
      res.json(template);
    } catch (error) {
      console.error("Error fetching proposal template:", error);
      res.status(500).json({ message: "Failed to fetch proposal template" });
    }
  });

  app.post('/api/proposal-templates', isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.user?.id);
      if (currentUser?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const validatedData = insertProposalTemplateSchema.parse(req.body);
      const template = await storage.createProposalTemplate(validatedData);
      res.status(201).json(template);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid proposal template data", errors: error.errors });
      }
      console.error("Error creating proposal template:", error);
      res.status(500).json({ message: "Failed to create proposal template" });
    }
  });

  // IMPORTANT: Default route must come BEFORE /:id route to avoid conflicts
  app.get('/api/proposal-templates/default', isAuthenticated, async (req, res) => {
    try {
      const template = await storage.getDefaultProposalTemplate();
      if (!template) {
        return res.status(404).json({ message: "No default proposal template found" });
      }
      res.json(template);
    } catch (error) {
      console.error("Error fetching default proposal template:", error);
      res.status(500).json({ message: "Failed to fetch default proposal template" });
    }
  });

  app.put('/api/proposal-templates/:id', isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.user?.id);
      if (currentUser?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const id = parseInt(req.params.id);
      if (isNaN(id) || id <= 0) {
        return res.status(400).json({ message: "Invalid template ID. Must be a positive integer." });
      }

      // Additional security: Check if template exists and is accessible
      const existingTemplate = await storage.getProposalTemplate(id);
      if (!existingTemplate) {
        return res.status(404).json({ message: "Proposal template not found" });
      }

      const validatedData = insertProposalTemplateSchema.partial().parse(req.body);
      const template = await storage.updateProposalTemplate(id, validatedData);
      
      if (!template) {
        return res.status(404).json({ message: "Proposal template not found" });
      }
      
      res.json(template);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid proposal template data", errors: error.errors });
      }
      console.error("Error updating proposal template:", error);
      res.status(500).json({ message: "Failed to update proposal template" });
    }
  });

  app.delete('/api/proposal-templates/:id', isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.user?.id);
      if (currentUser?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const id = parseInt(req.params.id);
      if (isNaN(id) || id <= 0) {
        return res.status(400).json({ message: "Invalid template ID. Must be a positive integer." });
      }

      // Additional security: Check if template exists before deletion
      const templateToDelete = await storage.getProposalTemplate(id);
      if (!templateToDelete) {
        return res.status(404).json({ message: "Proposal template not found" });
      }

      // Business rule: Check if this is the last active template of its category
      const allTemplates = await storage.getAllProposalTemplates(false); // only active ones
      const templatesInSameCategory = allTemplates.filter(t => 
        t.category === templateToDelete.category && t.id !== id
      );

      if (templatesInSameCategory.length === 0) {
        return res.status(400).json({ 
          message: `Cannot delete the last active template of category '${templateToDelete.category}'. Create another active template in this category first.`,
          code: "LAST_TEMPLATE_IN_CATEGORY"
        });
      }

      // If deleting a default template, automatically set another template as default
      if (templateToDelete.isDefault && templatesInSameCategory.length > 0) {
        const newDefault = templatesInSameCategory[0];
        await storage.updateProposalTemplate(newDefault.id, { isDefault: true });
      }

      const success = await storage.deleteProposalTemplate(id);
      
      if (!success) {
        return res.status(404).json({ message: "Proposal template not found" });
      }
      
      const responseMessage = templateToDelete.isDefault ? 
        `Template deleted successfully. '${templatesInSameCategory[0].name}' is now the default for category '${templateToDelete.category}'.` :
        "Proposal template deleted successfully";
      
      res.json({ message: responseMessage });
    } catch (error) {
      console.error("Error deleting proposal template:", error);
      res.status(500).json({ message: "Failed to delete proposal template" });
    }
  });

  // Quote signature routes
  app.post('/api/quotes/:id/sign-issuer', isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { signature } = req.body;
      
      if (!signature) {
        return res.status(400).json({ message: "Signature name required" });
      }

      const quote = await storage.updateQuote(id, {
        issuerSignature: signature,
        issuerSignatureDate: new Date(),
        signatureStatus: 'signed'
      });

      if (!quote) {
        return res.status(404).json({ message: "Quote not found" });
      }

      res.json(quote);
    } catch (error) {
      console.error("Error signing quote as issuer:", error);
      res.status(500).json({ message: "Failed to sign quote" });
    }
  });

  app.post('/api/quotes/:id/sign-customer', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { signature } = req.body;
      
      if (!signature) {
        return res.status(400).json({ message: "Signature name required" });
      }

      // Get current quote to check issuer signature status
      const currentQuote = await storage.getQuote(id);
      if (!currentQuote) {
        return res.status(404).json({ message: "Quote not found" });
      }

      const newSignatureStatus = currentQuote.issuerSignature ? 'fully_signed' : 'customer_signed';

      const quote = await storage.updateQuote(id, {
        customerSignature: signature,
        customerSignatureDate: new Date(),
        signatureStatus: newSignatureStatus
      });

      res.json(quote);
    } catch (error) {
      console.error("Error signing quote as customer:", error);
      res.status(500).json({ message: "Failed to sign quote" });
    }
  });

  // DocuSign Integration Routes
  app.post('/api/quotes/:id/send-to-docusign', isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { returnUrl } = req.body;
      
      // Get the quote with details (including customer data)
      const quote = await storage.getQuoteWithDetails(id);
      if (!quote) {
        return res.status(404).json({ message: "Quote not found" });
      }

      // Validate that quote has required customer email
      if (!quote.customer?.email) {
        return res.status(400).json({ message: "Customer email is required for DocuSign" });
      }

      // Check if already sent to DocuSign
      if (quote.docusignEnvelopeId) {
        return res.status(400).json({ 
          message: "Quote already sent to DocuSign", 
          envelopeId: quote.docusignEnvelopeId 
        });
      }

      // Initialize DocuSign service
      const docusignService = new DocuSignService();
      
      // Generate PDF content for the quote
      const { generateQuotePDF } = await import('./pdfGenerator');
      const pdfBase64 = await generateQuotePDF(quote);

      // Create DocuSign envelope
      const envelope = await docusignService.createAndSendEnvelope(
        pdfBase64,
        {
          email: quote.customer.email,
          name: quote.customer.name,
          recipientId: '1',
        },
        `Quote ${quote.quoteNumber} - EDG Patio & Shade`,
        quote.quoteNumber
      );

      // Get signing URL
      const signingUrl = await docusignService.getRecipientSigningUrl(
        envelope.envelopeId,
        {
          email: quote.customer.email,
          name: quote.customer.name,
          recipientId: '1',
        },
        returnUrl || `${req.protocol}://${req.get('host')}/quotes/${id}`
      );

      // Update quote with DocuSign information
      const updatedQuote = await storage.updateQuote(id, {
        docusignEnvelopeId: envelope.envelopeId,
        docusignStatus: envelope.status,
        docusignSentDate: new Date(),
        docusignViewUrl: signingUrl,
        status: 'sent' // Update quote status to sent
      });

      res.json({
        envelopeId: envelope.envelopeId,
        status: envelope.status,
        signingUrl: signingUrl,
        quote: updatedQuote
      });

    } catch (error: any) {
      console.error("Error sending quote to DocuSign:", error);
      res.status(500).json({ 
        message: "Failed to send quote to DocuSign",
        error: error.message 
      });
    }
  });

  // Get DocuSign status for a quote
  app.get('/api/quotes/:id/docusign-status', isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const quote = await storage.getQuote(id);
      
      if (!quote) {
        return res.status(404).json({ message: "Quote not found" });
      }

      if (!quote.docusignEnvelopeId) {
        return res.status(400).json({ message: "Quote not sent to DocuSign" });
      }

      const docusignService = new DocuSignService();
      const envelopeStatus = await docusignService.getEnvelopeStatus(quote.docusignEnvelopeId);
      const recipients = await docusignService.getEnvelopeRecipients(quote.docusignEnvelopeId);

      res.json({
        envelopeId: quote.docusignEnvelopeId,
        status: envelopeStatus.status,
        statusDateTime: envelopeStatus.statusDateTime,
        recipients: recipients,
        currentStatus: quote.docusignStatus
      });

    } catch (error: any) {
      console.error("Error getting DocuSign status:", error);
      res.status(500).json({ 
        message: "Failed to get DocuSign status",
        error: error.message 
      });
    }
  });

  // DocuSign webhook handler
  app.post('/api/docusign/webhook', async (req, res) => {
    try {
      const { event, data } = req.body;
      
      // Validate webhook (in production, verify signature)
      if (!event || !data) {
        return res.status(400).json({ message: "Invalid webhook payload" });
      }

      const envelopeId = data.envelopeId;
      const newStatus = data.envelopeSummary?.status;
      
      if (!envelopeId) {
        return res.status(400).json({ message: "Missing envelope ID" });
      }

      // Find quote by DocuSign envelope ID
      const quotes = await storage.getAllQuotes();
      const quote = quotes.find(q => q.docusignEnvelopeId === envelopeId);
      
      if (!quote) {
        console.log(`Webhook received for unknown envelope: ${envelopeId}`);
        return res.status(200).json({ message: "Envelope not found, ignoring" });
      }

      // Update quote status based on DocuSign status
      let updatedFields: any = {
        docusignStatus: newStatus
      };

      if (newStatus === 'completed') {
        updatedFields.status = 'approved';
        updatedFields.customerSignature = `Signed via DocuSign`;
        updatedFields.customerSignatureDate = new Date();
        updatedFields.signatureStatus = quote.issuerSignature ? 'fully_signed' : 'customer_signed';
      } else if (newStatus === 'declined') {
        updatedFields.status = 'rejected';
      }

      await storage.updateQuote(quote.id, updatedFields);

      res.status(200).json({ message: "Webhook processed successfully" });

    } catch (error: any) {
      console.error("Error processing DocuSign webhook:", error);
      res.status(500).json({ 
        message: "Failed to process webhook",
        error: error.message 
      });
    }
  });

  // ================================
  // CRM LEADS MANAGEMENT ROUTES
  // ================================

  // Get all leads with optional filtering
  app.get("/api/leads", isAuthenticated, async (req, res) => {
    try {
      const { status, assignedTo } = req.query;
      
      let leads;
      if (status && typeof status === 'string') {
        leads = await storage.getLeadsByStatus(status);
      } else if (assignedTo && typeof assignedTo === 'string') {
        leads = await storage.getLeadsByAssignedTo(assignedTo);
      } else {
        leads = await storage.getAllLeads();
      }
      
      res.json(leads);
    } catch (error) {
      console.error("Error fetching leads:", error);
      res.status(500).json({ message: "Failed to fetch leads" });
    }
  });

  // Get specific lead with tasks and activities
  app.get("/api/leads/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const lead = await storage.getLead(id);
      
      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }

      // Get related tasks and activities
      const [tasks, activities] = await Promise.all([
        storage.getTasksByLeadId(id),
        storage.getLeadActivities(id)
      ]);

      res.json({
        ...lead,
        tasks,
        activities
      });
    } catch (error) {
      console.error("Error fetching lead:", error);
      res.status(500).json({ message: "Failed to fetch lead" });
    }
  });

  // Create new lead
  app.post("/api/leads", isAuthenticated, async (req, res) => {
    try {
      const leadData = insertLeadSchema.parse(req.body);
      const lead = await storage.createLead(leadData);
      
      // Log lead creation activity
      try {
        await storage.createLeadActivity({
          leadId: lead.id,
          activityType: 'note_added',
          description: `Lead created: ${lead.name}`,
          userId: req.user?.id,
          metadata: { source: lead.source }
        });
      } catch (activityError) {
        console.error("Failed to log lead creation activity:", activityError);
        // Don't fail the request if activity logging fails
      }
      
      res.status(201).json(lead);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid lead data", 
          errors: error.errors 
        });
      }
      console.error("Error creating lead:", error);
      res.status(500).json({ message: "Failed to create lead" });
    }
  });

  // Update lead
  app.put("/api/leads/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const leadData = insertLeadSchema.partial().parse(req.body);
      
      // Get current lead for status change detection
      const currentLead = await storage.getLead(id);
      if (!currentLead) {
        return res.status(404).json({ message: "Lead not found" });
      }
      
      const updatedLead = await storage.updateLead(id, leadData);
      if (!updatedLead) {
        return res.status(404).json({ message: "Lead not found" });
      }

      // Log status change activity
      if (leadData.status && leadData.status !== currentLead.status) {
        try {
          await storage.createLeadActivity({
            leadId: id,
            activityType: 'status_change',
            description: `Status changed from ${currentLead.status} to ${leadData.status}`,
            userId: req.user?.id,
            metadata: { 
              previousStatus: currentLead.status, 
              newStatus: leadData.status 
            }
          });
        } catch (activityError) {
          console.error("Failed to log status change activity:", activityError);
        }
      }
      
      res.json(updatedLead);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid lead data", 
          errors: error.errors 
        });
      }
      console.error("Error updating lead:", error);
      res.status(500).json({ message: "Failed to update lead" });
    }
  });

  // Delete lead
  app.delete("/api/leads/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Get lead details before deletion for logging
      const lead = await storage.getLead(id);
      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }
      
      const deleted = await storage.deleteLead(id);
      if (!deleted) {
        return res.status(404).json({ message: "Lead not found" });
      }
      
      res.json({ message: "Lead deleted successfully" });
    } catch (error) {
      console.error("Error deleting lead:", error);
      res.status(500).json({ message: "Failed to delete lead" });
    }
  });

  // Convert lead to customer
  app.post("/api/leads/:id/convert-to-customer", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid lead ID" });
      }

      const lead = await storage.getLead(id);
      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }

      // Validation: Check if lead is already converted
      if (lead.customerId) {
        const existingCustomer = await storage.getCustomer(lead.customerId);
        return res.status(400).json({ 
          message: "Lead is already converted to a customer",
          customer: existingCustomer
        });
      }

      // Validation: Ensure lead has required data for customer creation
      if (!lead.email || lead.email.trim() === '') {
        return res.status(400).json({ 
          message: "Lead must have a valid email address to convert to customer" 
        });
      }

      // Use transaction-like logic through the existing storage method
      const result = await storage.convertLeadToCustomer(id);
      
      if (!result.customer) {
        return res.status(500).json({ 
          message: "Failed to convert lead to customer" 
        });
      }

      res.json({
        message: "Lead converted to customer successfully",
        lead: result.lead,
        customer: result.customer
      });
    } catch (error) {
      console.error("Error converting lead:", error);
      res.status(500).json({ message: "Failed to convert lead to customer" });
    }
  });

  // Import leads from existing quotes
  app.post("/api/leads/import-from-quotes", isAuthenticated, async (req, res) => {
    try {
      console.log("Starting lead import from quotes...");
      const result = await storage.importLeadsFromQuotes();
      
      // Log the import activity for each imported lead
      if (result.imported > 0) {
        try {
          const recentLeads = await storage.getAllLeads();
          const importedLeads = recentLeads.slice(0, result.imported); // Get the most recent imported leads
          
          for (const lead of importedLeads) {
            if (lead.notes && lead.notes.includes('Imported from existing quote')) {
              try {
                await storage.createLeadActivity({
                  leadId: lead.id,
                  activityType: 'note_added',
                  description: `Lead imported from existing quotes system`,
                  userId: req.user?.id,
                  metadata: { 
                    importSource: 'quotes',
                    importedAt: new Date().toISOString()
                  }
                });
              } catch (activityError) {
                console.error(`Failed to log import activity for lead ${lead.id}:`, activityError);
              }
            }
          }
        } catch (activityError) {
          console.error("Failed to log import activities:", activityError);
          // Don't fail the import if activity logging fails
        }
      }
      
      console.log(`Import completed: ${result.imported} imported, ${result.duplicates} duplicates, ${result.errors.length} errors`);
      
      res.json({
        success: true,
        message: `Import completed: ${result.imported} lead(s) imported, ${result.duplicates} duplicate(s) skipped`,
        imported: result.imported,
        duplicates: result.duplicates,
        errors: result.errors
      });
    } catch (error) {
      console.error("Error importing leads from quotes:", error);
      res.status(500).json({ 
        success: false,
        message: "Failed to import leads from quotes",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // ================================
  // CRM TASKS MANAGEMENT ROUTES
  // ================================

  // Get all tasks with optional filtering
  app.get("/api/tasks", isAuthenticated, async (req, res) => {
    try {
      const { leadId, assignedTo } = req.query;
      
      let tasks;
      if (leadId && typeof leadId === 'string') {
        const leadIdNum = parseInt(leadId);
        tasks = await storage.getTasksByLeadId(leadIdNum);
      } else if (assignedTo && typeof assignedTo === 'string') {
        tasks = await storage.getTasksByAssignedTo(assignedTo);
      } else {
        tasks = await storage.getAllTasks();
      }
      
      res.json(tasks);
    } catch (error) {
      console.error("Error fetching tasks:", error);
      res.status(500).json({ message: "Failed to fetch tasks" });
    }
  });

  // Get overdue tasks
  app.get("/api/tasks/overdue", isAuthenticated, async (req, res) => {
    try {
      const tasks = await storage.getOverdueTasks();
      res.json(tasks);
    } catch (error) {
      console.error("Error fetching overdue tasks:", error);
      res.status(500).json({ message: "Failed to fetch overdue tasks" });
    }
  });

  // Get specific task
  app.get("/api/tasks/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const task = await storage.getTask(id);
      
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      res.json(task);
    } catch (error) {
      console.error("Error fetching task:", error);
      res.status(500).json({ message: "Failed to fetch task" });
    }
  });

  // Create new task
  app.post("/api/tasks", isAuthenticated, async (req, res) => {
    try {
      const taskData = insertTaskSchema.parse(req.body);
      const task = await storage.createTask(taskData);
      
      // Log task creation activity
      try {
        await storage.createLeadActivity({
          leadId: task.leadId,
          activityType: 'note_added',
          description: `Task created: ${task.title}`,
          userId: req.user?.id,
          metadata: { 
            taskId: task.id,
            priority: task.priority,
            dueDate: task.dueDate
          }
        });
      } catch (activityError) {
        console.error("Failed to log task creation activity:", activityError);
      }
      
      res.status(201).json(task);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid task data", 
          errors: error.errors 
        });
      }
      console.error("Error creating task:", error);
      res.status(500).json({ message: "Failed to create task" });
    }
  });

  // Update task
  app.put("/api/tasks/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const taskData = insertTaskSchema.partial().parse(req.body);
      
      const updatedTask = await storage.updateTask(id, taskData);
      if (!updatedTask) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      res.json(updatedTask);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid task data", 
          errors: error.errors 
        });
      }
      console.error("Error updating task:", error);
      res.status(500).json({ message: "Failed to update task" });
    }
  });

  // Delete task
  app.delete("/api/tasks/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Get task details before deletion for logging
      const task = await storage.getTask(id);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      const deleted = await storage.deleteTask(id);
      if (!deleted) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      res.json({ message: "Task deleted successfully" });
    } catch (error) {
      console.error("Error deleting task:", error);
      res.status(500).json({ message: "Failed to delete task" });
    }
  });

  // Mark task as completed
  app.post("/api/tasks/:id/complete", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      const completedTask = await storage.completeTask(id);
      if (!completedTask) {
        return res.status(404).json({ message: "Task not found" });
      }

      // Log task completion activity
      try {
        await storage.createLeadActivity({
          leadId: completedTask.leadId,
          activityType: 'task_completed',
          description: `Task completed: ${completedTask.title}`,
          userId: req.user?.id,
          metadata: { 
            taskId: completedTask.id,
            completedAt: completedTask.completedAt
          }
        });
      } catch (activityError) {
        console.error("Failed to log task completion activity:", activityError);
      }
      
      res.json(completedTask);
    } catch (error) {
      console.error("Error completing task:", error);
      res.status(500).json({ message: "Failed to complete task" });
    }
  });

  // ================================
  // CRM LEAD ACTIVITIES ROUTES
  // ================================

  // Get activities for a lead
  app.get("/api/leads/:id/activities", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Verify lead exists
      const lead = await storage.getLead(id);
      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }
      
      const activities = await storage.getLeadActivities(id);
      res.json(activities);
    } catch (error) {
      console.error("Error fetching lead activities:", error);
      res.status(500).json({ message: "Failed to fetch lead activities" });
    }
  });

  // Create new activity for a lead
  app.post("/api/leads/:id/activities", isAuthenticated, async (req, res) => {
    try {
      const leadId = parseInt(req.params.id);
      
      // Verify lead exists
      const lead = await storage.getLead(leadId);
      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }
      
      const activityData = insertLeadActivitySchema.parse({
        ...req.body,
        leadId,
        userId: req.user?.id
      });
      
      const activity = await storage.createLeadActivity(activityData);
      res.status(201).json(activity);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid activity data", 
          errors: error.errors 
        });
      }
      console.error("Error creating lead activity:", error);
      res.status(500).json({ message: "Failed to create lead activity" });
    }
  });

  // Get recent activities across all leads (for dashboard)
  app.get("/api/activities/recent", isAuthenticated, async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const activities = await storage.getRecentActivities(limit);
      res.json(activities);
    } catch (error) {
      console.error("Error fetching recent activities:", error);
      res.status(500).json({ message: "Failed to fetch recent activities" });
    }
  });

  // ================================
  // COMPREHENSIVE CRM API ROUTES
  // ================================

  // ================================
  // ACCOUNT ROUTES
  // ================================

  // Get all accounts
  app.get("/api/accounts", isAuthenticated, async (req, res) => {
    try {
      const accounts = await storage.getAllAccounts();
      res.json(accounts);
    } catch (error) {
      console.error("Error fetching accounts:", error);
      res.status(500).json({ message: "Failed to fetch accounts" });
    }
  });

  // Get account by ID
  app.get("/api/accounts/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const account = await storage.getAccount(id);
      if (!account) {
        return res.status(404).json({ message: "Account not found" });
      }
      res.json(account);
    } catch (error) {
      console.error("Error fetching account:", error);
      res.status(500).json({ message: "Failed to fetch account" });
    }
  });

  // Create new account
  app.post("/api/accounts", isAuthenticated, async (req, res) => {
    try {
      const accountData = insertAccountSchema.parse(req.body);
      
      // Check if account already exists by email if provided
      if (accountData.email) {
        const existingAccount = await storage.getAccountByEmail(accountData.email);
        if (existingAccount) {
          return res.status(409).json({ message: "Account with this email already exists" });
        }
      }
      
      const account = await storage.createAccount(accountData);
      res.status(201).json(account);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid account data", 
          errors: error.errors 
        });
      }
      console.error("Error creating account:", error);
      res.status(500).json({ message: "Failed to create account" });
    }
  });

  // Update account
  app.put("/api/accounts/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const accountData = insertAccountSchema.partial().parse(req.body);
      
      const account = await storage.updateAccount(id, accountData);
      if (!account) {
        return res.status(404).json({ message: "Account not found" });
      }
      res.json(account);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid account data", 
          errors: error.errors 
        });
      }
      console.error("Error updating account:", error);
      res.status(500).json({ message: "Failed to update account" });
    }
  });

  // Delete account
  app.delete("/api/accounts/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteAccount(id);
      if (!deleted) {
        return res.status(404).json({ message: "Account not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting account:", error);
      res.status(500).json({ message: "Failed to delete account" });
    }
  });

  // Get account roles
  app.get("/api/accounts/:id/roles", isAuthenticated, async (req, res) => {
    try {
      const accountId = parseInt(req.params.id);
      
      // Verify account exists
      const account = await storage.getAccount(accountId);
      if (!account) {
        return res.status(404).json({ message: "Account not found" });
      }
      
      const roles = await storage.getAccountRoles(accountId);
      res.json(roles);
    } catch (error) {
      console.error("Error fetching account roles:", error);
      res.status(500).json({ message: "Failed to fetch account roles" });
    }
  });

  // Add account role
  app.post("/api/accounts/:id/roles", isAuthenticated, async (req, res) => {
    try {
      const accountId = parseInt(req.params.id);
      
      // Verify account exists
      const account = await storage.getAccount(accountId);
      if (!account) {
        return res.status(404).json({ message: "Account not found" });
      }
      
      const roleData = insertAccountRoleSchema.parse({
        ...req.body,
        accountId
      });
      
      const role = await storage.addAccountRole(roleData);
      res.status(201).json(role);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid role data", 
          errors: error.errors 
        });
      }
      console.error("Error adding account role:", error);
      res.status(500).json({ message: "Failed to add account role" });
    }
  });

  // Remove account role
  app.delete("/api/accounts/:id/roles/:role", isAuthenticated, async (req, res) => {
    try {
      const accountId = parseInt(req.params.id);
      const role = req.params.role;
      
      const removed = await storage.removeAccountRole(accountId, role);
      if (!removed) {
        return res.status(404).json({ message: "Account role not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error removing account role:", error);
      res.status(500).json({ message: "Failed to remove account role" });
    }
  });

  // ================================
  // CONTACT ROUTES
  // ================================

  // Get all contacts
  app.get("/api/contacts", isAuthenticated, async (req, res) => {
    try {
      const contacts = await storage.getAllContacts();
      res.json(contacts);
    } catch (error) {
      console.error("Error fetching contacts:", error);
      res.status(500).json({ message: "Failed to fetch contacts" });
    }
  });

  // Get contact by ID
  app.get("/api/contacts/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const contact = await storage.getContact(id);
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }
      res.json(contact);
    } catch (error) {
      console.error("Error fetching contact:", error);
      res.status(500).json({ message: "Failed to fetch contact" });
    }
  });

  // Get contacts by account ID
  app.get("/api/accounts/:accountId/contacts", isAuthenticated, async (req, res) => {
    try {
      const accountId = parseInt(req.params.accountId);
      
      // Verify account exists
      const account = await storage.getAccount(accountId);
      if (!account) {
        return res.status(404).json({ message: "Account not found" });
      }
      
      const contacts = await storage.getContactsByAccountId(accountId);
      res.json(contacts);
    } catch (error) {
      console.error("Error fetching contacts for account:", error);
      res.status(500).json({ message: "Failed to fetch contacts for account" });
    }
  });

  // Create new contact
  app.post("/api/contacts", isAuthenticated, async (req, res) => {
    try {
      const contactData = insertContactSchema.parse(req.body);
      
      // Verify account exists
      const account = await storage.getAccount(contactData.accountId);
      if (!account) {
        return res.status(400).json({ message: "Account not found" });
      }
      
      const contact = await storage.createContact(contactData);
      res.status(201).json(contact);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid contact data", 
          errors: error.errors 
        });
      }
      console.error("Error creating contact:", error);
      res.status(500).json({ message: "Failed to create contact" });
    }
  });

  // Update contact
  app.put("/api/contacts/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const contactData = insertContactSchema.partial().parse(req.body);
      
      const contact = await storage.updateContact(id, contactData);
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }
      res.json(contact);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid contact data", 
          errors: error.errors 
        });
      }
      console.error("Error updating contact:", error);
      res.status(500).json({ message: "Failed to update contact" });
    }
  });

  // Delete contact
  app.delete("/api/contacts/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteContact(id);
      if (!deleted) {
        return res.status(404).json({ message: "Contact not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting contact:", error);
      res.status(500).json({ message: "Failed to delete contact" });
    }
  });

  // Get contact roles
  app.get("/api/contacts/:id/roles", isAuthenticated, async (req, res) => {
    try {
      const contactId = parseInt(req.params.id);
      
      // Verify contact exists
      const contact = await storage.getContact(contactId);
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }
      
      const roles = await storage.getContactRoles(contactId);
      res.json(roles);
    } catch (error) {
      console.error("Error fetching contact roles:", error);
      res.status(500).json({ message: "Failed to fetch contact roles" });
    }
  });

  // Add contact role
  app.post("/api/contacts/:id/roles", isAuthenticated, async (req, res) => {
    try {
      const contactId = parseInt(req.params.id);
      
      // Verify contact exists
      const contact = await storage.getContact(contactId);
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }
      
      const roleData = insertContactRoleSchema.parse({
        ...req.body,
        contactId
      });
      
      const role = await storage.addContactRole(roleData);
      res.status(201).json(role);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid role data", 
          errors: error.errors 
        });
      }
      console.error("Error adding contact role:", error);
      res.status(500).json({ message: "Failed to add contact role" });
    }
  });

  // Remove contact role
  app.delete("/api/contacts/:id/roles/:role", isAuthenticated, async (req, res) => {
    try {
      const contactId = parseInt(req.params.id);
      const role = req.params.role;
      
      const removed = await storage.removeContactRole(contactId, role);
      if (!removed) {
        return res.status(404).json({ message: "Contact role not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error removing contact role:", error);
      res.status(500).json({ message: "Failed to remove contact role" });
    }
  });

  // ================================
  // OPPORTUNITY ROUTES
  // ================================

  // Get all opportunities (pipeline data)
  app.get("/api/opportunities", isAuthenticated, async (req, res) => {
    try {
      const opportunities = await storage.getAllOpportunities();
      res.json(opportunities);
    } catch (error) {
      console.error("Error fetching opportunities:", error);
      res.status(500).json({ message: "Failed to fetch opportunities" });
    }
  });

  // Get opportunity by ID
  app.get("/api/opportunities/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const opportunity = await storage.getOpportunity(id);
      if (!opportunity) {
        return res.status(404).json({ message: "Opportunity not found" });
      }
      res.json(opportunity);
    } catch (error) {
      console.error("Error fetching opportunity:", error);
      res.status(500).json({ message: "Failed to fetch opportunity" });
    }
  });

  // Get opportunities by account ID
  app.get("/api/accounts/:accountId/opportunities", isAuthenticated, async (req, res) => {
    try {
      const accountId = parseInt(req.params.accountId);
      
      // Verify account exists
      const account = await storage.getAccount(accountId);
      if (!account) {
        return res.status(404).json({ message: "Account not found" });
      }
      
      const opportunities = await storage.getOpportunitiesByAccountId(accountId);
      res.json(opportunities);
    } catch (error) {
      console.error("Error fetching opportunities for account:", error);
      res.status(500).json({ message: "Failed to fetch opportunities for account" });
    }
  });

  // Create new opportunity
  app.post("/api/opportunities", isAuthenticated, async (req, res) => {
    try {
      const opportunityData = insertOpportunitySchema.parse(req.body);
      
      // Verify account exists
      const account = await storage.getAccount(opportunityData.accountId);
      if (!account) {
        return res.status(400).json({ message: "Account not found" });
      }
      
      // Verify primary contact exists if provided
      if (opportunityData.primaryContactId) {
        const contact = await storage.getContact(opportunityData.primaryContactId);
        if (!contact) {
          return res.status(400).json({ message: "Primary contact not found" });
        }
      }
      
      const opportunity = await storage.createOpportunity(opportunityData);
      res.status(201).json(opportunity);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid opportunity data", 
          errors: error.errors 
        });
      }
      console.error("Error creating opportunity:", error);
      res.status(500).json({ message: "Failed to create opportunity" });
    }
  });

  // Update opportunity (including stage changes)
  app.put("/api/opportunities/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const opportunityData = insertOpportunitySchema.partial().parse(req.body);
      
      const opportunity = await storage.updateOpportunity(id, opportunityData);
      if (!opportunity) {
        return res.status(404).json({ message: "Opportunity not found" });
      }
      res.json(opportunity);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid opportunity data", 
          errors: error.errors 
        });
      }
      console.error("Error updating opportunity:", error);
      res.status(500).json({ message: "Failed to update opportunity" });
    }
  });

  // Delete opportunity
  app.delete("/api/opportunities/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteOpportunity(id);
      if (!deleted) {
        return res.status(404).json({ message: "Opportunity not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting opportunity:", error);
      res.status(500).json({ message: "Failed to delete opportunity" });
    }
  });

  // ================================
  // ACTIVITY ROUTES
  // ================================

  // Get activities for entity
  app.get("/api/activities", isAuthenticated, async (req, res) => {
    try {
      const { entityType, entityId } = req.query;
      
      if (!entityType || !entityId) {
        return res.status(400).json({ message: "entityType and entityId are required" });
      }
      
      const activities = await storage.getActivitiesByEntity(
        entityType as string,
        parseInt(entityId as string)
      );
      res.json(activities);
    } catch (error) {
      console.error("Error fetching activities:", error);
      res.status(500).json({ message: "Failed to fetch activities" });
    }
  });

  // Create new activity
  app.post("/api/activities", isAuthenticated, async (req, res) => {
    try {
      const activityData = insertActivitySchema.parse({
        ...req.body,
        assignedTo: req.body.assignedTo || req.user?.id
      });
      
      const activity = await storage.createActivity(activityData);
      res.status(201).json(activity);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid activity data", 
          errors: error.errors 
        });
      }
      console.error("Error creating activity:", error);
      res.status(500).json({ message: "Failed to create activity" });
    }
  });

  // Update activity
  app.put("/api/activities/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const activityData = insertActivitySchema.partial().parse(req.body);
      
      const activity = await storage.updateActivity(id, activityData);
      if (!activity) {
        return res.status(404).json({ message: "Activity not found" });
      }
      res.json(activity);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid activity data", 
          errors: error.errors 
        });
      }
      console.error("Error updating activity:", error);
      res.status(500).json({ message: "Failed to update activity" });
    }
  });

  // Delete activity
  app.delete("/api/activities/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteActivity(id);
      if (!deleted) {
        return res.status(404).json({ message: "Activity not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting activity:", error);
      res.status(500).json({ message: "Failed to delete activity" });
    }
  });

  // ======================
  // PROJECT MANAGEMENT API ROUTES
  // ======================

  // ======================
  // CORE PROJECT ENDPOINTS
  // ======================

  // Get all projects with filtering
  app.get("/api/projects", isAuthenticated, async (req, res) => {
    try {
      const { status, accountId, managerId } = req.query;
      const userId = req.user?.id;
      let projects;

      // Apply role-based filtering for project access
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // If account ID filter is provided, validate account access
      if (accountId) {
        const hasAccountAccess = await storage.validateAccountAccess(parseInt(accountId as string), userId);
        if (!hasAccountAccess) {
          return res.status(403).json({ message: "Insufficient permissions to access this account's projects" });
        }
        projects = await storage.getProjectsByAccountId(parseInt(accountId as string));
      } else if (managerId) {
        // Only allow viewing projects by manager if user is admin or the manager themselves
        if (user.role !== 'admin' && managerId !== userId) {
          return res.status(403).json({ message: "Insufficient permissions to view projects by manager" });
        }
        projects = await storage.getProjectsByProjectManager(managerId as string);
      } else if (status) {
        // For status filtering, only show projects the user has access to
        if (user.role === 'admin') {
          projects = await storage.getProjectsByStatus(status as string);
        } else {
          // Filter by status but only for user's projects
          projects = await storage.getProjectsByProjectManager(userId);
          projects = projects.filter(p => p.status === status);
        }
      } else {
        // Get all projects based on user role
        if (user.role === 'admin') {
          projects = await storage.getAllProjects();
        } else {
          // Regular users only see projects they manage
          projects = await storage.getProjectsByProjectManager(userId);
        }
      }

      res.json(projects);
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(500).json({ message: "Failed to fetch projects" });
    }
  });

  // Create new project
  app.post("/api/projects", isAuthenticated, async (req, res) => {
    try {
      const projectData = insertProjectSchema.parse(req.body);
      const userId = req.user?.id;
      
      // Validate account access if accountId is provided
      if (projectData.accountId) {
        const hasAccountAccess = await storage.validateAccountAccess(projectData.accountId, userId);
        if (!hasAccountAccess) {
          return res.status(403).json({ message: "Insufficient permissions to create project for this account" });
        }
      }
      
      // Set project manager to current user if not specified and user is not admin
      const user = await storage.getUser(userId);
      if (!projectData.projectManagerId && user?.role !== 'admin') {
        projectData.projectManagerId = userId;
      }
      
      const project = await storage.createProject(projectData);
      res.status(201).json(project);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid project data", 
          errors: error.errors 
        });
      }
      console.error("Error creating project:", error);
      res.status(500).json({ message: "Failed to create project" });
    }
  });

  // Get project details
  app.get("/api/projects/:id", isAuthenticated, validateProjectAccess('read'), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const project = await storage.getProject(id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      console.error("Error fetching project:", error);
      res.status(500).json({ message: "Failed to fetch project" });
    }
  });

  // Update project
  app.put("/api/projects/:id", isAuthenticated, validateProjectAccess('write'), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const projectData = insertProjectSchema.partial().parse(req.body);
      const project = await storage.updateProject(id, projectData);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid project data", 
          errors: error.errors 
        });
      }
      console.error("Error updating project:", error);
      res.status(500).json({ message: "Failed to update project" });
    }
  });

  // Delete project
  app.delete("/api/projects/:id", isAuthenticated, validateProjectAccess('admin'), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteProject(id);
      if (!deleted) {
        return res.status(404).json({ message: "Project not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting project:", error);
      res.status(500).json({ message: "Failed to delete project" });
    }
  });

  // Convert quote to project
  app.post("/api/projects/convert-from-quote", isAuthenticated, async (req, res) => {
    try {
      const { quoteId, projectData } = req.body;
      const userId = req.user?.id;
      
      if (!quoteId) {
        return res.status(400).json({ message: "Quote ID is required" });
      }

      // Validate quote ownership
      const hasQuoteAccess = await storage.validateQuoteOwnership(quoteId, userId);
      if (!hasQuoteAccess) {
        return res.status(403).json({ message: "Insufficient permissions to access this quote" });
      }

      // Validate account access if specified
      if (projectData?.accountId) {
        const hasAccountAccess = await storage.validateAccountAccess(projectData.accountId, userId);
        if (!hasAccountAccess) {
          return res.status(403).json({ message: "Insufficient permissions to create project for this account" });
        }
      }

      const result = await storage.convertQuoteToProject(quoteId, projectData);
      
      if (!result.project) {
        return res.status(400).json({ message: "Failed to convert quote to project" });
      }

      res.status(201).json(result.project);
    } catch (error) {
      console.error("Error converting quote to project:", error);
      res.status(500).json({ message: "Failed to convert quote to project" });
    }
  });

  // Get project with full details (dashboard data)
  app.get("/api/projects/:id/dashboard", isAuthenticated, validateProjectAccess('read'), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const dashboard = await storage.getProjectWithDetails(id);
      if (!dashboard) {
        return res.status(404).json({ message: "Project not found" });
      }
      res.json(dashboard);
    } catch (error) {
      console.error("Error fetching project dashboard:", error);
      res.status(500).json({ message: "Failed to fetch project dashboard" });
    }
  });

  // ======================
  // PROJECT MILESTONES
  // ======================

  // Get project milestones
  app.get("/api/projects/:id/milestones", isAuthenticated, validateProjectAccess('read'), async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const milestones = await storage.getProjectMilestones(projectId);
      res.json(milestones);
    } catch (error) {
      console.error("Error fetching milestones:", error);
      res.status(500).json({ message: "Failed to fetch milestones" });
    }
  });

  // Create milestone
  app.post("/api/projects/:id/milestones", isAuthenticated, validateProjectAccess('write'), async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const milestoneData = insertProjectMilestoneSchema.parse({
        ...req.body,
        projectId
      });
      const milestone = await storage.createProjectMilestone(milestoneData);
      res.status(201).json(milestone);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid milestone data", 
          errors: error.errors 
        });
      }
      console.error("Error creating milestone:", error);
      res.status(500).json({ message: "Failed to create milestone" });
    }
  });

  // Update milestone
  app.put("/api/milestones/:id", isAuthenticated, validateProjectMilestoneAccess, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Additional authorization check for write permissions
      const milestoneAccess = req.milestoneAccess;
      if (milestoneAccess?.projectId) {
        const projectAccess = await storage.validateProjectAccess(milestoneAccess.projectId, req.user?.id, 'write');
        if (!projectAccess.isValid) {
          return res.status(403).json({ message: "Insufficient permissions to update milestone" });
        }
      }
      
      const milestoneData = insertProjectMilestoneSchema.partial().parse(req.body);
      const milestone = await storage.updateProjectMilestone(id, milestoneData);
      if (!milestone) {
        return res.status(404).json({ message: "Milestone not found" });
      }
      res.json(milestone);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid milestone data", 
          errors: error.errors 
        });
      }
      console.error("Error updating milestone:", error);
      res.status(500).json({ message: "Failed to update milestone" });
    }
  });

  // Delete milestone
  app.delete("/api/milestones/:id", isAuthenticated, validateProjectMilestoneAccess, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Additional authorization check for write permissions
      const milestoneAccess = req.milestoneAccess;
      if (milestoneAccess?.projectId) {
        const projectAccess = await storage.validateProjectAccess(milestoneAccess.projectId, req.user?.id, 'write');
        if (!projectAccess.isValid) {
          return res.status(403).json({ message: "Insufficient permissions to delete milestone" });
        }
      }
      
      const deleted = await storage.deleteProjectMilestone(id);
      if (!deleted) {
        return res.status(404).json({ message: "Milestone not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting milestone:", error);
      res.status(500).json({ message: "Failed to delete milestone" });
    }
  });

  // ======================
  // PROJECT TASKS
  // ======================

  // Get project tasks (hierarchical)
  app.get("/api/projects/:id/tasks", isAuthenticated, validateProjectAccess('read'), async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const tasks = await storage.getProjectTasks(projectId);
      res.json(tasks);
    } catch (error) {
      console.error("Error fetching tasks:", error);
      res.status(500).json({ message: "Failed to fetch tasks" });
    }
  });

  // Create task
  app.post("/api/projects/:id/tasks", isAuthenticated, validateProjectAccess('write'), async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const taskData = insertProjectTaskSchema.parse({
        ...req.body,
        projectId
      });
      const task = await storage.createProjectTask(taskData);
      res.status(201).json(task);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid task data", 
          errors: error.errors 
        });
      }
      console.error("Error creating task:", error);
      res.status(500).json({ message: "Failed to create task" });
    }
  });

  // Update task
  app.put("/api/tasks/:id", isAuthenticated, validateProjectTaskAccess, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Additional authorization check for write permissions
      const taskAccess = req.taskAccess;
      if (taskAccess?.projectId) {
        const projectAccess = await storage.validateProjectAccess(taskAccess.projectId, req.user?.id, 'write');
        if (!projectAccess.isValid) {
          return res.status(403).json({ message: "Insufficient permissions to update task" });
        }
      }
      
      const taskData = insertProjectTaskSchema.partial().parse(req.body);
      const task = await storage.updateProjectTask(id, taskData);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      res.json(task);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid task data", 
          errors: error.errors 
        });
      }
      console.error("Error updating task:", error);
      res.status(500).json({ message: "Failed to update task" });
    }
  });

  // Delete task
  app.delete("/api/tasks/:id", isAuthenticated, validateProjectTaskAccess, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Additional authorization check for write permissions
      const taskAccess = req.taskAccess;
      if (taskAccess?.projectId) {
        const projectAccess = await storage.validateProjectAccess(taskAccess.projectId, req.user?.id, 'write');
        if (!projectAccess.isValid) {
          return res.status(403).json({ message: "Insufficient permissions to delete task" });
        }
      }
      
      const deleted = await storage.deleteProjectTask(id);
      if (!deleted) {
        return res.status(404).json({ message: "Task not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting task:", error);
      res.status(500).json({ message: "Failed to delete task" });
    }
  });

  // Assign crew/user to task
  app.post("/api/tasks/:id/assignments", isAuthenticated, validateProjectTaskAccess, async (req, res) => {
    try {
      const taskId = parseInt(req.params.id);
      
      // Additional authorization check for write permissions
      const taskAccess = req.taskAccess;
      if (taskAccess?.projectId) {
        const projectAccess = await storage.validateProjectAccess(taskAccess.projectId, req.user?.id, 'write');
        if (!projectAccess.isValid) {
          return res.status(403).json({ message: "Insufficient permissions to create task assignment" });
        }
      }
      
      const assignmentData = insertProjectTaskAssignmentSchema.parse({
        ...req.body,
        taskId
      });
      const assignment = await storage.createProjectTaskAssignment(assignmentData);
      res.status(201).json(assignment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid assignment data", 
          errors: error.errors 
        });
      }
      console.error("Error creating assignment:", error);
      res.status(500).json({ message: "Failed to create assignment" });
    }
  });

  // Remove task assignment
  app.delete("/api/task-assignments/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      // Get assignment to validate project access
      const assignment = await storage.getProjectTaskAssignment(id);
      if (!assignment) {
        return res.status(404).json({ message: "Assignment not found" });
      }
      
      // Validate task and project access
      const taskAccess = await storage.validateProjectTaskAccess(assignment.taskId, userId);
      if (!taskAccess.isValid || !taskAccess.projectId) {
        return res.status(403).json({ message: "Insufficient permissions to delete assignment" });
      }
      
      // Validate project write access
      const projectAccess = await storage.validateProjectAccess(taskAccess.projectId, userId, 'write');
      if (!projectAccess.isValid) {
        return res.status(403).json({ message: "Insufficient permissions to delete assignment" });
      }
      
      const deleted = await storage.deleteProjectTaskAssignment(id);
      if (!deleted) {
        return res.status(404).json({ message: "Assignment not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting assignment:", error);
      res.status(500).json({ message: "Failed to delete assignment" });
    }
  });

  // Add task dependency
  app.post("/api/tasks/:id/dependencies", isAuthenticated, validateProjectTaskAccess, async (req, res) => {
    try {
      const taskId = parseInt(req.params.id);
      
      // Additional authorization check for write permissions
      const taskAccess = req.taskAccess;
      if (taskAccess?.projectId) {
        const projectAccess = await storage.validateProjectAccess(taskAccess.projectId, req.user?.id, 'write');
        if (!projectAccess.isValid) {
          return res.status(403).json({ message: "Insufficient permissions to create task dependency" });
        }
      }
      
      const dependencyData = insertProjectTaskDependencySchema.parse({
        ...req.body,
        taskId
      });
      const dependency = await storage.createProjectTaskDependency(dependencyData);
      res.status(201).json(dependency);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid dependency data", 
          errors: error.errors 
        });
      }
      console.error("Error creating dependency:", error);
      res.status(500).json({ message: "Failed to create dependency" });
    }
  });

  // Remove task dependency
  app.delete("/api/task-dependencies/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      // Get dependency to validate project access
      const dependency = await storage.getProjectTaskDependency(id);
      if (!dependency) {
        return res.status(404).json({ message: "Dependency not found" });
      }
      
      // Validate task and project access
      const taskAccess = await storage.validateProjectTaskAccess(dependency.taskId, userId);
      if (!taskAccess.isValid || !taskAccess.projectId) {
        return res.status(403).json({ message: "Insufficient permissions to delete dependency" });
      }
      
      // Validate project write access
      const projectAccess = await storage.validateProjectAccess(taskAccess.projectId, userId, 'write');
      if (!projectAccess.isValid) {
        return res.status(403).json({ message: "Insufficient permissions to delete dependency" });
      }
      
      const deleted = await storage.deleteProjectTaskDependency(id);
      if (!deleted) {
        return res.status(404).json({ message: "Dependency not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting dependency:", error);
      res.status(500).json({ message: "Failed to delete dependency" });
    }
  });

  // ======================
  // RESOURCE MANAGEMENT
  // ======================

  // Get project crew
  app.get("/api/projects/:id/crew", isAuthenticated, validateProjectAccess('read'), async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const crew = await storage.getProjectCrew(projectId);
      res.json(crew);
    } catch (error) {
      console.error("Error fetching crew:", error);
      res.status(500).json({ message: "Failed to fetch crew" });
    }
  });

  // Add crew member
  app.post("/api/projects/:id/crew", isAuthenticated, validateProjectAccess('write'), async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const crewData = insertProjectCrewSchema.parse({
        ...req.body,
        projectId
      });
      const crew = await storage.createProjectCrewMember(crewData);
      res.status(201).json(crew);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid crew data", 
          errors: error.errors 
        });
      }
      console.error("Error adding crew member:", error);
      res.status(500).json({ message: "Failed to add crew member" });
    }
  });

  // Update crew assignment
  app.put("/api/crew/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      // Get crew member to validate project access
      const crewMember = await storage.getProjectCrewMember(id);
      if (!crewMember) {
        return res.status(404).json({ message: "Crew assignment not found" });
      }
      
      // Validate project write access
      const projectAccess = await storage.validateProjectAccess(crewMember.projectId, userId, 'write');
      if (!projectAccess.isValid) {
        return res.status(403).json({ message: "Insufficient permissions to update crew assignment" });
      }
      
      const crewData = insertProjectCrewSchema.partial().parse(req.body);
      const crew = await storage.updateProjectCrewMember(id, crewData);
      if (!crew) {
        return res.status(404).json({ message: "Crew assignment not found" });
      }
      res.json(crew);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid crew data", 
          errors: error.errors 
        });
      }
      console.error("Error updating crew assignment:", error);
      res.status(500).json({ message: "Failed to update crew assignment" });
    }
  });

  // Get project equipment
  app.get("/api/projects/:id/equipment", isAuthenticated, validateProjectAccess('read'), async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const equipment = await storage.getProjectEquipment(projectId);
      res.json(equipment);
    } catch (error) {
      console.error("Error fetching equipment:", error);
      res.status(500).json({ message: "Failed to fetch equipment" });
    }
  });

  // Allocate equipment
  app.post("/api/projects/:id/equipment", isAuthenticated, validateProjectAccess('write'), async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const equipmentData = insertProjectEquipmentSchema.parse({
        ...req.body,
        projectId
      });
      const equipment = await storage.createProjectEquipment(equipmentData);
      res.status(201).json(equipment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid equipment data", 
          errors: error.errors 
        });
      }
      console.error("Error allocating equipment:", error);
      res.status(500).json({ message: "Failed to allocate equipment" });
    }
  });

  // Update equipment status
  app.put("/api/equipment/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      // Get equipment to validate project access
      const equipment = await storage.getProjectEquipmentItem(id);
      if (!equipment) {
        return res.status(404).json({ message: "Equipment allocation not found" });
      }
      
      // Validate project write access
      const projectAccess = await storage.validateProjectAccess(equipment.projectId, userId, 'write');
      if (!projectAccess.isValid) {
        return res.status(403).json({ message: "Insufficient permissions to update equipment" });
      }
      
      const equipmentData = insertProjectEquipmentSchema.partial().parse(req.body);
      const updatedEquipment = await storage.updateProjectEquipment(id, equipmentData);
      if (!updatedEquipment) {
        return res.status(404).json({ message: "Equipment allocation not found" });
      }
      res.json(updatedEquipment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid equipment data", 
          errors: error.errors 
        });
      }
      console.error("Error updating equipment:", error);
      res.status(500).json({ message: "Failed to update equipment" });
    }
  });

  // ======================
  // FINANCIAL ENDPOINTS
  // ======================

  // Get budget lines
  app.get("/api/projects/:id/budget", isAuthenticated, validateProjectAccess('read'), async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const budget = await storage.getProjectBudgetLines(projectId);
      res.json(budget);
    } catch (error) {
      console.error("Error fetching budget:", error);
      res.status(500).json({ message: "Failed to fetch budget" });
    }
  });

  // Create budget line
  app.post("/api/projects/:id/budget", isAuthenticated, validateProjectAccess('write'), async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const budgetData = insertProjectBudgetLineSchema.parse({
        ...req.body,
        projectId
      });
      const budget = await storage.createProjectBudgetLine(budgetData);
      res.status(201).json(budget);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid budget data", 
          errors: error.errors 
        });
      }
      console.error("Error creating budget line:", error);
      res.status(500).json({ message: "Failed to create budget line" });
    }
  });

  // Update budget line
  app.put("/api/budget-lines/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      // Get budget line to validate project access
      const budgetLine = await storage.getProjectBudgetLine(id);
      if (!budgetLine) {
        return res.status(404).json({ message: "Budget line not found" });
      }
      
      // Validate project write access
      const projectAccess = await storage.validateProjectAccess(budgetLine.projectId, userId, 'write');
      if (!projectAccess.isValid) {
        return res.status(403).json({ message: "Insufficient permissions to update budget line" });
      }
      
      const budgetData = insertProjectBudgetLineSchema.partial().parse(req.body);
      const budget = await storage.updateProjectBudgetLine(id, budgetData);
      if (!budget) {
        return res.status(404).json({ message: "Budget line not found" });
      }
      res.json(budget);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid budget data", 
          errors: error.errors 
        });
      }
      console.error("Error updating budget line:", error);
      res.status(500).json({ message: "Failed to update budget line" });
    }
  });

  // Get financial summary
  app.get("/api/projects/:id/financials", isAuthenticated, validateProjectAccess('read'), async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const financials = await storage.getProjectFinancial(projectId);
      res.json(financials);
    } catch (error) {
      console.error("Error fetching financials:", error);
      res.status(500).json({ message: "Failed to fetch financials" });
    }
  });

  // Create change order
  app.post("/api/projects/:id/change-orders", isAuthenticated, validateProjectAccess('write'), async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const changeOrderData = insertProjectChangeOrderSchema.parse({
        ...req.body,
        projectId
      });
      const changeOrder = await storage.createProjectChangeOrder(changeOrderData);
      res.status(201).json(changeOrder);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid change order data", 
          errors: error.errors 
        });
      }
      console.error("Error creating change order:", error);
      res.status(500).json({ message: "Failed to create change order" });
    }
  });

  // Approve change order
  app.put("/api/change-orders/:id/approve", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { approvedBy, approvalType } = req.body;
      
      const changeOrder = await storage.approveProjectChangeOrder(id, approvedBy);
      if (!changeOrder) {
        return res.status(404).json({ message: "Change order not found" });
      }
      res.json(changeOrder);
    } catch (error) {
      console.error("Error approving change order:", error);
      res.status(500).json({ message: "Failed to approve change order" });
    }
  });

  // ======================
  // TIME & PROGRESS ENDPOINTS
  // ======================

  // Get time entries
  app.get("/api/projects/:id/time-entries", isAuthenticated, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const timeEntries = await storage.getProjectTimeEntries(projectId);
      res.json(timeEntries);
    } catch (error) {
      console.error("Error fetching time entries:", error);
      res.status(500).json({ message: "Failed to fetch time entries" });
    }
  });

  // Create time entry
  app.post("/api/projects/:id/time-entries", isAuthenticated, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const timeEntryData = insertProjectTimeEntrySchema.parse({
        ...req.body,
        projectId
      });
      const timeEntry = await storage.createProjectTimeEntry(timeEntryData);
      res.status(201).json(timeEntry);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid time entry data", 
          errors: error.errors 
        });
      }
      console.error("Error creating time entry:", error);
      res.status(500).json({ message: "Failed to create time entry" });
    }
  });

  // Approve time entry
  app.put("/api/time-entries/:id/approve", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { approvedBy } = req.body;
      
      const timeEntry = await storage.approveProjectTimeEntry(id, approvedBy);
      if (!timeEntry) {
        return res.status(404).json({ message: "Time entry not found" });
      }
      res.json(timeEntry);
    } catch (error) {
      console.error("Error approving time entry:", error);
      res.status(500).json({ message: "Failed to approve time entry" });
    }
  });

  // Get progress entries
  app.get("/api/projects/:id/progress", isAuthenticated, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const { startDate, endDate } = req.query;
      
      let progress;
      if (startDate && endDate) {
        progress = await storage.getProjectProgressByDate(
          projectId,
          new Date(startDate as string),
          new Date(endDate as string)
        );
      } else {
        progress = await storage.getProjectProgress(projectId);
      }
      
      res.json(progress);
    } catch (error) {
      console.error("Error fetching progress:", error);
      res.status(500).json({ message: "Failed to fetch progress" });
    }
  });

  // Create progress entry
  app.post("/api/projects/:id/progress", isAuthenticated, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const progressData = insertProjectProgressSchema.parse({
        ...req.body,
        projectId
      });
      const progress = await storage.createProjectProgressEntry(progressData);
      res.status(201).json(progress);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid progress data", 
          errors: error.errors 
        });
      }
      console.error("Error creating progress entry:", error);
      res.status(500).json({ message: "Failed to create progress entry" });
    }
  });

  // ======================
  // ADDITIONAL MANAGEMENT ENDPOINTS
  // ======================

  // Get project materials
  app.get("/api/projects/:id/materials", isAuthenticated, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const materials = await storage.getProjectMaterials(projectId);
      res.json(materials);
    } catch (error) {
      console.error("Error fetching materials:", error);
      res.status(500).json({ message: "Failed to fetch materials" });
    }
  });

  // Create material
  app.post("/api/projects/:id/materials", isAuthenticated, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const materialData = insertProjectMaterialSchema.parse({
        ...req.body,
        projectId
      });
      const material = await storage.createProjectMaterial(materialData);
      res.status(201).json(material);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid material data", 
          errors: error.errors 
        });
      }
      console.error("Error creating material:", error);
      res.status(500).json({ message: "Failed to create material" });
    }
  });

  // Get project purchase orders
  app.get("/api/projects/:id/purchase-orders", isAuthenticated, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const purchaseOrders = await storage.getProjectPurchaseOrders(projectId);
      res.json(purchaseOrders);
    } catch (error) {
      console.error("Error fetching purchase orders:", error);
      res.status(500).json({ message: "Failed to fetch purchase orders" });
    }
  });

  // Create purchase order
  app.post("/api/projects/:id/purchase-orders", isAuthenticated, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const purchaseOrderData = insertProjectPurchaseOrderSchema.parse({
        ...req.body,
        projectId
      });
      const purchaseOrder = await storage.createProjectPurchaseOrder(purchaseOrderData);
      res.status(201).json(purchaseOrder);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid purchase order data", 
          errors: error.errors 
        });
      }
      console.error("Error creating purchase order:", error);
      res.status(500).json({ message: "Failed to create purchase order" });
    }
  });

  // Get schedule events
  app.get("/api/projects/:id/schedule", isAuthenticated, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const { startDate, endDate } = req.query;
      
      let events;
      if (startDate && endDate) {
        events = await storage.getScheduleEventsByDateRange(
          new Date(startDate as string),
          new Date(endDate as string)
        );
      } else {
        events = await storage.getProjectScheduleEvents(projectId);
      }
      
      res.json(events);
    } catch (error) {
      console.error("Error fetching schedule:", error);
      res.status(500).json({ message: "Failed to fetch schedule" });
    }
  });

  // Create schedule event
  app.post("/api/projects/:id/schedule", isAuthenticated, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const scheduleData = insertProjectScheduleEventSchema.parse({
        ...req.body,
        projectId
      });
      const scheduleEvent = await storage.createProjectScheduleEvent(scheduleData);
      res.status(201).json(scheduleEvent);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid schedule data", 
          errors: error.errors 
        });
      }
      console.error("Error creating schedule event:", error);
      res.status(500).json({ message: "Failed to create schedule event" });
    }
  });

  // Get project profitability report
  app.get("/api/projects/:id/profitability", isAuthenticated, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const report = await storage.getProjectProfitabilityReport(projectId);
      res.json(report);
    } catch (error) {
      console.error("Error fetching profitability report:", error);
      res.status(500).json({ message: "Failed to fetch profitability report" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
