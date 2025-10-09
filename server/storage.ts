import { accounts, customers, contacts, quotes, lineItems, groups, products, users, apiKeys, contractTemplates, pricingTables, productAccessories, quoteCoverPhotos, quoteProductRenderings, issueReports, type Account, type Customer, type Contact, type Quote, type LineItem, type Group, type Product, type User, type ApiKey, type ContractTemplate, type PricingTable, type ProductAccessory, type QuoteCoverPhoto, type QuoteProductRendering, type IssueReport, type InsertAccount, type InsertCustomer, type InsertContact, type InsertQuote, type InsertLineItem, type InsertGroup, type InsertProduct, type InsertUser, type InsertApiKey, type InsertContractTemplate, type InsertPricingTable, type InsertProductAccessory, type InsertQuoteCoverPhoto, type InsertQuoteProductRendering, type InsertIssueReport, type QuoteWithDetails, type ProductWithDetails } from "@shared/schema";
import { db } from "./db";
import { eq, desc, asc, inArray, sql, and, ne, or, ilike } from "drizzle-orm";
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

// Utility function to normalize phone numbers for comparison
export function normalizePhoneNumber(phone: string): string {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');
  
  // If starts with 1 and is 11 digits (US/Canada), remove the leading 1
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.substring(1);
  }
  
  // Return last 10 digits if longer than 10 (handles international codes)
  if (digits.length > 10) {
    return digits.slice(-10);
  }
  
  return digits;
}

// Utility to normalize email for comparison
export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

export interface IStorage {
  // Account methods (formerly customer methods)
  getAccount(id: number): Promise<Account | undefined>;
  getAccountByEmail(email: string): Promise<Account | undefined>;
  findDuplicateAccount(account: InsertAccount): Promise<Account | undefined>;
  searchAccounts(searchTerm: string): Promise<Account[]>;
  getAllAccounts(): Promise<Account[]>;
  getAccountWithDetails(id: number): Promise<any>;
  deleteAccount(id: number): Promise<boolean>;
  createAccount(account: InsertAccount, options?: { allowDuplicate?: boolean; updateIfExists?: boolean; createPrimaryContact?: boolean }): Promise<Account>;
  updateAccount(id: number, account: Partial<InsertAccount>): Promise<Account | undefined>;
  
  // Legacy customer methods (backward compatibility)
  getCustomer(id: number): Promise<Customer | undefined>;
  getCustomerByEmail(email: string): Promise<Customer | undefined>;
  findDuplicateCustomer(customer: InsertCustomer): Promise<Customer | undefined>;
  searchCustomers(searchTerm: string): Promise<Customer[]>;
  createCustomer(customer: InsertCustomer, options?: { allowDuplicate?: boolean; updateIfExists?: boolean; createPrimaryContact?: boolean }): Promise<Customer>;
  updateCustomer(id: number, customer: Partial<InsertCustomer>): Promise<Customer | undefined>;
  
  // Contact methods
  getContact(id: number): Promise<Contact | undefined>;
  getContactsByAccountId(accountId: number): Promise<Contact[]>;
  createContact(contact: InsertContact): Promise<Contact>;
  updateContact(id: number, contact: Partial<InsertContact>): Promise<Contact | undefined>;
  deleteContact(id: number): Promise<boolean>;
  getPrimaryContact(accountId: number): Promise<Contact | undefined>;

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
  getLineItem(id: number): Promise<LineItem | undefined>;
  getLineItemsByQuoteId(quoteId: number): Promise<LineItem[]>;
  createLineItem(lineItem: InsertLineItem): Promise<LineItem>;
  updateLineItem(id: number, lineItem: Partial<InsertLineItem>): Promise<LineItem | undefined>;
  deleteLineItem(id: number): Promise<boolean>;
  deleteLineItemsByQuoteId(quoteId: number): Promise<boolean>;
  bulkDeleteLineItems(ids: number[]): Promise<number>;
  bulkUpdateLineItems(ids: number[], updates: Partial<InsertLineItem>): Promise<number>;
  reorderLineItems(quoteId: number, moves: Array<{id: number; groupId: string | null; position: number}>): Promise<void>;

  // Group methods
  getGroup(id: string): Promise<Group | undefined>;
  getGroupsByQuoteId(quoteId: number): Promise<Group[]>;
  createGroup(group: InsertGroup): Promise<Group>;
  updateGroup(id: string, group: Partial<InsertGroup>): Promise<Group | undefined>;
  deleteGroup(id: string): Promise<boolean>;
  deleteGroupsByQuoteId(quoteId: number): Promise<boolean>;
  reorderGroups(quoteId: number, positions: Array<{id: string; position: number}>): Promise<void>;

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


  
  
  // Session store for authentication
  sessionStore: any;

  // Quote image methods
  getQuoteCoverPhoto(quoteId: number): Promise<QuoteCoverPhoto | undefined>;
  getQuoteProductRenderings(quoteId: number): Promise<QuoteProductRendering[]>;
  createQuoteCoverPhoto(photo: InsertQuoteCoverPhoto): Promise<QuoteCoverPhoto>;
  createQuoteProductRendering(rendering: InsertQuoteProductRendering): Promise<QuoteProductRendering>;
  updateQuoteCoverPhoto(id: number, photo: Partial<InsertQuoteCoverPhoto>): Promise<QuoteCoverPhoto | undefined>;
  updateQuoteProductRendering(id: number, rendering: Partial<InsertQuoteProductRendering>): Promise<QuoteProductRendering | undefined>;
  deleteQuoteCoverPhoto(id: number): Promise<boolean>;
  deleteQuoteProductRendering(id: number): Promise<boolean>;
  deleteQuoteImagesByQuoteId(quoteId: number): Promise<boolean>;

