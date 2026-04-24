import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { isAuthenticated } from "../replitAuth";
import { db } from "../db";
import { accounts, type InsertAccount } from "@shared/schema";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";

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
});

type LeadIntakePayload = z.infer<typeof leadIntakeSchema>;

const leadStatusSchema = z.enum([
  "new",
  "contacted",
  "qualified",
  "unresponsive",
  "converted",
  "archived",
]);

const leadStatusUpdateSchema = z.object({
  status: leadStatusSchema,
});

function accountTypeFromLead(customerType?: string | null): InsertAccount["accountType"] {
  switch ((customerType || "").toLowerCase()) {
    case "commercial":
      return "commercial";
    case "pro":
    case "trade":
    case "contractor":
    case "builder":
      return "general_contractor";
    default:
      return "homeowner";
  }
}

function buildLeadName(lead: LeadIntakePayload): string {
  return [lead.firstName, lead.lastName].filter(Boolean).join(" ").trim();
}

function buildLeadNotes(lead: LeadIntakePayload): string {
  const lines = [
    "Website lead intake",
    `Source: ${lead.source || "website"}`,
    `Project type: ${lead.projectType || "Not provided"}`,
    `Customer type: ${lead.customerType || "Not provided"}`,
    `Location / ZIP: ${lead.location || "Not provided"}`,
    `Phone: ${lead.phone || "Not provided"}`,
    "",
    "Message:",
    lead.message || "No message provided.",
  ];

  if (lead.metadata && Object.keys(lead.metadata).length > 0) {
    lines.push("", "Metadata:", JSON.stringify(lead.metadata, null, 2));
  }

  return lines.join("\n");
}

function mapLeadToAccount(lead: LeadIntakePayload): InsertAccount {
  const name = buildLeadName(lead) || lead.email;
  return {
    name,
    firstName: lead.firstName,
    lastName: lead.lastName || undefined,
    email: lead.email,
    phone: lead.phone || "",
    company: undefined,
    accountType: accountTypeFromLead(lead.customerType),
    paymentTerms: "net_30",
    billingAddress: lead.location || undefined,
    leadStatus: "new",
    leadSource: lead.source || "website",
    leadProjectType: lead.projectType || undefined,
    leadMessage: buildLeadNotes(lead),
    leadReceivedAt: new Date(),
  };
}

export function registerLeadIntakeRoutes(app: Express) {
  app.get("/api/leads", isAuthenticated, async (req, res) => {
    try {
      const statusParam = typeof req.query.status === "string" ? req.query.status : "new";
      const status = statusParam === "all" ? "all" : leadStatusSchema.parse(statusParam);
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = parseInt(req.query.offset as string) || 0;

      const where = status === "all"
        ? isNotNull(accounts.leadStatus)
        : and(isNotNull(accounts.leadStatus), eq(accounts.leadStatus, status));

      const leads = await db
        .select({
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
          googleContactId: accounts.googleContactId,
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
          `,
        })
        .from(accounts)
        .where(where)
        .orderBy(sql`${accounts.leadReceivedAt} DESC NULLS LAST`, desc(accounts.createdAt))
        .limit(limit)
        .offset(offset);

      res.json(leads);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Invalid lead query",
          errors: error.errors,
        });
      }

      console.error("Error fetching leads:", error);
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

      if (status === "converted") {
        updates.leadConvertedAt = new Date();
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

      console.error("Error updating lead status:", error);
      res.status(500).json({ message: "Failed to update lead status" });
    }
  });

  app.post("/api/leads/intake", isAuthenticated, async (req: any, res) => {
    try {
      if (!req.apiKeyAuthenticated) {
        return res.status(403).json({
          success: false,
          message: "Lead intake requires API key authentication",
        });
      }

      const lead = leadIntakeSchema.parse(req.body);

      const account = await storage.createAccount(mapLeadToAccount(lead), {
        allowDuplicate: false,
        updateIfExists: true,
        createPrimaryContact: false,
      });

      res.status(201).json({
        success: true,
        leadId: account.id,
        accountId: account.id,
        leadStatus: account.leadStatus || "new",
        createdQuote: false,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: "Invalid lead data",
          errors: error.errors,
        });
      }

      console.error("Lead intake failed:", error);
      res.status(500).json({
        success: false,
        message: "Failed to create lead",
      });
    }
  });
}
