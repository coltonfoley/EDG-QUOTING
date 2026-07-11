import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockStorage = vi.hoisted(() => ({
  getEmailDeliveryHealth: vi.fn(),
  getEmailDeliveryAttempt: vi.fn(),
  getQuoteWithDetails: vi.fn(),
  claimEmailDelivery: vi.fn(),
  markEmailDeliverySent: vi.fn(),
  markEmailDeliveryFailed: vi.fn(),
}));
const mockSendEmail = vi.hoisted(() => vi.fn());

vi.mock("../storage", () => ({ storage: mockStorage }));
vi.mock("../email", () => ({ sendEmail: mockSendEmail }));
vi.mock("../auth", () => ({
  isAuthenticated: (req: any, res: any, next: any) => {
    const role = req.get("x-test-role");
    if (!role) return res.status(401).json({ message: "Unauthorized" });
    req.user = { id: role === "admin" ? 1 : 2, role };
    next();
  },
  requireAdmin: (req: any, res: any, next: any) => (
    req.user?.role === "admin"
      ? next()
      : res.status(403).json({ message: "Admin access required" })
  ),
}));

import { registerEmailDeliveryRoutes } from "../routes/emailDeliveryRoutes";

function makeApp() {
  const app = express();
  registerEmailDeliveryRoutes(app);
  return app;
}