  // Issue report methods
  createIssueReport(issueReport: InsertIssueReport): Promise<IssueReport>;
  getIssueReport(id: number): Promise<IssueReport | undefined>;
  getAllIssueReports(): Promise<IssueReport[]>;
  updateIssueReport(id: number, issueReport: Partial<InsertIssueReport>): Promise<IssueReport | undefined>;
  deleteIssueReport(id: number): Promise<boolean>;

  // Authorization methods for security
  validateLineItemsOwnership(lineItemIds: number[], userId: any): Promise<{ isValid: boolean; quoteId?: number }>;
  validateQuoteOwnership(quoteId: number, userId: any): Promise<boolean>;

  // API key methods for app-to-app authentication
  createApiKey(apiKey: { name: string; keyHash: string }): Promise<any>;
  getApiKeyByHash(keyHash: string): Promise<any | undefined>;
  updateApiKeyLastUsed(id: number): Promise<void>;
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

  async createCustomer(insertCustomer: InsertCustomer, options?: { allowDuplicate?: boolean; updateIfExists?: boolean; createPrimaryContact?: boolean }): Promise<Customer> {
    const id = this.currentCustomerId++;
    const customer: Customer = { 
      ...insertCustomer, 
      id,
      accountType: insertCustomer.accountType || "homeowner",
      company: insertCustomer.company || null,
      paymentTerms: insertCustomer.paymentTerms || null,
      billingAddress: insertCustomer.billingAddress || null,
      firstName: insertCustomer.firstName || null,
      lastName: insertCustomer.lastName || null,
      secondaryContacts: insertCustomer.secondaryContacts || null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.customers.set(id, customer);
    
    // Note: MemStorage doesn't implement contact creation, this is for interface compatibility
    if (options?.createPrimaryContact) {
      console.log(`MemStorage: Would create primary contact for customer ${id} if contact storage was implemented`);
    }
    
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

    const accountIdToUse = quote.accountId;
    if (!accountIdToUse) return undefined;
    const customer = this.customers.get(accountIdToUse);
    if (!customer) return undefined;

    const quoteLineItems = Array.from(this.lineItems.values()).filter(item => item.quoteId === id);

    return {
      ...quote,
      account: customer, // Use customer as account for QuoteWithDetails
      customer, // Legacy alias for backward compatibility
      lineItems: quoteLineItems,
    };
  }

  async getAllQuotes(): Promise<QuoteWithDetails[]> {
    const result: QuoteWithDetails[] = [];
    
    for (const quote of Array.from(this.quotes.values())) {
      const accountIdToUse = quote.accountId;
      let customer = null;
      
      // Get customer if accountId exists
      if (accountIdToUse) {
        customer = this.customers.get(accountIdToUse) || null;
      }
      
      // Include quote even if no customer (for unassigned quotes)
      const quoteLineItems = Array.from(this.lineItems.values()).filter(item => item.quoteId === quote.id);
      result.push({
        ...quote,
        account: customer || undefined, // Use customer as account for QuoteWithDetails
        customer: customer || undefined, // Legacy alias for backward compatibility
        lineItems: quoteLineItems,
      });
    }

    return result.sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }

  async createQuote(insertQuote: InsertQuote): Promise<Quote> {
    const id = this.currentQuoteId++;
    const quote: Quote = { 
      ...insertQuote,
      id,
      accountId: insertQuote.accountId || null, // Keep accountId as is
      contactId: insertQuote.contactId || null, // Handle optional contactId
      dealStage: insertQuote.dealStage || "new_lead",
      projectName: insertQuote.projectName || null,
      projectAddress: insertQuote.projectAddress || null,
      jobsiteAddress: insertQuote.jobsiteAddress || null,
      estimatedStartDate: insertQuote.estimatedStartDate || null,
      notes: insertQuote.notes || null,
      taxRate: insertQuote.taxRate || "0",
      discount: insertQuote.discount || "0",
      shipping: insertQuote.shipping || "0",
      lostReason: insertQuote.lostReason || null,
      contractTemplateId: insertQuote.contractTemplateId || null,
      customContractTerms: insertQuote.customContractTerms || null,
      createdAt: new Date(),
      updatedAt: new Date()
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
  async getLineItem(id: number): Promise<LineItem | undefined> {
    return this.lineItems.get(id);
  }

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
      isTaxable: insertLineItem.isTaxable ?? true,
      discountType: insertLineItem.discountType || "percentage",
      discountValue: insertLineItem.discountValue || "0",
      groupId: insertLineItem.groupId ?? null,
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
      ttl: 7 * 24 * 60 * 60, // 7 days in seconds
      pruneSessionInterval: 60 * 60, // prune expired sessions every hour
      errorLog: () => {}, // Suppress session error logs in production
    });
  }
  // Account methods
  async getAccount(id: number): Promise<Account | undefined> {
    const [account] = await db.select().from(accounts).where(eq(accounts.id, id));
    return account || undefined;
  }

  // Legacy method for backward compatibility
  async getCustomer(id: number): Promise<Customer | undefined> {
    return this.getAccount(id);
  }

