import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { isAuthenticated } from "../replitAuth";
import type { InsertAccount, InsertQuote } from "@shared/schema";

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

function buildProjectName(lead: LeadIntakePayload): string {
  const name = buildLeadName(lead);
  const projectType = lead.projectType || "Website Lead";
  return name ? `${name} - ${projectType}` : projectType;
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

function isLikelyZipCode(value?: string | null): boolean {
  return !!value && /^\d{5}(?:-\d{4})?$/.test(value.trim());
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
  };
}

function mapLeadToQuote(lead: LeadIntakePayload, accountId: number): InsertQuote {
  return {
    accountId,
    quoteNumber: "",
    projectName: buildProjectName(lead),
    jobsiteAddress: lead.location || undefined,
    jobsiteZipCode: isLikelyZipCode(lead.location)
      ? lead.location || undefined
      : undefined,
    dealStage: "new_lead",
    notes: buildLeadNotes(lead),
    taxRate: "0",
    discount: "0",
    tariffRate: "0",
    shipping: "0",
  };
}

export function registerLeadIntakeRoutes(app: Express) {
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

      const quote = await storage.createQuote(mapLeadToQuote(lead, account.id));

      res.status(201).json({
        success: true,
        accountId: account.id,
        quoteId: quote.id,
        quoteNumber: quote.quoteNumber,
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