describe("email delivery reconciliation route", () => {
  beforeEach(() => {
    mockStorage.getEmailDeliveryHealth.mockReset();
    mockStorage.getEmailDeliveryAttempt.mockReset();
    mockStorage.getQuoteWithDetails.mockReset();
    mockStorage.claimEmailDelivery.mockReset();
    mockStorage.markEmailDeliverySent.mockReset();
    mockStorage.markEmailDeliveryFailed.mockReset();
    mockSendEmail.mockReset();
  });

  it("rejects unauthenticated and non-admin requests before reading the ledger", async () => {
    await request(makeApp())
      .get("/api/admin/email-delivery-health")
      .expect(401, { message: "Unauthorized" });

    await request(makeApp())
      .get("/api/admin/email-delivery-health")
      .set("x-test-role", "user")
      .expect(403, { message: "Admin access required" });

    expect(mockStorage.getEmailDeliveryHealth).not.toHaveBeenCalled();
  });

  it("returns only redacted operational evidence to an administrator", async () => {
    mockStorage.getEmailDeliveryHealth.mockResolvedValue({
      asOf: new Date("2026-07-10T15:00:00.000Z"),
      staleAfterMinutes: 15,
      summary: { pending: 1, stalePending: 1, failed: 1, sent: 4, sentLast24Hours: 2 },
      attentionTotal: 2,
      attentionTruncated: false,
      attention: [{
        id: 91,
        messageType: "quote_signature_request",
        quoteId: 123,
        planningAgreementId: null,
        status: "failed",
        attemptCount: 2,
        lastErrorType: "ProviderUnavailable",
        createdAt: new Date("2026-07-10T14:00:00.000Z"),
        updatedAt: new Date("2026-07-10T14:01:00.000Z"),
      }],
    });

    const response = await request(makeApp())
      .get("/api/admin/email-delivery-health")
      .set("x-test-role", "admin")
      .expect(200);

    expect(mockStorage.getEmailDeliveryHealth).toHaveBeenCalledWith({
      staleAfterMinutes: 15,
      limit: 50,
    });
    expect(response.body).toMatchObject({
      staleAfterMinutes: 15,
      attentionTotal: 2,
      attention: [{
        id: 91,
        quoteId: 123,
        status: "failed",
        lastErrorType: "ProviderUnavailable",
      }],
    });
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain("idempotency");
    expect(serialized).not.toContain("recipient");
    expect(serialized).not.toContain("example.com");
    expect(serialized).not.toContain("messageBody");
  });

  it("returns a generic failure without exposing storage details", async () => {
    mockStorage.getEmailDeliveryHealth.mockRejectedValue(new Error("database detail must stay private"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await request(makeApp())
      .get("/api/admin/email-delivery-health")
      .set("x-test-role", "admin")
      .expect(500);

    expect(response.body).toEqual({ message: "Failed to fetch email delivery health" });
    expect(consoleError).toHaveBeenCalledWith("Error fetching email delivery health", { errorType: "Error" });
    consoleError.mockRestore();
  });

  it("allows only an administrator to retry a specifically failed quote confirmation", async () => {
    await request(makeApp())
      .post("/api/admin/email-delivery-attempts/91/retry-confirmation")
      .expect(401, { message: "Unauthorized" });
    await request(makeApp())
      .post("/api/admin/email-delivery-attempts/91/retry-confirmation")
      .set("x-test-role", "user")
      .expect(403, { message: "Admin access required" });
    expect(mockStorage.getEmailDeliveryAttempt).not.toHaveBeenCalled();

    const fingerprint = "a".repeat(64);
    mockStorage.getEmailDeliveryAttempt.mockResolvedValue({
      id: 91,
      idempotencyKey: `quote-signature-confirmation:123:${fingerprint}`,
      messageType: "quote_signature_confirmation",
      quoteId: 123,
      planningAgreementId: null,
      status: "failed",
    });
    mockStorage.getQuoteWithDetails.mockResolvedValue({
      id: 123,
      quoteNumber: "TEST-123",
      projectName: "Fictional signed project",
      signingToken: "fictional-signing-token",
      clientSignedAt: new Date("2026-07-10T12:00:00.000Z"),
      signatureAuditTrail: { documentFingerprint: fingerprint },
      account: { name: "Fictional Customer", email: "fixture@example.invalid" },
    });
    mockStorage.claimEmailDelivery.mockResolvedValue({ outcome: "claimed", attempt: { id: 91 } });
    mockStorage.markEmailDeliverySent.mockResolvedValue({ id: 91, status: "sent" });
    mockSendEmail.mockResolvedValue({ id: "fixture-provider-id" });

    const response = await request(makeApp())
      .post("/api/admin/email-delivery-attempts/91/retry-confirmation")
      .set("x-test-role", "admin")
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      message: "The signature confirmation receipt was accepted by the email provider.",
    });
    expect(mockStorage.claimEmailDelivery).toHaveBeenCalledWith({
      idempotencyKey: `quote-signature-confirmation:123:${fingerprint}`,
      messageType: "quote_signature_confirmation",
      quoteId: 123,
      planningAgreementId: null,
    });
    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "fixture@example.invalid" }));
  });

  it("refuses pending, request-email, and mismatched confirmation records", async () => {
    mockStorage.getEmailDeliveryAttempt.mockResolvedValue({
      id: 91,
      messageType: "quote_signature_request",
      quoteId: 123,
      status: "failed",
    });
    await request(makeApp())
      .post("/api/admin/email-delivery-attempts/91/retry-confirmation")
      .set("x-test-role", "admin")
      .expect(409);
    expect(mockStorage.getQuoteWithDetails).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();

    const fingerprint = "b".repeat(64);
    mockStorage.getEmailDeliveryAttempt.mockResolvedValue({
      id: 92,
      idempotencyKey: "wrong-key",
      messageType: "quote_signature_confirmation",
      quoteId: 123,
      status: "failed",
    });
    mockStorage.getQuoteWithDetails.mockResolvedValue({
      id: 123,
      quoteNumber: "TEST-123",
      signingToken: "fictional-signing-token",
      clientSignedAt: new Date(),
      signatureAuditTrail: { documentFingerprint: fingerprint },
      account: { name: "Fictional Customer", email: "fixture@example.invalid" },
    });
    await request(makeApp())
      .post("/api/admin/email-delivery-attempts/92/retry-confirmation")
      .set("x-test-role", "admin")
      .expect(409, { message: "The delivery record does not match the signed document." });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});
