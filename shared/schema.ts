import { pgTable, text, serial, integer, decimal, timestamp, boolean, varchar, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";

// Session storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table for username/password authentication
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: varchar("username").unique().notNull(),
  password: varchar("password").notNull(),
  email: varchar("email"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  role: varchar("role").notNull().default("user"), // admin, user
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  company: text("company"), // Company name for business clients
});

export const quotes = pgTable("quotes", {
  id: serial("id").primaryKey(),
  quoteNumber: text("quote_number").notNull().unique(),
  customerId: integer("customer_id").notNull(),
  projectName: text("project_name"),
  projectAddress: text("project_address"),
  estimatedStartDate: text("estimated_start_date"),
  notes: text("notes"),
  // Image fields for comprehensive image integration
  projectImages: jsonb("project_images"), // Array of project photo URLs and metadata
  portfolioImages: jsonb("portfolio_images"), // Array of selected portfolio showcase images
  technicalDiagrams: jsonb("technical_diagrams"), // Array of technical diagrams and plans
  companyImages: jsonb("company_images"), // Company branding and team photos
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).default("0"),
  discount: decimal("discount", { precision: 5, scale: 2 }).default("0"),
  shipping: decimal("shipping", { precision: 10, scale: 2 }).default("0"),
  status: text("status").notNull().default("draft"), // draft, sent, approved, rejected
  // Contract and signature fields
  contractTemplateId: integer("contract_template_id"), // reference to contract template
  customContractTerms: text("custom_contract_terms"), // custom contract text for this quote
  issuerSignature: text("issuer_signature"), // issuer signature (name)
  issuerSignatureDate: timestamp("issuer_signature_date"),
  customerSignature: text("customer_signature"), // customer signature (name)
  customerSignatureDate: timestamp("customer_signature_date"),
  signatureStatus: text("signature_status").notNull().default("unsigned"), // unsigned, signed
  // DocuSign integration fields
  docusignEnvelopeId: text("docusign_envelope_id"), // DocuSign envelope ID
  docusignStatus: text("docusign_status"), // created, sent, delivered, signed, completed, declined, voided
  docusignSentDate: timestamp("docusign_sent_date"), // when envelope was sent to customer
  docusignViewUrl: text("docusign_view_url"), // URL for customer to view/sign document
  createdAt: timestamp("created_at").defaultNow(),
});

// Contract templates for reusable contract terms
export const contractTemplates = pgTable("contract_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  title: text("title").notNull().default("Service Agreement"),
  terms: text("terms").notNull(),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Proposal templates for different proposal layouts and content structures
export const proposalTemplates = pgTable("proposal_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull(), // basic_quote, full_proposal, executive_summary, technical_spec
  templateType: text("template_type").notNull().default("pdf"), // pdf, html, email
  // Layout configuration  
  sections: jsonb("sections").notNull(), // Array of section configurations
  layoutSettings: jsonb("layout_settings"), // Layout preferences, spacing, page settings
  // Visual settings
  brandingSettings: jsonb("branding_settings"), // Colors, logos, fonts
  // Default content
  defaultContent: jsonb("default_content"), // Default text and placeholders for sections
  // Template status
  isActive: boolean("is_active").default(true),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category"),
  productType: text("product_type").notNull().default("simple"), // simple, configurable
  defaultUnitPrice: decimal("default_unit_price", { precision: 10, scale: 2 }).notNull(),
  defaultMarkupType: text("default_markup_type").notNull().default("percentage"),
  defaultMarkupValue: decimal("default_markup_value", { precision: 10, scale: 2 }).notNull().default("25"),
  defaultDiscountType: text("default_discount_type").notNull().default("percentage"),
  defaultDiscountValue: decimal("default_discount_value", { precision: 10, scale: 2 }).notNull().default("0"),
  unit: text("unit").default("each"), // each, sq ft, linear ft, cubic yard, etc.
  // Configuration fields for configurable products
  configFields: jsonb("config_fields"), // JSON array of configuration field definitions
  minLength: decimal("min_length", { precision: 8, scale: 2 }), // for dimensional products
  maxLength: decimal("max_length", { precision: 8, scale: 2 }),
  minWidth: decimal("min_width", { precision: 8, scale: 2 }),
  maxWidth: decimal("max_width", { precision: 8, scale: 2 }),
  // Image fields for product visualization
  primaryImage: text("primary_image"), // Main product image URL
  galleryImages: jsonb("gallery_images"), // Array of additional product photos
  specificationSheets: jsonb("specification_sheets"), // Technical specification documents/images
  createdAt: timestamp("created_at").defaultNow(),
});

