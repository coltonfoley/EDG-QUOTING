import { z } from "zod";
import { 
  insertAccountSchema as baseAccountSchema,
  insertCustomerSchema as baseCustomerSchema,
  insertQuoteSchema as baseQuoteSchema,
  insertLineItemSchema as baseLineItemSchema,
  insertGroupSchema as baseGroupSchema,
  insertProductSchema as baseProductSchema,
  insertContractTemplateSchema as baseContractTemplateSchema,
  insertPricingTableSchema as basePricingTableSchema,
  insertUserSchema as baseUserSchema,
  insertIssueReportSchema as baseIssueReportSchema
} from "@shared/schema";

// Common validation schemas
export const idParamSchema = z.object({
  id: z.string().regex(/^\d+$/, "ID must be a valid positive integer").transform(val => parseInt(val))
});

export const queryIdParamSchema = z.object({
  quoteId: z.string().regex(/^\d+$/, "Quote ID must be a valid positive integer").transform(val => parseInt(val))
});

export const productIdParamSchema = z.object({
  productId: z.string().regex(/^\d+$/, "Product ID must be a valid positive integer").transform(val => parseInt(val))
});

// Enhanced Account validation
export const insertAccountSchema = baseAccountSchema.extend({
  name: z.string().min(1, "Name is required").max(255, "Name is too long"),
  email: z.string().email("Invalid email format").max(255, "Email is too long"),
  phone: z.string()
    .min(10, "Phone number must be at least 10 digits")
    .max(20, "Phone number is too long")
    .regex(/^[\d\s\-\+\(\)]+$/, "Phone number contains invalid characters"),
  company: z.string().max(255, "Company name is too long").optional().nullable(),
  accountType: z.enum([
    "homeowner", 
    "general_contractor", 
    "commercial", 
    "property_manager",
    "architect", 
    "developer",
    "subcontractor",
    "government",
    "nonprofit",
    "other"
  ]).default("homeowner"),
  paymentTerms: z.string().max(100, "Payment terms are too long").optional().nullable(),
  billingAddress: z.string().max(500, "Billing address is too long").optional().nullable()
});

// More lenient update schema for accounts that handles empty strings and partial updates
export const updateAccountSchema = z.object({
  name: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().min(1, "Name is required").max(255, "Name is too long").optional()
  ),
  email: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().email("Invalid email format").max(255, "Email is too long").optional()
  ),
  phone: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string()
      .min(10, "Phone number must be at least 10 digits")
      .max(20, "Phone number is too long")
      .regex(/^[\d\s\-\+\(\)]+$/, "Phone number contains invalid characters")
      .optional()
  ),
  company: z.preprocess(
    (v) => (v === "" ? null : v),
    z.string().max(255, "Company name is too long").optional().nullable()
  ),
  accountType: z.enum([
    "homeowner", 
    "general_contractor", 
    "commercial", 
    "property_manager",
    "architect", 
    "developer",
    "subcontractor",
    "government",
    "nonprofit",
    "other"
  ]).optional(),
  paymentTerms: z.preprocess(
    (v) => (v === "" ? null : v),
    z.string().max(100, "Payment terms are too long").optional().nullable()
  ),
  billingAddress: z.preprocess(
    (v) => (v === "" ? null : v),
    z.string().max(500, "Billing address is too long").optional().nullable()
  )
});

// Legacy Customer validation for backward compatibility
export const insertCustomerSchema = baseCustomerSchema.extend({
  name: z.string().min(1, "Name is required").max(255, "Name is too long"),
  email: z.string().email("Invalid email format").max(255, "Email is too long"),
  phone: z.string()
    .min(10, "Phone number must be at least 10 digits")
    .max(20, "Phone number is too long")
    .regex(/^[\d\s\-\+\(\)]+$/, "Phone number contains invalid characters"),
  company: z.string().max(255, "Company name is too long").optional()
});

