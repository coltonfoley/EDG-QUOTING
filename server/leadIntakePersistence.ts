import { sql } from "drizzle-orm";

import { db } from "./db";
import { accounts, leadInquiries, type InsertAccount } from "@shared/schema";

export type PersistableLeadIntake = {
  email: string;
  firstName: string;
  lastName?: string | null;
  phone?: string | null;
  location?: string | null;
  projectType?: string | null;
  message?: string | null;
  source?: string | null;
  customerType?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type PersistedLeadAccount = {
  id: number;
  leadStatus?: string | null;
  inquiryId: number;
};

function accountTypeFromLead(
  customerType?: string | null
): InsertAccount["accountType"] {
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

function buildLeadName(lead: PersistableLeadIntake): string {
  return [lead.firstName, lead.lastName].filter(Boolean).join(" ").trim();
}

function buildLeadNotes(lead: PersistableLeadIntake): string {
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

function mapLeadToAccount(lead: PersistableLeadIntake): InsertAccount {
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

/**
 * Preserve the durable customer account while appending every website inquiry.
 * The submission id is non-PII and is shared with website analytics so a
 * successful form event can be reconciled to the exact Rainmaker record.
 */
export async function preserveAccountAndCreateInquiry(
  lead: PersistableLeadIntake,
  submissionId: string,
  database: any = db
): Promise<PersistedLeadAccount> {
  const accountData = mapLeadToAccount(lead);
  const [existingAccount] = await database
    .select()
    .from(accounts)
    .where(sql`LOWER(${accounts.email}) = ${accountData.email.toLowerCase()}`)
    .limit(1);

  if (existingAccount) {
    const shouldReplaceName =
      !existingAccount.name?.trim() ||
      existingAccount.name === existingAccount.email ||
      existingAccount.name === "Unnamed Client";
    const conservativeUpdates = {
      ...(shouldReplaceName ? { name: accountData.name } : {}),
      ...(!existingAccount.firstName && accountData.firstName
        ? { firstName: accountData.firstName }
        : {}),
      ...(!existingAccount.lastName && accountData.lastName
        ? { lastName: accountData.lastName }
        : {}),
      ...(!existingAccount.phone && accountData.phone
        ? { phone: accountData.phone }
        : {}),
      ...(!existingAccount.billingAddress && accountData.billingAddress
        ? { billingAddress: accountData.billingAddress }
        : {}),
      updatedAt: new Date(),
    };
    const [updatedAccount] = await database
      .update(accounts)
      .set(conservativeUpdates)
      .where(sql`${accounts.id} = ${existingAccount.id}`)
      .returning();
    const account = updatedAccount || existingAccount;
    const [inquiry] = await database
      .insert(leadInquiries)
      .values({
        accountId: account.id,
        submissionId,
        status: "new",
        source: lead.source || "website",
        projectType: lead.projectType || undefined,
        message: lead.message || undefined,
        location: lead.location || undefined,
        customerType: lead.customerType || undefined,
        metadata: lead.metadata || undefined,
        receivedAt: new Date(),
      })
      .returning({ id: leadInquiries.id });
    return { ...account, inquiryId: inquiry.id };
  }

  const [newAccount] = await database
    .insert(accounts)
    .values(accountData)
    .returning();

  const [inquiry] = await database
    .insert(leadInquiries)
    .values({
      accountId: newAccount.id,
      submissionId,
      status: "new",
      source: lead.source || "website",
      projectType: lead.projectType || undefined,
      message: lead.message || undefined,
      location: lead.location || undefined,
      customerType: lead.customerType || undefined,
      metadata: lead.metadata || undefined,
      receivedAt: new Date(),
    })
    .returning({ id: leadInquiries.id });

  return { ...newAccount, inquiryId: inquiry.id };
}
