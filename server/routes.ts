import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { db } from "./db";
import { accounts, products } from "@shared/schema";
import { eq, or, ilike, and } from "drizzle-orm";
import {
  insertAccountSchema,
  insertCustomerSchema,
  insertQuoteSchema,
  updateQuoteSchema,
  updateAccountSchema,
  insertLineItemSchema,
  insertGroupSchema,
  groupIdParamSchema,
  reorderLineItemsSchema,
  reorderGroupsSchema,
  insertProductSchema,
  insertContractTemplateSchema,
  insertPricingTableSchema,
  insertProductAccessorySchema,
  createUserSchema,
  updateUserSchema,
  idParamSchema,
  queryIdParamSchema,
  productIdParamSchema,
  uploadUrlSchema,
  finalizeUploadSchema,
  imageProxySchema,
  calculatePriceSchema,
  bulkDeleteSchema,
  bulkUpdateSchema,
  bulkUpdateProductsSchema,
  bulkUploadPricingSchema,
  createQuoteCoverPhotoSchema,
  createQuoteProductRenderingSchema,
  updateQuoteCoverPhotoSchema,
  updateQuoteProductRenderingSchema,
  quoteIdParamSchema,
  imageIdParamSchema,
  insertIssueReportSchema,
  createQuoteSchema,
  CreateQuoteBody,
  signatureTokenParamSchema,
  submitSignatureSchema
} from "./validation-schemas";
import multer from "multer";
import * as XLSX from "xlsx";
import { extractProductsFromImage, extractProductsFromText, extractQuoteDataFromImages, extractQuoteDataFromPDF } from "./openai";
import { convertPDFToImagesServer } from "./quoteImageUtils";
import type { ExtractedProduct } from "./openai";
import { ObjectStorageService, ObjectNotFoundError, objectStorageClient } from "./objectStorage";
import { ObjectPermission } from "./objectAcl";
import type { InsertQuote } from "@shared/schema";
import { nanoid } from "nanoid";

// Simple in-memory rate limiter for OpenAI API calls
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

class SimpleRateLimiter {
  private limits: Map<string, RateLimitEntry> = new Map();
  
  constructor(
    private maxRequests: number,
    private windowMs: number
  ) {}

  isAllowed(identifier: string): boolean {
    const now = Date.now();
    const entry = this.limits.get(identifier);
    
    if (!entry || now > entry.resetTime) {
      // First request or window expired, create new entry
      this.limits.set(identifier, {
        count: 1,
        resetTime: now + this.windowMs
      });
      return true;
    }
    
    if (entry.count >= this.maxRequests) {
      return false; // Rate limit exceeded
    }
    
    // Increment counter
    entry.count++;
    return true;
  }

  getRemainingTime(identifier: string): number {
    const entry = this.limits.get(identifier);
    if (!entry) return 0;
    
    return Math.max(0, entry.resetTime - Date.now());
  }

  // Clean up expired entries periodically
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of Array.from(this.limits.entries())) {
      if (now > entry.resetTime) {
        this.limits.delete(key);
      }
    }
  }
}

// Rate limiter for OpenAI PDF processing endpoints
// Allow 10 requests per user per 10 minutes
const pdfProcessingRateLimit = new SimpleRateLimiter(10, 10 * 60 * 1000);

// Clean up expired entries every 5 minutes
setInterval(() => {
  pdfProcessingRateLimit.cleanup();
}, 5 * 60 * 1000);

// Rate limiting middleware for PDF processing endpoints
const rateLimitPDFProcessing = (req: any, res: any, next: any) => {
  const userIdentifier = req.user?.id || req.ip || 'anonymous';
  
  if (!pdfProcessingRateLimit.isAllowed(userIdentifier)) {
    const remainingTime = pdfProcessingRateLimit.getRemainingTime(userIdentifier);
    const remainingMinutes = Math.ceil(remainingTime / (60 * 1000));
    
    console.warn(`🚫 Rate limit exceeded for user ${userIdentifier}`);
    
    return res.status(429).json({
      message: `Too many PDF processing requests. Please try again in ${remainingMinutes} minute${remainingMinutes === 1 ? '' : 's'}.`,
      success: false,
      retryAfter: remainingTime
    });
  }
  
  next();
};

/**
 * Helper function to strip internal validation metadata from API responses
 * Removes any internal metadata fields that shouldn't be returned to clients
 */
function stripValidationMetadata(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(stripValidationMetadata);
  } else if (obj && typeof obj === 'object') {
    // Remove any internal validation metadata fields
    const { _categoryValidation, _categoryUpdate, ...cleanObj } = obj;
    const result: any = {};
    for (const [key, value] of Object.entries(cleanObj)) {
      result[key] = stripValidationMetadata(value);
    }
    return result;
  }
  return obj;
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

