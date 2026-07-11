import { describe, expect, it } from "vitest";
import {
  buildPublicSigningQuote,
  createDocumentFingerprint,
  formatJobsiteAddress,
  getCustomerPackageIssues,
  getClientIp,
  isArchivedQuoteVersion,
} from "../quotePublicSigning";
import { fictionalSignedQuote } from "./fixtures/fictional-signed-quote";

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
    expect(result.customerPackageVersion).toBe(0);
    expect(result.packageIssues).toEqual([]);
    expect(result.clientSignatureData).toEqual({ name: "Customer" });
  });

  it("includes ordered groups and selected visuals in the token-scoped package", () => {
    const updatedAt = new Date("2026-07-10T12:00:00.000Z");
    const result = buildPublicSigningQuote({
      id: 22,
      quoteNumber: "Q-PACKAGE-22",
      updatedAt,
      esigIncludeContract: false,
      esigIncludeImages: true,
      lineItems: [{
        id: 1,
        quoteId: 22,
        description: "Shade system",
        quantity: "1",
        unitPrice: "2500",
        groupId: "group-b",
      }],
      groups: [{ id: "group-b", title: "Option B", position: 2, configData: { internal: true } }],
      productRenderings: [{
        id: 9,
        quoteId: 22,
        storageUrl: "https://example.test/rendering.jpg",
        filename: "rendering.jpg",
        originalName: "Rendering.jpg",
        mimeType: "image/jpeg",
        displayOrder: 1,
        fileSize: 999,
      }],
    });

    expect(result.customerPackageVersion).toBe(1);
    expect(result.documentRevision).toBe(updatedAt.toISOString());
    expect(result.customerPackageFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(result.packageIssues).toEqual([]);
    expect(result.groups).toEqual([{ id: "group-b", title: "Option B", position: 2 }]);
    expect(result.productRenderings).toEqual([expect.objectContaining({
      id: 9,
      storageUrl: "https://example.test/rendering.jpg",
      displayOrder: 1,
    })]);
    expect(result.productRenderings[0]).not.toHaveProperty("quoteId");
    expect(result.productRenderings[0]).not.toHaveProperty("fileSize");
  });

  it("keeps the reviewed package fingerprint stable across operational timestamps", () => {
    const base = {
      id: 22,
      quoteNumber: "Q-PACKAGE-22",
      esigIncludeContract: false,
      esigIncludeImages: false,
      lineItems: [{ id: 1, quoteId: 22, description: "Scope", quantity: "1", unitPrice: "100" }],
    };
    const first = buildPublicSigningQuote({ ...base, updatedAt: new Date("2026-07-10T12:00:00Z") });
    const later = buildPublicSigningQuote({ ...base, updatedAt: new Date("2026-07-10T12:05:00Z") });

    expect(first.documentRevision).not.toBe(later.documentRevision);
    expect(first.customerPackageFingerprint).toBe(later.customerPackageFingerprint);
  });

  it("freezes the exact reviewed package when the customer signs", () => {
    const quote = {
      id: 22,
      quoteNumber: "Q-PACKAGE-22",
      updatedAt: new Date("2026-07-10T12:00:00Z"),
      esigIncludeContract: false,
      esigIncludeImages: false,
      lineItems: [{ id: 1, quoteId: 22, description: "Reviewed scope", quantity: "1", unitPrice: "100" }],
      groups: [{ id: "group-a", title: "Reviewed option", position: 0 }],
    };
    const preview = buildPublicSigningQuote(quote);
    const snapshot = buildPublicSigningQuote({
      ...quote,
      clientSignatureData: { type: "type", imageData: "Customer", name: "Customer" },
      clientSignedAt: new Date("2026-07-10T12:05:00Z"),
      clientSignedIp: "192.0.2.10",
    });

    expect(snapshot.customerPackageFingerprint).toBe(preview.customerPackageFingerprint);
    expect(snapshot.lineItems).toEqual(preview.lineItems);
    expect(snapshot.groups).toEqual(preview.groups);
  });

  it("reports incomplete package choices instead of silently omitting content", () => {
    expect(getCustomerPackageIssues({
      lineItems: [],
      esigIncludeContract: true,
      esigIncludeImages: true,
      productRenderings: [],
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "NO_LINE_ITEMS" }),
      expect.objectContaining({ code: "MISSING_CONTRACT_CONTENT" }),
      expect.objectContaining({ code: "MISSING_VISUALS" }),
    ]));
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

  it("projects the fictional PDF fixture without internal pricing controls", () => {
    const result = buildPublicSigningQuote(fictionalSignedQuote);

    expect(result.quoteNumber).toBe("TEST-Q-0001");
    expect(result.lineItems).toHaveLength(2);
    expect(result.lineItems.every((item: Record<string, unknown>) => !Object.hasOwn(item, "retailPrice"))).toBe(true);
    expect(result.lineItems.every((item: Record<string, unknown>) => !Object.hasOwn(item, "configData"))).toBe(true);
  });
});
