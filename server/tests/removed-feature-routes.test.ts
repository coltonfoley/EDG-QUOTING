import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockStorage = vi.hoisted(() => ({
  getPlanningAgreement: vi.fn(),
  getLineItem: vi.fn(),
  getGroup: vi.fn(),
  getQuoteWithDetails: vi.fn(),
  getQuoteBySigningToken: vi.fn(),
  getQuoteCoverPhotoById: vi.fn(),
  getQuoteProductRenderingById: vi.fn(),
  validateQuoteOwnership: vi.fn(),
  updateQuote: vi.fn(),
  updatePlanningAgreement: vi.fn(),
  deleteLineItem: vi.fn(),
  deleteGroup: vi.fn(),
  deleteQuoteCoverPhoto: vi.fn(),
  deleteQuoteProductRendering: vi.fn(),
}));
const mockSendQuoteToOperations = vi.hoisted(() => vi.fn());
const mockSendEmail = vi.hoisted(() => vi.fn());

vi.mock("../auth", () => ({
  isAuthenticated: (_req: any, _res: any, next: any) => next(),
  requireAdmin: (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../storage", () => ({
  storage: mockStorage,
}));

vi.mock("../db", () => ({
  db: {},
}));

vi.mock("../integrations/operations", () => ({
  sendQuoteToOperations: mockSendQuoteToOperations,
}));

vi.mock("../email", () => ({
  sendEmail: mockSendEmail,
}));

import { registerPlanningAgreementRoutes } from "../routes/planningAgreementRoutes";
import { registerQuoteRoutes } from "../routes/quoteRoutes";
import { registerLineItemRoutes } from "../routes/lineItemRoutes";

const makeApp = () => {
  const app = express();
  app.use(express.json());
  registerPlanningAgreementRoutes(app);
  registerQuoteRoutes(app);
  registerLineItemRoutes(app);
  return app;
};

describe("removed quote feature routes", () => {
  beforeEach(() => {
    mockStorage.getQuoteWithDetails.mockReset();
    mockStorage.getQuoteBySigningToken.mockReset();
    mockStorage.getPlanningAgreement.mockReset();
    mockStorage.getLineItem.mockReset();
    mockStorage.getGroup.mockReset();
    mockStorage.getQuoteCoverPhotoById.mockReset();
    mockStorage.getQuoteProductRenderingById.mockReset();
    mockStorage.validateQuoteOwnership.mockReset();
    mockStorage.updateQuote.mockReset();
    mockStorage.updatePlanningAgreement.mockReset();
    mockStorage.deleteLineItem.mockReset();
    mockStorage.deleteGroup.mockReset();
    mockStorage.deleteQuoteCoverPhoto.mockReset();
    mockStorage.deleteQuoteProductRendering.mockReset();
    mockSendQuoteToOperations.mockReset();
    mockSendEmail.mockReset();
  });

  it("rejects new Design + Planning Agreement creation", async () => {
    const response = await request(makeApp())
      .post("/api/quotes/123/planning-agreement")
      .send({ amount: "1500.00" })
      .expect(410);

    expect(response.body).toEqual({
      message: "Design + Planning Agreement creation has been removed from the quote workflow.",
      code: "PLANNING_AGREEMENT_REMOVED",
    });
  });

  it("rejects new order approval drawing creation", async () => {
    const response = await request(makeApp())
      .post("/api/quotes/123/approval-drawing")
      .send({ title: "Order Approval Drawing" })
      .expect(410);

    expect(response.body).toEqual({
      message: "Order approval drawing creation has been removed from the quote workflow.",
      code: "APPROVAL_DRAWING_REMOVED",
    });
  });

  it("forces approval links to exclude order approval drawings from stale clients", async () => {
    mockStorage.getQuoteWithDetails.mockResolvedValue({
      id: 123,
      isLatestVersion: true,
      signingToken: null,
      approvalDrawing: {
        id: 77,
        status: "ready_for_agreement",
      },
    });
    mockStorage.updateQuote.mockResolvedValue({ id: 123 });

    const response = await request(makeApp())
      .post("/api/quotes/123/enable-esignature")
      .send({
        esigIncludePricing: true,
        esigIncludeImages: false,
        esigIncludeContract: true,
        esigIncludeApprovalDrawing: true,
      })
      .expect(200);

    expect(mockStorage.updateQuote).toHaveBeenCalledWith(123, expect.objectContaining({
      enableESignature: true,
      esigIncludeApprovalDrawing: false,
    }));
    expect(response.body).toEqual(expect.objectContaining({
      success: true,
      approvalDrawingIncluded: false,
    }));
  });

  it("does not send an archived quote to Ops", async () => {
    mockStorage.getQuoteWithDetails.mockResolvedValue({
      id: 123,
      isLatestVersion: false,
    });

    const response = await request(makeApp())
      .post("/api/quotes/123/send-to-ops")
      .send({ dryRun: false })
      .expect(409);

    expect(response.body).toEqual({
      message: "This quote version is archived. Make it the current version before you send it to Ops.",
      code: "QUOTE_VERSION_ARCHIVED",
    });
    expect(mockSendQuoteToOperations).not.toHaveBeenCalled();
  });

  it("does not email an archived quote to a customer", async () => {
    mockStorage.getQuoteWithDetails.mockResolvedValue({
      id: 123,
      isLatestVersion: false,
      enableESignature: true,
      signingToken: "archived-signing-token",
      account: { email: "customer@example.com" },
    });

    const response = await request(makeApp())
      .post("/api/quotes/123/send-signature-email")
      .send({ personalizedMessage: "Please review." })
      .expect(409);

    expect(response.body).toEqual({
      message: "This quote version is archived. Make it the current version before you send it for customer approval.",
      code: "QUOTE_VERSION_ARCHIVED",
    });
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockStorage.updateQuote).not.toHaveBeenCalled();
  });

  it("does not overwrite an existing customer signature", async () => {
    mockStorage.getQuoteBySigningToken.mockResolvedValue({
      id: 123,
      isLatestVersion: true,
      enableESignature: true,
      clientSignedAt: new Date("2026-01-01T12:00:00.000Z"),
    });

    const response = await request(makeApp())
      .post("/api/signatures/existing-signature-token/sign")
      .send({
        signerType: "client",
        signatureData: {
          type: "type",
          imageData: "signed-by-customer",
          name: "Existing Customer",
        },
      })
      .expect(409);

    expect(response.body).toEqual({ message: "Client signature has already been recorded" });
    expect(mockStorage.updateQuote).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("does not reconfirm or overwrite a recorded payment", async () => {
    mockStorage.getPlanningAgreement.mockResolvedValue({
      id: 88,
      status: "paid_active",
      amount: "1500.00",
      paymentConfirmedAt: new Date("2026-01-02T12:00:00.000Z"),
    });

    const response = await request(makeApp())
      .post("/api/planning-agreements/88/confirm-payment")
      .send({ verified: true, paymentMethod: "check", paymentReference: "duplicate" })
      .expect(409);

    expect(response.body).toEqual({
      message: "Payment has already been confirmed for this planning agreement.",
    });
    expect(mockStorage.updatePlanningAgreement).not.toHaveBeenCalled();
  });

  it("does not mark unpaid planning work delivered", async () => {
    mockStorage.getPlanningAgreement.mockResolvedValue({
      id: 88,
      status: "signed_awaiting_payment",
      paymentConfirmedAt: null,
    });

    const response = await request(makeApp())
      .post("/api/planning-agreements/88/mark-delivered")
      .send({})
      .expect(409);

    expect(response.body).toEqual({
      message: "Confirm payment before marking planning work delivered.",
    });
    expect(mockStorage.updatePlanningAgreement).not.toHaveBeenCalled();
  });

  it("blocks direct line-item deletion without quote ownership", async () => {
    mockStorage.getLineItem.mockResolvedValue({ id: 7, quoteId: 55 });
    mockStorage.validateQuoteOwnership.mockResolvedValue(false);

    await request(makeApp())
      .delete("/api/line-items/7")
      .expect(403);

    expect(mockStorage.deleteLineItem).not.toHaveBeenCalled();
  });

  it("blocks group deletion without quote ownership", async () => {
    mockStorage.getGroup.mockResolvedValue({ id: "group-7", quoteId: 55 });
    mockStorage.validateQuoteOwnership.mockResolvedValue(false);

    await request(makeApp())
      .delete("/api/groups/group-7")
      .expect(403);

    expect(mockStorage.deleteGroup).not.toHaveBeenCalled();
  });

  it("blocks quote-image deletion without quote ownership", async () => {
    mockStorage.getQuoteCoverPhotoById.mockResolvedValue({ id: 7, quoteId: 55 });
    mockStorage.validateQuoteOwnership.mockResolvedValue(false);

    await request(makeApp())
      .delete("/api/quote-images/cover-photo/7")
      .expect(403);

    expect(mockStorage.deleteQuoteCoverPhoto).not.toHaveBeenCalled();
  });
});
