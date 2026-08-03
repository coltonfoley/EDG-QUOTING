import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { leadAgentAssessments, leadInquiries, type LeadAgentAssessment } from "@shared/schema";
import { db } from "./db";

export type LeadAgentAssessmentInput = {
  inquiryId: number;
  outcome: "fit" | "not_fit";
  reason: string;
  gmailDraftId?: string | null;
  gmailMessageId?: string | null;
  gmailDraftUrl?: string | null;
  draftEmailContent?: string | null;
  idempotencyKey: string;
};

export class LeadAgentAssessmentError extends Error {
  constructor(readonly code: string, message: string, readonly status = 409) {
    super(message);
    this.name = "LeadAgentAssessmentError";
  }
}

const nullable = (value?: string | null) => value?.trim() || null;
const hashIdempotencyKey = (value: string) => createHash("sha256").update(value).digest("hex");

function isExactReplay(existing: LeadAgentAssessment, input: LeadAgentAssessmentInput) {
  return existing.inquiryId === input.inquiryId
    && existing.outcome === input.outcome
    && existing.reason === input.reason.trim()
    && existing.gmailDraftId === nullable(input.gmailDraftId)
    && existing.gmailMessageId === nullable(input.gmailMessageId)
    && existing.gmailDraftUrl === nullable(input.gmailDraftUrl)
    && existing.draftEmailContent === nullable(input.draftEmailContent);
}

export async function recordLeadAgentAssessment(input: LeadAgentAssessmentInput, database: typeof db = db) {
  const idempotencyKeyHash = hashIdempotencyKey(input.idempotencyKey);
  return database.transaction(async (tx) => {
    const [inquiry] = await tx.select({ id: leadInquiries.id, accountId: leadInquiries.accountId })
      .from(leadInquiries).where(eq(leadInquiries.id, input.inquiryId)).for("update");
    if (!inquiry) throw new LeadAgentAssessmentError("INQUIRY_NOT_FOUND", "The lead inquiry no longer exists.", 404);

    const [existing] = await tx.select().from(leadAgentAssessments)
      .where(eq(leadAgentAssessments.idempotencyKeyHash, idempotencyKeyHash)).limit(1);
    if (existing) {
      if (!isExactReplay(existing, input)) {
        throw new LeadAgentAssessmentError("IDEMPOTENCY_KEY_REUSED", "This idempotency key was already used for a different lead assessment.");
      }
      return { assessment: existing, replayed: true };
    }

    const [assessment] = await tx.insert(leadAgentAssessments).values({
      inquiryId: inquiry.id,
      outcome: input.outcome,
      reason: input.reason.trim(),
      gmailDraftId: nullable(input.gmailDraftId),
      gmailMessageId: nullable(input.gmailMessageId),
      gmailDraftUrl: nullable(input.gmailDraftUrl),
      draftEmailContent: nullable(input.draftEmailContent),
      idempotencyKeyHash,
      source: "jacob-codex",
    }).onConflictDoNothing().returning();

    if (!assessment) {
      const [replay] = await tx.select().from(leadAgentAssessments)
        .where(eq(leadAgentAssessments.idempotencyKeyHash, idempotencyKeyHash)).limit(1);
      if (replay && isExactReplay(replay, input)) return { assessment: replay, replayed: true };
      if (replay) throw new LeadAgentAssessmentError("IDEMPOTENCY_KEY_REUSED", "This idempotency key was already used for a different lead assessment.");
      throw new LeadAgentAssessmentError("GMAIL_DRAFT_ALREADY_LINKED", "This Gmail draft is already linked to another lead assessment.");
    }

    return { assessment, replayed: false };
  });
}
