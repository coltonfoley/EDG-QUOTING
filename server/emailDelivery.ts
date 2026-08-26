export class EmailIdempotencyError extends Error {
  constructor(
    public readonly status: 400 | 409,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "EmailIdempotencyError";
  }
}

export function requireEmailIdempotencyKey(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new EmailIdempotencyError(
      400,
      "EMAIL_IDEMPOTENCY_KEY_REQUIRED",
      "This email action needs an idempotency key. Refresh Rainmaker and try again.",
    );
  }

  const key = value.trim();
  if (key.length < 8 || key.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
    throw new EmailIdempotencyError(
      400,
      "EMAIL_IDEMPOTENCY_KEY_INVALID",
      "The email idempotency key is invalid.",
    );
  }
  return key;
}

type DeliveryLedger = {
  claimEmailDelivery(input: {
    idempotencyKey: string;
    messageType: import("./storageContract").EmailDeliveryMessageType;
    quoteId?: number | null;
    planningAgreementId?: number | null;
  }): Promise<import("./storageContract").EmailDeliveryClaim>;
  markEmailDeliverySent(id: number, sentAt: Date, providerMessageId?: string | null): Promise<unknown>;
  markEmailDeliveryFailed(id: number, errorType: string): Promise<unknown>;
};

export type IdempotentEmailDeliveryResult = {
  outcome: "sent" | "replayed" | "in_progress" | "conflict" | "failed" | "pending_review";
  sentAt?: Date | null;
  providerMessageId?: string | null;
  errorType?: string;
};

export async function deliverIdempotentEmail(options: {
  ledger: DeliveryLedger;
  idempotencyKey: string;
  messageType: import("./storageContract").EmailDeliveryMessageType;
  quoteId?: number | null;
  planningAgreementId?: number | null;
  send: () => Promise<{ id?: string | null } | undefined>;
}): Promise<IdempotentEmailDeliveryResult> {
  const claim = await options.ledger.claimEmailDelivery({
    idempotencyKey: options.idempotencyKey,
    messageType: options.messageType,
    quoteId: options.quoteId ?? null,
    planningAgreementId: options.planningAgreementId ?? null,
  });

  if (claim.outcome === "conflict") return { outcome: "conflict" };
  if (claim.outcome === "in_progress") return { outcome: "in_progress" };
  if (claim.outcome === "sent") {
    return {
      outcome: "replayed",
      sentAt: claim.attempt?.sentAt ?? null,
      ...(claim.attempt?.providerMessageId
        ? { providerMessageId: claim.attempt.providerMessageId }
        : {}),
    };
  }
  if (!claim.attempt) return { outcome: "pending_review", errorType: "MissingDeliveryAttempt" };

  let providerResult: { id?: string | null } | undefined;
  try {
    providerResult = await options.send();
  } catch (error) {
    const errorType = error instanceof Error ? error.name : "UnknownError";
    try {
      await options.ledger.markEmailDeliveryFailed(claim.attempt.id, errorType);
    } catch {
      return { outcome: "pending_review", errorType };
    }
    return { outcome: "failed", errorType };
  }

  const sentAt = new Date();
  try {
    const finalized = await options.ledger.markEmailDeliverySent(
      claim.attempt.id,
      sentAt,
      providerResult?.id ?? null,
    );
    if (!finalized) return { outcome: "pending_review", errorType: "DeliveryFinalizeConflict" };
  } catch (error) {
    return {
      outcome: "pending_review",
      errorType: error instanceof Error ? error.name : "UnknownError",
    };
  }

  return {
    outcome: "sent",
    sentAt,
    ...(providerResult?.id ? { providerMessageId: providerResult.id } : {}),
  };
}
