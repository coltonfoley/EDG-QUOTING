import { deliverIdempotentEmail, type IdempotentEmailDeliveryResult } from "./emailDelivery";
import type { IStorage } from "./storageContract";

type ConfirmationQuote = {
  id: number;
  quoteNumber?: string | null;
  projectName?: string | null;
};

type ConfirmationSender = (message: {
  to: string;
  subject: string;
  htmlBody: string;
}) => Promise<{ id?: string | null } | undefined>;

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function deliverQuoteSignatureConfirmation(options: {
  ledger: Pick<IStorage, "claimEmailDelivery" | "markEmailDeliverySent" | "markEmailDeliveryFailed">;
  quote: ConfirmationQuote;
  recipient: string;
  customerName: string;
  signedAt: Date;
  documentFingerprint: string;
  downloadUrl: string;
  replacement?: boolean;
  send?: ConfirmationSender;
}): Promise<IdempotentEmailDeliveryResult> {
  const projectLabel = options.quote.projectName || `Quote #${options.quote.quoteNumber || options.quote.id}`;
  const subjectProjectLabel = String(projectLabel).replace(/[\r\n]+/g, " ").trim();
  const safeCustomerName = escapeHtml(options.customerName || "Client");
  const safeProjectLabel = escapeHtml(projectLabel);
  const safeQuoteNumber = escapeHtml(options.quote.quoteNumber || options.quote.id);
  const safeSignedDate = escapeHtml(options.signedAt.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }));
  const safeDownloadUrl = escapeHtml(options.downloadUrl);
  const safeDocumentId = escapeHtml(options.documentFingerprint.slice(0, 16));
  const receiptLead = options.replacement
    ? `This replacement receipt confirms that your electronic signature was recorded for ${safeProjectLabel}.`
    : "Thank you for signing your quote. This email confirms that your electronic signature has been successfully recorded.";
  const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Signature Confirmation</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
      <div style="background-color: #059669; border-radius: 8px 8px 0 0; padding: 30px; text-align: center;">
        <div style="display: inline-block; width: 60px; height: 60px; margin-bottom: 15px; background-color: rgba(255,255,255,0.2); border-radius: 50%; line-height: 60px; font-size: 30px;">✓</div>
        <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Document Signed Successfully</h1>
      </div>
      <div style="background-color: #ffffff; border: 1px solid #e5e7eb; border-top: none; padding: 30px; margin-bottom: 20px;">
        <p style="color: #1a1a1a; margin-top: 0;">Hello ${safeCustomerName},</p>
        <p style="color: #4b5563;">${receiptLead}</p>
        <div style="background-color: #f3f4f6; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Document:</strong> ${safeProjectLabel}</p>
          <p style="margin: 5px 0;"><strong>Quote Number:</strong> #${safeQuoteNumber}</p>
          <p style="margin: 5px 0;"><strong>Signed On:</strong> ${safeSignedDate}</p>
          <p style="margin: 5px 0;"><strong>Signed By:</strong> ${safeCustomerName}</p>
          <p style="margin: 5px 0;"><strong>Document ID:</strong> ${safeDocumentId}</p>
        </div>
        <div style="text-align: center; margin: 25px 0;">
          <a href="${safeDownloadUrl}" style="display: inline-block; background-color: #000000; color: #ffffff; text-decoration: none; padding: 14px 30px; border-radius: 6px; font-weight: 600; font-size: 14px;">Download Signed Document</a>
        </div>
        <p style="color: #6b7280; font-size: 13px; text-align: center;">You can access your signed document at any time using the link above.</p>
      </div>
      <div style="text-align: center; color: #6b7280; font-size: 12px; padding-top: 20px;">
        <p style="margin: 5px 0; font-weight: 600; color: #1a1a1a;">EDG Patio & Shade</p>
        <p style="margin: 5px 0;">1802 Holian Drive, Spring Grove, IL 60081</p>
        <p style="margin: 5px 0;">Phone: +1 (815) 581-0138 | Email: info@edgpatioshade.com</p>
        <p style="margin: 15px 0 5px 0; font-size: 11px; color: #9ca3af;">This is an automated confirmation. Please do not reply to this email.</p>
      </div>
    </body>
    </html>
  `;
  const send: ConfirmationSender = options.send ?? (async (message) => {
    const { sendEmail } = await import("./email");
    return sendEmail(message);
  });

  return deliverIdempotentEmail({
    ledger: options.ledger,
    idempotencyKey: `quote-signature-confirmation:${options.quote.id}:${options.documentFingerprint}`,
    messageType: "quote_signature_confirmation",
    quoteId: options.quote.id,
    send: () => send({
      to: options.recipient,
      subject: `Signature Confirmed: ${subjectProjectLabel}`,
      htmlBody,
    }),
  });
}