// Enhanced Quote validation
export const insertQuoteSchema = baseQuoteSchema.extend({
  quoteNumber: z.string().min(1, "Quote number is required").max(50, "Quote number is too long").optional(), // Auto-generated on server
  accountId: z.number().int().positive("Account ID must be a positive integer").optional(),

  dealStage: z.enum(["new_lead", "qualifying", "consultation_scheduled", "building_estimate", "quote_sent", "closed_won", "closed_lost", "on_hold"]).default("new_lead"),
  lostReason: z.string().max(500, "Lost reason is too long").optional().nullable(),
  jobsiteAddress: z.string().max(1000, "Jobsite address is too long").optional().nullable(),
  projectName: z.string().min(1, "Project name is required").max(500, "Project name is too long"),
  projectAddress: z.string().max(1000, "Project address is too long").optional(),
  estimatedStartDate: z.string().optional(),
  notes: z.string().max(5000, "Notes are too long").optional(),
  taxRate: z.union([z.string(), z.number(), z.null()])
    .transform(val => val === null ? "0" : (typeof val === 'string' ? val : val.toString()))
    .refine(val => {
      const num = parseFloat(val);
      return !isNaN(num) && num >= 0 && num <= 100;
    }, "Tax rate must be between 0 and 100"),
  discount: z.union([z.string(), z.number(), z.null()])
    .transform(val => val === null ? "0" : (typeof val === 'string' ? val : val.toString()))
    .refine(val => {
      const num = parseFloat(val);
      return !isNaN(num) && num >= 0 && num <= 100;
    }, "Discount must be between 0 and 100"),
  shipping: z.union([z.string(), z.number(), z.null()])
    .transform(val => val === null ? "0" : (typeof val === 'string' ? val : val.toString()))
    .refine(val => {
      const num = parseFloat(val);
      return !isNaN(num) && num >= 0 && num <= 1000000;
    }, "Shipping must be between 0 and 1,000,000"),
  contractTemplateId: z.number().int().positive().optional().nullable(),
  customContractTerms: z.string().max(10000, "Custom contract terms are too long").optional().nullable()
}).refine((data) => {
  // Enforce mutual exclusivity: cannot have both template and custom terms
  const hasTemplate = data.contractTemplateId !== null && data.contractTemplateId !== undefined;
  const hasCustomTerms = data.customContractTerms !== null && data.customContractTerms !== undefined && data.customContractTerms.trim() !== "";
  return !(hasTemplate && hasCustomTerms);
}, {
  message: "Cannot specify both a contract template and custom contract terms",
  path: ["contractTemplateId", "customContractTerms"]
});

// Enhanced quote creation schema with optional customer creation hint
export const createQuoteSchema = z.object({
  // Base quote fields (optional account linkage)
  accountId: z.number().int().positive("Account ID must be a positive integer").optional().nullable(),
  
  // Optional auto-create hint for customer
  customerCreate: z.object({
    name: z.string().min(1, "Name is required").max(200, "Name is too long").optional(),
    email: z.string().email("Invalid email format").max(254, "Email is too long").optional(),
    phone: z.string().max(50, "Phone is too long").optional(),
    company: z.string().max(200, "Company name is too long").optional(),
  }).optional().nullable(),
  
  // Quote project details
  projectName: z.string().min(1, "Project name is required").max(500, "Project name is too long"),
  projectAddress: z.string().max(1000, "Project address is too long").optional(),
  jobsiteAddress: z.string().max(1000, "Jobsite address is too long").optional().nullable(),
  estimatedStartDate: z.string().optional(),
  notes: z.string().max(5000, "Notes are too long").optional(),
  
  // Financial fields
  taxRate: z.union([z.string(), z.number(), z.null()])
    .transform(val => val === null ? "0" : (typeof val === 'string' ? val : val.toString()))
    .refine(val => {
      const num = parseFloat(val);
      return !isNaN(num) && num >= 0 && num <= 100;
    }, "Tax rate must be between 0 and 100")
    .optional(),
  discount: z.union([z.string(), z.number(), z.null()])
    .transform(val => val === null ? "0" : (typeof val === 'string' ? val : val.toString()))
    .refine(val => {
      const num = parseFloat(val);
      return !isNaN(num) && num >= 0 && num <= 100;
    }, "Discount must be between 0 and 100")
    .optional(),
  shipping: z.union([z.string(), z.number(), z.null()])
    .transform(val => val === null ? "0" : (typeof val === 'string' ? val : val.toString()))
    .refine(val => {
      const num = parseFloat(val);
      return !isNaN(num) && num >= 0 && num <= 1000000;
    }, "Shipping must be between 0 and 1,000,000")
    .optional(),
    
  // Deal management
  dealStage: z.enum(["new_lead", "qualifying", "consultation_scheduled", "building_estimate", "quote_sent", "closed_won", "closed_lost", "on_hold"]).default("new_lead").optional(),
  lostReason: z.string().max(500, "Lost reason is too long").optional().nullable(),
  
  // Contract fields
  contractTemplateId: z.number().int().positive().optional().nullable(),
  customContractTerms: z.string().max(10000, "Custom contract terms are too long").optional().nullable(),
}).refine((data) => {
  // Enforce mutual exclusivity: cannot have both template and custom terms
  const hasTemplate = data.contractTemplateId !== null && data.contractTemplateId !== undefined;
  const hasCustomTerms = data.customContractTerms !== null && data.customContractTerms !== undefined && data.customContractTerms.trim() !== "";
  return !(hasTemplate && hasCustomTerms);
}, {
  message: "Cannot specify both a contract template and custom contract terms",
  path: ["contractTemplateId", "customContractTerms"]
});

