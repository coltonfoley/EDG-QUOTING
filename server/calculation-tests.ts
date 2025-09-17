/**
 * Comprehensive test suite for verifying calculation accuracy
 * Tests the order of operations and various calculation scenarios
 */

import { 
  calculateLineItemTotal, 
  calculateLineItemMargin, 
  calculateQuoteTotals 
} from "../client/src/lib/utils";

// Test result logger
function logTest(testName: string, expected: number, actual: number, passed: boolean) {
  const symbol = passed ? "✅" : "❌";
  console.log(`${symbol} ${testName}`);
  if (!passed) {
    console.log(`   Expected: $${expected.toFixed(2)}, Got: $${actual.toFixed(2)}`);
  }
}

// Test runner
function runTest(testName: string, expected: number, actual: number): boolean {
  const tolerance = 0.01; // Allow for small rounding differences
  const passed = Math.abs(expected - actual) < tolerance;
  logTest(testName, expected, actual, passed);
  return passed;
}

console.log("🧪 Running Comprehensive Calculation Tests\n");
console.log("=" .repeat(60));

// ============================================
// Line Item Calculation Tests
// ============================================
console.log("\n📊 LINE ITEM CALCULATION TESTS");
console.log("-".repeat(40));

// Test 1: Simple calculation - no discount, no markup
let result = calculateLineItemTotal(10, 100, "percentage", 0, "percentage", 0);
runTest("Simple: 10 × $100 = $1000", 1000.00, result);

// Test 2: Percentage markup only
result = calculateLineItemTotal(10, 100, "percentage", 25, "percentage", 0);
runTest("25% markup: 10 × $100 + 25% = $1250", 1250.00, result);

// Test 3: Fixed markup only
result = calculateLineItemTotal(10, 100, "dollar", 200, "percentage", 0);
runTest("$200 fixed markup: 10 × $100 + $200 = $1200", 1200.00, result);

// Test 4: Percentage manufacturer discount only
result = calculateLineItemTotal(10, 100, "percentage", 0, "percentage", 20);
runTest("20% mfg discount: 10 × $100 - 20% = $800", 800.00, result);

// Test 5: Fixed manufacturer discount only
result = calculateLineItemTotal(10, 100, "percentage", 0, "dollar", 150);
runTest("$150 mfg discount: 10 × $100 - $150 = $850", 850.00, result);

// Test 6: Order of operations - discount then markup (percentage)
// Base: 10 × $100 = $1000
// After 20% discount: $1000 - $200 = $800
// After 25% markup: $800 + $200 = $1000
result = calculateLineItemTotal(10, 100, "percentage", 25, "percentage", 20);
runTest("20% mfg discount, 25% markup: $1000 - 20% = $800, +25% = $1000", 1000.00, result);

// Test 7: Order of operations - discount then markup (mixed)
// Base: 10 × $100 = $1000
// After $200 discount: $1000 - $200 = $800
// After $150 markup: $800 + $150 = $950
result = calculateLineItemTotal(10, 100, "dollar", 150, "dollar", 200);
runTest("$200 mfg discount, $150 markup: $1000 - $200 + $150 = $950", 950.00, result);

// Test 8: Decimal quantities
result = calculateLineItemTotal(2.5, 39.99, "percentage", 15, "percentage", 10);
// Base: 2.5 × $39.99 = $99.975 ≈ $99.98
// After 10% discount: $99.98 - $10.00 = $89.98
// After 15% markup: $89.98 + $13.50 = $103.48
runTest("2.5 × $39.99, 10% discount, 15% markup", 103.48, result);

// Test 9: High values
result = calculateLineItemTotal(1000, 5000, "percentage", 10, "percentage", 5);
// Base: 1000 × $5000 = $5,000,000
// After 5% discount: $5,000,000 - $250,000 = $4,750,000
// After 10% markup: $4,750,000 + $475,000 = $5,225,000
runTest("Large values: 1000 × $5000, 5% discount, 10% markup", 5225000.00, result);

// Test 10: Edge case - 100% discount
result = calculateLineItemTotal(10, 100, "percentage", 50, "percentage", 100);
// Base: $1000, After 100% discount: $0, After 50% markup: $0
runTest("100% discount edge case: should be $0", 0.00, result);

// ============================================
// Margin Calculation Tests
// ============================================
console.log("\n💰 MARGIN CALCULATION TESTS");
console.log("-".repeat(40));

// Test 11: Simple margin - percentage markup
let margin = calculateLineItemMargin(10, 100, "percentage", 25, "percentage", 0);
runTest("25% markup margin: 10 × $100 × 25% = $250", 250.00, margin);

// Test 12: Fixed markup margin
margin = calculateLineItemMargin(10, 100, "dollar", 200, "percentage", 0);
runTest("$200 fixed markup margin = $200", 200.00, margin);

// Test 13: Margin with manufacturer discount
// Base: 10 × $100 = $1000
// After 20% discount: $800
// 25% markup on $800 = $200
margin = calculateLineItemMargin(10, 100, "percentage", 25, "percentage", 20);
runTest("Margin with 20% discount, 25% markup: $800 × 25% = $200", 200.00, margin);

// ============================================
// Quote Total Calculation Tests
// ============================================
console.log("\n📋 QUOTE TOTAL CALCULATION TESTS");
console.log("-".repeat(40));

