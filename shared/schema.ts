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

// API Keys table for app-to-app authentication
export const apiKeys = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(), // Descriptive name for the key (e.g., "Internal App")
  keyHash: text("key_hash").notNull().unique(), // Bcrypt hash of the API key
  createdAt: timestamp("created_at").defaultNow(),
  lastUsedAt: timestamp("last_used_at"), // Track usage for monitoring
}, (table) => [
  index("idx_api_keys_key_hash").on(table.keyHash),
]);

// Accounts table (formerly customers) - represents business entities
// Enhanced with client fields (firstName, lastName) to support unified client model
export const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(), // Company or individual name
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  company: text("company"), // Company name for business clients
  accountType: text("account_type").notNull().default("homeowner"), // general_contractor, homeowner, commercial
  paymentTerms: text("payment_terms").default("net_30"), // net_30, net_60, due_on_receipt, etc.
  billingAddress: text("billing_address"),
  // Client-specific fields for unified model
  firstName: text("first_name"), // Individual's first name (optional for company-only accounts)
  lastName: text("last_name"), // Individual's last name (optional for company-only accounts)
  secondaryContacts: jsonb("secondary_contacts"), // Array of additional contact info for multi-person accounts
  // QuickBooks integration
  qbCustomerId: text("qb_customer_id"), // QuickBooks customer ID
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_accounts_email").on(table.email),
  index("idx_accounts_phone").on(table.phone),
  index("idx_accounts_type").on(table.accountType),
  index("idx_accounts_qb_customer_id").on(table.qbCustomerId),
]);

// Aliases for different conceptual uses
export const customers = accounts; // Legacy alias for backward compatibility
export const clients = accounts; // New unified client model alias