export type CreateQuoteBody = z.infer<typeof createQuoteSchema>;

// Update schema for quotes - more lenient validation for partial updates
export const updateQuoteSchema = z.object({
  quoteNumber: z.string().min(1, "Quote number is required").max(50, "Quote number is too long").optional(),
  accountId: z.number().int().positive("Account ID must be a positive integer").nullable().optional(),

  dealStage: z.enum(["new_lead", "qualifying", "consultation_scheduled", "building_estimate", "quote_sent", "closed_won", "closed_lost", "on_hold"]).optional(),
  lostReason: z.string().max(500, "Lost reason is too long").optional().nullable(),
  jobsiteAddress: z.string().max(1000, "Jobsite address is too long").optional().nullable(),
  projectName: z.string().max(500, "Project name is too long").optional(),
  projectAddress: z.string().max(1000, "Project address is too long").optional(),
  estimatedStartDate: z.string().optional(),
  notes: z.string().max(5000, "Notes are too long").optional(),
  // Align with insertQuoteSchema coercion for tax/discount/shipping
  taxRate: z.union([z.string(), z.number(), z.null()])
    .transform(val => val === null ? "0" : (typeof val === 'string' ? val : val.toString()))
    .refine(val => {
      const num = parseFloat(val);
      return !isNaN(num) && num >= 0 && num <= 100;
    }, "Tax rate must be between 0 and 100")
    .optional(),
  discount: z.union([z.string(), z.number(), z.null()])
    .transform(val => val === null ? "0" : (typeof val === 'string' ? val : val.toString()))
    .refine(val => {
      const num = parseFloat(val);
      return !isNaN(num) && num >= 0 && num <= 100;
    }, "Discount must be between 0 and 100")
    .optional(),
  shipping: z.union([z.string(), z.number(), z.null()])
    .transform(val => val === null ? "0" : (typeof val === 'string' ? val : val.toString()))
    .refine(val => {
      const num = parseFloat(val);
      return !isNaN(num) && num >= 0 && num <= 1000000;
    }, "Shipping must be between 0 and 1,000,000")
    .optional(),
  isShippingTaxable: z.boolean().optional(),
  contractTemplateId: z.number().int().positive().optional().nullable(),
  customContractTerms: z.string().max(10000, "Custom contract terms are too long").optional().nullable(),
  
  // E-signature fields
  enableESignature: z.boolean().optional()
}).refine((data) => {
  // Enforce mutual exclusivity: cannot have both template and custom terms
  const hasTemplate = data.contractTemplateId !== null && data.contractTemplateId !== undefined;
  const hasCustomTerms = data.customContractTerms !== null && data.customContractTerms !== undefined && data.customContractTerms.trim() !== "";
  return !(hasTemplate && hasCustomTerms);
}, {
  message: "Cannot specify both a contract template and custom contract terms",
  path: ["contractTemplateId", "customContractTerms"]
});

