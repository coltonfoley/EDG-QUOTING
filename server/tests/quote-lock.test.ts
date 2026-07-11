import { describe, expect, it } from "vitest";
import {
  InvalidQuoteTransitionMutationError,
  QuoteSignedLockedError,
  QuoteChangedBeforeSignatureError,
  assertQuoteMutationAllowed,
  assertQuoteSignatureRevision,
  isCustomerApprovedQuote,
} from "../quoteLock";

const baseQuote = {
  id: 42,
  clientSignedAt: null,
  clientSignatureData: null,
  signedDocumentSnapshot: null,
} as const;

describe("customer-approved quote lock policy", () => {
  it.each([
    ["clientSignedAt", { clientSignedAt: new Date("2026-07-10T12:00:00.000Z") }],
    ["clientSignatureData", { clientSignatureData: { type: "type", name: "Test signer" } }],
    ["signedDocumentSnapshot", { signedDocumentSnapshot: { quoteNumber: "TEST-42" } }],
  ])("treats %s as approval evidence", (_label, evidence) => {
    const quote = { ...baseQuote, ...evidence } as any;
    expect(isCustomerApprovedQuote(quote)).toBe(true);
    expect(() => assertQuoteMutationAllowed(quote, { projectName: "Changed" }))
      .toThrow(QuoteSignedLockedError);
  });

  it("allows pipeline stage changes after approval", () => {
    const quote = { ...baseQuote, clientSignedAt: new Date() } as any;
    expect(() => assertQuoteMutationAllowed(
      quote,
      { dealStage: "closed_won", lostReason: null },
      "pipeline_stage",
    )).not.toThrow();
  });

  it("allows only company-signature fields through the company transition", () => {
    const quote = { ...baseQuote, clientSignedAt: new Date() } as any;
    expect(() => assertQuoteMutationAllowed(
      quote,
      { companySignedAt: new Date(), companySignatureData: { type: "type" } },
      "company_signature",
    )).not.toThrow();
    expect(() => assertQuoteMutationAllowed(
      quote,
      { companySignedAt: new Date(), projectName: "Hidden commercial edit" },
      "company_signature",
    )).toThrow(InvalidQuoteTransitionMutationError);
  });

  it("does not let a customer-signature transition overwrite an approved quote", () => {
    const quote = { ...baseQuote, signedDocumentSnapshot: { quoteNumber: "TEST-42" } } as any;
    expect(() => assertQuoteMutationAllowed(
      quote,
      { clientSignedAt: new Date(), clientSignatureData: { type: "type" } },
      "customer_signature",
    )).toThrow(QuoteSignedLockedError);
  });

  it("rejects signing against a stale quote revision", () => {
    expect(() => assertQuoteSignatureRevision(
      { id: 42, updatedAt: new Date("2026-07-10T12:01:00.000Z") },
      new Date("2026-07-10T12:00:00.000Z"),
    )).toThrow(QuoteChangedBeforeSignatureError);
  });
});