/**
 * Server-side calculation verification utility
 * 
 * Ensures calculation integrity by recalculating line item totals server-side.
 * This prevents client-side manipulation and ensures consistency.
 * 
 * Calculation Order (must match client-side):
 * 1. Calculate base total: quantity × unitPrice
 * 2. Apply manufacturer discount to base total
 * 3. Apply markup to the discounted amount
 * 
 * Validation Rules:
 * - Quantity: 0.01 to 999,999
 * - Unit Price: 0 to 10,000,000
 * - Markup: 0 to 1000 (percentage or fixed)
 * - Discount: 0 to 100% or 0 to base total (fixed)
 * - All results rounded to 2 decimal places
 * - Tolerance for comparison: ±$0.01 (for floating-point precision)
 * 
 * @param quantity - Number of items
 * @param unitPrice - Price per item
 * @param markupType - "percentage" or "dollar"
 * @param markupValue - Markup amount
 * @param discountType - Manufacturer discount type
 * @param discountValue - Manufacturer discount amount
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
  expectedTotal?: number | string
): { isValid: boolean; calculatedTotal: number; expectedTotal: number; discrepancy: number } {
  // Parse values
  const qty = typeof quantity === 'string' ? parseFloat(quantity) : quantity;
  const price = typeof unitPrice === 'string' ? parseFloat(unitPrice) : unitPrice;
  const markup = typeof markupValue === 'string' ? parseFloat(markupValue) : markupValue;
  const discount = typeof discountValue === 'string' ? parseFloat(discountValue) : discountValue;
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
  if (!isFinite(markup) || markup < -10000000 || markup > 10000000) {
    console.warn(`⚠️ Invalid markup value: ${markup}`);
    return { isValid: false, calculatedTotal: 0, expectedTotal: expected, discrepancy: expected };
  }
  if (!isFinite(discount) || discount < 0) {
    console.warn(`⚠️ Invalid discount value: ${discount}`);
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
  
  let calculatedTotal = afterDiscount;
  if (markupType === 'percentage') {
    calculatedTotal = afterDiscount + (afterDiscount * (markup / 100));
  } else {
    calculatedTotal = afterDiscount + markup;
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

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
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
    // Prevent caching to ensure fresh authentication checks
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'ETag': '' // Disable ETag generation to prevent 304 responses
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

  // Get all users (for rep filters, etc.)
  app.get('/api/users', isAuthenticated, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      // Map to include only necessary fields for frontend
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

  // Real image upload endpoints using Object Storage
  // Note: Import moved to top of file below

  // Get upload URL for image uploads
  app.post("/api/images/upload-url", isAuthenticated, async (req, res) => {
    try {
      // Validate request body
      const validatedData = uploadUrlSchema.safeParse(req.body);
      if (!validatedData.success) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: validatedData.error.errors 
        });
      }
      
      const { imageType, filename } = validatedData.data;
      
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
      // Validate request body
      const validatedData = finalizeUploadSchema.safeParse(req.body);
      if (!validatedData.success) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: validatedData.error.errors 
        });
      }
      
      const { objectPath } = validatedData.data;
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(401).json({ message: "User authentication required" });
      }
      
      const objectStorageService = new ObjectStorageService();
      
      // Set ACL policy - making images public for now (quotes are shareable)
      const normalizedPath = await objectStorageService.trySetObjectEntityAclPolicy(
        objectPath,
        {
          owner: String(userId),
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

  // Serve quote images without auth (for PDF generation and previews)
  app.get("/quote-images/:filename", async (req, res) => {
    try {
      const { filename } = req.params;
      const objectStorageService = new ObjectStorageService();
      
      // Get the bucket and list files to find the one ending with our filename
      const privateDir = objectStorageService.getPrivateObjectDir();
      const directories = ['cover-photos', 'product-renderings'];
      
      for (const dir of directories) {
        try {
          const bucketName = privateDir.split('/')[1]; // Extract bucket name
          const bucket = objectStorageClient.bucket(bucketName);
          const prefix = `${privateDir.split('/').slice(2).join('/')}/${dir}/`;
          
          const [files] = await bucket.getFiles({ prefix });
          
          // Look for a file that ends with our filename
          const matchingFile = files.find(file => file.name.endsWith(filename));
          if (matchingFile) {
            // Get file metadata for proper headers
            const [metadata] = await matchingFile.getMetadata();
            
            // Set CORS and caching headers for PDF generation
            res.setHeader('Content-Type', metadata.contentType || 'application/octet-stream');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cache-Control', 'public, max-age=3600');
            
            // Stream the file to the response
            const stream = matchingFile.createReadStream();
            stream.pipe(res);
            return;
          }
        } catch (error: any) {
          continue;
        }
      }
      
      res.status(404).json({ message: "Image not found" });
    } catch (error) {
      console.error("Error serving quote image:", error);
      res.status(500).json({ message: "Failed to serve image" });
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
        userId: String(userId),
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
      // Validate query parameters
      const validatedData = imageProxySchema.safeParse(req.query);
      if (!validatedData.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: validatedData.error.errors 
        });
      }
      
      const imageUrl = validatedData.data.url;
      
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

  // Account routes (formerly customer routes)
  app.get("/api/accounts", isAuthenticated, async (req, res) => {
    try {
      const searchTerm = req.query.search as string;
      
      if (searchTerm && searchTerm.length > 0) {
        // Search functionality
        console.log(`[SEARCH] Account search request: search="${searchTerm}"`);
        const term = searchTerm.toLowerCase();
        
        // Search accounts directly
        const accountResults = await db
          .select()
          .from(accounts)
          .where(
            or(
              ilike(accounts.name, `%${term}%`),
              ilike(accounts.email, `%${term}%`),
              ilike(accounts.company, `%${term}%`)
            )
          )
          .limit(10);
        
        console.log(`[SEARCH] Found ${accountResults.length} accounts for term "${term}"`);
        res.json(accountResults);
      } else {
        // Return all accounts when no search term
        const accounts = await storage.getAllAccounts();
        res.json(accounts);
      }
    } catch (error) {
      console.error("Error fetching accounts:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Account search endpoint for autocomplete - MUST be before :id routes
  app.get("/api/accounts/search", isAuthenticated, async (req, res) => {
    try {
      const searchTerm = req.query.q as string;
      console.log(`[SEARCH] Account search request: q="${searchTerm}"`);
      
      if (!searchTerm || searchTerm.length < 1) {
        console.log("[SEARCH] Empty or short search term, returning empty array");
        return res.json([]);
      }
      
      // Direct database query to avoid any storage layer issues
      const term = searchTerm.toLowerCase();
      console.log(`[SEARCH] Searching for term: "${term}"`);
      
      // Search accounts directly
      const accountResults = await db
        .select()
        .from(accounts)
        .where(
          or(
            ilike(accounts.name, `%${term}%`),
            ilike(accounts.email, `%${term}%`),
            ilike(accounts.company, `%${term}%`)
          )
        )
        .limit(10);
      
      console.log(`[SEARCH] Found ${accountResults.length} accounts`);
      console.log(`[SEARCH] Returning ${accountResults.length} results`);
      res.json(accountResults.slice(0, 10));
    } catch (error) {
      console.error("[SEARCH ERROR] Account search error:", error);
      if (error instanceof Error) {
        console.error("[SEARCH ERROR] Message:", error.message);
        console.error("[SEARCH ERROR] Stack:", error.stack);
      }
      res.status(500).json({ message: "Search failed", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.get("/api/accounts/:id", isAuthenticated, async (req, res) => {
    try {
      // Validate ID parameter
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }
      
      const account = await storage.getAccount(params.data.id);
      if (!account) {
        return res.status(404).json({ message: "Account not found" });
      }
      res.json(account);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/accounts/:id/details", isAuthenticated, async (req, res) => {
    try {
      // Validate ID parameter
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }
      
      const accountDetails = await storage.getAccountWithDetails(params.data.id);
      if (!accountDetails) {
        return res.status(404).json({ message: "Account not found" });
      }
      res.json(accountDetails);
    } catch (error) {
      console.error("Error fetching account details:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/accounts/:id", isAuthenticated, async (req, res) => {
    try {
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }
      
      const deleted = await storage.deleteAccount(params.data.id);
      if (!deleted) {
        return res.status(404).json({ message: "Account not found" });
      }
      res.status(204).send();
    } catch (error: any) {
      if (error.message?.includes("Cannot delete account with existing quotes")) {
        return res.status(409).json({ 
          message: "Cannot delete account with existing projects. Please delete or reassign all projects first." 
        });
      }
      console.error("Account deletion error:", error);
      res.status(500).json({ message: "Failed to delete account" });
    }
  });

  // Legacy customer route for backward compatibility
  app.get("/api/customers/:id", isAuthenticated, async (req, res) => {
    try {
      // Validate ID parameter
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }
      
      const customer = await storage.getCustomer(params.data.id);
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }
      res.json(customer);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Legacy customer search endpoint for backward compatibility
  app.get("/api/customers/search", isAuthenticated, async (req, res) => {
    try {
      const searchTerm = req.query.q as string;
      console.log(`Customer search request: q="${searchTerm}"`);
      
      if (!searchTerm) {
        console.log("Empty search term, returning empty array");
        return res.json([]);
      }
      
      console.log("Calling storage.searchCustomers...");
      const customers = await storage.searchCustomers(searchTerm);
      console.log(`Search completed, found ${customers.length} results`);
      res.json(customers);
    } catch (error) {
      console.error("Customer search error:", error);
      if (error instanceof Error) {
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
      }
      res.status(400).json({ message: "Invalid request parameter", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.post("/api/accounts", isAuthenticated, async (req, res) => {
    try {
      console.log("Account creation request body:", JSON.stringify(req.body, null, 2));
      const accountData = insertAccountSchema.parse(req.body);
      
      // Options for duplicate handling and contact creation
      const allowDuplicate = req.body.allowDuplicate === true;
      const updateIfExists = req.body.updateIfExists !== false; // Default to true
      const createPrimaryContact = req.body.createPrimaryContact !== false; // Default to true
      
      const account = await storage.createAccount(accountData, {
        allowDuplicate,
        updateIfExists,
        createPrimaryContact
      });
      
      // Check if this was an update of existing account or new creation
      // by checking if the account existed before (we can detect this from logs)
      const duplicate = await storage.findDuplicateAccount(accountData);
      
      if (duplicate && duplicate.id === account.id && !allowDuplicate) {
        // This was an update of existing account
        res.status(200).json({
          ...account,
          _wasExisting: true,
          _message: "Account already existed and was updated with new information"
        });
      } else {
        // This was a new account creation
        res.status(201).json(account);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("Account validation error:", JSON.stringify(error.errors, null, 2));
        return res.status(400).json({ message: "Invalid account data", errors: error.errors });
      }
      console.error("Account creation error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Legacy customer route for backward compatibility
  app.post("/api/customers", isAuthenticated, async (req, res) => {
    try {
      const customerData = insertCustomerSchema.parse(req.body);
      
      // Options for duplicate handling and contact creation
      const allowDuplicate = req.body.allowDuplicate === true;
      const updateIfExists = req.body.updateIfExists !== false; // Default to true
      const createPrimaryContact = req.body.createPrimaryContact !== false; // Default to true
      
      const customer = await storage.createCustomer(customerData, {
        allowDuplicate,
        updateIfExists,
        createPrimaryContact
      });
      
      // Check if this was an update of existing customer or new creation
      // by checking if the customer existed before (we can detect this from logs)
      const duplicate = await storage.findDuplicateCustomer(customerData);
      
      if (duplicate && duplicate.id === customer.id && !allowDuplicate) {
        // This was an update of existing customer
        res.status(200).json({
          ...customer,
          _wasExisting: true,
          _message: "Customer already existed and was updated with new information"
        });
      } else {
        // This was a new customer creation
        res.status(201).json(customer);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid customer data", errors: error.errors });
      }
      console.error("Customer creation error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/accounts/:id", isAuthenticated, async (req, res) => {
    try {
      // Validate ID parameter
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }
      
      console.log("Account update request body:", JSON.stringify(req.body, null, 2));
      const accountData = updateAccountSchema.parse(req.body);
      const account = await storage.updateAccount(params.data.id, accountData);
      if (!account) {
        return res.status(404).json({ message: "Account not found" });
      }
      res.json(account);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid account data", errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Legacy customer route for backward compatibility
  app.put("/api/customers/:id", isAuthenticated, async (req, res) => {
    try {
      // Validate ID parameter
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }
      
      const customerData = insertCustomerSchema.partial().parse(req.body);
      const customer = await storage.updateCustomer(params.data.id, customerData);
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

  // Client routes - unified model for accounts with integrated contact info
  // These provide a cleaner API for the new unified client model
  app.get("/api/clients", isAuthenticated, async (req, res) => {
    try {
      const searchTerm = req.query.search as string;
      
      if (searchTerm && searchTerm.length > 0) {
        // Search functionality
        console.log(`[CLIENT SEARCH] Search request: search="${searchTerm}"`);
        const clients = await storage.searchClients(searchTerm);
        console.log(`[CLIENT SEARCH] Found ${clients.length} clients for term "${searchTerm}"`);
        res.json(clients);
      } else {
        // Return all clients when no search term
        const clients = await storage.getAllClients();
        res.json(clients);
      }
    } catch (error) {
      console.error("Error fetching clients:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/clients/search", isAuthenticated, async (req, res) => {
    try {
      const searchTerm = req.query.q as string;
      console.log(`[CLIENT SEARCH] Autocomplete request: q="${searchTerm}"`);
      
      if (!searchTerm || searchTerm.length < 1) {
        console.log("[CLIENT SEARCH] Empty search term, returning empty array");
        return res.json([]);
      }
      
      const clients = await storage.searchClients(searchTerm);
      console.log(`[CLIENT SEARCH] Found ${clients.length} clients`);
      res.json(clients);
    } catch (error) {
      console.error("Client search error:", error);
      res.status(400).json({ message: "Invalid request parameter", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.get("/api/clients/:id", isAuthenticated, async (req, res) => {
    try {
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }
      
      const client = await storage.getClient(params.data.id);
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }
      res.json(client);
    } catch (error) {
      console.error("Error fetching client:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/clients/:id/details", isAuthenticated, async (req, res) => {
    try {
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }
      
      const clientDetails = await storage.getClientWithDetails(params.data.id);
      if (!clientDetails) {
        return res.status(404).json({ message: "Client not found" });
      }
      res.json(clientDetails);
    } catch (error) {
      console.error("Error fetching client details:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/clients", isAuthenticated, async (req, res) => {
    try {
      console.log("Client creation request body:", JSON.stringify(req.body, null, 2));
      const clientData = insertAccountSchema.parse(req.body);
      
      // Options for duplicate handling (no contact creation since info is integrated)
      const allowDuplicate = req.body.allowDuplicate === true;
      const updateIfExists = req.body.updateIfExists !== false; // Default to true
      
      const client = await storage.createClient(clientData, {
        allowDuplicate,
        updateIfExists
      });
      
      res.status(201).json(client);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("Client validation error:", JSON.stringify(error.errors, null, 2));
        return res.status(400).json({ message: "Invalid client data", errors: error.errors });
      }
      console.error("Client creation error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/clients/:id", isAuthenticated, async (req, res) => {
    try {
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }
      
      console.log("Client update request body:", JSON.stringify(req.body, null, 2));
      const clientData = updateAccountSchema.parse(req.body);
      const client = await storage.updateClient(params.data.id, clientData);
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }
      res.json(client);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid client data", errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/clients/:id", isAuthenticated, async (req, res) => {
    try {
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }
      
      const deleted = await storage.deleteClient(params.data.id);
      if (!deleted) {
        return res.status(404).json({ message: "Client not found or has existing quotes" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Client deletion error:", error);
      if (error instanceof Error && error.message.includes("existing quotes")) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to delete client" });
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
      // Validate ID parameter
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }
      
      const quote = await storage.getQuoteWithDetails(params.data.id);
      if (!quote) {
        return res.status(404).json({ message: "Quote not found" });
      }
      res.json(quote);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Helper function to parse name into firstName and lastName
  function parseFullName(fullName: string): { firstName: string; lastName: string } {
    const trimmed = fullName.trim();
    if (!trimmed) {
      return { firstName: '', lastName: '' };
    }
    
    // Split by spaces and handle various name formats
    const parts = trimmed.split(/\s+/);
    if (parts.length === 1) {
      // Single name - use as firstName
      return { firstName: parts[0], lastName: '' };
    } else if (parts.length === 2) {
      // Two names - firstName lastName
      return { firstName: parts[0], lastName: parts[1] };
    } else {
      // Multiple names - first part is firstName, rest is lastName
      return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
    }
  }

  // Helper function to handle customer attachment based on attachCustomer behavior
  async function handleCustomerAttachment(
    customerData: { name?: string | null; email?: string | null; phone?: string | null; company?: string | null; address?: string | null },
    attachCustomer: 'auto' | 'none' | 'match_only',
    existingCustomerId?: number
  ): Promise<{ accountId: number | null; wasCreated: boolean }> {
    if (attachCustomer === 'none') {
      // Never attach during import
      return { accountId: null, wasCreated: false };
    }

    // Check if we only have company data (no contact information)
    const hasContactInfo = !!(
      (customerData.name && customerData.name.trim()) || 
      (customerData.email && customerData.email.trim()) || 
      (customerData.phone && customerData.phone.trim())
    );
    const hasCompanyOnly = !hasContactInfo && customerData.company && customerData.company.trim();

    // If company-only import, try to match by company name first
    if (hasCompanyOnly && attachCustomer === 'auto') {
      console.log('Company-only import detected, checking for existing company match');
      
      // Try to find existing account by company name (excluding placeholders)
      const accounts = await storage.getAllAccounts();
      const existingByCompany = accounts.find(acc => {
        const isPlaceholder = acc.name === 'Unnamed Client' && (!acc.email || !acc.email.trim()) && (!acc.phone || !acc.phone.trim());
        const companyMatches = acc.company && acc.company.toLowerCase().trim() === customerData.company?.toLowerCase().trim();
        return !isPlaceholder && companyMatches;
      });

      if (existingByCompany) {
        console.log(`Found existing company match: ${existingByCompany.name} (ID: ${existingByCompany.id})`);
        return { accountId: existingByCompany.id, wasCreated: false };
      }

      // No match found - create new account with company name
      console.log('No existing company found, creating new account');
      const clientData = {
        name: customerData.company!.trim(),
        firstName: undefined,
        lastName: undefined,
        email: `import_${Date.now()}@example.com`,
        phone: '',
        company: customerData.company || undefined,
        accountType: 'commercial' as const,
        paymentTerms: 'net_30' as const,
        billingAddress: customerData.address || undefined,
      };

      const newClient = await storage.createClient(clientData, {
        allowDuplicate: true, // Create new if no company match found
        updateIfExists: false
      });
      return { accountId: newClient.id, wasCreated: true };
    }

    // Try to find existing customer by email first, then by name
    let existingAccount = null;
    if (customerData.email && customerData.email.trim()) {
      existingAccount = await storage.getAccountByEmail(customerData.email);
    }
    
    if (!existingAccount && customerData.name && customerData.name.trim()) {
      // Try to find by name if no email match
      // But skip matching against placeholder accounts (Unnamed Client with no contact info)
      const accounts = await storage.getAllAccounts();
      existingAccount = accounts.find(acc => {
        const isPlaceholder = acc.name === 'Unnamed Client' && (!acc.email || !acc.email.trim()) && (!acc.phone || !acc.phone.trim());
        return !isPlaceholder && acc.name.toLowerCase().trim() === (customerData.name?.toLowerCase().trim() || '');
      });
    }

    if (existingAccount) {
      // Found match - only update if it's not a placeholder account
      const isPlaceholder = existingAccount.name === 'Unnamed Client' && 
                           (!existingAccount.email || !existingAccount.email.trim()) && 
                           (!existingAccount.phone || !existingAccount.phone.trim());
      
      if (isPlaceholder) {
        console.log(`Skipping placeholder account ${existingAccount.id}, will create new account instead`);
        existingAccount = null;
      } else {
        console.log(`Found existing account match: ${existingAccount.name} (ID: ${existingAccount.id})`);
        return { accountId: existingAccount.id, wasCreated: false };
      }
    }

    if (attachCustomer === 'match_only') {
      // Only attach if found; else leave null
      return { accountId: null, wasCreated: false };
    }

    if (attachCustomer === 'auto') {
      // Create new client with integrated contact info (unified model)
      // Use provided firstName/lastName if available, otherwise parse from name
      let firstName = (customerData as any).firstName || '';
      let lastName = (customerData as any).lastName || '';
      
      if (!firstName && !lastName && customerData.name) {
        const parsed = parseFullName(customerData.name);
        firstName = parsed.firstName;
        lastName = parsed.lastName;
      }
      
      // Construct name from firstName/lastName if not provided
      const name = customerData.name || `${firstName} ${lastName}`.trim() || 'Unnamed Client';
      
      const clientData = {
        name,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        email: customerData.email || `import_${Date.now()}@example.com`,
        phone: customerData.phone || '',
        company: customerData.company || undefined,
        accountType: 'homeowner' as const,
        paymentTerms: 'net_30' as const,
        billingAddress: customerData.address || undefined,
      };

      console.log('Creating new client for import (unified model):', clientData);
      const newClient = await storage.createClient(clientData, {
        allowDuplicate: false, // Allow duplicate detection for regular imports
        updateIfExists: true // Update existing accounts if found
      });
      return { accountId: newClient.id, wasCreated: true };
    }

    return { accountId: null, wasCreated: false };
  }

  // Helper function to upsert account from customer creation hint
  async function upsertAccountFromHint(customerCreate: NonNullable<CreateQuoteBody['customerCreate']>) {
    try {
      // Check if account exists by email (if provided)
      if (customerCreate.email) {
        const existingAccount = await storage.getAccountByEmail(customerCreate.email);
        if (existingAccount) {
          console.log(`Found existing account by email: ${customerCreate.email}`);
          return existingAccount;
        }
      }
      
      // Create new account with provided data
      const accountData = {
        name: customerCreate.name || '',
        email: customerCreate.email || '',
        phone: customerCreate.phone || '',
        company: customerCreate.company || undefined,
        accountType: 'homeowner' as const,
        paymentTerms: 'net_30' as const,
        billingAddress: undefined,
      };
      
      console.log('Creating new account from customer hint:', accountData);
      const newAccount = await storage.createAccount(accountData);
      return newAccount;
    } catch (error) {
      console.error('Error upserting account from hint:', error);
      throw error;
    }
  }

  app.post("/api/quotes", isAuthenticated, async (req, res) => {
    try {
      console.log("Quote creation request body:", JSON.stringify(req.body, null, 2));
      const { accountId, customerCreate, ...baseQuoteData } = createQuoteSchema.parse(req.body);
      
      let resolvedAccountId = accountId ?? null;

      // Only create/get an Account when explicitly requested via customerCreate
      if (!resolvedAccountId && customerCreate) {
        console.log("Creating account from customer hint");
        const account = await upsertAccountFromHint(customerCreate);
        resolvedAccountId = account.id;
      }

      // Build the quote data for storage
      const quoteData: InsertQuote = {
        ...baseQuoteData,
        accountId: resolvedAccountId,
        quoteNumber: `Q-${Date.now()}`, // Auto-generate unique quote number
        projectName: baseQuoteData.projectName || "",
        projectAddress: baseQuoteData.projectAddress || "",
        estimatedStartDate: baseQuoteData.estimatedStartDate || "",
        notes: baseQuoteData.notes || "UNLESS OTHERWISE STATED, PRICING DOES NOT INCLUDE LIFT, FRAMING, FOOTINGS, AND/OR ELECTRICAL",
        taxRate: baseQuoteData.taxRate || "0",
        discount: baseQuoteData.discount || "0", 
        shipping: baseQuoteData.shipping || "0",
        isShippingTaxable: true,
        dealStage: baseQuoteData.dealStage || "new_lead",
        jobsiteAddress: baseQuoteData.jobsiteAddress || undefined,
        lostReason: baseQuoteData.lostReason || undefined,
        contractTemplateId: baseQuoteData.contractTemplateId || undefined,
        customContractTerms: baseQuoteData.customContractTerms || undefined,
      };
      
      const quote = await storage.createQuote(quoteData);
      res.status(201).json(quote);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        console.error("Quote validation errors:", JSON.stringify(error.errors, null, 2));
        return res.status(400).json({ message: "Invalid quote data", errors: error.errors });
      }
      
      // Handle unique constraint violations
      if (error.message?.includes("already exists") || error.message?.includes("Unable to generate unique quote number")) {
        console.error("Quote number uniqueness error:", error.message);
        return res.status(409).json({ 
          message: error.message || "Quote number already exists", 
          code: "DUPLICATE_QUOTE_NUMBER" 
        });
      }
      
      console.error("Quote creation error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });


  // Direct PDF processing endpoint - handles conversion and vision processing server-side
  app.post("/api/quotes/import-vision-direct", isAuthenticated, rateLimitPDFProcessing, upload.single('pdf'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ 
          message: "No PDF file uploaded",
          success: false 
        });
      }

      const file = req.file;
      
      // Validate file type
      if (file.mimetype !== 'application/pdf') {
        return res.status(400).json({ 
          message: "Invalid file type. Please upload a PDF file.",
          success: false 
        });
      }

      // Validate file size (30MB limit for vision processing)
      if (file.size > 30 * 1024 * 1024) {
        return res.status(400).json({ 
          message: "File too large. Please upload a PDF smaller than 30MB.",
          success: false 
        });
      }

      console.log(`📄 Processing PDF directly with GPT-5: ${file.originalname} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);

      // Extract quote data directly using GPT-5's native PDF support
      const extractedQuote = await extractQuoteDataFromPDF(file.buffer);
      
      if (!extractedQuote) {
        return res.status(400).json({ 
          message: "Could not extract quote data from PDF. This could be due to: (1) The document doesn't contain recognizable quote/invoice information, (2) The text is unclear or heavily formatted, (3) The document is password-protected or corrupted. Please try a different PDF or ensure it contains standard quote/invoice data.",
          success: false 
        });
      }

      console.log(`✅ Quote data extracted from ${file.originalname}`);

      res.status(200).json({
        success: true,
        filename: file.originalname,
        extractedData: extractedQuote,
        message: "Quote data extracted successfully using vision processing"
      });

    } catch (error: any) {
      console.error("Direct PDF processing error:", error);
      
      if (error.message?.includes("API") || error.message?.includes("rate limit") || error.message?.includes("quota")) {
        return res.status(503).json({ 
          message: "AI processing service is temporarily unavailable. Please try again later.",
          success: false 
        });
      }
      
      return res.status(500).json({ 
        message: `PDF processing failed: ${error.message || 'Unexpected error occurred while processing the PDF. Please try again or contact support if the issue persists.'}`,
        success: false 
      });
    }
  });

  // Vision-based PDF import endpoint for processing page images
  app.post("/api/quotes/import-vision", isAuthenticated, rateLimitPDFProcessing, async (req: any, res) => {
    try {
      const visionData = z.object({
        filename: z.string().max(255, "Filename too long"),
        pages: z.array(z.object({
          index: z.number().min(0).max(19, "Page index must be 0-19"),
          imageBase64: z.string().max(2 * 1024 * 1024, "Individual image too large (max 2MB base64)") // ~1.5MB actual image
        })).min(1, "At least one page image is required").max(20, "Maximum 20 pages allowed")
      });

      const { filename, pages } = visionData.parse(req.body);

      // Validate total payload size (more strict)
      const totalImageSize = pages.reduce((sum, page) => sum + page.imageBase64.length, 0);
      const approximateFileSize = (totalImageSize * 3) / 4; // Base64 to binary conversion
      
      if (approximateFileSize > 30 * 1024 * 1024) { // 30MB limit for vision processing
        return res.status(413).json({
          message: "Total file size too large for vision processing (max 30MB). Try reducing image quality or page count.",
          success: false
        });
      }
      
      // Validate individual image sizes
      for (const page of pages) {
        if (page.imageBase64.length < 100) {
          return res.status(400).json({
            message: `Page ${page.index + 1} image data is too small or invalid.`,
            success: false
          });
        }
      }

      // Validate number of pages
      if (pages.length > 20) {
        return res.status(400).json({
          message: "Too many pages. Maximum 20 pages supported.",
          success: false
        });
      }

      console.log(`🔍 Processing vision-based extraction for ${filename} (${pages.length} pages)`);

      // Extract quote data using OpenAI vision
      const extractedQuote = await extractQuoteDataFromImages(pages);
      
      if (!extractedQuote) {
        return res.status(400).json({ 
          message: "Could not extract quote data from PDF images. The document may not contain recognizable quote information or the images may be unclear.",
          success: false 
        });
      }

      console.log(`✅ Vision-based quote data extracted from ${filename}`);

      // Return extracted data
      res.status(200).json({
        success: true,
        filename,
        extractedData: extractedQuote,
        message: "Quote data extracted successfully using vision processing",
        processingMethod: "vision"
      });

    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({
          message: `Invalid request data: ${error.errors.map((e: any) => e.message).join(', ')}`,
          success: false
        });
      }
      
      console.error("PDF vision import error:", error);
      res.status(500).json({ 
        message: "Internal server error while processing vision-based PDF import.",
        success: false 
      });
    }
  });

  // Batch import endpoint for creating quotes from extracted PDF data
  app.post("/api/quotes/import-batch", isAuthenticated, async (req: any, res) => {
    try {
      const importData = z.object({
        importOptions: z.object({
          createNewQuote: z.boolean(),
          combineIntoSingleQuote: z.boolean(),
          existingQuoteId: z.number().optional(),
          attachCustomer: z.enum(['auto', 'none', 'match_only']).default('match_only'),
          existingCustomerId: z.number().optional(),
        }),
        extractedQuotes: z.array(z.object({
          pdfId: z.string(),
          filename: z.string(),
          customer: z.object({
            name: z.string().nullable().optional(),
            email: z.string().nullable().optional(),
            phone: z.string().nullable().optional(),
            company: z.string().nullable().optional(),
            address: z.string().nullable().optional(),
          }),
          quoteNumber: z.string().nullable().optional(),
          date: z.string().nullable().optional(),
          projectDescription: z.string().nullable().optional(),
          lineItems: z.array(z.object({
            description: z.string().nullable().optional(),
            quantity: z.number().nullable().optional(),
            price: z.number().nullable().optional(),
            total: z.number().nullable().optional(),
            unit: z.string().nullable().optional(),
          })),
          subtotal: z.number().nullable().optional(),
          taxRate: z.number().nullable().optional(),
          taxAmount: z.number().nullable().optional(),
          discountAmount: z.number().nullable().optional(),
          total: z.number().nullable().optional(),
          notes: z.string().nullable().optional(),
          terms: z.string().nullable().optional(),
        }))
      }).parse(req.body);

      const results: {
        success: boolean;
        imported: Array<{
          pdfId: string;
          quoteId: number;
          quoteNumber: string;
          lineItemsAdded: number;
          action: 'created' | 'added_to_existing';
        }>;
        errors: Array<{
          pdfId: string;
          filename: string;
          error: string;
        }>;
        summary: {
          quotesCreated: number;
          lineItemsAdded: number;
          customersCreated: number;
          failed: number;
        };
      } = {
        success: true,
        imported: [],
        errors: [],
        summary: {
          quotesCreated: 0,
          lineItemsAdded: 0,
          customersCreated: 0,
          failed: 0
        }
      };

      // Special handling for combining multiple PDFs into single quote
      if (importData.importOptions.createNewQuote && importData.importOptions.combineIntoSingleQuote && importData.extractedQuotes.length > 1) {
        try {
          // Handle customer attachment for combined import (use first PDF's customer data)
          const firstQuote = importData.extractedQuotes[0];
          const { accountId, wasCreated } = await handleCustomerAttachment(
            firstQuote.customer,
            importData.importOptions.attachCustomer,
            importData.importOptions.existingCustomerId
          );
          
          if (wasCreated) {
            results.summary.customersCreated++;
          }

          // Create single quote with combined data
          const combinedDescription = importData.extractedQuotes
            .map(q => q.projectDescription)
            .filter(desc => desc && desc.trim())
            .join(' | ');

          const combinedFilenames = importData.extractedQuotes.map(q => q.filename).join(', ');

          const quoteData: InsertQuote = {
            quoteNumber: firstQuote.quoteNumber || `COMBINED-${Date.now()}`,
            accountId: accountId,
            projectName: combinedDescription || `Combined Import: ${combinedFilenames}`,
            projectAddress: firstQuote.customer.address || '',
            estimatedStartDate: firstQuote.date || new Date().toISOString().split('T')[0],
            notes: `Combined import from ${importData.extractedQuotes.length} PDFs: ${combinedFilenames}`,
            taxRate: '0',
            discount: '0',
            shipping: '0',
            isShippingTaxable: true,
            dealStage: 'new_lead' as const
          };

          const newQuote = await storage.createQuote(quoteData);
          results.summary.quotesCreated++;
          console.log(`✅ Created combined quote: ${newQuote.quoteNumber} (ID: ${newQuote.id})`);

          // Add all line items from all PDFs to the single quote
          let totalLineItemsAdded = 0;
          for (const extractedQuote of importData.extractedQuotes) {
            if (extractedQuote.lineItems && extractedQuote.lineItems.length > 0) {
              for (const lineItem of extractedQuote.lineItems) {
                if (lineItem.description && lineItem.price && lineItem.quantity) {
                  const lineItemData = {
                    quoteId: newQuote.id,
                    description: `[${extractedQuote.filename}] ${lineItem.description}`,
                    quantity: lineItem.quantity.toString(),
                    unitPrice: lineItem.price.toString(),
                    markupType: 'percentage' as const,
                    markupValue: '0',
                    discountType: 'percentage' as const,
                    discountValue: '0',
                    position: totalLineItemsAdded
                  };

                  await storage.createLineItem(lineItemData);
                  totalLineItemsAdded++;
                }
              }
            }

            // Add each PDF as successfully imported
            results.imported.push({
              pdfId: extractedQuote.pdfId,
              quoteId: newQuote.id,
              quoteNumber: newQuote.quoteNumber,
              lineItemsAdded: extractedQuote.lineItems?.length || 0,
              action: 'created'
            });
          }
          
          results.summary.lineItemsAdded += totalLineItemsAdded;
          console.log(`✅ Added ${totalLineItemsAdded} combined line items to quote ${newQuote.quoteNumber}`);

          // Skip individual processing since we've handled all PDFs
        } catch (error: any) {
          console.error('❌ Error in combined import:', error);
          // Add all PDFs as failed
          importData.extractedQuotes.forEach(quote => {
            results.errors.push({
              pdfId: quote.pdfId,
              filename: quote.filename,
              error: `Combined import failed: ${error.message}`
            });
          });
          results.summary.failed += importData.extractedQuotes.length;
        }

        // Return combined results
        const totalProcessed = results.imported.length + results.errors.length;
        console.log(`📊 Combined import completed: ${results.summary.quotesCreated} quotes created, ${results.summary.lineItemsAdded} line items added, ${results.summary.customersCreated} customers created, ${results.summary.failed} failed`);
        
        return res.json(results);
      }

      // Process each extracted quote individually (original logic)
      for (const extractedQuote of importData.extractedQuotes) {
        try {
          // Handle customer attachment based on attachCustomer behavior
          const { accountId, wasCreated } = await handleCustomerAttachment(
            extractedQuote.customer,
            importData.importOptions.attachCustomer,
            importData.importOptions.existingCustomerId
          );
          
          if (wasCreated) {
            results.summary.customersCreated++;
          }

          // Handle quote creation or line item addition
          if (importData.importOptions.createNewQuote) {
            // Create new quote
            const quoteData: InsertQuote = {
              quoteNumber: extractedQuote.quoteNumber || `IMP-${Date.now()}`,
              accountId: accountId,
              projectName: extractedQuote.projectDescription || `Imported from ${extractedQuote.filename}`,
              projectAddress: extractedQuote.customer.address || '',
              estimatedStartDate: extractedQuote.date || new Date().toISOString().split('T')[0],
              notes: extractedQuote.notes ? `Imported from PDF: ${extractedQuote.filename}\n\n${extractedQuote.notes}` : `Imported from PDF: ${extractedQuote.filename}`,
              taxRate: extractedQuote.taxRate?.toString() || '0',
              discount: '0',
              shipping: '0',
              isShippingTaxable: true,
              dealStage: 'new_lead' as const
            };

            const newQuote = await storage.createQuote(quoteData);
            results.summary.quotesCreated++;
            console.log(`✅ Created new quote: ${newQuote.quoteNumber} (ID: ${newQuote.id})`);

            // Add line items to the new quote
            let lineItemsAdded = 0;
            if (extractedQuote.lineItems && extractedQuote.lineItems.length > 0) {
              for (const lineItem of extractedQuote.lineItems) {
                if (lineItem.description && lineItem.price && lineItem.quantity) {
                  const lineItemData = {
                    quoteId: newQuote.id,
                    description: lineItem.description,
                    quantity: lineItem.quantity.toString(),
                    unitPrice: lineItem.price.toString(),
                    markupType: 'percentage' as const,
                    markupValue: '0', // Default markup
                    discountType: 'percentage' as const,
                    discountValue: '0',
                    position: lineItemsAdded
                  };

                  await storage.createLineItem(lineItemData);
                  lineItemsAdded++;
                }
              }
            }
            
            results.summary.lineItemsAdded += lineItemsAdded;
            results.imported.push({
              pdfId: extractedQuote.pdfId,
              quoteId: newQuote.id,
              quoteNumber: newQuote.quoteNumber,
              lineItemsAdded,
              action: 'created'
            });
            
            console.log(`✅ Added ${lineItemsAdded} line items to quote ${newQuote.quoteNumber}`);
          } else {
            // Add line items to existing quote
            if (!importData.importOptions.existingQuoteId) {
              throw new Error('Existing quote ID required when not creating new quotes');
            }

            const existingQuote = await storage.getQuote(importData.importOptions.existingQuoteId);
            if (!existingQuote) {
              throw new Error('Specified existing quote not found');
            }

            // Validate quote ownership
            const hasAccess = await storage.validateQuoteOwnership(importData.importOptions.existingQuoteId, req.user?.id);
            if (!hasAccess) {
              throw new Error('Access denied to the specified quote');
            }

            let lineItemsAdded = 0;
            if (extractedQuote.lineItems && extractedQuote.lineItems.length > 0) {
              for (const lineItem of extractedQuote.lineItems) {
                if (lineItem.description && lineItem.price && lineItem.quantity) {
                  const lineItemData = {
                    quoteId: importData.importOptions.existingQuoteId,
                    description: lineItem.description,
                    quantity: lineItem.quantity.toString(),
                    unitPrice: lineItem.price.toString(),
                    markupType: 'percentage' as const,
                    markupValue: '0', // Default markup
                    discountType: 'percentage' as const,
                    discountValue: '0',
                    position: lineItemsAdded
                  };

                  await storage.createLineItem(lineItemData);
                  lineItemsAdded++;
                }
              }
            }

            results.summary.lineItemsAdded += lineItemsAdded;
            results.imported.push({
              pdfId: extractedQuote.pdfId,
              quoteId: importData.importOptions.existingQuoteId,
              quoteNumber: existingQuote.quoteNumber,
              lineItemsAdded,
              action: 'added_to_existing'
            });

            console.log(`✅ Added ${lineItemsAdded} line items to existing quote ${existingQuote.quoteNumber}`);
          }

        } catch (error: any) {
          console.error(`❌ Failed to import PDF ${extractedQuote.filename}:`, error);
          results.summary.failed++;
          results.errors.push({
            pdfId: extractedQuote.pdfId,
            filename: extractedQuote.filename,
            error: error.message || 'Unknown error occurred'
          });
        }
      }

      // Log final summary
      console.log(`📊 Import completed: ${results.summary.quotesCreated} quotes created, ${results.summary.lineItemsAdded} line items added, ${results.summary.customersCreated} customers created, ${results.summary.failed} failed`);

      res.status(200).json(results);

    } catch (error: any) {
      console.error("Batch import error:", error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          success: false,
          message: "Invalid import data", 
          errors: error.errors 
        });
      }
      
      res.status(500).json({ 
        success: false,
        message: "Internal server error during import" 
      });
    }
  });

  app.put("/api/quotes/:id", isAuthenticated, async (req, res) => {
    try {
      // Validate ID parameter
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }
      
      console.log("Raw request body:", JSON.stringify(req.body, null, 2));
      const parsedData = updateQuoteSchema.parse(req.body);
      
      // Ensure optional fields are properly handled
      const quoteData: Partial<InsertQuote> = {
        ...parsedData,
        jobsiteAddress: parsedData.jobsiteAddress === null ? undefined : parsedData.jobsiteAddress,
        lostReason: parsedData.lostReason === null ? undefined : parsedData.lostReason,
      };
      
      // Get the original quote to check status change
      const originalQuote = await storage.getQuote(params.data.id);
      if (!originalQuote) {
        return res.status(404).json({ message: "Quote not found" });
      }
      
      const quote = await storage.updateQuote(params.data.id, quoteData);
      if (!quote) {
        return res.status(404).json({ message: "Quote not found" });
      }
      
      res.json(quote);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        console.error("Quote validation errors:", JSON.stringify(error.errors, null, 2));
        return res.status(400).json({ message: "Invalid quote data", errors: error.errors });
      }
      
      // Handle unique constraint violations for quote number
      if (error.message?.includes("already exists")) {
        console.error("Quote number uniqueness error:", error.message);
        return res.status(409).json({ 
          message: error.message || "Quote number already exists", 
          code: "DUPLICATE_QUOTE_NUMBER" 
        });
      }
      
      console.error("Quote update error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update quote deal stage for pipeline management
  app.patch("/api/quotes/:id/stage", isAuthenticated, async (req, res) => {
    try {
      // Validate ID parameter
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }
      
      // Validate stage update data
      const { deal_stage, lost_reason } = req.body;
      
      if (!deal_stage) {
        return res.status(400).json({ message: "deal_stage is required" });
      }
      
      const validStages = ['new_lead', 'qualifying', 'consultation_scheduled', 'building_estimate', 'quote_sent', 'closed_won', 'closed_lost', 'on_hold'];
      if (!validStages.includes(deal_stage)) {
        return res.status(400).json({ 
          message: `Invalid deal_stage. Must be one of: ${validStages.join(', ')}` 
        });
      }
      
      // Require lost_reason for closed_lost stage
      if (deal_stage === 'closed_lost' && !lost_reason) {
        return res.status(400).json({ 
          message: "lost_reason is required when setting stage to lost" 
        });
      }
      
      // Update the quote
      const updateData: any = { dealStage: deal_stage };
      if (lost_reason) {
        updateData.lostReason = lost_reason;
      }
      
      const quote = await storage.updateQuote(params.data.id, updateData);
      if (!quote) {
        return res.status(404).json({ message: "Quote not found" });
      }
      
      console.log(`✅ Updated quote ${params.data.id} stage to ${deal_stage}`);
      res.json(quote);
    } catch (error) {
      console.error("Error updating quote stage:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/quotes/:id", isAuthenticated, async (req, res) => {
    try {
      // Validate ID parameter
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }
      
      const deleted = await storage.deleteQuote(params.data.id);
      if (!deleted) {
        return res.status(404).json({ message: "Quote not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Quote versioning routes
  app.post("/api/quotes/:id/create-version", isAuthenticated, async (req, res) => {
    try {
      // Validate ID parameter
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }

      // Check if the quote exists
      const originalQuote = await storage.getQuote(params.data.id);
      if (!originalQuote) {
        return res.status(404).json({ message: "Original quote not found" });
      }

      // Create the new version
      const newVersion = await storage.createQuoteVersion(params.data.id);
      
      console.log(`✅ Created version ${newVersion.versionNumber} of quote ${params.data.id}`);
      res.status(201).json(newVersion);
    } catch (error: any) {
      console.error("Error creating quote version:", error);
      res.status(500).json({ 
        message: "Internal server error", 
        error: error.message 
      });
    }
  });

  app.get("/api/quotes/:id/versions", isAuthenticated, async (req, res) => {
    try {
      // Validate ID parameter
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }

      // Check if the quote exists
      const quote = await storage.getQuote(params.data.id);
      if (!quote) {
        return res.status(404).json({ message: "Quote not found" });
      }

      // Get all versions
      const versions = await storage.getQuoteVersions(params.data.id);
      
      res.json(versions);
    } catch (error) {
      console.error("Error getting quote versions:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // E-Signature routes
  // Enable e-signature and generate signing link
  app.post("/api/quotes/:id/enable-esignature", isAuthenticated, async (req, res) => {
    try {
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }

      const quote = await storage.getQuote(params.data.id);
      if (!quote) {
        return res.status(404).json({ message: "Quote not found" });
      }

      // Use existing signing token if available, otherwise generate a new one
      const signingToken = quote.signingToken || nanoid(32);
      
      // Update quote with e-signature enabled and token (preserve existing signatures)
      const updatedQuote = await storage.updateQuote(params.data.id, {
        enableESignature: true,
        signingToken
        // Note: We no longer reset signatures - they persist permanently
      });

      res.json({ 
        success: true,
        signingToken,
        signingUrl: `/sign/${signingToken}`
      });
    } catch (error) {
      console.error("Error enabling e-signature:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Send e-signature email to customer
  app.post("/api/quotes/:id/send-signature-email", isAuthenticated, async (req, res) => {
    try {
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }

      const quote = await storage.getQuoteWithDetails(params.data.id);
      if (!quote) {
        return res.status(404).json({ message: "Quote not found" });
      }

      if (!quote.enableESignature || !quote.signingToken) {
        return res.status(400).json({ message: "E-signature must be enabled first" });
      }

      if (!quote.account?.email) {
        return res.status(400).json({ message: "Customer email not found" });
      }

      // Import sendEmail function
      const { sendEmail } = await import("./gmail");

      // Get the base URL from environment or construct it
      const baseUrl = process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
        : req.get('origin') || `${req.protocol}://${req.get('host')}`;
      
      const signingUrl = `${baseUrl}/sign/${quote.signingToken}`;

      // Create email content
      const customerName = quote.account.firstName 
        ? `${quote.account.firstName} ${quote.account.lastName || ''}`.trim()
        : quote.account.name;

      const htmlBody = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Your Quote is Ready for Signature</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
          <div style="background-color: #000000; border-radius: 8px 8px 0 0; border-bottom: 4px solid #14b8a6; padding: 30px; margin-bottom: 20px;">
            <h1 style="color: #ffffff; margin-top: 0; font-size: 24px;">Your Quote is Ready for Signature</h1>
            <p style="color: #ffffff; margin-bottom: 0;">Hello ${customerName},</p>
            <p style="color: #f0f0f0;">Your quote <strong>#${quote.quoteNumber}</strong> for <strong>${quote.projectName || 'your project'}</strong> is ready for your electronic signature.</p>
          </div>
          
          <div style="background-color: #ffffff; border: 2px solid #e5e7eb; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
            <h2 style="color: #000000; margin-top: 0; font-size: 20px; border-bottom: 2px solid #14b8a6; padding-bottom: 10px;">Quote Details</h2>
            <p style="color: #1a1a1a;"><strong>Quote Number:</strong> ${quote.quoteNumber}</p>
            <p style="color: #1a1a1a;"><strong>Project:</strong> ${quote.projectName || 'N/A'}</p>
            ${quote.projectAddress ? `<p style="color: #1a1a1a;"><strong>Address:</strong> ${quote.projectAddress}</p>` : ''}
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${signingUrl}" 
               style="display: inline-block; background-color: #14b8a6; color: #ffffff; padding: 16px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; box-shadow: 0 2px 4px rgba(20, 184, 166, 0.3);">
              Review and Sign Quote
            </a>
          </div>
          
          <div style="background-color: #f0fdfa; border-left: 4px solid #14b8a6; border-radius: 4px; padding: 20px; margin-top: 20px;">
            <p style="margin: 0; font-size: 14px; color: #115e59;">
              If you have any questions about this quote, please don't hesitate to contact us.
            </p>
          </div>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #14b8a6; text-align: center; color: #6b7280; font-size: 12px;">
            <p style="margin: 5px 0; font-weight: 600; color: #1a1a1a;">EDG Patio & Shade</p>
            <p style="margin: 5px 0;">1802 Holian Drive, Spring Grove, IL 60081</p>
            <p style="margin: 5px 0;">Phone: +1 (815) 581-0138 | Email: info@edgpatioshade.com</p>
          </div>
        </body>
        </html>
      `;

      // Send the email
      await sendEmail({
        to: quote.account.email,
        subject: `Your Quote #${quote.quoteNumber} is Ready for Signature`,
        htmlBody
      });

      res.json({ 
        success: true,
        message: `E-signature email sent to ${quote.account.email}`
      });
    } catch (error) {
      console.error("Error sending signature email:", error);
      res.status(500).json({ 
        message: "Failed to send email", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Get quote info for signing (public route)
  app.get("/api/signatures/:token", async (req, res) => {
    try {
      // Validate token parameter
      const params = signatureTokenParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid token", 
          errors: params.error.errors 
        });
      }
      
      const quote = await storage.getQuoteBySigningToken(params.data.token);
      if (!quote) {
        return res.status(404).json({ message: "Invalid or expired signing link" });
      }

      if (!quote.enableESignature) {
        return res.status(403).json({ message: "E-signature not enabled for this quote" });
      }

      // Return sanitized quote data (no PII like phone/email, but include line items, pricing, and contract)
      res.json({
        id: quote.id,
        quoteNumber: quote.quoteNumber,
        projectName: quote.projectName,
        projectAddress: quote.projectAddress,
        accountName: quote.account?.name || quote.customer?.name || "N/A",
        lineItems: quote.lineItems || [],
        taxRate: quote.taxRate,
        discount: quote.discount,
        shipping: quote.shipping,
        isShippingTaxable: quote.isShippingTaxable,
        contractTemplate: quote.contractTemplate,
        customContractTerms: quote.customContractTerms,
        clientSignedAt: quote.clientSignedAt,
        companySignedAt: quote.companySignedAt
      });
    } catch (error) {
      console.error("Error getting signature info:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get full quote data for signed PDF download (public route)
  app.get("/api/signatures/:token/full", async (req, res) => {
    try {
      // Validate token parameter
      const params = signatureTokenParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid token", 
          errors: params.error.errors 
        });
      }
      
      const quote = await storage.getQuoteBySigningToken(params.data.token);
      if (!quote) {
        return res.status(404).json({ message: "Invalid or expired signing link" });
      }

      // Return full quote data with all necessary fields for PDF generation
      res.json(quote);
    } catch (error) {
      console.error("Error getting full quote data:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Submit signature (public route)
  app.post("/api/signatures/:token/sign", async (req, res) => {
    try {
      // Validate token parameter
      const params = signatureTokenParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid token", 
          errors: params.error.errors 
        });
      }

      // Validate request body
      const bodyValidation = submitSignatureSchema.safeParse(req.body);
      if (!bodyValidation.success) {
        return res.status(400).json({ 
          message: "Invalid signature data", 
          errors: bodyValidation.error.errors 
        });
      }

      const { signatureData, signerType } = bodyValidation.data;

      const quote = await storage.getQuoteBySigningToken(params.data.token);
      if (!quote) {
        return res.status(404).json({ message: "Invalid or expired signing link" });
      }

      if (!quote.enableESignature) {
        return res.status(403).json({ message: "E-signature not enabled for this quote" });
      }

      // Get client IP address
      const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

      // Update quote with signature
      const updateData: any = {};
      if (signerType === 'client') {
        updateData.clientSignatureData = signatureData;
        updateData.clientSignedAt = new Date();
        updateData.clientSignedIp = clientIp;
      } else {
        updateData.companySignatureData = signatureData;
        updateData.companySignedAt = new Date();
        updateData.companySignedIp = clientIp;
      }

      await storage.updateQuote(quote.id, updateData);

      res.json({ 
        success: true,
        message: "Signature captured successfully"
      });
    } catch (error) {
      console.error("Error submitting signature:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Quote image routes (protected)
  app.get("/api/quotes/:quoteId/cover-photos", isAuthenticated, async (req, res) => {
    try {
      const params = quoteIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }

      // Validate quote ownership
      const hasAccess = await storage.validateQuoteOwnership(params.data.quoteId, req.user?.id);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const coverPhoto = await storage.getQuoteCoverPhoto(params.data.quoteId);
      if (!coverPhoto) {
        return res.json([]); // Return empty array instead of 404
      }

      res.json([coverPhoto]); // Return as array to match frontend expectations
    } catch (error) {
      console.error("Error getting quote cover photo:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/quotes/:quoteId/product-renderings", isAuthenticated, async (req, res) => {
    try {
      const params = quoteIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }

      // Validate quote ownership
      const hasAccess = await storage.validateQuoteOwnership(params.data.quoteId, req.user?.id);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const renderings = await storage.getQuoteProductRenderings(params.data.quoteId);
      res.json(renderings);
    } catch (error) {
      console.error("Error getting quote visuals & details:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/quotes/:quoteId/cover-photo", isAuthenticated, async (req, res) => {
    try {
      const params = quoteIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }

      // Validate quote ownership
      const hasAccess = await storage.validateQuoteOwnership(params.data.quoteId, req.user?.id);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const photoData = createQuoteCoverPhotoSchema.parse({ ...req.body, quoteId: params.data.quoteId });
      const coverPhoto = await storage.createQuoteCoverPhoto(photoData);
      res.status(201).json(coverPhoto);
    } catch (error) {
      console.error("Error creating quote cover photo:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: error.errors 
        });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // File upload endpoints that process FormData and save to database
  app.post("/api/quotes/:quoteId/cover-photos", isAuthenticated, upload.single('image'), async (req: any, res) => {
    try {
      const params = quoteIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }

      // Validate quote ownership
      const hasAccess = await storage.validateQuoteOwnership(params.data.quoteId, req.user?.id);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const file = req.file;
      const objectStorageService = new ObjectStorageService();
      
      // Create a custom path for the cover photo
      const sanitizedFilename = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
      const timestamp = Date.now();
      const customPath = `cover-photos/${timestamp}-${sanitizedFilename}`;
      
      // Upload directly to object storage using Google Cloud Storage client
      const privateDir = objectStorageService.getPrivateObjectDir();
      const fullPath = `${privateDir}/${customPath}`;
      
      // Parse bucket name and object name from the full path
      const pathParts = fullPath.split('/');
      const bucketName = pathParts[1]; // Skip the leading slash
      const objectName = pathParts.slice(2).join('/');
      
      // Upload file to Google Cloud Storage
      const bucket = objectStorageClient.bucket(bucketName);
      const cloudFile = bucket.file(objectName);
      
      await cloudFile.save(file.buffer, {
        metadata: {
          contentType: file.mimetype,
        },
      });
      
      // Note: File will be served through our object proxy endpoint since bucket has public access prevention
      
      // Create simple accessible URL using our quote images endpoint
      const publicUrl = `${req.protocol}://${req.get('host')}/quote-images/${sanitizedFilename}`;
      
      // Create database record
      const photoData = {
        quoteId: params.data.quoteId,
        filename: sanitizedFilename,
        originalName: file.originalname,
        storageUrl: publicUrl,
        mimeType: file.mimetype,
        fileSize: file.size
      };
      
      const coverPhoto = await storage.createQuoteCoverPhoto(photoData);
      console.log(`✅ Cover photo saved: ${coverPhoto.filename}`);
      res.status(201).json(coverPhoto);
    } catch (error) {
      console.error("Error uploading cover photo:", error);
      res.status(500).json({ message: "Failed to upload cover photo" });
    }
  });

  app.post("/api/quotes/:quoteId/product-renderings", isAuthenticated, upload.single('image'), async (req: any, res) => {
    try {
      const params = quoteIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }

      // Validate quote ownership
      const hasAccess = await storage.validateQuoteOwnership(params.data.quoteId, req.user?.id);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const file = req.file;
      const objectStorageService = new ObjectStorageService();
      
      // Create a custom path for the visual asset
      const sanitizedFilename = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
      const timestamp = Date.now();
      const customPath = `product-renderings/${timestamp}-${sanitizedFilename}`;
      
      // Upload directly to object storage using Google Cloud Storage client
      const privateDir = objectStorageService.getPrivateObjectDir();
      const fullPath = `${privateDir}/${customPath}`;
      
      // Parse bucket name and object name from the full path
      const pathParts = fullPath.split('/');
      const bucketName = pathParts[1]; // Skip the leading slash
      const objectName = pathParts.slice(2).join('/');
      
      // Upload file to Google Cloud Storage
      const bucket = objectStorageClient.bucket(bucketName);
      const cloudFile = bucket.file(objectName);
      
      await cloudFile.save(file.buffer, {
        metadata: {
          contentType: file.mimetype,
        },
      });
      
      // Note: File will be served through our object proxy endpoint since bucket has public access prevention
      
      // Create simple accessible URL using our quote images endpoint  
      const publicUrl = `${req.protocol}://${req.get('host')}/quote-images/${sanitizedFilename}`;
      
      // Create database record
      const renderingData = {
        quoteId: params.data.quoteId,
        filename: sanitizedFilename,
        originalName: file.originalname,
        storageUrl: publicUrl,
        mimeType: file.mimetype,
        fileSize: file.size
      };
      
      const rendering = await storage.createQuoteProductRendering(renderingData);
      console.log(`✅ Visual asset saved: ${rendering.filename}`);
      res.status(201).json(rendering);
    } catch (error) {
      console.error("Error uploading visual asset:", error);
      res.status(500).json({ message: "Failed to upload visual asset" });
    }
  });

  app.put("/api/quote-images/cover-photo/:imageId", isAuthenticated, async (req, res) => {
    try {
      const params = imageIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }

      const updateData = updateQuoteCoverPhotoSchema.parse(req.body);
      const updatedPhoto = await storage.updateQuoteCoverPhoto(params.data.imageId, updateData);
      
      if (!updatedPhoto) {
        return res.status(404).json({ message: "Cover photo not found" });
      }

      res.json(updatedPhoto);
    } catch (error) {
      console.error("Error updating quote cover photo:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: error.errors 
        });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/quote-images/product-rendering/:imageId", isAuthenticated, async (req, res) => {
    try {
      const params = imageIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }

      const updateData = updateQuoteProductRenderingSchema.parse(req.body);
      const updatedRendering = await storage.updateQuoteProductRendering(params.data.imageId, updateData);
      
      if (!updatedRendering) {
        return res.status(404).json({ message: "Visual asset not found" });
      }

      res.json(updatedRendering);
    } catch (error) {
      console.error("Error updating quote visual asset:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: error.errors 
        });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/quote-images/cover-photo/:imageId", isAuthenticated, async (req, res) => {
    try {
      const params = imageIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }

      const deleted = await storage.deleteQuoteCoverPhoto(params.data.imageId);
      if (!deleted) {
        return res.status(404).json({ message: "Cover photo not found" });
      }

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting quote cover photo:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/quote-images/product-rendering/:imageId", isAuthenticated, async (req, res) => {
    try {
      const params = imageIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }

      const deleted = await storage.deleteQuoteProductRendering(params.data.imageId);
      if (!deleted) {
        return res.status(404).json({ message: "Visual asset not found" });
      }

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting quote visual asset:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

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
      
      const lineItemData = insertLineItemSchema.parse({ ...req.body, quoteId: params.data.quoteId });
      
      // Server-side calculation verification
      const verification = verifyLineItemCalculation(
        lineItemData.quantity,
        lineItemData.unitPrice,
        lineItemData.markupType,
        lineItemData.markupValue,
        lineItemData.discountType,
        lineItemData.discountValue
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
        return res.status(400).json({ message: "Invalid line item data", errors: error.errors });
      }
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
        
        // Merge with existing data for complete calculation
        const completeData = { ...existingItem, ...lineItemData };
        
        const verification = verifyLineItemCalculation(
          completeData.quantity,
          completeData.unitPrice,
          completeData.markupType,
          completeData.markupValue,
          completeData.discountType,
          completeData.discountValue
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

  // Bulk operations for line items
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


  // Product catalog routes (protected)
  app.get("/api/products", isAuthenticated, async (req, res) => {
    try {
      // Parse query parameters for filtering
      const manufacturerFilter = req.query.manufacturer as string;
      
      let productList;
      
      // If filtering is requested, use database query with filters
      if (manufacturerFilter) {
        const filters = buildManufacturerFilter(manufacturerFilter);
        if (filters.length > 0) {
          productList = await db
            .select()
            .from(products)
            .where(and(...filters));
        } else {
          productList = await storage.getAllProducts();
        }
      } else {
        // No filtering, get all products
        productList = await storage.getAllProducts();
      }
      
      // Strip internal metadata from products
      const cleanProducts = stripValidationMetadata(productList);
      res.json(cleanProducts);
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/products/:id", isAuthenticated, async (req, res) => {
    try {
      // Validate ID parameter
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
      
      // Strip internal metadata from product
      const cleanProduct = stripValidationMetadata(product);
      res.json(cleanProduct);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/products", isAuthenticated, async (req, res) => {
    try {
      const productData = insertProductSchema.parse(req.body);
      // Strip validation metadata before passing to storage
      const cleanProductData = stripValidationMetadata(productData);
      const product = await storage.createProduct(cleanProductData);
      
      // Strip metadata from response
      const cleanProduct = stripValidationMetadata(product);
      res.status(201).json(cleanProduct);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid product data", errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/products/:id", isAuthenticated, async (req, res) => {
    try {
      // Validate ID parameter
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }
      
      // For partial updates, manually validate only the fields that are present
      // This avoids the ZodEffects.partial() issue since insertProductSchema has transforms
      const updateFields: any = {};
      const body = req.body;
      
      // Validate each field individually if present
      if (body.name !== undefined) updateFields.name = body.name;
      if (body.description !== undefined) updateFields.description = body.description;
      if (body.category !== undefined) updateFields.category = body.category;
      if (body.manufacturer !== undefined) updateFields.manufacturer = body.manufacturer;
      if (body.productType !== undefined) updateFields.productType = body.productType;
      if (body.retailPrice !== undefined) updateFields.retailPrice = body.retailPrice;
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
      // Strip validation metadata before passing to storage
      const cleanProductData = stripValidationMetadata(productData);
      const product = await storage.updateProduct(params.data.id, cleanProductData);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      // Strip metadata from response
      const cleanProduct = stripValidationMetadata(product);
      res.json(cleanProduct);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid product data", errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/products/:id", isAuthenticated, async (req, res) => {
    try {
      // Validate ID parameter
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

  // Enhanced product endpoint with pricing tables and accessories
  app.get("/api/products/:id/with-details", isAuthenticated, async (req, res) => {
    try {
      // Validate ID parameter
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
      
      // Strip internal metadata from the detailed product response
      const cleanProductWithDetails = stripValidationMetadata(productWithDetails);
      res.json(cleanProductWithDetails);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Pricing tables routes
  app.get("/api/products/:productId/pricing-tables", isAuthenticated, async (req, res) => {
    try {
      // Validate product ID parameter
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

  app.post("/api/products/:productId/pricing-tables", isAuthenticated, async (req, res) => {
    try {
      // Validate product ID parameter
      const params = productIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }
      
      const pricingData = insertPricingTableSchema.parse({ ...req.body, productId: params.data.productId });
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
      // Validate product ID parameter
      const params = productIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }
      
      // Validate request body
      const validatedData = calculatePriceSchema.safeParse(req.body);
      if (!validatedData.success) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: validatedData.error.errors 
        });
      }
      
      const { length, width } = validatedData.data;
      const price = await storage.calculateConfigurableProductPrice(params.data.productId, length, width);
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
      // Validate product ID parameter
      const params = productIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }
      
      // Validate request body
      const validatedData = bulkUploadPricingSchema.safeParse(req.body);
      if (!validatedData.success) {
        return res.status(400).json({ 
          message: "Invalid pricing data", 
          errors: validatedData.error.errors 
        });
      }

      // Clear existing pricing tables for this product
      await storage.deletePricingTablesByProductId(params.data.productId);

      const results = [];
      for (const item of validatedData.data.pricingData) {
        const pricingTable = await storage.createPricingTable({
          productId: params.data.productId,
          lengthMin: item.lengthMin.toString(),
          lengthMax: item.lengthMax.toString(),
          widthMin: item.widthMin.toString(),
          widthMax: item.widthMax.toString(),
          retailPrice: item.retailPrice.toString(),
          basePrice: item.basePrice.toString()
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

      // Validate user data
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

      const userId = req.params.id; // Don't parse as int, keep as string/number as needed
      
      // Validate update data
      const validatedData = updateUserSchema.safeParse(req.body);
      if (!validatedData.success) {
        return res.status(400).json({ 
          message: "Invalid user data", 
          errors: validatedData.error.errors 
        });
      }

      // If updating username, check for conflicts
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

      // Get manufacturer discount settings from form data
      const manufacturerDiscountType = req.body.manufacturerDiscountType || 'percentage';
      const manufacturerDiscountValue = parseFloat(req.body.manufacturerDiscountValue || '0');

      const file = req.file;
      let extractedProducts: ExtractedProduct[] = [];
      const errors: string[] = [];

      // Process based on file type
      if (file.mimetype === 'application/pdf') {
        // Process PDF - use vision-based extraction with OpenAI
        try {
          const { convertPDFToImagesServer } = await import('./quoteImageUtils');
          const pdfImages = await convertPDFToImagesServer(file.buffer);
          
          // Extract products from all PDF pages (convertPDFToImagesServer already limits to 10 pages)
          for (const pageImage of pdfImages) {
            const pageProducts = await extractProductsFromImage(pageImage.imageBase64);
            extractedProducts.push(...pageProducts);
          }
          
          if (extractedProducts.length === 0) {
            errors.push("No products found in PDF - try a clearer image or Excel file");
          }
        } catch (pdfError) {
          console.error("PDF processing error:", pdfError);
          errors.push("Failed to process PDF - try uploading an Excel file instead");
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

          // Calculate actual cost from retail price using manufacturer discount
          const retailPrice = extractedProduct.price;
          let actualCost = retailPrice;
          
          if (manufacturerDiscountType === 'percentage') {
            actualCost = retailPrice * (1 - manufacturerDiscountValue / 100);
          } else {
            // Dollar discount
            actualCost = Math.max(0, retailPrice - manufacturerDiscountValue);
          }

          if (existingProduct) {
            // Update existing product with retail pricing
            await storage.updateProduct(existingProduct.id, {
              retailPrice: retailPrice.toString(),
              defaultDiscountType: manufacturerDiscountType,
              defaultDiscountValue: manufacturerDiscountValue.toString(),
              unit: extractedProduct.unit || existingProduct.unit,
            });
            updated++;
          } else {
            // Create new product with retail pricing
            const productData = {
              name: extractedProduct.sku ? `${extractedProduct.name} (${extractedProduct.sku})` : extractedProduct.name,
              description: extractedProduct.description || '',
              manufacturer: 'Imported',
              retailPrice: retailPrice.toString(),
              defaultDiscountType: manufacturerDiscountType,
              defaultDiscountValue: manufacturerDiscountValue.toString(),
              unit: extractedProduct.unit || 'each',
            };
            // Strip any validation metadata before creating
            const cleanProductData = stripValidationMetadata(productData);
            await storage.createProduct(cleanProductData);
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

  // CSV Product Import endpoint with column mapping
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

      for (const product of products) {
        try {
          const { name, manufacturer, category, unit, description, retailPrice, cost } = product;

          if (!name || typeof retailPrice !== 'number' || typeof cost !== 'number') {
            errors.push(`Invalid product data for: ${name || 'unnamed'}`);
            continue;
          }

          // Calculate manufacturer discount from the difference
          const manufacturerDiscount = retailPrice - cost;

          // Check if product already exists by name (case-insensitive)
          const allProducts = await storage.getAllProducts();
          const existingProduct = allProducts.find(p => 
            p.name.toLowerCase().trim() === name.toLowerCase().trim()
          );

          if (existingProduct) {
            // Update existing product - only update fields that are explicitly provided
            const updateData: any = {
              retailPrice: retailPrice.toString(),
              defaultDiscountType: 'dollar',
              defaultDiscountValue: manufacturerDiscount.toString(),
            };
            
            // Only update optional fields if they were mapped and have values
            if (manufacturer !== undefined) {
              updateData.manufacturer = manufacturer;
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
            // Create new product - use defaults for unmapped fields
            const productData = {
              name: name.trim(),
              description: description || '',
              manufacturer: manufacturer || category || 'Imported', // Use manufacturer if provided, otherwise category, otherwise default
              retailPrice: retailPrice.toString(),
              defaultDiscountType: 'dollar' as const,
              defaultDiscountValue: manufacturerDiscount.toString(),
              unit: unit || 'each',
            };
            
            const cleanProductData = stripValidationMetadata(productData);
            await storage.createProduct(cleanProductData);
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

  // Bulk update products endpoint
  app.post('/api/admin/bulk-update-products', isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.user?.id);
      if (currentUser?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      // Validate request body
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

  // Contract Template routes
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



  // Issue Report routes
  app.post('/api/issue-reports', async (req, res) => {
    try {
      const validatedData = insertIssueReportSchema.parse(req.body);
      
      // Get user ID from session if authenticated
      if (req.user?.id) {
        validatedData.userId = typeof req.user.id === 'string' ? parseInt(req.user.id) : req.user.id;
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
      
      // For updates, we use a partial schema
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





  // QuickBooks OAuth and sync routes
  app.get('/api/quickbooks/connect', isAuthenticated, async (req, res) => {
    try {
      const { createQuickBooksService } = await import('./quickbooks');
      const qbService = createQuickBooksService();
      
      if (!qbService) {
        return res.status(500).json({ message: 'QuickBooks integration not configured' });
      }

      const state = nanoid();
      (req.session as any).qbState = state;
      
      // Save session before redirecting to ensure state is persisted
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
      // URL encode the error message to preserve it
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

  const httpServer = createServer(app);
  return httpServer;
}
