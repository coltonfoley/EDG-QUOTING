import type { Express } from "express";
import { storage } from "../storage";
import { z } from "zod";
import { db } from "../db";
import { quotes as quotesTable, type InsertQuote } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { isAuthenticated, requireAdmin } from "../auth";
import fs from "fs";
import path from "path";
import {
  insertQuoteSchema,
  updateQuoteSchema,
  idParamSchema,
  quoteIdParamSchema,
  imageIdParamSchema,
  createQuoteCoverPhotoSchema,
  createQuoteProductRenderingSchema,
  updateQuoteCoverPhotoSchema,
  updateQuoteProductRenderingSchema,
  createQuoteSchema,
  CreateQuoteBody,
  signatureTokenParamSchema,
  submitSignatureSchema,
  approvalDrawingIdParamSchema,
  orderReadyApprovalDrawingSchema,
  updateApprovalDrawingSchema
} from "../validation-schemas";
import multer from "multer";
import { extractQuoteDataFromImages, extractQuoteDataFromPDF, isOpenAIConfigured } from "../openai";
import { ObjectStorageService, getObjectStorageProvider } from "../objectStorage";
import { nanoid } from "nanoid";
import { buildAppUrl } from "../config";
import { sendQuoteToOperations } from "../integrations/operations";
import {
  ORDER_APPROVAL_SIGNATURE_CONSENT,
} from "@shared/approvalDrawing";
import {
  buildPublicSigningQuote,
  createDocumentFingerprint,
  formatJobsiteAddress,
  getClientIp,
  isArchivedQuoteVersion,
  sendArchivedQuoteResponse,
  shouldIncludeApprovalDrawingInPackage,
} from "../quotePublicSigning";

const quotesQuerySchema = z.object({
  page: z.coerce.number().int().gte(1).optional(),
  pageSize: z.coerce.number().int().gte(1).lte(500).optional(),
});

const DEFAULT_MAX_QUOTE_PDF_UPLOAD_BYTES = 75 * 1024 * 1024;
const quotePdfUploadUrlSchema = z.object({
  filename: z.string().min(1).max(255),
  fileSize: z.number().int().positive().optional(),
});
const uploadedQuotePdfImportSchema = z.object({
  objectPath: z.string().min(1).max(1024),
  filename: z.string().min(1).max(255),
  fileSize: z.number().int().positive().optional(),
});

function getMaxQuotePdfUploadBytes(): number {
  const configuredMb = Number(process.env.MAX_QUOTE_PDF_UPLOAD_MB || "");
  if (Number.isFinite(configuredMb) && configuredMb > 0) {
    return Math.floor(configuredMb * 1024 * 1024);
  }

  return DEFAULT_MAX_QUOTE_PDF_UPLOAD_BYTES;
}

function formatMegabytes(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)}MB`;
}

function sanitizeQuotePdfFilename(filename: string): string {
  return filename
    .replace(/[/\\]/g, "_")
    .replace(/[^a-zA-Z0-9._ -]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 120);
}

async function readUploadedQuotePdfBuffer(objectPath: string): Promise<{
  buffer: Buffer;
  size: number;
  contentType?: string;
}> {
  const objectStorageService = new ObjectStorageService();

  if (getObjectStorageProvider() === "vercel-blob") {
    const metadata = await objectStorageService.getPublicObjectEntityMetadata(objectPath);
    if (!metadata.publicUrl) {
      throw new Error("Uploaded PDF URL was not available.");
    }

    const response = await fetch(metadata.publicUrl);
    if (!response.ok) {
      throw new Error(`Failed to download uploaded PDF: ${response.status} ${response.statusText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      buffer,
      size: metadata.size ?? buffer.length,
      contentType: metadata.contentType,
    };
  }

  const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
  const [metadata] = await objectFile.getMetadata();
  const [buffer] = await objectFile.download();
  return {
    buffer,
    size: Number(metadata.size || buffer.length),
    contentType: metadata.contentType,
  };
}

async function cleanupTemporaryQuotePdf(objectPath: string): Promise<void> {
  if (getObjectStorageProvider() !== "vercel-blob") {
    return;
  }

  try {
    const { del } = await import("@vercel/blob");
    await del(objectPath);
    console.log(`🧹 Deleted temporary uploaded quote PDF: ${objectPath}`);
  } catch (error) {
    console.warn(`⚠️ Failed to delete temporary uploaded quote PDF ${objectPath}:`, error);
  }
}

function getActorUserId(req: any): number | null {
  const userId = req.user?.id;
  return typeof userId === "number" ? userId : null;
}

async function freezeReadyApprovalDrawingForQuote(quoteId: number, actorUserId?: number | null) {
  const drawing = await storage.getQuoteApprovalDrawingByQuoteId(quoteId);
  if (!drawing) return undefined;
  if (drawing.status === "signed_locked" && drawing.publicSnapshot) return drawing;
  if (drawing.status === "signed_locked") {
    return storage.markQuoteApprovalDrawingSignedLocked(drawing.id, actorUserId);
  }
  if (drawing.status === "sent_for_signature" && drawing.publicSnapshot) return drawing;
  return storage.freezeQuoteApprovalDrawingForSignature(drawing.id, actorUserId);
}

async function ensurePublicApprovalDrawingSnapshot<T extends { id: number; approvalDrawing?: any }>(
  quote: T,
  reloadQuote: () => Promise<T | undefined>,
): Promise<T> {
  if (!shouldIncludeApprovalDrawingInPackage(quote)) return quote;

  const status = quote.approvalDrawing.status;
  if (!["ready_for_agreement", "sent_for_signature", "signed_locked"].includes(status)) {
    const error = new Error("Order approval drawing is not ready for customer review. Please contact EDG for an updated approval link.");
    (error as any).status = 409;
    (error as any).code = "APPROVAL_DRAWING_NOT_READY";
    throw error;
  }

  if (status === "ready_for_agreement" || !quote.approvalDrawing.publicSnapshot) {
    await freezeReadyApprovalDrawingForQuote(quote.id, null);
    quote = await reloadQuote() || quote;
  }

  if (!quote.approvalDrawing?.publicSnapshot || typeof quote.approvalDrawing.publicSnapshot !== "object") {
    const error = new Error("Order approval drawing snapshot is not ready. Please contact EDG for an updated approval link.");
    (error as any).status = 409;
    (error as any).code = "APPROVAL_DRAWING_SNAPSHOT_NOT_READY";
    throw error;
  }

  return quote;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

class SimpleRateLimiter {
  private limits: Map<string, RateLimitEntry> = new Map();
  
  constructor(
    private maxRequests: number,
    private windowMs: number
  ) {}

  isAllowed(identifier: string): boolean {
    const now = Date.now();
    const entry = this.limits.get(identifier);
    
    if (!entry || now > entry.resetTime) {
      this.limits.set(identifier, {
        count: 1,
        resetTime: now + this.windowMs
      });
      return true;
    }
    
    if (entry.count >= this.maxRequests) {
      return false;
    }
    
    entry.count++;
    return true;
  }

  getRemainingTime(identifier: string): number {
    const entry = this.limits.get(identifier);
    if (!entry) return 0;
    
    return Math.max(0, entry.resetTime - Date.now());
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of Array.from(this.limits.entries())) {
      if (now > entry.resetTime) {
        this.limits.delete(key);
      }
    }
  }
}

const pdfProcessingRateLimit = new SimpleRateLimiter(10, 10 * 60 * 1000);

setInterval(() => {
  pdfProcessingRateLimit.cleanup();
}, 5 * 60 * 1000);

const rateLimitPDFProcessing = (req: any, res: any, next: any) => {
  const userIdentifier = req.user?.id || req.ip || 'anonymous';
  
  if (!pdfProcessingRateLimit.isAllowed(userIdentifier)) {
    const remainingTime = pdfProcessingRateLimit.getRemainingTime(userIdentifier);
    const remainingMinutes = Math.ceil(remainingTime / (60 * 1000));
    
    console.warn(`🚫 Rate limit exceeded for user ${userIdentifier}`);
    
    return res.status(429).json({
      message: `Too many PDF processing requests. Please try again in ${remainingMinutes} minute${remainingMinutes === 1 ? '' : 's'}.`,
      success: false,
      retryAfter: remainingTime
    });
  }
  
  next();
};

function rejectIfAIQuoteExtractionIsNotConfigured(res: any): boolean {
  if (isOpenAIConfigured()) {
    return false;
  }

  res.status(503).json({
    message: "AI quote extraction is not configured for this environment. Set OPENAI_API_KEY before using PDF import.",
    success: false,
    code: "AI_NOT_CONFIGURED",
  });
  return true;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/pdf',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/jpg',
      'image/png'
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  },
});

function parseFullName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim();
  if (!trimmed) {
    return { firstName: '', lastName: '' };
  }
  
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  } else if (parts.length === 2) {
    return { firstName: parts[0], lastName: parts[1] };
  } else {
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
  }
}

