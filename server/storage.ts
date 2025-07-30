import { customers, quotes, lineItems, products, users, type Customer, type Quote, type LineItem, type Product, type User, type InsertCustomer, type InsertQuote, type InsertLineItem, type InsertProduct, type InsertUser, type QuoteWithDetails } from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  // Customer methods
  getCustomer(id: number): Promise<Customer | undefined>;
  getCustomerByEmail(email: string): Promise<Customer | undefined>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  updateCustomer(id: number, customer: Partial<InsertCustomer>): Promise<Customer | undefined>;

  // Quote methods
  getQuote(id: number): Promise<Quote | undefined>;
  getQuoteWithDetails(id: number): Promise<QuoteWithDetails | undefined>;
  getAllQuotes(): Promise<QuoteWithDetails[]>;
  createQuote(quote: InsertQuote): Promise<Quote>;
  updateQuote(id: number, quote: Partial<InsertQuote>): Promise<Quote | undefined>;
  deleteQuote(id: number): Promise<boolean>;

  // Product methods
  getAllProducts(): Promise<Product[]>;
  getProduct(id: number): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: number, product: Partial<InsertProduct>): Promise<Product | undefined>;
  deleteProduct(id: number): Promise<boolean>;

  // Line item methods
  getLineItemsByQuoteId(quoteId: number): Promise<LineItem[]>;
  createLineItem(lineItem: InsertLineItem): Promise<LineItem>;
  updateLineItem(id: number, lineItem: Partial<InsertLineItem>): Promise<LineItem | undefined>;
  deleteLineItem(id: number): Promise<boolean>;
  deleteLineItemsByQuoteId(quoteId: number): Promise<boolean>;

  // User authentication methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Session store for authentication
  sessionStore: any;
}

export class MemStorage implements IStorage {
  private customers: Map<number, Customer>;
  private quotes: Map<number, Quote>;
  private lineItems: Map<number, LineItem>;
  private currentCustomerId: number;
  private currentQuoteId: number;
  private currentLineItemId: number;

  constructor() {
    this.customers = new Map();
    this.quotes = new Map();
    this.lineItems = new Map();
    this.currentCustomerId = 1;
    this.currentQuoteId = 1;
    this.currentLineItemId = 1;
  }

  // Customer methods
  async getCustomer(id: number): Promise<Customer | undefined> {
    return this.customers.get(id);
  }

  async getCustomerByEmail(email: string): Promise<Customer | undefined> {
    return Array.from(this.customers.values()).find(customer => customer.email === email);
  }

  async createCustomer(insertCustomer: InsertCustomer): Promise<Customer> {
    const id = this.currentCustomerId++;
    const customer: Customer = { ...insertCustomer, id };
    this.customers.set(id, customer);
    return customer;
  }

  async updateCustomer(id: number, customerData: Partial<InsertCustomer>): Promise<Customer | undefined> {
    const existing = this.customers.get(id);
    if (!existing) return undefined;
    
    const updated: Customer = { ...existing, ...customerData };
    this.customers.set(id, updated);
    return updated;
  }

  // Quote methods
  async getQuote(id: number): Promise<Quote | undefined> {
    return this.quotes.get(id);
  }

  async getQuoteWithDetails(id: number): Promise<QuoteWithDetails | undefined> {
    const quote = this.quotes.get(id);
    if (!quote) return undefined;

    const customer = this.customers.get(quote.customerId);
    if (!customer) return undefined;

    const quoteLineItems = Array.from(this.lineItems.values()).filter(item => item.quoteId === id);

    return {
      ...quote,
      customer,
      lineItems: quoteLineItems,
    };
  }

  async getAllQuotes(): Promise<QuoteWithDetails[]> {
    const result: QuoteWithDetails[] = [];
    
    for (const quote of Array.from(this.quotes.values())) {
      const customer = this.customers.get(quote.customerId);
      if (customer) {
        const quoteLineItems = Array.from(this.lineItems.values()).filter(item => item.quoteId === quote.id);
        result.push({
          ...quote,
          customer,
          lineItems: quoteLineItems,
        });
      }
    }

    return result.sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }

  async createQuote(insertQuote: InsertQuote): Promise<Quote> {
    const id = this.currentQuoteId++;
    const quote: Quote = { 
      ...insertQuote,
      id,
      status: insertQuote.status || "draft",
      estimatedStartDate: insertQuote.estimatedStartDate || null,
      notes: insertQuote.notes || null,
      taxRate: insertQuote.taxRate || "0",
      discount: insertQuote.discount || "0",
      createdAt: new Date(),
    };
    this.quotes.set(id, quote);
    return quote;
  }

  async updateQuote(id: number, quoteData: Partial<InsertQuote>): Promise<Quote | undefined> {
    const existing = this.quotes.get(id);
    if (!existing) return undefined;
    
    const updated: Quote = { ...existing, ...quoteData };
    this.quotes.set(id, updated);
    return updated;
  }

  async deleteQuote(id: number): Promise<boolean> {
    const deleted = this.quotes.delete(id);
    if (deleted) {
      // Also delete associated line items
      await this.deleteLineItemsByQuoteId(id);
    }
    return deleted;
  }

  // Line item methods
  async getLineItemsByQuoteId(quoteId: number): Promise<LineItem[]> {
    return Array.from(this.lineItems.values()).filter(item => item.quoteId === quoteId);
  }

  async createLineItem(insertLineItem: InsertLineItem): Promise<LineItem> {
    const id = this.currentLineItemId++;
    const lineItem: LineItem = { ...insertLineItem, id };
    this.lineItems.set(id, lineItem);
    return lineItem;
  }

