import { z } from "zod";
import { 
  insertCustomerSchema as baseCustomerSchema,
  insertQuoteSchema as baseQuoteSchema,
  insertLineItemSchema as baseLineItemSchema,
  insertProductSchema as baseProductSchema,
  insertContractTemplateSchema as baseContractTemplateSchema,
  insertProposalTemplateSchema as baseProposalTemplateSchema,
  insertPricingTableSchema as basePricingTableSchema,
  insertProductAccessorySchema as baseProductAccessorySchema,
  insertUserSchema as baseUserSchema,
  insertLeadSchema as baseLeadSchema
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

export const leadIdParamSchema = z.object({
  leadId: z.string().regex(/^\d+$/, "Lead ID must be a valid positive integer").transform(val => parseInt(val))
});

// Enhanced Customer validation
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
  quoteNumber: z.string().min(1, "Quote number is required").max(50, "Quote number is too long"),
  customerId: z.number().int().positive("Customer ID must be a positive integer"),
  projectName: z.string().max(500, "Project name is too long").optional(),
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
  status: z.enum(['draft', 'sent', 'approved', 'rejected'], {
    errorMap: () => ({ message: "Status must be one of: draft, sent, approved, rejected" })
  }).optional(),
  signatureStatus: z.enum(['unsigned', 'signed'], {
    errorMap: () => ({ message: "Signature status must be one of: unsigned, signed" })
  }).optional(),
  contractTemplateId: z.number().int().positive().optional(),
  customContractTerms: z.string().max(10000, "Custom contract terms are too long").optional()
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
      return !isNaN(num) && num >= 0 && num <= 1000;
    }, "Markup value must be between 0 and 1000")
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

// Enhanced Product validation
export const insertProductSchema = baseProductSchema.extend({
  name: z.string().min(1, "Product name is required").max(500, "Product name is too long"),
  description: z.string().max(5000, "Description is too long").optional(),
  category: z.string().max(100, "Category name is too long").optional(),
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
      return !isNaN(num) && num >= 0 && num <= 1000;
    }, "Default markup value must be between 0 and 1000"),
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
  configFields: z.any().optional()
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

// Image proxy validation
export const imageProxySchema = z.object({
  url: z.string().url("Invalid URL format")
    .refine(val => val.includes('storage.replit.com') || val.includes('/objects/'), 
      "Only Replit storage URLs are allowed")
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
        return !isNaN(num) && num >= 0 && num <= 1000;
      }, "Markup value must be between 0 and 1000")
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
    .max(100, "Cannot update more than 100 products at once")
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
        return !isNaN(num) && num >= 0 && num <= 1000;
      }, "Default markup value must be between 0 and 1000")
      .optional(),
    defaultDiscountType: z.enum(['percentage', 'dollar']).optional(),
    defaultDiscountValue: z.union([z.string(), z.number()])
      .transform(val => typeof val === 'string' ? val : val.toString())
      .refine(val => {
        const num = parseFloat(val);
        return !isNaN(num) && num >= 0 && num <= 100;
      }, "Default discount value must be between 0 and 100")
      .optional(),
    category: z.string().max(100, "Category name is too long").optional()
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

// Proposal template validation (reuse from base)
export const insertProposalTemplateSchema = baseProposalTemplateSchema.extend({
  name: z.string().min(1, "Name is required").max(255, "Name is too long"),
  description: z.string().max(1000, "Description is too long").optional(),
  category: z.enum(['basic_quote', 'full_proposal', 'executive_summary', 'technical_spec'], {
    errorMap: () => ({ message: "Category must be one of: basic_quote, full_proposal, executive_summary, technical_spec" })
  }),
  templateType: z.enum(['pdf', 'html', 'email'], {
    errorMap: () => ({ message: "Template type must be one of: pdf, html, email" })
  }),
  sections: z.any(),
  layoutSettings: z.any().optional(),
  brandingSettings: z.any().optional(),
  defaultContent: z.any().optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional()
});

// Product accessory validation (reuse from base)
export const insertProductAccessorySchema = baseProductAccessorySchema.extend({
  baseProductId: z.number().int().positive("Base product ID must be a positive integer"),
  accessoryProductId: z.number().int().positive("Accessory product ID must be a positive integer"),
  isRequired: z.boolean().optional(),
  displayOrder: z.number().int().min(0).max(999).optional(),
  category: z.string().max(100, "Category name is too long").optional()
});

// Enhanced Lead validation
export const insertLeadSchema = baseLeadSchema.extend({
  title: z.string().min(1, "Title is required").max(255, "Title is too long"),
  description: z.string().max(5000, "Description is too long").optional(),
  contactName: z.string().min(1, "Contact name is required").max(255, "Contact name is too long"),
  email: z.string().email("Invalid email format").max(255, "Email is too long"),
  phone: z.string()
    .min(10, "Phone number must be at least 10 digits")
    .max(20, "Phone number is too long")
    .regex(/^[\d\s\-\+\(\)]+$/, "Phone number contains invalid characters")
    .optional(),
  company: z.string().max(255, "Company name is too long").optional(),
  source: z.string().max(255, "Source is too long").optional(),
  stage: z.enum(['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost'], {
    errorMap: () => ({ message: "Stage must be one of: new, contacted, qualified, proposal, negotiation, closed_won, closed_lost" })
  }).default('new'),
  value: z.union([z.string(), z.number(), z.null()])
    .transform(val => val === null ? null : (typeof val === 'string' ? val : val.toString()))
    .optional()
    .refine(val => {
      if (val === null || val === undefined) return true;
      const num = parseFloat(val);
      return !isNaN(num) && num >= 0 && num <= 10000000;
    }, "Value must be between 0 and 10,000,000"),
  priority: z.enum(['low', 'medium', 'high'], {
    errorMap: () => ({ message: "Priority must be one of: low, medium, high" })
  }).default('medium'),
  assignedTo: z.number().int().positive("Assigned to must be a valid user ID").optional(),
  notes: z.string().max(10000, "Notes are too long").optional(),
  customerId: z.number().int().positive().optional(),
  quoteId: z.number().int().positive().optional()
});

// Lead stage update validation
export const updateLeadStageSchema = z.object({
  stage: z.enum(['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost'], {
    errorMap: () => ({ message: "Stage must be one of: new, contacted, qualified, proposal, negotiation, closed_won, closed_lost" })
  })
});

// Lead query parameters validation
export const leadQueryParamsSchema = z.object({
  stage: z.enum(['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost']).optional(),
  assignedTo: z.string().regex(/^\d+$/, "Assigned to must be a valid positive integer").transform(val => parseInt(val)).optional(),
  search: z.string().max(255, "Search term is too long").optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  limit: z.string().regex(/^\d+$/, "Limit must be a positive integer").transform(val => Math.min(parseInt(val), 1000)).optional(),
  offset: z.string().regex(/^\d+$/, "Offset must be a positive integer").transform(val => parseInt(val)).optional()
});