async function handleCustomerAttachment(
  customerData: { 
    name?: string | null; 
    email?: string | null; 
    phone?: string | null; 
    company?: string | null; 
    address?: string | null;
    streetAddress?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    state?: string | null;
    zipCode?: string | null;
    country?: string | null;
  },
  attachCustomer: 'auto' | 'none' | 'match_only',
  existingCustomerId?: number
): Promise<{ accountId: number | null; wasCreated: boolean }> {
  if (attachCustomer === 'none') {
    return { accountId: null, wasCreated: false };
  }

  const hasContactInfo = !!(
    (customerData.name && customerData.name.trim()) || 
    (customerData.email && customerData.email.trim()) || 
    (customerData.phone && customerData.phone.trim())
  );
  const hasCompanyOnly = !hasContactInfo && customerData.company && customerData.company.trim();

  if (hasCompanyOnly && attachCustomer === 'auto') {
    console.log('Company-only import detected, checking for existing company match');
    
    const accounts = await storage.getAllAccounts();
    const existingByCompany = accounts.find(acc => {
      const isPlaceholder = acc.name === 'Unnamed Client' && (!acc.email || !acc.email.trim()) && (!acc.phone || !acc.phone.trim());
      const companyMatches = acc.company && acc.company.toLowerCase().trim() === customerData.company?.toLowerCase().trim();
      return !isPlaceholder && companyMatches;
    });

    if (existingByCompany) {
      console.log(`Found existing company match: ${existingByCompany.name} (ID: ${existingByCompany.id})`);
      return { accountId: existingByCompany.id, wasCreated: false };
    }

    console.log('No existing company found, creating new account');
    const clientData = {
      name: customerData.company!.trim(),
      firstName: undefined,
      lastName: undefined,
      email: `import_${Date.now()}@example.com`,
      phone: '',
      company: customerData.company || undefined,
      accountType: 'commercial' as const,
      paymentTerms: 'net_30' as const,
      billingAddress: customerData.address || undefined,
      streetAddress: customerData.streetAddress || undefined,
      addressLine2: customerData.addressLine2 || undefined,
      city: customerData.city || undefined,
      state: customerData.state || undefined,
      zipCode: customerData.zipCode || undefined,
      country: customerData.country || undefined,
    };

    const newClient = await storage.createClient(clientData, {
      allowDuplicate: true,
      updateIfExists: false
    });
    return { accountId: newClient.id, wasCreated: true };
  }

  let existingAccount = null;
  if (customerData.email && customerData.email.trim()) {
    existingAccount = await storage.getAccountByEmail(customerData.email);
  }
  
  if (!existingAccount && customerData.name && customerData.name.trim()) {
    const accounts = await storage.getAllAccounts();
    existingAccount = accounts.find(acc => {
      const isPlaceholder = acc.name === 'Unnamed Client' && (!acc.email || !acc.email.trim()) && (!acc.phone || !acc.phone.trim());
      return !isPlaceholder && acc.name.toLowerCase().trim() === (customerData.name?.toLowerCase().trim() || '');
    });
  }

  if (existingAccount) {
    const isPlaceholder = existingAccount.name === 'Unnamed Client' && 
                         (!existingAccount.email || !existingAccount.email.trim()) && 
                         (!existingAccount.phone || !existingAccount.phone.trim());
    
    if (isPlaceholder) {
      console.log(`Skipping placeholder account ${existingAccount.id}, will create new account instead`);
      existingAccount = null;
    } else {
      console.log(`Found existing account match: ${existingAccount.name} (ID: ${existingAccount.id})`);
      return { accountId: existingAccount.id, wasCreated: false };
    }
  }

  if (attachCustomer === 'match_only') {
    return { accountId: null, wasCreated: false };
  }

  if (attachCustomer === 'auto') {
    let firstName = (customerData as any).firstName || '';
    let lastName = (customerData as any).lastName || '';
    
    if (!firstName && !lastName && customerData.name) {
      const parsed = parseFullName(customerData.name);
      firstName = parsed.firstName;
      lastName = parsed.lastName;
    }
    
    const name = customerData.name || `${firstName} ${lastName}`.trim() || 'Unnamed Client';
    
    const clientData = {
      name,
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      email: customerData.email || `import_${Date.now()}@example.com`,
      phone: customerData.phone || '',
      company: customerData.company || undefined,
      accountType: 'homeowner' as const,
      paymentTerms: 'net_30' as const,
      billingAddress: customerData.address || undefined,
      streetAddress: customerData.streetAddress || undefined,
      addressLine2: customerData.addressLine2 || undefined,
      city: customerData.city || undefined,
      state: customerData.state || undefined,
      zipCode: customerData.zipCode || undefined,
      country: customerData.country || undefined,
    };

    console.log('Creating new client for import (unified model):', clientData);
    const newClient = await storage.createClient(clientData, {
      allowDuplicate: false,
      updateIfExists: true
    });
    return { accountId: newClient.id, wasCreated: true };
  }

  return { accountId: null, wasCreated: false };
}

async function upsertAccountFromHint(customerCreate: NonNullable<CreateQuoteBody['customerCreate']>) {
  try {
    if (customerCreate.email) {
      const existingAccount = await storage.getAccountByEmail(customerCreate.email);
      if (existingAccount) {
        console.log(`Found existing account by email: ${customerCreate.email}`);
        return existingAccount;
      }
    }
    
    const accountData = {
      name: customerCreate.name || '',
      email: customerCreate.email || '',
      phone: customerCreate.phone || '',
      company: customerCreate.company || undefined,
      accountType: 'homeowner' as const,
      paymentTerms: 'net_30' as const,
      billingAddress: undefined,
    };
    
    console.log('Creating new account from customer hint:', accountData);
    const newAccount = await storage.createAccount(accountData);
    return newAccount;
  } catch (error) {
    console.error('Error upserting account from hint:', error);
    throw error;
  }
}

