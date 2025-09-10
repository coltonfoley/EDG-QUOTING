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
  markupValue: number | string,
  discountType: string = "percentage",
  discountValue: number | string = 0
): number {
  const qty = typeof quantity === 'string' ? parseFloat(quantity) : quantity;
  const price = typeof unitPrice === 'string' ? parseFloat(unitPrice) : unitPrice;
  const markup = typeof markupValue === 'string' ? parseFloat(markupValue) : markupValue;
  const discount = typeof discountValue === 'string' ? parseFloat(discountValue) : discountValue;

  const baseTotal = qty * price;
  
  // Apply manufacturer discount first
  let afterDiscount = baseTotal;
  if (discount > 0) {
    if (discountType === 'percentage') {
      afterDiscount = baseTotal - (baseTotal * (discount / 100));
    } else {
      afterDiscount = baseTotal - discount;
    }
  }
  
  // Then apply markup to the discounted amount
  if (markupType === 'percentage') {
    return afterDiscount + (afterDiscount * (markup / 100));
  } else {
    return afterDiscount + markup;
  }
}

export function calculateLineItemMargin(
  quantity: number | string,
  unitPrice: number | string,
  markupType: string,
  markupValue: number | string,
  discountType: string = "percentage",
  discountValue: number | string = 0
): number {
  const qty = typeof quantity === 'string' ? parseFloat(quantity) : quantity;
  const price = typeof unitPrice === 'string' ? parseFloat(unitPrice) : unitPrice;
  const markup = typeof markupValue === 'string' ? parseFloat(markupValue) : markupValue;
  const discount = typeof discountValue === 'string' ? parseFloat(discountValue) : discountValue;

  const baseTotal = qty * price;
  
  // Apply manufacturer discount first
  let afterDiscount = baseTotal;
  if (discount > 0) {
    if (discountType === 'percentage') {
      afterDiscount = baseTotal - (baseTotal * (discount / 100));
    } else {
      afterDiscount = baseTotal - discount;
    }
  }
  
  // Calculate markup on the discounted amount
  if (markupType === 'percentage') {
    return afterDiscount * (markup / 100);
  } else {
    return markup;
  }
}

export function calculateQuoteTotals(lineItems: any[], taxRate: number | string = 0, discount: number | string = 0, shipping: number | string = 0) {
  const tax = typeof taxRate === 'string' ? parseFloat(taxRate) : taxRate;
  const disc = typeof discount === 'string' ? parseFloat(discount) : discount;
  const shippingAmount = typeof shipping === 'string' ? parseFloat(shipping) : shipping;

  const subtotal = lineItems.reduce((sum, item) => {
    return sum + calculateLineItemTotal(
      item.quantity,
      item.unitPrice,
      item.markupType,
      item.markupValue,
      item.discountType || "percentage",
      item.discountValue || 0
    );
  }, 0);

  const baseCost = lineItems.reduce((sum, item) => {
    const qty = typeof item.quantity === 'string' ? parseFloat(item.quantity) : item.quantity;
    const price = typeof item.unitPrice === 'string' ? parseFloat(item.unitPrice) : item.unitPrice;
    return sum + (qty * price);
  }, 0);

  // Calculate total manufacturer discounts for display purposes
  const totalManufacturerDiscount = lineItems.reduce((sum, item) => {
    const qty = typeof item.quantity === 'string' ? parseFloat(item.quantity) : item.quantity;
    const price = typeof item.unitPrice === 'string' ? parseFloat(item.unitPrice) : item.unitPrice;
    const discountValue = typeof item.discountValue === 'string' ? parseFloat(item.discountValue) : item.discountValue || 0;
    const discountType = item.discountType || "percentage";
    
    const lineBaseTotal = qty * price;
    
    if (discountValue > 0) {
      if (discountType === 'percentage') {
        return sum + (lineBaseTotal * (discountValue / 100));
      } else {
        return sum + discountValue;
      }
    }
    return sum;
  }, 0);

  const totalMarkup = subtotal - baseCost + totalManufacturerDiscount;
  const discountAmount = disc > 0 ? (subtotal * (disc / 100)) : 0;
  const afterDiscount = subtotal - discountAmount;
  const beforeTax = afterDiscount + shippingAmount;
  const taxAmount = beforeTax * (tax / 100);
  const total = beforeTax + taxAmount;
  const margin = baseCost > 0 ? ((totalMarkup / baseCost) * 100) : 0;

  return {
    subtotal,
    totalMarkup,
    totalManufacturerDiscount,
    discountAmount,
    shippingAmount,
    taxAmount,
    total,
    margin: Math.round(margin * 10) / 10,
  };
}

export function applyDiscountToPrice(
  price: number | string,
  discountType: string,
  discountValue: number | string
): number {
  const unitPrice = typeof price === 'string' ? parseFloat(price) : price;
  const discount = typeof discountValue === 'string' ? parseFloat(discountValue) : discountValue;

  if (discount <= 0) {
    return unitPrice;
  }

  if (discountType === 'percentage') {
    return unitPrice - (unitPrice * (discount / 100));
  } else {
    return unitPrice - discount;
  }
}

export function generateQuoteNumber(): string {
  const year = new Date().getFullYear();
  const timestamp = Date.now().toString().slice(-6);
  return `QT-${year}-${timestamp}`;
}
