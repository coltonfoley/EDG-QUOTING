import {
  accounts,
  customers,
  quotes,
  planningAgreements,
  planningAgreementEvents,
  lineItems,
  groups,
  products,
  pricingDefaults,
  users,
  apiKeys,
  contractTemplates,
  pricingTables,
  colors,
  productColors,
  quoteCoverPhotos,
  quoteProductRenderings,
  leadAttachments,
  issueReports,
  type Account,
  type Customer,
  type Quote,
  type PlanningAgreement,
  type PlanningAgreementEvent,
  type LineItem,
  type Group,
  type Product,
  type PricingDefault,
  type User,
  type ApiKey,
  type ContractTemplate,
  type PricingTable,
  type Color,
  type ProductColor,
  type QuoteCoverPhoto,
  type QuoteProductRendering,
  type LeadAttachment,
  type IssueReport,
  type InsertAccount,
  type InsertCustomer,
  type InsertQuote,
  type InsertPlanningAgreement,
  type InsertPlanningAgreementEvent,
  type InsertLineItem,
  type InsertGroup,
  type InsertProduct,
  type InsertUser,
  type InsertApiKey,
  type InsertContractTemplate,
  type InsertPricingTable,
  type InsertColor,
  type InsertProductColor,
  type InsertQuoteCoverPhoto,
  type InsertQuoteProductRendering,
  type InsertLeadAttachment,
  type InsertIssueReport,
  type QuoteWithDetails,
  type ProductWithDetails
} from "@shared/schema";
import { db, ensureLeadAttachmentTable, ensurePlanningAgreementTables, ensurePricingDefaultsTable, ensureProductCatalogColumns, ensureSignatureAuditColumns, pool } from "./db";
import { eq, desc, asc, inArray, sql, and, ne, or, ilike } from "drizzle-orm";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import connectPg from "connect-pg-simple";
import session from "express-session";
import { calculateCostFromMsrpAndDiscount, deriveProductCostFields } from "@shared/pricing";
import { applySundanceSkuDefault } from "./sundanceSku";

const scryptAsync = promisify(scrypt);

function normalizeProductPricingPayload<T extends Record<string, any>>(
  payload: T,
  existingProduct?: Product
): T {
  const normalized: Record<string, any> = { ...payload };
  const hasRetail = normalized.retailPrice !== undefined;
  const hasCost = normalized.costPrice !== undefined || normalized.cost !== undefined;
  const hasDiscount = normalized.defaultDiscountType !== undefined || normalized.defaultDiscountValue !== undefined;

  if (hasRetail || hasCost || hasDiscount) {
    const retailPrice = normalized.retailPrice ?? existingProduct?.retailPrice ?? "0";

    if (hasCost) {
      const costPrice = normalized.costPrice ?? normalized.cost;
      const fields = deriveProductCostFields(retailPrice, costPrice);
      normalized.costPrice = fields.costPrice;
      normalized.defaultDiscountType = fields.defaultDiscountType;
      normalized.defaultDiscountValue = fields.defaultDiscountValue;
    } else {
      const defaultDiscountType = normalized.defaultDiscountType ?? existingProduct?.defaultDiscountType ?? "dollar";
      const defaultDiscountValue = normalized.defaultDiscountValue ?? existingProduct?.defaultDiscountValue ?? "0";
      normalized.costPrice = calculateCostFromMsrpAndDiscount(
        retailPrice,
        defaultDiscountType,
        defaultDiscountValue
      ).toFixed(2);
    }
  }

  delete normalized.cost;
  return normalized as T;
}

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

const getQuoteFamilyRootId = (quote: Pick<Quote, "id" | "parentQuoteId">): number => {
  return quote.parentQuoteId || quote.id;
};

