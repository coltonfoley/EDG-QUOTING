import type { IncomingMessage, ServerResponse } from "http";
import { randomUUID, timingSafeEqual } from "crypto";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { leadInquiries } from "../shared/schema";
import {
  createIdempotentLead,
  LeadIntakeIdempotencyError,
  resolveLeadIntakeSubmissionId,
} from "./leadIntakeIdempotency";
import { preserveAccountAndCreateInquiry } from "./leadIntakePersistence";
import { redactedErrorType } from "./redactedLogging";
import { leadIntakeSchema } from "@shared/leadIntake";

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
    const submittedId = resolveLeadIntakeSubmissionId({
      headerValue: req.headers["idempotency-key"],
      bodyValue: lead.idempotencyKey,
      metadataValue: lead.metadata,
    });
    const submissionId = submittedId || randomUUID();
    const { account, replayed } = await createIdempotentLead({
      submissionId,
      lead,
      createLead: (database) =>
        preserveAccountAndCreateInquiry(lead, submissionId, database),
    });
    const [inquiry] = await db
      .select({ id: leadInquiries.id })
      .from(leadInquiries)
      .where(eq(leadInquiries.submissionId, submissionId))
      .limit(1);

    return sendJson(res, replayed ? 200 : 201, {
      success: true,
      leadId: account.id,
      accountId: account.id,
      inquiryId: inquiry?.id || (account as { inquiryId?: number }).inquiryId,
      submissionId,
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

    console.error("Lead intake failed", { errorType: redactedErrorType(error) });
    return sendJson(res, 500, { success: false, message: "Failed to create lead" });
  }
}
