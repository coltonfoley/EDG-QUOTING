const uuidV4Pattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const edgFallbackPattern = /^edg-[a-z]{24}$/;

export function isOpaqueLeadSubmissionId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    (uuidV4Pattern.test(value) || edgFallbackPattern.test(value))
  );
}

export class LeadIntakeIdempotencyError extends Error {
  constructor(
    public readonly status: 400 | 409 | 500,
    message: string
  ) {
    super(message);
    this.name = "LeadIntakeIdempotencyError";
  }
}

function cleanKey(value: unknown) {
  if (typeof value !== "string") return undefined;
  const key = value.trim();
  return key || undefined;
}

export function resolveLeadIntakeSubmissionId({
  headerValue,
  bodyValue,
  metadataValue,
}: {
  headerValue?: string | string[];
  bodyValue?: unknown;
  metadataValue?: unknown;
}) {
  const metadataSubmissionId =
    metadataValue && typeof metadataValue === "object"
      ? cleanKey((metadataValue as Record<string, unknown>).submission_id)
      : undefined;
  const values = [
    cleanKey(Array.isArray(headerValue) ? headerValue[0] : headerValue),
    cleanKey(bodyValue),
    metadataSubmissionId,
  ].filter((value): value is string => Boolean(value));
  const uniqueValues = [...new Set(values)];

  if (uniqueValues.some((value) => value.length > 160)) {
    throw new LeadIntakeIdempotencyError(
      400,
      "Idempotency key must be 160 characters or fewer"
    );
  }

  if (uniqueValues.length > 1) {
    throw new LeadIntakeIdempotencyError(
      400,
      "Idempotency key does not match the submitted lead"
    );
  }

  if (uniqueValues.some((value) => !isOpaqueLeadSubmissionId(value))) {
    throw new LeadIntakeIdempotencyError(
      400,
      "Submission ID must be an opaque EDG-generated identifier"
    );
  }

  return uniqueValues[0];
}
