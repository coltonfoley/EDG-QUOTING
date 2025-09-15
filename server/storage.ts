import { customers, quotes, lineItems, products, users, contractTemplates, proposalTemplates, pricingTables, productAccessories, leads, tasks, leadActivities, accounts, accountRoles, contacts, contactRoles, opportunities, activities, type Customer, type Quote, type LineItem, type Product, type User, type ContractTemplate, type ProposalTemplate, type PricingTable, type ProductAccessory, type Lead, type Task, type LeadActivity, type Account, type AccountRole, type Contact, type ContactRole, type Opportunity, type Activity, type InsertCustomer, type InsertQuote, type InsertLineItem, type InsertProduct, type InsertUser, type InsertContractTemplate, type InsertProposalTemplate, type InsertPricingTable, type InsertProductAccessory, type InsertLead, type InsertTask, type InsertLeadActivity, type InsertAccount, type InsertAccountRole, type InsertContact, type InsertContactRole, type InsertOpportunity, type InsertActivity, type QuoteWithDetails, type ProductWithDetails } from "@shared/schema";
import { db } from "./db";
import { eq, desc, inArray, sql, and, ne, lt } from "drizzle-orm";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import connectPg from "connect-pg-simple";
import session from "express-session";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export interface IStorage {
  // Customer methods
  getAllCustomers(): Promise<Customer[]>;
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
  getProductWithDetails(id: number): Promise<ProductWithDetails | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: number, product: Partial<InsertProduct>): Promise<Product | undefined>;
  deleteProduct(id: number): Promise<boolean>;
  bulkUpdateProducts(productIds: number[], updates: Partial<InsertProduct>): Promise<number>;

  // Pricing table methods
  getPricingTablesByProductId(productId: number): Promise<PricingTable[]>;
  createPricingTable(pricingTable: InsertPricingTable): Promise<PricingTable>;
  updatePricingTable(id: number, pricingTable: Partial<InsertPricingTable>): Promise<PricingTable | undefined>;
  deletePricingTable(id: number): Promise<boolean>;
  deletePricingTablesByProductId(productId: number): Promise<boolean>;
  calculateConfigurableProductPrice(productId: number, length: number, width: number): Promise<number | null>;

  // Product accessories methods  
  getProductAccessoriesByProductId(productId: number): Promise<(ProductAccessory & { accessory: Product })[]>;
  createProductAccessory(accessory: InsertProductAccessory): Promise<ProductAccessory>;
  updateProductAccessory(id: number, accessory: Partial<InsertProductAccessory>): Promise<ProductAccessory | undefined>;
  deleteProductAccessory(id: number): Promise<boolean>;

  // Line item methods
  getLineItemsByQuoteId(quoteId: number): Promise<LineItem[]>;
  createLineItem(lineItem: InsertLineItem): Promise<LineItem>;
  updateLineItem(id: number, lineItem: Partial<InsertLineItem>): Promise<LineItem | undefined>;
  deleteLineItem(id: number): Promise<boolean>;
  deleteLineItemsByQuoteId(quoteId: number): Promise<boolean>;
  bulkDeleteLineItems(ids: number[]): Promise<number>;
  bulkUpdateLineItems(ids: number[], updates: Partial<InsertLineItem>): Promise<number>;

  // User authentication methods
  getUser(id: any): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: any, user: Partial<InsertUser>): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  deleteUser(id: any): Promise<void>;

  // Contract template methods
  getAllContractTemplates(): Promise<ContractTemplate[]>;
  getContractTemplate(id: number): Promise<ContractTemplate | undefined>;
  createContractTemplate(template: InsertContractTemplate): Promise<ContractTemplate>;
  updateContractTemplate(id: number, template: Partial<InsertContractTemplate>): Promise<ContractTemplate | undefined>;
  deleteContractTemplate(id: number): Promise<boolean>;
  getDefaultContractTemplate(): Promise<ContractTemplate | undefined>;

  // Proposal template methods
  getAllProposalTemplates(includeInactive?: boolean): Promise<ProposalTemplate[]>;
  getProposalTemplate(id: number): Promise<ProposalTemplate | undefined>;
  createProposalTemplate(template: InsertProposalTemplate): Promise<ProposalTemplate>;
  updateProposalTemplate(id: number, template: Partial<InsertProposalTemplate>): Promise<ProposalTemplate | undefined>;
  deleteProposalTemplate(id: number): Promise<boolean>;
  getDefaultProposalTemplate(): Promise<ProposalTemplate | undefined>;
  getDefaultProposalTemplateByCategory(category: string): Promise<ProposalTemplate | undefined>;
  getProposalTemplatesByCategory(category: string, includeInactive?: boolean): Promise<ProposalTemplate[]>;
  
  // Session store for authentication
  sessionStore: any;

  // Authorization methods for security
  validateLineItemsOwnership(lineItemIds: number[], userId: any): Promise<{ isValid: boolean; quoteId?: number }>;
  validateQuoteOwnership(quoteId: number, userId: any): Promise<boolean>;

  // CRM Lead management methods
  getAllLeads(): Promise<Lead[]>;
  getLead(id: number): Promise<Lead | undefined>;
  getLeadsByStatus(status: string): Promise<Lead[]>;
  getLeadsByAssignedTo(userId: string): Promise<Lead[]>;
  createLead(lead: InsertLead): Promise<Lead>;
  updateLead(id: number, lead: Partial<InsertLead>): Promise<Lead | undefined>;
  deleteLead(id: number): Promise<boolean>;
  convertLeadToCustomer(leadId: number): Promise<{ lead: Lead | undefined; customer: Customer | undefined }>;

  // CRM Task management methods
  getAllTasks(): Promise<Task[]>;
  getTask(id: number): Promise<Task | undefined>;
  getTasksByLeadId(leadId: number): Promise<Task[]>;
  getTasksByAssignedTo(userId: string): Promise<Task[]>;
  getOverdueTasks(): Promise<Task[]>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: number, task: Partial<InsertTask>): Promise<Task | undefined>;
  deleteTask(id: number): Promise<boolean>;
  completeTask(id: number): Promise<Task | undefined>;

  // CRM Lead Activity methods
  getLeadActivities(leadId: number): Promise<LeadActivity[]>;
  createLeadActivity(activity: InsertLeadActivity): Promise<LeadActivity>;
  getRecentActivities(limit?: number): Promise<LeadActivity[]>;

  // Comprehensive CRM Account methods
  getAllAccounts(): Promise<Account[]>;
  getAccount(id: number): Promise<Account | undefined>;
  getAccountByEmail(email: string): Promise<Account | undefined>;
  createAccount(account: InsertAccount): Promise<Account>;
  updateAccount(id: number, account: Partial<InsertAccount>): Promise<Account | undefined>;
  deleteAccount(id: number): Promise<boolean>;

  // Account Role methods
  getAccountRoles(accountId: number): Promise<AccountRole[]>;
  addAccountRole(role: InsertAccountRole): Promise<AccountRole>;
  removeAccountRole(accountId: number, role: string): Promise<boolean>;

  // Contact methods
  getAllContacts(): Promise<Contact[]>;
  getContact(id: number): Promise<Contact | undefined>;
  getContactsByAccountId(accountId: number): Promise<Contact[]>;
  createContact(contact: InsertContact): Promise<Contact>;
  updateContact(id: number, contact: Partial<InsertContact>): Promise<Contact | undefined>;
  deleteContact(id: number): Promise<boolean>;

  // Contact Role methods
  getContactRoles(contactId: number): Promise<ContactRole[]>;
  addContactRole(role: InsertContactRole): Promise<ContactRole>;
  removeContactRole(contactId: number, role: string): Promise<boolean>;

  // Opportunity methods
  getAllOpportunities(): Promise<Opportunity[]>;
  getOpportunity(id: number): Promise<Opportunity | undefined>;
  getOpportunitiesByAccountId(accountId: number): Promise<Opportunity[]>;
  createOpportunity(opportunity: InsertOpportunity): Promise<Opportunity>;
  updateOpportunity(id: number, opportunity: Partial<InsertOpportunity>): Promise<Opportunity | undefined>;
  deleteOpportunity(id: number): Promise<boolean>;

  // Activity methods
  getActivitiesByEntity(entityType: string, entityId: number): Promise<Activity[]>;
  createActivity(activity: InsertActivity): Promise<Activity>;
  updateActivity(id: number, activity: Partial<InsertActivity>): Promise<Activity | undefined>;
  deleteActivity(id: number): Promise<boolean>;

  // Data Migration methods
  migrateCustomersToAccountsAndContacts(): Promise<{ 
    success: boolean; 
    migratedCustomers: number; 
    createdAccounts: number; 
    createdContacts: number; 
    errors: string[] 
  }>;
  migrateQuotesToOpportunities(): Promise<{ 
    success: boolean; 
    migratedQuotes: number; 
    createdOpportunities: number; 
    errors: string[] 
  }>;
  getMigrationStatus(): Promise<{
    customersNeedMigration: number;
    quotesNeedMigration: number;
    totalAccounts: number;
    totalContacts: number;
    totalOpportunities: number;
  }>;
}

