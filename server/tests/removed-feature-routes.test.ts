import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockStorage = vi.hoisted(() => ({
  getQuoteWithDetails: vi.fn(),
  updateQuote: vi.fn(),
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

const makeApp = () => {
  const app = express();
  app.use(express.json());
  registerPlanningAgreementRoutes(app);
  registerQuoteRoutes(app);
  return app;
};

describe("removed quote feature routes", () => {
  beforeEach(() => {
    mockStorage.getQuoteWithDetails.mockReset();
    mockStorage.updateQuote.mockReset();
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
});
