import { describe, expect, it } from "vitest";
import { buildOperationsPayload } from "../integrations/operationsPayload";

describe("operations payload planning agreement handling", () => {
  it("includes planning agreement summary without adding a line item", async () => {
    const payload = await buildOperationsPayload({
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
        },
      ],
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
          type: "Contract",
          contentType: "application/pdf",
          contentBase64: Buffer.from("%PDF contract").toString("base64"),
          sourceDocumentKey: `EDG-QUOTING:quote:${quote.id}:rainmaker_contract_pdf`,
        },
        {
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
    expect(payload.handoffDocuments.map((document: any) => document.type)).toEqual([
      "Contract",
      "Bill of Materials",
    ]);
    expect(payload.handoffDocuments[0].contentType).toBe("application/pdf");
    expect(Buffer.from(payload.handoffDocuments[0].contentBase64, "base64").subarray(0, 4).toString()).toBe("%PDF");
    expect(payload.handoffDocuments.map((document: any) => document.sourceDocumentKey)).toEqual([
      "EDG-QUOTING:quote:100:rainmaker_contract_pdf",
      "EDG-QUOTING:quote:100:rainmaker_bom_pdf",
    ]);
  });
});
