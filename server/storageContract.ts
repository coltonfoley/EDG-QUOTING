import type {
  Account,
  Color,
  ContractTemplate,
  Customer,
  Group,
  InsertAccount,
  InsertColor,
  InsertContractTemplate,
  InsertCustomer,
  InsertGroup,
  InsertIssueReport,
  InsertLeadAttachment,
  InsertLineItem,
  InsertPlanningAgreement,
  InsertPlanningAgreementEvent,
  InsertPricingTable,
  InsertProduct,
  InsertProductColor,
  InsertQuote,
  InsertQuoteApprovalDrawing,
  InsertQuoteCoverPhoto,
  InsertQuoteProductRendering,
  InsertUser,
  IssueReport,
  LeadAttachment,
  LineItem,
  PlanningAgreement,
  PlanningAgreementEvent,
  PricingDefault,
  PricingTable,
  Product,
  ProductColor,
  ProductWithDetails,
  Quote,
  QuoteApprovalDrawing,
  QuoteCoverPhoto,
  QuoteProductRendering,
  QuoteWithDetails,
  User,
} from "@shared/schema";

type PlanningAgreementUpdate = Partial<InsertPlanningAgreement>;
type QuoteApprovalDrawingUpdate = Partial<InsertQuoteApprovalDrawing>;

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

  // Quote approval drawing methods
  getQuoteApprovalDrawing(id: number): Promise<QuoteApprovalDrawing | undefined>;
  getQuoteApprovalDrawingByQuoteId(quoteId: number): Promise<QuoteApprovalDrawing | undefined>;
  createQuoteApprovalDrawing(drawing: InsertQuoteApprovalDrawing, actorUserId?: number | null): Promise<QuoteApprovalDrawing>;
  updateQuoteApprovalDrawing(id: number, drawing: QuoteApprovalDrawingUpdate, actorUserId?: number | null): Promise<QuoteApprovalDrawing | undefined>;
  markQuoteApprovalDrawingReady(id: number, actorUserId?: number | null): Promise<QuoteApprovalDrawing | undefined>;
  freezeQuoteApprovalDrawingForSignature(id: number, actorUserId?: number | null): Promise<QuoteApprovalDrawing | undefined>;
  markQuoteApprovalDrawingSignedLocked(id: number, actorUserId?: number | null): Promise<QuoteApprovalDrawing | undefined>;
  markQuoteApprovalDrawingRevisionNeeded(id: number, actorUserId?: number | null, reason?: string | null): Promise<QuoteApprovalDrawing | undefined>;
  markQuoteApprovalDrawingOrderReviewed(id: number, actorUserId?: number | null): Promise<QuoteApprovalDrawing | undefined>;
  markQuoteApprovalDrawingOrderReady(id: number, actorUserId?: number | null, overrideReason?: string | null): Promise<QuoteApprovalDrawing | undefined>;
  copyQuoteApprovalDrawingToVersion(sourceQuoteId: number, targetQuoteId: number, actorUserId?: number | null): Promise<QuoteApprovalDrawing | undefined>;
  
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
  getQuoteCoverPhotoById(id: number): Promise<QuoteCoverPhoto | undefined>;
  getQuoteProductRenderings(quoteId: number): Promise<QuoteProductRendering[]>;
  getQuoteProductRenderingById(id: number): Promise<QuoteProductRendering | undefined>;
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

}
