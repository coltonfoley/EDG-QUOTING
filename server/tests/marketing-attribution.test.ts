import { describe, expect, it } from "vitest";

import {
  safeDimension,
  safePath,
} from "../marketingAttributionPrivacy";
import {
  isOpaqueLeadSubmissionId,
  resolveLeadIntakeSubmissionId,
} from "../leadSubmissionIdentity";
import { summarizeMarketingAttribution } from "../marketingAttributionSummary";

describe("marketing attribution privacy projection", () => {
  it("keeps approved reporting dimensions", () => {
    expect(safeDimension("spring-grove")).toBe("spring-grove");
    expect(safeDimension("google / organic")).toBe("google / organic");
    expect(safePath("https://edgpatioshade.com/contact?utm_source=google")).toBe(
      "/contact"
    );
  });

  it("drops contact-shaped values instead of returning them to the dashboard", () => {
    expect(safeDimension("customer@example.com")).toBeNull();
    expect(safeDimension("8475551212")).toBeNull();
    expect(safePath("not a valid reporting path")).toBeNull();
    expect(safePath("/contact/customer@example.com")).toBeNull();
  });
});

describe("anonymous lead submission identity", () => {
  it("accepts only the website's opaque ID formats", () => {
    const uuid = "2f9ff7b4-26fb-4d82-8f92-2545a497a171";
    const fallback = "edg-abcdefghijklmnopqrstuvwx";
    expect(isOpaqueLeadSubmissionId(uuid)).toBe(true);
    expect(isOpaqueLeadSubmissionId(fallback)).toBe(true);
    expect(
      resolveLeadIntakeSubmissionId({
        headerValue: uuid,
        bodyValue: uuid,
        metadataValue: { submission_id: uuid },
      })
    ).toBe(uuid);
  });

  it("rejects contact-shaped and arbitrary idempotency keys", () => {
    for (const unsafe of [
      "customer@example.com",
      "8475551212",
      "edg-1721070000000-random",
      "arbitrary-request-key",
    ]) {
      expect(isOpaqueLeadSubmissionId(unsafe)).toBe(false);
      expect(() =>
        resolveLeadIntakeSubmissionId({ bodyValue: unsafe })
      ).toThrow("opaque EDG-generated identifier");
    }
  });
});

describe("marketing attribution inclusion and coverage", () => {
  it("counts every reviewed inquiry while excluding spam, test, and duplicate leads", () => {
    const result = summarizeMarketingAttribution(
      [
        {
          submissionId: "2f9ff7b4-26fb-4d82-8f92-2545a497a171",
          verifiedAt: new Date("2026-07-14T15:00:00.000Z"),
          leadStatus: "new",
        },
        {
          submissionId: null,
          verifiedAt: new Date("2026-07-14T16:00:00.000Z"),
          leadStatus: "qualified",
        },
        {
          submissionId: "edg-abcdefghijklmnopqrstuvwx",
          verifiedAt: new Date("2026-07-14T17:00:00.000Z"),
          leadStatus: "spam",
        },
      ],
      "2026-07-14",
      "2026-07-15"
    );

    expect(result.summary).toEqual({
      recordsReviewed: 3,
      excludedRecords: 1,
      verifiedWebsiteLeads: 2,
      recordsWithSubmissionId: 1,
      submissionIdCoverage: 0.5,
    });
    expect(result.daily).toEqual([
      { date: "2026-07-14", verifiedWebsiteLeads: 2 },
      { date: "2026-07-15", verifiedWebsiteLeads: 0 },
    ]);
  });
});