// Enhanced LineItem validation
export const insertLineItemSchema = baseLineItemSchema.extend({
  quoteId: z.number().int().positive("Quote ID must be a positive integer"),
  productId: z.number().int().positive("Product ID must be a positive integer").optional(),
  baseProductId: z.number().int().positive("Base product ID must be a positive integer").optional(),
  description: z.string().min(1, "Description is required").max(1000, "Description is too long"),
  quantity: z.union([z.string(), z.number()])
    .transform(val => typeof val === 'string' ? val : val.toString())
    .refine(val => {
      const num = parseFloat(val);
      return !isNaN(num) && num > 0 && num <= 999999;
    }, "Quantity must be between 0.01 and 999,999")
    .refine(val => {
      const num = parseFloat(val);
      // Limit to 2 decimal places for quantity
      const rounded = Math.round(num * 100) / 100;
      return num === rounded || Math.abs(num - rounded) < 0.001;
    }, "Quantity can have maximum 2 decimal places"),
  retailPrice: z.union([z.string(), z.number(), z.null()])
    .transform(val => val === null ? null : (typeof val === 'string' ? val : val.toString()))
    .optional()
    .refine(val => {
      if (val === null || val === undefined) return true;
      const num = parseFloat(val);
      return !isNaN(num) && num >= 0 && num <= 10000000;
    }, "Retail price must be between 0 and 10,000,000"),
  unitPrice: z.union([z.string(), z.number()])
    .transform(val => typeof val === 'string' ? val : val.toString())
    .refine(val => {
      const num = parseFloat(val);
      return !isNaN(num) && num >= 0 && num <= 10000000;
    }, "Unit price must be between 0 and 10,000,000")
    .refine(val => {
      const num = parseFloat(val);
      // Ensure no more than 2 decimal places for currency
      const rounded = Math.round(num * 100) / 100;
      return Math.abs(num - rounded) < 0.001;
    }, "Unit price can have maximum 2 decimal places"),
  markupType: z.enum(['percentage', 'dollar'], {
    errorMap: () => ({ message: "Markup type must be either 'percentage' or 'dollar'" })
  }),
  markupValue: z.union([z.string(), z.number()])
    .transform(val => typeof val === 'string' ? val : val.toString())
    .refine(val => {
      const num = parseFloat(val);
      return !isNaN(num) && Number.isFinite(num) && num >= -10000000 && num <= 10000000;
    }, "Markup value must be between -10,000,000 and 10,000,000")
    .refine(val => {
      const num = parseFloat(val);
      // For percentage markup, limit to 2 decimal places
      const rounded = Math.round(num * 100) / 100;
      return Math.abs(num - rounded) < 0.001;
    }, "Markup value can have maximum 2 decimal places"),
  discountType: z.enum(['percentage', 'dollar'], {
    errorMap: () => ({ message: "Discount type must be either 'percentage' or 'dollar'" })
  }).optional(),
  discountValue: z.union([z.string(), z.number()])
    .transform(val => typeof val === 'string' ? val : val.toString())
    .refine(val => {
      const num = parseFloat(val);
      return !isNaN(num) && num >= 0 && num <= 10000000;
    }, "Discount value must be between 0 and 10,000,000")
    .refine(val => {
      const num = parseFloat(val);
      // Ensure no more than 2 decimal places
      const rounded = Math.round(num * 100) / 100;
      return Math.abs(num - rounded) < 0.001;
    }, "Discount value can have maximum 2 decimal places"),
  isAccessory: z.boolean().optional(),
  configData: z.any().optional()
});

// Enhanced Group validation
export const insertGroupSchema = baseGroupSchema.extend({
  id: z.string().min(1, "Group ID is required").max(255, "Group ID is too long"),
  quoteId: z.number().int().positive("Quote ID must be a positive integer"),
  title: z.string().min(1, "Group title is required").max(500, "Group title is too long"),
  position: z.number().int().min(0, "Position must be non-negative").default(0),
  isCollapsed: z.boolean().default(false)
});

// Group ID parameter validation
export const groupIdParamSchema = z.object({
  groupId: z.string().min(1, "Group ID is required")
});

// Reordering validation schemas
export const reorderLineItemsSchema = z.object({
  moves: z.array(z.object({
    id: z.number().int().positive("Line item ID must be a positive integer"),
    groupId: z.string().nullable(),
    position: z.number().int().min(0, "Position must be non-negative")
  })).min(1, "At least one move is required"),
  quoteId: z.number().int().positive("Quote ID must be a positive integer")
});

export const reorderGroupsSchema = z.object({
  quoteId: z.number().int().positive("Quote ID must be a positive integer"),
  groupPositions: z.array(z.object({
    id: z.string().min(1, "Group ID is required"),
    position: z.number().int().min(0, "Position must be non-negative")
  })).min(1, "At least one group position is required")
});

