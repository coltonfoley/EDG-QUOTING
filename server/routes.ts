import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertCustomerSchema, insertQuoteSchema, insertLineItemSchema, insertProductSchema, insertContractTemplateSchema, insertPricingTableSchema, insertProductAccessorySchema } from "@shared/schema";
import { z } from "zod";
import { setupAuth, isAuthenticated } from "./replitAuth";
import multer from "multer";
import * as XLSX from "xlsx";
import { parsePDF } from "./pdf-parser";
import { extractProductsFromImage, extractProductsFromText, extractQuoteDataFromText } from "./openai";
import type { ExtractedProduct } from "./openai";
import DocuSignService from "./docusign";

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
        if (!item.lengthMin || !item.lengthMax || !item.widthMin || !item.widthMax || !item.price || 
            item.lengthMin <= 0 || item.lengthMax <= 0 || item.widthMin <= 0 || item.widthMax <= 0 || item.price <= 0) {
          return res.status(400).json({ 
            message: "Each pricing entry must have valid lengthMin, lengthMax, widthMin, widthMax, and price values" 
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
          lengthMin: parseFloat(item.lengthMin.toString()),
          lengthMax: parseFloat(item.lengthMax.toString()),
          widthMin: parseFloat(item.widthMin.toString()),
          widthMax: parseFloat(item.widthMax.toString()),
          basePrice: parseFloat(item.price.toString())
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
      
      // Get the quote with details
      const quote = await storage.getQuote(id);
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
      
      // For this implementation, we need the PDF content
      // In a real implementation, you'd generate the PDF here or get it from storage
      const pdfBase64 = ""; // TODO: Generate PDF and convert to base64
      
      if (!pdfBase64) {
        return res.status(400).json({ 
          message: "PDF generation not implemented. Please generate PDF first." 
        });
      }

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
