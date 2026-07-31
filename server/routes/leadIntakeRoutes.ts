import type { Express } from "express";
import { randomUUID, timingSafeEqual } from "crypto";
import multer from "multer";
import { z } from "zod";
import { storage } from "../storage";
import { isAuthenticated } from "../auth";
import { db } from "../db";
import {
  accounts,
  leadInquiries,
  leadInquiryStatusEvents,
  type InsertAccount,
  type LeadAttachment,
} from "@shared/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { ObjectStorageService } from "../objectStorage";
import {
  createIdempotentLead,
  LeadIntakeIdempotencyError,
  resolveLeadIntakeSubmissionId,
} from "../leadIntakeIdempotency";
import { preserveAccountAndCreateInquiry } from "../leadIntakePersistence";
import { redactedErrorType } from "../redactedLogging";
import { LeadAgentAssessmentError, recordLeadAgentAssessment } from "../leadAgentAssessment";
import { projectLeadWorkflowStatus } from "@shared/leadWorkflow";

export { preserveAccountAndCreateInquiry } from "../leadIntakePersistence";

const leadIntakeSchema = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  firstName: z.string().trim().min(1).max(255),
  lastName: z.string().trim().max(255).optional().nullable(),
  phone: z.string().trim().max(50).optional().nullable(),
  location: z.string().trim().max(500).optional().nullable(),
  projectType: z.string().trim().max(255).optional().nullable(),
  message: z.string().trim().max(5000).optional().nullable(),
  source: z.string().trim().max(255).optional().nullable(),
  customerType: z.string().trim().max(100).optional().nullable(),
  metadata: z.record(z.unknown()).optional().nullable(),
  idempotencyKey: z.string().trim().min(1).max(160).optional(),
});

type LeadIntakePayload = z.infer<typeof leadIntakeSchema>;

type UploadedLeadAttachmentFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

const leadStatusSchema = z.enum([
  "new",
  "contacted",
  "qualified",
  "unresponsive",
  "converted",
  "archived",
]);

const leadStatusUpdateSchema = z.object({
  status: z.enum(["contacted", "archived"]),
  reason: z.enum(["not_a_fit", "spam", "duplicate", "no_response", "other"]).optional().nullable(),
});

const gmailDraftUrlSchema = z.string().url().refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "mail.google.com"
      && /^\/mail\/u\/\d+\//.test(url.pathname) && url.hash.startsWith("#drafts");
  } catch { return false; }
}, "Gmail draft URL must use https://mail.google.com");

const leadAgentAssessmentSchema = z.object({
  outcome: z.enum(["fit", "not_fit"]),
  reason: z.string().trim().min(1).max(500),
  gmailDraftId: z.string().trim().min(1).max(255).optional().nullable(),
  gmailMessageId: z.string().trim().min(1).max(255).optional().nullable(),
  gmailDraftUrl: gmailDraftUrlSchema.optional().nullable(),
  idempotencyKey: z.string().trim().min(1).max(200),
}).superRefine((value, context) => {
  if (value.outcome === "fit" && !value.gmailMessageId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["gmailMessageId"], message: "A fit assessment needs a Gmail message ID." });
  }
  if (value.outcome === "not_fit" && (value.gmailDraftId || value.gmailMessageId || value.gmailDraftUrl)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["gmailDraftId"], message: "A not-a-fit assessment cannot include a Gmail draft." });
  }
});

const maxLeadAttachmentCount = 4;
const maxLeadAttachmentBytes = 1 * 1024 * 1024;
const maxTotalLeadAttachmentBytes = 3.5 * 1024 * 1024;
const allowedLeadAttachmentTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const leadAttachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxLeadAttachmentBytes,
    files: maxLeadAttachmentCount,
  },
  fileFilter: (_req, file, callback) => {
    if (!allowedLeadAttachmentTypes.has(file.mimetype)) {
      return callback(new Error(`${file.originalname} must be a JPG, PNG, or WebP image.`));
    }

    callback(null, true);
  },
});

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function sanitizeAttachmentFilename(filename: string): string {
  const cleaned = filename
    .trim()
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);

  return cleaned || "edg-site-photo.jpg";
}

