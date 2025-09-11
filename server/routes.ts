import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertCustomerSchema, insertQuoteSchema, insertLineItemSchema, insertProductSchema, insertContractTemplateSchema, insertProposalTemplateSchema, insertPricingTableSchema, insertProductAccessorySchema } from "@shared/schema";
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

  const httpServer = createServer(app);
  return httpServer;
}
