import type { IncomingMessage, ServerResponse } from "http";
import { timingSafeEqual } from "crypto";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "../server/db";
import { accounts, type InsertAccount } from "../shared/schema";
import {
  createIdempotentLead,
  type LeadIntakeDatabase,
  LeadIntakeIdempotencyError,
  resolveLeadIntakeSubmissionId,
} from "../server/leadIntakeIdempotency";

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

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
  const body = JSON.stringify(payload);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", Buffer.byteLength(body));
  res.end(body);
}

async function readJsonBody(req: IncomingMessage) {
  let raw = "";

  for await (const chunk of req) {
    raw += chunk;
  }

  return raw ? JSON.parse(raw) : {};
}

function isAuthorized(req: IncomingMessage) {
  const configuredKey = process.env.RAINMAKER_API_KEY;
  const authHeader = req.headers.authorization;

  if (!configuredKey || !authHeader?.startsWith("Bearer ")) {
    return false;
  }

  const suppliedKey = authHeader.slice("Bearer ".length);
  const configuredBuffer = Buffer.from(configuredKey);
  const suppliedBuffer = Buffer.from(suppliedKey);

  return configuredBuffer.length === suppliedBuffer.length
    && timingSafeEqual(configuredBuffer, suppliedBuffer);
}

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

async function upsertLead(
  accountData: InsertAccount,
  database: LeadIntakeDatabase = db
) {
  const [existingAccount] = await database
    .select()
    .from(accounts)
    .where(sql`LOWER(${accounts.email}) = ${accountData.email.toLowerCase()}`)
    .limit(1);

  if (existingAccount) {
    const [updatedAccount] = await database
      .update(accounts)
      .set({ ...accountData, updatedAt: new Date() })
      .where(sql`${accounts.id} = ${existingAccount.id}`)
      .returning();

    return updatedAccount || existingAccount;
  }

  const [newAccount] = await database
    .insert(accounts)
    .values(accountData)
    .returning();

  return newAccount;
}

export async function handleLeadIntake(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { success: false, message: "Method not allowed" });
  }

  if (!isAuthorized(req)) {
    return sendJson(res, 401, { success: false, message: "Unauthorized" });
  }

  try {
    const body = await readJsonBody(req);
    const lead = leadIntakeSchema.parse(body);
    const submissionId = resolveLeadIntakeSubmissionId({
      headerValue: req.headers["idempotency-key"],
      bodyValue: lead.idempotencyKey,
      metadataValue: lead.metadata,
    });
    const { account, replayed } = await createIdempotentLead({
      submissionId,
      lead,
      createLead: (database) => upsertLead(mapLeadToAccount(lead), database),
    });

    return sendJson(res, replayed ? 200 : 201, {
      success: true,
      leadId: account.id,
      accountId: account.id,
      leadStatus: account.leadStatus || "new",
      createdQuote: false,
      replayed,
    });
  } catch (error) {
    if (error instanceof LeadIntakeIdempotencyError) {
      return sendJson(res, error.status, {
        success: false,
        message: error.message,
      });
    }

    if (error instanceof z.ZodError) {
      return sendJson(res, 400, {
        success: false,
        message: "Invalid lead data",
        errors: error.errors,
      });
    }

    console.error("Lead intake failed:", error);
    return sendJson(res, 500, { success: false, message: "Failed to create lead" });
  }
}
