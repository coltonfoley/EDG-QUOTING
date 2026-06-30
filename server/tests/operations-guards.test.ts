import { beforeEach, describe, expect, it, vi } from "vitest";

const mockStorage = vi.hoisted(() => ({
  getQuoteWithDetails: vi.fn(),
}));

vi.mock("../storage", () => ({
  storage: mockStorage,
}));

import { sendQuoteToOperations } from "../integrations/operations";

const baseQuote = {
  id: 100,
  quoteNumber: "Q-GUARD-1",
  lineItems: [
    {
      id: 1,
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
};

describe("operations legacy record guards", () => {
  beforeEach(() => {
    mockStorage.getQuoteWithDetails.mockReset();
  });

  it("blocks Ops handoff when an existing planning agreement is unresolved", async () => {
    mockStorage.getQuoteWithDetails.mockResolvedValue({
      ...baseQuote,
      planningAgreement: {
        id: 7,
        status: "sent",
      },
    });

    const result = await sendQuoteToOperations(100);

    expect(result).toEqual(expect.objectContaining({
      success: false,
      status: 400,
      message: "Resolve the existing planning agreement before sending this quote to Ops.",
      data: expect.objectContaining({
        planningAgreement: expect.objectContaining({ id: 7, status: "sent" }),
      }),
    }));
  });

  it("blocks Ops handoff when an included legacy approval drawing is not order-ready", async () => {
    mockStorage.getQuoteWithDetails.mockResolvedValue({
      ...baseQuote,
      planningAgreement: null,
      esigIncludeApprovalDrawing: true,
      approvalDrawing: {
        id: 77,
        status: "sent_for_signature",
        orderStatus: "not_reviewed",
      },
    });

    const result = await sendQuoteToOperations(100);

    expect(result).toEqual(expect.objectContaining({
      success: false,
      status: 400,
      message: "Resolve the existing order approval drawing before sending this quote to Ops.",
      data: expect.objectContaining({
        approvalDrawing: expect.objectContaining({ id: 77, status: "sent_for_signature" }),
      }),
    }));
  });
});
