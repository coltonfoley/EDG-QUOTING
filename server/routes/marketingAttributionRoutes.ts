import { timingSafeEqual } from "crypto";
import type { Express } from "express";
import { and, asc, gte, lte } from "drizzle-orm";
import { z } from "zod";

import { leadInquiries } from "@shared/schema";
import { db } from "../db";
import { summarizeMarketingAttribution } from "../marketingAttributionSummary";
import { safeDimension, safePath } from "../marketingAttributionPrivacy";
import { redactedErrorType } from "../redactedLogging";

const attributionRangeSchema = z.object({
  from: z.string().date(),
  to: z.string().date(),
});

type AttributionRecord = {
  submissionId: string | null;
  verifiedAt: Date;
  source: string | null;
  projectType: string | null;
  leadStatus: string | null;
  metadata: unknown;
};

function safeMetadata(record: AttributionRecord) {
  const metadata =
    record.metadata && typeof record.metadata === "object"
      ? (record.metadata as Record<string, unknown>)
      : {};
  return {
    source: safeDimension(record.source),
    formId: safeDimension(metadata.form_id || metadata.form_variant),
    projectType: safeDimension(record.projectType),
    market: safeDimension(metadata.market || metadata.market_param),
    leadStatus: safeDimension(record.leadStatus),
    landingPage: safePath(metadata.landing_page || metadata.page_path),
    utmSource: safeDimension(metadata.utm_source),
    utmMedium: safeDimension(metadata.utm_medium),
    utmCampaign: safeDimension(metadata.utm_campaign),
  };
}

function chicagoDate(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function hasWebsiteApiKey(req: any): boolean {
  const configuredKey = process.env.RAINMAKER_API_KEY;
  const authHeader = req.headers.authorization;
  if (!configuredKey || !authHeader?.startsWith("Bearer ")) return false;

  const suppliedKey = authHeader.slice("Bearer ".length);
  const configuredBuffer = Buffer.from(configuredKey);
  const suppliedBuffer = Buffer.from(suppliedKey);
  return (
    configuredBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(configuredBuffer, suppliedBuffer)
  );
}

function isAttributionAuthenticated(req: any, res: any, next: any) {
  if (req.isAuthenticated?.() || hasWebsiteApiKey(req)) return next();
  return res.status(401).json({ message: "Unauthorized" });
}

export function registerMarketingAttributionRoutes(app: Express) {
  app.get(
    "/api/marketing/lead-attribution",
    isAttributionAuthenticated,
    async (req, res) => {
      try {
        const range = attributionRangeSchema.parse({
          from: req.query.from,
          to: req.query.to,
        });
        const requestedStart = new Date(`${range.from}T00:00:00.000Z`);
        const requestedEnd = new Date(`${range.to}T23:59:59.999Z`);

        if (requestedStart > requestedEnd) {
          return res.status(400).json({
            success: false,
            message: "The attribution start date must be on or before the end date",
          });
        }

        // Read an expanded UTC window, then apply EDG's reporting timezone in
        // memory so leads around midnight are assigned to the correct day.
        const queryStart = new Date(requestedStart);
        queryStart.setUTCDate(queryStart.getUTCDate() - 1);
        const queryEnd = new Date(requestedEnd);
        queryEnd.setUTCDate(queryEnd.getUTCDate() + 1);
        const database: any = db;
        const rawRecords = (await database
          .select({
            submissionId: leadInquiries.submissionId,
            verifiedAt: leadInquiries.receivedAt,
            source: leadInquiries.source,
            projectType: leadInquiries.projectType,
            leadStatus: leadInquiries.status,
            metadata: leadInquiries.metadata,
          })
          .from(leadInquiries)
          .where(
            and(
              gte(leadInquiries.receivedAt, queryStart),
              lte(leadInquiries.receivedAt, queryEnd)
            )
          )
          .orderBy(asc(leadInquiries.receivedAt))) as AttributionRecord[];
        const attribution = summarizeMarketingAttribution(
          rawRecords,
          range.from,
          range.to
        );
        const rowsWithSubmissionId = new Set(attribution.rowsWithSubmissionId);
        const records = attribution.verifiedRows
          .filter((record) => rowsWithSubmissionId.has(record))
          .map((record) => ({
            submissionId: record.submissionId!,
            verifiedAt: record.verifiedAt.toISOString(),
            verifiedDate: chicagoDate(record.verifiedAt),
            ...safeMetadata(record),
          }));

        return res.json({
          success: true,
          schemaVersion: "1.1",
          generatedAt: new Date().toISOString(),
          range,
          scope: "accepted_website_inquiries_excluding_spam_test_duplicate",
          summary: attribution.summary,
          daily: attribution.daily,
          records,
          containsCustomerPii: false,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({
            success: false,
            message: "Use from and to dates in YYYY-MM-DD format",
            errors: error.errors,
          });
        }

        console.error("Error fetching lead attribution", {
          errorType: redactedErrorType(error),
        });
        return res.status(500).json({
          success: false,
          message: "Failed to fetch lead attribution",
        });
      }
    }
  );
}
