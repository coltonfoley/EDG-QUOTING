export function frozenLine(cost = "60.00", quantity = 2, unitCents = 5000) {
  return {
    quantity: String(quantity), unitPrice: cost, markupType: "percentage", markupValue: "100",
    discountType: "percentage", discountValue: "0", isTaxable: true, isTariffApplicable: false,
    retailPrice: (unitCents / 100).toFixed(2), priceSource: "dealer_portal_frozen_catalog",
    sourceMetadata: {
      portalOrderId: "109566de-79ce-4f46-825d-2e24bdb5b89e", snapshotHash: "a".repeat(64), rulesVersion: "2026-08-25.3",
      customerUnitPriceCents: unitCents, customerLineTotalCents: quantity * unitCents,
    },
  };
}

