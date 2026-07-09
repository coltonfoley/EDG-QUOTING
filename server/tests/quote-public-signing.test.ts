import { describe, expect, it } from "vitest";
import {
  buildPublicSigningQuote,
  createDocumentFingerprint,
  formatJobsiteAddress,
  getClientIp,
  isArchivedQuoteVersion,
} from "../quotePublicSigning";

describe("public quote signing projection", () => {
  it("publishes the customer price without exposing internal pricing controls", () => {
    const result = buildPublicSigningQuote({
      id: 10,
      quoteNumber: "Q-SAFE-10",
      tariffRate: "5",
      esigIncludeContract: false,
      customContractTerms: "internal contract terms",
      notes: "internal notes",
      lineItems: [{
        id: 1,
        quoteId: 10,
        description: "Pergola",
        quantity: "2",
        unitPrice: "100",
        discountType: "percentage",
        discountValue: "10",
        markupType: "percentage",
        markupValue: "20",
        isTariffApplicable: true,
        retailPrice: "9999",
        configData: { privateCostBasis: "do-not-publish" },
      }],
    });

    expect(result.lineItems[0]).toEqual(expect.objectContaining({
      unitPrice: "113.40",
      markupType: "percentage",
      markupValue: "0",
      discountType: "percentage",
      discountValue: "0",
    }));
    expect(result.lineItems[0]).not.toHaveProperty("retailPrice");
    expect(result.lineItems[0]).not.toHaveProperty("configData");
    expect(result.customContractTerms).toBeNull();
    expect(result.notes).toBeNull();
  });

  it("keeps a signed document snapshot immutable while refreshing signature metadata", () => {
    const result = buildPublicSigningQuote({
      signedDocumentSnapshot: {
        quoteNumber: "Q-SNAPSHOT",
        lineItems: [{ description: "Frozen line" }],
        esigIncludeApprovalDrawing: false,
        approvalDrawing: { id: 999 },
      },
      clientSignatureData: { name: "Customer" },
      clientSignedAt: "2026-01-01T12:00:00.000Z",
      signatureAuditTrail: { entries: [{ event: "client_signed" }] },
    });

    expect(result.quoteNumber).toBe("Q-SNAPSHOT");
    expect(result.lineItems).toEqual([{ description: "Frozen line" }]);
    expect(result.approvalDrawing).toBeNull();
    expect(result.esigIncludeApprovalDrawing).toBe(false);
    expect(result.clientSignatureData).toEqual({ name: "Customer" });
  });

  it("normalizes public request evidence and archived-version state", () => {
    expect(formatJobsiteAddress({
      jobsiteStreetAddress: "1802 Holian Drive",
      jobsiteCity: "Spring Grove",
      jobsiteState: "IL",
      jobsiteZipCode: "60081",
      jobsiteCountry: "United States",
    })).toBe("1802 Holian Drive, Spring Grove, IL, 60081");

    expect(getClientIp({
      headers: { "x-forwarded-for": "203.0.113.8, 10.0.0.2" },
      socket: {},
    })).toBe("203.0.113.8");
    expect(createDocumentFingerprint({ quote: 10 })).toMatch(/^[a-f0-9]{64}$/);
    expect(isArchivedQuoteVersion({ isLatestVersion: false })).toBe(true);
    expect(isArchivedQuoteVersion({ isLatestVersion: true })).toBe(false);
  });
});
