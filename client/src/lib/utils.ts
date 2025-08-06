import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(num);
}

export function calculateLineItemTotal(
  quantity: number | string,
  unitPrice: number | string,
  markupType: string,
  markupValue: number | string
): number {
  const qty = typeof quantity === 'string' ? parseFloat(quantity) : quantity;
  const price = typeof unitPrice === 'string' ? parseFloat(unitPrice) : unitPrice;
  const markup = typeof markupValue === 'string' ? parseFloat(markupValue) : markupValue;

  const baseTotal = qty * price;
  
  if (markupType === 'percentage') {
    return baseTotal + (baseTotal * (markup / 100));
  } else {
    return baseTotal + markup;
  }
}

export function calculateLineItemMargin(
  quantity: number | string,
  unitPrice: number | string,
  markupType: string,
  markupValue: number | string
): number {
  const qty = typeof quantity === 'string' ? parseFloat(quantity) : quantity;
  const price = typeof unitPrice === 'string' ? parseFloat(unitPrice) : unitPrice;
  const markup = typeof markupValue === 'string' ? parseFloat(markupValue) : markupValue;

  const baseTotal = qty * price;
  
  if (markupType === 'percentage') {
    return baseTotal * (markup / 100);
  } else {
    return markup;
  }
}

export function calculateQuoteTotals(lineItems: any[], taxRate: number | string = 0, discount: number | string = 0) {
  const tax = typeof taxRate === 'string' ? parseFloat(taxRate) : taxRate;
  const disc = typeof discount === 'string' ? parseFloat(discount) : discount;

  const subtotal = lineItems.reduce((sum, item) => {
    return sum + calculateLineItemTotal(
      item.quantity,
      item.unitPrice,
      item.markupType,
      item.markupValue
    );
  }, 0);

  const baseCost = lineItems.reduce((sum, item) => {
    const qty = typeof item.quantity === 'string' ? parseFloat(item.quantity) : item.quantity;
    const price = typeof item.unitPrice === 'string' ? parseFloat(item.unitPrice) : item.unitPrice;
    return sum + (qty * price);
  }, 0);

  const totalMarkup = subtotal - baseCost;
  const discountAmount = disc > 0 ? (subtotal * (disc / 100)) : 0;
  const afterDiscount = subtotal - discountAmount;
  const taxAmount = afterDiscount * (tax / 100);
  const total = afterDiscount + taxAmount;
  const margin = baseCost > 0 ? ((totalMarkup / baseCost) * 100) : 0;

  return {
    subtotal,
    totalMarkup,
    discountAmount,
    taxAmount,
    total,
    margin: Math.round(margin * 10) / 10,
  };
}

export function generateQuoteNumber(): string {
  const year = new Date().getFullYear();
  const timestamp = Date.now().toString().slice(-6);
  return `QT-${year}-${timestamp}`;
}
