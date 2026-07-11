import {
  accounts,
  customers,
  quotes,
  quoteVersionEvents,
  emailDeliveryAttempts,
  businessEvents,
  planningAgreements,
  planningAgreementEvents,
  quoteApprovalDrawings,
  lineItems,
  groups,
  products,
  pricingDefaults,
  users,
  contractTemplates,
  pricingTables,
  colors,
  productColors,
  quoteCoverPhotos,
  quoteProductRenderings,
  leadAttachments,
  type Account,
  type Customer,
  type Quote,
  type QuoteVersionEvent,
  type EmailDeliveryAttempt,
  type BusinessEvent,
  type PlanningAgreement,
  type PlanningAgreementEvent,
  type QuoteApprovalDrawing,
  type LineItem,
  type Group,
  type Product,
  type PricingDefault,
  type User,
  type ContractTemplate,
  type PricingTable,
  type Color,
  type ProductColor,
  type QuoteCoverPhoto,
  type QuoteProductRendering,
  type LeadAttachment,
  type InsertAccount,
  type InsertCustomer,
  type InsertQuote,
  type InsertPlanningAgreement,
  type InsertPlanningAgreementEvent,
  type InsertQuoteApprovalDrawing,
  type InsertLineItem,
  type InsertGroup,
  type InsertProduct,
  type InsertUser,
  type InsertContractTemplate,
  type InsertPricingTable,
  type InsertColor,
  type InsertProductColor,
  type InsertQuoteCoverPhoto,
  type InsertQuoteProductRendering,
  type InsertLeadAttachment,
  type QuoteWithDetails,
  type ProductWithDetails
} from "@shared/schema";
import { db, ensureLeadAttachmentTable, ensurePlanningAgreementTables, ensurePricingDefaultsTable, ensureProductCatalogColumns, ensureQuoteApprovalDrawingTables, ensureSignatureAuditColumns, pool } from "./db";
import { eq, desc, asc, inArray, sql, and, ne, or, ilike, isNull, lte, gte } from "drizzle-orm";
import { scrypt, randomBytes, timingSafeEqual, createHash } from "crypto";
import { promisify } from "util";
import connectPg from "connect-pg-simple";
import session from "express-session";
import { calculateCostFromMsrpAndDiscount, deriveProductCostFields } from "@shared/pricing";
import { applySundanceSkuDefault } from "./sundanceSku";
import {
  createDefaultApprovalDrawingData,
  getApprovalDrawingReadiness,
  sanitizeQuoteApprovalDrawingForPublic,
} from "@shared/approvalDrawing";
import { appendQuoteApprovalDrawingInternalNoteSql } from "./approvalDrawingSql";
import type { AdoptionSummary, EmailDeliveryClaim, EmailDeliveryHealth, EmailDeliveryMessageType, IStorage } from "./storageContract";
import { appendBusinessEvent, type BusinessEventInput, type BusinessEventType } from "./businessEvents";
import { assertQuoteMutationAllowed, assertQuoteSignatureRevision, isCustomerApprovedQuote, type QuoteUpdateOptions } from "./quoteLock";
import { selectPricingBand, validatePricingBands } from "./pricingBands";
import { executeProductCatalogImport, type ProductCatalogImportRequest, type ProductCatalogImportResult } from "./productCatalogImport";
import { executeConfiguredProductInsertion, type ConfiguredProductInsertionRequest, type ConfiguredProductInsertionResult } from "./configuredProductInsertion";

export type { IStorage } from "./storageContract";

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

    // retail_price replaced default_unit_price, but the legacy non-null column
    // is intentionally retained for compatibility. Keep it synchronized on
    // every retail-price write instead of allowing modern catalog writes to
    // fail or leave older readers with stale values.
    if (hasRetail || !existingProduct) {
      normalized.defaultUnitPrice = retailPrice;
    }

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
type QuoteApprovalDrawingUpdate = Partial<InsertQuoteApprovalDrawing>;

async function touchQuoteRevision(tx: any, quoteId: number): Promise<void> {
  await tx
    .update(quotes)
    .set({
      updatedAt: sql`GREATEST(CURRENT_TIMESTAMP, COALESCE(${quotes.updatedAt}, CURRENT_TIMESTAMP) + INTERVAL '1 millisecond')`,
    })
    .where(eq(quotes.id, quoteId));
}

function mergeSignatureAuditTrail(
  existingValue: unknown,
  incomingValue: unknown,
  mutationKind: "customer_signature" | "company_signature",
): unknown {
  const existing = existingValue && typeof existingValue === "object"
    ? existingValue as Record<string, any>
    : {};
  const incoming = incomingValue && typeof incomingValue === "object"
    ? incomingValue as Record<string, any>
    : {};
  const incomingEntries = Array.isArray(incoming.entries) ? incoming.entries : [];
  const newEntry = incomingEntries.at(-1);
  const expectedEvent = mutationKind === "customer_signature" ? "client_signed" : "company_signed";
  if (!newEntry || newEntry.event !== expectedEvent) {
    throw new Error(`${mutationKind} requires one append-only ${expectedEvent} audit entry`);
  }

  const existingEntries = Array.isArray(existing.entries) ? existing.entries : [];
  const entryKey = (entry: any) => JSON.stringify([
    entry?.event,
    entry?.signerType,
    entry?.signedAt,
    entry?.signerName,
  ]);
  const existingKeys = new Set(existingEntries.map(entryKey));
  const mergedEntries = existingKeys.has(entryKey(newEntry))
    ? existingEntries
    : [...existingEntries, newEntry];

  return {
    ...existing,
    ...incoming,
    documentFingerprint: mutationKind === "customer_signature"
      ? incoming.documentFingerprint
      : existing.documentFingerprint || incoming.documentFingerprint,
    entries: mergedEntries,
  };
}


export class DatabaseStorage implements IStorage {
  sessionStore: any;

  constructor() {
    // Initialize session store synchronously - imports are at top of file
    const PostgresSessionStore = connectPg(session);
    this.sessionStore = new PostgresSessionStore({
      // The Neon Pool is runtime-compatible with node-postgres for this store,
      // but its public type omits node-postgres implementation fields.
      pool: pool as any,
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
        manufacturer: lineItems.manufacturer,
        unit: lineItems.unit,
        priceSource: lineItems.priceSource,
        sourceMetadata: lineItems.sourceMetadata,
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
      manufacturer: item.manufacturer || item.productManufacturer || "Uncategorized",
      unit: item.unit,
      priceSource: item.priceSource,
      sourceMetadata: item.sourceMetadata,
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
    }));

    // Get contract template if referenced
    let contractTemplate: ContractTemplate | undefined;
    if (quote.contractTemplateId) {
      [contractTemplate] = await db.select().from(contractTemplates).where(eq(contractTemplates.id, quote.contractTemplateId));
    }

    const [planningAgreement, approvalDrawing, quoteGroups, coverPhoto, productRenderings] = await Promise.all([
      this.getPlanningAgreementByQuoteFamilyRootId(getQuoteFamilyRootId(quote)),
      this.getQuoteApprovalDrawingByQuoteId(quote.id),
      this.getGroupsByQuoteId(quote.id),
      this.getQuoteCoverPhoto(quote.id),
      this.getQuoteProductRenderings(quote.id),
    ]);

