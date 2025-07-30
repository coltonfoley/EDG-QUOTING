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
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).default("0"),
  discount: decimal("discount", { precision: 5, scale: 2 }).default("0"),
  status: text("status").notNull().default("draft"), // draft, sent, approved, rejected
  // Contract and signature fields
  contractTemplateId: integer("contract_template_id"), // reference to contract template
  customContractTerms: text("custom_contract_terms"), // custom contract text for this quote
  issuerSignature: text("issuer_signature"), // issuer signature (name)
  issuerSignatureDate: timestamp("issuer_signature_date"),
  customerSignature: text("customer_signature"), // customer signature (name)
  customerSignatureDate: timestamp("customer_signature_date"),
  signatureStatus: text("signature_status").notNull().default("pending"), // pending, issuer_signed, customer_signed, fully_signed
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

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category"),
  defaultUnitPrice: decimal("default_unit_price", { precision: 10, scale: 2 }).notNull(),
  defaultMarkupType: text("default_markup_type").notNull().default("percentage"),
  defaultMarkupValue: decimal("default_markup_value", { precision: 10, scale: 2 }).notNull().default("25"),
  unit: text("unit").default("each"), // each, sq ft, linear ft, cubic yard, etc.
  createdAt: timestamp("created_at").defaultNow(),
});

export const lineItems = pgTable("line_items", {
  id: serial("id").primaryKey(),
  quoteId: integer("quote_id").notNull(),
  productId: integer("product_id"), // optional reference to product catalog
  description: text("description").notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  markupType: text("markup_type").notNull(), // percentage, dollar
  markupValue: decimal("markup_value", { precision: 10, scale: 2 }).notNull(),
});



export const insertCustomerSchema = createInsertSchema(customers).omit({
  id: true,
});

export const insertQuoteSchema = createInsertSchema(quotes).omit({
  id: true,
  createdAt: true,
});

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
}).extend({
  defaultUnitPrice: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()),
  defaultMarkupValue: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()),
});

export const insertLineItemSchema = createInsertSchema(lineItems).omit({
  id: true,
}).extend({
  quantity: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()),
  unitPrice: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()),
  markupValue: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()),
});

export const insertContractTemplateSchema = createInsertSchema(contractTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});



export type Customer = typeof customers.$inferSelect;
export type Quote = typeof quotes.$inferSelect;
export type Product = typeof products.$inferSelect;
export type LineItem = typeof lineItems.$inferSelect;
export type ContractTemplate = typeof contractTemplates.$inferSelect;

export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type InsertQuote = z.infer<typeof insertQuoteSchema>;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type InsertLineItem = z.infer<typeof insertLineItemSchema>;
export type InsertContractTemplate = z.infer<typeof insertContractTemplateSchema>;

export type QuoteWithDetails = Quote & {
  customer: Customer;
  lineItems: LineItem[];
  contractTemplate?: ContractTemplate;
};

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