  async getAccountByEmail(email: string): Promise<Account | undefined> {
    const normalizedEmail = normalizeEmail(email);
    const [account] = await db.select().from(accounts).where(eq(sql`LOWER(${accounts.email})`, normalizedEmail));
    return account || undefined;
  }

  // Legacy method for backward compatibility
  async getCustomerByEmail(email: string): Promise<Customer | undefined> {
    return this.getAccountByEmail(email);
  }

  async findDuplicateAccount(account: InsertAccount): Promise<Account | undefined> {
    // Normalize the input data
    const normalizedEmail = normalizeEmail(account.email);
    const normalizedPhone = normalizePhoneNumber(account.phone);
    
    // Build conditions for duplicate detection
    const conditions = [];
    
    // Check for email match (case-insensitive)
    conditions.push(eq(sql`LOWER(${accounts.email})`, normalizedEmail));
    
    // Check for phone match (after normalization)
    // We need to compare normalized versions of the stored phone numbers
    const phonePattern = `%${normalizedPhone}%`;
    conditions.push(sql`REPLACE(REPLACE(REPLACE(REPLACE(${accounts.phone}, '-', ''), '(', ''), ')', ''), ' ', '') LIKE ${phonePattern}`);
    
    // For business accounts, also check name + company combination
    if (account.company) {
      conditions.push(
        and(
          eq(sql`LOWER(${accounts.name})`, account.name.toLowerCase()),
          eq(sql`LOWER(${accounts.company})`, account.company.toLowerCase())
        )
      );
    }
    
    // Query for any matching accounts
    const duplicates = await db
      .select()
      .from(accounts)
      .where(or(...conditions))
      .limit(1);
    
    return duplicates[0] || undefined;
  }

  // Legacy method for backward compatibility
  async findDuplicateCustomer(customer: InsertCustomer): Promise<Customer | undefined> {
    return this.findDuplicateAccount(customer as InsertAccount);
  }

  async searchAccounts(searchTerm: string): Promise<Account[]> {
    if (!searchTerm || searchTerm.trim().length === 0) {
      return [];
    }
    
    try {
      const term = searchTerm.trim().toLowerCase();
      console.log(`Searching for: "${term}"`);
      
      // Simple search across account fields first
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
      
      console.log(`Account results: ${accountResults.length}`);
      
      // Search through contacts and return their associated accounts
      const contactResults = await db
        .select({
          id: accounts.id,
          name: accounts.name,
          email: accounts.email,
          phone: accounts.phone,
          company: accounts.company,
          accountType: accounts.accountType,
          paymentTerms: accounts.paymentTerms,
          billingAddress: accounts.billingAddress,
          firstName: accounts.firstName,
          lastName: accounts.lastName,
          secondaryContacts: accounts.secondaryContacts,
          createdAt: accounts.createdAt,
          updatedAt: accounts.updatedAt,
        })
        .from(contacts)
        .innerJoin(accounts, eq(contacts.accountId, accounts.id))
        .where(
          or(
            ilike(contacts.firstName, `%${term}%`),
            ilike(contacts.lastName, `%${term}%`),
            ilike(contacts.email, `%${term}%`)
          )
        )
        .limit(10);
      
      console.log(`Contact results: ${contactResults.length}`);
      
      // Combine results and remove duplicates by account ID
      const allResults = [...accountResults, ...contactResults];
      const uniqueResults = allResults.filter((account, index, self) => 
        index === self.findIndex(a => a.id === account.id)
      );
      
      console.log(`Total unique results: ${uniqueResults.length}`);
      
      // Limit to 10 total results
      return uniqueResults.slice(0, 10);
    } catch (error) {
      console.error("Search error:", error);
      throw error;
    }
  }

  // Legacy method for backward compatibility
  async searchCustomers(searchTerm: string): Promise<Customer[]> {
    return this.searchAccounts(searchTerm);
  }

  async createAccount(insertAccount: InsertAccount, options?: { allowDuplicate?: boolean; updateIfExists?: boolean; createPrimaryContact?: boolean }): Promise<Account> {
    // Set default options
    const { allowDuplicate = false, updateIfExists = true, createPrimaryContact = true } = options || {};
    
    // Check for duplicates unless explicitly allowed
    if (!allowDuplicate) {
      const duplicate = await this.findDuplicateAccount(insertAccount);
      
      if (duplicate) {
        if (updateIfExists) {
          // Update the existing account with new information (merge)
          const updated = await this.updateAccount(duplicate.id, {
            // Only update fields that have values in the new data
            ...(insertAccount.name && { name: insertAccount.name }),
            ...(insertAccount.email && { email: insertAccount.email }),
            ...(insertAccount.phone && { phone: insertAccount.phone }),
            ...(insertAccount.company !== undefined && { company: insertAccount.company }),
            ...(insertAccount.accountType && { accountType: insertAccount.accountType }),
            ...(insertAccount.paymentTerms !== undefined && { paymentTerms: insertAccount.paymentTerms }),
            ...(insertAccount.billingAddress !== undefined && { billingAddress: insertAccount.billingAddress }),
          });
          
          console.log(`Updated existing account ${duplicate.id} instead of creating duplicate`);
          return updated || duplicate;
        } else {
          // Return the existing account without updating
          console.log(`Found existing account ${duplicate.id}, returning without update`);
          return duplicate;
        }
      }
    }
    
    // No duplicate found or duplicates allowed, create new account
    // Use transaction to create account and optionally primary contact atomically
    const result = await db.transaction(async (tx) => {
      const [account] = await tx
        .insert(accounts)
        .values(insertAccount)
        .returning();
      
      // Create primary contact if requested (default true)
      if (createPrimaryContact) {
        // Extract first and last name from account name
        const nameParts = insertAccount.name.trim().split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
        
        const primaryContact = {
          accountId: account.id,
          firstName,
          lastName: lastName || firstName, // If no last name, use first name
          email: insertAccount.email,
          phone: insertAccount.phone || null,
          role: 'primary_contact',
          isPrimary: true
        };
        
        await tx.insert(contacts).values(primaryContact);
        console.log(`Created primary contact for account ${account.id}`);
      }
      
      return account;
    });
    
    console.log(`Created new account ${result.id}`);
    return result;
  }