// Dimensional pricing tables for configurable products
export const pricingTables = pgTable("pricing_tables", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull(),
  // Length band range
  lengthMin: decimal("length_min", { precision: 8, scale: 2 }).notNull(),
  lengthMax: decimal("length_max", { precision: 8, scale: 2 }).notNull(),
  // Width band range  
  widthMin: decimal("width_min", { precision: 8, scale: 2 }).notNull(),
  widthMax: decimal("width_max", { precision: 8, scale: 2 }).notNull(),
  retailPrice: decimal("retail_price", { precision: 10, scale: 2 }).notNull(),
  basePrice: decimal("base_price", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Product accessories - items that can be added to base products
export const productAccessories = pgTable("product_accessories", {
  id: serial("id").primaryKey(),
  baseProductId: integer("base_product_id").notNull(), // the main product (e.g., Brustor B200xl)
  accessoryProductId: integer("accessory_product_id").notNull(), // the accessory product
  isRequired: boolean("is_required").default(false),
  displayOrder: integer("display_order").default(0),
  category: text("category"), // e.g., "Motors", "Lighting", "Sensors"
  createdAt: timestamp("created_at").defaultNow(),
});

export const lineItems = pgTable("line_items", {
  id: serial("id").primaryKey(),
  quoteId: integer("quote_id").notNull(),
  productId: integer("product_id"), // optional reference to product catalog
  description: text("description").notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  retailPrice: decimal("retail_price", { precision: 10, scale: 2 }), // manufacturer's suggested retail price
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  markupType: text("markup_type").notNull(), // percentage, dollar
  markupValue: decimal("markup_value", { precision: 10, scale: 2 }).notNull(),
  discountType: text("discount_type").notNull().default("percentage"), // percentage, dollar
  discountValue: decimal("discount_value", { precision: 10, scale: 2 }).notNull().default("0"),
  // Configuration data for configurable products
  configData: jsonb("config_data"), // JSON object storing configuration values (dimensions, options, etc.)
  baseProductId: integer("base_product_id"), // reference to base product for accessories
  isAccessory: boolean("is_accessory").default(false),
});

// Projects table for tracking project execution and management
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  projectNumber: text("project_number").notNull().unique(),
  quoteId: integer("quote_id").notNull(), // reference to the originating quote
  customerId: integer("customer_id").notNull(), // reference to customer
  projectName: text("project_name"),
  projectAddress: text("project_address"),
  status: text("status").notNull().default("pending"), // pending, in_progress, completed, on_hold, cancelled
  // Date tracking
  estimatedStartDate: text("estimated_start_date"),
  estimatedEndDate: text("estimated_end_date"),
  actualStartDate: text("actual_start_date"),
  actualEndDate: text("actual_end_date"),
  // Team and progress tracking
  assignedTeamMembers: jsonb("assigned_team_members"), // Array of team member objects
  completionPercentage: decimal("completion_percentage", { precision: 5, scale: 2 }).default("0"), // 0-100
  // Financial tracking
  contractValue: decimal("contract_value", { precision: 10, scale: 2 }),
  actualCost: decimal("actual_cost", { precision: 10, scale: 2 }).default("0"),
  // Progress documentation
  notes: text("notes"),
  progressPhotos: jsonb("progress_photos"), // Array of progress photo metadata
  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});



export const insertCustomerSchema = createInsertSchema(customers).omit({
  id: true,
});

// Zod schemas for image metadata structures
export const imageMetadataSchema = z.object({
  url: z.string().url("Must be a valid URL"),
  filename: z.string().min(1, "Filename is required"),
  caption: z.string().optional(),
  altText: z.string().optional(),
  uploadedAt: z.string(),
  size: z.number().optional(),
  thumbnailUrl: z.string().url().optional(),
});

export const projectImageSchema = imageMetadataSchema.extend({
  category: z.enum(['before', 'during', 'after', 'other']),
});