type PlanningAgreementUpdate = Partial<InsertPlanningAgreement>;

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
  getLeadAttachmentsForAccount(accountId: number): Promise<LeadAttachment[]>;
  getLeadAttachmentsForAccounts(accountIds: number[]): Promise<LeadAttachment[]>;
  createLeadAttachment(attachment: InsertLeadAttachment): Promise<LeadAttachment>;
  
  // Client methods (unified model - accounts with integrated contact info)
  getClient(id: number): Promise<Account | undefined>;
  getClientByEmail(email: string): Promise<Account | undefined>;
  searchClients(searchTerm: string): Promise<Account[]>;
  getAllClients(): Promise<Account[]>;
  getClientWithDetails(id: number): Promise<any>;
  deleteClient(id: number): Promise<boolean>;
  createClient(client: InsertAccount, options?: { allowDuplicate?: boolean; updateIfExists?: boolean }): Promise<Account>;
  updateClient(id: number, client: Partial<InsertAccount>): Promise<Account | undefined>;
  
  // Legacy customer methods (backward compatibility)
  getCustomer(id: number): Promise<Customer | undefined>;
  getCustomerByEmail(email: string): Promise<Customer | undefined>;
  findDuplicateCustomer(customer: InsertCustomer): Promise<Customer | undefined>;
  searchCustomers(searchTerm: string): Promise<Customer[]>;
  createCustomer(customer: InsertCustomer, options?: { allowDuplicate?: boolean; updateIfExists?: boolean; createPrimaryContact?: boolean }): Promise<Customer>;
  updateCustomer(id: number, customer: Partial<InsertCustomer>): Promise<Customer | undefined>;
  
  // Quote methods
  getQuote(id: number): Promise<Quote | undefined>;
  getQuoteWithDetails(id: number): Promise<QuoteWithDetails | undefined>;
  getQuoteBySigningToken(token: string): Promise<QuoteWithDetails | undefined>;
  getAllQuotes(options?: { page?: number; pageSize?: number }): Promise<QuoteWithDetails[]>;
  createQuote(quote: InsertQuote): Promise<Quote>;
  updateQuote(id: number, quote: Partial<InsertQuote>): Promise<Quote | undefined>;
  deleteQuote(id: number): Promise<boolean>;

  // Planning agreement methods
  getPlanningAgreement(id: number): Promise<PlanningAgreement | undefined>;
  getPlanningAgreementEvents(planningAgreementId: number): Promise<PlanningAgreementEvent[]>;
  getPlanningAgreementsByAccountId(accountId: number): Promise<(PlanningAgreement & { quote?: Quote })[]>;
  getPlanningAgreementByQuoteId(quoteId: number): Promise<PlanningAgreement | undefined>;
  getPlanningAgreementByQuoteFamilyRootId(quoteFamilyRootId: number): Promise<PlanningAgreement | undefined>;
  getPlanningAgreementBySigningToken(token: string): Promise<PlanningAgreement | undefined>;
  createPlanningAgreement(planningAgreement: InsertPlanningAgreement, actorUserId?: number | null): Promise<PlanningAgreement>;
  updatePlanningAgreement(id: number, planningAgreement: PlanningAgreementUpdate, actorUserId?: number | null, eventType?: InsertPlanningAgreementEvent["eventType"], payload?: Record<string, unknown>): Promise<PlanningAgreement | undefined>;
  createPlanningAgreementEvent(event: InsertPlanningAgreementEvent): Promise<PlanningAgreementEvent>;
  
  // Quote versioning methods
  getQuoteVersions(quoteId: number): Promise<QuoteWithDetails[]>;
  createQuoteVersion(originalQuoteId: number): Promise<Quote>;
  setCurrentQuoteVersion(quoteId: number): Promise<Quote | undefined>;
  markPreviousVersionsAsOld(parentQuoteId: number): Promise<void>;


  // Product methods
  getAllProducts(): Promise<Product[]>;
  getProduct(id: number): Promise<Product | undefined>;
  getProductWithDetails(id: number): Promise<ProductWithDetails | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: number, product: Partial<InsertProduct>): Promise<Product | undefined>;
  deleteProduct(id: number): Promise<boolean>;
  bulkUpdateProducts(productIds: number[], updates: Partial<InsertProduct>): Promise<number>;

  // Pricing default methods
  getPricingDefault(scope: string): Promise<PricingDefault | undefined>;
  upsertPricingDefault(scope: string, pricingDefault: { markupType: "percentage"; markupValue: string }): Promise<PricingDefault>;

  // Pricing table methods
  getPricingTablesByProductId(productId: number): Promise<PricingTable[]>;
  createPricingTable(pricingTable: InsertPricingTable): Promise<PricingTable>;
  updatePricingTable(id: number, pricingTable: Partial<InsertPricingTable>): Promise<PricingTable | undefined>;
  deletePricingTable(id: number): Promise<boolean>;
  deletePricingTablesByProductId(productId: number): Promise<boolean>;
  calculateConfigurableProductPrice(productId: number, length: number, width: number): Promise<number | null>;

  // Color methods
  getAllColors(): Promise<Color[]>;
  getColor(id: number): Promise<Color | undefined>;
  createColor(color: InsertColor): Promise<Color>;
  updateColor(id: number, color: Partial<InsertColor>): Promise<Color | undefined>;
  deleteColor(id: number): Promise<boolean>;

  // Product color methods
  getProductColors(productId: number): Promise<(ProductColor & { color: Color })[]>;
  getBatchProductColors(productIds: number[]): Promise<Record<number, (ProductColor & { color: Color })[]>>;
  createProductColor(productColor: InsertProductColor): Promise<ProductColor>;
  deleteProductColor(id: number): Promise<boolean>;
  deleteProductColorsByProductId(productId: number): Promise<boolean>;

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
  getUserByEmail(email: string): Promise<User | undefined>;
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
      streetAddress: insertCustomer.streetAddress || null,
      addressLine2: insertCustomer.addressLine2 || null,
      city: insertCustomer.city || null,
      state: insertCustomer.state || null,
      zipCode: insertCustomer.zipCode || null,
      country: insertCustomer.country || null,
      placeId: insertCustomer.placeId || null,
      firstName: insertCustomer.firstName || null,
      lastName: insertCustomer.lastName || null,
      secondaryContacts: insertCustomer.secondaryContacts || null,
      qbCustomerId: null,
      leadStatus: insertCustomer.leadStatus || null,
      leadSource: insertCustomer.leadSource || null,
      leadProjectType: insertCustomer.leadProjectType || null,
      leadMessage: insertCustomer.leadMessage || null,
      leadReceivedAt: insertCustomer.leadReceivedAt || null,
      leadLastContactedAt: insertCustomer.leadLastContactedAt || null,
      leadConvertedAt: insertCustomer.leadConvertedAt || null,
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

  async getQuoteBySigningToken(token: string): Promise<QuoteWithDetails | undefined> {
    const quote = Array.from(this.quotes.values()).find(q => q.signingToken === token);
    if (!quote) return undefined;

    const accountIdToUse = quote.accountId;
    let customer = undefined;
    if (accountIdToUse) {
      customer = this.customers.get(accountIdToUse);
    }

    const quoteLineItems = Array.from(this.lineItems.values()).filter(item => item.quoteId === quote.id);

    return {
      ...quote,
      account: customer,
      customer,
      lineItems: quoteLineItems,
    };
  }

  async getAllQuotes(options?: { page?: number; pageSize?: number }): Promise<QuoteWithDetails[]> {
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
    const sorted = result.sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());

    if (!options?.pageSize) {
      return sorted;
    }

    const safePageSize = Math.max(1, Math.floor(options.pageSize));
    const safePage = Math.max(1, Math.floor(options.page ?? 1));
    const start = (safePage - 1) * safePageSize;
    return sorted.slice(start, start + safePageSize);
  }

  async createQuote(insertQuote: InsertQuote): Promise<Quote> {
    const id = this.currentQuoteId++;
    const quote: Quote = { 
      ...insertQuote as any,
      id,
      accountId: insertQuote.accountId as number | null || null,
      dealStage: (insertQuote.dealStage as string) || "new_lead",
      projectName: (insertQuote.projectName as string | null) || null,
      estimatedStartDate: (insertQuote.estimatedStartDate as string | null) || null,
      notes: (insertQuote.notes as string | null) || null,
      internalNotes: (insertQuote.internalNotes as string | null) || null,
      taxRate: (insertQuote.taxRate as string) || "0",
      discount: (insertQuote.discount as string) || "0",
      shipping: (insertQuote.shipping as string) || "0",
      lostReason: (insertQuote.lostReason as string | null) || null,
      contractTemplateId: (insertQuote.contractTemplateId as number | null) || null,
      customContractTerms: (insertQuote.customContractTerms as string | null) || null,
      enableESignature: (insertQuote.enableESignature as boolean) || false,
      signingToken: (insertQuote.signingToken as string | null) || null,
      clientSignatureData: insertQuote.clientSignatureData || null,
      clientSignedAt: (insertQuote.clientSignedAt as Date | null) || null,
      clientSignedIp: (insertQuote.clientSignedIp as string | null) || null,
      companySignatureData: insertQuote.companySignatureData || null,
      companySignedAt: (insertQuote.companySignedAt as Date | null) || null,
      companySignedIp: (insertQuote.companySignedIp as string | null) || null,
      signedDocumentSnapshot: insertQuote.signedDocumentSnapshot || null,
      signatureAuditTrail: insertQuote.signatureAuditTrail || null,
      qbEstimateId: null,
      qbSyncStatus: null,
      qbSyncedAt: null,
      qbSyncError: null,
      parentQuoteId: (insertQuote.parentQuoteId as number | null) || null,
      versionNumber: (insertQuote.versionNumber as number) || 1,
      isLatestVersion: (insertQuote.isLatestVersion as boolean) ?? true,
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

  // Quote versioning methods (stub implementations for in-memory storage)
  async getQuoteVersions(quoteId: number): Promise<QuoteWithDetails[]> {
    // Not fully implemented for in-memory storage
    const quote = await this.getQuoteWithDetails(quoteId);
    return quote ? [quote] : [];
  }

  async createQuoteVersion(originalQuoteId: number): Promise<Quote> {
    // Simplified implementation for in-memory storage
    const original = this.quotes.get(originalQuoteId);
    if (!original) {
      throw new Error('Original quote not found');
    }
    const parentId = original.parentQuoteId || original.id;
    const familyVersions = Array.from(this.quotes.values()).filter(
      quote => quote.id === parentId || quote.parentQuoteId === parentId
    );
    const nextVersionNumber = Math.max(
      original.versionNumber,
      ...familyVersions.map(quote => quote.versionNumber || 1)
    ) + 1;
    for (const quote of familyVersions) {
      quote.isLatestVersion = false;
    }
    const baseQuoteNumber = original.quoteNumber.replace(/-v\d+$/, '');
    const newVersion: Quote = {
      ...original,
      id: this.currentQuoteId++,
      quoteNumber: `${baseQuoteNumber}-v${nextVersionNumber}`,
      versionNumber: nextVersionNumber,
      parentQuoteId: parentId,
      isLatestVersion: true,
      enableESignature: false,
      signingToken: null,
      clientSignatureData: null,
      clientSignedAt: null,
      clientSignedIp: null,
      companySignatureData: null,
      companySignedAt: null,
      companySignedIp: null,
      signedDocumentSnapshot: null,
      signatureAuditTrail: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.quotes.set(newVersion.id, newVersion);
    return newVersion;
  }

  async setCurrentQuoteVersion(quoteId: number): Promise<Quote | undefined> {
    const targetQuote = this.quotes.get(quoteId);
    if (!targetQuote) return undefined;

    const parentId = targetQuote.parentQuoteId || targetQuote.id;
    for (const quote of this.quotes.values()) {
      if (quote.id === parentId || quote.parentQuoteId === parentId) {
        quote.isLatestVersion = quote.id === quoteId;
        quote.updatedAt = new Date();
      }
    }

    return this.quotes.get(quoteId);
  }

  async markPreviousVersionsAsOld(parentQuoteId: number): Promise<void> {
    // Simplified implementation for in-memory storage
    for (const quote of this.quotes.values()) {
      if (quote.id === parentQuoteId || quote.parentQuoteId === parentQuoteId) {
        quote.isLatestVersion = false;
      }
    }
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
      isTariffApplicable: insertLineItem.isTariffApplicable ?? null,
      discountType: insertLineItem.discountType || "percentage",
      discountValue: insertLineItem.discountValue || "0",
      groupId: insertLineItem.groupId ?? null,
      sku: insertLineItem.sku ?? null,
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
      pool,
      createTableIfMissing: false,
      schemaName: "public",
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
    
    // Check for email match (case-insensitive) - only if email is not empty
    if (normalizedEmail && normalizedEmail.trim().length > 0) {
      conditions.push(eq(sql`LOWER(${accounts.email})`, normalizedEmail));
    }
    
    // Check for phone match (after normalization) - only if phone has digits
    if (normalizedPhone && normalizedPhone.length > 0) {
      // We need to compare normalized versions of the stored phone numbers
      const phonePattern = `%${normalizedPhone}%`;
      conditions.push(sql`REPLACE(REPLACE(REPLACE(REPLACE(${accounts.phone}, '-', ''), '(', ''), ')', ''), ' ', '') LIKE ${phonePattern}`);
    }
    
    // For business accounts, also check name + company combination
    if (account.company && account.company.trim().length > 0) {
      conditions.push(
        and(
          eq(sql`LOWER(${accounts.name})`, account.name.toLowerCase()),
          eq(sql`LOWER(${accounts.company})`, account.company.toLowerCase())
        )
      );
    }
    
    // If no valid conditions, return no duplicate
    if (conditions.length === 0) {
      return undefined;
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
      
      // Return account results only (contacts search removed)
      return accountResults;
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
            ...(insertAccount.firstName !== undefined && { firstName: insertAccount.firstName }),
            ...(insertAccount.lastName !== undefined && { lastName: insertAccount.lastName }),
            ...(insertAccount.email && { email: insertAccount.email }),
            ...(insertAccount.phone && { phone: insertAccount.phone }),
            ...(insertAccount.company !== undefined && { company: insertAccount.company }),
            ...(insertAccount.accountType && { accountType: insertAccount.accountType }),
            ...(insertAccount.paymentTerms !== undefined && { paymentTerms: insertAccount.paymentTerms }),
            ...(insertAccount.billingAddress !== undefined && { billingAddress: insertAccount.billingAddress }),
            ...(insertAccount.streetAddress !== undefined && { streetAddress: insertAccount.streetAddress }),
            ...(insertAccount.addressLine2 !== undefined && { addressLine2: insertAccount.addressLine2 }),
            ...(insertAccount.city !== undefined && { city: insertAccount.city }),
            ...(insertAccount.state !== undefined && { state: insertAccount.state }),
            ...(insertAccount.zipCode !== undefined && { zipCode: insertAccount.zipCode }),
            ...(insertAccount.country !== undefined && { country: insertAccount.country }),
            ...(insertAccount.placeId !== undefined && { placeId: insertAccount.placeId }),
            ...(insertAccount.secondaryContacts !== undefined && { secondaryContacts: insertAccount.secondaryContacts }),
            ...(insertAccount.leadStatus !== undefined && { leadStatus: insertAccount.leadStatus }),
            ...(insertAccount.leadSource !== undefined && { leadSource: insertAccount.leadSource }),
            ...(insertAccount.leadProjectType !== undefined && { leadProjectType: insertAccount.leadProjectType }),
            ...(insertAccount.leadMessage !== undefined && { leadMessage: insertAccount.leadMessage }),
            ...(insertAccount.leadReceivedAt !== undefined && { leadReceivedAt: insertAccount.leadReceivedAt }),
            ...(insertAccount.leadLastContactedAt !== undefined && { leadLastContactedAt: insertAccount.leadLastContactedAt }),
            ...(insertAccount.leadConvertedAt !== undefined && { leadConvertedAt: insertAccount.leadConvertedAt }),
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
    const [account] = await db.insert(accounts)
      .values(insertAccount)
      .returning();
    
    console.log(`Created new account ${account.id}`);
    return account;
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

  async getLeadAttachmentsForAccount(accountId: number): Promise<LeadAttachment[]> {
    await ensureLeadAttachmentTable();

    return await db
      .select()
      .from(leadAttachments)
      .where(and(eq(leadAttachments.accountId, accountId), eq(leadAttachments.isActive, true)))
      .orderBy(asc(leadAttachments.displayOrder), asc(leadAttachments.uploadedAt));
  }

  async getLeadAttachmentsForAccounts(accountIds: number[]): Promise<LeadAttachment[]> {
    if (accountIds.length === 0) return [];
    await ensureLeadAttachmentTable();

    return await db
      .select()
      .from(leadAttachments)
      .where(and(inArray(leadAttachments.accountId, accountIds), eq(leadAttachments.isActive, true)))
      .orderBy(asc(leadAttachments.accountId), asc(leadAttachments.displayOrder), asc(leadAttachments.uploadedAt));
  }

  async createLeadAttachment(attachment: InsertLeadAttachment): Promise<LeadAttachment> {
    await ensureLeadAttachmentTable();

    const [created] = await db
      .insert(leadAttachments)
      .values(attachment)
      .returning();
    return created;
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
      streetAddress: accounts.streetAddress,
      addressLine2: accounts.addressLine2,
      city: accounts.city,
      state: accounts.state,
      zipCode: accounts.zipCode,
      country: accounts.country,
      placeId: accounts.placeId,
      firstName: accounts.firstName,
      lastName: accounts.lastName,
      secondaryContacts: accounts.secondaryContacts,
      qbCustomerId: accounts.qbCustomerId,
      leadStatus: accounts.leadStatus,
      leadSource: accounts.leadSource,
      leadProjectType: accounts.leadProjectType,
      leadMessage: accounts.leadMessage,
      leadReceivedAt: accounts.leadReceivedAt,
      leadLastContactedAt: accounts.leadLastContactedAt,
      leadConvertedAt: accounts.leadConvertedAt,
      createdAt: accounts.createdAt,
      updatedAt: accounts.updatedAt,
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

    // Get all quotes/projects for this account
    const accountQuotes = await db.select().from(quotes)
      .where(eq(quotes.accountId, id))
      .orderBy(desc(quotes.createdAt));
    const accountPlanningAgreements = await this.getPlanningAgreementsByAccountId(id);
    const accountLeadAttachments = await this.getLeadAttachmentsForAccount(id);

    return {
      ...account,
      quotes: accountQuotes,
      planningAgreements: accountPlanningAgreements,
      projectCount: accountQuotes.length,
      attachments: accountLeadAttachments,
      leadAttachments: accountLeadAttachments
    };
  }

  async deleteAccount(id: number): Promise<boolean> {
    // Check if account has quotes - prevent deletion if it has quotes
    const accountQuotes = await db.select().from(quotes).where(eq(quotes.accountId, id));
    if (accountQuotes.length > 0) {
      throw new Error("Cannot delete account with existing quotes");
    }
    
    // Delete the account
    const result = await db.delete(accounts).where(eq(accounts.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Client methods - unified model that wraps accounts with integrated contact info
  // These provide a cleaner API for the new unified client model
  async getClient(id: number): Promise<Account | undefined> {
    return this.getAccount(id);
  }

  async getClientByEmail(email: string): Promise<Account | undefined> {
    return this.getAccountByEmail(email);
  }

  async searchClients(searchTerm: string): Promise<Account[]> {
    return this.searchAccounts(searchTerm);
  }

  async getAllClients(): Promise<Account[]> {
    return this.getAllAccounts();
  }

  async getClientWithDetails(id: number): Promise<any> {
    return this.getAccountWithDetails(id);
  }

  async deleteClient(id: number): Promise<boolean> {
    return this.deleteAccount(id);
  }

  async createClient(client: InsertAccount, options?: { allowDuplicate?: boolean; updateIfExists?: boolean }): Promise<Account> {
    // For clients, we typically don't create a separate contact record since the contact info is integrated
    return this.createAccount(client, { ...options, createPrimaryContact: false });
  }

  async updateClient(id: number, client: Partial<InsertAccount>): Promise<Account | undefined> {
    return this.updateAccount(id, client);
  }

  // Legacy method for backward compatibility
  async updateCustomer(id: number, customerData: Partial<InsertCustomer>): Promise<Customer | undefined> {
    return this.updateAccount(id, customerData as Partial<InsertAccount>);
  }

  async getQuote(id: number): Promise<Quote | undefined> {
    await ensureSignatureAuditColumns();
    const [quote] = await db.select().from(quotes).where(eq(quotes.id, id));
    return quote || undefined;
  }

  async getQuoteWithDetails(id: number): Promise<QuoteWithDetails | undefined> {
    await ensureSignatureAuditColumns();
    const [quote] = await db.select().from(quotes).where(eq(quotes.id, id));
    if (!quote) return undefined;

    const accountIdToUse = quote.accountId;
    let account = undefined;
    
    // Get account if accountId exists
    if (accountIdToUse) {
      [account] = await db.select().from(accounts).where(eq(accounts.id, accountIdToUse));
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
        isTariffApplicable: lineItems.isTariffApplicable,
        groupId: lineItems.groupId,
        position: lineItems.position,
        sku: lineItems.sku,
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
      isTariffApplicable: item.isTariffApplicable,
      groupId: item.groupId,
      position: item.position,
      sku: item.sku,
      manufacturer: item.productManufacturer || "Uncategorized",
    }));

    // Get contract template if referenced
    let contractTemplate: ContractTemplate | undefined;
    if (quote.contractTemplateId) {
      [contractTemplate] = await db.select().from(contractTemplates).where(eq(contractTemplates.id, quote.contractTemplateId));
    }

    const planningAgreement = await this.getPlanningAgreementByQuoteFamilyRootId(getQuoteFamilyRootId(quote));

    return {
      ...quote,
      account,
      customer: account, // Legacy alias for backward compatibility
      lineItems: quoteLineItems,
      contractTemplate,
      planningAgreement,
    };
  }

  async getQuoteBySigningToken(token: string): Promise<QuoteWithDetails | undefined> {
    await ensureSignatureAuditColumns();
    const [quote] = await db.select().from(quotes).where(eq(quotes.signingToken, token));
    if (!quote) return undefined;

    const accountIdToUse = quote.accountId;
    let account = undefined;
    
    // Get account if accountId exists
    if (accountIdToUse) {
      [account] = await db.select().from(accounts).where(eq(accounts.id, accountIdToUse));
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
        isTariffApplicable: lineItems.isTariffApplicable,
        groupId: lineItems.groupId,
        position: lineItems.position,
        sku: lineItems.sku,
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
      isTariffApplicable: item.isTariffApplicable,
      groupId: item.groupId,
      position: item.position,
      sku: item.sku,
      manufacturer: item.productManufacturer || "Uncategorized",
    }));

    // Get contract template if referenced
    let contractTemplate: ContractTemplate | undefined;
    if (quote.contractTemplateId) {
      [contractTemplate] = await db.select().from(contractTemplates).where(eq(contractTemplates.id, quote.contractTemplateId));
    }

    const planningAgreement = await this.getPlanningAgreementByQuoteFamilyRootId(getQuoteFamilyRootId(quote));

    return {
      ...quote,
      account,
      customer: account, // Legacy alias for backward compatibility
      lineItems: quoteLineItems,
      contractTemplate,
      planningAgreement,
    };
  }

  async getAllQuotes(options?: { page?: number; pageSize?: number }): Promise<QuoteWithDetails[]> {
    await ensureSignatureAuditColumns();
    await ensurePlanningAgreementTables();
    // Only get the current version by default so archived quote revisions stay in history.
    const baseQuery = db
      .select()
      .from(quotes)
      .where(eq(quotes.isLatestVersion, true))
      .orderBy(desc(quotes.createdAt));

    let allQuotes;
    if (options?.pageSize) {
      const safePageSize = Math.max(1, Math.min(500, Math.floor(options.pageSize)));
      const safePage = Math.max(1, Math.floor(options.page ?? 1));
      const offset = (safePage - 1) * safePageSize;
      allQuotes = await baseQuery.limit(safePageSize).offset(offset);
    } else {
      allQuotes = await baseQuery;
    }

    if (allQuotes.length === 0) {
      return [];
    }

    const quoteIds = allQuotes.map(quote => quote.id);
    const quoteFamilyRootIds = Array.from(
      new Set(allQuotes.map((quote) => getQuoteFamilyRootId(quote)))
    );
    const accountIds = Array.from(
      new Set(
        allQuotes
          .map(quote => quote.accountId)
          .filter((id): id is number => typeof id === "number")
      )
    );
    const contractTemplateIds = Array.from(
      new Set(
        allQuotes
          .map(quote => quote.contractTemplateId)
          .filter((id): id is number => typeof id === "number")
      )
    );

    const [accountsList, contractTemplatesList, lineItemRows, planningAgreementRows] = await Promise.all([
      accountIds.length
        ? db.select().from(accounts).where(inArray(accounts.id, accountIds))
        : Promise.resolve([] as Account[]),
      contractTemplateIds.length
        ? db.select().from(contractTemplates).where(inArray(contractTemplates.id, contractTemplateIds))
        : Promise.resolve([] as ContractTemplate[]),
      db
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
          isTariffApplicable: lineItems.isTariffApplicable,
          groupId: lineItems.groupId,
          position: lineItems.position,
          sku: lineItems.sku,
          productManufacturer: products.manufacturer,
        })
        .from(lineItems)
        .leftJoin(products, eq(lineItems.productId, products.id))
        .where(inArray(lineItems.quoteId, quoteIds))
        .orderBy(asc(lineItems.quoteId), asc(lineItems.position)),
      quoteFamilyRootIds.length
        ? db
            .select()
            .from(planningAgreements)
            .where(inArray(planningAgreements.quoteFamilyRootId, quoteFamilyRootIds))
            .orderBy(desc(planningAgreements.createdAt))
        : Promise.resolve([] as PlanningAgreement[]),
    ]);

    const accountMap = new Map(accountsList.map(account => [account.id, account]));
    const contractTemplateMap = new Map(contractTemplatesList.map(template => [template.id, template]));
    const planningAgreementMap = new Map<number, PlanningAgreement>();
    for (const agreement of planningAgreementRows) {
      if (agreement.quoteFamilyRootId && !planningAgreementMap.has(agreement.quoteFamilyRootId)) {
        planningAgreementMap.set(agreement.quoteFamilyRootId, agreement);
      }
    }

    const lineItemsByQuoteId = new Map<number, QuoteWithDetails["lineItems"]>();
    for (const item of lineItemRows) {
      const normalizedItem = {
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
        isTariffApplicable: item.isTariffApplicable,
        groupId: item.groupId,
        position: item.position,
        sku: item.sku,
        manufacturer: item.productManufacturer || "Uncategorized",
      };

      if (!lineItemsByQuoteId.has(item.quoteId)) {
        lineItemsByQuoteId.set(item.quoteId, []);
      }
      lineItemsByQuoteId.get(item.quoteId)!.push(normalizedItem);
    }

    const quotesWithDetails = allQuotes.map(quote => {
      const account = typeof quote.accountId === "number" ? accountMap.get(quote.accountId) : undefined;
      const contractTemplate = typeof quote.contractTemplateId === "number"
        ? contractTemplateMap.get(quote.contractTemplateId)
        : undefined;
      const quoteLineItems = lineItemsByQuoteId.get(quote.id) ?? [];
      const planningAgreement = planningAgreementMap.get(getQuoteFamilyRootId(quote));

      return {
        ...quote,
        account,
        customer: account, // Legacy alias for backward compatibility
        lineItems: quoteLineItems,
        contractTemplate,
        planningAgreement,
      };
    });

    return quotesWithDetails.sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }

  async createQuote(insertQuote: InsertQuote): Promise<Quote> {
    await ensureSignatureAuditColumns();
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
        const resolvedAccountId = insertQuote.accountId || null;
        
        // Handle unassigned quotes (no account)
        const quoteToInsert: any = {
          ...insertQuote,
          customerId: resolvedAccountId || 0, // Use resolved accountId or default to 0 for unassigned quotes
          accountId: resolvedAccountId, // Set accountId if available
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
    await ensureSignatureAuditColumns();
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

  async getPlanningAgreement(id: number): Promise<PlanningAgreement | undefined> {
    await ensurePlanningAgreementTables();
    const [agreement] = await db
      .select()
      .from(planningAgreements)
      .where(eq(planningAgreements.id, id));
    return agreement || undefined;
  }

  async getPlanningAgreementEvents(planningAgreementId: number): Promise<PlanningAgreementEvent[]> {
    await ensurePlanningAgreementTables();
    return db
      .select()
      .from(planningAgreementEvents)
      .where(eq(planningAgreementEvents.planningAgreementId, planningAgreementId))
      .orderBy(asc(planningAgreementEvents.createdAt));
  }

  async getPlanningAgreementsByAccountId(accountId: number): Promise<(PlanningAgreement & { quote?: Quote })[]> {
    await ensurePlanningAgreementTables();
    const agreements = await db
      .select()
      .from(planningAgreements)
      .where(eq(planningAgreements.accountId, accountId))
      .orderBy(desc(planningAgreements.createdAt));

    const quoteIds = Array.from(
      new Set(
        agreements
          .map((agreement) => agreement.quoteId)
          .filter((id): id is number => typeof id === "number")
      )
    );

    if (quoteIds.length === 0) {
      return agreements;
    }

    const agreementQuotes = await db
      .select()
      .from(quotes)
      .where(inArray(quotes.id, quoteIds));
    const quoteMap = new Map(agreementQuotes.map((quote) => [quote.id, quote]));

    return agreements.map((agreement) => ({
      ...agreement,
      quote: agreement.quoteId ? quoteMap.get(agreement.quoteId) : undefined,
    }));
  }

  async getPlanningAgreementByQuoteFamilyRootId(quoteFamilyRootId: number): Promise<PlanningAgreement | undefined> {
    await ensurePlanningAgreementTables();
    const [agreement] = await db
      .select()
      .from(planningAgreements)
      .where(eq(planningAgreements.quoteFamilyRootId, quoteFamilyRootId))
      .orderBy(desc(planningAgreements.createdAt))
      .limit(1);
    return agreement || undefined;
  }

  async getPlanningAgreementBySigningToken(token: string): Promise<PlanningAgreement | undefined> {
    await ensurePlanningAgreementTables();
    const [agreement] = await db
      .select()
      .from(planningAgreements)
      .where(eq(planningAgreements.signingToken, token))
      .limit(1);
    return agreement || undefined;
  }

  async getPlanningAgreementByQuoteId(quoteId: number): Promise<PlanningAgreement | undefined> {
    const quote = await this.getQuote(quoteId);
    if (!quote) return undefined;
    return this.getPlanningAgreementByQuoteFamilyRootId(getQuoteFamilyRootId(quote));
  }

  async createPlanningAgreement(
    insertAgreement: InsertPlanningAgreement,
    actorUserId?: number | null,
  ): Promise<PlanningAgreement> {
    await ensurePlanningAgreementTables();
    return db.transaction(async (tx) => {
      let agreementData: InsertPlanningAgreement = { ...insertAgreement };

      if (agreementData.quoteId && !agreementData.quoteFamilyRootId) {
        const [sourceQuote] = await tx
          .select()
          .from(quotes)
          .where(eq(quotes.id, agreementData.quoteId));
        if (!sourceQuote) {
          throw new Error("Quote not found for planning agreement");
        }

        agreementData = {
          ...agreementData,
          accountId: agreementData.accountId ?? sourceQuote.accountId,
          quoteFamilyRootId: getQuoteFamilyRootId(sourceQuote),
        };
      }

      if (!agreementData.quoteFamilyRootId && agreementData.quoteId) {
        agreementData.quoteFamilyRootId = agreementData.quoteId;
      }

      const [agreement] = await tx
        .insert(planningAgreements)
        .values({
          ...agreementData,
          createdBy: agreementData.createdBy ?? actorUserId ?? null,
          updatedAt: new Date(),
        })
        .returning();

      await tx.insert(planningAgreementEvents).values({
        planningAgreementId: agreement.id,
        eventType: "created",
        actorUserId: actorUserId ?? agreement.createdBy ?? null,
        fromStatus: null,
        toStatus: agreement.status,
        payload: {
          tier: agreement.tier,
          amount: agreement.amount,
          quoteId: agreement.quoteId,
          quoteFamilyRootId: agreement.quoteFamilyRootId,
        },
      });

      return agreement;
    });
  }

  async updatePlanningAgreement(
    id: number,
    updateData: PlanningAgreementUpdate,
    actorUserId?: number | null,
    eventType: InsertPlanningAgreementEvent["eventType"] = "updated",
    payload?: Record<string, unknown>,
  ): Promise<PlanningAgreement | undefined> {
    await ensurePlanningAgreementTables();
    return db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(planningAgreements)
        .where(eq(planningAgreements.id, id));
      if (!existing) {
        return undefined;
      }

      const [updated] = await tx
        .update(planningAgreements)
        .set({ ...updateData, updatedAt: new Date() })
        .where(eq(planningAgreements.id, id))
        .returning();

      await tx.insert(planningAgreementEvents).values({
        planningAgreementId: id,
        eventType,
        actorUserId: actorUserId ?? null,
        fromStatus: existing.status,
        toStatus: updated.status,
        payload: payload ?? updateData,
      });

      return updated || undefined;
    });
  }

  async createPlanningAgreementEvent(event: InsertPlanningAgreementEvent): Promise<PlanningAgreementEvent> {
    await ensurePlanningAgreementTables();
    const [created] = await db
      .insert(planningAgreementEvents)
      .values(event)
      .returning();
    return created;
  }

  // Quote versioning methods
  async getQuoteVersions(quoteId: number): Promise<QuoteWithDetails[]> {
    // Get the quote to determine if it's a parent or a version
    const [quote] = await db.select().from(quotes).where(eq(quotes.id, quoteId));
    if (!quote) return [];
    
    // Determine the parent ID (either the quote itself if it's a parent, or its parent)
    const parentId = quote.parentQuoteId || quote.id;
    
    // Get all versions (quotes with this parentId OR the parent quote itself)
    const versionQuotes = await db
      .select()
      .from(quotes)
      .where(
        or(
          eq(quotes.parentQuoteId, parentId),
          eq(quotes.id, parentId)
        )
      )
      .orderBy(asc(quotes.versionNumber));
    
    // Convert to QuoteWithDetails
    const result: QuoteWithDetails[] = [];
    for (const versionQuote of versionQuotes) {
      const quoteDetails = await this.getQuoteWithDetails(versionQuote.id);
      if (quoteDetails) {
        result.push(quoteDetails);
      }
    }
    
    return result;
  }

  async createQuoteVersion(originalQuoteId: number): Promise<Quote> {
    return await db.transaction(async (tx) => {
      // Get the original quote
      const [originalQuote] = await tx.select().from(quotes).where(eq(quotes.id, originalQuoteId));
      if (!originalQuote) {
        throw new Error('Original quote not found');
      }
      
      // Determine parent ID and new version number
      const parentId = originalQuote.parentQuoteId || originalQuote.id;
      const versionRows = await tx
        .select({ versionNumber: quotes.versionNumber })
        .from(quotes)
        .where(
          or(
            eq(quotes.id, parentId),
            eq(quotes.parentQuoteId, parentId)
          )
        );
      const newVersionNumber = Math.max(
        originalQuote.versionNumber,
        ...versionRows.map((version) => version.versionNumber || 1)
      ) + 1;
      
      // Mark all previous versions as not latest
      await tx
        .update(quotes)
        .set({ isLatestVersion: false })
        .where(
          or(
            eq(quotes.id, parentId),
            eq(quotes.parentQuoteId, parentId)
          )
        );
      
      // Extract base quote number (remove version suffix)
      const baseQuoteNumber = originalQuote.quoteNumber.replace(/-v\d+$/, '');
      const newQuoteNumber = `${baseQuoteNumber}-v${newVersionNumber}`;
      
      // Create new quote (copy all fields except id, timestamps, and version fields)
      const newQuoteData: InsertQuote = {
        quoteNumber: newQuoteNumber,
        accountId: originalQuote.accountId,
        projectName: originalQuote.projectName || undefined,
        jobsiteStreetAddress: originalQuote.jobsiteStreetAddress || undefined,
        jobsiteAddressLine2: originalQuote.jobsiteAddressLine2 || undefined,
        jobsiteCity: originalQuote.jobsiteCity || undefined,
        jobsiteState: originalQuote.jobsiteState || undefined,
        jobsiteZipCode: originalQuote.jobsiteZipCode || undefined,
        jobsiteCountry: originalQuote.jobsiteCountry || undefined,
        jobsitePlaceId: originalQuote.jobsitePlaceId || undefined,
        estimatedStartDate: originalQuote.estimatedStartDate || undefined,
        notes: originalQuote.notes || undefined,
        internalNotes: originalQuote.internalNotes || undefined,
        taxRate: originalQuote.taxRate || "0",
        discount: originalQuote.discount || "0",
        tariffRate: originalQuote.tariffRate || "0",
        shipping: originalQuote.shipping || "0",
        isShippingTaxable: originalQuote.isShippingTaxable ?? false,
        dealStage: originalQuote.dealStage as InsertQuote["dealStage"],
        lostReason: originalQuote.lostReason,
        contractTemplateId: originalQuote.contractTemplateId,
        customContractTerms: originalQuote.customContractTerms,
        enableESignature: false, // Reset signature fields for new version
        signingToken: null,
        clientSignatureData: null,
        clientSignedAt: null,
        clientSignedIp: null,
        companySignatureData: null,
        companySignedAt: null,
        companySignedIp: null,
        signedDocumentSnapshot: null,
        signatureAuditTrail: null,
        qbEstimateId: null,
        qbSyncStatus: null,
        qbSyncedAt: null,
        qbSyncError: null,
        parentQuoteId: parentId,
        versionNumber: newVersionNumber,
        isLatestVersion: true,
      };
      
      const [newQuote] = await tx.insert(quotes).values(newQuoteData).returning();
      
      // Copy groups first and create a mapping from old IDs to new IDs
      const originalGroups = await tx.select().from(groups).where(eq(groups.quoteId, originalQuoteId));
      const groupIdMapping: Record<string, string> = {};
      
      for (const group of originalGroups) {
        const newGroupId = `group-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
        groupIdMapping[group.id] = newGroupId;
        
        await tx.insert(groups).values({
          id: newGroupId,
          quoteId: newQuote.id,
          title: group.title,
          position: group.position,
          isCollapsed: group.isCollapsed,
        });
      }
      
      // Copy line items and update their group IDs to use the new group IDs
      const originalLineItems = await tx.select().from(lineItems).where(eq(lineItems.quoteId, originalQuoteId));
      for (const item of originalLineItems) {
        await tx.insert(lineItems).values({
          quoteId: newQuote.id,
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
          sku: item.sku,
          groupId: item.groupId ? (groupIdMapping[item.groupId] || null) : null,
          position: item.position,
        });
      }
      
      // Copy cover photos
      const originalCoverPhotos = await tx.select().from(quoteCoverPhotos).where(eq(quoteCoverPhotos.quoteId, originalQuoteId));
      for (const photo of originalCoverPhotos) {
        await tx.insert(quoteCoverPhotos).values({
          quoteId: newQuote.id,
          filename: photo.filename,
          originalName: photo.originalName,
          storageUrl: photo.storageUrl,
          fileSize: photo.fileSize,
          mimeType: photo.mimeType,
          isActive: photo.isActive,
        });
      }
      
      // Copy product renderings
      const originalRenderings = await tx.select().from(quoteProductRenderings).where(eq(quoteProductRenderings.quoteId, originalQuoteId));
      for (const rendering of originalRenderings) {
        await tx.insert(quoteProductRenderings).values({
          quoteId: newQuote.id,
          filename: rendering.filename,
          originalName: rendering.originalName,
          storageUrl: rendering.storageUrl,
          displayOrder: rendering.displayOrder,
          fileSize: rendering.fileSize,
          mimeType: rendering.mimeType,
          isActive: rendering.isActive,
        });
      }
      
      return newQuote;
    });
  }

  async setCurrentQuoteVersion(quoteId: number): Promise<Quote | undefined> {
    await ensureSignatureAuditColumns();

    return await db.transaction(async (tx) => {
      const [targetQuote] = await tx.select().from(quotes).where(eq(quotes.id, quoteId));
      if (!targetQuote) {
        return undefined;
      }

      const parentId = targetQuote.parentQuoteId || targetQuote.id;
      const versionFamilyFilter = or(
        eq(quotes.id, parentId),
        eq(quotes.parentQuoteId, parentId)
      );

      await tx
        .update(quotes)
        .set({ isLatestVersion: false, updatedAt: new Date() })
        .where(versionFamilyFilter);

      const [updatedQuote] = await tx
        .update(quotes)
        .set({ isLatestVersion: true, updatedAt: new Date() })
        .where(eq(quotes.id, quoteId))
        .returning();

      return updatedQuote || undefined;
    });
  }

  async markPreviousVersionsAsOld(parentQuoteId: number): Promise<void> {
    await db
      .update(quotes)
      .set({ isLatestVersion: false })
      .where(
        or(
          eq(quotes.id, parentQuoteId),
          eq(quotes.parentQuoteId, parentQuoteId)
        )
      );
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
        configData: groups.configData,
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
    await ensureProductCatalogColumns();
    // Order by manufacturer field
    return await db
      .select()
      .from(products)
      .orderBy(products.manufacturer, products.category, products.sku, products.name);
  }

  async getProduct(id: number): Promise<Product | undefined> {
    await ensureProductCatalogColumns();
    // Return product data
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product || undefined;
  }

  async createProduct(insertProduct: InsertProduct): Promise<Product> {
    await ensureProductCatalogColumns();
    // Strip any validation metadata field if present
    const { _categoryValidation, ...cleanProduct } = insertProduct as any;
    
    const productData = applySundanceSkuDefault(normalizeProductPricingPayload({ ...cleanProduct }));
    
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
    await ensureProductCatalogColumns();
    // Strip any validation metadata field if present
    const { _categoryValidation, ...cleanProductData } = productData as any;
    
    const existingProduct = await this.getProduct(id);
    const updateData = applySundanceSkuDefault(
      normalizeProductPricingPayload({ ...cleanProductData }, existingProduct),
      existingProduct,
    );
    
    const [updated] = await db
      .update(products)
      .set(updateData)
      .where(eq(products.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteProduct(id: number): Promise<boolean> {
    await ensureProductCatalogColumns();
    const result = await db.delete(products).where(eq(products.id, id));
    return (result.rowCount || 0) > 0;
  }

  async bulkUpdateProducts(productIds: number[], updates: Partial<InsertProduct>): Promise<number> {
    await ensureProductCatalogColumns();
    // Strip any validation metadata field if present
    const { _categoryValidation, ...cleanUpdates } = updates as any;
    
    if (
      cleanUpdates.costPrice !== undefined ||
      cleanUpdates.cost !== undefined ||
      cleanUpdates.retailPrice !== undefined ||
      cleanUpdates.defaultDiscountType !== undefined ||
      cleanUpdates.defaultDiscountValue !== undefined
    ) {
      const currentProducts = await db
        .select()
        .from(products)
        .where(inArray(products.id, productIds));

      const updated = await db.transaction(async (tx) => {
        const results = [];
        for (const product of currentProducts) {
          const updateData = applySundanceSkuDefault(
            normalizeProductPricingPayload({ ...cleanUpdates }, product),
            product,
          );
          const [result] = await tx
            .update(products)
            .set(updateData)
            .where(eq(products.id, product.id))
            .returning();
          if (result) results.push(result);
        }
        return results;
      });

      return updated.length;
    }

    const currentProducts = await db
      .select()
      .from(products)
      .where(inArray(products.id, productIds));

    const updated = await db.transaction(async (tx) => {
      const results = [];
      for (const product of currentProducts) {
        const updateData = applySundanceSkuDefault({ ...cleanUpdates }, product);
        const [result] = await tx
          .update(products)
          .set(updateData)
          .where(eq(products.id, product.id))
          .returning();
        if (result) results.push(result);
      }
      return results;
    });

    return updated.length;
  }

  async getPricingDefault(scope: string): Promise<PricingDefault | undefined> {
    await ensurePricingDefaultsTable();
    const [pricingDefault] = await db
      .select()
      .from(pricingDefaults)
      .where(eq(pricingDefaults.scope, scope))
      .limit(1);
    return pricingDefault || undefined;
  }

  async upsertPricingDefault(
    scope: string,
    pricingDefault: { markupType: "percentage"; markupValue: string }
  ): Promise<PricingDefault> {
    await ensurePricingDefaultsTable();
    const [saved] = await db
      .insert(pricingDefaults)
      .values({
        scope,
        markupType: pricingDefault.markupType,
        markupValue: pricingDefault.markupValue,
      })
      .onConflictDoUpdate({
        target: pricingDefaults.scope,
        set: {
          markupType: pricingDefault.markupType,
          markupValue: pricingDefault.markupValue,
          updatedAt: new Date(),
        },
      })
      .returning();

    return saved;
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

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
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

    return {
      ...product,
      pricingTables: productPricingTables,
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
    // Note: All dimensions are expected in inches
    // Pricing tables store all dimensions in inches for consistency across products
    
    // Find the pricing band that contains the given dimensions
    const pricingTablesForProduct = await db
      .select()
      .from(pricingTables)
      .where(eq(pricingTables.productId, productId));

    if (pricingTablesForProduct.length === 0) {
      return null;
    }

    // Find band that contains the requested dimensions (in inches)
    const matchingBand = pricingTablesForProduct.find(table => {
      const lengthMin = parseFloat(table.lengthMin);
      const lengthMax = parseFloat(table.lengthMax);
      const widthMin = parseFloat(table.widthMin);
      const widthMax = parseFloat(table.widthMax);
      
      return length >= lengthMin && length <= lengthMax && 
             width >= widthMin && width <= widthMax;
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
      
      const lengthDiff = Math.abs(lengthCenter - length);
      const widthDiff = Math.abs(widthCenter - width);
      const distance = Math.sqrt(lengthDiff * lengthDiff + widthDiff * widthDiff);

      if (distance < minDistance) {
        minDistance = distance;
        closestTable = table;
      }
    }

    return parseFloat(closestTable.basePrice);
  }

  // Color methods
  async getAllColors(): Promise<Color[]> {
    return await db.select().from(colors).orderBy(asc(colors.name));
  }

  async getColor(id: number): Promise<Color | undefined> {
    const [color] = await db.select().from(colors).where(eq(colors.id, id));
    return color || undefined;
  }

  async createColor(insertColor: InsertColor): Promise<Color> {
    const [color] = await db.insert(colors).values(insertColor).returning();
    return color;
  }

  async updateColor(id: number, colorData: Partial<InsertColor>): Promise<Color | undefined> {
    const [updated] = await db
      .update(colors)
      .set(colorData)
      .where(eq(colors.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteColor(id: number): Promise<boolean> {
    const result = await db.delete(colors).where(eq(colors.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Product color methods
  async getProductColors(productId: number): Promise<(ProductColor & { color: Color })[]> {
    const productColorLinks = await db
      .select({
        id: productColors.id,
        productId: productColors.productId,
        colorId: productColors.colorId,
        createdAt: productColors.createdAt,
        color: colors,
      })
      .from(productColors)
      .leftJoin(colors, eq(productColors.colorId, colors.id))
      .where(eq(productColors.productId, productId));

    return productColorLinks as (ProductColor & { color: Color })[];
  }

  async getBatchProductColors(productIds: number[]): Promise<Record<number, (ProductColor & { color: Color })[]>> {
    if (productIds.length === 0) {
      return {};
    }

    const productColorLinks = await db
      .select({
        id: productColors.id,
        productId: productColors.productId,
        colorId: productColors.colorId,
        createdAt: productColors.createdAt,
        color: colors,
      })
      .from(productColors)
      .leftJoin(colors, eq(productColors.colorId, colors.id))
      .where(inArray(productColors.productId, productIds));

    // Group by productId
    const result: Record<number, (ProductColor & { color: Color })[]> = {};
    for (const link of productColorLinks as (ProductColor & { color: Color })[]) {
      if (!result[link.productId]) {
        result[link.productId] = [];
      }
      result[link.productId].push(link);
    }

    return result;
  }

  async createProductColor(insertProductColor: InsertProductColor): Promise<ProductColor> {
    const [productColor] = await db
      .insert(productColors)
      .values(insertProductColor)
      .returning();
    return productColor;
  }

  async deleteProductColor(id: number): Promise<boolean> {
    const result = await db.delete(productColors).where(eq(productColors.id, id));
    return (result.rowCount || 0) > 0;
  }

  async deleteProductColorsByProductId(productId: number): Promise<boolean> {
    const result = await db.delete(productColors).where(eq(productColors.productId, productId));
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
