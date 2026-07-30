import { businessEvents, type BusinessEvent } from "@shared/schema";

export const businessEventTypes = [
  "customer_package_prepared",
  "quote_customer_signed",
  "quote_company_signed",
  "lead_converted_to_quote",
  "quote_import_completed",
  "dimensional_price_resolved",
  "product_catalog_import_completed",
  "sundance_configuration_inserted",
  "lead_assessed_fit",
  "lead_assessed_not_fit",
] as const;

export type BusinessEventType = typeof businessEventTypes[number];

export type BusinessEventInput = {
  eventType: BusinessEventType;
  eventKey?: string | null;
  quoteId?: number | null;
  accountId?: number | null;
  inquiryId?: number | null;
  productId?: number | null;
  actorUserId?: number | null;
  occurredAt?: Date;
};

type EventExecutor = {
  insert: (table: typeof businessEvents) => any;
};

export async function appendBusinessEvent(
  executor: EventExecutor,
  input: BusinessEventInput,
): Promise<BusinessEvent | undefined> {
  const insert = executor
    .insert(businessEvents)
    .values({
      eventKey: input.eventKey ?? null,
      eventType: input.eventType,
      quoteId: input.quoteId ?? null,
      accountId: input.accountId ?? null,
      inquiryId: input.inquiryId ?? null,
      productId: input.productId ?? null,
      actorUserId: input.actorUserId ?? null,
      occurredAt: input.occurredAt ?? new Date(),
    });

  const [event] = input.eventKey
    ? await insert.onConflictDoNothing({ target: businessEvents.eventKey }).returning()
    : await insert.returning();
  return event;
}
