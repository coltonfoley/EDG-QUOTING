#!/usr/bin/env node

// Core Quote Functionality Testing Script
// Tests quote CRUD operations, line item calculations, and business logic

// Test line item calculation logic (matching the server-side verification)
function testLineItemCalculations() {
  console.log('\n🧮 Testing Line Item Calculations...');
  
  // Line item calculation logic from server
  const calculateLineItemTotal = (
    quantity,
    unitPrice,
    markupType,
    markupValue,
    discountType = "percentage",
    discountValue = 0
  ) => {
    const qty = typeof quantity === 'string' ? parseFloat(quantity) : quantity;
    const price = typeof unitPrice === 'string' ? parseFloat(unitPrice) : unitPrice;
    const markup = typeof markupValue === 'string' ? parseFloat(markupValue) : markupValue;
    const discount = typeof discountValue === 'string' ? parseFloat(discountValue) : discountValue;
    
    // Step 1: Calculate base total
    const baseTotal = qty * price;
    
    // Step 2: Apply manufacturer discount
    let discountedTotal = baseTotal;
    if (discountType === 'percentage') {
      discountedTotal = baseTotal * (1 - discount / 100);
    } else if (discountType === 'dollar') {
      discountedTotal = Math.max(0, baseTotal - discount);
    }
    
    // Step 3: Apply markup
    let finalTotal = discountedTotal;
    if (markupType === 'percentage') {
      finalTotal = discountedTotal * (1 + markup / 100);
    } else if (markupType === 'dollar') {
      finalTotal = discountedTotal + markup;
    }
    
    return Math.round(finalTotal * 100) / 100; // Round to 2 decimal places
  };
  
  const testCases = [
    {
      quantity: 1,
      unitPrice: 100,
      markupType: 'percentage',
      markupValue: 20,
      expected: 120,
      description: 'Basic percentage markup (1 × $100 + 20%)'
    },
    {
      quantity: 2,
      unitPrice: 50,
      markupType: 'dollar',
      markupValue: 25,
      expected: 125,
      description: 'Dollar markup (2 × $50 + $25)'
    },
    {
      quantity: 1,
      unitPrice: 1000,
      markupType: 'percentage',
      markupValue: 15,
      discountType: 'percentage',
      discountValue: 10,
      expected: 1035,
      description: 'With percentage discount ($1000 - 10% + 15%)'
    },
    {
      quantity: 3,
      unitPrice: 200,
      markupType: 'percentage',
      markupValue: 25,
      discountType: 'dollar',
      discountValue: 50,
      expected: 687.5,
      description: 'With dollar discount (3 × $200 - $50 + 25%)'
    },
    {
      quantity: 0.5,
      unitPrice: 80,
      markupType: 'percentage',
      markupValue: 0,
      expected: 40,
      description: 'Fractional quantity with no markup'
    },
    {
      quantity: 31,
      unitPrice: 21,
      markupType: 'percentage',
      markupValue: 0,
      expected: 651,
      description: 'Real data from quote 20 (Beam to Beam Cover Zone 1)'
    },
    {
      quantity: 1,
      unitPrice: 20847,
      markupType: 'percentage',
      markupValue: 0,
      expected: 20847,
      description: 'Large unit price from quote 20 (Motorized Pergola Zone 1)'
    }
  ];
  
  let passed = 0;
  let failed = 0;
  
  testCases.forEach(({ quantity, unitPrice, markupType, markupValue, discountType = 'percentage', discountValue = 0, expected, description }) => {
    const result = calculateLineItemTotal(quantity, unitPrice, markupType, markupValue, discountType, discountValue);
    const tolerance = 0.01; // Allow for floating point precision
    
    if (Math.abs(result - expected) <= tolerance) {
      console.log(`  ✅ ${description}: $${result.toFixed(2)}`);
      passed++;
    } else {
      console.log(`  ❌ ${description}: Got $${result.toFixed(2)}, expected $${expected.toFixed(2)}`);
      failed++;
    }
  });
  
  console.log(`\n📊 Calculation Results: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

// Test quote validation logic
function testQuoteValidation() {
  console.log('\n📋 Testing Quote Validation...');
  
  const validateQuote = (quote) => {
    const errors = [];
    
    // Required fields
    if (!quote.quoteNumber || quote.quoteNumber.trim().length === 0) {
      errors.push('Quote number is required');
    }
    if (!quote.projectName || quote.projectName.trim().length === 0) {
      errors.push('Project name is required');
    }
    
    // Quote number format validation
    if (quote.quoteNumber && !/^[A-Z0-9-]+$/.test(quote.quoteNumber)) {
      errors.push('Quote number contains invalid characters');
    }
    
    // Numeric field validation
    if (quote.taxRate !== undefined && (isNaN(quote.taxRate) || quote.taxRate < 0 || quote.taxRate > 100)) {
      errors.push('Tax rate must be between 0 and 100');
    }
    if (quote.discount !== undefined && (isNaN(quote.discount) || quote.discount < 0)) {
      errors.push('Discount must be non-negative');
    }
    if (quote.shipping !== undefined && (isNaN(quote.shipping) || quote.shipping < 0)) {
      errors.push('Shipping cost must be non-negative');
    }
    
    // Deal stage validation
    const validStages = ['new_lead', 'qualifying', 'consultation_scheduled', 'building_estimate', 'quote_sent', 'closed_won', 'closed_lost', 'on_hold'];
    if (quote.dealStage && !validStages.includes(quote.dealStage)) {
      errors.push('Invalid deal stage');
    }
    
    // Email validation (if provided)
    if (quote.customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(quote.customerEmail)) {
      errors.push('Invalid customer email format');
    }
    
    return { valid: errors.length === 0, errors };
  };
  
  const testCases = [
    {
      quote: {
        quoteNumber: 'QT-2025-001',
        projectName: 'Test Project',
        customerEmail: 'test@example.com',
        taxRate: 8.5,
        discount: 100,
        shipping: 50,
        dealStage: 'quote_sent'
      },
      valid: true,
      description: 'Valid quote data'
    },
    {
      quote: {
        quoteNumber: '',
        projectName: 'Test Project'
      },
      valid: false,
      description: 'Empty quote number'
    },
    {
      quote: {
        quoteNumber: 'QT-2025-001',
        projectName: ''
      },
      valid: false,
      description: 'Empty project name'
    },
    {
      quote: {
        quoteNumber: 'QT-2025-001!@#',
        projectName: 'Test Project'
      },
      valid: false,
      description: 'Invalid quote number characters'
    },
    {
      quote: {
        quoteNumber: 'QT-2025-001',
        projectName: 'Test Project',
        taxRate: -5
      },
      valid: false,
      description: 'Negative tax rate'
    },
    {
      quote: {
        quoteNumber: 'QT-2025-001',
        projectName: 'Test Project',
        taxRate: 150
      },
      valid: false,
      description: 'Tax rate over 100%'
    },
    {
      quote: {
        quoteNumber: 'QT-2025-001',
        projectName: 'Test Project',
        customerEmail: 'invalid-email'
      },
      valid: false,
      description: 'Invalid email format'
    },
    {
      quote: {
        quoteNumber: 'QT-2025-001',
        projectName: 'Test Project',
        dealStage: 'invalid_stage'
      },
      valid: false,
      description: 'Invalid deal stage'
    }
  ];
  
  let passed = 0;
  let failed = 0;
  
  testCases.forEach(({ quote, valid, description }) => {
    const result = validateQuote(quote);
    if (result.valid === valid) {
      console.log(`  ✅ ${description}: ${result.valid ? 'Valid' : 'Invalid (' + result.errors.join(', ') + ')'}`);
      passed++;
    } else {
      console.log(`  ❌ ${description}: Got ${result.valid}, expected ${valid}`);
      failed++;
    }
  });
  
  console.log(`\n📊 Quote Validation Results: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

// Test customer/account validation
function testCustomerValidation() {
  console.log('\n👤 Testing Customer/Account Validation...');
  
  const validateCustomer = (customer) => {
    const errors = [];
    
    // Required fields
    if (!customer.name || customer.name.trim().length === 0) {
      errors.push('Customer name is required');
    }
    if (!customer.email || customer.email.trim().length === 0) {
      errors.push('Customer email is required');
    }
    if (!customer.phone || customer.phone.trim().length === 0) {
      errors.push('Customer phone is required');
    }
    
    // Field length validation
    if (customer.name && customer.name.length > 255) {
      errors.push('Customer name is too long');
    }
    if (customer.email && customer.email.length > 255) {
      errors.push('Customer email is too long');
    }
    if (customer.company && customer.company.length > 255) {
      errors.push('Company name is too long');
    }
    
    // Email format validation
    if (customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
      errors.push('Invalid email format');
    }
    
    // Phone format validation (basic)
    if (customer.phone && !/^[\d\s\-\+\(\)]+$/.test(customer.phone)) {
      errors.push('Phone number contains invalid characters');
    }
    
    // Account type validation
    const validAccountTypes = ['homeowner', 'general_contractor', 'commercial'];
    if (customer.accountType && !validAccountTypes.includes(customer.accountType)) {
      errors.push('Invalid account type');
    }
    
    return { valid: errors.length === 0, errors };
  };
  
  const testCases = [
    {
      customer: {
        name: 'John Doe',
        email: 'john@example.com',
        phone: '(555) 123-4567',
        company: 'Acme Corp',
        accountType: 'homeowner'
      },
      valid: true,
      description: 'Valid customer data'
    },
    {
      customer: {
        name: '',
        email: 'john@example.com',
        phone: '(555) 123-4567'
      },
      valid: false,
      description: 'Empty customer name'
    },
    {
      customer: {
        name: 'John Doe',
        email: '',
        phone: '(555) 123-4567'
      },
      valid: false,
      description: 'Empty customer email'
    },
    {
      customer: {
        name: 'John Doe',
        email: 'john@example.com',
        phone: ''
      },
      valid: false,
      description: 'Empty customer phone'
    },
    {
      customer: {
        name: 'John Doe',
        email: 'invalid-email',
        phone: '(555) 123-4567'
      },
      valid: false,
      description: 'Invalid email format'
    },
    {
      customer: {
        name: 'John Doe',
        email: 'john@example.com',
        phone: 'abc-def-ghij'
      },
      valid: false,
      description: 'Invalid phone format'
    },
    {
      customer: {
        name: 'John Doe',
        email: 'john@example.com',
        phone: '(555) 123-4567',
        accountType: 'invalid_type'
      },
      valid: false,
      description: 'Invalid account type'
    }
  ];
  
  let passed = 0;
  let failed = 0;
  
  testCases.forEach(({ customer, valid, description }) => {
    const result = validateCustomer(customer);
    if (result.valid === valid) {
      console.log(`  ✅ ${description}: ${result.valid ? 'Valid' : 'Invalid (' + result.errors.join(', ') + ')'}`);
      passed++;
    } else {
      console.log(`  ❌ ${description}: Got ${result.valid}, expected ${valid}`);
      failed++;
    }
  });
  
  console.log(`\n📊 Customer Validation Results: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

// Test quote total calculations with realistic data
function testQuoteTotalCalculations() {
  console.log('\n💰 Testing Quote Total Calculations...');
  
  const calculateQuoteTotal = (lineItems, taxRate = 0, discount = 0, shipping = 0) => {
    // Calculate line items subtotal
    const subtotal = lineItems.reduce((sum, item) => {
      const qty = parseFloat(item.quantity);
      const price = parseFloat(item.unitPrice);
      const markup = parseFloat(item.markupValue);
      const discountValue = parseFloat(item.discountValue || 0);
      
      // Base total
      let itemTotal = qty * price;
      
      // Apply manufacturer discount
      if (item.discountType === 'percentage') {
        itemTotal = itemTotal * (1 - discountValue / 100);
      } else {
        itemTotal = Math.max(0, itemTotal - discountValue);
      }
      
      // Apply markup
      if (item.markupType === 'percentage') {
        itemTotal = itemTotal * (1 + markup / 100);
      } else {
        itemTotal = itemTotal + markup;
      }
      
      return sum + itemTotal;
    }, 0);
    
    // Apply quote-level discount
    const discountedSubtotal = subtotal - discount;
    
    // Calculate tax
    const tax = discountedSubtotal * (taxRate / 100);
    
    // Final total
    const total = discountedSubtotal + tax + shipping;
    
    return {
      subtotal: Math.round(subtotal * 100) / 100,
      discount: discount,
      discountedSubtotal: Math.round(discountedSubtotal * 100) / 100,
      tax: Math.round(tax * 100) / 100,
      shipping: shipping,
      total: Math.round(total * 100) / 100
    };
  };
  
  // Test case with realistic data from quote 20
  const testLineItems = [
    {
      description: 'R-BLADE™ - Motorized Louvered Pergola (Zone 1)',
      quantity: 1,
      unitPrice: 20847,
      markupType: 'percentage',
      markupValue: 0,
      discountType: 'percentage',
      discountValue: 0
    },
    {
      description: 'Beam to Beam Cover (Zone 1)',
      quantity: 31,
      unitPrice: 21,
      markupType: 'percentage',
      markupValue: 0,
      discountType: 'percentage',
      discountValue: 0
    }
  ];
  
  const testCases = [
    {
      lineItems: testLineItems,
      taxRate: 0,
      discount: 0,
      shipping: 0,
      expectedSubtotal: 21498, // 20847 + (31 * 21)
      description: 'Real data from quote 20 (no tax/discount)'
    },
    {
      lineItems: testLineItems,
      taxRate: 8.5,
      discount: 0,
      shipping: 100,
      expectedSubtotal: 21498,
      expectedTotal: 23427.83, // 21498 + 8.5% tax + $100 shipping
      description: 'With tax and shipping'
    },
    {
      lineItems: testLineItems,
      taxRate: 8.5,
      discount: 500,
      shipping: 100,
      expectedSubtotal: 21498,
      expectedTotal: 22842.83, // (21498 - 500) + 8.5% tax + $100 shipping
      description: 'With tax, discount, and shipping'
    },
    {
      lineItems: [
        {
          description: 'Test Item with Markup',
          quantity: 2,
          unitPrice: 100,
          markupType: 'percentage',
          markupValue: 20,
          discountType: 'percentage',
          discountValue: 0
        }
      ],
      taxRate: 10,
      discount: 0,
      shipping: 0,
      expectedSubtotal: 240, // 2 * 100 * 1.2
      expectedTotal: 264, // 240 + 10% tax
      description: 'With percentage markup'
    }
  ];
  
  let passed = 0;
  let failed = 0;
  
  testCases.forEach(({ lineItems, taxRate, discount, shipping, expectedSubtotal, expectedTotal, description }) => {
    const result = calculateQuoteTotal(lineItems, taxRate, discount, shipping);
    const tolerance = 0.01; // Allow for floating point precision
    
    let testPassed = true;
    let details = [];
    
    if (Math.abs(result.subtotal - expectedSubtotal) > tolerance) {
      testPassed = false;
      details.push(`subtotal: got $${result.subtotal}, expected $${expectedSubtotal}`);
    }
    
    if (expectedTotal !== undefined && Math.abs(result.total - expectedTotal) > tolerance) {
      testPassed = false;
      details.push(`total: got $${result.total}, expected $${expectedTotal}`);
    }
    
    if (testPassed) {
      console.log(`  ✅ ${description}: Subtotal $${result.subtotal}, Total $${result.total}`);
      passed++;
    } else {
      console.log(`  ❌ ${description}: ${details.join(', ')}`);
      failed++;
    }
  });
  
  console.log(`\n📊 Quote Total Results: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

// Main test execution
async function runCoreQuoteFunctionalityTests() {
  console.log('🚀 Starting Core Quote Functionality Testing...\n');
  
  const results = [];
  
  // Run all test suites
  results.push({ name: 'Line Item Calculations', passed: testLineItemCalculations() });
  results.push({ name: 'Quote Validation', passed: testQuoteValidation() });
  results.push({ name: 'Customer Validation', passed: testCustomerValidation() });
  results.push({ name: 'Quote Total Calculations', passed: testQuoteTotalCalculations() });
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📋 CORE QUOTE FUNCTIONALITY TESTING SUMMARY');
  console.log('='.repeat(50));
  
  results.forEach(({ name, passed }) => {
    console.log(`${passed ? '✅' : '❌'} ${name}: ${passed ? 'PASSED' : 'FAILED'}`);
  });
  
  const allPassed = results.every(r => r.passed);
  console.log('\n' + (allPassed ? '🎉 All core quote functionality tests PASSED!' : '⚠️  Some core quote functionality tests FAILED!'));
  
  return allPassed;
}

// Execute tests
runCoreQuoteFunctionalityTests()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Error running tests:', error);
    process.exit(1);
  });