// Enhanced Product validation - Phase B: manufacturer is required
export const insertProductSchema = z.object({
  name: z.string().min(1, "Product name is required").max(500, "Product name is too long"),
  description: z.string().max(5000, "Description is too long").optional(),
  manufacturer: z.string().min(1, "Manufacturer is required").max(100, "Manufacturer name is too long"),
  productType: z.enum(['simple', 'configurable'], {
    errorMap: () => ({ message: "Product type must be either 'simple' or 'configurable'" })
  }).optional(),
  defaultUnitPrice: z.union([z.string(), z.number()])
    .transform(val => typeof val === 'string' ? val : val.toString())
    .refine(val => {
      const num = parseFloat(val);
      return !isNaN(num) && num >= 0 && num <= 10000000;
    }, "Default unit price must be between 0 and 10,000,000"),
  defaultMarkupType: z.enum(['percentage', 'dollar'], {
    errorMap: () => ({ message: "Markup type must be either 'percentage' or 'dollar'" })
  }).optional(),
  defaultMarkupValue: z.union([z.string(), z.number()])
    .transform(val => typeof val === 'string' ? val : val.toString())
    .refine(val => {
      const num = parseFloat(val);
      return !isNaN(num) && Number.isFinite(num) && num >= -10000000 && num <= 10000000;
    }, "Default markup value must be between -10,000,000 and 10,000,000"),
  defaultDiscountType: z.enum(['percentage', 'dollar'], {
    errorMap: () => ({ message: "Discount type must be either 'percentage' or 'dollar'" })
  }).optional(),
  defaultDiscountValue: z.union([z.string(), z.number()])
    .transform(val => typeof val === 'string' ? val : val.toString())
    .refine(val => {
      const num = parseFloat(val);
      return !isNaN(num) && num >= 0 && num <= 100;
    }, "Default discount value must be between 0 and 100"),
  unit: z.string().max(50, "Unit name is too long").optional(),
  minLength: z.union([z.string(), z.number(), z.null()])
    .transform(val => val === null ? null : (typeof val === 'string' ? val : val.toString()))
    .optional()
    .refine(val => {
      if (val === null || val === undefined) return true;
      const num = parseFloat(val);
      return !isNaN(num) && num >= 0 && num <= 10000;
    }, "Min length must be between 0 and 10,000"),
  maxLength: z.union([z.string(), z.number(), z.null()])
    .transform(val => val === null ? null : (typeof val === 'string' ? val : val.toString()))
    .optional()
    .refine(val => {
      if (val === null || val === undefined) return true;
      const num = parseFloat(val);
      return !isNaN(num) && num >= 0 && num <= 10000;
    }, "Max length must be between 0 and 10,000"),
  minWidth: z.union([z.string(), z.number(), z.null()])
    .transform(val => val === null ? null : (typeof val === 'string' ? val : val.toString()))
    .optional()
    .refine(val => {
      if (val === null || val === undefined) return true;
      const num = parseFloat(val);
      return !isNaN(num) && num >= 0 && num <= 10000;
    }, "Min width must be between 0 and 10,000"),
  maxWidth: z.union([z.string(), z.number(), z.null()])
    .transform(val => val === null ? null : (typeof val === 'string' ? val : val.toString()))
    .optional()
    .refine(val => {
      if (val === null || val === undefined) return true;
      const num = parseFloat(val);
      return !isNaN(num) && num >= 0 && num <= 10000;
    }, "Max width must be between 0 and 10,000"),
  primaryImage: z.string().url("Primary image must be a valid URL").optional(),
  galleryImages: z.array(z.any()).optional(),
  specificationSheets: z.array(z.any()).optional(),
  configFields: z.any().optional(),
  adderPricing: z.any().optional(), // Screen-specific: remote prices, U-channel, color/fabric upcharges
  housingRules: z.any().optional() // Screen-specific: housing/roller specs by dimensions
});

// Enhanced Pricing Table validation
export const insertPricingTableSchema = basePricingTableSchema.extend({
  productId: z.number().int().positive("Product ID must be a positive integer"),
  lengthMin: z.union([z.string(), z.number()])
    .transform(val => typeof val === 'string' ? val : val.toString())
    .refine(val => {
      const num = parseFloat(val);
      return !isNaN(num) && num >= 0 && num <= 10000;
    }, "Length min must be between 0 and 10,000"),
  lengthMax: z.union([z.string(), z.number()])
    .transform(val => typeof val === 'string' ? val : val.toString())
    .refine(val => {
      const num = parseFloat(val);
      return !isNaN(num) && num >= 0 && num <= 10000;
    }, "Length max must be between 0 and 10,000"),
  widthMin: z.union([z.string(), z.number()])
    .transform(val => typeof val === 'string' ? val : val.toString())
    .refine(val => {
      const num = parseFloat(val);
      return !isNaN(num) && num >= 0 && num <= 10000;
    }, "Width min must be between 0 and 10,000"),
  widthMax: z.union([z.string(), z.number()])
    .transform(val => typeof val === 'string' ? val : val.toString())
    .refine(val => {
      const num = parseFloat(val);
      return !isNaN(num) && num >= 0 && num <= 10000;
    }, "Width max must be between 0 and 10,000"),
  retailPrice: z.union([z.string(), z.number()])
    .transform(val => typeof val === 'string' ? val : val.toString())
    .refine(val => {
      const num = parseFloat(val);
      return !isNaN(num) && num >= 0 && num <= 10000000;
    }, "Retail price must be between 0 and 10,000,000"),
  basePrice: z.union([z.string(), z.number()])
    .transform(val => typeof val === 'string' ? val : val.toString())
    .refine(val => {
      const num = parseFloat(val);
      return !isNaN(num) && num >= 0 && num <= 10000000;
    }, "Base price must be between 0 and 10,000,000")
});

// User authentication validation
export const createUserSchema = baseUserSchema.extend({
  username: z.string()
    .min(3, "Username must be at least 3 characters")
    .max(50, "Username is too long")
    .regex(/^[a-zA-Z0-9_-]+$/, "Username can only contain letters, numbers, underscores, and hyphens"),
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password is too long")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
  email: z.string().email("Invalid email format").max(255, "Email is too long").optional(),
  firstName: z.string().max(100, "First name is too long").optional(),
  lastName: z.string().max(100, "Last name is too long").optional(),
  role: z.enum(['admin', 'user'], {
    errorMap: () => ({ message: "Role must be either 'admin' or 'user'" })
  }).optional()
});