export function registerQuoteRoutes(app: Express) {
  app.get("/api/quotes", isAuthenticated, async (req, res) => {
    try {
      console.log("Attempting to get all quotes...");
      const parsedQuery = quotesQuerySchema.safeParse(req.query);
      if (!parsedQuery.success) {
        return res.status(400).json({
          message: "Invalid query parameters",
          errors: parsedQuery.error.errors,
        });
      }

      const { page, pageSize } = parsedQuery.data;
      const quotes = await storage.getAllQuotes({ page, pageSize });

      if (pageSize) {
        const [{ value: totalCount }] = await db
          .select({ value: sql<number>`count(*)` })
          .from(quotesTable)
          .where(eq(quotesTable.isLatestVersion, true));

        const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / pageSize);
        res.setHeader("X-Total-Count", totalCount.toString());
        res.setHeader("X-Page", String(page ?? 1));
        res.setHeader("X-Page-Size", pageSize.toString());
        res.setHeader("X-Total-Pages", totalPages.toString());
      }

      console.log(`Found ${quotes.length} quotes`);
      res.json(quotes);
    } catch (error) {
      console.error("Error in /api/quotes:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/quotes/:id", isAuthenticated, async (req, res) => {
    try {
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }
      
      const quote = await storage.getQuoteWithDetails(params.data.id);
      if (!quote) {
        return res.status(404).json({ message: "Quote not found" });
      }
      res.json(quote);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/quotes", isAuthenticated, async (req, res) => {
    try {
      console.log("Quote creation request body:", JSON.stringify(req.body, null, 2));
      const { accountId, customerCreate, ...baseQuoteData } = createQuoteSchema.parse(req.body);
      
      let resolvedAccountId = accountId ?? null;

      if (!resolvedAccountId && customerCreate) {
        console.log("Creating account from customer hint");
        const account = await upsertAccountFromHint(customerCreate);
        resolvedAccountId = account.id;
      }

      const quoteData: InsertQuote = {
        ...baseQuoteData,
        accountId: resolvedAccountId,
        quoteNumber: `Q-${Date.now()}`,
        taxRate: baseQuoteData.taxRate ?? "0",
        discount: baseQuoteData.discount ?? "0",
        tariffRate: baseQuoteData.tariffRate ?? "0",
        shipping: baseQuoteData.shipping ?? "0",
        isShippingTaxable: false,
        dealStage: baseQuoteData.dealStage ?? "new_lead",
        esigIncludeApprovalDrawing: false,
      };
      
      const quote = await storage.createQuote(quoteData);
      res.status(201).json(quote);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        console.error("Quote validation errors:", JSON.stringify(error.errors, null, 2));
        return res.status(400).json({ message: "Invalid quote data", errors: error.errors });
      }
      
      if (error.message?.includes("already exists") || error.message?.includes("Unable to generate unique quote number")) {
        console.error("Quote number uniqueness error:", error.message);
        return res.status(409).json({ 
          message: error.message || "Quote number already exists", 
          code: "DUPLICATE_QUOTE_NUMBER" 
        });
      }
      
      console.error("Quote creation error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/quotes/pdf-upload-url", isAuthenticated, async (req: any, res) => {
    try {
      const parsed = quotePdfUploadUrlSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          message: "Invalid upload request",
          success: false,
          errors: parsed.error.errors,
        });
      }

      const maxFileSize = getMaxQuotePdfUploadBytes();
      const { filename, fileSize } = parsed.data;
      if (fileSize && fileSize > maxFileSize) {
        return res.status(413).json({
          message: `File too large. Please upload a PDF smaller than ${formatMegabytes(maxFileSize)}.`,
          success: false,
          maxFileSize,
        });
      }

      const objectStorageService = new ObjectStorageService();
      const sanitizedFilename = sanitizeQuotePdfFilename(filename);
      const userId = String(req.user?.id || "unknown");
      const objectId = `quote-pdf-imports/${userId}/${Date.now()}-${nanoid(8)}-${sanitizedFilename}`;
      const uploadTarget = await objectStorageService.getObjectEntityUploadTarget(objectId, {
        allowedContentTypes: ["application/pdf"],
        maximumSizeInBytes: maxFileSize,
        cacheControlMaxAge: 60 * 60,
      });

      if (uploadTarget.provider === "replit") {
        return res.json({
          uploadMode: uploadTarget.uploadMode,
          uploadUrl: uploadTarget.uploadUrl,
          objectPath: uploadTarget.objectPath,
          maxFileSize,
        });
      }

      res.json({
        uploadMode: uploadTarget.uploadMode,
        clientToken: uploadTarget.clientToken,
        objectPath: uploadTarget.objectPath,
        pathname: uploadTarget.pathname,
        maxFileSize,
      });
    } catch (error) {
      console.error("Error creating quote PDF upload target:", error);
      res.status(500).json({
        message: "Failed to prepare PDF upload. Please try again.",
        success: false,
      });
    }
  });

  app.post("/api/quotes/import-vision-uploaded", isAuthenticated, rateLimitPDFProcessing, async (req: any, res) => {
    let uploadedObjectPath: string | null = null;

    try {
      const parsed = uploadedQuotePdfImportSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          message: "Invalid uploaded PDF request",
          success: false,
          errors: parsed.error.errors,
        });
      }

      const { objectPath, filename, fileSize } = parsed.data;
      uploadedObjectPath = objectPath;
      const maxFileSize = getMaxQuotePdfUploadBytes();

      if (fileSize && fileSize > maxFileSize) {
        return res.status(413).json({
          message: `File too large. Please upload a PDF smaller than ${formatMegabytes(maxFileSize)}.`,
          success: false,
          maxFileSize,
        });
      }

      if (rejectIfAIQuoteExtractionIsNotConfigured(res)) {
        return;
      }

      const uploadedPdf = await readUploadedQuotePdfBuffer(objectPath);
      const contentType = uploadedPdf.contentType?.toLowerCase();
      if (contentType && !contentType.includes("application/pdf")) {
        return res.status(400).json({
          message: "Invalid file type. Please upload a PDF file.",
          success: false,
        });
      }

      if (uploadedPdf.size > maxFileSize || uploadedPdf.buffer.length > maxFileSize) {
        return res.status(413).json({
          message: `File too large. Please upload a PDF smaller than ${formatMegabytes(maxFileSize)}.`,
          success: false,
          maxFileSize,
        });
      }

      console.log(`📄 Processing uploaded PDF with GPT-5: ${filename} (${(uploadedPdf.buffer.length / 1024 / 1024).toFixed(2)}MB)`);

      const extractedQuote = await extractQuoteDataFromPDF(uploadedPdf.buffer);

      if (!extractedQuote) {
        return res.status(400).json({
          message: "Could not extract quote data from PDF. This could be due to: (1) The document doesn't contain recognizable quote/invoice information, (2) The text is unclear or heavily formatted, (3) The document is password-protected or corrupted. Please try a different PDF or ensure it contains standard quote/invoice data.",
          success: false
        });
      }

      console.log(`✅ Quote data extracted from uploaded PDF ${filename}`);

      res.status(200).json({
        success: true,
        filename,
        extractedData: extractedQuote,
        message: "Quote data extracted successfully using temporary upload processing",
        processingMethod: "temporary-upload"
      });
    } catch (error: any) {
      console.error("Uploaded PDF processing error:", error);

      if (error.message?.includes("API") || error.message?.includes("rate limit") || error.message?.includes("quota")) {
        return res.status(503).json({
          message: "AI processing service is temporarily unavailable. Please try again later.",
          success: false
        });
      }

      return res.status(500).json({
        message: `PDF processing failed: ${error.message || 'Unexpected error occurred while processing the PDF. Please try again or contact support if the issue persists.'}`,
        success: false
      });
    } finally {
      if (uploadedObjectPath) {
        await cleanupTemporaryQuotePdf(uploadedObjectPath);
      }
    }
  });

  app.post("/api/quotes/import-vision-direct", isAuthenticated, rateLimitPDFProcessing, upload.single('pdf'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ 
          message: "No PDF file uploaded",
          success: false 
        });
      }

      const file = req.file;
      
      if (file.mimetype !== 'application/pdf') {
        return res.status(400).json({ 
          message: "Invalid file type. Please upload a PDF file.",
          success: false 
        });
      }

      const maxFileSize = getMaxQuotePdfUploadBytes();
      if (file.size > maxFileSize) {
        return res.status(400).json({ 
          message: `File too large. Please upload a PDF smaller than ${formatMegabytes(maxFileSize)}.`,
          success: false 
        });
      }

      if (rejectIfAIQuoteExtractionIsNotConfigured(res)) {
        return;
      }

      console.log(`📄 Processing PDF directly with GPT-5: ${file.originalname} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);

      const extractedQuote = await extractQuoteDataFromPDF(file.buffer);
      
      if (!extractedQuote) {
        return res.status(400).json({ 
          message: "Could not extract quote data from PDF. This could be due to: (1) The document doesn't contain recognizable quote/invoice information, (2) The text is unclear or heavily formatted, (3) The document is password-protected or corrupted. Please try a different PDF or ensure it contains standard quote/invoice data.",
          success: false 
        });
      }

      console.log(`✅ Quote data extracted from ${file.originalname}`);

      res.status(200).json({
        success: true,
        filename: file.originalname,
        extractedData: extractedQuote,
        message: "Quote data extracted successfully using vision processing"
      });

    } catch (error: any) {
      console.error("Direct PDF processing error:", error);
      
      if (error.message?.includes("API") || error.message?.includes("rate limit") || error.message?.includes("quota")) {
        return res.status(503).json({ 
          message: "AI processing service is temporarily unavailable. Please try again later.",
          success: false 
        });
      }
      
      return res.status(500).json({ 
        message: `PDF processing failed: ${error.message || 'Unexpected error occurred while processing the PDF. Please try again or contact support if the issue persists.'}`,
        success: false 
      });
    }
  });

  app.post("/api/quotes/import-vision", isAuthenticated, rateLimitPDFProcessing, async (req: any, res) => {
    try {
      const visionData = z.object({
        filename: z.string().max(255, "Filename too long"),
        pages: z.array(z.object({
          index: z.number().min(0).max(19, "Page index must be 0-19"),
          imageBase64: z.string().max(2 * 1024 * 1024, "Individual image too large (max 2MB base64)")
        })).min(1, "At least one page image is required").max(20, "Maximum 20 pages allowed")
      });

      const { filename, pages } = visionData.parse(req.body);

      const totalImageSize = pages.reduce((sum, page) => sum + page.imageBase64.length, 0);
      const approximateFileSize = (totalImageSize * 3) / 4;
      
      if (approximateFileSize > 30 * 1024 * 1024) {
        return res.status(413).json({
          message: "Total file size too large for vision processing (max 30MB). Try reducing image quality or page count.",
          success: false
        });
      }
      
      for (const page of pages) {
        if (page.imageBase64.length < 100) {
          return res.status(400).json({
            message: `Page ${page.index + 1} image data is too small or invalid.`,
            success: false
          });
        }
      }

      if (pages.length > 20) {
        return res.status(400).json({
          message: "Too many pages. Maximum 20 pages supported.",
          success: false
        });
      }

      console.log(`🔍 Processing vision-based extraction for ${filename} (${pages.length} pages)`);

      if (rejectIfAIQuoteExtractionIsNotConfigured(res)) {
        return;
      }

      const extractedQuote = await extractQuoteDataFromImages(pages);
      
      if (!extractedQuote) {
        return res.status(400).json({ 
          message: "Could not extract quote data from PDF images. The document may not contain recognizable quote information or the images may be unclear.",
          success: false 
        });
      }

      console.log(`✅ Vision-based quote data extracted from ${filename}`);

      res.status(200).json({
        success: true,
        filename,
        extractedData: extractedQuote,
        message: "Quote data extracted successfully using vision processing",
        processingMethod: "vision"
      });

    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({
          message: `Invalid request data: ${error.errors.map((e: any) => e.message).join(', ')}`,
          success: false
        });
      }
      
      console.error("PDF vision import error:", error);
      res.status(500).json({ 
        message: "Internal server error while processing vision-based PDF import.",
        success: false 
      });
    }
  });

  app.post("/api/quotes/import-batch", isAuthenticated, async (req: any, res) => {
    try {
      const importData = z.object({
        importOptions: z.object({
          createNewQuote: z.boolean(),
          combineIntoSingleQuote: z.boolean(),
          existingQuoteId: z.number().optional(),
          attachCustomer: z.enum(['auto', 'none', 'match_only']).default('match_only'),
          existingCustomerId: z.number().optional(),
        }),
        extractedQuotes: z.array(z.object({
          pdfId: z.string(),
          filename: z.string(),
          customer: z.object({
            name: z.string().nullable().optional(),
            email: z.string().nullable().optional(),
            phone: z.string().nullable().optional(),
            company: z.string().nullable().optional(),
            address: z.string().nullable().optional(),
            streetAddress: z.string().nullable().optional(),
            addressLine2: z.string().nullable().optional(),
            city: z.string().nullable().optional(),
            state: z.string().nullable().optional(),
            zipCode: z.string().nullable().optional(),
            country: z.string().nullable().optional(),
          }),
          quoteNumber: z.string().nullable().optional(),
          date: z.string().nullable().optional(),
          projectDescription: z.string().nullable().optional(),
          lineItems: z.array(z.object({
            description: z.string().nullable().optional(),
            quantity: z.number().nullable().optional(),
            price: z.number().nullable().optional(),
            total: z.number().nullable().optional(),
            unit: z.string().nullable().optional(),
          })),
          subtotal: z.number().nullable().optional(),
          taxRate: z.number().nullable().optional(),
          taxAmount: z.number().nullable().optional(),
          discountAmount: z.number().nullable().optional(),
          total: z.number().nullable().optional(),
          notes: z.string().nullable().optional(),
          terms: z.string().nullable().optional(),
        }))
      }).parse(req.body);

      const results: {
        success: boolean;
        imported: Array<{
          pdfId: string;
          quoteId: number;
          quoteNumber: string;
          lineItemsAdded: number;
          action: 'created' | 'added_to_existing';
        }>;
        errors: Array<{
          pdfId: string;
          filename: string;
          error: string;
        }>;
        summary: {
          quotesCreated: number;
          lineItemsAdded: number;
          customersCreated: number;
          failed: number;
        };
      } = {
        success: true,
        imported: [],
        errors: [],
        summary: {
          quotesCreated: 0,
          lineItemsAdded: 0,
          customersCreated: 0,
          failed: 0
        }
      };

      if (importData.importOptions.createNewQuote && importData.importOptions.combineIntoSingleQuote && importData.extractedQuotes.length > 1) {
        try {
          const firstQuote = importData.extractedQuotes[0];
          const { accountId, wasCreated } = await handleCustomerAttachment(
            firstQuote.customer,
            importData.importOptions.attachCustomer,
            importData.importOptions.existingCustomerId
          );
          
          if (wasCreated) {
            results.summary.customersCreated++;
          }

          const combinedDescription = importData.extractedQuotes
            .map(q => q.projectDescription)
            .filter(desc => desc && desc.trim())
            .join(' | ');

          const combinedFilenames = importData.extractedQuotes.map(q => q.filename).join(', ');

          const quoteData: InsertQuote = {
            quoteNumber: firstQuote.quoteNumber || `COMBINED-${Date.now()}`,
            accountId: accountId,
            projectName: combinedDescription || `Combined Import: ${combinedFilenames}`,
            jobsiteStreetAddress: firstQuote.customer.streetAddress || undefined,
            jobsiteAddressLine2: firstQuote.customer.addressLine2 || undefined,
            jobsiteCity: firstQuote.customer.city || undefined,
            jobsiteState: firstQuote.customer.state || undefined,
            jobsiteZipCode: firstQuote.customer.zipCode || undefined,
            jobsiteCountry: firstQuote.customer.country || undefined,
            estimatedStartDate: firstQuote.date || new Date().toISOString().split('T')[0],
            notes: `Combined import from ${importData.extractedQuotes.length} PDFs: ${combinedFilenames}`,
            taxRate: '0',
            tariffRate: '0',
            discount: '0',
            shipping: '0',
            isShippingTaxable: false,
            dealStage: 'new_lead' as const,
            esigIncludeApprovalDrawing: false
          };

          const newQuote = await storage.createQuote(quoteData);
          results.summary.quotesCreated++;
          console.log(`✅ Created combined quote: ${newQuote.quoteNumber} (ID: ${newQuote.id})`);

          let totalLineItemsAdded = 0;
          for (const extractedQuote of importData.extractedQuotes) {
            if (extractedQuote.lineItems && extractedQuote.lineItems.length > 0) {
              for (const lineItem of extractedQuote.lineItems) {
                if (lineItem.description && lineItem.price && lineItem.quantity) {
                  const lineItemData = {
                    quoteId: newQuote.id,
                    description: `[${extractedQuote.filename}] ${lineItem.description}`,
                    quantity: lineItem.quantity.toString(),
                    unitPrice: lineItem.price.toString(),
                    markupType: 'percentage' as const,
                    markupValue: '0',
                    discountType: 'percentage' as const,
                    discountValue: '0',
                    position: totalLineItemsAdded
                  };

                  await storage.createLineItem(lineItemData);
                  totalLineItemsAdded++;
                }
              }
            }

            results.imported.push({
              pdfId: extractedQuote.pdfId,
              quoteId: newQuote.id,
              quoteNumber: newQuote.quoteNumber,
              lineItemsAdded: extractedQuote.lineItems?.length || 0,
              action: 'created'
            });
          }
          
          results.summary.lineItemsAdded += totalLineItemsAdded;
          console.log(`✅ Added ${totalLineItemsAdded} combined line items to quote ${newQuote.quoteNumber}`);

        } catch (error: any) {
          console.error('❌ Error in combined import:', error);
          importData.extractedQuotes.forEach(quote => {
            results.errors.push({
              pdfId: quote.pdfId,
              filename: quote.filename,
              error: `Combined import failed: ${error.message}`
            });
          });
          results.summary.failed += importData.extractedQuotes.length;
        }

        const totalProcessed = results.imported.length + results.errors.length;
        console.log(`📊 Combined import completed: ${results.summary.quotesCreated} quotes created, ${results.summary.lineItemsAdded} line items added, ${results.summary.customersCreated} customers created, ${results.summary.failed} failed`);
        
        return res.json(results);
      }

      for (const extractedQuote of importData.extractedQuotes) {
        try {
          const { accountId, wasCreated } = await handleCustomerAttachment(
            extractedQuote.customer,
            importData.importOptions.attachCustomer,
            importData.importOptions.existingCustomerId
          );
          
          if (wasCreated) {
            results.summary.customersCreated++;
          }

          if (importData.importOptions.createNewQuote) {
            const quoteData: InsertQuote = {
              quoteNumber: extractedQuote.quoteNumber || `IMP-${Date.now()}`,
              accountId: accountId,
              projectName: extractedQuote.projectDescription || `Imported from ${extractedQuote.filename}`,
              jobsiteStreetAddress: extractedQuote.customer.streetAddress || undefined,
              jobsiteAddressLine2: extractedQuote.customer.addressLine2 || undefined,
              jobsiteCity: extractedQuote.customer.city || undefined,
              jobsiteState: extractedQuote.customer.state || undefined,
              jobsiteZipCode: extractedQuote.customer.zipCode || undefined,
              jobsiteCountry: extractedQuote.customer.country || undefined,
              estimatedStartDate: extractedQuote.date || new Date().toISOString().split('T')[0],
              notes: extractedQuote.notes ? `Imported from PDF: ${extractedQuote.filename}\n\n${extractedQuote.notes}` : `Imported from PDF: ${extractedQuote.filename}`,
              taxRate: extractedQuote.taxRate?.toString() || '0',
              tariffRate: '0',
              discount: '0',
              shipping: '0',
              isShippingTaxable: false,
              dealStage: 'new_lead' as const,
              esigIncludeApprovalDrawing: false
            };

            const newQuote = await storage.createQuote(quoteData);
            results.summary.quotesCreated++;
            console.log(`✅ Created new quote: ${newQuote.quoteNumber} (ID: ${newQuote.id})`);

            let lineItemsAdded = 0;
            if (extractedQuote.lineItems && extractedQuote.lineItems.length > 0) {
              for (const lineItem of extractedQuote.lineItems) {
                if (lineItem.description && lineItem.price && lineItem.quantity) {
                  const lineItemData = {
                    quoteId: newQuote.id,
                    description: lineItem.description,
                    quantity: lineItem.quantity.toString(),
                    unitPrice: lineItem.price.toString(),
                    markupType: 'percentage' as const,
                    markupValue: '0',
                    discountType: 'percentage' as const,
                    discountValue: '0',
                    position: lineItemsAdded
                  };

                  await storage.createLineItem(lineItemData);
                  lineItemsAdded++;
                }
              }
            }
            
            results.summary.lineItemsAdded += lineItemsAdded;
            results.imported.push({
              pdfId: extractedQuote.pdfId,
              quoteId: newQuote.id,
              quoteNumber: newQuote.quoteNumber,
              lineItemsAdded,
              action: 'created'
            });
            
            console.log(`✅ Added ${lineItemsAdded} line items to quote ${newQuote.quoteNumber}`);
          } else {
            if (!importData.importOptions.existingQuoteId) {
              throw new Error('Existing quote ID required when not creating new quotes');
            }

            const existingQuote = await storage.getQuote(importData.importOptions.existingQuoteId);
            if (!existingQuote) {
              throw new Error('Specified existing quote not found');
            }

            const hasAccess = await storage.validateQuoteOwnership(importData.importOptions.existingQuoteId, req.user?.id);
            if (!hasAccess) {
              throw new Error('Access denied to the specified quote');
            }

            let lineItemsAdded = 0;
            if (extractedQuote.lineItems && extractedQuote.lineItems.length > 0) {
              for (const lineItem of extractedQuote.lineItems) {
                if (lineItem.description && lineItem.price && lineItem.quantity) {
                  const lineItemData = {
                    quoteId: importData.importOptions.existingQuoteId,
                    description: lineItem.description,
                    quantity: lineItem.quantity.toString(),
                    unitPrice: lineItem.price.toString(),
                    markupType: 'percentage' as const,
                    markupValue: '0',
                    discountType: 'percentage' as const,
                    discountValue: '0',
                    position: lineItemsAdded
                  };

                  await storage.createLineItem(lineItemData);
                  lineItemsAdded++;
                }
              }
            }

            results.summary.lineItemsAdded += lineItemsAdded;
            results.imported.push({
              pdfId: extractedQuote.pdfId,
              quoteId: importData.importOptions.existingQuoteId,
              quoteNumber: existingQuote.quoteNumber,
              lineItemsAdded,
              action: 'added_to_existing'
            });

            console.log(`✅ Added ${lineItemsAdded} line items to existing quote ${existingQuote.quoteNumber}`);
          }

        } catch (error: any) {
          console.error(`❌ Failed to import PDF ${extractedQuote.filename}:`, error);
          results.summary.failed++;
          results.errors.push({
            pdfId: extractedQuote.pdfId,
            filename: extractedQuote.filename,
            error: error.message || 'Unknown error occurred'
          });
        }
      }

      console.log(`📊 Import completed: ${results.summary.quotesCreated} quotes created, ${results.summary.lineItemsAdded} line items added, ${results.summary.customersCreated} customers created, ${results.summary.failed} failed`);

      res.status(200).json(results);

    } catch (error: any) {
      console.error("Batch import error:", error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          success: false,
          message: "Invalid import data", 
          errors: error.errors 
        });
      }
      
      res.status(500).json({ 
        success: false,
        message: "Internal server error during import" 
      });
    }
  });

  app.put("/api/quotes/:id", isAuthenticated, async (req, res) => {
    try {
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }
      
      console.log("Raw request body:", JSON.stringify(req.body, null, 2));
      const parsedData = updateQuoteSchema.parse(req.body);
      
      // Filter out undefined values to prevent accidentally overwriting existing data
      // This ensures partial updates only modify explicitly provided fields
      const quoteData: Partial<InsertQuote> = {};
      for (const [key, value] of Object.entries(parsedData)) {
        if (value !== undefined) {
          // Handle lostReason null case
          if (key === 'lostReason' && value === null) {
            continue; // Don't include null lostReason
          }
          (quoteData as any)[key] = value;
        }
      }
      
      const originalQuote = await storage.getQuote(params.data.id);
      if (!originalQuote) {
        return res.status(404).json({ message: "Quote not found" });
      }

      if (isArchivedQuoteVersion(originalQuote)) {
        if (quoteData.enableESignature === true) {
          return sendArchivedQuoteResponse(res, "prepare it for customer approval");
        }

        if (quoteData.dealStage) {
          return sendArchivedQuoteResponse(res, "change its pipeline stage");
        }
      }
      
      const quote = await storage.updateQuote(params.data.id, quoteData);
      if (!quote) {
        return res.status(404).json({ message: "Quote not found" });
      }
      
      res.json(quote);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        console.error("Quote validation errors:", JSON.stringify(error.errors, null, 2));
        return res.status(400).json({ message: "Invalid quote data", errors: error.errors });
      }
      
      if (error.message?.includes("already exists")) {
        console.error("Quote number uniqueness error:", error.message);
        return res.status(409).json({ 
          message: error.message || "Quote number already exists", 
          code: "DUPLICATE_QUOTE_NUMBER" 
        });
      }
      
      console.error("Quote update error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/quotes/:id/stage", isAuthenticated, async (req, res) => {
    try {
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }
      
      const { deal_stage, lost_reason } = req.body;
      
      if (!deal_stage) {
        return res.status(400).json({ message: "deal_stage is required" });
      }
      
      const validStages = ['new_lead', 'qualifying', 'consultation_scheduled', 'building_estimate', 'quote_sent', 'closed_won', 'closed_lost', 'on_hold'];
      if (!validStages.includes(deal_stage)) {
        return res.status(400).json({ 
          message: `Invalid deal_stage. Must be one of: ${validStages.join(', ')}` 
        });
      }
      
      if (deal_stage === 'closed_lost' && !lost_reason) {
        return res.status(400).json({ 
          message: "lost_reason is required when setting stage to lost" 
        });
      }

      const existingQuote = await storage.getQuote(params.data.id);
      if (!existingQuote) {
        return res.status(404).json({ message: "Quote not found" });
      }

      if (isArchivedQuoteVersion(existingQuote)) {
        return sendArchivedQuoteResponse(res, "change its pipeline stage");
      }
      
      const updateData: any = { dealStage: deal_stage };
      if (lost_reason) {
        updateData.lostReason = lost_reason;
      }
      
      const quote = await storage.updateQuote(params.data.id, updateData);
      if (!quote) {
        return res.status(404).json({ message: "Quote not found" });
      }
      
      console.log(`✅ Updated quote ${params.data.id} stage to ${deal_stage}`);
      res.json(quote);
    } catch (error) {
      console.error("Error updating quote stage:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/quotes/:id/send-to-ops", isAuthenticated, async (req, res) => {
    try {
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({
          message: "Invalid request parameters",
          errors: params.error.errors,
        });
      }

      const quote = await storage.getQuoteWithDetails(params.data.id);
      if (!quote) {
        return res.status(404).json({ message: "Quote not found" });
      }

      if (isArchivedQuoteVersion(quote)) {
        return sendArchivedQuoteResponse(res, "send it to Ops");
      }

      const result = await sendQuoteToOperations(params.data.id, {
        dryRun: req.body?.dryRun === true,
      });

      if (!result.success) {
        return res.status(result.status && result.status >= 400 ? result.status : 502).json(result);
      }

      res.json(result);
    } catch (error) {
      console.error("Error sending quote to Ops:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/quotes/:id", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }
      
      const deleted = await storage.deleteQuote(params.data.id);
      if (!deleted) {
        return res.status(404).json({ message: "Quote not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/quotes/:id/create-version", isAuthenticated, async (req, res) => {
    try {
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }

      const originalQuote = await storage.getQuote(params.data.id);
      if (!originalQuote) {
        return res.status(404).json({ message: "Original quote not found" });
      }

      const newVersion = await storage.createQuoteVersion(params.data.id);
      
      console.log(`✅ Created version ${newVersion.versionNumber} of quote ${params.data.id}`);
      res.status(201).json(newVersion);
    } catch (error: any) {
      console.error("Error creating quote version:", error);
      res.status(500).json({ 
        message: "Internal server error", 
        error: error.message 
      });
    }
  });

  app.get("/api/quotes/:id/versions", isAuthenticated, async (req, res) => {
    try {
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }

      const quote = await storage.getQuoteWithDetails(params.data.id);
      if (!quote) {
        return res.status(404).json({ message: "Quote not found" });
      }

      const versions = await storage.getQuoteVersions(params.data.id);
      
      res.json(versions);
    } catch (error) {
      console.error("Error getting quote versions:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/quotes/:id/use-version", isAuthenticated, async (req, res) => {
    try {
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({
          message: "Invalid request parameters",
          errors: params.error.errors
        });
      }

      const targetQuote = await storage.getQuote(params.data.id);
      if (!targetQuote) {
        return res.status(404).json({ message: "Quote not found" });
      }

      const updatedQuote = await storage.setCurrentQuoteVersion(params.data.id);
      if (!updatedQuote) {
        return res.status(404).json({ message: "Quote not found" });
      }

      const quoteWithDetails = await storage.getQuoteWithDetails(updatedQuote.id);
      res.json(quoteWithDetails || updatedQuote);
    } catch (error) {
      console.error("Error setting current quote version:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/quotes/:id/approval-drawing", isAuthenticated, async (req, res) => {
    try {
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({
          message: "Invalid request parameters",
          errors: params.error.errors
        });
      }

      const quote = await storage.getQuoteWithDetails(params.data.id);
      if (!quote) {
        return res.status(404).json({ message: "Quote not found" });
      }

      const drawing = await storage.getQuoteApprovalDrawingByQuoteId(quote.id);
      res.json(drawing || null);
    } catch (error) {
      console.error("Error getting approval drawing:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/quotes/:id/approval-drawing", isAuthenticated, async (req, res) => {
    try {
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({
          message: "Invalid request parameters",
          errors: params.error.errors
        });
      }

      res.status(410).json({
        message: "Order approval drawing creation has been removed from the quote workflow.",
        code: "APPROVAL_DRAWING_REMOVED",
      });
    } catch (error: any) {
      console.error("Error creating approval drawing:", error);
      res.status(500).json({ message: error.message || "Internal server error" });
    }
  });

  app.patch("/api/quotes/:id/approval-drawing/:drawingId", isAuthenticated, async (req, res) => {
    try {
      const params = approvalDrawingIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({
          message: "Invalid request parameters",
          errors: params.error.errors
        });
      }

      const body = updateApprovalDrawingSchema.safeParse(req.body);
      if (!body.success) {
        return res.status(400).json({
          message: "Invalid approval drawing data",
          errors: body.error.errors
        });
      }

      const quote = await storage.getQuote(params.data.id);
      if (!quote) {
        return res.status(404).json({ message: "Quote not found" });
      }

      if (isArchivedQuoteVersion(quote)) {
        return sendArchivedQuoteResponse(res, "edit its order approval drawing");
      }

      const drawing = await storage.getQuoteApprovalDrawing(params.data.drawingId);
      if (!drawing || drawing.quoteId !== quote.id) {
        return res.status(404).json({ message: "Approval drawing not found" });
      }

      const actorUserId = getActorUserId(req);
      const updated = await storage.updateQuoteApprovalDrawing(drawing.id, {
        ...body.data,
        updatedBy: actorUserId,
      }, actorUserId);
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating approval drawing:", error);
      res.status(error.message?.includes("frozen") ? 409 : 500).json({ message: error.message || "Internal server error" });
    }
  });

  app.post("/api/quotes/:id/approval-drawing/:drawingId/mark-ready", isAuthenticated, async (req, res) => {
    try {
      const params = approvalDrawingIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({
          message: "Invalid request parameters",
          errors: params.error.errors
        });
      }

      const quote = await storage.getQuote(params.data.id);
      const drawing = await storage.getQuoteApprovalDrawing(params.data.drawingId);
      if (!quote || !drawing || drawing.quoteId !== quote.id) {
        return res.status(404).json({ message: "Approval drawing not found" });
      }
      if (isArchivedQuoteVersion(quote)) {
        return sendArchivedQuoteResponse(res, "mark its order approval drawing ready");
      }

      const updated = await storage.markQuoteApprovalDrawingReady(drawing.id, getActorUserId(req));
      res.json(updated);
    } catch (error: any) {
      console.error("Error marking approval drawing ready:", error);
      res.status(400).json({ message: error.message || "Approval drawing is not ready" });
    }
  });

  app.post("/api/quotes/:id/approval-drawing/:drawingId/revision-needed", isAuthenticated, async (req, res) => {
    try {
      const params = approvalDrawingIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({
          message: "Invalid request parameters",
          errors: params.error.errors
        });
      }

      const quote = await storage.getQuote(params.data.id);
      const drawing = await storage.getQuoteApprovalDrawing(params.data.drawingId);
      if (!quote || !drawing || drawing.quoteId !== quote.id) {
        return res.status(404).json({ message: "Approval drawing not found" });
      }
      if (isArchivedQuoteVersion(quote)) {
        return sendArchivedQuoteResponse(res, "mark its order approval drawing revision-needed");
      }

      const updated = await storage.markQuoteApprovalDrawingRevisionNeeded(
        drawing.id,
        getActorUserId(req),
        typeof req.body?.reason === "string" ? req.body.reason : null,
      );
      res.json(updated);
    } catch (error: any) {
      console.error("Error marking approval drawing revision needed:", error);
      res.status(error.message?.includes("locked") ? 409 : 500).json({ message: error.message || "Internal server error" });
    }
  });

  app.post("/api/quotes/:id/approval-drawing/:drawingId/order-reviewed", isAuthenticated, async (req, res) => {
    try {
      const params = approvalDrawingIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({
          message: "Invalid request parameters",
          errors: params.error.errors
        });
      }

      const quote = await storage.getQuote(params.data.id);
      const drawing = await storage.getQuoteApprovalDrawing(params.data.drawingId);
      if (!quote || !drawing || drawing.quoteId !== quote.id) {
        return res.status(404).json({ message: "Approval drawing not found" });
      }
      if (isArchivedQuoteVersion(quote)) {
        return sendArchivedQuoteResponse(res, "review its order approval drawing");
      }

      const updated = await storage.markQuoteApprovalDrawingOrderReviewed(drawing.id, getActorUserId(req));
      res.json(updated);
    } catch (error) {
      console.error("Error marking approval drawing reviewed:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/quotes/:id/approval-drawing/:drawingId/order-ready", isAuthenticated, async (req, res) => {
    try {
      const params = approvalDrawingIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({
          message: "Invalid request parameters",
          errors: params.error.errors
        });
      }

      const body = orderReadyApprovalDrawingSchema.safeParse(req.body || {});
      if (!body.success) {
        return res.status(400).json({
          message: "Invalid order-ready data",
          errors: body.error.errors
        });
      }

      const quote = await storage.getQuote(params.data.id);
      const drawing = await storage.getQuoteApprovalDrawing(params.data.drawingId);
      if (!quote || !drawing || drawing.quoteId !== quote.id) {
        return res.status(404).json({ message: "Approval drawing not found" });
      }
      if (isArchivedQuoteVersion(quote)) {
        return sendArchivedQuoteResponse(res, "release its order approval drawing");
      }

      const updated = await storage.markQuoteApprovalDrawingOrderReady(
        drawing.id,
        getActorUserId(req),
        body.data.overrideReason,
      );
      res.json(updated);
    } catch (error: any) {
      console.error("Error marking approval drawing order ready:", error);
      res.status(400).json({ message: error.message || "Approval drawing cannot be released for order" });
    }
  });

  app.post("/api/quotes/:id/enable-esignature", isAuthenticated, async (req, res) => {
    try {
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }

      const quote = await storage.getQuoteWithDetails(params.data.id);
      if (!quote) {
        return res.status(404).json({ message: "Quote not found" });
      }

      if (isArchivedQuoteVersion(quote)) {
        return sendArchivedQuoteResponse(res, "prepare it for customer approval");
      }

      const signingToken = quote.signingToken || nanoid(32);
      
      const esigIncludePricing = req.body.esigIncludePricing ?? true;
      const esigIncludeImages = req.body.esigIncludeImages ?? false;
      const esigIncludeContract = req.body.esigIncludeContract ?? true;
      const esigIncludeApprovalDrawing = false;
      
      const updatedQuote = await storage.updateQuote(params.data.id, {
        enableESignature: true,
        signingToken,
        esigIncludePricing,
        esigIncludeImages,
        esigIncludeContract,
        esigIncludeApprovalDrawing,
      });

      res.json({ 
        success: true,
        signingToken,
        signingUrl: `/sign/${signingToken}`,
        approvalDrawingIncluded: false,
      });
    } catch (error) {
      console.error("Error enabling e-signature:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/quotes/:id/send-signature-email", isAuthenticated, async (req, res) => {
    try {
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }

      const quote = await storage.getQuoteWithDetails(params.data.id);
      if (!quote) {
        return res.status(404).json({ message: "Quote not found" });
      }

      if (isArchivedQuoteVersion(quote)) {
        return sendArchivedQuoteResponse(res, "send it for customer approval");
      }

      if (!quote.enableESignature || !quote.signingToken) {
        return res.status(400).json({ message: "E-signature must be enabled first" });
      }

      const approvalDrawingForPackage = shouldIncludeApprovalDrawingInPackage(quote)
        ? quote.approvalDrawing
        : null;

      if (approvalDrawingForPackage && !["ready_for_agreement", "sent_for_signature", "signed_locked"].includes(approvalDrawingForPackage.status)) {
        return res.status(409).json({
          message: "Order approval drawing exists but is not ready. Mark it ready before sending the approval email.",
          code: "APPROVAL_DRAWING_NOT_READY",
        });
      }

      if (approvalDrawingForPackage?.status === "ready_for_agreement") {
        await freezeReadyApprovalDrawingForQuote(quote.id, getActorUserId(req));
      }

      if (!quote.account?.email) {
        return res.status(400).json({ message: "Customer email not found" });
      }

      const { sendEmail } = await import("../email");

      // Load logo for email
      const logoPath = path.join(process.cwd(), 'attached_assets', 'Logo_Full_Color_Black_1766097629382.png');
      let logoBase64 = '';
      try {
        logoBase64 = fs.readFileSync(logoPath).toString('base64');
      } catch (e) {
        console.warn('Could not load logo for email:', e);
      }

      // Get optional personalized message from request body
      const personalizedMessage = req.body.message?.trim() || '';
      
      // Escape HTML entities in personalized message to prevent injection
      const escapeHtml = (text: string) => {
        return text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;')
          .replace(/\n/g, '<br>');
      };
      const safePersonalizedMessage = personalizedMessage ? escapeHtml(personalizedMessage) : '';

      const signingUrl = buildAppUrl(`/sign/${quote.signingToken}`, req);

      const customerName = quote.account.firstName 
        ? `${quote.account.firstName} ${quote.account.lastName || ''}`.trim()
        : quote.account.name;

      // Build personalized message section if provided (use escaped version)
      const personalizedMessageHtml = safePersonalizedMessage ? `
          <div style="background-color: #fff7ed; border-left: 4px solid #f97316; border-radius: 4px; padding: 20px; margin: 20px 0;">
            <p style="margin: 0; font-size: 14px; color: #1a1a1a; font-style: italic;">
              "${safePersonalizedMessage}"
            </p>
          </div>
      ` : '';

      const htmlBody = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Your Quote is Ready for Signature</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
          <div style="background-color: #000000; border-radius: 8px 8px 0 0; border-bottom: 4px solid #14b8a6; padding: 30px; margin-bottom: 20px; text-align: center;">
            <img src="cid:edg-logo" alt="EDG Patio & Shade" style="max-width: 200px; height: auto; margin-bottom: 20px;" />
            <h1 style="color: #ffffff; margin-top: 0; font-size: 24px;">Your Quote is Ready for Signature</h1>
            <p style="color: #ffffff; margin-bottom: 0;">Hello ${customerName},</p>
            <p style="color: #f0f0f0;">Your quote <strong>#${quote.quoteNumber}</strong> for <strong>${quote.projectName || 'your project'}</strong> is ready for your electronic signature.</p>
          </div>
          ${personalizedMessageHtml}
          <div style="background-color: #ffffff; border: 2px solid #e5e7eb; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
            <h2 style="color: #000000; margin-top: 0; font-size: 20px; border-bottom: 2px solid #14b8a6; padding-bottom: 10px;">Quote Details</h2>
            <p style="color: #1a1a1a;"><strong>Quote Number:</strong> ${quote.quoteNumber}</p>
            <p style="color: #1a1a1a;"><strong>Project:</strong> ${quote.projectName || 'N/A'}</p>
            ${formatJobsiteAddress(quote) ? `<p style="color: #1a1a1a;"><strong>Jobsite Address:</strong> ${formatJobsiteAddress(quote)}</p>` : ''}
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${signingUrl}" 
               style="display: inline-block; background-color: #14b8a6; color: #ffffff; padding: 16px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; box-shadow: 0 2px 4px rgba(20, 184, 166, 0.3);">
              Review and Sign Quote
            </a>
          </div>
          
          <div style="background-color: #f0fdfa; border-left: 4px solid #14b8a6; border-radius: 4px; padding: 20px; margin-top: 20px;">
            <p style="margin: 0; font-size: 14px; color: #115e59;">
              If you have any questions about this quote, please don't hesitate to contact us.
            </p>
          </div>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #14b8a6; text-align: center; color: #6b7280; font-size: 12px;">
            <p style="margin: 5px 0; font-weight: 600; color: #1a1a1a;">EDG Patio & Shade</p>
            <p style="margin: 5px 0;">1802 Holian Drive, Spring Grove, IL 60081</p>
            <p style="margin: 5px 0;">Phone: +1 (815) 581-0138 | Email: info@edgpatioshade.com</p>
          </div>
        </body>
        </html>
      `;

      await sendEmail({
        to: quote.account.email,
        subject: `EDG Patio & Shade - Quote #${quote.quoteNumber}${quote.projectName ? ` for ${quote.projectName}` : ''} Ready for Your Signature`,
        htmlBody,
        inlineAttachments: logoBase64 ? [{
          contentId: 'edg-logo',
          base64Data: logoBase64,
          mimeType: 'image/png',
          filename: 'edg-logo.png'
        }] : undefined
      });

      // Track when the email was sent and the personalized message
      // Always update the message field so it stays in sync with what was sent
      await storage.updateQuote(quote.id, {
        signatureEmailSentAt: new Date(),
        signatureEmailMessage: personalizedMessage || null, // Store null if cleared
      });

      res.json({ 
        success: true,
        message: `E-signature email sent to ${quote.account.email}`,
        sentAt: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error sending signature email:", error);
      res.status(500).json({ 
        message: "Failed to send email", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  app.get("/api/signatures/:token", async (req, res) => {
    try {
      const params = signatureTokenParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid token", 
          errors: params.error.errors 
        });
      }
      
      const quote = await storage.getQuoteBySigningToken(params.data.token);
      if (!quote) {
        return res.status(404).json({ message: "Invalid or expired signing link" });
      }

      if (!quote.enableESignature) {
        return res.status(403).json({ message: "E-signature not enabled for this quote" });
      }

      if (isArchivedQuoteVersion(quote)) {
        return sendArchivedQuoteResponse(res, "review or sign it", 410);
      }

      res.json({
        id: quote.id,
        quoteNumber: quote.quoteNumber,
        projectName: quote.projectName,
        jobsiteAddress: formatJobsiteAddress(quote),
        accountName: quote.account?.name || quote.customer?.name || "N/A",
        lineItems: quote.lineItems || [],
        taxRate: quote.taxRate,
        discount: quote.discount,
        shipping: quote.shipping,
        isShippingTaxable: quote.isShippingTaxable,
        contractTemplate: quote.contractTemplate,
        customContractTerms: quote.customContractTerms,
        clientSignedAt: quote.clientSignedAt,
        companySignedAt: quote.companySignedAt,
        esigIncludePricing: quote.esigIncludePricing ?? true,
        esigIncludeImages: quote.esigIncludeImages ?? false,
        esigIncludeContract: quote.esigIncludeContract ?? true,
        esigIncludeApprovalDrawing: shouldIncludeApprovalDrawingInPackage(quote),
      });
    } catch (error) {
      console.error("Error getting signature info:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/signatures/:token/full", async (req, res) => {
    try {
      const params = signatureTokenParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid token", 
          errors: params.error.errors 
        });
      }
      
      const quote = await storage.getQuoteBySigningToken(params.data.token);
      if (!quote) {
        return res.status(404).json({ message: "Invalid or expired signing link" });
      }

      if (!quote.enableESignature) {
        return res.status(403).json({ message: "E-signature not enabled for this quote" });
      }

      if (isArchivedQuoteVersion(quote)) {
        return sendArchivedQuoteResponse(res, "review or sign it", 410);
      }

      const quoteForPublic = await ensurePublicApprovalDrawingSnapshot(
        quote,
        () => storage.getQuoteBySigningToken(params.data.token),
      );

      res.json(buildPublicSigningQuote(quoteForPublic));
    } catch (error: any) {
      console.error("Error getting full quote data:", error);
      res.status(error.status || 500).json({
        message: error.message || "Internal server error",
        code: error.code,
      });
    }
  });

  app.post("/api/quotes/:id/company-signature", isAuthenticated, async (req, res) => {
    try {
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({
          message: "Invalid request parameters",
          errors: params.error.errors
        });
      }

      const bodyValidation = submitSignatureSchema.safeParse({
        ...req.body,
        signerType: "company"
      });
      if (!bodyValidation.success) {
        return res.status(400).json({
          message: "Invalid signature data",
          errors: bodyValidation.error.errors
        });
      }

      const quote = await storage.getQuoteWithDetails(params.data.id);
      if (!quote) {
        return res.status(404).json({ message: "Quote not found" });
      }

      if (isArchivedQuoteVersion(quote)) {
        return sendArchivedQuoteResponse(res, "sign it for EDG");
      }

      if (!quote.enableESignature || !quote.signingToken) {
        return res.status(400).json({ message: "E-signature must be enabled first" });
      }

      if (quote.companySignedAt) {
        return res.status(409).json({ message: "Company signature has already been recorded" });
      }

      const quoteForSignature = await ensurePublicApprovalDrawingSnapshot(
        quote,
        () => storage.getQuoteWithDetails(quote.id),
      );

      const signedAt = new Date();
      const existingAudit = quoteForSignature.signatureAuditTrail as any;
      const snapshot = quoteForSignature.signedDocumentSnapshot || buildPublicSigningQuote({
        ...quoteForSignature,
        companySignatureData: bodyValidation.data.signatureData,
        companySignedAt: signedAt,
        companySignedIp: getClientIp(req),
      });
      const documentFingerprint = existingAudit?.documentFingerprint || createDocumentFingerprint(snapshot);
      const user = (req as any).user;
      const auditEntry = {
        event: "company_signed",
        signerType: "company",
        signerName: bodyValidation.data.signatureData.name,
        signerEmail: user?.email || null,
        signedAt: signedAt.toISOString(),
        ipAddress: getClientIp(req),
        userAgent: req.get("user-agent") || null,
        quoteId: quoteForSignature.id,
        quoteNumber: quoteForSignature.quoteNumber,
        documentFingerprint,
      };

      await storage.updateQuote(quoteForSignature.id, {
        companySignatureData: bodyValidation.data.signatureData,
        companySignedAt: signedAt,
        companySignedIp: getClientIp(req),
        signatureAuditTrail: {
          documentFingerprint,
          entries: [
            ...(existingAudit?.entries || []),
            auditEntry,
          ],
        },
      });

      res.json({
        success: true,
        message: "Company signature captured successfully"
      });
    } catch (error: any) {
      console.error("Error submitting company signature:", error);
      res.status(error.status || 500).json({
        message: error.message || "Internal server error",
        code: error.code,
      });
    }
  });

  app.post("/api/signatures/:token/sign", async (req, res) => {
    try {
      const params = signatureTokenParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid token", 
          errors: params.error.errors 
        });
      }

      const bodyValidation = submitSignatureSchema.safeParse(req.body);
      if (!bodyValidation.success) {
        return res.status(400).json({ 
          message: "Invalid signature data", 
          errors: bodyValidation.error.errors 
        });
      }

      const { signatureData, signerType } = bodyValidation.data;

      if (signerType !== 'client') {
        return res.status(403).json({ message: "Company signatures must be submitted from the staff quote screen" });
      }

      const quote = await storage.getQuoteBySigningToken(params.data.token);
      if (!quote) {
        return res.status(404).json({ message: "Invalid or expired signing link" });
      }

      if (isArchivedQuoteVersion(quote)) {
        return sendArchivedQuoteResponse(res, "sign it", 410);
      }

      if (!quote.enableESignature) {
        return res.status(403).json({ message: "E-signature not enabled for this quote" });
      }

      if (quote.clientSignedAt) {
        return res.status(409).json({ message: "Client signature has already been recorded" });
      }

      const quoteForSignature = await ensurePublicApprovalDrawingSnapshot(
        quote,
        () => storage.getQuoteBySigningToken(params.data.token),
      );

      const clientIp = getClientIp(req);
      const signedAt = new Date();
      const snapshot = buildPublicSigningQuote({
        ...quoteForSignature,
        clientSignatureData: signatureData,
        clientSignedAt: signedAt,
        clientSignedIp: clientIp,
      });
      const documentFingerprint = createDocumentFingerprint(snapshot);
      const auditEntry = {
        event: "client_signed",
        signerType: "client",
        signerName: signatureData.name,
        signerEmail: quoteForSignature.account?.email || null,
        signedAt: signedAt.toISOString(),
        ipAddress: clientIp,
        userAgent: req.get("user-agent") || null,
        quoteId: quoteForSignature.id,
        quoteNumber: quoteForSignature.quoteNumber,
        signingTokenLast6: params.data.token.slice(-6),
        consentText: shouldIncludeApprovalDrawingInPackage(quoteForSignature)
          ? `${ORDER_APPROVAL_SIGNATURE_CONSENT} I understand that my electronic signature carries the same legal weight as a handwritten signature.`
          : "I confirm that I have reviewed this proposal and agree to be legally bound by its terms. I understand that my electronic signature carries the same legal weight as a handwritten signature.",
        documentFingerprint,
      };

      await storage.updateQuote(quoteForSignature.id, {
        clientSignatureData: signatureData,
        clientSignedAt: signedAt,
        clientSignedIp: clientIp,
        signedDocumentSnapshot: snapshot,
        signatureAuditTrail: {
          documentFingerprint,
          entries: [
            ...((quoteForSignature.signatureAuditTrail as any)?.entries || []),
            auditEntry,
          ],
        },
      });

      const approvalDrawingForPackage = shouldIncludeApprovalDrawingInPackage(quoteForSignature)
        ? quoteForSignature.approvalDrawing
        : null;

      if (approvalDrawingForPackage) {
        await storage.markQuoteApprovalDrawingSignedLocked(approvalDrawingForPackage.id, null);
      }

      // Send confirmation email to client after they sign
      let emailSent = false;
      if (signerType === 'client' && quoteForSignature.account?.email) {
        try {
          const { sendEmail } = await import("../email");
          
          const customerName = quoteForSignature.account.firstName
            ? `${quoteForSignature.account.firstName} ${quoteForSignature.account.lastName || ''}`.trim()
            : quoteForSignature.account.name;

          const downloadUrl = buildAppUrl(`/sign/${quoteForSignature.signingToken}`, req);

          const signedDate = new Date().toLocaleString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            timeZoneName: 'short'
          });

          const htmlBody = `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Signature Confirmation</title>
            </head>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
              <div style="background-color: #059669; border-radius: 8px 8px 0 0; padding: 30px; margin-bottom: 0;">
                <div style="text-align: center; margin-bottom: 15px;">
                  <div style="display: inline-block; width: 60px; height: 60px; background-color: rgba(255,255,255,0.2); border-radius: 50%; line-height: 60px; font-size: 30px;">
                    ✓
                  </div>
                </div>
                <h1 style="color: #ffffff; margin: 0; font-size: 24px; text-align: center;">Document Signed Successfully</h1>
              </div>
              
              <div style="background-color: #ffffff; border: 1px solid #e5e7eb; border-top: none; padding: 30px; margin-bottom: 20px;">
                <p style="color: #1a1a1a; margin-top: 0;">Hello ${customerName},</p>
                <p style="color: #4b5563;">Thank you for signing your quote. This email confirms that your electronic signature has been successfully recorded.</p>
                
                <div style="background-color: #f3f4f6; border-radius: 8px; padding: 20px; margin: 20px 0;">
                  <h3 style="color: #1f2937; margin: 0 0 15px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Signature Details</h3>
                  <table style="width: 100%; font-size: 14px;">
                    <tr>
                      <td style="padding: 5px 0; color: #6b7280;">Document:</td>
                      <td style="padding: 5px 0; color: #1f2937; font-weight: 600;">${quoteForSignature.projectName || `Quote #${quoteForSignature.quoteNumber}`}</td>
                    </tr>
	                    <tr>
	                      <td style="padding: 5px 0; color: #6b7280;">Quote Number:</td>
	                      <td style="padding: 5px 0; color: #1f2937; font-weight: 600;">#${quoteForSignature.quoteNumber}</td>
	                    </tr>
                    <tr>
                      <td style="padding: 5px 0; color: #6b7280;">Signed On:</td>
                      <td style="padding: 5px 0; color: #1f2937; font-weight: 600;">${signedDate}</td>
                    </tr>
                    <tr>
                      <td style="padding: 5px 0; color: #6b7280;">Signed By:</td>
                      <td style="padding: 5px 0; color: #1f2937; font-weight: 600;">${customerName}</td>
                    </tr>
                  </table>
                </div>

                <div style="text-align: center; margin: 25px 0;">
                  <a href="${downloadUrl}" style="display: inline-block; background-color: #000000; color: #ffffff; text-decoration: none; padding: 14px 30px; border-radius: 6px; font-weight: 600; font-size: 14px;">Download Signed Document</a>
                </div>

                <p style="color: #6b7280; font-size: 13px; text-align: center;">You can access your signed document at any time using the link above.</p>
              </div>
              
              <div style="text-align: center; color: #6b7280; font-size: 12px; padding-top: 20px;">
                <p style="margin: 5px 0; font-weight: 600; color: #1a1a1a;">EDG Patio & Shade</p>
                <p style="margin: 5px 0;">1802 Holian Drive, Spring Grove, IL 60081</p>
                <p style="margin: 5px 0;">Phone: +1 (815) 581-0138 | Email: info@edgpatioshade.com</p>
                <p style="margin: 15px 0 5px 0; font-size: 11px; color: #9ca3af;">This is an automated confirmation. Please do not reply to this email.</p>
              </div>
            </body>
            </html>
          `;

	          await sendEmail({
	            to: quoteForSignature.account.email,
	            subject: `Signature Confirmed: ${quoteForSignature.projectName || `Quote #${quoteForSignature.quoteNumber}`}`,
	            htmlBody
	          });

	          emailSent = true;
	          console.log(`Signature confirmation email sent to ${quoteForSignature.account.email}`);
        } catch (emailError) {
          console.error("Failed to send signature confirmation email:", emailError);
        }
      }

      res.json({ 
        success: true,
        message: "Signature captured successfully",
        emailSent
      });
    } catch (error: any) {
      console.error("Error submitting signature:", error);
      res.status(error.status || 500).json({
        message: error.message || "Internal server error",
        code: error.code,
      });
    }
  });

  app.get("/api/quotes/:quoteId/cover-photos", isAuthenticated, async (req, res) => {
    try {
      const params = quoteIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }

      const hasAccess = await storage.validateQuoteOwnership(params.data.quoteId, req.user?.id);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const coverPhoto = await storage.getQuoteCoverPhoto(params.data.quoteId);
      if (!coverPhoto) {
        return res.json([]);
      }

      res.json([coverPhoto]);
    } catch (error) {
      console.error("Error getting quote cover photo:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/quotes/:quoteId/product-renderings", isAuthenticated, async (req, res) => {
    try {
      const params = quoteIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }

      const hasAccess = await storage.validateQuoteOwnership(params.data.quoteId, req.user?.id);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const renderings = await storage.getQuoteProductRenderings(params.data.quoteId);
      res.json(renderings);
    } catch (error) {
      console.error("Error getting quote visuals & details:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/quotes/:quoteId/cover-photo", isAuthenticated, async (req, res) => {
    try {
      const params = quoteIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }

      const hasAccess = await storage.validateQuoteOwnership(params.data.quoteId, req.user?.id);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const photoData = createQuoteCoverPhotoSchema.parse({ ...req.body, quoteId: params.data.quoteId });
      const coverPhoto = await storage.createQuoteCoverPhoto(photoData);
      res.status(201).json(coverPhoto);
    } catch (error) {
      console.error("Error creating quote cover photo:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: error.errors 
        });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/quotes/:quoteId/product-rendering", isAuthenticated, async (req, res) => {
    try {
      const params = quoteIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }

      const hasAccess = await storage.validateQuoteOwnership(params.data.quoteId, req.user?.id);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const renderingData = createQuoteProductRenderingSchema.parse({ ...req.body, quoteId: params.data.quoteId });
      const rendering = await storage.createQuoteProductRendering(renderingData);
      res.status(201).json(rendering);
    } catch (error) {
      console.error("Error creating quote visual asset:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: error.errors 
        });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/quotes/:quoteId/cover-photos", isAuthenticated, upload.single('image'), async (req: any, res) => {
    try {
      const params = quoteIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }

      const hasAccess = await storage.validateQuoteOwnership(params.data.quoteId, req.user?.id);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const file = req.file;
      const objectStorageService = new ObjectStorageService();
      
      const sanitizedFilename = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
      const timestamp = Date.now();
      const customPath = `cover-photos/${timestamp}-${sanitizedFilename}`;
      
      const uploadedObject = await objectStorageService.uploadPublicObjectEntityBuffer(customPath, file.buffer, {
        contentType: file.mimetype,
      });
      
      const publicUrl = uploadedObject.publicUrl ?? buildAppUrl(`/quote-images/${sanitizedFilename}`, req);
      
      const photoData = {
        quoteId: params.data.quoteId,
        filename: sanitizedFilename,
        originalName: file.originalname,
        storageUrl: publicUrl,
        mimeType: file.mimetype,
        fileSize: file.size
      };
      
      const coverPhoto = await storage.createQuoteCoverPhoto(photoData);
      console.log(`✅ Cover photo saved: ${coverPhoto.filename}`);
      res.status(201).json(coverPhoto);
    } catch (error) {
      console.error("Error uploading cover photo:", error);
      res.status(500).json({ message: "Failed to upload cover photo" });
    }
  });

  app.post("/api/quotes/:quoteId/product-renderings", isAuthenticated, upload.single('image'), async (req: any, res) => {
    try {
      const params = quoteIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }

      const hasAccess = await storage.validateQuoteOwnership(params.data.quoteId, req.user?.id);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const file = req.file;
      const objectStorageService = new ObjectStorageService();
      
      const sanitizedFilename = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
      const timestamp = Date.now();
      const customPath = `product-renderings/${timestamp}-${sanitizedFilename}`;
      
      const uploadedObject = await objectStorageService.uploadPublicObjectEntityBuffer(customPath, file.buffer, {
        contentType: file.mimetype,
      });
      
      const publicUrl = uploadedObject.publicUrl ?? buildAppUrl(`/quote-images/${sanitizedFilename}`, req);
      
      const renderingData = {
        quoteId: params.data.quoteId,
        filename: sanitizedFilename,
        originalName: file.originalname,
        storageUrl: publicUrl,
        mimeType: file.mimetype,
        fileSize: file.size
      };
      
      const rendering = await storage.createQuoteProductRendering(renderingData);
      console.log(`✅ Visual asset saved: ${rendering.filename}`);
      res.status(201).json(rendering);
    } catch (error) {
      console.error("Error uploading visual asset:", error);
      res.status(500).json({ message: "Failed to upload visual asset" });
    }
  });

  app.put("/api/quote-images/cover-photo/:imageId", isAuthenticated, async (req, res) => {
    try {
      const params = imageIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }

      const updateData = updateQuoteCoverPhotoSchema.parse(req.body);
      const updatedPhoto = await storage.updateQuoteCoverPhoto(params.data.imageId, updateData);
      
      if (!updatedPhoto) {
        return res.status(404).json({ message: "Cover photo not found" });
      }

      res.json(updatedPhoto);
    } catch (error) {
      console.error("Error updating quote cover photo:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: error.errors 
        });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/quote-images/product-rendering/:imageId", isAuthenticated, async (req, res) => {
    try {
      const params = imageIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }

      const updateData = updateQuoteProductRenderingSchema.parse(req.body);
      const updatedRendering = await storage.updateQuoteProductRendering(params.data.imageId, updateData);
      
      if (!updatedRendering) {
        return res.status(404).json({ message: "Visual asset not found" });
      }

      res.json(updatedRendering);
    } catch (error) {
      console.error("Error updating quote visual asset:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: error.errors 
        });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/quote-images/cover-photo/:imageId", isAuthenticated, async (req, res) => {
    try {
      const params = imageIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }

      const deleted = await storage.deleteQuoteCoverPhoto(params.data.imageId);
      if (!deleted) {
        return res.status(404).json({ message: "Cover photo not found" });
      }

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting quote cover photo:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/quote-images/product-rendering/:imageId", isAuthenticated, async (req, res) => {
    try {
      const params = imageIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }

      const deleted = await storage.deleteQuoteProductRendering(params.data.imageId);
      if (!deleted) {
        return res.status(404).json({ message: "Visual asset not found" });
      }

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting quote visual asset:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
}