// QuickBooks integration settings
export const quickbooksSettings = pgTable("quickbooks_settings", {
  id: serial("id").primaryKey(),
  realmId: text("realm_id").notNull().unique(), // QuickBooks company ID
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  tokenExpiresAt: timestamp("token_expires_at").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// @ts-expect-error - TypeScript can't infer type for self-referencing foreign keys
export const quotes = pgTable("quotes", {
  id: serial("id").primaryKey(),
  quoteNumber: text("quote_number").notNull().unique(),
  accountId: integer("account_id").references(() => accounts.id, { onDelete: "set null" }), // Reference to accounts table
  projectName: text("project_name"),
  projectAddress: text("project_address"),
  jobsiteAddress: text("jobsite_address"), // if different from project address
  estimatedStartDate: text("estimated_start_date"),
  notes: text("notes"),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).default("0"),
  tariffRate: decimal("tariff_rate", { precision: 5, scale: 2 }).default("0"), // tariff percentage to increase cost
  discount: decimal("discount", { precision: 5, scale: 2 }).default("0"),
  shipping: decimal("shipping", { precision: 10, scale: 2 }).default("0"),
  isShippingTaxable: boolean("is_shipping_taxable").default(false), // whether shipping is subject to sales tax
  dealStage: text("deal_stage").notNull().default("new_lead"), // new_lead, qualifying, consultation_scheduled, building_estimate, quote_sent, closed_won, closed_lost, on_hold
  lostReason: text("lost_reason"), // price, timeline, competitor, no_budget, etc.
  // Contract fields
  contractTemplateId: integer("contract_template_id").references(() => contractTemplates.id, { onDelete: "set null" }), // reference to contract template
  customContractTerms: text("custom_contract_terms"), // custom contract text for this quote
  // E-Signature fields
  enableESignature: boolean("enable_e_signature").default(false), // toggle for electronic signature
  signingToken: text("signing_token").unique(), // unique token for signing link
  clientSignatureData: jsonb("client_signature_data"), // { type: 'draw'|'type', imageData: string, name: string }
  clientSignedAt: timestamp("client_signed_at"),
  clientSignedIp: text("client_signed_ip"),
  companySignatureData: jsonb("company_signature_data"), // { type: 'draw'|'type', imageData: string, name: string }
  companySignedAt: timestamp("company_signed_at"),
  companySignedIp: text("company_signed_ip"),
  // E-Signature PDF preferences
  esigIncludePricing: boolean("esig_include_pricing").default(true), // show pricing in signed PDF
  esigIncludeImages: boolean("esig_include_images").default(false), // include product renderings in signed PDF
  esigIncludeContract: boolean("esig_include_contract").default(true), // include contract terms in signed PDF
  // QuickBooks sync fields
  qbEstimateId: text("qb_estimate_id"), // QuickBooks estimate ID
  qbSyncStatus: text("qb_sync_status"), // null, 'pending', 'synced', 'error'
  qbSyncedAt: timestamp("qb_synced_at"),
  qbSyncError: text("qb_sync_error"),
  // Version control fields
  parentQuoteId: integer("parent_quote_id").references(() => quotes.id, { onDelete: "set null" }), // Links versions together
  versionNumber: integer("version_number").notNull().default(1), // Version number (1, 2, 3, etc.)
  isLatestVersion: boolean("is_latest_version").notNull().default(true), // Flag for filtering to latest version
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_quotes_account_id").on(table.accountId),
  index("idx_quotes_deal_stage").on(table.dealStage),
  index("idx_quotes_account_created").on(table.accountId, table.createdAt),
  index("idx_quotes_qb_sync_status").on(table.qbSyncStatus),
  index("idx_quotes_parent_quote_id").on(table.parentQuoteId),
  index("idx_quotes_is_latest_version").on(table.isLatestVersion),
  index("idx_quotes_parent_latest").on(table.parentQuoteId, table.isLatestVersion),
]);

// Quote cover photos - stores metadata for cover page images
export const quoteCoverPhotos = pgTable("quote_cover_photos", {
  id: serial("id").primaryKey(),
  quoteId: integer("quote_id").notNull(),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  storageUrl: text("storage_url").notNull(), // Object storage URL
  fileSize: integer("file_size"),
  mimeType: text("mime_type").notNull(),
  isActive: boolean("is_active").default(true), // For soft deletion
  uploadedAt: timestamp("uploaded_at").defaultNow(),
}, (table) => [
  index("idx_quote_cover_photos_quote_id").on(table.quoteId),
  index("idx_quote_cover_photos_active").on(table.isActive),
]);

// Quote visuals and details - stores metadata for project visual assets
export const quoteProductRenderings = pgTable("quote_product_renderings", {
  id: serial("id").primaryKey(),
  quoteId: integer("quote_id").notNull(),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  storageUrl: text("storage_url").notNull(), // Object storage URL
  displayOrder: integer("display_order").default(0),
  fileSize: integer("file_size"),
  mimeType: text("mime_type").notNull(),
  isActive: boolean("is_active").default(true), // For soft deletion
  uploadedAt: timestamp("uploaded_at").defaultNow(),
}, (table) => [
  index("idx_quote_product_renderings_quote_id").on(table.quoteId),
  index("idx_quote_product_renderings_active").on(table.isActive),
  index("idx_quote_product_renderings_order").on(table.quoteId, table.displayOrder),
]);

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


export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  manufacturer: text("manufacturer").notNull(),
  category: text("category"), // e.g., "Extrusions", "Gutters", "Louvers"
  productType: text("product_type").notNull().default("simple"), // simple, configurable
  // Pricing fields
  retailPrice: decimal("retail_price", { precision: 10, scale: 2 }).notNull(), // MSRP/list price from manufacturer
  // Manufacturer discount (applied to retail price to get our cost)
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
}, (table) => [
  index("idx_products_manufacturer").on(table.manufacturer),
  index("idx_products_product_type").on(table.productType),
  index("idx_products_category").on(table.category),
  index("idx_products_manufacturer_category").on(table.manufacturer, table.category),
]);

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
  housingCode: text("housing_code"), // Housing code for configurable products (e.g., H6EX, H75EX, H85EX)
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_pricing_tables_product_id").on(table.productId),
]);

// Product accessories - items that can be added to base products
export const productAccessories = pgTable("product_accessories", {
  id: serial("id").primaryKey(),
  baseProductId: integer("base_product_id").notNull(), // the main product (e.g., Brustor B200xl)
  accessoryProductId: integer("accessory_product_id").notNull(), // the accessory product
  isRequired: boolean("is_required").default(false),
  displayOrder: integer("display_order").default(0),
  category: text("category"), // e.g., "Motors", "Lighting", "Sensors"
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_product_accessories_base_product").on(table.baseProductId),
  index("idx_product_accessories_accessory_product").on(table.accessoryProductId),
]);