export const portfolioImageSchema = imageMetadataSchema.extend({
  projectType: z.string().optional(),
  featured: z.boolean().optional(),
});

export const technicalDiagramSchema = imageMetadataSchema.extend({
  diagramType: z.enum(['floorplan', 'elevation', 'detail', 'specification', 'other']),
});

export const companyImageSchema = imageMetadataSchema.extend({
  imageType: z.enum(['logo', 'team', 'facility', 'certification', 'other']),
});

export const productImageSchema = imageMetadataSchema.extend({
  imageType: z.enum(['primary', 'gallery', 'specification']),
  displayOrder: z.number().optional(),
});

export const insertQuoteSchema = createInsertSchema(quotes).omit({
  id: true,
  createdAt: true,
}).extend({
  taxRate: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? "0" : (typeof val === 'string' ? val : val.toString())),
  discount: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? "0" : (typeof val === 'string' ? val : val.toString())),
  shipping: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? "0" : (typeof val === 'string' ? val : val.toString())),
  projectName: z.union([z.string(), z.null()]).transform(val => val === null ? "" : val),
  projectAddress: z.union([z.string(), z.null()]).transform(val => val === null ? "" : val),
  estimatedStartDate: z.union([z.string(), z.null()]).transform(val => val === null ? "" : val),
  notes: z.union([z.string(), z.null()]).transform(val => val === null ? "" : val),
  // Image fields
  projectImages: z.array(projectImageSchema).optional(),
  portfolioImages: z.array(portfolioImageSchema).optional(),
  technicalDiagrams: z.array(technicalDiagramSchema).optional(),
  companyImages: z.array(companyImageSchema).optional(),
});

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
}).extend({
  defaultUnitPrice: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()),
  defaultMarkupValue: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()),
  defaultDiscountValue: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()),
  minLength: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? null : (typeof val === 'string' ? val : val.toString())).optional(),
  maxLength: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? null : (typeof val === 'string' ? val : val.toString())).optional(),
  minWidth: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? null : (typeof val === 'string' ? val : val.toString())).optional(),
  maxWidth: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? null : (typeof val === 'string' ? val : val.toString())).optional(),
  // Image fields
  primaryImage: z.string().url().optional(),
  galleryImages: z.array(productImageSchema).optional(),
  specificationSheets: z.array(productImageSchema).optional(),
});

export const insertPricingTableSchema = createInsertSchema(pricingTables).omit({
  id: true,
  createdAt: true,
}).extend({
  lengthMin: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()),
  lengthMax: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()),
  widthMin: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()),
  widthMax: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()),
  retailPrice: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()),
  basePrice: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()),
});

export const insertProductAccessorySchema = createInsertSchema(productAccessories).omit({
  id: true,
  createdAt: true,
});

export const insertLineItemSchema = createInsertSchema(lineItems).omit({
  id: true,
}).extend({
  quantity: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()),
  retailPrice: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? null : (typeof val === 'string' ? val : val.toString())).optional(),
  unitPrice: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()),
  markupValue: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()),
  discountValue: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()),
});

export const insertContractTemplateSchema = createInsertSchema(contractTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProposalTemplateSchema = createInsertSchema(proposalTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  category: z.enum(['basic_quote', 'full_proposal', 'executive_summary', 'technical_spec'], {
    errorMap: () => ({ message: "Category must be one of: basic_quote, full_proposal, executive_summary, technical_spec" }),
  }),
  templateType: z.enum(['pdf', 'html', 'email'], {
    errorMap: () => ({ message: "Template type must be one of: pdf, html, email" }),
  }).default('pdf'),
});

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  projectName: z.union([z.string(), z.null()]).transform(val => val === null ? "" : val).optional(),
  projectAddress: z.union([z.string(), z.null()]).transform(val => val === null ? "" : val).optional(),
  contractValue: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? null : (typeof val === 'string' ? val : val.toString())).optional(),
  actualCost: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? "0" : (typeof val === 'string' ? val : val.toString())),
  completionPercentage: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? "0" : (typeof val === 'string' ? val : val.toString())),
  // Date fields are now text, so handle as text
  estimatedStartDate: z.union([z.string(), z.null()]).transform(val => val === null ? "" : val).optional(),
  estimatedEndDate: z.union([z.string(), z.null()]).transform(val => val === null ? "" : val).optional(),
  actualStartDate: z.union([z.string(), z.null()]).transform(val => val === null ? "" : val).optional(),
  actualEndDate: z.union([z.string(), z.null()]).transform(val => val === null ? "" : val).optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'on_hold', 'cancelled'], {
    errorMap: () => ({ message: "Status must be one of: pending, in_progress, completed, on_hold, cancelled" }),
  }).default('pending'),
});



