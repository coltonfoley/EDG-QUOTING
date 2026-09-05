/** Reserved portal service SKUs. Native Rainmaker line items require known costs. */
export const PORTAL_ONLY_SUNDANCE_SERVICE_SKUS = [
  "EDG-SD-DRAWINGS",
  "EDG-SD-ENGINEERING",
  "EDG-SD-DRAWINGS-ENGINEERING",
] as const;

export const SUNDANCE_SERVICE_QUOTE_REVIEW_MESSAGE = "Request Sundance drawing and engineering services through the contractor portal. Internal costs and service fulfillment need review before these services can become Rainmaker quote line items.";

export function isPortalOnlySundanceService(sku: string | null | undefined): boolean {
  return PORTAL_ONLY_SUNDANCE_SERVICE_SKUS.some(serviceSku => serviceSku.toLowerCase() === sku?.trim().toLowerCase());
}

export class SundanceServiceQuoteReviewError extends Error {
  readonly code = "SUNDANCE_SERVICE_REVIEW_REQUIRED";
  constructor() {
    super(SUNDANCE_SERVICE_QUOTE_REVIEW_MESSAGE);
    this.name = "SundanceServiceQuoteReviewError";
  }
}

export function assertNativeQuoteSkuSupported(sku: string | null | undefined): void {
  if (isPortalOnlySundanceService(sku)) throw new SundanceServiceQuoteReviewError();
}
