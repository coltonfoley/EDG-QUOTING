import { pgTable, text, serial, integer, decimal, timestamp, boolean, varchar, jsonb, index, uniqueIndex, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";
import {
  quoteApprovalDrawingOrderStatusValues,
  quoteApprovalDrawingStatusValues,
} from "./approvalDrawing";

// Session storage table for staff authentication.
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
  billingAddress: text("billing_address"), // Legacy field, kept for backward compatibility
  // Structured address fields for Google Places integration
  streetAddress: text("street_address"),
  addressLine2: text("address_line_2"), // Apt, Suite, etc.
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  country: text("country"),
  placeId: text("place_id"), // Google Places ID for verification
  // Client-specific fields for unified model
  firstName: text("first_name"), // Individual's first name (optional for company-only accounts)
  lastName: text("last_name"), // Individual's last name (optional for company-only accounts)
  secondaryContacts: jsonb("secondary_contacts"), // Array of additional contact info for multi-person accounts
  // Lead intake tracking
  leadStatus: text("lead_status"), // new, contacted, qualified, unresponsive, converted, archived
  leadSource: text("lead_source"),
  leadProjectType: text("lead_project_type"),
  leadMessage: text("lead_message"),
  leadReceivedAt: timestamp("lead_received_at"),
  leadLastContactedAt: timestamp("lead_last_contacted_at"),
  leadConvertedAt: timestamp("lead_converted_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_accounts_email").on(table.email),
  index("idx_accounts_phone").on(table.phone),
  index("idx_accounts_type").on(table.accountType),
  index("idx_accounts_lead_status").on(table.leadStatus),
  index("idx_accounts_lead_received_at").on(table.leadReceivedAt),
]);

// Lead attachments - stores website intake photo metadata for Rainmaker leads.
export const leadAttachments = pgTable("lead_attachments", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  submissionId: text("submission_id"),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  storageUrl: text("storage_url").notNull(),
  fileSize: integer("file_size"),
  mimeType: text("mime_type").notNull(),
  source: text("source").notNull().default("website"),
  displayOrder: integer("display_order").default(0),
  isActive: boolean("is_active").default(true),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
}, (table) => [
  index("idx_lead_attachments_account_id").on(table.accountId),
  index("idx_lead_attachments_submission_id").on(table.submissionId),
  index("idx_lead_attachments_active").on(table.isActive),
  index("idx_lead_attachments_order").on(table.accountId, table.displayOrder),
]);

// Website intake submissions make client retries safe without treating a lead's
// email address as a request id. The row is created before account upsert and
// records the resulting account once the request succeeds.
export const leadIntakeSubmissions = pgTable("lead_intake_submissions", {
  id: serial("id").primaryKey(),
  submissionId: text("submission_id").notNull(),
  payloadHash: text("payload_hash").notNull(),
  accountId: integer("account_id").references(() => accounts.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  uniqueIndex("lead_intake_submissions_submission_id_key").on(table.submissionId),
  index("idx_lead_intake_submissions_account_id").on(table.accountId),
]);

// Append-only website/customer inquiries linked to a durable account identity.
// Legacy lead fields remain on accounts for compatibility and backfill.
export const leadInquiries = pgTable("lead_inquiries", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  submissionId: text("submission_id").unique(),
  status: text("status").notNull().default("new"),
  source: text("source"),
  projectType: text("project_type"),
  message: text("message"),
  location: text("location"),
  customerType: text("customer_type"),
  metadata: jsonb("metadata"),
  receivedAt: timestamp("received_at").notNull().defaultNow(),
  lastContactedAt: timestamp("last_contacted_at"),
  convertedAt: timestamp("converted_at"),
  // The database migration owns this FK because quotes also references the source inquiry.
  convertedQuoteId: integer("converted_quote_id"),
  convertedBy: integer("converted_by").references(() => users.id, { onDelete: "set null" }),
  archiveReason: text("archive_reason"),
  gmailDraftUrl: text("gmail_draft_url"),
  draftEmailContent: text("draft_email_content"),
  draftReadyAt: timestamp("draft_ready_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_lead_inquiries_account_id").on(table.accountId),
  index("idx_lead_inquiries_status").on(table.status),
  index("idx_lead_inquiries_received_at").on(table.receivedAt),
  index("idx_lead_inquiries_converted_quote_id").on(table.convertedQuoteId),
]);