  async updateLineItem(id: number, lineItemData: Partial<InsertLineItem>): Promise<LineItem | undefined> {
    const existing = this.lineItems.get(id);
    if (!existing) return undefined;
    
    const updated: LineItem = { ...existing, ...lineItemData };
    this.lineItems.set(id, updated);
    return updated;
  }

  async deleteLineItem(id: number): Promise<boolean> {
    return this.lineItems.delete(id);
  }

  async deleteLineItemsByQuoteId(quoteId: number): Promise<boolean> {
    const itemsToDelete = Array.from(this.lineItems.entries()).filter(([_, item]) => item.quoteId === quoteId);
    itemsToDelete.forEach(([id]) => this.lineItems.delete(id));
    return true;
  }


}

export class DatabaseStorage implements IStorage {
  sessionStore: any;

  constructor() {
    // Import session store with dynamic import to work with ES modules
    import('connect-pg-simple').then(({ default: connectPg }) => {
      import('express-session').then(({ default: session }) => {
        const PostgresSessionStore = connectPg(session);
        this.sessionStore = new PostgresSessionStore({
          conString: process.env.DATABASE_URL,
          createTableIfMissing: false,
          tableName: "sessions",
        });
      });
    });
  }
  async getCustomer(id: number): Promise<Customer | undefined> {
    const [user] = await db.select().from(customers).where(eq(customers.id, id));
    return user || undefined;
  }

  async getCustomerByEmail(email: string): Promise<Customer | undefined> {
    const [user] = await db.select().from(customers).where(eq(customers.email, email));
    return user || undefined;
  }

  async createCustomer(insertCustomer: InsertCustomer): Promise<Customer> {
    const [customer] = await db
      .insert(customers)
      .values(insertCustomer)
      .returning();
    return customer;
  }

  async updateCustomer(id: number, customerData: Partial<InsertCustomer>): Promise<Customer | undefined> {
    const [updated] = await db
      .update(customers)
      .set(customerData)
      .where(eq(customers.id, id))
      .returning();
    return updated || undefined;
  }

  async getQuote(id: number): Promise<Quote | undefined> {
    const [quote] = await db.select().from(quotes).where(eq(quotes.id, id));
    return quote || undefined;
  }

  async getQuoteWithDetails(id: number): Promise<QuoteWithDetails | undefined> {
    const [quote] = await db.select().from(quotes).where(eq(quotes.id, id));
    if (!quote) return undefined;

    const [customer] = await db.select().from(customers).where(eq(customers.id, quote.customerId));
    if (!customer) return undefined;

    const quoteLineItems = await db.select().from(lineItems).where(eq(lineItems.quoteId, id));

    return {
      ...quote,
      customer,
      lineItems: quoteLineItems,
    };
  }

  async getAllQuotes(): Promise<QuoteWithDetails[]> {
    const allQuotes = await db.select().from(quotes);
    const result: QuoteWithDetails[] = [];

    for (const quote of allQuotes) {
      const [customer] = await db.select().from(customers).where(eq(customers.id, quote.customerId));
      if (customer) {
        const quoteLineItems = await db.select().from(lineItems).where(eq(lineItems.quoteId, quote.id));
        result.push({
          ...quote,
          customer,
          lineItems: quoteLineItems,
        });
      }
    }

    return result.sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }

  async createQuote(insertQuote: InsertQuote): Promise<Quote> {
    const [quote] = await db
      .insert(quotes)
      .values(insertQuote)
      .returning();
    return quote;
  }

  async updateQuote(id: number, quoteData: Partial<InsertQuote>): Promise<Quote | undefined> {
    const [updated] = await db
      .update(quotes)
      .set(quoteData)
      .where(eq(quotes.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteQuote(id: number): Promise<boolean> {
    // Delete associated line items first
    await db.delete(lineItems).where(eq(lineItems.quoteId, id));
    
    // Then delete the quote
    const result = await db.delete(quotes).where(eq(quotes.id, id));
    return (result.rowCount || 0) > 0;
  }

  async getLineItemsByQuoteId(quoteId: number): Promise<LineItem[]> {
    return await db.select().from(lineItems).where(eq(lineItems.quoteId, quoteId));
  }

  async createLineItem(insertLineItem: InsertLineItem): Promise<LineItem> {
    const [lineItem] = await db
      .insert(lineItems)
      .values(insertLineItem)
      .returning();
    return lineItem;
  }

  async updateLineItem(id: number, lineItemData: Partial<InsertLineItem>): Promise<LineItem | undefined> {
    const [updated] = await db
      .update(lineItems)
      .set(lineItemData)
      .where(eq(lineItems.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteLineItem(id: number): Promise<boolean> {
    const result = await db.delete(lineItems).where(eq(lineItems.id, id));
    return (result.rowCount || 0) > 0;
  }

  async deleteLineItemsByQuoteId(quoteId: number): Promise<boolean> {
    await db.delete(lineItems).where(eq(lineItems.quoteId, quoteId));
    return true;
  }

  // Product methods
  async getAllProducts(): Promise<Product[]> {
    return await db.select().from(products).orderBy(products.category, products.name);
  }

  async getProduct(id: number): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product || undefined;
  }

  async createProduct(insertProduct: InsertProduct): Promise<Product> {
    const [product] = await db
      .insert(products)
      .values(insertProduct)
      .returning();
    return product;
  }

  async updateProduct(id: number, productData: Partial<InsertProduct>): Promise<Product | undefined> {
    const [updated] = await db
      .update(products)
      .set(productData)
      .where(eq(products.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteProduct(id: number): Promise<boolean> {
    const result = await db.delete(products).where(eq(products.id, id));
    return (result.rowCount || 0) > 0;
  }

  // User authentication methods
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  sessionStore: any
}

export const storage = new DatabaseStorage();
