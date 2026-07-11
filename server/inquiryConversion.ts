import { eq } from "drizzle-orm";
import { accounts, leadInquiries, quotes, type InsertQuote } from "@shared/schema";
import { db } from "./db";
import { appendBusinessEvent } from "./businessEvents";

export class InquiryConversionError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 409) {
    super(message);
    this.name = "InquiryConversionError";
    this.code = code;
    this.status = status;
  }
}

export async function createQuoteFromInquiry(
  quoteData: InsertQuote & { sourceInquiryId: number },
  actorUserId?: number,
) {
  return db.transaction(async (tx) => {
    const [inquiry] = await tx
      .select()
      .from(leadInquiries)
      .where(eq(leadInquiries.id, quoteData.sourceInquiryId))
      .for("update");

    if (!inquiry) {
      throw new InquiryConversionError("INQUIRY_NOT_FOUND", "The source inquiry no longer exists.", 404);
    }
    if (inquiry.convertedQuoteId) {
      throw new InquiryConversionError(
        "INQUIRY_ALREADY_CONVERTED",
        "This inquiry already has a quote. Open the existing quote instead.",
        409,
      );
    }
    if (quoteData.accountId && quoteData.accountId !== inquiry.accountId) {
      throw new InquiryConversionError(
        "INQUIRY_ACCOUNT_MISMATCH",
        "The selected client does not match the source inquiry.",
        409,
      );
    }

    const [quote] = await tx
      .insert(quotes)
      .values({
        ...quoteData,
        accountId: inquiry.accountId,
        sourceInquiryId: inquiry.id,
      })
      .returning();

    const convertedAt = new Date();
    await tx
      .update(leadInquiries)
      .set({
        status: "converted",
        convertedAt,
        convertedQuoteId: quote.id,
        convertedBy: actorUserId,
        updatedAt: convertedAt,
      })
      .where(eq(leadInquiries.id, inquiry.id));

    // Compatibility fields remain readable for older account-level lead views.
    await tx
      .update(accounts)
      .set({ leadStatus: "converted", leadConvertedAt: convertedAt, updatedAt: convertedAt })
      .where(eq(accounts.id, inquiry.accountId));

    await appendBusinessEvent(tx, {
      eventType: "lead_converted_to_quote",
      eventKey: `lead_converted_to_quote:${inquiry.id}:${quote.id}`,
      quoteId: quote.id,
      accountId: inquiry.accountId,
      inquiryId: inquiry.id,
      actorUserId,
      occurredAt: convertedAt,
    });

    return quote;
  });
}
