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

// Sanitize number string by removing non-numeric characters (except digits, dots, and minus signs)
export function sanitizeNumberString(value: string): string {
  return value.replace(/[^0-9.-]/g, '');
}

// Validate numeric input
export function isValidNumber(value: any): boolean {
  if (value === null || value === undefined || value === '') return false;
  const num = typeof value === 'string' ? parseFloat(sanitizeNumberString(value)) : value;
  return !isNaN(num) && isFinite(num) && num >= 0;
}

// Clamp value between min and max
export function clampValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function formatCurrency(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(sanitizeNumberString(value)) : value;
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
 * 3. Apply tariff (if applicable) to increase cost
 *    - Percentage: discountedTotal + (discountedTotal × tariff%)
 * 4. Apply markup to the tariff-adjusted amount
 *    - Percentage: tariffAdjustedTotal + (tariffAdjustedTotal × markup%)
 *    - Fixed: tariffAdjustedTotal + markupAmount
 * 
 * This order ensures:
 * - Manufacturer discounts are applied to the original price
 * - Tariffs increase the cost basis (if applicable)
 * - Markup is calculated on the final cost (after discount and tariff)
 * - All values are clamped to safe ranges to prevent overflow
 * - Final result is rounded to 2 decimal places for currency
 * 
 * @param quantity - Number of items (0.01 to 999,999)
 * @param unitPrice - Price per item (0 to 10,000,000)
 * @param markupType - "percentage" or "dollar"
 * @param markupValue - Markup amount (no max limit)
 * @param discountType - "percentage" or "dollar" for manufacturer discount
 * @param discountValue - Manufacturer discount amount
 * @param tariffRate - Tariff percentage to increase cost (0 to 100)
 * @param isTariffApplicable - Whether tariff should be applied to this item
 * @returns Total price rounded to 2 decimal places
 */
export function calculateLineItemTotal(
  quantity: number | string,
  unitPrice: number | string,
  markupType: string,
  markupValue: number | string,
  discountType: string = "percentage",
  discountValue: number | string = 0,
  tariffRate: number | string = 0,
  isTariffApplicable: boolean = false
): number {
  // Safely parse and validate inputs
  const qty = typeof quantity === 'string' ? parseFloat(sanitizeNumberString(quantity)) : quantity;
  const price = typeof unitPrice === 'string' ? parseFloat(sanitizeNumberString(unitPrice)) : unitPrice;
  const markup = typeof markupValue === 'string' ? parseFloat(sanitizeNumberString(markupValue)) : markupValue;
  const discount = typeof discountValue === 'string' ? parseFloat(sanitizeNumberString(discountValue)) : discountValue;
  const tariff = typeof tariffRate === 'string' ? parseFloat(sanitizeNumberString(tariffRate)) : tariffRate;

  // Validate inputs
  if (!isValidNumber(qty) || qty <= 0 || qty > 999999) return 0;
  if (!isValidNumber(price) || price < 0 || price > 10000000) return 0;
  if (isNaN(markup) || !Number.isFinite(markup) || markup < -10000000 || markup > 10000000) return 0;
  if (!isValidNumber(discount) || discount < 0) return 0;
  if (!isValidNumber(tariff) || tariff < 0) return 0;

  // Clamp values to safe ranges
  const safeQty = clampValue(qty, 0.01, 999999);
  const safePrice = clampValue(price, 0, 10000000);
  const safeMarkup = markup;
  const safeDiscount = discountType === 'percentage' 
    ? clampValue(discount, 0, 100)
    : clampValue(discount, 0, 10000000);
  const safeTariff = clampValue(tariff, 0, 100);

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
  
  // Apply tariff to increase cost (if applicable)
  let afterTariff = afterDiscount;
  if (isTariffApplicable && safeTariff > 0) {
    const tariffAmount = safeMultiply(afterDiscount, safeDivide(safeTariff, 100));
    afterTariff = safeAdd(afterDiscount, tariffAmount);
  }
  
  // Then apply markup to the tariff-adjusted amount
  let finalTotal = afterTariff;
  if (markupType === 'percentage') {
    const markupAmount = safeMultiply(afterTariff, safeDivide(safeMarkup, 100));
    finalTotal = safeAdd(afterTariff, markupAmount);
  } else {
    finalTotal = safeAdd(afterTariff, safeMarkup);
  }

  // Ensure total never goes below zero
  finalTotal = Math.max(0, finalTotal);

  return roundCurrency(finalTotal);
}

/**
 * Calculates the margin (profit) for a line item.
 * 
 * Margin Calculation:
 * - Applies manufacturer discount to base cost first
 * - Applies tariff to increase cost (if applicable)
 * - Calculates markup amount on the tariff-adjusted cost
 * - Returns the markup amount as the margin
 * 
 * This ensures margin reflects actual profit after manufacturer discounts and tariffs.
 * 
 * @param quantity - Number of items
 * @param unitPrice - Price per item
 * @param markupType - "percentage" or "dollar"
 * @param markupValue - Markup amount
 * @param discountType - Manufacturer discount type
 * @param discountValue - Manufacturer discount amount
 * @param tariffRate - Tariff percentage to increase cost
 * @param isTariffApplicable - Whether tariff should be applied to this item
 * @returns Margin amount rounded to 2 decimal places
 */
export function calculateLineItemMargin(
  quantity: number | string,
  unitPrice: number | string,
  markupType: string,
  markupValue: number | string,
  discountType: string = "percentage",
  discountValue: number | string = 0,
  tariffRate: number | string = 0,
  isTariffApplicable: boolean = false
): number {
  // Safely parse and validate inputs
  const qty = typeof quantity === 'string' ? parseFloat(sanitizeNumberString(quantity)) : quantity;
  const price = typeof unitPrice === 'string' ? parseFloat(sanitizeNumberString(unitPrice)) : unitPrice;
  const markup = typeof markupValue === 'string' ? parseFloat(sanitizeNumberString(markupValue)) : markupValue;
  const discount = typeof discountValue === 'string' ? parseFloat(sanitizeNumberString(discountValue)) : discountValue;
  const tariff = typeof tariffRate === 'string' ? parseFloat(sanitizeNumberString(tariffRate)) : tariffRate;

  // Validate inputs
  if (!isValidNumber(qty) || qty <= 0 || qty > 999999) return 0;
  if (!isValidNumber(price) || price < 0 || price > 10000000) return 0;
  if (isNaN(markup) || !Number.isFinite(markup) || markup < -10000000 || markup > 10000000) return 0;
  if (!isValidNumber(discount) || discount < 0) return 0;
  if (!isValidNumber(tariff) || tariff < 0) return 0;

  // Clamp values to safe ranges
  const safeQty = clampValue(qty, 0.01, 999999);
  const safePrice = clampValue(price, 0, 10000000);
  const safeMarkup = markup;
  const safeDiscount = discountType === 'percentage' 
    ? clampValue(discount, 0, 100)
    : clampValue(discount, 0, 10000000);
  const safeTariff = clampValue(tariff, 0, 100);

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
  
  // Apply tariff to increase cost (if applicable)
  let afterTariff = afterDiscount;
  if (isTariffApplicable && safeTariff > 0) {
    const tariffAmount = safeMultiply(afterDiscount, safeDivide(safeTariff, 100));
    afterTariff = safeAdd(afterDiscount, tariffAmount);
  }
  
  // Calculate markup on the tariff-adjusted amount
  let marginAmount = 0;
  if (markupType === 'percentage') {
    marginAmount = safeMultiply(afterTariff, safeDivide(safeMarkup, 100));
  } else {
    marginAmount = safeMarkup;
  }

  // Note: marginAmount can be negative (representing a loss) which is intentional for markdown
  return roundCurrency(marginAmount);
}

/**
 * Calculates all totals for a quote with proper order of operations.
 * 
 * Order of Operations:
 * 1. Calculate subtotal: sum of all line items (with their individual markups/discounts/tariffs)
 * 2. Track taxable vs non-taxable items separately
 * 3. Apply quote-level discount to subtotal (proportionally to taxable items)
 * 4. Add shipping costs
 * 5. Calculate tax on (discounted taxable subtotal + shipping if taxable)
 * 6. Calculate final total: discounted subtotal + shipping + tax
 * 
 * Business Rules:
 * - Tax is only calculated on taxable line items (isTaxable !== false)
 * - Non-taxable items (e.g., labor) are excluded from tax calculation
 * - Tariff is applied to items where isTariffApplicable is true
 * - Quote-level discounts apply proportionally to taxable and non-taxable items
 * - Shipping is included in the taxable base only if isShippingTaxable is true
 * - All percentages are clamped to 0-100%
 * - All amounts are rounded to 2 decimal places for currency
 * - Safe math operations prevent overflow/underflow
 * 
 * @param lineItems - Array of line items with quantity, unitPrice, markup, isTaxable, isTariffApplicable, etc.
 * @param taxRate - Tax percentage (0-100)
 * @param discount - Quote-level discount percentage (0-100)
 * @param shipping - Fixed shipping amount (0-1,000,000)
 * @param isShippingTaxable - Whether shipping is subject to sales tax (defaults to true)
 * @param tariffRate - Tariff percentage to increase cost (0-100)
 * @returns Object with subtotal, discounts, tax, total, and margin
 */
export function calculateQuoteTotals(lineItems: any[], taxRate: number | string = 0, discount: number | string = 0, shipping: number | string = 0, isShippingTaxable: boolean = true, tariffRate: number | string = 0) {
  // Safely parse and validate inputs
  const tax = typeof taxRate === 'string' ? parseFloat(sanitizeNumberString(taxRate)) : taxRate;
  const disc = typeof discount === 'string' ? parseFloat(sanitizeNumberString(discount)) : discount;
  const shippingAmount = typeof shipping === 'string' ? parseFloat(sanitizeNumberString(shipping)) : shipping;

  // Validate and clamp inputs
  const safeTax = clampValue(tax || 0, 0, 100);
  const safeDiscount = clampValue(disc || 0, 0, 100);
  const safeShipping = clampValue(shippingAmount || 0, 0, 1000000);

  // Calculate subtotal and taxable subtotal with overflow protection
  let subtotal = 0;
  let taxableSubtotal = 0;
  for (const item of lineItems) {
    const lineTotal = calculateLineItemTotal(
      item.quantity,
      item.unitPrice,
      item.markupType,
      item.markupValue,
      item.discountType || "percentage",
      item.discountValue || 0,
      tariffRate,
      item.isTariffApplicable || false
    );
    subtotal = safeAdd(subtotal, lineTotal);
    
    // Only add to taxable base if item is taxable (default to true if not specified)
    if (item.isTaxable !== false) {
      taxableSubtotal = safeAdd(taxableSubtotal, lineTotal);
    }
  }

  // Calculate base cost
  let baseCost = 0;
  for (const item of lineItems) {
    const qty = typeof item.quantity === 'string' ? parseFloat(sanitizeNumberString(item.quantity)) : item.quantity;
    const price = typeof item.unitPrice === 'string' ? parseFloat(sanitizeNumberString(item.unitPrice)) : item.unitPrice;
    
    if (isValidNumber(qty) && isValidNumber(price)) {
      const safeQty = clampValue(qty, 0, 999999);
      const safePrice = clampValue(price, 0, 10000000);
      baseCost = safeAdd(baseCost, safeMultiply(safeQty, safePrice));
    }
  }

  // Calculate total manufacturer discounts for display purposes
  let totalManufacturerDiscount = 0;
  for (const item of lineItems) {
    const qty = typeof item.quantity === 'string' ? parseFloat(sanitizeNumberString(item.quantity)) : item.quantity;
    const price = typeof item.unitPrice === 'string' ? parseFloat(sanitizeNumberString(item.unitPrice)) : item.unitPrice;
    const discountValue = typeof item.discountValue === 'string' ? parseFloat(sanitizeNumberString(item.discountValue)) : item.discountValue || 0;
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
  
  // Calculate proportional discount for taxable items
  const taxableDiscountRatio = subtotal > 0 ? safeDivide(taxableSubtotal, subtotal) : 0;
  const taxableDiscountAmount = safeMultiply(discountAmount, taxableDiscountRatio);
  const taxableAfterDiscount = Math.max(0, taxableSubtotal - taxableDiscountAmount);
  
  // Tax calculation: (taxable subtotal after discount + shipping if taxable)
  const taxableShipping = isShippingTaxable ? safeShipping : 0;
  const taxableBase = safeAdd(taxableAfterDiscount, taxableShipping);
  const taxAmount = safeMultiply(taxableBase, safeDivide(safeTax, 100));
  
  const beforeTax = safeAdd(afterDiscount, safeShipping);
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
  const unitPrice = typeof price === 'string' ? parseFloat(sanitizeNumberString(price)) : price;
  const discount = typeof discountValue === 'string' ? parseFloat(sanitizeNumberString(discountValue)) : discountValue;

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

export function generateQuoteNumber(versionNumber: number = 1): string {
  const year = new Date().getFullYear();
  // Use full timestamp including milliseconds for better uniqueness
  const timestamp = Date.now();
  // Add a random component for additional uniqueness (3-digit random number)
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  // Use last 8 digits of timestamp + random component for uniqueness
  const uniqueId = `${timestamp.toString().slice(-8)}${random}`;
  return `QT-${year}-${uniqueId}-v${versionNumber}`;
}

export function getBaseQuoteNumber(quoteNumber: string): string | null {
  // Extract base quote number without version suffix
  // Example: "QT-2025-1234567890-v2" -> "QT-2025-1234567890"
  const match = quoteNumber.match(/^(QT-\d{4}-\d+)-v\d+$/);
  return match ? match[1] : null;
}

export function getVersionFromQuoteNumber(quoteNumber: string): number {
  // Extract version number from quote number
  // Example: "QT-2025-1234567890-v2" -> 2
  const match = quoteNumber.match(/^QT-\d{4}-\d+-v(\d+)$/);
  return match ? parseInt(match[1], 10) : 1;
}

// Group management utilities
export function generateGroupId(): string {
  return `group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Calculates the subtotal for a group of line items
 * @param lineItems - Array of line items in the group
 * @returns Group subtotal rounded to 2 decimal places
 */
export function calculateGroupSubtotal(lineItems: any[]): number {
  if (!lineItems || lineItems.length === 0) return 0;
  
  const subtotal = lineItems.reduce((total, item) => {
    const itemTotal = calculateLineItemTotal(
      item.quantity,
      item.unitPrice,
      item.markupType,
      item.markupValue,
      item.discountType,
      item.discountValue
    );
    return safeAdd(total, itemTotal);
  }, 0);
  
  return roundCurrency(subtotal);
}

/**
 * Calculates the total margin for a group of line items
 * @param lineItems - Array of line items in the group
 * @returns Group margin total rounded to 2 decimal places
 */
export function calculateGroupMargin(lineItems: any[]): number {
  if (!lineItems || lineItems.length === 0) return 0;
  
  const marginTotal = lineItems.reduce((total, item) => {
    const itemMargin = calculateLineItemMargin(
      item.quantity,
      item.unitPrice,
      item.markupType,
      item.markupValue,
      item.discountType,
      item.discountValue
    );
    return safeAdd(total, itemMargin);
  }, 0);
  
  return roundCurrency(marginTotal);
}