// Groups table for organizing line items
export const groups = pgTable("groups", {
  id: text("id").primaryKey(), // UUID for groups
  quoteId: integer("quote_id").notNull(),
  title: text("title").notNull(),
  position: integer("position").notNull().default(0), // sortable index among groups
  isCollapsed: boolean("is_collapsed").default(false), // UI state for collapsing groups
  configData: jsonb("config_data"), // JSON object storing full configuration for editing later
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_groups_quote_id").on(table.quoteId),
  index("idx_groups_position").on(table.quoteId, table.position),
]);

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
  isTaxable: boolean("is_taxable").default(true), // whether this line item is subject to sales tax
  isTariffApplicable: boolean("is_tariff_applicable").default(false), // whether tariff applies to this line item
  // Grouping and ordering fields
  groupId: text("group_id"), // nullable = ungrouped items
  position: integer("position").notNull().default(0), // sortable index within its group
}, (table) => [
  index("idx_line_items_quote_id").on(table.quoteId),
  index("idx_line_items_product_id").on(table.productId),
  index("idx_line_items_base_product_id").on(table.baseProductId),
  index("idx_line_items_group_id").on(table.groupId),
  index("idx_line_items_group_position").on(table.groupId, table.position),
]);

// Issue reports table for user feedback and bug tracking
export const issueReports = pgTable("issue_reports", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"), // optional reference to users table
  userEmail: text("user_email"), // email if user is not logged in
  description: text("description").notNull(),
  userAction: text("user_action").notNull(), // what the user was trying to do
  location: text("location").notNull(), // page/route where issue occurred
  // Browser and system information
  userAgent: text("user_agent"),
  browserName: text("browser_name"),
  browserVersion: text("browser_version"),
  screenResolution: text("screen_resolution"),
  // Health metrics snapshot
  healthMetrics: jsonb("health_metrics"), // console errors, performance data, etc.
  status: text("status").notNull().default("open"), // open, in_progress, resolved, closed
  priority: text("priority").notNull().default("medium"), // low, medium, high, critical
  assignedTo: integer("assigned_to"), // user ID of person assigned to resolve
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_issue_reports_status").on(table.status),
  index("idx_issue_reports_priority").on(table.priority),
  index("idx_issue_reports_user_id").on(table.userId),
  index("idx_issue_reports_created_at").on(table.createdAt),
]);





// Insert schemas for accounts and contacts
export const insertAccountSchema = createInsertSchema(accounts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
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
  paymentTerms: z.string().optional().nullable(),
  billingAddress: z.string().optional().nullable(),
  // Client-specific fields for unified model
  firstName: z.string().optional().nullable(),
  lastName: z.string().optional().nullable(),
  secondaryContacts: z.any().optional().nullable(), // JSONB field for additional contacts
});

// Legacy alias for backward compatibility
export const insertCustomerSchema = insertAccountSchema;

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



export const productImageSchema = imageMetadataSchema.extend({
  imageType: z.enum(['primary', 'gallery', 'specification']),
  displayOrder: z.number().optional(),
});

export const insertQuoteSchema = createInsertSchema(quotes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  taxRate: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? "0" : (typeof val === 'string' ? val : val.toString())),
  tariffRate: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? "0" : (typeof val === 'string' ? val : val.toString())).optional().default("0"),
  discount: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? "0" : (typeof val === 'string' ? val : val.toString())),
  shipping: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? "0" : (typeof val === 'string' ? val : val.toString())),
  isShippingTaxable: z.boolean().default(false),
  projectName: z.union([z.string(), z.null()]).transform(val => val === null ? "" : val).optional(),
  projectAddress: z.union([z.string(), z.null()]).transform(val => val === null ? "" : val).optional(),
  jobsiteAddress: z.union([z.string(), z.null()]).transform(val => val === null ? "" : val).optional(),
  estimatedStartDate: z.union([z.string(), z.null()]).transform(val => val === null ? "" : val).optional(),
  notes: z.union([z.string(), z.null()]).transform(val => val === null ? "" : val).optional(),
  dealStage: z.enum(["new_lead", "qualifying", "consultation_scheduled", "building_estimate", "quote_sent", "closed_won", "closed_lost", "on_hold"]).default("new_lead"),
  lostReason: z.string().optional().nullable(),
  // Contract template fields
  contractTemplateId: z.union([z.number(), z.null()]).optional(),
  customContractTerms: z.union([z.string(), z.null()]).optional(),
  // E-Signature fields (optional, set server-side, not included in client insert)
  enableESignature: z.boolean().optional(),
  signingToken: z.string().optional().nullable(),
  clientSignatureData: z.any().optional().nullable(),
  clientSignedAt: z.union([z.date(), z.null()]).optional(),
  clientSignedIp: z.string().optional().nullable(),
  companySignatureData: z.any().optional().nullable(),
  companySignedAt: z.union([z.date(), z.null()]).optional(),
  companySignedIp: z.string().optional().nullable(),
});