export const updateUserSchema = createUserSchema.partial().extend({
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password is too long")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .optional()
});

// File upload validation
export const uploadUrlSchema = z.object({
  imageType: z.enum(['portfolio', 'technical', 'company', 'product', 'specification'], {
    errorMap: () => ({ message: "Image type must be one of: portfolio, technical, company, product, specification" })
  }),
  filename: z.string()
    .min(1, "Filename is required")
    .max(255, "Filename is too long")
    .regex(/^[^<>:"/\\|?*\x00-\x1F]+\.[a-zA-Z0-9]+$/, "Invalid filename format")
});

export const finalizeUploadSchema = z.object({
  objectPath: z.string().min(1, "Object path is required")
});

// Image proxy validation with strict SSRF protection
export const imageProxySchema = z.object({
  url: z.string().url("Invalid URL format")
    .refine(val => {
      try {
        // For internal /objects/ paths, allow only relative paths that start with /objects/
        if (val.startsWith('/objects/')) {
          return true;
        }
        
        const url = new URL(val);
        
        // Only allow HTTPS protocol
        if (url.protocol !== 'https:') {
          return false;
        }
        
        // Block internal/private IP ranges and localhost
        const hostname = url.hostname.toLowerCase();
        
        // Block localhost variants
        if (hostname === 'localhost' || 
            hostname === '127.0.0.1' || 
            hostname === '::1' ||
            hostname.startsWith('127.') ||
            hostname.startsWith('0.')) {
          return false;
        }
        
        // Block private IP ranges (RFC 1918)
        if (hostname.match(/^10\./) ||
            hostname.match(/^192\.168\./) ||
            hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./) ||
            hostname.match(/^169\.254\./) || // Link-local
            hostname.match(/^224\./) || // Multicast
            hostname.match(/^\[?fe80:/) || // IPv6 link-local
            hostname.match(/^\[?::1\]?$/) || // IPv6 localhost
            hostname.match(/^\[?::ffff:/) // IPv4-mapped IPv6
        ) {
          return false;
        }
        
        // Only allow specific Replit storage domains
        const allowedHosts = [
          'storage.replit.com'
        ];
        
        // For external URLs, check allowed hosts or .replit.dev subdomains
        if (allowedHosts.includes(hostname)) {
          return true;
        }
        
        // Also allow .replit.dev subdomains (for deployed apps)
        if (hostname.endsWith('.replit.dev')) {
          return true;
        }
        
        return false;
        
      } catch (error) {
        return false;
      }
    }, "URL must be from approved Replit storage domains only")
});

// Calculate price validation
export const calculatePriceSchema = z.object({
  length: z.union([z.string(), z.number()])
    .transform(val => parseFloat(typeof val === 'string' ? val : val.toString()))
    .refine(val => !isNaN(val) && val > 0 && val <= 10000, 
      "Length must be between 0 and 10,000"),
  width: z.union([z.string(), z.number()])
    .transform(val => parseFloat(typeof val === 'string' ? val : val.toString()))
    .refine(val => !isNaN(val) && val > 0 && val <= 10000, 
      "Width must be between 0 and 10,000")
});

// Bulk operations validation
export const bulkDeleteSchema = z.object({
  ids: z.array(z.union([z.string(), z.number()]))
    .min(1, "At least one ID is required")
    .max(100, "Cannot delete more than 100 items at once")
    .transform(val => val.map(id => {
      const num = parseInt(typeof id === 'string' ? id : id.toString());
      if (isNaN(num) || num <= 0) {
        throw new Error("All IDs must be valid positive integers");
      }
      return num;
    }))
});

export const bulkUpdateSchema = z.object({
  ids: z.array(z.union([z.string(), z.number()]))
    .min(1, "At least one ID is required")
    .max(100, "Cannot update more than 100 items at once")
    .transform(val => val.map(id => {
      const num = parseInt(typeof id === 'string' ? id : id.toString());
      if (isNaN(num) || num <= 0) {
        throw new Error("All IDs must be valid positive integers");
      }
      return num;
    })),
  updates: z.object({
    discountType: z.enum(['percentage', 'dollar']).optional(),
    discountValue: z.union([z.string(), z.number()])
      .transform(val => typeof val === 'string' ? val : val.toString())
      .refine(val => {
        const num = parseFloat(val);
        return !isNaN(num) && num >= 0 && num <= 100;
      }, "Discount value must be between 0 and 100")
      .optional(),
    markupType: z.enum(['percentage', 'dollar']).optional(),
    markupValue: z.union([z.string(), z.number()])
      .transform(val => typeof val === 'string' ? val : val.toString())
      .refine(val => {
        const num = parseFloat(val);
        return !isNaN(num) && Number.isFinite(num) && num >= -10000000 && num <= 10000000;
      }, "Markup value must be between -10,000,000 and 10,000,000")
      .optional(),
    quantity: z.union([z.string(), z.number()])
      .transform(val => typeof val === 'string' ? val : val.toString())
      .refine(val => {
        const num = parseFloat(val);
        return !isNaN(num) && num > 0 && num <= 999999;
      }, "Quantity must be between 0.01 and 999,999")
      .optional(),
    unitPrice: z.union([z.string(), z.number()])
      .transform(val => typeof val === 'string' ? val : val.toString())
      .refine(val => {
        const num = parseFloat(val);
        return !isNaN(num) && num >= 0 && num <= 10000000;
      }, "Unit price must be between 0 and 10,000,000")
      .optional(),
    description: z.string().min(1).max(1000).optional()
  }).refine(val => Object.keys(val).length > 0, "At least one field must be provided for update")
});

export const bulkUpdateProductsSchema = z.object({
  productIds: z.array(z.union([z.string(), z.number()]))
    .min(1, "At least one product ID is required")
    .max(500, "Cannot update more than 500 products at once")
    .transform(val => val.map(id => {
      const num = parseInt(typeof id === 'string' ? id : id.toString());
      if (isNaN(num) || num <= 0) {
        throw new Error("All product IDs must be valid positive integers");
      }
      return num;
    })),
  updates: z.object({
    defaultMarkupType: z.enum(['percentage', 'dollar']).optional(),
    defaultMarkupValue: z.union([z.string(), z.number()])
      .transform(val => typeof val === 'string' ? val : val.toString())
      .refine(val => {
        const num = parseFloat(val);
        return !isNaN(num) && Number.isFinite(num) && num >= -10000000 && num <= 10000000;
      }, "Default markup value must be between -10,000,000 and 10,000,000")
      .optional(),
    defaultDiscountType: z.enum(['percentage', 'dollar']).optional(),
    defaultDiscountValue: z.union([z.string(), z.number()])
      .transform(val => typeof val === 'string' ? val : val.toString())
      .refine(val => {
        const num = parseFloat(val);
        return !isNaN(num) && num >= 0 && num <= 100;
      }, "Default discount value must be between 0 and 100")
      .optional(),
    // Phase B: Only manufacturer field supported
    manufacturer: z.string().min(1, "Manufacturer is required").max(100, "Manufacturer name is too long").optional()
  }).refine(val => Object.keys(val).length > 0, "At least one field must be provided for update")
});

// Bulk upload pricing table validation
export const bulkUploadPricingSchema = z.object({
  pricingData: z.array(z.object({
    lengthMin: z.union([z.string(), z.number()])
      .transform(val => parseFloat(typeof val === 'string' ? val : val.toString()))
      .refine(val => !isNaN(val) && val >= 0 && val <= 10000, 
        "Length min must be between 0 and 10,000"),
    lengthMax: z.union([z.string(), z.number()])
      .transform(val => parseFloat(typeof val === 'string' ? val : val.toString()))
      .refine(val => !isNaN(val) && val >= 0 && val <= 10000, 
        "Length max must be between 0 and 10,000"),
    widthMin: z.union([z.string(), z.number()])
      .transform(val => parseFloat(typeof val === 'string' ? val : val.toString()))
      .refine(val => !isNaN(val) && val >= 0 && val <= 10000, 
        "Width min must be between 0 and 10,000"),
    widthMax: z.union([z.string(), z.number()])
      .transform(val => parseFloat(typeof val === 'string' ? val : val.toString()))
      .refine(val => !isNaN(val) && val >= 0 && val <= 10000, 
        "Width max must be between 0 and 10,000"),
    retailPrice: z.union([z.string(), z.number()])
      .transform(val => parseFloat(typeof val === 'string' ? val : val.toString()))
      .refine(val => !isNaN(val) && val >= 0 && val <= 10000000, 
        "Retail price must be between 0 and 10,000,000"),
    basePrice: z.union([z.string(), z.number()])
      .transform(val => parseFloat(typeof val === 'string' ? val : val.toString()))
      .refine(val => !isNaN(val) && val >= 0 && val <= 10000000, 
        "Base price must be between 0 and 10,000,000")
  }).refine(data => data.lengthMin < data.lengthMax && data.widthMin < data.widthMax, 
    "Min values must be less than max values"))
  .min(1, "At least one pricing entry is required")
  .max(1000, "Cannot upload more than 1000 pricing entries at once")
});

// Contract template validation (reuse from base)
export const insertContractTemplateSchema = baseContractTemplateSchema.extend({
  name: z.string().min(1, "Name is required").max(255, "Name is too long"),
  title: z.string().min(1, "Title is required").max(255, "Title is too long"),
  terms: z.string().min(1, "Terms are required").max(100000, "Terms are too long"),
  isDefault: z.boolean().optional()
});

// Quote image validation schemas
export const createQuoteCoverPhotoSchema = z.object({
  quoteId: z.number().int().positive("Quote ID must be a positive integer"),
  filename: z.string().min(1, "Filename is required").max(255, "Filename is too long"),
  originalName: z.string().min(1, "Original name is required").max(255, "Original name is too long"),
  storageUrl: z.string().min(1, "Storage URL is required").max(500, "Storage URL is too long"),
  mimeType: z.string().min(1, "MIME type is required").max(100, "MIME type is too long"),
  fileSize: z.number().int().positive("File size must be positive"),
  description: z.string().max(500, "Description is too long").optional().nullable()
});

export const createQuoteProductRenderingSchema = z.object({
  quoteId: z.number().int().positive("Quote ID must be a positive integer"),
  filename: z.string().min(1, "Filename is required").max(255, "Filename is too long"),
  originalName: z.string().min(1, "Original name is required").max(255, "Original name is too long"),
  storageUrl: z.string().min(1, "Storage URL is required").max(500, "Storage URL is too long"),
  mimeType: z.string().min(1, "MIME type is required").max(100, "MIME type is too long"),
  fileSize: z.number().int().positive("File size must be positive"),
  description: z.string().max(500, "Description is too long").optional().nullable(),
  displayOrder: z.number().int().min(0).max(999).optional()
});

export const updateQuoteCoverPhotoSchema = z.object({
  description: z.string().max(500, "Description is too long").optional().nullable(),
  isActive: z.boolean().optional()
});

export const updateQuoteProductRenderingSchema = z.object({
  description: z.string().max(500, "Description is too long").optional().nullable(),
  displayOrder: z.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional()
});

export const quoteIdParamSchema = z.object({
  quoteId: z.string().regex(/^\d+$/, "Quote ID must be a valid positive integer").transform(val => parseInt(val))
});

export const imageIdParamSchema = z.object({
  imageId: z.string().regex(/^\d+$/, "Image ID must be a valid positive integer").transform(val => parseInt(val))
});

// Enhanced Issue Report validation
export const insertIssueReportSchema = baseIssueReportSchema.extend({
  description: z.string().min(1, "Description is required").max(5000, "Description is too long"),
  userAction: z.string().min(1, "User action is required").max(1000, "User action description is too long"),
  location: z.string().min(1, "Location is required").max(500, "Location is too long"),
  userEmail: z.string().email("Invalid email format").max(255, "Email is too long").optional().nullable(),
  userId: z.number().int().positive("User ID must be a positive integer").optional().nullable(),
  userAgent: z.string().max(1000, "User agent is too long").optional().nullable(),
  browserName: z.string().max(100, "Browser name is too long").optional().nullable(),
  browserVersion: z.string().max(50, "Browser version is too long").optional().nullable(),
  screenResolution: z.string().max(50, "Screen resolution is too long").optional().nullable(),
  status: z.enum(["open", "in_progress", "resolved", "closed"]).default("open"),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  assignedTo: z.number().int().positive("Assigned to must be a positive integer").optional().nullable(),
  healthMetrics: z.any().optional().nullable()
});

// E-Signature validation schemas
export const signatureTokenParamSchema = z.object({
  token: z.string().min(1, "Token is required")
});

export const signatureDataSchema = z.object({
  type: z.enum(["draw", "type"], { errorMap: () => ({ message: "Signature type must be 'draw' or 'type'" }) }),
  imageData: z.string().min(1, "Signature image data is required"),
  name: z.string().min(1, "Signer name is required").max(200, "Name is too long")
});

export const submitSignatureSchema = z.object({
  signatureData: signatureDataSchema,
  signerType: z.enum(["client", "company"], { errorMap: () => ({ message: "Signer type must be 'client' or 'company'" }) })
});

// Screen pricing calculation validation
export const calculateScreenPriceSchema = z.object({
  productId: z.number().int().positive("Product ID must be a positive integer"),
  widthIn: z.number().min(1).max(500, "Width must be between 1 and 500 inches"),
  heightIn: z.number().min(1).max(500, "Height must be between 1 and 500 inches"),
  options: z.object({
    remotesQty: z.number().int().min(0).optional().default(0),
    uChannelLf: z.number().min(0).optional().default(0),
    colorNonStandard: z.boolean().optional().default(false),
    fabricKey: z.string().optional().default("")
  }).optional().default({})
});