  // Legacy method for backward compatibility
  async createCustomer(insertCustomer: InsertCustomer, options?: { allowDuplicate?: boolean; updateIfExists?: boolean; createPrimaryContact?: boolean }): Promise<Customer> {
    return this.createAccount(insertCustomer as InsertAccount, options);
  }

  async updateAccount(id: number, accountData: Partial<InsertAccount>): Promise<Account | undefined> {
    const [updated] = await db
      .update(accounts)
      .set({...accountData, updatedAt: new Date()}) 
      .where(eq(accounts.id, id))
      .returning();
    return updated || undefined;
  }

  async getAllAccounts(): Promise<Account[]> {
    // Use a single efficient query with proper correlated subqueries
    const allAccountsWithCounts = await db.select({
      id: accounts.id,
      name: accounts.name,
      email: accounts.email,
      phone: accounts.phone,
      company: accounts.company,
      accountType: accounts.accountType,
      paymentTerms: accounts.paymentTerms,
      billingAddress: accounts.billingAddress,
      firstName: accounts.firstName,
      lastName: accounts.lastName,
      secondaryContacts: accounts.secondaryContacts,
      createdAt: accounts.createdAt,
      updatedAt: accounts.updatedAt,
      contactCount: sql<number>`
        (SELECT COUNT(*)::int 
         FROM contacts
         WHERE contacts.account_id = accounts.id)
      `,
      projectCount: sql<number>`
        (SELECT COUNT(*)::int
         FROM quotes
         WHERE quotes.account_id = accounts.id)
      `
    })
    .from(accounts)
    .orderBy(desc(accounts.createdAt));
    
    return allAccountsWithCounts;
  }

  async getAccountWithDetails(id: number): Promise<any> {
    const [account] = await db.select().from(accounts).where(eq(accounts.id, id));
    if (!account) return undefined;

    // Get all contacts for this account
    const accountContacts = await db.select().from(contacts)
      .where(eq(contacts.accountId, id))
      .orderBy(desc(contacts.isPrimary), contacts.firstName);

    // Get all quotes/projects for this account
    const accountQuotes = await db.select().from(quotes)
      .where(eq(quotes.accountId, id))
      .orderBy(desc(quotes.createdAt));

    return {
      ...account,
      contacts: accountContacts,
      quotes: accountQuotes,
      projectCount: accountQuotes.length,
      contactCount: accountContacts.length
    };
  }

