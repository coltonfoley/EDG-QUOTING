import { describe, expect, it } from "vitest";
import { buildOperationsPayload } from "../integrations/operationsPayload";
import { buildOperationsDocuments } from "../integrations/operationsDocuments";

const sampleQuote = {
  id: 100,
  quoteNumber: "QT-PLANNING-1",
  projectName: "Planning Credit Test",
  taxRate: "0",
  discount: "0",
  shipping: "0",
  tariffRate: "0",
  lineItems: [
    {
      id: 1,
      productId: null,
      description: "Pergola",
      quantity: "1",
      unitPrice: "1000.00",
      retailPrice: "1000.00",
      markupType: "percentage",
      markupValue: "0",
      discountType: "percentage",
      discountValue: "0",
      isTaxable: true,
      isTariffApplicable: false,
      manufacturer: "EDG",
      sku: "PERGOLA-1",
      unit: "ea",
    },
  ],
};

describe("operations payload planning agreement handling", () => {
  it("includes planning agreement summary without adding a line item", async () => {
    const payload = await buildOperationsPayload({
      ...sampleQuote,
      planningAgreement: {
        id: 7,
        status: "credited",
        tier: "standard_design",
        amount: "1500.00",
        creditEligible: true,
        appliedCreditAmount: "1500.00",
      },
    }, true, {
      buildDocuments: async (quote) => [
        {
          kind: "proposal",
          type: "Proposal PDF",
          contentType: "application/pdf",
          contentBase64: Buffer.from("%PDF proposal").toString("base64"),
          sourceDocumentKey: `EDG-QUOTING:quote:${quote.id}:rainmaker_proposal_pdf`,
        },
        {
          kind: "bill_of_materials",
          type: "Bill of Materials",
          contentType: "application/pdf",
          contentBase64: Buffer.from("%PDF bom").toString("base64"),
          sourceDocumentKey: `EDG-QUOTING:quote:${quote.id}:rainmaker_bom_pdf`,
        },
      ],
    }) as any;

    expect(payload.quote.lineItems).toHaveLength(1);
    expect(payload.quote.planningAgreement).toEqual(expect.objectContaining({
      id: 7,
      status: "credited",
      appliedCreditAmount: "1500.00",
    }));
    expect(payload.quote.totals.total).toBe(1000);
    expect(payload.handoffDocuments).toHaveLength(2);
    expect(payload.handoffDocuments.map((document: any) => document.kind)).toEqual([
      "proposal",
      "bill_of_materials",
    ]);
    expect(payload.handoffDocuments.map((document: any) => document.type)).toEqual([
      "Proposal PDF",
      "Bill of Materials",
    ]);
    expect(payload.handoffDocuments[0].contentType).toBe("application/pdf");
    expect(Buffer.from(payload.handoffDocuments[0].contentBase64, "base64").subarray(0, 4).toString()).toBe("%PDF");
    expect(payload.handoffDocuments.map((document: any) => document.sourceDocumentKey)).toEqual([
      "EDG-QUOTING:quote:100:rainmaker_proposal_pdf",
      "EDG-QUOTING:quote:100:rainmaker_bom_pdf",
    ]);
  });

  it("builds the real server-safe handoff documents for Send to Ops", async () => {
    const payload = await buildOperationsPayload({
      ...sampleQuote,
      id: 652,
      quoteNumber: "Q-1780586478446",
      notes: "Customer approved scope.",
    }, true);

    expect(payload.handoffDocuments).toHaveLength(2);
    expect(payload.handoffDocuments.map((document: any) => document.kind)).toEqual([
      "proposal",
      "bill_of_materials",
    ]);
    expect(payload.handoffDocuments.map((document: any) => document.sourceDocumentKey)).toEqual([
      "EDG-QUOTING:quote:652:rainmaker_proposal_pdf",
      "EDG-QUOTING:quote:652:rainmaker_bom_pdf",
    ]);
    for (const document of payload.handoffDocuments as any[]) {
      expect(document.visibility).toBe("internal");
      expect(document.fileName).toContain("Q-1780586478446");
      expect(Buffer.from(document.contentBase64, "base64").subarray(0, 4).toString()).toBe("%PDF");
      expect(document.contentSha256).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it("can import and run the document builder directly in the node test environment", async () => {
    const documents = await buildOperationsDocuments(sampleQuote, {
      subtotal: 1000,
      discountAmount: 0,
      shippingAmount: 0,
      taxAmount: 0,
      total: 1000,
    });

    expect(documents).toHaveLength(2);
    expect(documents[0]).toEqual(expect.objectContaining({
      kind: "proposal",
      type: "Proposal PDF",
      sourceDocumentKey: "EDG-QUOTING:quote:100:rainmaker_proposal_pdf",
      visibility: "internal",
    }));
    expect(documents[1]).toEqual(expect.objectContaining({
      kind: "bill_of_materials",
      type: "Bill of Materials",
      sourceDocumentKey: "EDG-QUOTING:quote:100:rainmaker_bom_pdf",
      visibility: "internal",
    }));
  });
});
