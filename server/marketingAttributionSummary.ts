import { isOpaqueLeadSubmissionId } from "./leadSubmissionIdentity";

export const EXCLUDED_MARKETING_LEAD_STATUSES = new Set([
  "duplicate",
  "spam",
  "test",
]);

export type MarketingAttributionRow = {
  submissionId: string | null;
  verifiedAt: Date;
  leadStatus: string | null;
};

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

function addUtcDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function datesBetween(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let date = from; date <= to; date = addUtcDays(date, 1)) {
    dates.push(date);
  }
  return dates;
}

export function isIncludedMarketingLead(row: MarketingAttributionRow): boolean {
  const status = String(row.leadStatus || "new").trim().toLowerCase();
  return !EXCLUDED_MARKETING_LEAD_STATUSES.has(status);
}

export function summarizeMarketingAttribution<T extends MarketingAttributionRow>(
  rows: T[],
  from: string,
  to: string
) {
  const reviewedRows = rows.filter((row) => {
    const date = chicagoDate(row.verifiedAt);
    return date >= from && date <= to;
  });
  const verifiedRows = reviewedRows.filter(isIncludedMarketingLead);
  const rowsWithSubmissionId = verifiedRows.filter((row) =>
    isOpaqueLeadSubmissionId(row.submissionId)
  );
  const dailyCounts = new Map<string, number>();
  for (const row of verifiedRows) {
    const date = chicagoDate(row.verifiedAt);
    dailyCounts.set(date, (dailyCounts.get(date) ?? 0) + 1);
  }

  return {
    reviewedRows,
    verifiedRows,
    rowsWithSubmissionId,
    summary: {
      recordsReviewed: reviewedRows.length,
      excludedRecords: reviewedRows.length - verifiedRows.length,
      verifiedWebsiteLeads: verifiedRows.length,
      recordsWithSubmissionId: rowsWithSubmissionId.length,
      submissionIdCoverage:
        verifiedRows.length > 0
          ? rowsWithSubmissionId.length / verifiedRows.length
          : 1,
    },
    daily: datesBetween(from, to).map((date) => ({
      date,
      verifiedWebsiteLeads: dailyCounts.get(date) ?? 0,
    })),
  };
}