export class MemStorage {
  // Note: This class is no longer used - DatabaseStorage is used instead
  // Removing IStorage implementation to fix TypeScript errors
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
    const customer: Customer = { 
      ...insertCustomer, 
      id,
      company: insertCustomer.company || null
    };
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
      shipping: insertQuote.shipping || "0",
      projectImages: insertQuote.projectImages || null,
      portfolioImages: insertQuote.portfolioImages || null,
      technicalDiagrams: insertQuote.technicalDiagrams || null,
      companyImages: insertQuote.companyImages || null,
      contractTemplateId: insertQuote.contractTemplateId || null,
      customContractTerms: insertQuote.customContractTerms || null,
      issuerSignature: insertQuote.issuerSignature || null,
      issuerSignatureDate: insertQuote.issuerSignatureDate || null,
      customerSignature: insertQuote.customerSignature || null,
      customerSignatureDate: insertQuote.customerSignatureDate || null,
      signatureStatus: insertQuote.signatureStatus || "unsigned",
      docusignEnvelopeId: insertQuote.docusignEnvelopeId || null,
      docusignStatus: insertQuote.docusignStatus || null,
      docusignSentDate: insertQuote.docusignSentDate || null,
      docusignViewUrl: insertQuote.docusignViewUrl || null,
      opportunityId: insertQuote.opportunityId ?? null,
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
    const lineItem: LineItem = { 
      ...insertLineItem, 
      id,
      productId: insertLineItem.productId || null,
      retailPrice: insertLineItem.retailPrice || null,
      baseProductId: insertLineItem.baseProductId || null,
      configData: insertLineItem.configData || null,
      isAccessory: insertLineItem.isAccessory || false,
      discountType: insertLineItem.discountType || "percentage",
      discountValue: insertLineItem.discountValue || "0",
    };
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
    // Initialize session store synchronously - imports are at top of file
    const PostgresSessionStore = connectPg(session);
    this.sessionStore = new PostgresSessionStore({
      conString: process.env.DATABASE_URL,
      createTableIfMissing: false,
      tableName: "sessions",
      schemaName: "public",
      ttl: 1000 * 60 * 60 * 24 * 7, // 7 days in milliseconds
      disableTouch: false,
    });
    
    // Add session store error handling
    this.sessionStore.on('error', (error: any) => {
      console.error('🚨 Session store error:', error);
    });
    
    this.sessionStore.on('connect', () => {
      console.log('✅ Session store connected successfully');
    });
    
