import { describe, expect, it, vi } from "vitest";
import { deliverQuoteSignatureConfirmation } from "../quoteSignatureConfirmation";

describe("quote signature confirmation service", () => {
  it("uses the signed-document key and escapes customer-facing HTML", async () => {
    const ledger = {
      claimEmailDelivery: vi.fn().mockResolvedValue({ outcome: "claimed", attempt: { id: 7 } }),
      markEmailDeliverySent: vi.fn().mockResolvedValue({ id: 7, status: "sent" }),
      markEmailDeliveryFailed: vi.fn(),
    };
    const send = vi.fn().mockResolvedValue({ id: "provider-id" });
    const fingerprint = "c".repeat(64);

    const result = await deliverQuoteSignatureConfirmation({
      ledger,
      quote: { id: 123, quoteNumber: "Q<&123", projectName: "Patio <script>alert(1)</script>" },
      recipient: "fixture@example.invalid",
      customerName: "Avery <Example>",
      signedAt: new Date("2026-07-10T12:00:00.000Z"),
      documentFingerprint: fingerprint,
      downloadUrl: "https://example.invalid/sign/token?x=1&y=2",
      replacement: true,
      send,
    });

    expect(result.outcome).toBe("sent");
    expect(ledger.claimEmailDelivery).toHaveBeenCalledWith({
      idempotencyKey: `quote-signature-confirmation:123:${fingerprint}`,
      messageType: "quote_signature_confirmation",
      quoteId: 123,
      planningAgreementId: null,
    });
    const message = send.mock.calls[0][0];
    expect(message.to).toBe("fixture@example.invalid");
    expect(message.htmlBody).toContain("Avery &lt;Example&gt;");
    expect(message.htmlBody).toContain("Patio &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(message.htmlBody).toContain("x=1&amp;y=2");
    expect(message.htmlBody).toContain("replacement receipt");
    expect(message.htmlBody).not.toContain("<script>alert(1)</script>");
  });

  it("reuses accepted evidence without calling the provider", async () => {
    const sentAt = new Date("2026-07-10T12:01:00.000Z");
    const ledger = {
      claimEmailDelivery: vi.fn().mockResolvedValue({ outcome: "sent", attempt: { id: 7, sentAt } }),
      markEmailDeliverySent: vi.fn(),
      markEmailDeliveryFailed: vi.fn(),
    };
    const send = vi.fn();

    const result = await deliverQuoteSignatureConfirmation({
      ledger,
      quote: { id: 123, quoteNumber: "TEST-123", projectName: "Fictional project" },
      recipient: "fixture@example.invalid",
      customerName: "Fictional Customer",
      signedAt: new Date("2026-07-10T12:00:00.000Z"),
      documentFingerprint: "d".repeat(64),
      downloadUrl: "https://example.invalid/sign/token",
      send,
    });

    expect(result).toEqual({ outcome: "replayed", sentAt });
    expect(send).not.toHaveBeenCalled();
  });
});
