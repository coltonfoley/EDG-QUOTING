import { pgTable, text, serial, integer, decimal, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
});

export const quotes = pgTable("quotes", {
  id: serial("id").primaryKey(),
  quoteNumber: text("quote_number").notNull().unique(),
  customerId: integer("customer_id").notNull(),
  projectName: text("project_name").notNull(),
  projectAddress: text("project_address").notNull(),
  estimatedStartDate: text("estimated_start_date"),
  notes: text("notes"),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).default("0"),
  discount: decimal("discount", { precision: 5, scale: 2 }).default("0"),
  status: text("status").notNull().default("draft"), // draft, sent, approved, rejected
  createdAt: timestamp("created_at").defaultNow(),
});

export const lineItems = pgTable("line_items", {
  id: serial("id").primaryKey(),
  quoteId: integer("quote_id").notNull(),
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

export const insertLineItemSchema = createInsertSchema(lineItems).omit({
  id: true,
}).extend({
  quantity: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()),
  unitPrice: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()),
  markupValue: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()),
});

export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;

export type Quote = typeof quotes.$inferSelect;
export type InsertQuote = z.infer<typeof insertQuoteSchema>;

export type LineItem = typeof lineItems.$inferSelect;
export type InsertLineItem = z.infer<typeof insertLineItemSchema>;

export type QuoteWithDetails = Quote & {
  customer: Customer;
  lineItems: LineItem[];
};
