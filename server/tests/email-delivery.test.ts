import { describe, expect, it, vi } from "vitest";
import { deliverIdempotentEmail, EmailIdempotencyError, requireEmailIdempotencyKey } from "../emailDelivery";

describe("email delivery idempotency", () => {
  it("accepts an opaque client action key", () => {
    expect(requireEmailIdempotencyKey("quote-email:123:550e8400-e29b-41d4-a716-446655440000"))
      .toBe("quote-email:123:550e8400-e29b-41d4-a716-446655440000");
  });

  it("requires a key so mutation retries cannot send uncontrolled duplicates", () => {
    expect(() => requireEmailIdempotencyKey(undefined)).toThrow(EmailIdempotencyError);
    try {
      requireEmailIdempotencyKey("");
    } catch (error) {
      expect(error).toMatchObject({ status: 400, code: "EMAIL_IDEMPOTENCY_KEY_REQUIRED" });
    }
  });

  it("rejects keys that could create ambiguous or unsafe records", () => {
    expect(() => requireEmailIdempotencyKey("short")).toThrow(/invalid/i);
    expect(() => requireEmailIdempotencyKey("invalid key with spaces")).toThrow(/invalid/i);
  });

  it("finalizes a claimed delivery with provider evidence", async () => {
    const ledger = {
      claimEmailDelivery: vi.fn().mockResolvedValue({ outcome: "claimed", attempt: { id: 42 } }),
      markEmailDeliverySent: vi.fn().mockResolvedValue({ id: 42, status: "sent" }),
      markEmailDeliveryFailed: vi.fn(),
    };
    const send = vi.fn().mockResolvedValue({ id: "provider-message" });

    const result = await deliverIdempotentEmail({
      ledger,
      idempotencyKey: "quote-signature-confirmation:123:fingerprint",
      messageType: "quote_signature_confirmation",
      quoteId: 123,
      send,
    });

    expect(result.outcome).toBe("sent");
    expect(send).toHaveBeenCalledTimes(1);
    expect(ledger.markEmailDeliverySent).toHaveBeenCalledWith(42, expect.any(Date), "provider-message");
    expect(ledger.markEmailDeliveryFailed).not.toHaveBeenCalled();
  });

  it("does not send again when the confirmation was already accepted", async () => {
    const sentAt = new Date("2026-07-10T12:00:00.000Z");
    const ledger = {
      claimEmailDelivery: vi.fn().mockResolvedValue({ outcome: "sent", attempt: { id: 42, sentAt } }),
      markEmailDeliverySent: vi.fn(),
      markEmailDeliveryFailed: vi.fn(),
    };
    const send = vi.fn();

    const result = await deliverIdempotentEmail({
      ledger,
      idempotencyKey: "quote-signature-confirmation:123:fingerprint",
      messageType: "quote_signature_confirmation",
      quoteId: 123,
      send,
    });

    expect(result).toEqual({ outcome: "replayed", sentAt });
    expect(send).not.toHaveBeenCalled();
  });

  it("records a redacted failure and leaves ambiguous finalization for review", async () => {
    const failedLedger = {
      claimEmailDelivery: vi.fn().mockResolvedValue({ outcome: "claimed", attempt: { id: 42 } }),
      markEmailDeliverySent: vi.fn(),
      markEmailDeliveryFailed: vi.fn().mockResolvedValue({ id: 42, status: "failed" }),
    };
    const failed = await deliverIdempotentEmail({
      ledger: failedLedger,
      idempotencyKey: "quote-signature-confirmation:123:fingerprint",
      messageType: "quote_signature_confirmation",
      quoteId: 123,
      send: vi.fn().mockRejectedValue(new TypeError("private provider detail")),
    });
    expect(failed).toEqual({ outcome: "failed", errorType: "TypeError" });
    expect(failedLedger.markEmailDeliveryFailed).toHaveBeenCalledWith(42, "TypeError");
    expect(JSON.stringify(failed)).not.toContain("private provider detail");

    const ambiguousLedger = {
      claimEmailDelivery: vi.fn().mockResolvedValue({ outcome: "claimed", attempt: { id: 43 } }),
      markEmailDeliverySent: vi.fn().mockResolvedValue(undefined),
      markEmailDeliveryFailed: vi.fn(),
    };
    const ambiguous = await deliverIdempotentEmail({
      ledger: ambiguousLedger,
      idempotencyKey: "quote-signature-confirmation:124:fingerprint",
      messageType: "quote_signature_confirmation",
      quoteId: 124,
      send: vi.fn().mockResolvedValue({ id: "provider-accepted" }),
    });
    expect(ambiguous).toEqual({ outcome: "pending_review", errorType: "DeliveryFinalizeConflict" });
    expect(ambiguousLedger.markEmailDeliveryFailed).not.toHaveBeenCalled();
  });
});