  async deleteAccount(id: number): Promise<boolean> {
    // Check if account has quotes - prevent deletion if it has quotes
    const accountQuotes = await db.select().from(quotes).where(eq(quotes.accountId, id));
    if (accountQuotes.length > 0) {
      throw new Error("Cannot delete account with existing quotes");
    }
    
    // Delete contacts first
    await db.delete(contacts).where(eq(contacts.accountId, id));
    
    // Then delete the account
    const result = await db.delete(accounts).where(eq(accounts.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Legacy method for backward compatibility
  async updateCustomer(id: number, customerData: Partial<InsertCustomer>): Promise<Customer | undefined> {
    return this.updateAccount(id, customerData as Partial<InsertAccount>);
  }

  // Contact methods
  async getContact(id: number): Promise<Contact | undefined> {
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, id));
    return contact || undefined;
  }

  async getContactsByAccountId(accountId: number): Promise<Contact[]> {
    const results = await db.select().from(contacts).where(eq(contacts.accountId, accountId));
    return results;
  }

  async createContact(contact: InsertContact): Promise<Contact> {
    const [newContact] = await db.insert(contacts).values(contact).returning();
    return newContact;
  }

  async updateContact(id: number, contact: Partial<InsertContact>): Promise<Contact | undefined> {
    const [updated] = await db.update(contacts)
      .set({...contact, updatedAt: new Date()})
      .where(eq(contacts.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteContact(id: number): Promise<boolean> {
    const result = await db.delete(contacts).where(eq(contacts.id, id));
    return result.rowCount! > 0;
  }

  async getPrimaryContact(accountId: number): Promise<Contact | undefined> {
    const [contact] = await db.select().from(contacts)
      .where(and(
        eq(contacts.accountId, accountId),
        eq(contacts.isPrimary, true)
      ));
    return contact || undefined;
  }

  async getQuote(id: number): Promise<Quote | undefined> {
    const [quote] = await db.select().from(quotes).where(eq(quotes.id, id));
    return quote || undefined;
  }

  async getQuoteWithDetails(id: number): Promise<QuoteWithDetails | undefined> {
    const [quote] = await db.select().from(quotes).where(eq(quotes.id, id));
    if (!quote) return undefined;

    const accountIdToUse = quote.accountId;
    let account = undefined;
    let projectContacts: any[] = [];
    
    // Get account and contacts if accountId exists
    if (accountIdToUse) {
      [account] = await db.select().from(accounts).where(eq(accounts.id, accountIdToUse));
      if (account) {
        projectContacts = await db.select().from(contacts).where(eq(contacts.accountId, accountIdToUse));
      }
    }

    // Join line items with products to get manufacturer data
    const quoteLineItemsWithProducts = await db
      .select({
        id: lineItems.id,
        quoteId: lineItems.quoteId,
        productId: lineItems.productId,
        description: lineItems.description,
        quantity: lineItems.quantity,
        retailPrice: lineItems.retailPrice,
        unitPrice: lineItems.unitPrice,
        markupType: lineItems.markupType,
        markupValue: lineItems.markupValue,
        discountType: lineItems.discountType,
        discountValue: lineItems.discountValue,
        configData: lineItems.configData,
        baseProductId: lineItems.baseProductId,
        isAccessory: lineItems.isAccessory,
        isTaxable: lineItems.isTaxable,
        groupId: lineItems.groupId,
        position: lineItems.position,
        productManufacturer: products.manufacturer,
      })
      .from(lineItems)
      .leftJoin(products, eq(lineItems.productId, products.id))
      .where(eq(lineItems.quoteId, id))
      .orderBy(asc(lineItems.position));
    
    // Add manufacturer field to line items using fallback logic
    const quoteLineItems = quoteLineItemsWithProducts.map(item => ({
      id: item.id,
      quoteId: item.quoteId,
      productId: item.productId,
      description: item.description,
      quantity: item.quantity,
      retailPrice: item.retailPrice,
      unitPrice: item.unitPrice,
      markupType: item.markupType,
      markupValue: item.markupValue,
      discountType: item.discountType,
      discountValue: item.discountValue,
      configData: item.configData,
      baseProductId: item.baseProductId,
      isAccessory: item.isAccessory,
      isTaxable: item.isTaxable,
      groupId: item.groupId,
      position: item.position,
      manufacturer: item.productManufacturer || "Uncategorized",
    }));

    // Get contract template if referenced
    let contractTemplate: ContractTemplate | undefined;
    if (quote.contractTemplateId) {
      [contractTemplate] = await db.select().from(contractTemplates).where(eq(contractTemplates.id, quote.contractTemplateId));
    }

    return {
      ...quote,
      account,
      customer: account, // Legacy alias for backward compatibility
      lineItems: quoteLineItems,
      contractTemplate,
      contacts: projectContacts,
    };
  }

  async getAllQuotes(): Promise<QuoteWithDetails[]> {
    const allQuotes = await db.select().from(quotes);
    const result: QuoteWithDetails[] = [];

    for (const quote of allQuotes) {
      const accountIdToUse = quote.accountId;
      let account = null;
      let projectContacts: any[] = [];
      
      // Get account and contacts if accountId exists
      if (accountIdToUse) {
        [account] = await db.select().from(accounts).where(eq(accounts.id, accountIdToUse));
        if (account) {
          projectContacts = await db.select().from(contacts).where(eq(contacts.accountId, accountIdToUse));
        }
      }
      
      // Process quote even if no account (for unassigned quotes)
      // Join line items with products to get manufacturer data
      const quoteLineItemsWithProducts = await db
          .select({
            id: lineItems.id,
            quoteId: lineItems.quoteId,
            productId: lineItems.productId,
            description: lineItems.description,
            quantity: lineItems.quantity,
            retailPrice: lineItems.retailPrice,
            unitPrice: lineItems.unitPrice,
            markupType: lineItems.markupType,
            markupValue: lineItems.markupValue,
            discountType: lineItems.discountType,
            discountValue: lineItems.discountValue,
            configData: lineItems.configData,
            baseProductId: lineItems.baseProductId,
            isAccessory: lineItems.isAccessory,
            isTaxable: lineItems.isTaxable,
            groupId: lineItems.groupId,
            position: lineItems.position,
            productManufacturer: products.manufacturer,
          })
          .from(lineItems)
          .leftJoin(products, eq(lineItems.productId, products.id))
          .where(eq(lineItems.quoteId, quote.id))
          .orderBy(asc(lineItems.position));
        
        // Add manufacturer field to line items using fallback logic
        const quoteLineItems = quoteLineItemsWithProducts.map(item => ({
          id: item.id,
          quoteId: item.quoteId,
          productId: item.productId,
          description: item.description,
          quantity: item.quantity,
          retailPrice: item.retailPrice,
          unitPrice: item.unitPrice,
          markupType: item.markupType,
          markupValue: item.markupValue,
          discountType: item.discountType,
          discountValue: item.discountValue,
          configData: item.configData,
          baseProductId: item.baseProductId,
          isAccessory: item.isAccessory,
          isTaxable: item.isTaxable,
          groupId: item.groupId,
          position: item.position,
          manufacturer: item.productManufacturer || "Uncategorized",
        }));

      // Get contract template if referenced
      let contractTemplate: ContractTemplate | undefined;
      if (quote.contractTemplateId) {
        [contractTemplate] = await db.select().from(contractTemplates).where(eq(contractTemplates.id, quote.contractTemplateId));
      }
      
      result.push({
        ...quote,
        account: account || undefined,
        customer: account || undefined, // Legacy alias for backward compatibility
        lineItems: quoteLineItems,
        contractTemplate,
        contacts: projectContacts,
      });
    }

    return result.sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }

  async createQuote(insertQuote: InsertQuote): Promise<Quote> {
    // Generate quote number if not provided
    if (!insertQuote.quoteNumber) {
      const year = new Date().getFullYear();
      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      insertQuote.quoteNumber = `QT-${year}-${timestamp.toString().slice(-8)}${random}`;
      console.log(`Generated new quote number: ${insertQuote.quoteNumber}`);
    }
    
    // Retry logic for handling duplicate quote numbers
    const maxRetries = 5;
    let retryCount = 0;
    let lastError: any = null;
    
    while (retryCount < maxRetries) {
      try {
        // Check if quote number already exists
        const existingQuote = await db
          .select()
          .from(quotes)
          .where(eq(quotes.quoteNumber, insertQuote.quoteNumber))
          .limit(1);
        
        if (existingQuote.length > 0) {
          // Quote number exists, generate a new one
          console.log(`Quote number ${insertQuote.quoteNumber} already exists, generating new one...`);
          
          // Generate a new unique quote number
          const year = new Date().getFullYear();
          const timestamp = Date.now();
          const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
          insertQuote.quoteNumber = `QT-${year}-${timestamp.toString().slice(-8)}${random}`;
          
          retryCount++;
          continue;
        }
        
        // Try to insert the quote
        // Handle contactId to accountId mapping and set legacy customerId
        let resolvedAccountId = insertQuote.accountId;
        
        // If both accountId and contactId are provided, validate consistency
        if (insertQuote.accountId && insertQuote.contactId) {
          const [contact] = await db
            .select({ accountId: contacts.accountId })
            .from(contacts)
            .where(eq(contacts.id, insertQuote.contactId))
            .limit(1);
          
          if (!contact) {
            throw new Error(`Contact with ID ${insertQuote.contactId} not found`);
          }
          
          if (contact.accountId !== insertQuote.accountId) {
            throw new Error(`Contact ${insertQuote.contactId} belongs to account ${contact.accountId}, but accountId ${insertQuote.accountId} was provided. These must match.`);
          }
          
          resolvedAccountId = insertQuote.accountId;
        }
        // If contactId provided but no accountId, fetch contact to derive accountId
        else if (insertQuote.contactId && !resolvedAccountId) {
          const [contact] = await db
            .select({ accountId: contacts.accountId })
            .from(contacts)
            .where(eq(contacts.id, insertQuote.contactId))
            .limit(1);
          
          if (!contact) {
            throw new Error(`Contact with ID ${insertQuote.contactId} not found`);
          }
          
          resolvedAccountId = contact.accountId;
          console.log(`Resolved accountId ${resolvedAccountId} from contactId ${insertQuote.contactId}`);
        }
        // If only accountId provided, use it directly
        else if (insertQuote.accountId) {
          resolvedAccountId = insertQuote.accountId;
        }
        
        // Handle unassigned quotes (no account or contact)
        const quoteToInsert: any = {
          ...insertQuote,
          customerId: resolvedAccountId || 0, // Use resolved accountId or default to 0 for unassigned quotes
          accountId: resolvedAccountId || null, // Set accountId if available
          contactId: insertQuote.contactId || null, // Include contactId if provided
        };
        
        const [quote] = await db
          .insert(quotes)
          .values(quoteToInsert)
          .returning();
        
        console.log(`Successfully created quote with number: ${quote.quoteNumber}`);
        return quote;
        
      } catch (error: any) {
        lastError = error;
        
        // Check if it's a unique constraint violation
        if (error.code === '23505' && error.constraint === 'quotes_quote_number_unique') {
          console.log(`Unique constraint violation for quote number ${insertQuote.quoteNumber}, retry ${retryCount + 1}/${maxRetries}`);
          
          // Generate a new unique quote number for retry
          const year = new Date().getFullYear();
          const timestamp = Date.now();
          const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
          insertQuote.quoteNumber = `QT-${year}-${timestamp.toString().slice(-8)}${random}`;
          
          retryCount++;
          
          // Add a small delay to reduce collision probability
          await new Promise(resolve => setTimeout(resolve, 100));
        } else {
          // Other database error, throw immediately
          console.error('Database error while creating quote:', error);
          throw error;
        }
      }
    }
    
    // If we've exhausted all retries, throw the error
    console.error(`Failed to create quote after ${maxRetries} retries`);
    throw new Error(`Unable to generate unique quote number after ${maxRetries} attempts. Last error: ${lastError?.message || 'Unknown error'}`);
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

    // Check if quote number is being changed and validate uniqueness
    if (quoteData.quoteNumber && quoteData.quoteNumber !== existingQuote.quoteNumber) {
      const [duplicateQuote] = await db
        .select()
        .from(quotes)
        .where(eq(quotes.quoteNumber, quoteData.quoteNumber))
        .limit(1);
      
      if (duplicateQuote) {
        console.error(`Cannot update quote ${id}: Quote number ${quoteData.quoteNumber} already exists`);
        throw new Error(`Quote number ${quoteData.quoteNumber} already exists. Please use a different quote number.`);
      }
    }

    // Prepare the update data
    let finalQuoteData = { ...quoteData };


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


  async getLineItem(id: number): Promise<LineItem | undefined> {
    const [lineItem] = await db.select().from(lineItems).where(eq(lineItems.id, id));
    return lineItem;
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

  async reorderLineItems(quoteId: number, moves: Array<{id: number; groupId: string | null; position: number}>): Promise<void> {
    await db.transaction(async (tx) => {
      // Phase 1: Add temporary offset to positions to break ties
      for (const move of moves) {
        await tx
          .update(lineItems)
          .set({ 
            position: move.position + 10000 
          })
          .where(and(
            eq(lineItems.id, move.id),
            eq(lineItems.quoteId, quoteId)
          ));
      }

      // Phase 2: Set final positions and groupIds
      for (const move of moves) {
        await tx
          .update(lineItems)
          .set({ 
            groupId: move.groupId, 
            position: move.position 
          })
          .where(and(
            eq(lineItems.id, move.id),
            eq(lineItems.quoteId, quoteId)
          ));
      }
    });
  }

  // Group methods
  async getGroup(id: string): Promise<Group | undefined> {
    const [group] = await db.select().from(groups).where(eq(groups.id, id));
    return group;
  }

  async getGroupsByQuoteId(quoteId: number): Promise<Group[]> {
    return await db
      .select({
        id: groups.id,
        quoteId: groups.quoteId,
        title: groups.title,
        position: groups.position,
        isCollapsed: groups.isCollapsed,
        createdAt: groups.createdAt,
        updatedAt: groups.updatedAt,
      })
      .from(groups)
      .where(eq(groups.quoteId, quoteId))
      .orderBy(groups.position);
  }

  async createGroup(group: InsertGroup): Promise<Group> {
    const [newGroup] = await db
      .insert(groups)
      .values(group)
      .returning();
    return newGroup;
  }

  async updateGroup(id: string, groupData: Partial<InsertGroup>): Promise<Group | undefined> {
    const [updated] = await db
      .update(groups)
      .set({ 
        ...groupData, 
        updatedAt: sql`CURRENT_TIMESTAMP` 
      })
      .where(eq(groups.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteGroup(id: string): Promise<boolean> {
    // First, move all line items in this group to ungrouped (groupId = null)
    await db
      .update(lineItems)
      .set({ groupId: null })
      .where(eq(lineItems.groupId, id));

    // Then delete the group
    const result = await db.delete(groups).where(eq(groups.id, id));
    return (result.rowCount || 0) > 0;
  }

  async deleteGroupsByQuoteId(quoteId: number): Promise<boolean> {
    await db.delete(groups).where(eq(groups.quoteId, quoteId));
    return true;
  }

  async reorderGroups(quoteId: number, positions: Array<{id: string; position: number}>): Promise<void> {
    await db.transaction(async (tx) => {
      // Phase 1: Add temporary offset to positions to break ties
      for (const groupPos of positions) {
        await tx
          .update(groups)
          .set({ 
            position: groupPos.position + 10000,
            updatedAt: sql`CURRENT_TIMESTAMP`
          })
          .where(and(
            eq(groups.id, groupPos.id),
            eq(groups.quoteId, quoteId)
          ));
      }

      // Phase 2: Set final positions
      for (const groupPos of positions) {
        await tx
          .update(groups)
          .set({ 
            position: groupPos.position,
            updatedAt: sql`CURRENT_TIMESTAMP`
          })
          .where(and(
            eq(groups.id, groupPos.id),
            eq(groups.quoteId, quoteId)
          ));
      }
    });
  }

  // Authorization methods for line item security
  async validateLineItemsOwnership(lineItemIds: number[], userId: any): Promise<{ isValid: boolean; quoteId?: number }> {
    if (lineItemIds.length === 0) return { isValid: false };

    // Get all line items and their associated quotes
    const items = await db
      .select({
        lineItemId: lineItems.id,
        quoteId: lineItems.quoteId
      })
      .from(lineItems)
      .leftJoin(quotes, eq(lineItems.quoteId, quotes.id))
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
    // Order by manufacturer field
    return await db
      .select()
      .from(products)
      .orderBy(products.manufacturer, products.name);
  }

  async getProduct(id: number): Promise<Product | undefined> {
    // Return product data
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product || undefined;
  }

  async createProduct(insertProduct: InsertProduct): Promise<Product> {
    // Strip any validation metadata field if present
    const { _categoryValidation, ...cleanProduct } = insertProduct as any;
    
    const productData = { ...cleanProduct };
    
    // Ensure manufacturer field is present
    if (!productData.manufacturer) {
      throw new Error("Manufacturer is required for all products");
    }
    
    const [product] = await db
      .insert(products)
      .values(productData)
      .returning();
    return product;
  }

  async updateProduct(id: number, productData: Partial<InsertProduct>): Promise<Product | undefined> {
    // Strip any validation metadata field if present
    const { _categoryValidation, ...cleanProductData } = productData as any;
    
    const updateData = { ...cleanProductData };
    
    const [updated] = await db
      .update(products)
      .set(updateData)
      .where(eq(products.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteProduct(id: number): Promise<boolean> {
    const result = await db.delete(products).where(eq(products.id, id));
    return (result.rowCount || 0) > 0;
  }

  async bulkUpdateProducts(productIds: number[], updates: Partial<InsertProduct>): Promise<number> {
    // Strip any validation metadata field if present
    const { _categoryValidation, ...cleanUpdates } = updates as any;
    
    const updateData = { ...cleanUpdates };
    
    const result = await db
      .update(products)
      .set(updateData)
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


  // Enhanced product method with details
  async getProductWithDetails(id: number): Promise<ProductWithDetails | undefined> {
    // Phase A compatibility: Return product with both category and manufacturer fields
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

  // Quote image methods
  async getQuoteCoverPhoto(quoteId: number): Promise<QuoteCoverPhoto | undefined> {
    const [photo] = await db
      .select()
      .from(quoteCoverPhotos)
      .where(and(eq(quoteCoverPhotos.quoteId, quoteId), eq(quoteCoverPhotos.isActive, true)))
      .orderBy(desc(quoteCoverPhotos.uploadedAt))
      .limit(1);
    return photo || undefined;
  }

  async getQuoteProductRenderings(quoteId: number): Promise<QuoteProductRendering[]> {
    return await db
      .select()
      .from(quoteProductRenderings)
      .where(and(eq(quoteProductRenderings.quoteId, quoteId), eq(quoteProductRenderings.isActive, true)))
      .orderBy(quoteProductRenderings.displayOrder, quoteProductRenderings.uploadedAt);
  }

  async createQuoteCoverPhoto(photo: InsertQuoteCoverPhoto): Promise<QuoteCoverPhoto> {
    // Soft delete any existing active cover photos for this quote (business rule: one active cover photo per quote)
    await db
      .update(quoteCoverPhotos)
      .set({ isActive: false })
      .where(and(eq(quoteCoverPhotos.quoteId, photo.quoteId), eq(quoteCoverPhotos.isActive, true)));

    const [created] = await db
      .insert(quoteCoverPhotos)
      .values(photo)
      .returning();
    return created;
  }

  async createQuoteProductRendering(rendering: InsertQuoteProductRendering): Promise<QuoteProductRendering> {
    const [created] = await db
      .insert(quoteProductRenderings)
      .values(rendering)
      .returning();
    return created;
  }

  async updateQuoteCoverPhoto(id: number, photo: Partial<InsertQuoteCoverPhoto>): Promise<QuoteCoverPhoto | undefined> {
    const [updated] = await db
      .update(quoteCoverPhotos)
      .set(photo)
      .where(eq(quoteCoverPhotos.id, id))
      .returning();
    return updated || undefined;
  }

  async updateQuoteProductRendering(id: number, rendering: Partial<InsertQuoteProductRendering>): Promise<QuoteProductRendering | undefined> {
    const [updated] = await db
      .update(quoteProductRenderings)
      .set(rendering)
      .where(eq(quoteProductRenderings.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteQuoteCoverPhoto(id: number): Promise<boolean> {
    // Soft delete by setting isActive to false
    const result = await db
      .update(quoteCoverPhotos)
      .set({ isActive: false })
      .where(eq(quoteCoverPhotos.id, id));
    return (result.rowCount || 0) > 0;
  }

  async deleteQuoteProductRendering(id: number): Promise<boolean> {
    // Soft delete by setting isActive to false
    const result = await db
      .update(quoteProductRenderings)
      .set({ isActive: false })
      .where(eq(quoteProductRenderings.id, id));
    return (result.rowCount || 0) > 0;
  }

  async deleteQuoteImagesByQuoteId(quoteId: number): Promise<boolean> {
    // Soft delete all images for a quote when the quote is deleted
    const coverResult = await db
      .update(quoteCoverPhotos)
      .set({ isActive: false })
      .where(eq(quoteCoverPhotos.quoteId, quoteId));

    const renderingsResult = await db
      .update(quoteProductRenderings)
      .set({ isActive: false })
      .where(eq(quoteProductRenderings.quoteId, quoteId));

    return ((coverResult.rowCount || 0) + (renderingsResult.rowCount || 0)) > 0;
  }

  // Issue report methods
  async createIssueReport(issueReport: InsertIssueReport): Promise<IssueReport> {
    const [newIssueReport] = await db.insert(issueReports).values(issueReport).returning();
    return newIssueReport;
  }

  async getIssueReport(id: number): Promise<IssueReport | undefined> {
    const [issueReport] = await db.select().from(issueReports).where(eq(issueReports.id, id));
    return issueReport || undefined;
  }

  async getAllIssueReports(): Promise<IssueReport[]> {
    const reports = await db.select().from(issueReports).orderBy(desc(issueReports.createdAt));
    return reports;
  }

  async updateIssueReport(id: number, issueReport: Partial<InsertIssueReport>): Promise<IssueReport | undefined> {
    const [updated] = await db.update(issueReports)
      .set({ ...issueReport, updatedAt: new Date() })
      .where(eq(issueReports.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteIssueReport(id: number): Promise<boolean> {
    const result = await db.delete(issueReports).where(eq(issueReports.id, id));
    return (result.rowCount || 0) > 0;
  }

  // API key methods
  async createApiKey(apiKey: { name: string; keyHash: string }): Promise<ApiKey> {
    const [newKey] = await db.insert(apiKeys).values(apiKey).returning();
    return newKey;
  }

  async getApiKeyByHash(keyHash: string): Promise<ApiKey | undefined> {
    const [key] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, keyHash));
    return key || undefined;
  }

  async updateApiKeyLastUsed(id: number): Promise<void> {
    await db.update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, id));
  }

}

export const storage = new DatabaseStorage();