function uploadLeadAttachments(req: any, res: any): Promise<void> {
  const upload = leadAttachmentUpload.array("attachments", maxLeadAttachmentCount);

  return new Promise((resolve, reject) => {
    upload(req, res, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function getLeadAttachmentSource(value: unknown): string {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 255)
    : "website";
}

function getLeadAttachmentSubmissionId(value: unknown): string {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 255)
    : randomUUID();
}

function isConfiguredWebsiteApiKey(req: any): boolean {
  const configuredKey = process.env.RAINMAKER_API_KEY;
  const authHeader = req.headers.authorization;

  if (!configuredKey || !authHeader?.startsWith("Bearer ")) {
    return false;
  }

  const suppliedKey = authHeader.slice("Bearer ".length);
  const configuredBuffer = Buffer.from(configuredKey);
  const suppliedBuffer = Buffer.from(suppliedKey);

  return (
    configuredBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(configuredBuffer, suppliedBuffer)
  );
}

function isLeadAttachmentAuthenticated(req: any, res: any, next: any) {
  if (req.isAuthenticated?.() || isConfiguredWebsiteApiKey(req)) {
    return next();
  }

  res.status(401).json({ message: "Unauthorized" });
}

export function registerLeadIntakeRoutes(app: Express) {
  app.get("/api/lead-agent/inquiries/pending", isAuthenticated, async (req, res) => {
    try {
      const limit = Math.min(z.coerce.number().int().positive().default(50).parse(req.query.limit), 200);
      const rows = await db.select({
        accountId: accounts.id,
        inquiryId: leadInquiries.id,
        submissionId: leadInquiries.submissionId,
        name: accounts.name,
        email: accounts.email,
        phone: accounts.phone,
        projectType: leadInquiries.projectType,
        location: leadInquiries.location,
        message: leadInquiries.message,
        source: leadInquiries.source,
        customerType: leadInquiries.customerType,
        metadata: leadInquiries.metadata,
        receivedAt: leadInquiries.receivedAt,
      }).from(leadInquiries)
        .innerJoin(accounts, eq(accounts.id, leadInquiries.accountId))
        .where(and(
          eq(leadInquiries.status, "new"),
          sql`NOT EXISTS (SELECT 1 FROM lead_agent_assessments assessment WHERE assessment.inquiry_id = ${leadInquiries.id})`,
        ))
        .orderBy(leadInquiries.receivedAt, leadInquiries.id)
        .limit(limit);
      res.json(rows);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid pending-inquiry query", errors: error.errors });
      console.error("Error fetching pending lead inquiries", { errorType: redactedErrorType(error) });
      res.status(500).json({ message: "Failed to fetch pending lead inquiries" });
    }
  });

  app.put("/api/inquiries/:id/agent-assessment", isAuthenticated, async (req, res) => {
    try {
      const inquiryId = z.coerce.number().int().positive().parse(req.params.id);
      const payload = leadAgentAssessmentSchema.parse(req.body);
      const result = await recordLeadAgentAssessment({ inquiryId, ...payload });
      res.status(result.replayed ? 200 : 201).json(result);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid lead assessment", errors: error.errors });
      if (error instanceof LeadAgentAssessmentError) return res.status(error.status).json({ message: error.message, code: error.code });
      console.error("Error recording lead assessment", { errorType: redactedErrorType(error) });
      res.status(500).json({ message: "Failed to record lead assessment" });
    }
  });

  app.get("/api/leads", isAuthenticated, async (req, res) => {
    try {
      const statusParam = typeof req.query.status === "string" ? req.query.status : "new";
      const status = statusParam === "all" ? "all" : leadStatusSchema.parse(statusParam);
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = parseInt(req.query.offset as string) || 0;

      const where = status === "all" ? undefined : eq(leadInquiries.status, status);

      const leads = await db
        .select({
          id: accounts.id,
          inquiryId: leadInquiries.id,
          submissionId: leadInquiries.submissionId,
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
          leadStatus: leadInquiries.status,
          leadSource: leadInquiries.source,
          leadProjectType: leadInquiries.projectType,
          leadMessage: leadInquiries.message,
          leadReceivedAt: leadInquiries.receivedAt,
          leadLastContactedAt: leadInquiries.lastContactedAt,
          leadConvertedAt: leadInquiries.convertedAt,
          storedLeadStatus: leadInquiries.status,
          archiveReason: leadInquiries.archiveReason,
          convertedQuoteId: leadInquiries.convertedQuoteId,
          convertedQuoteNumber: sql<string | null>`(
            SELECT quote.quote_number FROM quotes quote WHERE quote.id = ${leadInquiries.convertedQuoteId} LIMIT 1
          )`,
          assessmentOutcome: sql<string | null>`(
            SELECT assessment.outcome FROM lead_agent_assessments assessment
            WHERE assessment.inquiry_id = ${leadInquiries.id}
            ORDER BY assessment.created_at DESC, assessment.id DESC LIMIT 1
          )`,
          assessmentReason: sql<string | null>`(
            SELECT assessment.reason FROM lead_agent_assessments assessment
            WHERE assessment.inquiry_id = ${leadInquiries.id}
            ORDER BY assessment.created_at DESC, assessment.id DESC LIMIT 1
          )`,
          gmailDraftId: sql<string | null>`(
            SELECT assessment.gmail_draft_id FROM lead_agent_assessments assessment
            WHERE assessment.inquiry_id = ${leadInquiries.id}
            ORDER BY assessment.created_at DESC, assessment.id DESC LIMIT 1
          )`,
          gmailMessageId: sql<string | null>`(
            SELECT assessment.gmail_message_id FROM lead_agent_assessments assessment
            WHERE assessment.inquiry_id = ${leadInquiries.id}
            ORDER BY assessment.created_at DESC, assessment.id DESC LIMIT 1
          )`,
          gmailDraftUrl: sql<string | null>`(
            SELECT assessment.gmail_draft_url FROM lead_agent_assessments assessment
            WHERE assessment.inquiry_id = ${leadInquiries.id}
            ORDER BY assessment.created_at DESC, assessment.id DESC LIMIT 1
          )`,
          inquiryCount: sql<number>`(
            SELECT COUNT(*)::int FROM lead_inquiries inquiry_count
            WHERE inquiry_count.account_id = ${accounts.id}
          )`,
          createdAt: accounts.createdAt,
          updatedAt: accounts.updatedAt,
          projectCount: sql<number>`
            (SELECT COUNT(*)::int
             FROM quotes
             WHERE quotes.account_id = accounts.id
               AND quotes.is_latest_version = true)
          `,
        })
        .from(leadInquiries)
        .innerJoin(accounts, eq(accounts.id, leadInquiries.accountId))
        .where(where)
        .orderBy(desc(leadInquiries.receivedAt), desc(leadInquiries.id))
        .limit(limit)
        .offset(offset);

      const attachments = await storage.getLeadAttachmentsForAccounts(
        leads.map((lead) => lead.id)
      );
      res.json(
        leads.map((lead) => ({
          ...lead,
          leadStatus: projectLeadWorkflowStatus({
            storedStatus: lead.storedLeadStatus,
            assessmentOutcome: lead.assessmentOutcome,
            gmailMessageId: lead.gmailMessageId,
            convertedQuoteId: lead.convertedQuoteId,
          }),
          attachments: attachments.filter((attachment) => Boolean(lead.submissionId) && attachment.submissionId === lead.submissionId),
          leadAttachments: attachments.filter((attachment) => Boolean(lead.submissionId) && attachment.submissionId === lead.submissionId),
        }))
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Invalid lead query",
          errors: error.errors,
        });
      }

      console.error("Error fetching leads", { errorType: redactedErrorType(error) });
      res.status(500).json({ message: "Failed to fetch leads" });
    }
  });

  app.patch("/api/leads/:id/status", isAuthenticated, async (req, res) => {
    try {
      const id = z.coerce.number().int().positive().parse(req.params.id);
      const { status } = leadStatusUpdateSchema.parse(req.body);

      const updates: Partial<InsertAccount> = {
        leadStatus: status,
      };

      if (status === "contacted") {
        updates.leadLastContactedAt = new Date();
      }

      const account = await storage.updateAccount(id, updates);
      if (!account || !account.leadStatus) {
        return res.status(404).json({ message: "Lead not found" });
      }

      res.json(account);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Invalid lead status",
          errors: error.errors,
        });
      }

      console.error("Error updating lead status", { errorType: redactedErrorType(error) });
      res.status(500).json({ message: "Failed to update lead status" });
    }
  });

  app.patch("/api/inquiries/:id/status", isAuthenticated, async (req, res) => {
    try {
      const id = z.coerce.number().int().positive().parse(req.params.id);
      const { status, reason } = leadStatusUpdateSchema.parse(req.body);
      const now = new Date();
      const inquiry = await db.transaction(async (tx) => {
        const [existing] = await tx.select().from(leadInquiries).where(eq(leadInquiries.id, id)).for("update");
        if (!existing) return undefined;
        const [updated] = await tx.update(leadInquiries).set({
          status,
          archiveReason: status === "archived" ? reason || null : null,
          ...(status === "contacted" ? { lastContactedAt: now } : {}),
          updatedAt: now,
        }).where(eq(leadInquiries.id, id)).returning();
        await tx.insert(leadInquiryStatusEvents).values({
          inquiryId: id,
          fromStatus: existing.status,
          toStatus: status,
          reason: status === "archived" ? reason || null : null,
          actorUserId: (req.user as { id?: number } | undefined)?.id || null,
          createdAt: now,
        });
        return updated;
      });

      if (!inquiry) return res.status(404).json({ message: "Inquiry not found" });
      res.json(inquiry);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid inquiry status", errors: error.errors });
      }
      console.error("Error updating inquiry status", { errorType: redactedErrorType(error) });
      res.status(500).json({ message: "Failed to update inquiry status" });
    }
  });

  app.get("/api/accounts/:id/inquiries", isAuthenticated, async (req, res) => {
    try {
      const accountId = z.coerce.number().int().positive().parse(req.params.id);
      const inquiries = await db
        .select()
        .from(leadInquiries)
        .where(eq(leadInquiries.accountId, accountId))
        .orderBy(desc(leadInquiries.receivedAt), desc(leadInquiries.id));
      res.json(inquiries);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid client ID", errors: error.errors });
      }
      console.error("Error fetching inquiry history", { errorType: redactedErrorType(error) });
      res.status(500).json({ message: "Failed to fetch inquiry history" });
    }
  });

  app.post("/api/leads/:id/attachments", isLeadAttachmentAuthenticated, async (req: any, res) => {
    try {
      const accountId = z.coerce.number().int().positive().parse(req.params.id);
      const account = await storage.getAccount(accountId);

      if (!account || !account.leadStatus) {
        return res.status(404).json({
          success: false,
          message: "Lead not found",
        });
      }

      await uploadLeadAttachments(req, res);

      const files = (req.files || []) as UploadedLeadAttachmentFile[];
      if (files.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No photo attachments were uploaded",
        });
      }

      const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
      if (totalBytes > maxTotalLeadAttachmentBytes) {
        return res.status(413).json({
          success: false,
          message: `Lead photos are limited to ${formatBytes(maxTotalLeadAttachmentBytes)} total.`,
        });
      }

      const objectStorageService = new ObjectStorageService();
      const source = getLeadAttachmentSource(req.body?.source);
      const submissionId = getLeadAttachmentSubmissionId(req.body?.submissionId);
      const createdAttachments: LeadAttachment[] = [];

      for (const [index, file] of files.entries()) {
        const originalName = sanitizeAttachmentFilename(file.originalname);
        const storedName = `${Date.now()}-${index + 1}-${randomUUID()}-${originalName}`;
        const objectPath = `lead-attachments/${accountId}/${storedName}`;
        const uploadedObject = await objectStorageService.uploadPublicObjectEntityBuffer(
          objectPath,
          file.buffer,
          { contentType: file.mimetype }
        );

        const created = await storage.createLeadAttachment({
          accountId,
          submissionId,
          filename: storedName,
          originalName,
          storageUrl: uploadedObject.publicUrl || uploadedObject.objectPath,
          fileSize: file.size,
          mimeType: file.mimetype,
          source,
          displayOrder: index,
          isActive: true,
        });

        createdAttachments.push(created);
      }

      res.status(201).json({
        success: true,
        accountId,
        leadId: accountId,
        attachments: createdAttachments,
      });
    } catch (error: any) {
      if (error instanceof multer.MulterError) {
        const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
        return res.status(status).json({
          success: false,
          message:
            error.code === "LIMIT_FILE_SIZE"
              ? `Each lead photo must be ${formatBytes(maxLeadAttachmentBytes)} or smaller.`
              : error.message,
        });
      }

      if (
        error instanceof Error &&
        error.message.includes("must be a JPG, PNG, or WebP image")
      ) {
        return res.status(400).json({
          success: false,
          message: error.message,
        });
      }

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: "Invalid lead attachment request",
          errors: error.errors,
        });
      }

      console.error("Lead attachment upload failed", { errorType: redactedErrorType(error) });
      res.status(500).json({
        success: false,
        message: error?.message || "Failed to upload lead attachments",
      });
    }
  });

  app.post("/api/leads/intake", isLeadAttachmentAuthenticated, async (req: any, res) => {
    try {
      if (!isConfiguredWebsiteApiKey(req)) {
        return res.status(403).json({
          success: false,
          message: "Lead intake requires API key authentication",
        });
      }

      const lead = leadIntakeSchema.parse(req.body);
      const submittedId = resolveLeadIntakeSubmissionId({
        headerValue: req.headers["idempotency-key"],
        bodyValue: lead.idempotencyKey,
        metadataValue: lead.metadata,
      });
      const submissionId = submittedId || randomUUID();

      const { account, replayed } = await createIdempotentLead({
        submissionId,
        lead,
        createLead: (database) => preserveAccountAndCreateInquiry(lead, submissionId, database),
      });
      const [inquiry] = await db
        .select({ id: leadInquiries.id })
        .from(leadInquiries)
        .where(eq(leadInquiries.submissionId, submissionId))
        .limit(1);

      res.status(replayed ? 200 : 201).json({
        success: true,
        leadId: account.id,
        accountId: account.id,
        inquiryId: inquiry?.id || (account as any).inquiryId,
        submissionId,
        leadStatus: account.leadStatus || "new",
        createdQuote: false,
        replayed,
      });
    } catch (error) {
      if (error instanceof LeadIntakeIdempotencyError) {
        return res.status(error.status).json({
          success: false,
          message: error.message,
        });
      }

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: "Invalid lead data",
          errors: error.errors,
        });
      }

      console.error("Lead intake failed", { errorType: redactedErrorType(error) });
      res.status(500).json({
        success: false,
        message: "Failed to create lead",
      });
    }
  });
}
