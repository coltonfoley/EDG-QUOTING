import { ApiError } from "@/lib/queryClient";

export const SIGNED_QUOTE_READ_ONLY_MESSAGE = "This customer-approved quote is read only. Create a new version to make changes.";

export function isSignedQuoteLockApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
    && error.statusCode === 409
    && error.details?.code === "QUOTE_SIGNED_LOCKED";
}