export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
}).extend({
  manufacturer: z.string().min(1, "Manufacturer is required"),
  category: z.string().optional().nullable(),
  retailPrice: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()),
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
  housingCode: z.string().optional().nullable(),
});

export const insertProductAccessorySchema = createInsertSchema(productAccessories).omit({
  id: true,
  createdAt: true,
});

export const insertGroupSchema = createInsertSchema(groups).omit({
  createdAt: true,
  updatedAt: true,
}).extend({
  id: z.string().min(1, "Group ID is required"),
  title: z.string().min(1, "Group title is required"),
  position: z.number().int().min(0).default(0),
  isCollapsed: z.boolean().default(false),
});

export const insertLineItemSchema = createInsertSchema(lineItems).omit({
  id: true,
}).extend({
  quantity: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()),
  retailPrice: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? null : (typeof val === 'string' ? val : val.toString())).optional(),
  unitPrice: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()),
  markupValue: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()),
  discountValue: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()),
  groupId: z.string().nullable().optional(),
  position: z.number().int().min(0).default(0),
});

export const insertContractTemplateSchema = createInsertSchema(contractTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});


export const insertQuoteCoverPhotoSchema = createInsertSchema(quoteCoverPhotos).omit({
  id: true,
  uploadedAt: true,
});

export const insertQuoteProductRenderingSchema = createInsertSchema(quoteProductRenderings).omit({
  id: true,
  uploadedAt: true,
});

export const insertIssueReportSchema = createInsertSchema(issueReports).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  resolvedAt: true,
}).extend({
  status: z.enum(["open", "in_progress", "resolved", "closed"]).default("open"),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  userEmail: z.string().email().optional().nullable(),
  userId: z.number().optional().nullable(),
  assignedTo: z.number().optional().nullable(),
});

export const insertApiKeySchema = createInsertSchema(apiKeys).omit({
  id: true,
  createdAt: true,
  lastUsedAt: true,
});


// Type exports
export type ApiKey = typeof apiKeys.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type Customer = typeof accounts.$inferSelect; // Legacy alias
export type Quote = typeof quotes.$inferSelect;
export type Product = typeof products.$inferSelect;
export type LineItem = typeof lineItems.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type ContractTemplate = typeof contractTemplates.$inferSelect;
export type PricingTable = typeof pricingTables.$inferSelect;
export type ProductAccessory = typeof productAccessories.$inferSelect;
export type QuoteCoverPhoto = typeof quoteCoverPhotos.$inferSelect;
export type QuoteProductRendering = typeof quoteProductRenderings.$inferSelect;
export type IssueReport = typeof issueReports.$inferSelect;
export type QuickBooksSettings = typeof quickbooksSettings.$inferSelect;

export type InsertApiKey = z.infer<typeof insertApiKeySchema>;
export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type InsertCustomer = z.infer<typeof insertAccountSchema>; // Legacy alias
export type InsertQuote = z.infer<typeof insertQuoteSchema>;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type InsertLineItem = z.infer<typeof insertLineItemSchema>;
export type InsertGroup = z.infer<typeof insertGroupSchema>;
export type InsertContractTemplate = z.infer<typeof insertContractTemplateSchema>;
export type InsertPricingTable = z.infer<typeof insertPricingTableSchema>;
export type InsertProductAccessory = z.infer<typeof insertProductAccessorySchema>;
export type InsertQuoteCoverPhoto = z.infer<typeof insertQuoteCoverPhotoSchema>;
export type InsertQuoteProductRendering = z.infer<typeof insertQuoteProductRenderingSchema>;
export type InsertIssueReport = z.infer<typeof insertIssueReportSchema>;

export type QuoteWithDetails = Quote & {
  account?: Account; // Optional since accountId can be null
  customer?: Account; // Legacy alias for backward compatibility - also optional
  lineItems: (LineItem & { manufacturer?: string })[];
  contractTemplate?: ContractTemplate;
  coverPhoto?: QuoteCoverPhoto; // Cover page image
  productRenderings?: QuoteProductRendering[]; // Visual assets and details
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



export interface ProductImage extends ImageMetadata {
  imageType: 'primary' | 'gallery' | 'specification';
  displayOrder?: number;
}


export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Utility function for manufacturer field
export const getProductManufacturer = (product: { manufacturer: string | null }) => {
  return product.manufacturer || "Unknown";
};