// Append-only results written back by the external lead-intake agent. Rainmaker
// stores the decision, a short reason, the Gmail draft pointer, and a plain-text
// snapshot for review. Gmail remains the source of truth for editing and sending.
export const leadAgentAssessments = pgTable("lead_agent_assessments", {
  id: serial("id").primaryKey(),
  inquiryId: integer("inquiry_id").notNull().references(() => leadInquiries.id, { onDelete: "cascade" }),
  outcome: text("outcome").notNull(),
  reason: text("reason").notNull(),
  gmailDraftId: text("gmail_draft_id"),
  gmailMessageId: text("gmail_message_id"),
  gmailDraftUrl: text("gmail_draft_url"),
  draftEmailContent: text("draft_email_content"),
  idempotencyKeyHash: text("idempotency_key_hash").notNull().unique(),
  source: text("source").notNull().default("jacob-codex"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_lead_agent_assessments_inquiry_time").on(table.inquiryId, table.createdAt),
  index("idx_lead_agent_assessments_outcome").on(table.outcome),
  uniqueIndex("lead_agent_assessments_gmail_draft_id_key").on(table.gmailDraftId),
  uniqueIndex("lead_agent_assessments_gmail_message_id_key").on(table.gmailMessageId),
]);

export const leadInquiryStatusEvents = pgTable("lead_inquiry_status_events", {
  id: serial("id").primaryKey(),
  inquiryId: integer("inquiry_id").notNull().references(() => leadInquiries.id, { onDelete: "cascade" }),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  reason: text("reason"),
  actorUserId: integer("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_lead_inquiry_status_events_inquiry_time").on(table.inquiryId, table.createdAt),
]);

// Aliases for different conceptual uses
export const customers = accounts; // Legacy alias for backward compatibility
export const clients = accounts; // New unified client model alias

// Stable dealer-portal identities keep automated B2B orders idempotent without
// fuzzy matching a business by name, email, or phone.
export const dealerPortalCompanyMappings = pgTable("dealer_portal_company_mappings", {
  portalCompanyId: text("portal_company_id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => accounts.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("dealer_portal_company_mappings_account_key").on(table.accountId),
]);

export const quotes = pgTable("quotes", {
  id: serial("id").primaryKey(),
  quoteNumber: text("quote_number").notNull().unique(),
  accountId: integer("account_id").references(() => accounts.id, { onDelete: "set null" }), // Reference to accounts table
  sourceInquiryId: integer("source_inquiry_id").references(() => leadInquiries.id, { onDelete: "set null" }),
  projectName: text("project_name"),
  jobsiteAddress: text("jobsite_address"), // Legacy field, kept for backward compatibility
  // Structured jobsite address fields for Google Places integration
  jobsiteStreetAddress: text("jobsite_street_address"),
  jobsiteAddressLine2: text("jobsite_address_line_2"),
  jobsiteCity: text("jobsite_city"),
  jobsiteState: text("jobsite_state"),
  jobsiteZipCode: text("jobsite_zip_code"),
  jobsiteCountry: text("jobsite_country"),
  jobsitePlaceId: text("jobsite_place_id"),
  estimatedStartDate: text("estimated_start_date"),
  notes: text("notes"), // customer-facing quote contract notes
  internalNotes: text("internal_notes"), // internal handoff notes for Ops
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).default("0"),
  tariffRate: decimal("tariff_rate", { precision: 5, scale: 2 }).default("0"), // tariff percentage to increase cost
  discount: decimal("discount", { precision: 5, scale: 2 }).default("0"),
  shipping: decimal("shipping", { precision: 10, scale: 2 }).default("0"),
  isShippingTaxable: boolean("is_shipping_taxable").default(false), // whether shipping is subject to sales tax
  dealStage: text("deal_stage").notNull().default("new_lead"), // new_lead, qualifying, consultation_scheduled, building_estimate, quote_sent, closed_won, closed_lost, on_hold
  dealStageChangedAt: timestamp("deal_stage_changed_at"),
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
  signedDocumentSnapshot: jsonb("signed_document_snapshot"), // locked client-facing proposal data captured when the client signs
  signatureAuditTrail: jsonb("signature_audit_trail"), // signing certificate data: consent, signer, IP, browser, and document fingerprint
  // E-Signature email tracking
  signatureEmailSentAt: timestamp("signature_email_sent_at"), // when the signing link was emailed to client
  signatureEmailMessage: text("signature_email_message"), // optional personalized message included in email
  // E-Signature PDF preferences
  esigIncludePricing: boolean("esig_include_pricing").default(true), // show pricing in signed PDF
  esigIncludeImages: boolean("esig_include_images").default(false), // include product renderings in signed PDF
  esigIncludeContract: boolean("esig_include_contract").default(true), // include contract terms in signed PDF
  esigIncludeApprovalDrawing: boolean("esig_include_approval_drawing").default(false), // include order approval drawing in signed PDF
  // Version control fields
  parentQuoteId: integer("parent_quote_id").references((): AnyPgColumn => quotes.id, { onDelete: "set null" }), // Links versions together
  versionNumber: integer("version_number").notNull().default(1), // Version number (1, 2, 3, etc.)
  isLatestVersion: boolean("is_latest_version").notNull().default(true), // Flag for filtering to latest version
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_quotes_account_id").on(table.accountId),
  index("idx_quotes_source_inquiry_id").on(table.sourceInquiryId),
  index("idx_quotes_deal_stage").on(table.dealStage),
  index("idx_quotes_account_created").on(table.accountId, table.createdAt),
  index("idx_quotes_parent_quote_id").on(table.parentQuoteId),
  index("idx_quotes_is_latest_version").on(table.isLatestVersion),
  index("idx_quotes_parent_latest").on(table.parentQuoteId, table.isLatestVersion),
]);

export const quoteVersionEvents = pgTable("quote_version_events", {
  id: serial("id").primaryKey(),
  quoteFamilyRootId: integer("quote_family_root_id").notNull().references((): AnyPgColumn => quotes.id, { onDelete: "cascade" }),
  quoteId: integer("quote_id").references((): AnyPgColumn => quotes.id, { onDelete: "set null" }),
  eventType: text("event_type").notNull(),
  actorUserId: integer("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  fromQuoteId: integer("from_quote_id").references((): AnyPgColumn => quotes.id, { onDelete: "set null" }),
  toQuoteId: integer("to_quote_id").references((): AnyPgColumn => quotes.id, { onDelete: "set null" }),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_quote_version_events_family").on(table.quoteFamilyRootId),
  index("idx_quote_version_events_quote").on(table.quoteId),
  index("idx_quote_version_events_created").on(table.createdAt),
]);

export const dealerPortalOrderSubmissions = pgTable("dealer_portal_order_submissions", {
  portalOrderId: text("portal_order_id").primaryKey(),
  portalCompanyId: text("portal_company_id").notNull().references(
    () => dealerPortalCompanyMappings.portalCompanyId,
    { onDelete: "restrict" },
  ),
  requestHash: text("request_hash").notNull(),
  snapshotHash: text("snapshot_hash").notNull(),
  accountId: integer("account_id").notNull().references(() => accounts.id, { onDelete: "restrict" }),
  quoteId: integer("quote_id").references(() => quotes.id, { onDelete: "restrict" }),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  uniqueIndex("dealer_portal_order_submissions_quote_key").on(table.quoteId),
  index("dealer_portal_order_submissions_company_created_idx").on(table.portalCompanyId, table.createdAt),
]);

export const planningAgreementStatusValues = [
  "required",
  "sent",
  "signed_awaiting_payment",
  "paid_active",
  "delivered",
  "credited",
  "waived",
  "expired",
  "canceled",
] as const;

export const planningAgreementTierValues = [
  "simple_layout",
  "standard_design",
  "complex_planning",
  "custom",
] as const;

export const planningAgreementPaymentMethodValues = [
  "check",
  "card",
  "ach",
  "cash",
  "other",
] as const;

export const planningAgreementEventTypeValues = [
  "created",
  "updated",
  "sent",
  "signed",
  "payment_confirmed",
  "waived",
  "delivered",
  "credit_applied",
  "expired",
  "canceled",
] as const;

export const planningAgreements = pgTable("planning_agreements", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").references(() => accounts.id, { onDelete: "set null" }),
  quoteId: integer("quote_id").references((): AnyPgColumn => quotes.id, { onDelete: "set null" }),
  quoteFamilyRootId: integer("quote_family_root_id").references((): AnyPgColumn => quotes.id, { onDelete: "set null" }),
  status: text("status").notNull().default("required"),
  tier: text("tier").notNull().default("standard_design"),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull().default("0"),
  creditEligible: boolean("credit_eligible").notNull().default(true),
  creditExpiresAt: timestamp("credit_expires_at"),
  scopeSummary: text("scope_summary"),
  internalNotes: text("internal_notes"),
  signingToken: text("signing_token").unique(),
  agreementDocumentSnapshot: jsonb("agreement_document_snapshot"),
  signedDocumentSnapshot: jsonb("signed_document_snapshot"),
  customerSignatureData: jsonb("customer_signature_data"),
  customerSignedAt: timestamp("customer_signed_at"),
  customerSignedIp: text("customer_signed_ip"),
  signatureAuditTrail: jsonb("signature_audit_trail"),
  signatureEmailSentAt: timestamp("signature_email_sent_at"),
  signatureEmailMessage: text("signature_email_message"),
  agreementSentAt: timestamp("agreement_sent_at"),
  agreementSignedAt: timestamp("agreement_signed_at"),
  paymentConfirmedAt: timestamp("payment_confirmed_at"),
  paymentConfirmedBy: integer("payment_confirmed_by").references(() => users.id, { onDelete: "set null" }),
  paymentMethod: text("payment_method"),
  paymentReference: text("payment_reference"),
  paymentNotes: text("payment_notes"),
  waivedAt: timestamp("waived_at"),
  waivedBy: integer("waived_by").references(() => users.id, { onDelete: "set null" }),
  waiverReason: text("waiver_reason"),
  deliveredAt: timestamp("delivered_at"),
  deliveredBy: integer("delivered_by").references(() => users.id, { onDelete: "set null" }),
  creditedQuoteId: integer("credited_quote_id").references((): AnyPgColumn => quotes.id, { onDelete: "set null" }),
  creditedAt: timestamp("credited_at"),
  appliedCreditAmount: decimal("applied_credit_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_planning_agreements_account_id").on(table.accountId),
  index("idx_planning_agreements_quote_id").on(table.quoteId),
  index("idx_planning_agreements_quote_family_root_id").on(table.quoteFamilyRootId),
  index("idx_planning_agreements_status").on(table.status),
  index("idx_planning_agreements_signing_token").on(table.signingToken),
  index("idx_planning_agreements_payment_confirmed_at").on(table.paymentConfirmedAt),
  index("idx_planning_agreements_credit_expires_at").on(table.creditExpiresAt),
]);

export const planningAgreementEvents = pgTable("planning_agreement_events", {
  id: serial("id").primaryKey(),
  planningAgreementId: integer("planning_agreement_id").notNull().references(() => planningAgreements.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  actorUserId: integer("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  fromStatus: text("from_status"),
  toStatus: text("to_status"),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_planning_agreement_events_agreement_id").on(table.planningAgreementId),
  index("idx_planning_agreement_events_created_at").on(table.createdAt),
]);

export const emailDeliveryAttempts = pgTable("email_delivery_attempts", {
  id: serial("id").primaryKey(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  messageType: text("message_type").notNull(),
  quoteId: integer("quote_id").references((): AnyPgColumn => quotes.id, { onDelete: "set null" }),
  planningAgreementId: integer("planning_agreement_id").references((): AnyPgColumn => planningAgreements.id, { onDelete: "set null" }),
  status: text("status").notNull().default("pending"),
  attemptCount: integer("attempt_count").notNull().default(1),
  providerMessageId: text("provider_message_id"),
  lastErrorType: text("last_error_type"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  sentAt: timestamp("sent_at"),
}, (table) => [
  index("idx_email_delivery_attempts_quote").on(table.quoteId),
  index("idx_email_delivery_attempts_planning").on(table.planningAgreementId),
  index("idx_email_delivery_attempts_status").on(table.status),
  index("idx_email_delivery_attempts_created").on(table.createdAt),
]);

export const quoteApprovalDrawings = pgTable("quote_approval_drawings", {
  id: serial("id").primaryKey(),
  quoteId: integer("quote_id").notNull().references((): AnyPgColumn => quotes.id, { onDelete: "cascade" }),
  quoteFamilyRootId: integer("quote_family_root_id").references((): AnyPgColumn => quotes.id, { onDelete: "set null" }),
  drawingType: text("drawing_type").notNull().default("louvered_roof_order_approval"),
  status: text("status").notNull().default("draft"),
  manufacturer: text("manufacturer"),
  productSystem: text("product_system"),
  title: text("title"),
  revisionLabel: text("revision_label"),
  copiedFromDrawingId: integer("copied_from_drawing_id").references((): AnyPgColumn => quoteApprovalDrawings.id, { onDelete: "set null" }),
  drawingData: jsonb("drawing_data").notNull(),
  publicSnapshot: jsonb("public_snapshot"),
  customerNotes: text("customer_notes"),
  internalNotes: text("internal_notes"),
  sourceQuoteOrOrderId: text("source_quote_or_order_id"),
  sourceDocumentLabel: text("source_document_label"),
  sourceDocumentUrl: text("source_document_url"),
  sourcePreparedBy: text("source_prepared_by"),
  sourcePreparedAt: timestamp("source_prepared_at"),
  readyAt: timestamp("ready_at"),
  sentForSignatureAt: timestamp("sent_for_signature_at"),
  signedLockedAt: timestamp("signed_locked_at"),
  orderStatus: text("order_status").notNull().default("not_reviewed"),
  orderReviewedBy: integer("order_reviewed_by").references(() => users.id, { onDelete: "set null" }),
  orderReviewedAt: timestamp("order_reviewed_at"),
  orderReadyBy: integer("order_ready_by").references(() => users.id, { onDelete: "set null" }),
  orderReadyAt: timestamp("order_ready_at"),
  orderReadyOverrideReason: text("order_ready_override_reason"),
  supersededById: integer("superseded_by_id").references((): AnyPgColumn => quoteApprovalDrawings.id, { onDelete: "set null" }),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_quote_approval_drawings_quote_id").on(table.quoteId),
  index("idx_quote_approval_drawings_family_root").on(table.quoteFamilyRootId),
  index("idx_quote_approval_drawings_status").on(table.status),
  index("idx_quote_approval_drawings_order_status").on(table.orderStatus),
  index("idx_quote_approval_drawings_copied_from").on(table.copiedFromDrawingId),
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
  sku: text("sku"),
  description: text("description"),
  manufacturer: text("manufacturer").notNull(),
  category: text("category"), // e.g., "Extrusions", "Gutters", "Louvers"
  productType: text("product_type").notNull().default("simple"), // simple, configurable
  // Pricing fields
  retailPrice: decimal("retail_price", { precision: 10, scale: 2 }).notNull(), // MSRP/list price from manufacturer
  costPrice: decimal("cost_price", { precision: 10, scale: 2 }).notNull().default("0"), // EDG's internal cost after supplier discount
  // Legacy unit price remains synchronized with retailPrice for compatibility.
  defaultUnitPrice: decimal("default_unit_price", { precision: 10, scale: 2 }).notNull().default("0"),
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
  index("idx_products_sku").on(table.sku),
  index("idx_products_product_type").on(table.productType),
  index("idx_products_category").on(table.category),
  index("idx_products_manufacturer_category").on(table.manufacturer, table.category),
]);

// Privacy-minimized, append-only evidence that an authoritative business action
// completed. Customer content, request bodies, filenames, dimensions, prices,
// signing tokens, and email addresses do not belong in this table.
export const businessEvents = pgTable("business_events", {
  id: serial("id").primaryKey(),
  eventKey: text("event_key").unique(),
  eventType: text("event_type").notNull(),
  quoteId: integer("quote_id").references((): AnyPgColumn => quotes.id, { onDelete: "set null" }),
  accountId: integer("account_id").references(() => accounts.id, { onDelete: "set null" }),
  inquiryId: integer("inquiry_id").references(() => leadInquiries.id, { onDelete: "set null" }),
  productId: integer("product_id").references(() => products.id, { onDelete: "set null" }),
  actorUserId: integer("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  occurredAt: timestamp("occurred_at").defaultNow().notNull(),
}, (table) => [
  index("idx_business_events_type_time").on(table.eventType, table.occurredAt),
  index("idx_business_events_quote").on(table.quoteId),
  index("idx_business_events_account").on(table.accountId),
  index("idx_business_events_inquiry").on(table.inquiryId),
  index("idx_business_events_product").on(table.productId),
]);

// Admin-managed pricing defaults for specific catalogs or product groups.
export const pricingDefaults = pgTable("pricing_defaults", {
  id: serial("id").primaryKey(),
  scope: text("scope").notNull(),
  markupType: text("markup_type").notNull().default("percentage"),
  markupValue: decimal("markup_value", { precision: 10, scale: 2 }).notNull().default("100"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("idx_pricing_defaults_scope").on(table.scope),
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
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_pricing_tables_product_id").on(table.productId),
]);

// Colors table - predefined color options for products
export const colors = pgTable("colors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(), // e.g., "White", "Black", "Bronze"
  hexCode: text("hex_code").notNull(), // e.g., "#FFFFFF", "#000000"
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_colors_name").on(table.name),
]);

// Product colors - junction table linking products to their available colors
export const productColors = pgTable("product_colors", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull(),
  colorId: integer("color_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_product_colors_product_id").on(table.productId),
  index("idx_product_colors_color_id").on(table.colorId),
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
  sku: text("sku"),
  manufacturer: text("manufacturer"), // frozen manufacturer at the time the quote line is created
  unit: text("unit"), // frozen catalog unit such as each, sq ft, or linear ft
  priceSource: text("price_source"), // manual, catalog_cost, dimensional_catalog, configured_catalog, or import
  sourceMetadata: jsonb("source_metadata"), // frozen catalog/import/configuration provenance for audit and recovery
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
  baseProductId: integer("base_product_id"), // optional parent line-item relationship
  isAccessory: boolean("is_accessory").default(false), // legacy line-item flag retained for existing quotes
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

// Secondary contact schema for multi-contact accounts
export const secondaryContactSchema = z.object({
  id: z.string(), // unique identifier for the contact
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().min(1, "Phone is required"),
  role: z.string().optional(), // e.g., "Operations Manager", "Purchasing Director"
  isPrimary: z.boolean().optional().default(false), // flag to indicate primary contact
});

export type SecondaryContact = z.infer<typeof secondaryContactSchema>;

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
  secondaryContacts: z.array(secondaryContactSchema).optional().nullable(), // Array of additional contacts
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
  internalNotes: z.union([z.string(), z.null()]).transform(val => val === null ? "" : val).optional(),
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
  signedDocumentSnapshot: z.any().optional().nullable(),
  signatureAuditTrail: z.any().optional().nullable(),
  esigIncludeApprovalDrawing: z.boolean().optional().default(false),
});

const planningMoneySchema = z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString());
const planningDateSchema = z.union([z.date(), z.string(), z.null()])
  .transform((value) => {
    if (value === null || value === "") return null;
    return value instanceof Date ? value : new Date(value);
  })
  .optional()
  .nullable();

export const insertPlanningAgreementSchema = createInsertSchema(planningAgreements).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  accountId: z.number().int().positive().optional().nullable(),
  quoteId: z.number().int().positive().optional().nullable(),
  quoteFamilyRootId: z.number().int().positive().optional().nullable(),
  status: z.enum(planningAgreementStatusValues).default("required"),
  tier: z.enum(planningAgreementTierValues).default("standard_design"),
  amount: planningMoneySchema,
  creditEligible: z.boolean().default(true),
  creditExpiresAt: planningDateSchema,
  scopeSummary: z.string().optional().nullable(),
  internalNotes: z.string().optional().nullable(),
  signingToken: z.string().optional().nullable(),
  agreementDocumentSnapshot: z.any().optional().nullable(),
  signedDocumentSnapshot: z.any().optional().nullable(),
  customerSignatureData: z.any().optional().nullable(),
  customerSignedAt: planningDateSchema,
  customerSignedIp: z.string().optional().nullable(),
  signatureAuditTrail: z.any().optional().nullable(),
  signatureEmailSentAt: planningDateSchema,
  signatureEmailMessage: z.string().optional().nullable(),
  agreementSentAt: planningDateSchema,
  agreementSignedAt: planningDateSchema,
  paymentConfirmedAt: planningDateSchema,
  paymentConfirmedBy: z.number().int().positive().optional().nullable(),
  paymentMethod: z.enum(planningAgreementPaymentMethodValues).optional().nullable(),
  paymentReference: z.string().optional().nullable(),
  paymentNotes: z.string().optional().nullable(),
  waivedAt: planningDateSchema,
  waivedBy: z.number().int().positive().optional().nullable(),
  waiverReason: z.string().optional().nullable(),
  deliveredAt: planningDateSchema,
  deliveredBy: z.number().int().positive().optional().nullable(),
  creditedQuoteId: z.number().int().positive().optional().nullable(),
  creditedAt: planningDateSchema,
  appliedCreditAmount: planningMoneySchema.optional().default("0"),
  createdBy: z.number().int().positive().optional().nullable(),
});

export const insertPlanningAgreementEventSchema = createInsertSchema(planningAgreementEvents).omit({
  id: true,
  createdAt: true,
}).extend({
  planningAgreementId: z.number().int().positive(),
  eventType: z.enum(planningAgreementEventTypeValues),
  actorUserId: z.number().int().positive().optional().nullable(),
  fromStatus: z.enum(planningAgreementStatusValues).optional().nullable(),
  toStatus: z.enum(planningAgreementStatusValues).optional().nullable(),
  payload: z.any().optional().nullable(),
});

export const insertQuoteApprovalDrawingSchema = createInsertSchema(quoteApprovalDrawings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  quoteId: z.number().int().positive(),
  quoteFamilyRootId: z.number().int().positive().optional().nullable(),
  drawingType: z.string().default("louvered_roof_order_approval"),
  status: z.enum(quoteApprovalDrawingStatusValues).default("draft"),
  manufacturer: z.string().optional().nullable(),
  productSystem: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  revisionLabel: z.string().optional().nullable(),
  copiedFromDrawingId: z.number().int().positive().optional().nullable(),
  drawingData: z.any(),
  publicSnapshot: z.any().optional().nullable(),
  customerNotes: z.string().optional().nullable(),
  internalNotes: z.string().optional().nullable(),
  sourceQuoteOrOrderId: z.string().optional().nullable(),
  sourceDocumentLabel: z.string().optional().nullable(),
  sourceDocumentUrl: z.string().optional().nullable(),
  sourcePreparedBy: z.string().optional().nullable(),
  sourcePreparedAt: planningDateSchema,
  readyAt: planningDateSchema,
  sentForSignatureAt: planningDateSchema,
  signedLockedAt: planningDateSchema,
  orderStatus: z.enum(quoteApprovalDrawingOrderStatusValues).default("not_reviewed"),
  orderReviewedBy: z.number().int().positive().optional().nullable(),
  orderReviewedAt: planningDateSchema,
  orderReadyBy: z.number().int().positive().optional().nullable(),
  orderReadyAt: planningDateSchema,
  orderReadyOverrideReason: z.string().optional().nullable(),
  supersededById: z.number().int().positive().optional().nullable(),
  createdBy: z.number().int().positive().optional().nullable(),
  updatedBy: z.number().int().positive().optional().nullable(),
});


export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
}).extend({
  sku: z.string().max(100, "SKU is too long").optional().nullable(),
  manufacturer: z.string().min(1, "Manufacturer is required"),
  category: z.string().optional().nullable(),
  retailPrice: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()),
  costPrice: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()).optional(),
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

