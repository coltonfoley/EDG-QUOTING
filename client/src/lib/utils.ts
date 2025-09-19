import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Safe math operations with overflow protection
export function safeAdd(a: number, b: number): number {
  const result = a + b;
  if (!isFinite(result)) return Number.MAX_SAFE_INTEGER;
  return result;
}

export function safeMultiply(a: number, b: number): number {
  const result = a * b;
  if (!isFinite(result)) return Number.MAX_SAFE_INTEGER;
  return result;
}

export function safeDivide(a: number, b: number): number {
  if (b === 0) return 0;
  const result = a / b;
  if (!isFinite(result)) return 0;
  return result;
}

// Round to 2 decimal places for currency
export function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

// Validate numeric input
export function isValidNumber(value: any): boolean {
  if (value === null || value === undefined || value === '') return false;
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return !isNaN(num) && isFinite(num) && num >= 0;
}

// Clamp value between min and max
export function clampValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function formatCurrency(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(num);
}


/**
 * Calculates the total price for a line item with proper order of operations.
 * 
 * Order of Operations:
 * 1. Calculate base total: quantity × unitPrice
 * 2. Apply manufacturer discount (if any) to the base total
 *    - Percentage: baseTotal - (baseTotal × discount%)
 *    - Fixed: baseTotal - discountAmount
 * 3. Apply markup to the discounted amount
 *    - Percentage: discountedTotal + (discountedTotal × markup%)
 *    - Fixed: discountedTotal + markupAmount
 * 
 * This order ensures:
 * - Manufacturer discounts are applied to the original price
 * - Markup is calculated on the discounted cost (actual cost to reseller)
 * - All values are clamped to safe ranges to prevent overflow
 * - Final result is rounded to 2 decimal places for currency
 * 
 * @param quantity - Number of items (0.01 to 999,999)
 * @param unitPrice - Price per item (0 to 10,000,000)
 * @param markupType - "percentage" or "dollar"
 * @param markupValue - Markup amount (0 to 1000)
 * @param discountType - "percentage" or "dollar" for manufacturer discount
 * @param discountValue - Manufacturer discount amount
 * @returns Total price rounded to 2 decimal places
 */
export function calculateLineItemTotal(
  quantity: number | string,
  unitPrice: number | string,
  markupType: string,
  markupValue: number | string,
  discountType: string = "percentage",
  discountValue: number | string = 0
): number {
  // Safely parse and validate inputs
  const qty = typeof quantity === 'string' ? parseFloat(quantity) : quantity;
  const price = typeof unitPrice === 'string' ? parseFloat(unitPrice) : unitPrice;
  const markup = typeof markupValue === 'string' ? parseFloat(markupValue) : markupValue;
  const discount = typeof discountValue === 'string' ? parseFloat(discountValue) : discountValue;

  // Validate inputs
  if (!isValidNumber(qty) || qty <= 0 || qty > 999999) return 0;
  if (!isValidNumber(price) || price < 0 || price > 10000000) return 0;
  if (!isValidNumber(markup) || markup < 0 || markup > 1000) return 0;
  if (!isValidNumber(discount) || discount < 0) return 0;

  // Clamp values to safe ranges
  const safeQty = clampValue(qty, 0.01, 999999);
  const safePrice = clampValue(price, 0, 10000000);
  const safeMarkup = clampValue(markup, 0, 1000);
  const safeDiscount = discountType === 'percentage' 
    ? clampValue(discount, 0, 100)
    : clampValue(discount, 0, 10000000);

  // Calculate base total with overflow protection
  const baseTotal = safeMultiply(safeQty, safePrice);
  
  // Apply manufacturer discount first
  let afterDiscount = baseTotal;
  if (safeDiscount > 0) {
    if (discountType === 'percentage') {
      const discountAmount = safeMultiply(baseTotal, safeDivide(safeDiscount, 100));
      afterDiscount = Math.max(0, baseTotal - discountAmount);
    } else {
      afterDiscount = Math.max(0, baseTotal - safeDiscount);
    }
  }
  
  // Then apply markup to the discounted amount
  let finalTotal = afterDiscount;
  if (markupType === 'percentage') {
    const markupAmount = safeMultiply(afterDiscount, safeDivide(safeMarkup, 100));
    finalTotal = safeAdd(afterDiscount, markupAmount);
  } else {
    finalTotal = safeAdd(afterDiscount, safeMarkup);
  }

  return roundCurrency(finalTotal);
}