    return {
      ...quote,
      account,
      customer: account, // Legacy alias for backward compatibility
      lineItems: quoteLineItems,
      groups: quoteGroups,
      contractTemplate,
      coverPhoto,
      productRenderings,
      planningAgreement,
      approvalDrawing,
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
        manufacturer: lineItems.manufacturer,
        unit: lineItems.unit,
        priceSource: lineItems.priceSource,
        sourceMetadata: lineItems.sourceMetadata,
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
      manufacturer: item.manufacturer || item.productManufacturer || "Uncategorized",
      unit: item.unit,
      priceSource: item.priceSource,
      sourceMetadata: item.sourceMetadata,
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
    }));

    // Get contract template if referenced
    let contractTemplate: ContractTemplate | undefined;
    if (quote.contractTemplateId) {
      [contractTemplate] = await db.select().from(contractTemplates).where(eq(contractTemplates.id, quote.contractTemplateId));
    }

    const [planningAgreement, approvalDrawing, quoteGroups, coverPhoto, productRenderings] = await Promise.all([
      this.getPlanningAgreementByQuoteFamilyRootId(getQuoteFamilyRootId(quote)),
      this.getQuoteApprovalDrawingByQuoteId(quote.id),
      this.getGroupsByQuoteId(quote.id),
      this.getQuoteCoverPhoto(quote.id),
      this.getQuoteProductRenderings(quote.id),
    ]);

    return {
      ...quote,
      account,
      customer: account, // Legacy alias for backward compatibility
      lineItems: quoteLineItems,
      groups: quoteGroups,
      contractTemplate,
      coverPhoto,
      productRenderings,
      planningAgreement,
      approvalDrawing,
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

    const [accountsList, contractTemplatesList, lineItemRows, planningAgreementRows, approvalDrawingRows] = await Promise.all([
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
          manufacturer: lineItems.manufacturer,
          unit: lineItems.unit,
          priceSource: lineItems.priceSource,
          sourceMetadata: lineItems.sourceMetadata,
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
      this.getQuoteApprovalDrawingsByQuoteIds(quoteIds),
    ]);

    const accountMap = new Map(accountsList.map(account => [account.id, account]));
    const contractTemplateMap = new Map(contractTemplatesList.map(template => [template.id, template]));
    const planningAgreementMap = new Map<number, PlanningAgreement>();
    for (const agreement of planningAgreementRows) {
      if (agreement.quoteFamilyRootId && !planningAgreementMap.has(agreement.quoteFamilyRootId)) {
        planningAgreementMap.set(agreement.quoteFamilyRootId, agreement);
      }
    }
    const approvalDrawingMap = new Map<number, QuoteApprovalDrawing>();
    for (const drawing of approvalDrawingRows) {
      if (!approvalDrawingMap.has(drawing.quoteId)) {
        approvalDrawingMap.set(drawing.quoteId, drawing);
      }
    }

    const lineItemsByQuoteId = new Map<number, QuoteWithDetails["lineItems"]>();
    for (const item of lineItemRows) {
      const normalizedItem = {
        id: item.id,
        quoteId: item.quoteId,
        productId: item.productId,
        manufacturer: item.manufacturer || item.productManufacturer || "Uncategorized",
        unit: item.unit,
        priceSource: item.priceSource,
        sourceMetadata: item.sourceMetadata,
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
      const approvalDrawing = approvalDrawingMap.get(quote.id);

      return {
        ...quote,
        account,
        customer: account, // Legacy alias for backward compatibility
        lineItems: quoteLineItems,
        contractTemplate,
        planningAgreement,
        approvalDrawing,
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

  async updateQuote(id: number, quoteData: Partial<InsertQuote>, options: QuoteUpdateOptions = {}): Promise<Quote | undefined> {
    await ensureSignatureAuditColumns();
    return db.transaction(async (tx) => {
      const [existingQuote] = await tx
        .select()
        .from(quotes)
        .where(eq(quotes.id, id))
        .for("update");
      
      if (!existingQuote) {
        return undefined;
      }

      assertQuoteMutationAllowed(existingQuote, quoteData, options.mutationKind);
      if (options.mutationKind === "customer_signature") {
        assertQuoteSignatureRevision(existingQuote, options.expectedUpdatedAt);
      }

      const finalQuoteData = { ...quoteData };
      if (
        (options.mutationKind === "customer_signature" || options.mutationKind === "company_signature")
        && quoteData.signatureAuditTrail !== undefined
      ) {
        finalQuoteData.signatureAuditTrail = mergeSignatureAuditTrail(
          existingQuote.signatureAuditTrail,
          quoteData.signatureAuditTrail,
          options.mutationKind,
        ) as InsertQuote["signatureAuditTrail"];
      }

      if (quoteData.quoteNumber && quoteData.quoteNumber !== existingQuote.quoteNumber) {
        const [duplicateQuote] = await tx
          .select()
          .from(quotes)
          .where(eq(quotes.quoteNumber, quoteData.quoteNumber))
          .limit(1);

        if (duplicateQuote) {
          console.error(`Cannot update quote ${id}: Quote number ${quoteData.quoteNumber} already exists`);
          throw new Error(`Quote number ${quoteData.quoteNumber} already exists. Please use a different quote number.`);
        }
      }

      const [updated] = await tx
        .update(quotes)
        .set({ ...finalQuoteData, updatedAt: new Date() })
        .where(eq(quotes.id, id))
        .returning();

      if (updated && options.mutationKind === "package_preparation") {
        const packageIdentity = createHash("sha256")
          .update(JSON.stringify({
            quoteId: updated.id,
            signingToken: updated.signingToken,
            includePricing: updated.esigIncludePricing,
            includeImages: updated.esigIncludeImages,
            includeContract: updated.esigIncludeContract,
            includeApprovalDrawing: updated.esigIncludeApprovalDrawing,
          }))
          .digest("hex");
        await appendBusinessEvent(tx, {
          eventType: "customer_package_prepared",
          eventKey: `customer_package_prepared:${packageIdentity}`,
          quoteId: updated.id,
          accountId: updated.accountId,
          actorUserId: options.actorUserId,
          occurredAt: updated.updatedAt ?? new Date(),
        });
      }
      if (updated && options.mutationKind === "customer_signature" && updated.clientSignedAt) {
        await appendBusinessEvent(tx, {
          eventType: "quote_customer_signed",
          eventKey: `quote_customer_signed:${updated.id}:${updated.clientSignedAt.toISOString()}`,
          quoteId: updated.id,
          accountId: updated.accountId,
          occurredAt: updated.clientSignedAt,
        });
      }
      if (updated && options.mutationKind === "company_signature" && updated.companySignedAt) {
        await appendBusinessEvent(tx, {
          eventType: "quote_company_signed",
          eventKey: `quote_company_signed:${updated.id}:${updated.companySignedAt.toISOString()}`,
          quoteId: updated.id,
          accountId: updated.accountId,
          actorUserId: options.actorUserId,
          occurredAt: updated.companySignedAt,
        });
      }
      return updated || undefined;
    });
  }

  async claimEmailDelivery(input: {
    idempotencyKey: string;
    messageType: EmailDeliveryMessageType;
    quoteId?: number | null;
    planningAgreementId?: number | null;
  }): Promise<EmailDeliveryClaim> {
    return db.transaction(async (tx) => {
      const [created] = await tx
        .insert(emailDeliveryAttempts)
        .values({
          idempotencyKey: input.idempotencyKey,
          messageType: input.messageType,
          quoteId: input.quoteId ?? null,
          planningAgreementId: input.planningAgreementId ?? null,
          status: "pending",
        })
        .onConflictDoNothing({ target: emailDeliveryAttempts.idempotencyKey })
        .returning();

      if (created) return { outcome: "claimed", attempt: created };

      const [existing] = await tx
        .select()
        .from(emailDeliveryAttempts)
        .where(eq(emailDeliveryAttempts.idempotencyKey, input.idempotencyKey))
        .for("update");

      if (!existing) return { outcome: "conflict" };
      const sameOperation = existing.messageType === input.messageType
        && (existing.quoteId ?? null) === (input.quoteId ?? null)
        && (existing.planningAgreementId ?? null) === (input.planningAgreementId ?? null);
      if (!sameOperation) return { outcome: "conflict", attempt: existing };
      if (existing.status === "sent") return { outcome: "sent", attempt: existing };
      if (existing.status === "pending") return { outcome: "in_progress", attempt: existing };

      const [retried] = await tx
        .update(emailDeliveryAttempts)
        .set({
          status: "pending",
          attemptCount: sql`${emailDeliveryAttempts.attemptCount} + 1`,
          lastErrorType: null,
          updatedAt: new Date(),
        })
        .where(eq(emailDeliveryAttempts.id, existing.id))
        .returning();
      return { outcome: "claimed", attempt: retried };
    });
  }

  async getEmailDeliveryAttempt(id: number): Promise<EmailDeliveryAttempt | undefined> {
    const [attempt] = await db
      .select()
      .from(emailDeliveryAttempts)
      .where(eq(emailDeliveryAttempts.id, id))
      .limit(1);
    return attempt;
  }

  async markEmailDeliverySent(
    id: number,
    sentAt: Date,
    providerMessageId?: string | null,
  ): Promise<EmailDeliveryAttempt | undefined> {
    const [updated] = await db
      .update(emailDeliveryAttempts)
      .set({
        status: "sent",
        providerMessageId: providerMessageId ?? null,
        lastErrorType: null,
        sentAt,
        updatedAt: new Date(),
      })
      .where(and(eq(emailDeliveryAttempts.id, id), eq(emailDeliveryAttempts.status, "pending")))
      .returning();
    return updated;
  }

  async markEmailDeliveryFailed(id: number, errorType: string): Promise<EmailDeliveryAttempt | undefined> {
    const [updated] = await db
      .update(emailDeliveryAttempts)
      .set({ status: "failed", lastErrorType: errorType, updatedAt: new Date() })
      .where(and(eq(emailDeliveryAttempts.id, id), eq(emailDeliveryAttempts.status, "pending")))
      .returning();
    return updated;
  }

  async getEmailDeliveryHealth(options: {
    staleAfterMinutes?: number;
    limit?: number;
  } = {}): Promise<EmailDeliveryHealth> {
    const staleAfterMinutes = Math.min(24 * 60, Math.max(1, options.staleAfterMinutes ?? 15));
    const limit = Math.min(100, Math.max(1, options.limit ?? 50));
    const asOf = new Date();
    const staleBefore = new Date(asOf.getTime() - staleAfterMinutes * 60_000);
    const last24Hours = new Date(asOf.getTime() - 24 * 60 * 60_000);
    const activityTimestamp = sql<Date>`coalesce(${emailDeliveryAttempts.updatedAt}, ${emailDeliveryAttempts.createdAt})`;
    const staleCondition = or(
      lte(emailDeliveryAttempts.updatedAt, staleBefore),
      and(isNull(emailDeliveryAttempts.updatedAt), lte(emailDeliveryAttempts.createdAt, staleBefore)),
    );

    const statusCounts = await db
      .select({
        status: emailDeliveryAttempts.status,
        count: sql<number>`count(*)::int`,
      })
      .from(emailDeliveryAttempts)
      .groupBy(emailDeliveryAttempts.status);

    const [staleCounts] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(emailDeliveryAttempts)
      .where(and(eq(emailDeliveryAttempts.status, "pending"), staleCondition));

    const [sentLast24HoursCounts] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(emailDeliveryAttempts)
      .where(and(
        eq(emailDeliveryAttempts.status, "sent"),
        sql`${emailDeliveryAttempts.sentAt} >= ${last24Hours}`,
      ));

    const attention = await db
      .select({
        id: emailDeliveryAttempts.id,
        messageType: emailDeliveryAttempts.messageType,
        quoteId: emailDeliveryAttempts.quoteId,
        planningAgreementId: emailDeliveryAttempts.planningAgreementId,
        status: emailDeliveryAttempts.status,
        attemptCount: emailDeliveryAttempts.attemptCount,
        lastErrorType: emailDeliveryAttempts.lastErrorType,
        createdAt: emailDeliveryAttempts.createdAt,
        updatedAt: emailDeliveryAttempts.updatedAt,
      })
      .from(emailDeliveryAttempts)
      .where(or(
        eq(emailDeliveryAttempts.status, "failed"),
        and(eq(emailDeliveryAttempts.status, "pending"), staleCondition),
      ))
      .orderBy(asc(activityTimestamp), asc(emailDeliveryAttempts.id))
      .limit(limit);

    const countByStatus = new Map(statusCounts.map((row) => [row.status, Number(row.count)]));
    const summary = {
      pending: countByStatus.get("pending") ?? 0,
      stalePending: Number(staleCounts?.count ?? 0),
      failed: countByStatus.get("failed") ?? 0,
      sent: countByStatus.get("sent") ?? 0,
      sentLast24Hours: Number(sentLast24HoursCounts?.count ?? 0),
    };
    const attentionTotal = summary.failed + summary.stalePending;

    return {
      asOf,
      staleAfterMinutes,
      summary,
      attentionTotal,
      attentionTruncated: attentionTotal > attention.length,
      attention: attention.map((attempt) => ({
        ...attempt,
        messageType: attempt.messageType as EmailDeliveryMessageType,
        status: attempt.status as "pending" | "failed",
      })),
    };
  }

  async recordBusinessEvent(input: BusinessEventInput): Promise<BusinessEvent | undefined> {
    return appendBusinessEvent(db, input);
  }

  async importProductCatalog(
    input: ProductCatalogImportRequest,
    actorUserId?: number | null,
  ): Promise<ProductCatalogImportResult> {
    return executeProductCatalogImport(input, actorUserId);
  }

  async insertConfiguredProduct(
    quoteId: number,
    input: ConfiguredProductInsertionRequest,
    actorUserId?: number | null,
  ): Promise<ConfiguredProductInsertionResult> {
    return executeConfiguredProductInsertion(quoteId, input, actorUserId);
  }

  async getAdoptionSummary(options: { windowDays?: number } = {}): Promise<AdoptionSummary> {
    const windowDays = Math.min(365, Math.max(1, options.windowDays ?? 30));
    const asOf = new Date();
    const windowStart = new Date(asOf.getTime() - windowDays * 24 * 60 * 60_000);

    const eventCounts = await db
      .select({
        eventType: businessEvents.eventType,
        count: sql<number>`count(*)::int`,
      })
      .from(businessEvents)
      .where(gte(businessEvents.occurredAt, windowStart))
      .groupBy(businessEvents.eventType);
    const eventFirstRecorded = await db
      .select({
        eventType: businessEvents.eventType,
        firstRecordedAt: sql<Date | null>`min(${businessEvents.occurredAt})`,
      })
      .from(businessEvents)
      .groupBy(businessEvents.eventType);

    const [approvalEmailCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(emailDeliveryAttempts)
      .where(and(
        eq(emailDeliveryAttempts.messageType, "quote_signature_request"),
        eq(emailDeliveryAttempts.status, "sent"),
        gte(emailDeliveryAttempts.sentAt, windowStart),
      ));
    const [approvalEmailFirst] = await db
      .select({ firstRecordedAt: sql<Date | null>`min(${emailDeliveryAttempts.sentAt})` })
      .from(emailDeliveryAttempts)
      .where(and(
        eq(emailDeliveryAttempts.messageType, "quote_signature_request"),
        eq(emailDeliveryAttempts.status, "sent"),
      ));

    const [versionCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(quoteVersionEvents)
      .where(and(
        eq(quoteVersionEvents.eventType, "version_created"),
        gte(quoteVersionEvents.createdAt, windowStart),
      ));
    const [versionFirst] = await db
      .select({ firstRecordedAt: sql<Date | null>`min(${quoteVersionEvents.createdAt})` })
      .from(quoteVersionEvents)
      .where(eq(quoteVersionEvents.eventType, "version_created"));

    // Aggregate timestamp expressions do not inherit Drizzle's column decoder,
    // so PostgreSQL-compatible drivers may return them as strings.
    const asDate = (value: Date | string | null | undefined): Date | null =>
      value == null ? null : value instanceof Date ? value : new Date(value);
    const countByEvent = new Map(eventCounts.map((row) => [row.eventType, Number(row.count)]));
    const firstByEvent = new Map(eventFirstRecorded.map((row) => [row.eventType, asDate(row.firstRecordedAt)]));
    const definitions: Array<{
      key: BusinessEventType;
      label: string;
    }> = [
      { key: "customer_package_prepared", label: "Customer packages prepared" },
      { key: "quote_customer_signed", label: "Customer approvals completed" },
      { key: "quote_company_signed", label: "EDG signatures completed" },
      { key: "lead_converted_to_quote", label: "Lead inquiries converted to quotes" },
      { key: "quote_import_completed", label: "Quote import actions completed" },
      { key: "dimensional_price_resolved", label: "Exact dimensional prices resolved" },
      { key: "product_catalog_import_completed", label: "Product catalog imports completed" },
      { key: "sundance_configuration_inserted", label: "Sundance packages inserted" },
    ];

    return {
      asOf,
      windowDays,
      windowStart,
      historicalCoverage: "post_instrumentation_only",
      metrics: [
        ...definitions.map((definition) => ({
          key: definition.key,
          label: definition.label,
          count: countByEvent.get(definition.key) ?? 0,
          firstRecordedAt: firstByEvent.get(definition.key) ?? null,
          source: "business_events" as const,
        })),
        {
          key: "approval_email_accepted" as const,
          label: "Approval emails accepted by provider",
          count: Number(approvalEmailCount?.count ?? 0),
          firstRecordedAt: asDate(approvalEmailFirst?.firstRecordedAt),
          source: "email_delivery_attempts" as const,
        },
        {
          key: "quote_version_created" as const,
          label: "Quote versions created",
          count: Number(versionCount?.count ?? 0),
          firstRecordedAt: asDate(versionFirst?.firstRecordedAt),
          source: "quote_version_events" as const,
        },
      ],
    };
  }

  async deleteQuote(id: number): Promise<boolean> {
    return db.transaction(async (tx) => {
      const [existingQuote] = await tx
        .select()
        .from(quotes)
        .where(eq(quotes.id, id))
        .for("update");
      if (!existingQuote) return false;

      assertQuoteMutationAllowed(existingQuote);
      await tx.delete(lineItems).where(eq(lineItems.quoteId, id));
      const result = await tx.delete(quotes).where(eq(quotes.id, id));
      return (result.rowCount || 0) > 0;
    });
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

  async applyPlanningAgreementCredit(
    id: number,
    quoteId: number,
    amountValue: string,
    actorUserId?: number | null,
  ): Promise<PlanningAgreement | undefined> {
    await ensurePlanningAgreementTables();
    return db.transaction(async (tx) => {
      const [targetQuote] = await tx.select().from(quotes).where(eq(quotes.id, quoteId)).for("update");
      if (!targetQuote) throw new Error("Target quote not found");
      assertQuoteMutationAllowed(targetQuote);

      const [agreement] = await tx
        .select()
        .from(planningAgreements)
        .where(eq(planningAgreements.id, id))
        .for("update");
      if (!agreement) return undefined;
      if (!agreement.creditEligible) throw new Error("This planning agreement is not credit eligible.");
      if (agreement.creditedAt || agreement.status === "credited") {
        throw new Error("Planning credit has already been recorded.");
      }
      if (!agreement.paymentConfirmedAt && !["paid_active", "delivered"].includes(agreement.status)) {
        throw new Error("Confirm payment before applying a planning credit.");
      }
      if (agreement.creditExpiresAt && agreement.creditExpiresAt < new Date()) {
        throw new Error("This planning credit is expired.");
      }

      const targetRootId = getQuoteFamilyRootId(targetQuote);
      if (agreement.quoteFamilyRootId && agreement.quoteFamilyRootId !== targetRootId) {
        throw new Error("Planning credits can only be applied within the same quote family.");
      }
      const amount = Number(amountValue);
      const feeAmount = Number(agreement.amount);
      if (!Number.isFinite(amount) || amount < 0) throw new Error("Planning credit amount is invalid.");
      if (Number.isFinite(feeAmount) && amount > feeAmount) {
        throw new Error("Planning credit cannot exceed the confirmed planning fee.");
      }

      const now = new Date();
      const [updated] = await tx
        .update(planningAgreements)
        .set({
          status: "credited",
          creditedQuoteId: targetQuote.id,
          creditedAt: now,
          appliedCreditAmount: amountValue,
          updatedAt: now,
        })
        .where(eq(planningAgreements.id, id))
        .returning();

      await tx.insert(planningAgreementEvents).values({
        planningAgreementId: id,
        eventType: "credit_applied",
        actorUserId: actorUserId ?? null,
        fromStatus: agreement.status,
        toStatus: "credited",
        payload: {
          creditedQuoteId: targetQuote.id,
          appliedCreditAmount: amountValue,
        },
      });
      await touchQuoteRevision(tx, targetQuote.id);
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

  private async getQuoteApprovalDrawingsByQuoteIds(quoteIds: number[]): Promise<QuoteApprovalDrawing[]> {
    if (quoteIds.length === 0) return [];
    await ensureQuoteApprovalDrawingTables();
    return db
      .select()
      .from(quoteApprovalDrawings)
      .where(and(
        inArray(quoteApprovalDrawings.quoteId, quoteIds),
        ne(quoteApprovalDrawings.status, "superseded")
      ))
      .orderBy(asc(quoteApprovalDrawings.quoteId), desc(quoteApprovalDrawings.createdAt), desc(quoteApprovalDrawings.id));
  }

  private async markApprovalDrawingRevisionNeededForQuote(quoteId: number, reason: string): Promise<void> {
    await ensureQuoteApprovalDrawingTables();
    const now = new Date();
    const note = `Revision needed: ${reason}`;
    const internalNotes = appendQuoteApprovalDrawingInternalNoteSql(note);
    await db
      .update(quoteApprovalDrawings)
      .set({
        status: "revision_needed",
        orderStatus: "blocked",
        publicSnapshot: null,
        internalNotes,
        updatedAt: now,
      })
      .where(and(
        eq(quoteApprovalDrawings.quoteId, quoteId),
        inArray(quoteApprovalDrawings.status, ["ready_for_agreement", "sent_for_signature"])
      ));

    await db
      .update(quoteApprovalDrawings)
      .set({
        orderStatus: "blocked",
        orderReadyBy: null,
        orderReadyAt: null,
        orderReadyOverrideReason: null,
        internalNotes,
        updatedAt: now,
      })
      .where(and(
        eq(quoteApprovalDrawings.quoteId, quoteId),
        eq(quoteApprovalDrawings.status, "signed_locked")
      ));
  }

  async getQuoteApprovalDrawing(id: number): Promise<QuoteApprovalDrawing | undefined> {
    await ensureQuoteApprovalDrawingTables();
    const [drawing] = await db
      .select()
      .from(quoteApprovalDrawings)
      .where(eq(quoteApprovalDrawings.id, id))
      .limit(1);
    return drawing || undefined;
  }

  async getQuoteApprovalDrawingByQuoteId(quoteId: number): Promise<QuoteApprovalDrawing | undefined> {
    const [drawing] = await this.getQuoteApprovalDrawingsByQuoteIds([quoteId]);
    return drawing || undefined;
  }

  async createQuoteApprovalDrawing(
    insertDrawing: InsertQuoteApprovalDrawing,
    actorUserId?: number | null,
  ): Promise<QuoteApprovalDrawing> {
    await ensureQuoteApprovalDrawingTables();
    return db.transaction(async (tx) => {
      const [quote] = await tx.select().from(quotes).where(eq(quotes.id, insertDrawing.quoteId)).for("update");
      if (!quote) throw new Error("Quote not found for approval drawing");
      assertQuoteMutationAllowed(quote);

      const [drawing] = await tx
        .insert(quoteApprovalDrawings)
        .values({
          ...insertDrawing,
          quoteFamilyRootId: insertDrawing.quoteFamilyRootId ?? getQuoteFamilyRootId(quote),
          drawingData: insertDrawing.drawingData ?? createDefaultApprovalDrawingData(),
          title: insertDrawing.title || "Order Approval Drawing",
          status: insertDrawing.status || "draft",
          orderStatus: insertDrawing.orderStatus || "not_reviewed",
          createdBy: insertDrawing.createdBy ?? actorUserId ?? null,
          updatedBy: insertDrawing.updatedBy ?? actorUserId ?? null,
          updatedAt: new Date(),
        })
        .returning();
      await touchQuoteRevision(tx, quote.id);
      return drawing;
    });
  }

  async updateQuoteApprovalDrawing(
    id: number,
    updateData: QuoteApprovalDrawingUpdate,
    actorUserId?: number | null,
  ): Promise<QuoteApprovalDrawing | undefined> {
    await ensureQuoteApprovalDrawingTables();
    return db.transaction(async (tx) => {
      const [existing] = await tx.select().from(quoteApprovalDrawings).where(eq(quoteApprovalDrawings.id, id));
      if (!existing) return undefined;
      const [quote] = await tx.select().from(quotes).where(eq(quotes.id, existing.quoteId)).for("update");
      if (!quote) throw new Error("Quote not found for approval drawing");
      assertQuoteMutationAllowed(quote);

      if (existing.status === "signed_locked" || existing.status === "sent_for_signature" || existing.sentForSignatureAt || existing.signedLockedAt) {
        throw new Error("Approval drawing is frozen for signature. Create a new quote version or revision before editing.");
      }

      const [updated] = await tx
        .update(quoteApprovalDrawings)
        .set({
          ...updateData,
          publicSnapshot: null,
          updatedBy: actorUserId ?? updateData.updatedBy ?? existing.updatedBy ?? null,
          updatedAt: new Date(),
        })
        .where(eq(quoteApprovalDrawings.id, id))
        .returning();
      if (updated) await touchQuoteRevision(tx, quote.id);
      return updated || undefined;
    });
  }

  async markQuoteApprovalDrawingReady(id: number, actorUserId?: number | null): Promise<QuoteApprovalDrawing | undefined> {
    await ensureQuoteApprovalDrawingTables();
    const existing = await this.getQuoteApprovalDrawing(id);
    if (!existing) return undefined;
    if (existing.status === "signed_locked" || existing.sentForSignatureAt || existing.signedLockedAt) {
      throw new Error("Approval drawing is frozen for signature. Create a new quote version or revision before marking ready.");
    }

    const readiness = getApprovalDrawingReadiness(existing.drawingData);
    if (!readiness.ready) {
      throw new Error(`Approval drawing is missing: ${readiness.missing.join(", ")}`);
    }

    const [updated] = await db
      .update(quoteApprovalDrawings)
      .set({
        status: "ready_for_agreement",
        readyAt: new Date(),
        publicSnapshot: null,
        orderStatus: "not_reviewed",
        updatedBy: actorUserId ?? existing.updatedBy ?? null,
        updatedAt: new Date(),
      })
      .where(eq(quoteApprovalDrawings.id, id))
      .returning();
    return updated || undefined;
  }

  async freezeQuoteApprovalDrawingForSignature(id: number, actorUserId?: number | null): Promise<QuoteApprovalDrawing | undefined> {
    await ensureQuoteApprovalDrawingTables();
    const existing = await this.getQuoteApprovalDrawing(id);
    if (!existing) return undefined;

    if (existing.status === "signed_locked") {
      return existing;
    }

    if (existing.status !== "ready_for_agreement" && existing.status !== "sent_for_signature") {
      throw new Error("Approval drawing must be ready before preparing it for signature.");
    }

    const sentAt = existing.sentForSignatureAt || new Date();
    const snapshot = sanitizeQuoteApprovalDrawingForPublic({
      ...existing,
      status: "sent_for_signature",
      sentForSignatureAt: sentAt,
    });

    const [updated] = await db
      .update(quoteApprovalDrawings)
      .set({
        status: "sent_for_signature",
        sentForSignatureAt: sentAt instanceof Date ? sentAt : new Date(sentAt),
        publicSnapshot: snapshot,
        updatedBy: actorUserId ?? existing.updatedBy ?? null,
        updatedAt: new Date(),
      })
      .where(eq(quoteApprovalDrawings.id, id))
      .returning();
    return updated || undefined;
  }

  async markQuoteApprovalDrawingSignedLocked(id: number, actorUserId?: number | null): Promise<QuoteApprovalDrawing | undefined> {
    await ensureQuoteApprovalDrawingTables();
    const existing = await this.getQuoteApprovalDrawing(id);
    if (!existing) return undefined;

    const publicSnapshot = existing.publicSnapshot || sanitizeQuoteApprovalDrawingForPublic({
      ...existing,
      status: "signed_locked",
      signedLockedAt: new Date(),
    });

    const [updated] = await db
      .update(quoteApprovalDrawings)
      .set({
        status: "signed_locked",
        signedLockedAt: existing.signedLockedAt || new Date(),
        publicSnapshot,
        updatedBy: actorUserId ?? existing.updatedBy ?? null,
        updatedAt: new Date(),
      })
      .where(eq(quoteApprovalDrawings.id, id))
      .returning();
    return updated || undefined;
  }

  async markQuoteApprovalDrawingRevisionNeeded(
    id: number,
    actorUserId?: number | null,
    reason?: string | null,
  ): Promise<QuoteApprovalDrawing | undefined> {
    await ensureQuoteApprovalDrawingTables();
    const existing = await this.getQuoteApprovalDrawing(id);
    if (!existing) return undefined;

    if (existing.status === "signed_locked") {
      throw new Error("Signed approval drawings are locked. Create a new quote version before revising.");
    }

    const note = reason?.trim()
      ? `Revision needed: ${reason.trim()}`
      : "Revision needed.";

    const [updated] = await db
      .update(quoteApprovalDrawings)
      .set({
        status: "revision_needed",
        orderStatus: "blocked",
        publicSnapshot: null,
        internalNotes: appendQuoteApprovalDrawingInternalNoteSql(note),
        updatedBy: actorUserId ?? existing.updatedBy ?? null,
        updatedAt: new Date(),
      })
      .where(eq(quoteApprovalDrawings.id, id))
      .returning();
    return updated || undefined;
  }

  async markQuoteApprovalDrawingOrderReviewed(id: number, actorUserId?: number | null): Promise<QuoteApprovalDrawing | undefined> {
    await ensureQuoteApprovalDrawingTables();
    const existing = await this.getQuoteApprovalDrawing(id);
    if (!existing) return undefined;

    const [updated] = await db
      .update(quoteApprovalDrawings)
      .set({
        orderStatus: "reviewed",
        orderReviewedBy: actorUserId ?? existing.orderReviewedBy ?? null,
        orderReviewedAt: new Date(),
        updatedBy: actorUserId ?? existing.updatedBy ?? null,
        updatedAt: new Date(),
      })
      .where(eq(quoteApprovalDrawings.id, id))
      .returning();
    return updated || undefined;
  }

  async markQuoteApprovalDrawingOrderReady(
    id: number,
    actorUserId?: number | null,
    overrideReason?: string | null,
  ): Promise<QuoteApprovalDrawing | undefined> {
    await ensureQuoteApprovalDrawingTables();
    const existing = await this.getQuoteApprovalDrawing(id);
    if (!existing) return undefined;

    const useOverride = typeof overrideReason === "string" && overrideReason.trim().length > 0;
    if (existing.status !== "signed_locked") {
      throw new Error("Approval drawing must be customer signed before it can be order-ready.");
    }

    const readiness = getApprovalDrawingReadiness(existing.drawingData);
    if (!useOverride && !readiness.ready) {
      throw new Error(`Approval drawing is missing: ${readiness.missing.join(", ")}`);
    }

    const [updated] = await db
      .update(quoteApprovalDrawings)
      .set({
        orderStatus: useOverride ? "override_released" : "order_ready",
        orderReviewedBy: actorUserId ?? existing.orderReviewedBy ?? null,
        orderReviewedAt: existing.orderReviewedAt || new Date(),
        orderReadyBy: actorUserId ?? existing.orderReadyBy ?? null,
        orderReadyAt: new Date(),
        orderReadyOverrideReason: useOverride ? overrideReason!.trim() : null,
        updatedBy: actorUserId ?? existing.updatedBy ?? null,
        updatedAt: new Date(),
      })
      .where(eq(quoteApprovalDrawings.id, id))
      .returning();
    return updated || undefined;
  }

  async copyQuoteApprovalDrawingToVersion(
    sourceQuoteId: number,
    targetQuoteId: number,
    actorUserId?: number | null,
  ): Promise<QuoteApprovalDrawing | undefined> {
    await ensureQuoteApprovalDrawingTables();
    const source = await this.getQuoteApprovalDrawingByQuoteId(sourceQuoteId);
    if (!source) return undefined;
    const targetQuote = await this.getQuote(targetQuoteId);
    if (!targetQuote) return undefined;

    const [copy] = await db
      .insert(quoteApprovalDrawings)
      .values({
        quoteId: targetQuoteId,
        quoteFamilyRootId: getQuoteFamilyRootId(targetQuote),
        drawingType: source.drawingType,
        status: "draft",
        manufacturer: source.manufacturer,
        productSystem: source.productSystem,
        title: source.title,
        revisionLabel: source.revisionLabel,
        copiedFromDrawingId: source.id,
        drawingData: source.drawingData,
        publicSnapshot: null,
        customerNotes: source.customerNotes,
        internalNotes: source.internalNotes,
        sourceQuoteOrOrderId: source.sourceQuoteOrOrderId,
        sourceDocumentLabel: source.sourceDocumentLabel,
        sourceDocumentUrl: source.sourceDocumentUrl,
        sourcePreparedBy: source.sourcePreparedBy,
        sourcePreparedAt: source.sourcePreparedAt,
        readyAt: null,
        sentForSignatureAt: null,
        signedLockedAt: null,
        orderStatus: "not_reviewed",
        orderReviewedBy: null,
        orderReviewedAt: null,
        orderReadyBy: null,
        orderReadyAt: null,
        orderReadyOverrideReason: null,
        createdBy: actorUserId ?? null,
        updatedBy: actorUserId ?? null,
        updatedAt: new Date(),
      })
      .returning();
    return copy || undefined;
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

  async createQuoteVersion(originalQuoteId: number, actorUserId?: number | null): Promise<Quote> {
    await ensureQuoteApprovalDrawingTables();
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
        )
        .for("update");
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
        dealStageChangedAt: originalQuote.dealStageChangedAt,
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
        esigIncludeApprovalDrawing: false,
        esigIncludePricing: originalQuote.esigIncludePricing ?? true,
        esigIncludeImages: originalQuote.esigIncludeImages ?? false,
        esigIncludeContract: originalQuote.esigIncludeContract ?? true,
        qbEstimateId: null,
        qbSyncStatus: null,
        qbSyncedAt: null,
        qbSyncError: null,
        parentQuoteId: parentId,
        sourceInquiryId: originalQuote.sourceInquiryId,
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
          configData: group.configData,
        });
      }
      
      // Copy line items and update their group IDs to use the new group IDs
      const originalLineItems = await tx.select().from(lineItems).where(eq(lineItems.quoteId, originalQuoteId));
      for (const item of originalLineItems) {
        await tx.insert(lineItems).values({
          quoteId: newQuote.id,
          productId: item.productId,
          manufacturer: item.manufacturer,
          unit: item.unit,
          priceSource: item.priceSource,
          sourceMetadata: item.sourceMetadata,
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

      const [sourceDrawing] = await tx
        .select()
        .from(quoteApprovalDrawings)
        .where(and(
          eq(quoteApprovalDrawings.quoteId, originalQuoteId),
          ne(quoteApprovalDrawings.status, "superseded")
        ))
        .orderBy(desc(quoteApprovalDrawings.createdAt), desc(quoteApprovalDrawings.id))
        .limit(1);

      if (sourceDrawing) {
        await tx.insert(quoteApprovalDrawings).values({
          quoteId: newQuote.id,
          quoteFamilyRootId: getQuoteFamilyRootId(newQuote),
          drawingType: sourceDrawing.drawingType,
          status: "draft",
          manufacturer: sourceDrawing.manufacturer,
          productSystem: sourceDrawing.productSystem,
          title: sourceDrawing.title,
          revisionLabel: sourceDrawing.revisionLabel,
          copiedFromDrawingId: sourceDrawing.id,
          drawingData: sourceDrawing.drawingData,
          publicSnapshot: null,
          customerNotes: sourceDrawing.customerNotes,
          internalNotes: sourceDrawing.internalNotes,
          sourceQuoteOrOrderId: sourceDrawing.sourceQuoteOrOrderId,
          sourceDocumentLabel: sourceDrawing.sourceDocumentLabel,
          sourceDocumentUrl: sourceDrawing.sourceDocumentUrl,
          sourcePreparedBy: sourceDrawing.sourcePreparedBy,
          sourcePreparedAt: sourceDrawing.sourcePreparedAt,
          readyAt: null,
          sentForSignatureAt: null,
          signedLockedAt: null,
          orderStatus: "not_reviewed",
          orderReviewedBy: null,
          orderReviewedAt: null,
          orderReadyBy: null,
          orderReadyAt: null,
          orderReadyOverrideReason: null,
          createdBy: null,
          updatedBy: null,
          updatedAt: new Date(),
        });
      }

      await tx.insert(quoteVersionEvents).values({
        quoteFamilyRootId: parentId,
        quoteId: newQuote.id,
        eventType: "version_created",
        actorUserId: actorUserId ?? null,
        fromQuoteId: originalQuote.id,
        toQuoteId: newQuote.id,
        payload: {
          sourceVersionNumber: originalQuote.versionNumber,
          newVersionNumber,
          sourceWasCustomerApproved: isCustomerApprovedQuote(originalQuote),
        },
      });
      
      return newQuote;
    });
  }

  async setCurrentQuoteVersion(quoteId: number, actorUserId?: number | null): Promise<Quote | undefined> {
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

      const familyQuotes = await tx.select().from(quotes).where(versionFamilyFilter).for("update");
      const currentQuote = familyQuotes.find((version) => version.isLatestVersion);
      if (currentQuote?.id === targetQuote.id) return targetQuote;

      await tx
        .update(quotes)
        .set({ isLatestVersion: false, updatedAt: new Date() })
        .where(versionFamilyFilter);

      const [updatedQuote] = await tx
        .update(quotes)
        .set({ isLatestVersion: true, updatedAt: new Date() })
        .where(eq(quotes.id, quoteId))
        .returning();

      await tx.insert(quoteVersionEvents).values({
        quoteFamilyRootId: parentId,
        quoteId: updatedQuote.id,
        eventType: "version_made_current",
        actorUserId: actorUserId ?? null,
        fromQuoteId: currentQuote?.id ?? null,
        toQuoteId: updatedQuote.id,
        payload: {
          fromVersionNumber: currentQuote?.versionNumber ?? null,
          toVersionNumber: updatedQuote.versionNumber,
          targetHasCustomerApproval: isCustomerApprovedQuote(updatedQuote),
        },
      });

      return updatedQuote || undefined;
    });
  }

  async getQuoteVersionEvents(quoteFamilyRootId: number): Promise<QuoteVersionEvent[]> {
    return db
      .select()
      .from(quoteVersionEvents)
      .where(eq(quoteVersionEvents.quoteFamilyRootId, quoteFamilyRootId))
      .orderBy(asc(quoteVersionEvents.createdAt), asc(quoteVersionEvents.id));
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
    const lineItem = await db.transaction(async (tx) => {
      const [quote] = await tx
        .select()
        .from(quotes)
        .where(eq(quotes.id, insertLineItem.quoteId))
        .for("update");
      if (!quote) throw new Error("Quote not found");
      assertQuoteMutationAllowed(quote);

      const [created] = await tx
        .insert(lineItems)
        .values(insertLineItem)
        .returning();
      await touchQuoteRevision(tx, insertLineItem.quoteId);
      return created;
    });
    await this.markApprovalDrawingRevisionNeededForQuote(insertLineItem.quoteId, "line item added after drawing readiness");
    return lineItem;
  }

  async updateLineItem(id: number, lineItemData: Partial<InsertLineItem>): Promise<LineItem | undefined> {
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(lineItems).where(eq(lineItems.id, id));
      if (!existing) return { existing: undefined, updated: undefined };
      if (lineItemData.quoteId !== undefined && lineItemData.quoteId !== existing.quoteId) {
        throw new Error("Line items cannot be moved between quotes");
      }

      const [quote] = await tx
        .select()
        .from(quotes)
        .where(eq(quotes.id, existing.quoteId))
        .for("update");
      if (!quote) throw new Error("Quote not found");
      assertQuoteMutationAllowed(quote);

      const [updated] = await tx
        .update(lineItems)
        .set(lineItemData)
        .where(eq(lineItems.id, id))
        .returning();
      if (updated) await touchQuoteRevision(tx, existing.quoteId);
      return { existing, updated };
    });
    const { existing, updated } = result;
    if (updated && existing) {
      await this.markApprovalDrawingRevisionNeededForQuote(existing.quoteId, "line item changed after drawing readiness");
    }
    return updated || undefined;
  }

  async deleteLineItem(id: number): Promise<boolean> {
    const mutation = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(lineItems).where(eq(lineItems.id, id));
      if (!existing) return { existing: undefined, deleted: false };
      const [quote] = await tx
        .select()
        .from(quotes)
        .where(eq(quotes.id, existing.quoteId))
        .for("update");
      if (!quote) throw new Error("Quote not found");
      assertQuoteMutationAllowed(quote);

      const result = await tx.delete(lineItems).where(eq(lineItems.id, id));
      const deleted = (result.rowCount || 0) > 0;
      if (deleted) await touchQuoteRevision(tx, existing.quoteId);
      return { existing, deleted };
    });
    if (mutation.deleted && mutation.existing) {
      const existing = mutation.existing;
      await this.markApprovalDrawingRevisionNeededForQuote(existing.quoteId, "line item removed after drawing readiness");
    }
    return mutation.deleted;
  }

  async deleteLineItemsByQuoteId(quoteId: number): Promise<boolean> {
    await db.transaction(async (tx) => {
      const [quote] = await tx.select().from(quotes).where(eq(quotes.id, quoteId)).for("update");
      if (!quote) return;
      assertQuoteMutationAllowed(quote);
      await tx.delete(lineItems).where(eq(lineItems.quoteId, quoteId));
      await touchQuoteRevision(tx, quoteId);
    });
    await this.markApprovalDrawingRevisionNeededForQuote(quoteId, "line items cleared after drawing readiness");
    return true;
  }

  async bulkDeleteLineItems(ids: number[]): Promise<number> {
    if (ids.length === 0) return 0;
    const mutation = await db.transaction(async (tx) => {
      const existingRows = await tx.select().from(lineItems).where(inArray(lineItems.id, ids));
      const quoteIds = Array.from(new Set(existingRows.map((item) => item.quoteId))).sort((a, b) => a - b);
      for (const quoteId of quoteIds) {
        const [quote] = await tx.select().from(quotes).where(eq(quotes.id, quoteId)).for("update");
        if (!quote) throw new Error("Quote not found");
        assertQuoteMutationAllowed(quote);
      }
      const result = await tx.delete(lineItems).where(inArray(lineItems.id, ids));
      for (const quoteId of quoteIds) await touchQuoteRevision(tx, quoteId);
      return { quoteIds, count: result.rowCount || 0 };
    });
    const { quoteIds } = mutation;
    for (const quoteId of quoteIds) {
      await this.markApprovalDrawingRevisionNeededForQuote(quoteId, "line items removed after drawing readiness");
    }
    return mutation.count;
  }

  async bulkUpdateLineItems(ids: number[], updates: Partial<InsertLineItem>): Promise<number> {
    if (ids.length === 0) return 0;
    if (updates.quoteId !== undefined) throw new Error("Line items cannot be moved between quotes");
    const mutation = await db.transaction(async (tx) => {
      const existingRows = await tx.select().from(lineItems).where(inArray(lineItems.id, ids));
      const quoteIds = Array.from(new Set(existingRows.map((item) => item.quoteId))).sort((a, b) => a - b);
      for (const quoteId of quoteIds) {
        const [quote] = await tx.select().from(quotes).where(eq(quotes.id, quoteId)).for("update");
        if (!quote) throw new Error("Quote not found");
        assertQuoteMutationAllowed(quote);
      }
      const result = await tx
        .update(lineItems)
        .set(updates)
        .where(inArray(lineItems.id, ids))
        .returning();
      for (const quoteId of quoteIds) await touchQuoteRevision(tx, quoteId);
      return { quoteIds, count: result.length };
    });
    const { quoteIds } = mutation;
    for (const quoteId of quoteIds) {
      await this.markApprovalDrawingRevisionNeededForQuote(quoteId, "line items changed after drawing readiness");
    }
    return mutation.count;
  }

  async reorderLineItems(quoteId: number, moves: Array<{id: number; groupId: string | null; position: number}>): Promise<void> {
    await db.transaction(async (tx) => {
      const [quote] = await tx.select().from(quotes).where(eq(quotes.id, quoteId)).for("update");
      if (!quote) throw new Error("Quote not found");
      assertQuoteMutationAllowed(quote);

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
      await touchQuoteRevision(tx, quoteId);
    });
    await this.markApprovalDrawingRevisionNeededForQuote(quoteId, "line item order changed after drawing readiness");
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
    return db.transaction(async (tx) => {
      const [quote] = await tx.select().from(quotes).where(eq(quotes.id, group.quoteId)).for("update");
      if (!quote) throw new Error("Quote not found");
      assertQuoteMutationAllowed(quote);
      const [newGroup] = await tx.insert(groups).values(group).returning();
      await touchQuoteRevision(tx, group.quoteId);
      return newGroup;
    });
  }

  async updateGroup(id: string, groupData: Partial<InsertGroup>): Promise<Group | undefined> {
    return db.transaction(async (tx) => {
      const [existing] = await tx.select().from(groups).where(eq(groups.id, id));
      if (!existing) return undefined;
      if (groupData.quoteId !== undefined && groupData.quoteId !== existing.quoteId) {
        throw new Error("Groups cannot be moved between quotes");
      }
      const [quote] = await tx.select().from(quotes).where(eq(quotes.id, existing.quoteId)).for("update");
      if (!quote) throw new Error("Quote not found");
      assertQuoteMutationAllowed(quote);
      const [updated] = await tx
        .update(groups)
        .set({ ...groupData, updatedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(groups.id, id))
        .returning();
      if (updated) await touchQuoteRevision(tx, existing.quoteId);
      return updated || undefined;
    });
  }

  async deleteGroup(id: string): Promise<boolean> {
    return db.transaction(async (tx) => {
      const [existing] = await tx.select().from(groups).where(eq(groups.id, id));
      if (!existing) return false;
      const [quote] = await tx.select().from(quotes).where(eq(quotes.id, existing.quoteId)).for("update");
      if (!quote) throw new Error("Quote not found");
      assertQuoteMutationAllowed(quote);
      const [ungroupedItems, groupedItems] = await Promise.all([
        tx.select({ position: lineItems.position }).from(lineItems).where(and(
          eq(lineItems.quoteId, existing.quoteId),
          isNull(lineItems.groupId),
        )),
        tx.select({ id: lineItems.id }).from(lineItems).where(and(
          eq(lineItems.quoteId, existing.quoteId),
          eq(lineItems.groupId, id),
        )).orderBy(lineItems.position),
      ]);
      const firstUngroupedPosition = ungroupedItems.length > 0
        ? Math.max(...ungroupedItems.map((item) => item.position)) + 1
        : 0;
      for (const [offset, item] of groupedItems.entries()) {
        await tx.update(lineItems).set({
          groupId: null,
          position: firstUngroupedPosition + offset,
        }).where(eq(lineItems.id, item.id));
      }
      const result = await tx.delete(groups).where(eq(groups.id, id));
      if ((result.rowCount || 0) > 0) await touchQuoteRevision(tx, existing.quoteId);
      return (result.rowCount || 0) > 0;
    });
  }

  async deleteGroupsByQuoteId(quoteId: number): Promise<boolean> {
    await db.transaction(async (tx) => {
      const [quote] = await tx.select().from(quotes).where(eq(quotes.id, quoteId)).for("update");
      if (!quote) return;
      assertQuoteMutationAllowed(quote);
      await tx.delete(groups).where(eq(groups.quoteId, quoteId));
      await touchQuoteRevision(tx, quoteId);
    });
    return true;
  }

  async reorderGroups(quoteId: number, positions: Array<{id: string; position: number}>): Promise<void> {
    await db.transaction(async (tx) => {
      const [quote] = await tx.select().from(quotes).where(eq(quotes.id, quoteId)).for("update");
      if (!quote) throw new Error("Quote not found");
      assertQuoteMutationAllowed(quote);

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
      await touchQuoteRevision(tx, quoteId);
    });
  }

  // Selection-integrity check. Rainmaker currently grants authenticated sales
  // users access to the shared quote workspace; this is not an ownership rule.
  async validateLineItemSelection(lineItemIds: number[]): Promise<{ isValid: boolean; quoteId?: number }> {
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

    // Bulk operations must not cross quote boundaries.
    const quoteIds = Array.from(new Set(items.map(item => item.quoteId)));
    if (quoteIds.length !== 1) {
      return { isValid: false }; // Line items belong to different quotes
    }

    return { isValid: true, quoteId: quoteIds[0] };
  }

  async quoteExists(quoteId: number): Promise<boolean> {
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
    return db.transaction(async (tx) => {
      const [product] = await tx.select().from(products).where(eq(products.id, insertPricingTable.productId)).for("update");
      if (!product) throw new Error("Product not found");
      const existing = await tx.select().from(pricingTables).where(eq(pricingTables.productId, insertPricingTable.productId));
      validatePricingBands([...existing, insertPricingTable]);
      const [pricingTable] = await tx.insert(pricingTables).values(insertPricingTable).returning();
      return pricingTable;
    });
  }

  async updatePricingTable(id: number, pricingTableData: Partial<InsertPricingTable>): Promise<PricingTable | undefined> {
    return db.transaction(async (tx) => {
      const [existing] = await tx.select().from(pricingTables).where(eq(pricingTables.id, id));
      if (!existing) return undefined;
      if (pricingTableData.productId !== undefined && pricingTableData.productId !== existing.productId) {
        throw new Error("Pricing entries cannot be moved between products");
      }
      const [product] = await tx.select().from(products).where(eq(products.id, existing.productId)).for("update");
      if (!product) throw new Error("Product not found");
      const siblings = await tx.select().from(pricingTables).where(eq(pricingTables.productId, existing.productId));
      const candidate = { ...existing, ...pricingTableData };
      validatePricingBands(siblings.map((entry) => entry.id === id ? candidate : entry));
      const [updated] = await tx.update(pricingTables).set(pricingTableData).where(eq(pricingTables.id, id)).returning();
      return updated || undefined;
    });
  }

  async deletePricingTable(id: number): Promise<boolean> {
    const result = await db.delete(pricingTables).where(eq(pricingTables.id, id));
    return (result.rowCount || 0) > 0;
  }

  async deletePricingTablesByProductId(productId: number): Promise<boolean> {
    const result = await db.delete(pricingTables).where(eq(pricingTables.productId, productId));
    return true; // Always return true since this is for cleanup before bulk upload
  }

  async replacePricingTablesForProduct(productId: number, pricingTableData: InsertPricingTable[]): Promise<PricingTable[]> {
    return db.transaction(async (tx) => {
      const [product] = await tx.select().from(products).where(eq(products.id, productId)).for("update");
      if (!product) throw new Error("Product not found");
      const normalized = pricingTableData.map((entry) => ({ ...entry, productId }));
      validatePricingBands(normalized);
      await tx.delete(pricingTables).where(eq(pricingTables.productId, productId));
      if (normalized.length === 0) return [];
      return tx.insert(pricingTables).values(normalized).returning();
    });
  }

  async calculateConfigurableProductPrice(productId: number, length: number, width: number): Promise<number | null> {
    // Note: All dimensions are expected in inches
    // Pricing tables store all dimensions in inches for consistency across products
    
    // Find the pricing band that contains the given dimensions
    const pricingTablesForProduct = await db
      .select()
      .from(pricingTables)
      .where(eq(pricingTables.productId, productId));

    const matchingBand = selectPricingBand(pricingTablesForProduct, length, width);
    return parseFloat(matchingBand.basePrice);
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
    return db.transaction(async (tx) => {
      const [product] = await tx.select().from(products).where(eq(products.id, productId)).for("update");
      if (!product) throw new Error("Product not found");
      const discountType = product.defaultDiscountType;
      const discountValue = parseFloat(product.defaultDiscountValue);
      if (!Number.isFinite(discountValue) || discountValue < 0 || (discountType === "percentage" && discountValue > 100)) {
        throw new Error("Product discount settings are invalid");
      }

      const multiplier = discountType === "percentage" ? (100 - discountValue) / 100 : null;
      const result = discountType === "percentage"
        ? await tx.execute(sql`
            UPDATE pricing_tables
            SET base_price = GREATEST(ROUND(retail_price * ${multiplier}, 2), 0)
            WHERE product_id = ${productId}
          `)
        : await tx.execute(sql`
            UPDATE pricing_tables
            SET base_price = GREATEST(ROUND(retail_price - ${discountValue}, 2), 0)
            WHERE product_id = ${productId}
          `);
      return { updated: result.rowCount || 0 };
    });
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

  async getQuoteCoverPhotoById(id: number): Promise<QuoteCoverPhoto | undefined> {
    const [photo] = await db
      .select()
      .from(quoteCoverPhotos)
      .where(eq(quoteCoverPhotos.id, id))
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

  async getQuoteProductRenderingById(id: number): Promise<QuoteProductRendering | undefined> {
    const [rendering] = await db
      .select()
      .from(quoteProductRenderings)
      .where(eq(quoteProductRenderings.id, id))
      .limit(1);
    return rendering || undefined;
  }

  async createQuoteCoverPhoto(photo: InsertQuoteCoverPhoto): Promise<QuoteCoverPhoto> {
    return db.transaction(async (tx) => {
      const [quote] = await tx.select().from(quotes).where(eq(quotes.id, photo.quoteId)).for("update");
      if (!quote) throw new Error("Quote not found");
      assertQuoteMutationAllowed(quote);
      await tx
        .update(quoteCoverPhotos)
        .set({ isActive: false })
        .where(and(eq(quoteCoverPhotos.quoteId, photo.quoteId), eq(quoteCoverPhotos.isActive, true)));
      const [created] = await tx.insert(quoteCoverPhotos).values(photo).returning();
      await touchQuoteRevision(tx, photo.quoteId);
      return created;
    });
  }

  async createQuoteProductRendering(rendering: InsertQuoteProductRendering): Promise<QuoteProductRendering> {
    return db.transaction(async (tx) => {
      const [quote] = await tx.select().from(quotes).where(eq(quotes.id, rendering.quoteId)).for("update");
      if (!quote) throw new Error("Quote not found");
      assertQuoteMutationAllowed(quote);
      const [created] = await tx.insert(quoteProductRenderings).values(rendering).returning();
      await touchQuoteRevision(tx, rendering.quoteId);
      return created;
    });
  }

  async updateQuoteCoverPhoto(id: number, photo: Partial<InsertQuoteCoverPhoto>): Promise<QuoteCoverPhoto | undefined> {
    return db.transaction(async (tx) => {
      const [existing] = await tx.select().from(quoteCoverPhotos).where(eq(quoteCoverPhotos.id, id));
      if (!existing) return undefined;
      if (photo.quoteId !== undefined && photo.quoteId !== existing.quoteId) {
        throw new Error("Quote images cannot be moved between quotes");
      }
      const [quote] = await tx.select().from(quotes).where(eq(quotes.id, existing.quoteId)).for("update");
      if (!quote) throw new Error("Quote not found");
      assertQuoteMutationAllowed(quote);
      const [updated] = await tx.update(quoteCoverPhotos).set(photo).where(eq(quoteCoverPhotos.id, id)).returning();
      if (updated) await touchQuoteRevision(tx, existing.quoteId);
      return updated || undefined;
    });
  }

  async updateQuoteProductRendering(id: number, rendering: Partial<InsertQuoteProductRendering>): Promise<QuoteProductRendering | undefined> {
    return db.transaction(async (tx) => {
      const [existing] = await tx.select().from(quoteProductRenderings).where(eq(quoteProductRenderings.id, id));
      if (!existing) return undefined;
      if (rendering.quoteId !== undefined && rendering.quoteId !== existing.quoteId) {
        throw new Error("Quote images cannot be moved between quotes");
      }
      const [quote] = await tx.select().from(quotes).where(eq(quotes.id, existing.quoteId)).for("update");
      if (!quote) throw new Error("Quote not found");
      assertQuoteMutationAllowed(quote);
      const [updated] = await tx.update(quoteProductRenderings).set(rendering).where(eq(quoteProductRenderings.id, id)).returning();
      if (updated) await touchQuoteRevision(tx, existing.quoteId);
      return updated || undefined;
    });
  }

  async deleteQuoteCoverPhoto(id: number): Promise<boolean> {
    return db.transaction(async (tx) => {
      const [existing] = await tx.select().from(quoteCoverPhotos).where(eq(quoteCoverPhotos.id, id));
      if (!existing) return false;
      const [quote] = await tx.select().from(quotes).where(eq(quotes.id, existing.quoteId)).for("update");
      if (!quote) throw new Error("Quote not found");
      assertQuoteMutationAllowed(quote);
      const result = await tx.update(quoteCoverPhotos).set({ isActive: false }).where(eq(quoteCoverPhotos.id, id));
      if ((result.rowCount || 0) > 0) await touchQuoteRevision(tx, existing.quoteId);
      return (result.rowCount || 0) > 0;
    });
  }

  async deleteQuoteProductRendering(id: number): Promise<boolean> {
    return db.transaction(async (tx) => {
      const [existing] = await tx.select().from(quoteProductRenderings).where(eq(quoteProductRenderings.id, id));
      if (!existing) return false;
      const [quote] = await tx.select().from(quotes).where(eq(quotes.id, existing.quoteId)).for("update");
      if (!quote) throw new Error("Quote not found");
      assertQuoteMutationAllowed(quote);
      const result = await tx.update(quoteProductRenderings).set({ isActive: false }).where(eq(quoteProductRenderings.id, id));
      if ((result.rowCount || 0) > 0) await touchQuoteRevision(tx, existing.quoteId);
      return (result.rowCount || 0) > 0;
    });
  }

  async deleteQuoteImagesByQuoteId(quoteId: number): Promise<boolean> {
    return db.transaction(async (tx) => {
      const [quote] = await tx.select().from(quotes).where(eq(quotes.id, quoteId)).for("update");
      if (!quote) return false;
      assertQuoteMutationAllowed(quote);
      const coverResult = await tx.update(quoteCoverPhotos).set({ isActive: false }).where(eq(quoteCoverPhotos.quoteId, quoteId));
      const renderingsResult = await tx.update(quoteProductRenderings).set({ isActive: false }).where(eq(quoteProductRenderings.quoteId, quoteId));
      await touchQuoteRevision(tx, quoteId);
      return ((coverResult.rowCount || 0) + (renderingsResult.rowCount || 0)) > 0;
    });
  }

}

export const storage = new DatabaseStorage();