    console.log('🔧 Session store initialized with DATABASE_URL:', process.env.DATABASE_URL ? 'Present' : 'Missing');
  }
  
  // Customer methods
  async getAllCustomers(): Promise<Customer[]> {
    return await db.select().from(customers).orderBy(desc(customers.id));
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

    // Get contract template if referenced
    let contractTemplate: ContractTemplate | undefined;
    if (quote.contractTemplateId) {
      [contractTemplate] = await db.select().from(contractTemplates).where(eq(contractTemplates.id, quote.contractTemplateId));
    }

    return {
      ...quote,
      customer,
      lineItems: quoteLineItems,
      contractTemplate,
    };
  }

  async getAllQuotes(): Promise<QuoteWithDetails[]> {
    const allQuotes = await db.select().from(quotes);
    const result: QuoteWithDetails[] = [];

    for (const quote of allQuotes) {
      const [customer] = await db.select().from(customers).where(eq(customers.id, quote.customerId));
      if (customer) {
        const quoteLineItems = await db.select().from(lineItems).where(eq(lineItems.quoteId, quote.id));
        
        // Get contract template if referenced
        let contractTemplate: ContractTemplate | undefined;
        if (quote.contractTemplateId) {
          [contractTemplate] = await db.select().from(contractTemplates).where(eq(contractTemplates.id, quote.contractTemplateId));
        }
        
        result.push({
          ...quote,
          customer,
          lineItems: quoteLineItems,
          contractTemplate,
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
    // Get existing quote data to merge images properly
    const [existingQuote] = await db
      .select()
      .from(quotes)
      .where(eq(quotes.id, id));
    
    if (!existingQuote) {
      return undefined;
    }

    // Prepare the update data
    let finalQuoteData = { ...quoteData };

    // Merge image arrays instead of replacing them
    const imageFields = ['projectImages', 'portfolioImages', 'technicalDiagrams', 'companyImages'] as const;
    
    for (const field of imageFields) {
      if (quoteData[field] && Array.isArray(quoteData[field])) {
        const existingImages = (existingQuote[field] as any[]) || [];
        const newImages = quoteData[field] as any[];
        
        // Merge arrays, avoiding duplicates based on URL
        const existingUrls = new Set(existingImages.map(img => img.url));
        const uniqueNewImages = newImages.filter(img => !existingUrls.has(img.url));
        
        finalQuoteData[field] = [...existingImages, ...uniqueNewImages] as any;
        
        console.log(`📸 Merged ${field}: ${existingImages.length} existing + ${uniqueNewImages.length} new = ${(finalQuoteData[field] as any[]).length} total`);
      }
    }

    const [updated] = await db
      .update(quotes)
      .set(finalQuoteData)
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

  async bulkDeleteLineItems(ids: number[]): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await db.delete(lineItems).where(inArray(lineItems.id, ids));
    return result.rowCount || 0;
  }

  async bulkUpdateLineItems(ids: number[], updates: Partial<InsertLineItem>): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await db
      .update(lineItems)
      .set(updates)
      .where(inArray(lineItems.id, ids))
      .returning();
    return result.length;
  }

  // Authorization methods for line item security
  async validateLineItemsOwnership(lineItemIds: number[], userId: any): Promise<{ isValid: boolean; quoteId?: number }> {
    if (lineItemIds.length === 0) return { isValid: false };

    // Get all line items and their associated quotes
    const items = await db
      .select({
        lineItemId: lineItems.id,
        quoteId: lineItems.quoteId,
        userId: users.id // Use users.id since quotes table doesn't have userId field
      })
      .from(lineItems)
      .leftJoin(quotes, eq(lineItems.quoteId, quotes.id))
      .leftJoin(users, eq(quotes.customerId, users.id)) // This may need adjustment based on auth model
      .where(inArray(lineItems.id, lineItemIds));

    if (items.length !== lineItemIds.length) {
      return { isValid: false }; // Some line items don't exist
    }

    // For now, since we don't have userId in quotes table, we'll validate all items belong to same quote
    const quoteIds = Array.from(new Set(items.map(item => item.quoteId)));
    if (quoteIds.length !== 1) {
      return { isValid: false }; // Line items belong to different quotes
    }

    return { isValid: true, quoteId: quoteIds[0] };
  }

  async validateQuoteOwnership(quoteId: number, userId: any): Promise<boolean> {
    // For now, return true since we don't have user ownership in quotes
    // This should be enhanced when proper user-quote relationships are implemented
    const quote = await db.select().from(quotes).where(eq(quotes.id, quoteId)).limit(1);
    return quote.length > 0;
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

  async bulkUpdateProducts(productIds: number[], updates: Partial<InsertProduct>): Promise<number> {
    const result = await db
      .update(products)
      .set(updates)
      .where(inArray(products.id, productIds))
      .returning();
    return result.length;
  }

  // User authentication methods
  async getUser(id: any): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const hashedPassword = await hashPassword(insertUser.password);
    const userData = { ...insertUser, password: hashedPassword };
    
    const [user] = await db
      .insert(users)
      .values(userData)
      .returning();
    return user;
  }

  async updateUser(id: any, userData: Partial<InsertUser>): Promise<User | undefined> {
    // If updating password, hash it
    if (userData.password) {
      userData.password = await hashPassword(userData.password);
    }
    
    const [updated] = await db
      .update(users)
      .set(userData)
      .where(eq(users.id, id))
      .returning();
    return updated || undefined;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(desc(users.createdAt));
  }

  async deleteUser(id: any): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  // Contract template methods
  async getAllContractTemplates(): Promise<ContractTemplate[]> {
    return await db.select().from(contractTemplates).orderBy(contractTemplates.name);
  }

  async getContractTemplate(id: number): Promise<ContractTemplate | undefined> {
    const [template] = await db.select().from(contractTemplates).where(eq(contractTemplates.id, id));
    return template || undefined;
  }

  async createContractTemplate(insertTemplate: InsertContractTemplate): Promise<ContractTemplate> {
    const [template] = await db
      .insert(contractTemplates)
      .values(insertTemplate)
      .returning();
    return template;
  }

  async updateContractTemplate(id: number, templateData: Partial<InsertContractTemplate>): Promise<ContractTemplate | undefined> {
    const [updated] = await db
      .update(contractTemplates)
      .set(templateData)
      .where(eq(contractTemplates.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteContractTemplate(id: number): Promise<boolean> {
    const result = await db.delete(contractTemplates).where(eq(contractTemplates.id, id));
    return (result.rowCount || 0) > 0;
  }

  async getDefaultContractTemplate(): Promise<ContractTemplate | undefined> {
    const [template] = await db.select().from(contractTemplates).where(eq(contractTemplates.isDefault, true));
    return template || undefined;
  }

  // Proposal template methods
  async getAllProposalTemplates(includeInactive?: boolean): Promise<ProposalTemplate[]> {
    // Build query conditionally to avoid type issues
    if (!includeInactive) {
      return await db
        .select()
        .from(proposalTemplates)
        .where(eq(proposalTemplates.isActive, true))
        .orderBy(proposalTemplates.name);
    }
    
    return await db
      .select()
      .from(proposalTemplates)
      .orderBy(proposalTemplates.name);
  }

  async getProposalTemplate(id: number): Promise<ProposalTemplate | undefined> {
    const [template] = await db.select().from(proposalTemplates).where(eq(proposalTemplates.id, id));
    return template || undefined;
  }

  async createProposalTemplate(insertTemplate: InsertProposalTemplate): Promise<ProposalTemplate> {
    // If this template is being set as default, first unset all other defaults in the same category
    if (insertTemplate.isDefault && insertTemplate.category) {
      await db
        .update(proposalTemplates)
        .set({ isDefault: false })
        .where(
          and(
            eq(proposalTemplates.isDefault, true),
            eq(proposalTemplates.category, insertTemplate.category)
          )
        );
    }
    
    const [template] = await db
      .insert(proposalTemplates)
      .values(insertTemplate)
      .returning();
    return template;
  }

  async updateProposalTemplate(id: number, templateData: Partial<InsertProposalTemplate>): Promise<ProposalTemplate | undefined> {
    // If this template is being set as default, first unset all other defaults in the same category
    if (templateData.isDefault) {
      // Get the current template to determine its category
      const currentTemplate = await this.getProposalTemplate(id);
      if (currentTemplate) {
        // Use the category from template data if provided, otherwise use current template's category
        const targetCategory = templateData.category || currentTemplate.category;
        
        await db
          .update(proposalTemplates)
          .set({ isDefault: false })
          .where(
            and(
              eq(proposalTemplates.isDefault, true),
              eq(proposalTemplates.category, targetCategory),
              ne(proposalTemplates.id, id) // Don't unset itself
            )
          );
      }
    }
    
    const [updated] = await db
      .update(proposalTemplates)
      .set(templateData)
      .where(eq(proposalTemplates.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteProposalTemplate(id: number): Promise<boolean> {
    const result = await db.delete(proposalTemplates).where(eq(proposalTemplates.id, id));
    return (result.rowCount || 0) > 0;
  }

  async getDefaultProposalTemplate(): Promise<ProposalTemplate | undefined> {
    const [template] = await db.select().from(proposalTemplates).where(eq(proposalTemplates.isDefault, true));
    return template || undefined;
  }

  async getDefaultProposalTemplateByCategory(category: string): Promise<ProposalTemplate | undefined> {
    const [template] = await db
      .select()
      .from(proposalTemplates)
      .where(
        and(
          eq(proposalTemplates.isDefault, true),
          eq(proposalTemplates.category, category),
          eq(proposalTemplates.isActive, true)
        )
      );
    return template || undefined;
  }

  async getProposalTemplatesByCategory(category: string, includeInactive?: boolean): Promise<ProposalTemplate[]> {
    const conditions = [eq(proposalTemplates.category, category)];
    
    if (!includeInactive) {
      conditions.push(eq(proposalTemplates.isActive, true));
    }
    
    return await db
      .select()
      .from(proposalTemplates)
      .where(and(...conditions))
      .orderBy(desc(proposalTemplates.isDefault), proposalTemplates.name);
  }

  // Enhanced product method with details
  async getProductWithDetails(id: number): Promise<ProductWithDetails | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    if (!product) return undefined;

    // Get pricing tables for the product
    const productPricingTables = await db.select().from(pricingTables).where(eq(pricingTables.productId, id));

    // Get accessories with their product details
    const accessoryLinks = await db
      .select({
        id: productAccessories.id,
        baseProductId: productAccessories.baseProductId,
        accessoryProductId: productAccessories.accessoryProductId,
        isRequired: productAccessories.isRequired,
        displayOrder: productAccessories.displayOrder,
        category: productAccessories.category,
        createdAt: productAccessories.createdAt,
        accessory: products,
      })
      .from(productAccessories)
      .leftJoin(products, eq(productAccessories.accessoryProductId, products.id))
      .where(eq(productAccessories.baseProductId, id));

    return {
      ...product,
      pricingTables: productPricingTables,
      accessories: accessoryLinks as (ProductAccessory & { accessory: Product })[],
    };
  }

  // Pricing table methods
  async getPricingTablesByProductId(productId: number): Promise<PricingTable[]> {
    return await db.select().from(pricingTables).where(eq(pricingTables.productId, productId));
  }

  async createPricingTable(insertPricingTable: InsertPricingTable): Promise<PricingTable> {
    const [pricingTable] = await db
      .insert(pricingTables)
      .values(insertPricingTable)
      .returning();
    return pricingTable;
  }

  async updatePricingTable(id: number, pricingTableData: Partial<InsertPricingTable>): Promise<PricingTable | undefined> {
    const [updated] = await db
      .update(pricingTables)
      .set(pricingTableData)
      .where(eq(pricingTables.id, id))
      .returning();
    return updated || undefined;
  }

  async deletePricingTable(id: number): Promise<boolean> {
    const result = await db.delete(pricingTables).where(eq(pricingTables.id, id));
    return (result.rowCount || 0) > 0;
  }

  async deletePricingTablesByProductId(productId: number): Promise<boolean> {
    const result = await db.delete(pricingTables).where(eq(pricingTables.productId, productId));
    return true; // Always return true since this is for cleanup before bulk upload
  }

  async calculateConfigurableProductPrice(productId: number, length: number, width: number): Promise<number | null> {
    // Convert input dimensions from feet to meters (1 foot = 0.3048 meters)
    const lengthInMeters = length * 0.3048;
    const widthInMeters = width * 0.3048;

    // Find the pricing band that contains the given dimensions
    const pricingTablesForProduct = await db
      .select()
      .from(pricingTables)
      .where(eq(pricingTables.productId, productId));

    if (pricingTablesForProduct.length === 0) {
      return null;
    }

    // Find band that contains the requested dimensions (using converted meter values)
    const matchingBand = pricingTablesForProduct.find(table => {
      const lengthMin = parseFloat(table.lengthMin);
      const lengthMax = parseFloat(table.lengthMax);
      const widthMin = parseFloat(table.widthMin);
      const widthMax = parseFloat(table.widthMax);
      
      return lengthInMeters >= lengthMin && lengthInMeters <= lengthMax && 
             widthInMeters >= widthMin && widthInMeters <= widthMax;
    });

    if (matchingBand) {
      return parseFloat(matchingBand.basePrice);
    }

    // If no exact band match, find the closest band (for dimensions slightly outside ranges)
    let closestTable = pricingTablesForProduct[0];
    let minDistance = Infinity;

    for (const table of pricingTablesForProduct) {
      // Calculate distance to band center
      const lengthCenter = (parseFloat(table.lengthMin) + parseFloat(table.lengthMax)) / 2;
      const widthCenter = (parseFloat(table.widthMin) + parseFloat(table.widthMax)) / 2;
      
      const lengthDiff = Math.abs(lengthCenter - lengthInMeters);
      const widthDiff = Math.abs(widthCenter - widthInMeters);
      const distance = Math.sqrt(lengthDiff * lengthDiff + widthDiff * widthDiff);

      if (distance < minDistance) {
        minDistance = distance;
        closestTable = table;
      }
    }

    return parseFloat(closestTable.basePrice);
  }

  // Product accessories methods
  async getProductAccessoriesByProductId(productId: number): Promise<(ProductAccessory & { accessory: Product })[]> {
    const accessoryLinks = await db
      .select({
        id: productAccessories.id,
        baseProductId: productAccessories.baseProductId,
        accessoryProductId: productAccessories.accessoryProductId,
        isRequired: productAccessories.isRequired,
        displayOrder: productAccessories.displayOrder,
        category: productAccessories.category,
        createdAt: productAccessories.createdAt,
        accessory: products,
      })
      .from(productAccessories)
      .leftJoin(products, eq(productAccessories.accessoryProductId, products.id))
      .where(eq(productAccessories.baseProductId, productId));

    return accessoryLinks as (ProductAccessory & { accessory: Product })[];
  }

  async createProductAccessory(insertAccessory: InsertProductAccessory): Promise<ProductAccessory> {
    const [accessory] = await db
      .insert(productAccessories)
      .values(insertAccessory)
      .returning();
    return accessory;
  }

  async updateProductAccessory(id: number, accessoryData: Partial<InsertProductAccessory>): Promise<ProductAccessory | undefined> {
    const [updated] = await db
      .update(productAccessories)
      .set(accessoryData)
      .where(eq(productAccessories.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteProductAccessory(id: number): Promise<boolean> {
    const result = await db.delete(productAccessories).where(eq(productAccessories.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Recalculate pricing tables when product discount changes
  async recalculatePricingTables(productId: number): Promise<{ updated: number }> {
    // Get product discount settings
    const product = await this.getProduct(productId);
    if (!product) {
      throw new Error("Product not found");
    }

    const discountType = product.defaultDiscountType;
    const discountValue = parseFloat(product.defaultDiscountValue);

    // Recalculate basePrice for all pricing tables for this product
    let updateSql;
    if (discountType === "percentage") {
      // For percentage discount: basePrice = retailPrice * (1 - discount/100)
      const multiplier = (100 - discountValue) / 100;
      updateSql = sql`
        UPDATE pricing_tables 
        SET base_price = ROUND(retail_price * ${multiplier}, 2)
        WHERE product_id = ${productId}
      `;
    } else {
      // For dollar discount: basePrice = retailPrice - discountValue
      updateSql = sql`
        UPDATE pricing_tables 
        SET base_price = ROUND(retail_price - ${discountValue}, 2)
        WHERE product_id = ${productId}
      `;
    }

    const result = await db.execute(updateSql);
    return { updated: result.rowCount || 0 };
  }

  // CRM Lead management methods
  async getAllLeads(): Promise<Lead[]> {
    return await db.select().from(leads).orderBy(desc(leads.createdAt));
  }

  async getLead(id: number): Promise<Lead | undefined> {
    const [lead] = await db.select().from(leads).where(eq(leads.id, id));
    return lead || undefined;
  }

  async getLeadsByStatus(status: string): Promise<Lead[]> {
    return await db.select().from(leads).where(eq(leads.status, status)).orderBy(desc(leads.createdAt));
  }

  async getLeadsByAssignedTo(userId: string): Promise<Lead[]> {
    return await db.select().from(leads).where(eq(leads.assignedTo, userId)).orderBy(desc(leads.createdAt));
  }

  async createLead(insertLead: InsertLead): Promise<Lead> {
    const [lead] = await db
      .insert(leads)
      .values(insertLead)
      .returning();
    return lead;
  }

  async updateLead(id: number, leadData: Partial<InsertLead>): Promise<Lead | undefined> {
    const [updated] = await db
      .update(leads)
      .set({ ...leadData, updatedAt: new Date() })
      .where(eq(leads.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteLead(id: number): Promise<boolean> {
    // Delete associated tasks and activities first
    await db.delete(tasks).where(eq(tasks.leadId, id));
    await db.delete(leadActivities).where(eq(leadActivities.leadId, id));
    
    // Then delete the lead
    const result = await db.delete(leads).where(eq(leads.id, id));
    return (result.rowCount || 0) > 0;
  }

  async convertLeadToCustomer(leadId: number): Promise<{ lead: Lead | undefined; customer: Customer | undefined }> {
    return await db.transaction(async (tx) => {
      // Get lead data within transaction
      const [lead] = await tx.select().from(leads).where(eq(leads.id, leadId));
      if (!lead) {
        return { lead: undefined, customer: undefined };
      }

      // Check if lead is already converted
      if (lead.customerId) {
        const [existingCustomer] = await tx.select().from(customers).where(eq(customers.id, lead.customerId));
        return { lead, customer: existingCustomer || undefined };
      }

      let customer: Customer;
      let wasExistingCustomer = false;

      // Implement get-or-create pattern with conflict handling
      if (lead.email) {
        try {
          // First try to find existing customer
          const [existingCustomer] = await tx.select().from(customers).where(eq(customers.email, lead.email));
          if (existingCustomer) {
            customer = existingCustomer;
            wasExistingCustomer = true;
            console.log(`✅ Using existing customer: ${customer.name} (ID: ${customer.id})`);
          } else {
            // Try to create new customer
            const customerData: InsertCustomer = {
              name: lead.name,
              email: lead.email,
              phone: lead.phone || "",
              company: lead.company || null,
            };
            [customer] = await tx.insert(customers).values(customerData).returning();
            console.log(`✅ Created new customer: ${customer.name} (ID: ${customer.id})`);
          }
        } catch (error: any) {
          // Handle unique constraint violation (race condition)
          if (error.code === '23505' && error.constraint === 'customers_email_unique') {
            // Another transaction created the customer, fetch it
            const [existingCustomer] = await tx.select().from(customers).where(eq(customers.email, lead.email));
            if (existingCustomer) {
              customer = existingCustomer;
              wasExistingCustomer = true;
              console.log(`✅ Using customer created by concurrent transaction: ${customer.name} (ID: ${customer.id})`);
            } else {
              throw new Error('Unique constraint violation but customer not found');
            }
          } else {
            throw error;
          }
        }
      } else {
        // No email provided, create customer without email
        const customerData: InsertCustomer = {
          name: lead.name,
          email: "",
          phone: lead.phone || "",
          company: lead.company || null,
        };
        [customer] = await tx.insert(customers).values(customerData).returning();
        console.log(`✅ Created new customer (no email): ${customer.name} (ID: ${customer.id})`);
      }

      // Update lead status and link to customer within transaction
      const [updatedLead] = await tx
        .update(leads)
        .set({
          status: "won",
          customerId: customer.id,
          updatedAt: new Date()
        })
        .where(eq(leads.id, leadId))
        .returning();

      // Create lead activity for conversion within transaction
      await tx.insert(leadActivities).values({
        leadId: leadId,
        activityType: "customer_converted",
        description: wasExistingCustomer ? 
          `Lead linked to existing customer: ${customer.name}` :
          `Lead converted to customer: ${customer.name}`,
        userId: lead.assignedTo || undefined,
        metadata: {
          customerId: customer.id,
          customerName: customer.name,
          wasExistingCustomer
        }
      });

      console.log(`✅ Successfully converted lead ${leadId} to customer ${customer.id}`);
      return { lead: updatedLead || undefined, customer };
    });
  }

  // CRM Task management methods
  async getAllTasks(): Promise<Task[]> {
    return await db.select().from(tasks).orderBy(desc(tasks.createdAt));
  }

  async getTask(id: number): Promise<Task | undefined> {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    return task || undefined;
  }

  async getTasksByLeadId(leadId: number): Promise<Task[]> {
    return await db.select().from(tasks).where(eq(tasks.leadId, leadId)).orderBy(desc(tasks.createdAt));
  }

  async getTasksByAssignedTo(userId: string): Promise<Task[]> {
    return await db.select().from(tasks).where(eq(tasks.assignedTo, userId)).orderBy(desc(tasks.createdAt));
  }

  async getOverdueTasks(): Promise<Task[]> {
    const now = new Date();
    return await db
      .select()
      .from(tasks)
      .where(
        and(
          lt(tasks.dueDate, now),
          eq(tasks.completed, false)
        )
      )
      .orderBy(tasks.dueDate);
  }

  async createTask(insertTask: InsertTask): Promise<Task> {
    // Convert dueDate string to Date if necessary
    const taskData = {
      ...insertTask,
      dueDate: insertTask.dueDate ? (typeof insertTask.dueDate === 'string' ? new Date(insertTask.dueDate) : insertTask.dueDate) : null
    };
    
    const [task] = await db
      .insert(tasks)
      .values(taskData)
      .returning();
    return task;
  }

  async updateTask(id: number, taskData: Partial<InsertTask>): Promise<Task | undefined> {
    // Convert and prepare data for database update
    const updateData: any = {};
    
    if (taskData.title !== undefined) updateData.title = taskData.title;
    if (taskData.leadId !== undefined) updateData.leadId = taskData.leadId;
    if (taskData.description !== undefined) updateData.description = taskData.description;
    if (taskData.completed !== undefined) updateData.completed = taskData.completed;
    if (taskData.priority !== undefined) updateData.priority = taskData.priority;
    if (taskData.assignedTo !== undefined) updateData.assignedTo = taskData.assignedTo;
    
    // Handle dueDate conversion properly
    if (taskData.dueDate !== undefined) {
      updateData.dueDate = taskData.dueDate ? (typeof taskData.dueDate === 'string' ? new Date(taskData.dueDate) : taskData.dueDate) : null;
    }
    
    const [updated] = await db
      .update(tasks)
      .set(updateData)
      .where(eq(tasks.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteTask(id: number): Promise<boolean> {
    const result = await db.delete(tasks).where(eq(tasks.id, id));
    return (result.rowCount || 0) > 0;
  }

  async completeTask(id: number): Promise<Task | undefined> {
    const [updated] = await db
      .update(tasks)
      .set({ 
        completed: true,
        completedAt: new Date()
      })
      .where(eq(tasks.id, id))
      .returning();
    return updated || undefined;
  }

  // CRM Lead Activity methods
  async getLeadActivities(leadId: number): Promise<LeadActivity[]> {
    return await db.select().from(leadActivities).where(eq(leadActivities.leadId, leadId)).orderBy(desc(leadActivities.createdAt));
  }

  async createLeadActivity(insertActivity: InsertLeadActivity): Promise<LeadActivity> {
    const [activity] = await db
      .insert(leadActivities)
      .values(insertActivity)
      .returning();
    return activity;
  }

  async getRecentActivities(limit: number = 50): Promise<LeadActivity[]> {
    return await db.select().from(leadActivities).orderBy(desc(leadActivities.createdAt)).limit(limit);
  }

  // Import leads from existing quotes
  async importLeadsFromQuotes(): Promise<{ imported: number; duplicates: number; errors: string[] }> {
    const errors: string[] = [];
    let imported = 0;
    let duplicates = 0;

    try {
      // Get all quotes with customer data
      const quotesWithCustomers = await db
        .select({
          quoteId: quotes.id,
          quoteNumber: quotes.quoteNumber,
          projectName: quotes.projectName,
          shipping: quotes.shipping,
          status: quotes.status,
          customerId: quotes.customerId,
          customerName: customers.name,
          customerEmail: customers.email,
          customerPhone: customers.phone,
          customerCompany: customers.company,
        })
        .from(quotes)
        .leftJoin(customers, eq(quotes.customerId, customers.id));

      // Get existing leads to check for duplicates
      const existingLeads = await db.select().from(leads);
      const existingEmails = new Set(existingLeads.map(lead => lead.email).filter(Boolean));

      for (const quote of quotesWithCustomers) {
        try {
          // Skip if lead already exists with this email
          if (quote.customerEmail && existingEmails.has(quote.customerEmail)) {
            duplicates++;
            continue;
          }

          // Map quote data to lead data
          const leadValue = quote.shipping ? parseFloat(quote.shipping.toString()) : null;
          const leadStatus = quote.status === 'draft' ? 'quoted' : 'new';
          
          // Create meaningful notes from project info
          const notes = [];
          if (quote.projectName) notes.push(`Project: ${quote.projectName}`);
          if (quote.quoteNumber) notes.push(`Quote #${quote.quoteNumber}`);
          notes.push('Imported from existing quote');
          
          const leadData: InsertLead = {
            name: quote.customerName || 'Unknown Customer',
            email: quote.customerEmail || undefined,
            phone: quote.customerPhone || undefined,
            company: quote.customerCompany || undefined,
            status: leadStatus,
            source: 'Website', // Default source for existing quotes
            value: leadValue?.toString() || null,
            notes: notes.join(' | '),
            customerId: quote.customerId,
          };

          await this.createLead(leadData);
          imported++;

        } catch (error) {
          console.error(`Error importing lead for quote ${quote.quoteId}:`, error);
          errors.push(`Failed to import quote ${quote.quoteNumber}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

    } catch (error) {
      console.error('Error in importLeadsFromQuotes:', error);
      errors.push(`Database error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return { imported, duplicates, errors };
  }

  // Comprehensive CRM Account methods
  async getAllAccounts(): Promise<Account[]> {
    return await db.select().from(accounts).orderBy(desc(accounts.createdAt));
  }

  async getAccount(id: number): Promise<Account | undefined> {
    const [account] = await db.select().from(accounts).where(eq(accounts.id, id));
    return account || undefined;
  }

  async getAccountByEmail(email: string): Promise<Account | undefined> {
    const [account] = await db.select().from(accounts).where(eq(accounts.email, email));
    return account || undefined;
  }

  async createAccount(insertAccount: InsertAccount): Promise<Account> {
    const [account] = await db
      .insert(accounts)
      .values(insertAccount)
      .returning();
    return account;
  }

  async updateAccount(id: number, accountData: Partial<InsertAccount>): Promise<Account | undefined> {
    const [updated] = await db
      .update(accounts)
      .set(accountData)
      .where(eq(accounts.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteAccount(id: number): Promise<boolean> {
    const result = await db.delete(accounts).where(eq(accounts.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Account Role methods
  async getAccountRoles(accountId: number): Promise<AccountRole[]> {
    return await db.select().from(accountRoles).where(eq(accountRoles.accountId, accountId)).orderBy(accountRoles.role);
  }

  async addAccountRole(role: InsertAccountRole): Promise<AccountRole> {
    const [accountRole] = await db
      .insert(accountRoles)
      .values(role)
      .returning();
    return accountRole;
  }

  async removeAccountRole(accountId: number, role: string): Promise<boolean> {
    const result = await db
      .delete(accountRoles)
      .where(and(
        eq(accountRoles.accountId, accountId),
        eq(accountRoles.role, role)
      ));
    return (result.rowCount || 0) > 0;
  }

  // Contact methods
  async getAllContacts(): Promise<Contact[]> {
    return await db.select().from(contacts).orderBy(desc(contacts.createdAt));
  }

  async getContact(id: number): Promise<Contact | undefined> {
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, id));
    return contact || undefined;
  }

  async getContactsByAccountId(accountId: number): Promise<Contact[]> {
    return await db.select().from(contacts).where(eq(contacts.accountId, accountId)).orderBy(contacts.firstName, contacts.lastName);
  }

  async createContact(insertContact: InsertContact): Promise<Contact> {
    const [contact] = await db
      .insert(contacts)
      .values(insertContact)
      .returning();
    return contact;
  }

  async updateContact(id: number, contactData: Partial<InsertContact>): Promise<Contact | undefined> {
    const [updated] = await db
      .update(contacts)
      .set(contactData)
      .where(eq(contacts.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteContact(id: number): Promise<boolean> {
    const result = await db.delete(contacts).where(eq(contacts.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Contact Role methods
  async getContactRoles(contactId: number): Promise<ContactRole[]> {
    return await db.select().from(contactRoles).where(eq(contactRoles.contactId, contactId)).orderBy(contactRoles.role);
  }

  async addContactRole(role: InsertContactRole): Promise<ContactRole> {
    const [contactRole] = await db
      .insert(contactRoles)
      .values(role)
      .returning();
    return contactRole;
  }

  async removeContactRole(contactId: number, role: string): Promise<boolean> {
    const result = await db
      .delete(contactRoles)
      .where(and(
        eq(contactRoles.contactId, contactId),
        eq(contactRoles.role, role)
      ));
    return (result.rowCount || 0) > 0;
  }

  // Opportunity methods
  async getAllOpportunities(): Promise<Opportunity[]> {
    return await db.select().from(opportunities).orderBy(desc(opportunities.createdAt));
  }

  async getOpportunity(id: number): Promise<Opportunity | undefined> {
    const [opportunity] = await db.select().from(opportunities).where(eq(opportunities.id, id));
    return opportunity || undefined;
  }

  async getOpportunitiesByAccountId(accountId: number): Promise<Opportunity[]> {
    return await db.select().from(opportunities).where(eq(opportunities.accountId, accountId)).orderBy(desc(opportunities.createdAt));
  }

  async createOpportunity(insertOpportunity: InsertOpportunity): Promise<Opportunity> {
    // Convert expectedCloseDate string to Date if necessary
    const opportunityData = {
      ...insertOpportunity,
      expectedCloseDate: insertOpportunity.expectedCloseDate ? 
        (typeof insertOpportunity.expectedCloseDate === 'string' ? new Date(insertOpportunity.expectedCloseDate) : insertOpportunity.expectedCloseDate) : null
    };
    
    const [opportunity] = await db
      .insert(opportunities)
      .values(opportunityData)
      .returning();
    return opportunity;
  }

  async updateOpportunity(id: number, opportunityData: Partial<InsertOpportunity>): Promise<Opportunity | undefined> {
    // Prepare update data with proper type conversion
    const updateData: any = {};
    
    if (opportunityData.accountId !== undefined) updateData.accountId = opportunityData.accountId;
    if (opportunityData.primaryContactId !== undefined) updateData.primaryContactId = opportunityData.primaryContactId;
    if (opportunityData.name !== undefined) updateData.name = opportunityData.name;
    if (opportunityData.stage !== undefined) updateData.stage = opportunityData.stage;
    if (opportunityData.amount !== undefined) updateData.amount = opportunityData.amount;
    if (opportunityData.source !== undefined) updateData.source = opportunityData.source;
    if (opportunityData.assignedTo !== undefined) updateData.assignedTo = opportunityData.assignedTo;
    if (opportunityData.notes !== undefined) updateData.notes = opportunityData.notes;
    
    // Handle expectedCloseDate conversion properly
    if (opportunityData.expectedCloseDate !== undefined) {
      updateData.expectedCloseDate = opportunityData.expectedCloseDate ? 
        (typeof opportunityData.expectedCloseDate === 'string' ? new Date(opportunityData.expectedCloseDate) : opportunityData.expectedCloseDate) : null;
    }
    
    const [updated] = await db
      .update(opportunities)
      .set(updateData)
      .where(eq(opportunities.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteOpportunity(id: number): Promise<boolean> {
    const result = await db.delete(opportunities).where(eq(opportunities.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Activity methods
  async getActivitiesByEntity(entityType: string, entityId: number): Promise<Activity[]> {
    return await db
      .select()
      .from(activities)
      .where(and(
        eq(activities.entityType, entityType),
        eq(activities.entityId, entityId)
      ))
      .orderBy(desc(activities.createdAt));
  }

  async createActivity(insertActivity: InsertActivity): Promise<Activity> {
    // Convert date fields to Date objects if necessary
    const activityData = {
      ...insertActivity,
      dueAt: insertActivity.dueAt ? 
        (typeof insertActivity.dueAt === 'string' ? new Date(insertActivity.dueAt) : insertActivity.dueAt) : null,
      completedAt: insertActivity.completedAt ? 
        (typeof insertActivity.completedAt === 'string' ? new Date(insertActivity.completedAt) : insertActivity.completedAt) : null
    };
    
    const [activity] = await db
      .insert(activities)
      .values(activityData)
      .returning();
    return activity;
  }

  async updateActivity(id: number, activityData: Partial<InsertActivity>): Promise<Activity | undefined> {
    // Prepare update data with proper type conversion
    const updateData: any = {};
    
    if (activityData.entityType !== undefined) updateData.entityType = activityData.entityType;
    if (activityData.entityId !== undefined) updateData.entityId = activityData.entityId;
    if (activityData.type !== undefined) updateData.type = activityData.type;
    if (activityData.summary !== undefined) updateData.summary = activityData.summary;
    if (activityData.description !== undefined) updateData.description = activityData.description;
    if (activityData.assignedTo !== undefined) updateData.assignedTo = activityData.assignedTo;
    
    // Handle date field conversions properly
    if (activityData.dueAt !== undefined) {
      updateData.dueAt = activityData.dueAt ? 
        (typeof activityData.dueAt === 'string' ? new Date(activityData.dueAt) : activityData.dueAt) : null;
    }
    if (activityData.completedAt !== undefined) {
      updateData.completedAt = activityData.completedAt ? 
        (typeof activityData.completedAt === 'string' ? new Date(activityData.completedAt) : activityData.completedAt) : null;
    }
    
    const [updated] = await db
      .update(activities)
      .set(updateData)
      .where(eq(activities.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteActivity(id: number): Promise<boolean> {
    const result = await db.delete(activities).where(eq(activities.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Data Migration methods implementation
  async getMigrationStatus(): Promise<{
    customersNeedMigration: number;
    quotesNeedMigration: number;
    totalAccounts: number;
    totalContacts: number;
    totalOpportunities: number;
  }> {
    // Get counts of existing customers that don't have corresponding accounts
    const allCustomers = await db.select().from(customers);
    const allAccounts = await db.select().from(accounts);
    const allContacts = await db.select().from(contacts);
    const allOpportunities = await db.select().from(opportunities);
    
    // Get quotes that don't have corresponding opportunities
    const quotesWithoutOpportunities = await db
      .select()
      .from(quotes)
      .where(sql`${quotes.opportunityId} IS NULL`);

    return {
      customersNeedMigration: allCustomers.length,
      quotesNeedMigration: quotesWithoutOpportunities.length,
      totalAccounts: allAccounts.length,
      totalContacts: allContacts.length,
      totalOpportunities: allOpportunities.length,
    };
  }

  async migrateCustomersToAccountsAndContacts(): Promise<{ 
    success: boolean; 
    migratedCustomers: number; 
    createdAccounts: number; 
    createdContacts: number; 
    errors: string[] 
  }> {
    const errors: string[] = [];
    let migratedCustomers = 0;
    let createdAccounts = 0;
    let createdContacts = 0;

    try {
      const allCustomers = await db.select().from(customers);
      
      console.log(`🔄 Starting migration of ${allCustomers.length} customers...`);

      for (const customer of allCustomers) {
        try {
          // Determine account type and name
          const hasCompany = customer.company && customer.company.trim() !== '';
          const accountType = hasCompany ? 'company' : 'individual';
          const accountName = hasCompany ? customer.company! : customer.name;

          // Create account
          const accountData: InsertAccount = {
            name: accountName,
            type: accountType,
            email: customer.email,
            phone: customer.phone,
            billingAddress: null, // Customer schema doesn't have address
            shippingAddress: null,
            tags: null
          };

          const [newAccount] = await db
            .insert(accounts)
            .values(accountData)
            .returning();
          
          createdAccounts++;

          // Add client role to account
          await db.insert(accountRoles).values({
            accountId: newAccount.id,
            role: 'client'
          });

          // Create contact - parse first/last name from customer name
          const nameParts = customer.name.trim().split(' ');
          const firstName = nameParts[0] || customer.name;
          const lastName = nameParts.slice(1).join(' ') || '';

          const contactData: InsertContact = {
            accountId: newAccount.id,
            firstName: firstName,
            lastName: lastName,
            email: customer.email,
            phone: customer.phone,
            title: null // Customer schema doesn't have title
          };

          const [newContact] = await db
            .insert(contacts)
            .values(contactData)
            .returning();
          
          createdContacts++;

          // Add client role to contact
          await db.insert(contactRoles).values({
            contactId: newContact.id,
            role: 'client'
          });

          migratedCustomers++;
          console.log(`✅ Migrated customer ${customer.id}: ${customer.name} → Account ${newAccount.id} + Contact ${newContact.id}`);

        } catch (error) {
          const errorMsg = `Failed to migrate customer ${customer.id} (${customer.name}): ${error}`;
          console.error(`❌ ${errorMsg}`);
          errors.push(errorMsg);
        }
      }

      const success = errors.length === 0;
      console.log(`🎯 Customer migration completed: ${migratedCustomers}/${allCustomers.length} migrated`);
      
      return {
        success,
        migratedCustomers,
        createdAccounts,
        createdContacts,
        errors
      };

    } catch (error) {
      const errorMsg = `Critical error during customer migration: ${error}`;
      console.error(`💥 ${errorMsg}`);
      errors.push(errorMsg);
      
      return {
        success: false,
        migratedCustomers,
        createdAccounts,
        createdContacts,
        errors
      };
    }
  }

  async migrateQuotesToOpportunities(): Promise<{ 
    success: boolean; 
    migratedQuotes: number; 
    createdOpportunities: number; 
    errors: string[] 
  }> {
    const errors: string[] = [];
    let migratedQuotes = 0;
    let createdOpportunities = 0;

    try {
      // Get quotes that don't have corresponding opportunities
      const quotesToMigrate = await db
        .select()
        .from(quotes)
        .where(sql`${quotes.opportunityId} IS NULL`);
      
      console.log(`🔄 Starting migration of ${quotesToMigrate.length} quotes to opportunities...`);

      for (const quote of quotesToMigrate) {
        try {
          // Find the corresponding customer for this quote
          const [customer] = await db
            .select()
            .from(customers)
            .where(eq(customers.id, quote.customerId));

          if (!customer) {
            const errorMsg = `Cannot find customer ${quote.customerId} for quote ${quote.id}`;
            console.error(`❌ ${errorMsg}`);
            errors.push(errorMsg);
            continue;
          }

          // Find the corresponding account for this customer
          // We'll match by name and email since customers were migrated first
          let matchingAccount = await db
            .select()
            .from(accounts)
            .where(eq(accounts.email, customer.email));

          if (matchingAccount.length === 0) {
            // Try to find by name if email doesn't match
            matchingAccount = await db
              .select()
              .from(accounts)
              .where(sql`LOWER(${accounts.name}) = LOWER(${customer.name}) OR LOWER(${accounts.name}) = LOWER(${customer.company})`);
          }

          if (matchingAccount.length === 0) {
            const errorMsg = `Cannot find matching account for customer ${customer.name} (${customer.email})`;
            console.error(`❌ ${errorMsg}`);
            errors.push(errorMsg);
            continue;
          }

          const account = matchingAccount[0];

          // Find primary contact for this account
          const [primaryContact] = await db
            .select()
            .from(contacts)
            .where(eq(contacts.accountId, account.id))
            .limit(1);

          // Map quote status to opportunity stage
          const getOpportunityStage = (quoteStatus: string) => {
            switch (quoteStatus) {
              case 'draft': return 'estimating';
              case 'sent': return 'proposal_sent';
              case 'approved': return 'contract_signed';
              case 'rejected': return 'closed_lost';
              default: return 'inquiry';
            }
          };

          // Calculate quote total for opportunity amount
          const quoteLineItems = await db
            .select()
            .from(lineItems)
            .where(eq(lineItems.quoteId, quote.id));

          let totalAmount = 0;
          for (const item of quoteLineItems) {
            const quantity = parseFloat(item.quantity);
            const unitPrice = parseFloat(item.unitPrice);
            const markupValue = parseFloat(item.markupValue || '0');
            const discountValue = parseFloat(item.discountValue || '0');

            let itemTotal = quantity * unitPrice;
            
            // Apply markup
            if (item.markupType === 'percentage') {
              itemTotal = itemTotal * (1 + markupValue / 100);
            } else {
              itemTotal = itemTotal + markupValue;
            }
            
            // Apply discount
            if (item.discountType === 'percentage') {
              itemTotal = itemTotal * (1 - discountValue / 100);
            } else {
              itemTotal = itemTotal - discountValue;
            }
            
            totalAmount += itemTotal;
          }

          // Add tax and shipping
          const taxRate = parseFloat(quote.taxRate || '0');
          const shipping = parseFloat(quote.shipping || '0');
          totalAmount = totalAmount * (1 + taxRate / 100) + shipping;

          // Create opportunity
          const opportunityData: InsertOpportunity = {
            accountId: account.id,
            primaryContactId: primaryContact?.id || null,
            name: quote.projectName || `Quote ${quote.quoteNumber}`,
            stage: getOpportunityStage(quote.status),
            amount: totalAmount.toFixed(2),
            expectedCloseDate: quote.estimatedStartDate ? 
              (typeof quote.estimatedStartDate === 'string' ? new Date(quote.estimatedStartDate) : quote.estimatedStartDate) : null,
            source: 'existing_quote',
            assignedTo: null, // Could be mapped if user assignment exists
            notes: quote.notes || null
          };

          const [newOpportunity] = await db
            .insert(opportunities)
            .values(opportunityData)
            .returning();
          
          createdOpportunities++;

          // Update quote to link to opportunity
          await db
            .update(quotes)
            .set({ opportunityId: newOpportunity.id })
            .where(eq(quotes.id, quote.id));

          // Create activity for quote creation
          await db.insert(activities).values({
            entityType: 'opportunity',
            entityId: newOpportunity.id,
            type: 'quote_sent',
            summary: `Quote ${quote.quoteNumber} created`,
            description: `Quote ${quote.quoteNumber} migrated from existing system. Project: ${quote.projectName || 'N/A'}`,
            dueAt: null,
            completedAt: quote.createdAt || new Date(),
            assignedTo: null
          });

          migratedQuotes++;
          console.log(`✅ Migrated quote ${quote.id}: ${quote.quoteNumber} → Opportunity ${newOpportunity.id}`);

        } catch (error) {
          const errorMsg = `Failed to migrate quote ${quote.id} (${quote.quoteNumber}): ${error}`;
          console.error(`❌ ${errorMsg}`);
          errors.push(errorMsg);
        }
      }

      const success = errors.length === 0;
      console.log(`🎯 Quote migration completed: ${migratedQuotes}/${quotesToMigrate.length} migrated`);
      
      return {
        success,
        migratedQuotes,
        createdOpportunities,
        errors
      };

    } catch (error) {
      const errorMsg = `Critical error during quote migration: ${error}`;
      console.error(`💥 ${errorMsg}`);
      errors.push(errorMsg);
      
      return {
        success: false,
        migratedQuotes,
        createdOpportunities,
        errors
      };
    }
  }
}

export const storage = new DatabaseStorage();