/**
 * Calculates the margin (profit) for a line item.
 * 
 * Margin Calculation:
 * - Applies manufacturer discount to base cost first
 * - Calculates markup amount on the discounted cost
 * - Returns the markup amount as the margin
 * 
 * This ensures margin reflects actual profit after manufacturer discounts.
 * 
 * @param quantity - Number of items
 * @param unitPrice - Price per item
 * @param markupType - "percentage" or "dollar"
 * @param markupValue - Markup amount
 * @param discountType - Manufacturer discount type
 * @param discountValue - Manufacturer discount amount
 * @returns Margin amount rounded to 2 decimal places
 */
export function calculateLineItemMargin(
  quantity: number | string,
  unitPrice: number | string,
  markupType: string,
  markupValue: number | string,
  discountType: string = "percentage",
  discountValue: number | string = 0
): number {
  // Safely parse and validate inputs
  const qty = typeof quantity === 'string' ? parseFloat(quantity) : quantity;
  const price = typeof unitPrice === 'string' ? parseFloat(unitPrice) : unitPrice;
  const markup = typeof markupValue === 'string' ? parseFloat(markupValue) : markupValue;
  const discount = typeof discountValue === 'string' ? parseFloat(discountValue) : discountValue;

  // Validate inputs
  if (!isValidNumber(qty) || qty <= 0 || qty > 999999) return 0;
  if (!isValidNumber(price) || price < 0 || price > 10000000) return 0;
  if (!isValidNumber(markup) || markup < 0 || markup > 1000) return 0;
  if (!isValidNumber(discount) || discount < 0) return 0;

  // Clamp values to safe ranges
  const safeQty = clampValue(qty, 0.01, 999999);
  const safePrice = clampValue(price, 0, 10000000);
  const safeMarkup = clampValue(markup, 0, 1000);
  const safeDiscount = discountType === 'percentage' 
    ? clampValue(discount, 0, 100)
    : clampValue(discount, 0, 10000000);

  // Calculate base total with overflow protection
  const baseTotal = safeMultiply(safeQty, safePrice);
  
  // Apply manufacturer discount first
  let afterDiscount = baseTotal;
  if (safeDiscount > 0) {
    if (discountType === 'percentage') {
      const discountAmount = safeMultiply(baseTotal, safeDivide(safeDiscount, 100));
      afterDiscount = Math.max(0, baseTotal - discountAmount);
    } else {
      afterDiscount = Math.max(0, baseTotal - safeDiscount);
    }
  }
  
  // Calculate markup on the discounted amount
  let marginAmount = 0;
  if (markupType === 'percentage') {
    marginAmount = safeMultiply(afterDiscount, safeDivide(safeMarkup, 100));
  } else {
    marginAmount = safeMarkup;
  }

  return roundCurrency(marginAmount);
}

/**
 * Calculates all totals for a quote with proper order of operations.
 * 
 * Order of Operations:
 * 1. Calculate subtotal: sum of all line items (with their individual markups/discounts)
 * 2. Apply quote-level discount to subtotal
 * 3. Add shipping costs
 * 4. Calculate tax on (discounted subtotal + shipping)
 * 5. Calculate final total: discounted subtotal + shipping + tax
 * 
 * Business Rules:
 * - Tax is calculated on the total taxable amount (after discount + shipping)
 * - Quote-level discounts apply to merchandise only, not shipping
 * - All percentages are clamped to 0-100%
 * - All amounts are rounded to 2 decimal places for currency
 * - Safe math operations prevent overflow/underflow
 * 
 * @param lineItems - Array of line items with quantity, unitPrice, markup, etc.
 * @param taxRate - Tax percentage (0-100)
 * @param discount - Quote-level discount percentage (0-100)
 * @param shipping - Fixed shipping amount (0-1,000,000)
 * @returns Object with subtotal, discounts, tax, total, and margin
 */