// Test 14: Simple quote - no tax, no discount, no shipping
let lineItems = [
  { quantity: 10, unitPrice: 100, markupType: "percentage", markupValue: 25 },
  { quantity: 5, unitPrice: 200, markupType: "percentage", markupValue: 20 }
];
// Item 1: 10 × $100 + 25% = $1250
// Item 2: 5 × $200 + 20% = $1200
// Subtotal: $2450
let totals = calculateQuoteTotals(lineItems, 0, 0, 0);
runTest("Simple quote subtotal: $1250 + $1200 = $2450", 2450.00, totals.subtotal);
runTest("Simple quote total (no tax/discount): $2450", 2450.00, totals.total);

// Test 15: Quote with 8.25% tax
totals = calculateQuoteTotals(lineItems, 8.25, 0, 0);
// Subtotal: $2450
// Tax: $2450 × 8.25% = $202.125 ≈ $202.13
// Total: $2450 + $202.13 = $2652.13
runTest("Quote with 8.25% tax: $2450 + $202.13 = $2652.13", 2652.13, totals.total);
runTest("Tax amount: $202.13", 202.13, totals.taxAmount);

// Test 16: Quote with 10% discount
totals = calculateQuoteTotals(lineItems, 0, 10, 0);
// Subtotal: $2450
// Discount: $2450 × 10% = $245
// Total: $2450 - $245 = $2205
runTest("Quote with 10% discount: $2450 - $245 = $2205", 2205.00, totals.total);
runTest("Discount amount: $245", 245.00, totals.discountAmount);

// Test 17: Quote with shipping
totals = calculateQuoteTotals(lineItems, 0, 0, 150);
// Subtotal: $2450
// Shipping: $150
// Total: $2450 + $150 = $2600
runTest("Quote with $150 shipping: $2450 + $150 = $2600", 2600.00, totals.total);

// Test 18: Complex quote - discount + shipping + tax (correct order)
totals = calculateQuoteTotals(lineItems, 8.25, 10, 150);
// Subtotal: $2450
// After 10% discount: $2450 - $245 = $2205
// After shipping: $2205 + $150 = $2355
// Tax on $2355: $2355 × 8.25% = $194.29
// Total: $2355 + $194.29 = $2549.29
runTest("Complex: 10% discount, $150 shipping, 8.25% tax", 2549.29, totals.total);
runTest("Complex tax amount (on discounted + shipping): $194.29", 194.29, totals.taxAmount);

// Test 19: Quote with manufacturer discounts
lineItems = [
  { 
    quantity: 10, 
    unitPrice: 100, 
    markupType: "percentage", 
    markupValue: 25,
    discountType: "percentage",
    discountValue: 15
  },
  { 
    quantity: 5, 
    unitPrice: 200, 
    markupType: "percentage", 
    markupValue: 20,
    discountType: "dollar",
    discountValue: 50
  }
];
// Item 1: 10 × $100 = $1000, -15% = $850, +25% = $1062.50
// Item 2: 5 × $200 = $1000, -$50 = $950, +20% = $1140
// Subtotal: $1062.50 + $1140 = $2202.50
totals = calculateQuoteTotals(lineItems, 10, 5, 100);
runTest("Quote with mfg discounts subtotal: $2202.50", 2202.50, totals.subtotal);
// After 5% quote discount: $2202.50 - $110.13 = $2092.37
// After $100 shipping: $2092.37 + $100 = $2192.37
// Tax: $2192.37 × 10% = $219.24
// Total: $2192.37 + $219.24 = $2411.61
runTest("Complex with mfg discounts total: $2411.61", 2411.61, totals.total);

// Test 20: Edge case - empty quote
totals = calculateQuoteTotals([], 10, 10, 100);
runTest("Empty quote with shipping/tax: $110", 110.00, totals.total);

// Test 21: Edge case - zero values
lineItems = [
  { quantity: 0, unitPrice: 100, markupType: "percentage", markupValue: 25 },
  { quantity: 10, unitPrice: 0, markupType: "percentage", markupValue: 20 }
];
totals = calculateQuoteTotals(lineItems, 0, 0, 0);
runTest("Zero quantity/price items: $0", 0.00, totals.total);

// Test 22: High tax rate
lineItems = [
  { quantity: 10, unitPrice: 100, markupType: "percentage", markupValue: 0 }
];
totals = calculateQuoteTotals(lineItems, 25, 0, 0);
// $1000 + 25% tax = $1250
runTest("High tax rate (25%): $1000 + $250 = $1250", 1250.00, totals.total);

// Test 23: Maximum discount
totals = calculateQuoteTotals(lineItems, 0, 100, 0);
// $1000 - 100% = $0
runTest("100% discount: $0", 0.00, totals.total);

// ============================================
// Summary
// ============================================
console.log("\n" + "=".repeat(60));
console.log("📊 TEST SUMMARY");
console.log("All tests verify the correct order of operations:");
console.log("1. Line Items: Base → Mfg Discount → Markup");
console.log("2. Quote: Subtotal → Quote Discount → Shipping → Tax");
console.log("3. Tax is calculated on (discounted subtotal + shipping)");
console.log("4. All values properly rounded to 2 decimal places");
console.log("=".repeat(60));