export type Customer = typeof customers.$inferSelect;
export type Quote = typeof quotes.$inferSelect;
export type Product = typeof products.$inferSelect;
export type LineItem = typeof lineItems.$inferSelect;
export type ContractTemplate = typeof contractTemplates.$inferSelect;
export type ProposalTemplate = typeof proposalTemplates.$inferSelect;
export type PricingTable = typeof pricingTables.$inferSelect;
export type ProductAccessory = typeof productAccessories.$inferSelect;
export type Project = typeof projects.$inferSelect;

export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type InsertQuote = z.infer<typeof insertQuoteSchema>;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type InsertLineItem = z.infer<typeof insertLineItemSchema>;
export type InsertContractTemplate = z.infer<typeof insertContractTemplateSchema>;
export type InsertProposalTemplate = z.infer<typeof insertProposalTemplateSchema>;
export type InsertPricingTable = z.infer<typeof insertPricingTableSchema>;
export type InsertProductAccessory = z.infer<typeof insertProductAccessorySchema>;
export type InsertProject = z.infer<typeof insertProjectSchema>;

export type QuoteWithDetails = Quote & {
  customer: Customer;
  lineItems: LineItem[];
  contractTemplate?: ContractTemplate;
  proposalTemplate?: ProposalTemplate;
};

// DTO types for API responses that include calculated fields
export type QuoteListItem = QuoteWithDetails & {
  total: number;
};

export type QuoteDetail = QuoteListItem & {
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  shippingAmount: number;
  margin: number;
  totalMarkup: number;
};

export type ProductWithDetails = Product & {
  pricingTables?: PricingTable[];
  accessories?: (ProductAccessory & { accessory: Product })[];
};

export type ProjectWithDetails = Project & {
  customer: Customer;
  quote: Quote;
};

// Image metadata types
export interface ImageMetadata {
  url: string;
  filename: string;
  caption?: string;
  altText?: string;
  uploadedAt: string;
  size?: number;
  thumbnailUrl?: string;
}

export interface ProjectImage extends ImageMetadata {
  category: 'before' | 'during' | 'after' | 'other';
}

export interface PortfolioImage extends ImageMetadata {
  projectType?: string;
  featured?: boolean;
}

export interface TechnicalDiagram extends ImageMetadata {
  diagramType: 'floorplan' | 'elevation' | 'detail' | 'specification' | 'other';
}

export interface CompanyImage extends ImageMetadata {
  imageType: 'logo' | 'team' | 'facility' | 'certification' | 'other';
}

export interface ProductImage extends ImageMetadata {
  imageType: 'primary' | 'gallery' | 'specification';
  displayOrder?: number;
}

// Template configuration types
export interface TemplateSection {
  id: string;
  name: string;
  order: number;
  required: boolean;
  defaultContent?: string;
}

export interface LayoutSettings {
  pageSize: 'A4' | 'letter';
  margins: {
    top: number;
    bottom: number;
  left: number;
    right: number;
  };
  spacing: {
    sectionGap: number;
    paragraphGap: number;
  };
  pageBreaks: {
    beforeSections: string[];
    avoidBreakInSections: string[];
  };
}

export interface BrandingSettings {
  primaryColor: string;
  accentColor: string;
  textColor: string;
  backgroundColor: string;
  logoSize: 'small' | 'medium' | 'large';
  headerStyle: 'minimal' | 'standard' | 'formal';
  footerStyle: 'minimal' | 'standard' | 'detailed';
}

export interface DefaultContent {
  companyDescription?: string;
  projectScope?: string;
  timeline?: string;
  credentials?: string;
  warranty?: string;
  paymentTerms?: string;
  additionalTerms?: string;
}

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