export function calculateQuoteTotals(lineItems: any[], taxRate: number | string = 0, discount: number | string = 0, shipping: number | string = 0) {
  // Safely parse and validate inputs
  const tax = typeof taxRate === 'string' ? parseFloat(taxRate) : taxRate;
  const disc = typeof discount === 'string' ? parseFloat(discount) : discount;
  const shippingAmount = typeof shipping === 'string' ? parseFloat(shipping) : shipping;

  // Validate and clamp inputs
  const safeTax = clampValue(tax || 0, 0, 100);
  const safeDiscount = clampValue(disc || 0, 0, 100);
  const safeShipping = clampValue(shippingAmount || 0, 0, 1000000);

  // Calculate subtotal with overflow protection
  let subtotal = 0;
  for (const item of lineItems) {
    const lineTotal = calculateLineItemTotal(
      item.quantity,
      item.unitPrice,
      item.markupType,
      item.markupValue,
      item.discountType || "percentage",
      item.discountValue || 0
    );
    subtotal = safeAdd(subtotal, lineTotal);
  }

  // Calculate base cost
  let baseCost = 0;
  for (const item of lineItems) {
    const qty = typeof item.quantity === 'string' ? parseFloat(item.quantity) : item.quantity;
    const price = typeof item.unitPrice === 'string' ? parseFloat(item.unitPrice) : item.unitPrice;
    
    if (isValidNumber(qty) && isValidNumber(price)) {
      const safeQty = clampValue(qty, 0, 999999);
      const safePrice = clampValue(price, 0, 10000000);
      baseCost = safeAdd(baseCost, safeMultiply(safeQty, safePrice));
    }
  }

  // Calculate total manufacturer discounts for display purposes
  let totalManufacturerDiscount = 0;
  for (const item of lineItems) {
    const qty = typeof item.quantity === 'string' ? parseFloat(item.quantity) : item.quantity;
    const price = typeof item.unitPrice === 'string' ? parseFloat(item.unitPrice) : item.unitPrice;
    const discountValue = typeof item.discountValue === 'string' ? parseFloat(item.discountValue) : item.discountValue || 0;
    const discountType = item.discountType || "percentage";
    
    if (isValidNumber(qty) && isValidNumber(price) && isValidNumber(discountValue) && discountValue > 0) {
      const safeQty = clampValue(qty, 0, 999999);
      const safePrice = clampValue(price, 0, 10000000);
      const lineBaseTotal = safeMultiply(safeQty, safePrice);
      
      if (discountType === 'percentage') {
        const safeDiscountPercent = clampValue(discountValue, 0, 100);
        const discAmount = safeMultiply(lineBaseTotal, safeDivide(safeDiscountPercent, 100));
        totalManufacturerDiscount = safeAdd(totalManufacturerDiscount, discAmount);
      } else {
        const safeDiscountDollar = clampValue(discountValue, 0, lineBaseTotal);
        totalManufacturerDiscount = safeAdd(totalManufacturerDiscount, safeDiscountDollar);
      }
    }
  }

  // Calculate markup, discount, tax with proper order of operations
  const totalMarkup = Math.max(0, subtotal - baseCost + totalManufacturerDiscount);
  const discountAmount = safeDiscount > 0 ? safeMultiply(subtotal, safeDivide(safeDiscount, 100)) : 0;
  const afterDiscount = Math.max(0, subtotal - discountAmount);
  const beforeTax = safeAdd(afterDiscount, safeShipping);
  const taxAmount = safeMultiply(beforeTax, safeDivide(safeTax, 100));
  const total = safeAdd(beforeTax, taxAmount);
  const margin = baseCost > 0 ? safeDivide(safeMultiply(totalMarkup, 100), baseCost) : 0;

  return {
    subtotal: roundCurrency(subtotal),
    totalMarkup: roundCurrency(totalMarkup),
    totalManufacturerDiscount: roundCurrency(totalManufacturerDiscount),
    discountAmount: roundCurrency(discountAmount),
    shippingAmount: roundCurrency(safeShipping),
    taxAmount: roundCurrency(taxAmount),
    total: roundCurrency(total),
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

  // Validate inputs
  if (!isValidNumber(unitPrice) || unitPrice < 0) return 0;
  if (!isValidNumber(discount) || discount < 0) return unitPrice;

  const safePrice = clampValue(unitPrice, 0, 10000000);

  if (discount <= 0) {
    return safePrice;
  }

  if (discountType === 'percentage') {
    const safeDiscountPercent = clampValue(discount, 0, 100);
    const discountAmount = safeMultiply(safePrice, safeDivide(safeDiscountPercent, 100));
    return roundCurrency(Math.max(0, safePrice - discountAmount));
  } else {
    const safeDiscountDollar = Math.min(discount, safePrice);
    return roundCurrency(Math.max(0, safePrice - safeDiscountDollar));
  }
}

export function generateQuoteNumber(): string {
  const year = new Date().getFullYear();
  // Use full timestamp including milliseconds for better uniqueness
  const timestamp = Date.now();
  // Add a random component for additional uniqueness (3-digit random number)
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  // Use last 8 digits of timestamp + random component for uniqueness
  const uniqueId = `${timestamp.toString().slice(-8)}${random}`;
  return `QT-${year}-${uniqueId}`;
}
