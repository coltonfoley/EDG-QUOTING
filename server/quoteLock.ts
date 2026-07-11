import type { InsertQuote, Quote } from "@shared/schema";

export const QUOTE_SIGNED_LOCK_CODE = "QUOTE_SIGNED_LOCKED";
export const QUOTE_SIGNED_LOCK_MESSAGE = "This customer-approved quote is read-only. Create a new version to make changes.";

export type QuoteMutationKind =
  | "commercial"
  | "pipeline_stage"
  | "signature_email"
  | "package_preparation"
  | "customer_signature"
  | "company_signature";

export type QuoteUpdateOptions = {
  mutationKind?: QuoteMutationKind;
  expectedUpdatedAt?: Date | string | null;
  actorUserId?: number | null;
};

type QuoteApprovalEvidence = Pick<
  Quote,
  "id" | "clientSignedAt" | "clientSignatureData" | "signedDocumentSnapshot"
>;

const transitionFields: Record<Exclude<QuoteMutationKind, "commercial">, ReadonlySet<string>> = {
  pipeline_stage: new Set(["dealStage", "lostReason"]),
  signature_email: new Set(["signatureEmailSentAt", "signatureEmailMessage"]),
  package_preparation: new Set([
    "enableESignature",
    "signingToken",
    "esigIncludePricing",
    "esigIncludeImages",
    "esigIncludeContract",
    "esigIncludeApprovalDrawing",
  ]),
  customer_signature: new Set([
    "clientSignatureData",
    "clientSignedAt",
    "clientSignedIp",
    "signedDocumentSnapshot",
    "signatureAuditTrail",
  ]),
  company_signature: new Set([
    "companySignatureData",
    "companySignedAt",
    "companySignedIp",
    "signatureAuditTrail",
  ]),
};

export class QuoteSignedLockedError extends Error {
  readonly code = QUOTE_SIGNED_LOCK_CODE;
  readonly status = 409;
  readonly quoteId: number;

  constructor(quoteId: number) {
    super(QUOTE_SIGNED_LOCK_MESSAGE);
    this.name = "QuoteSignedLockedError";
    this.quoteId = quoteId;
  }
}

export class InvalidQuoteTransitionMutationError extends Error {
  readonly code = "QUOTE_TRANSITION_FIELDS_INVALID";

  constructor(kind: Exclude<QuoteMutationKind, "commercial">, invalidFields: string[]) {
    super(`The ${kind} transition cannot change: ${invalidFields.join(", ")}`);
    this.name = "InvalidQuoteTransitionMutationError";
  }
}

export class QuoteChangedBeforeSignatureError extends Error {
  readonly code = "QUOTE_CHANGED_BEFORE_SIGNATURE";
  readonly status = 409;
  readonly quoteId: number;

  constructor(quoteId: number) {
    super("This quote changed after it was opened for approval. Refresh and review the latest version before signing.");
    this.name = "QuoteChangedBeforeSignatureError";
    this.quoteId = quoteId;
  }
}

export function isCustomerApprovedQuote(quote: QuoteApprovalEvidence): boolean {
  return Boolean(
    quote.clientSignedAt
    || quote.clientSignatureData
    || quote.signedDocumentSnapshot
  );
}

export function assertQuoteMutationAllowed(
  quote: QuoteApprovalEvidence,
  update: Partial<InsertQuote> = {},
  kind: QuoteMutationKind = "commercial",
): void {
  if (kind !== "commercial") {
    const allowedFields = transitionFields[kind];
    const invalidFields = Object.keys(update).filter(
      (field) => !allowedFields.has(field),
    );
    if (invalidFields.length > 0) {
      throw new InvalidQuoteTransitionMutationError(kind, invalidFields);
    }
  }

  const mayMutateApprovedQuote = kind === "pipeline_stage" || kind === "company_signature";
  if (isCustomerApprovedQuote(quote) && !mayMutateApprovedQuote) {
    throw new QuoteSignedLockedError(quote.id);
  }
}

export function isQuoteSignedLockedError(error: unknown): error is QuoteSignedLockedError {
  return error instanceof QuoteSignedLockedError
    || Boolean(
      error
      && typeof error === "object"
      && "code" in error
      && error.code === QUOTE_SIGNED_LOCK_CODE,
    );
}

export function sendQuoteSignedLockResponse(
  response: { status(code: number): { json(body: unknown): unknown } },
  error: unknown,
): boolean {
  if (!isQuoteSignedLockedError(error)) return false;
  response.status(409).json({
    message: QUOTE_SIGNED_LOCK_MESSAGE,
    code: QUOTE_SIGNED_LOCK_CODE,
  });
  return true;
}

export function sendQuoteChangedBeforeSignatureResponse(
  response: { status(code: number): { json(body: unknown): unknown } },
  error: unknown,
): boolean {
  const isExpectedConflict = error instanceof QuoteChangedBeforeSignatureError
    || Boolean(
      error
      && typeof error === "object"
      && "code" in error
      && error.code === "QUOTE_CHANGED_BEFORE_SIGNATURE",
    );
  if (!isExpectedConflict) return false;
  response.status(409).json({
    message: "This quote changed after it was opened for approval. Refresh and review the latest version before signing.",
    code: "QUOTE_CHANGED_BEFORE_SIGNATURE",
  });
  return true;
}

export function assertQuoteSignatureRevision(
  quote: Pick<Quote, "id" | "updatedAt">,
  expectedUpdatedAt: Date | string | null | undefined,
): void {
  if (expectedUpdatedAt === undefined) return;
  const actualTime = quote.updatedAt ? new Date(quote.updatedAt).getTime() : null;
  const expectedTime = expectedUpdatedAt ? new Date(expectedUpdatedAt).getTime() : null;
  if (actualTime !== expectedTime) {
    throw new QuoteChangedBeforeSignatureError(quote.id);
  }
}
