import { getDealerPortalFrozenPrice, type FrozenCatalogPriceEvidence } from "@shared/pricing";

export type QuoteValueLineItem = FrozenCatalogPriceEvidence & {
  quantity: number | string;
  unitPrice: number | string;
  markupType: string;
  markupValue: number | string;
};

export function calculateLineItemsValue(lineItems: QuoteValueLineItem[]): number {
  return lineItems.reduce((sum: number, item: QuoteValueLineItem) => {
    const frozenPrice = getDealerPortalFrozenPrice(item, item.quantity);
    if (frozenPrice) return sum + frozenPrice.lineTotal;
    const qty = parseFloat(item.quantity.toString());
    const price = parseFloat(item.unitPrice.toString());
    const markup = parseFloat(item.markupValue.toString());
    const baseTotal = qty * price;
    const total = item.markupType === "percentage"
      ? baseTotal + baseTotal * (markup / 100)
      : baseTotal + markup;

    return sum + total;
  }, 0);
}
