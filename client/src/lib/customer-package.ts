import type { QuoteWithDetails } from '@shared/schema';

export function getSnapshotBackedCustomerPackage(quote: QuoteWithDetails): QuoteWithDetails {
  const snapshot = quote.signedDocumentSnapshot;
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return quote;

  const frozen = snapshot as Record<string, any>;
  return {
    ...frozen,
    id: frozen.id ?? quote.id,
    quoteNumber: frozen.quoteNumber ?? quote.quoteNumber,
    projectName: frozen.projectName ?? quote.projectName,
    lineItems: Array.isArray(frozen.lineItems) ? frozen.lineItems : [],
    groups: Array.isArray(frozen.groups) ? frozen.groups : [],
    productRenderings: Array.isArray(frozen.productRenderings) ? frozen.productRenderings : [],
    coverPhoto: frozen.coverPhoto,
    clientSignatureData: quote.clientSignatureData,
    clientSignedAt: quote.clientSignedAt,
    clientSignedIp: quote.clientSignedIp,
    companySignatureData: quote.companySignatureData,
    companySignedAt: quote.companySignedAt,
    companySignedIp: quote.companySignedIp,
    signatureAuditTrail: quote.signatureAuditTrail,
    signedDocumentSnapshot: snapshot,
  } as QuoteWithDetails;
}

export function getSnapshotBackedStaffQuote(quote: QuoteWithDetails): QuoteWithDetails {
  const frozen = getSnapshotBackedCustomerPackage(quote);
  if (frozen === quote) return quote;

  return {
    ...frozen,
    id: quote.id,
    dealStage: quote.dealStage,
    lostReason: quote.lostReason,
    enableESignature: quote.enableESignature,
    signingToken: quote.signingToken,
    signatureEmailSentAt: quote.signatureEmailSentAt,
    signatureEmailMessage: quote.signatureEmailMessage,
    parentQuoteId: quote.parentQuoteId,
    versionNumber: quote.versionNumber,
    isLatestVersion: quote.isLatestVersion,
    createdAt: quote.createdAt,
    updatedAt: quote.updatedAt,
  } as QuoteWithDetails;
}
