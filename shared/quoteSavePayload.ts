const quoteSummaryOwnedFields = [
  "taxRate",
  "tariffRate",
  "discount",
  "shipping",
  "isShippingTaxable",
] as const;

type QuoteSummaryOwnedField = (typeof quoteSummaryOwnedFields)[number];

export function omitQuoteSummaryFields<T extends Record<string, unknown>>(
  data: T,
): Omit<T, QuoteSummaryOwnedField> {
  const payload = { ...data };

  for (const field of quoteSummaryOwnedFields) {
    delete payload[field];
  }

  return payload as Omit<T, QuoteSummaryOwnedField>;
}