export const insertPricingDefaultSchema = createInsertSchema(pricingDefaults).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  scope: z.string().min(1, "Scope is required"),
  markupType: z.enum(["percentage"]),
  markupValue: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()),
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

export const insertColorSchema = createInsertSchema(colors).omit({
  id: true,
  createdAt: true,
});

export const insertProductColorSchema = createInsertSchema(productColors).omit({
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

export const insertLeadAttachmentSchema = createInsertSchema(leadAttachments).omit({
  id: true,
  uploadedAt: true,
});

// Type exports
export type Account = typeof accounts.$inferSelect;
export type Customer = typeof accounts.$inferSelect; // Legacy alias
export type Quote = typeof quotes.$inferSelect;
export type QuoteVersionEvent = typeof quoteVersionEvents.$inferSelect;
export type EmailDeliveryAttempt = typeof emailDeliveryAttempts.$inferSelect;
export type BusinessEvent = typeof businessEvents.$inferSelect;
export type PlanningAgreement = typeof planningAgreements.$inferSelect;
export type PlanningAgreementEvent = typeof planningAgreementEvents.$inferSelect;
export type QuoteApprovalDrawing = typeof quoteApprovalDrawings.$inferSelect;
export type Product = typeof products.$inferSelect;
export type LineItem = typeof lineItems.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type ContractTemplate = typeof contractTemplates.$inferSelect;
export type PricingDefault = typeof pricingDefaults.$inferSelect;
export type PricingTable = typeof pricingTables.$inferSelect;
export type Color = typeof colors.$inferSelect;
export type ProductColor = typeof productColors.$inferSelect;
export type QuoteCoverPhoto = typeof quoteCoverPhotos.$inferSelect;
export type QuoteProductRendering = typeof quoteProductRenderings.$inferSelect;
export type LeadAttachment = typeof leadAttachments.$inferSelect;
export type LeadIntakeSubmission = typeof leadIntakeSubmissions.$inferSelect;
export type LeadInquiry = typeof leadInquiries.$inferSelect;
export type LeadAgentAssessment = typeof leadAgentAssessments.$inferSelect;
export type LeadInquiryStatusEvent = typeof leadInquiryStatusEvents.$inferSelect;

export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type InsertCustomer = z.infer<typeof insertAccountSchema>; // Legacy alias
export type InsertQuote = z.infer<typeof insertQuoteSchema>;
export type InsertPlanningAgreement = z.infer<typeof insertPlanningAgreementSchema>;
export type InsertPlanningAgreementEvent = z.infer<typeof insertPlanningAgreementEventSchema>;
export type InsertQuoteApprovalDrawing = z.infer<typeof insertQuoteApprovalDrawingSchema>;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type InsertLineItem = z.infer<typeof insertLineItemSchema>;
export type InsertGroup = z.infer<typeof insertGroupSchema>;
export type InsertContractTemplate = z.infer<typeof insertContractTemplateSchema>;
export type InsertPricingDefault = z.infer<typeof insertPricingDefaultSchema>;
export type InsertPricingTable = z.infer<typeof insertPricingTableSchema>;
export type InsertColor = z.infer<typeof insertColorSchema>;
export type InsertProductColor = z.infer<typeof insertProductColorSchema>;
export type InsertQuoteCoverPhoto = z.infer<typeof insertQuoteCoverPhotoSchema>;
export type InsertQuoteProductRendering = z.infer<typeof insertQuoteProductRenderingSchema>;
export type InsertLeadAttachment = z.infer<typeof insertLeadAttachmentSchema>;

export type QuoteWithDetails = Quote & {
  account?: Account; // Optional since accountId can be null
  customer?: Account; // Legacy alias for backward compatibility - also optional
  lineItems: (LineItem & { manufacturer?: string })[];
  groups?: Group[];
  contractTemplate?: ContractTemplate;
  coverPhoto?: QuoteCoverPhoto; // Cover page image
  productRenderings?: QuoteProductRendering[]; // Visual assets and details
  planningAgreement?: PlanningAgreement;
  approvalDrawing?: QuoteApprovalDrawing;
};

export type LeadWithAttachments = Account & {
  attachments?: LeadAttachment[];
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
