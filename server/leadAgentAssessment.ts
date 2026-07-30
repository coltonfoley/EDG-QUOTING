import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";

import {
  leadAgentAssessments,
  leadInquiries,
  type LeadAgentAssessment,
} from "@shared/schema";
import { appendBusinessEvent } from "./businessEvents";
import { db } from "./db";

export type LeadAgentAssessmentInput = {
  inquiryId: number;
  outcome: "fit" | "not_fit";
  reason: string;
  gmailDraftId?: string | null;
  gmailMessageId?: string | null;
  gmailDraftUrl?: string | null;
  idempotencyKey: string;
};

export class LeadAgentAssessmentError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 409) {
    super(message);
    this.name = "LeadAgentAssessmentError";
    this.code = code;
    this.status = status;
  }
}

function nullable(value?: string | null): string | null {
  const normalized = value?.trim();
  return normalized || null;
}

function hashIdempotencyKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isExactReplay(
  existing: LeadAgentAssessment,
  input: LeadAgentAssessmentInput,
): boolean {
  return existing.inquiryId === input.inquiryId
    && existing.outcome === input.outcome
    && existing.reason === input.reason.trim()
    && existing.gmailDraftId === nullable(input.gmailDraftId)
    && existing.gmailMessageId === nullable(input.gmailMessageId)
    && existing.gmailDraftUrl === nullable(input.gmailDraftUrl);
}

export async function recordLeadAgentAssessment(
  input: LeadAgentAssessmentInput,
  database: typeof db = db,
): Promise<{ assessment: LeadAgentAssessment; replayed: boolean }> {
  const idempotencyKeyHash = hashIdempotencyKey(input.idempotencyKey);

  return database.transaction(async (tx) => {
    const [inquiry] = await tx
      .select({ id: leadInquiries.id, accountId: leadInquiries.accountId })
      .from(leadInquiries)
      .where(eq(leadInquiries.id, input.inquiryId))
      .for("update");

    if (!inquiry) {
      throw new LeadAgentAssessmentError(
        "INQUIRY_NOT_FOUND",
        "The lead inquiry no longer exists.",
        404,
      );
    }

    const [existing] = await tx
      .select()
      .from(leadAgentAssessments)
      .where(eq(leadAgentAssessments.idempotencyKeyHash, idempotencyKeyHash))
      .limit(1);

    if (existing) {
      if (!isExactReplay(existing, input)) {
        throw new LeadAgentAssessmentError(
          "IDEMPOTENCY_KEY_REUSED",
          "This idempotency key was already used for a different lead assessment.",
        );
      }
      return { assessment: existing, replayed: true };
    }

    const [assessment] = await tx
      .insert(leadAgentAssessments)
      .values({
        inquiryId: inquiry.id,
        outcome: input.outcome,
        reason: input.reason.trim(),
        gmailDraftId: nullable(input.gmailDraftId),
        gmailMessageId: nullable(input.gmailMessageId),
        gmailDraftUrl: nullable(input.gmailDraftUrl),
        idempotencyKeyHash,
        source: "jacob-codex",
      })
      .onConflictDoNothing()
      .returning();

    if (!assessment) {
      const [replayedAssessment] = await tx
        .select()
        .from(leadAgentAssessments)
        .where(eq(leadAgentAssessments.idempotencyKeyHash, idempotencyKeyHash))
        .limit(1);

      if (replayedAssessment && isExactReplay(replayedAssessment, input)) {
        return { assessment: replayedAssessment, replayed: true };
      }
      if (replayedAssessment) {
        throw new LeadAgentAssessmentError(
          "IDEMPOTENCY_KEY_REUSED",
          "This idempotency key was already used for a different lead assessment.",
        );
      }
      throw new LeadAgentAssessmentError(
        "GMAIL_DRAFT_ALREADY_LINKED",
        "This Gmail draft is already linked to another lead assessment.",
      );
    }

    await appendBusinessEvent(tx, {
      eventType: input.outcome === "fit"
        ? "lead_assessed_fit"
        : "lead_assessed_not_fit",
      eventKey: `lead_agent_assessment:${assessment.id}`,
      accountId: inquiry.accountId,
      inquiryId: inquiry.id,
      actorUserId: null,
      occurredAt: assessment.createdAt,
    });

    return { assessment, replayed: false };
  });
}
