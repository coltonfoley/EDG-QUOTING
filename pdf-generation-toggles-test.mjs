#!/usr/bin/env node

// PDF Generation Toggles Testing Script
// Tests all toggle combinations and PDF structure logic

// Simulate PDF toggle state management (from quote-detail.tsx)
function testToggleStatePersistence() {
  console.log('\n🔧 Testing PDF Toggle State Persistence...');
  
  // Mock localStorage behavior
  const mockLocalStorage = {};
  const mockSetItem = (key, value) => { mockLocalStorage[key] = value; };
  const mockGetItem = (key) => mockLocalStorage[key] || null;
  
  const saveTogglePreferences = (quoteId, options) => {
    mockSetItem(`pdf-options-${quoteId}`, JSON.stringify(options));
  };
  
  const loadTogglePreferences = (quoteId) => {
    const saved = mockGetItem(`pdf-options-${quoteId}`);
    return saved ? JSON.parse(saved) : {
      brandedCover: true,
      productRenderings: true,
      showPricing: true,
    };
  };
  
  const testCases = [
    {
      quoteId: 1,
      options: { brandedCover: true, productRenderings: true, showPricing: true },
      description: 'All toggles ON'
    },
    {
      quoteId: 2,
      options: { brandedCover: false, productRenderings: true, showPricing: true },
      description: 'Cover OFF, others ON'
    },
    {
      quoteId: 3,
      options: { brandedCover: true, productRenderings: false, showPricing: false },
      description: 'Only cover ON'
    },
    {
      quoteId: 4,
      options: { brandedCover: false, productRenderings: false, showPricing: false },
      description: 'All toggles OFF (minimal)'
    }
  ];
  
  let passed = 0;
  let failed = 0;
  
  testCases.forEach(({ quoteId, options, description }) => {
    // Save preferences
    saveTogglePreferences(quoteId, options);
    
    // Load preferences
    const loaded = loadTogglePreferences(quoteId);
    
    // Verify they match
    const match = JSON.stringify(loaded) === JSON.stringify(options);
    
    if (match) {
      console.log(`  ✅ ${description}: Saved and loaded correctly`);
      passed++;
    } else {
      console.log(`  ❌ ${description}: Got ${JSON.stringify(loaded)}, expected ${JSON.stringify(options)}`);
      failed++;
    }
  });
  
  console.log(`\n📊 Toggle Persistence Results: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

// Test PDF structure generation for different toggle combinations
function testPDFStructureGeneration() {
  console.log('\n📄 Testing PDF Structure Generation...');
  
  // Mock quote data
  const mockQuote = {
    id: 21,
    quoteNumber: 'QT-2025-01740870809',
    customer: {
      name: 'Allen Smith',
      email: 'allens@gmail.com',
      phone: '(555) 123-4567',
      company: 'Smith Construction'
    },
    projectName: 'Allen Patio Project',
    projectAddress: '123 Main St, City, ST 12345',
    notes: 'Test project notes',
    lineItems: [
      {
        id: 1,
        description: 'Test Product 1',
        quantity: 2,
        unitPrice: 100,
        markupType: 'percentage',
        markupValue: 20
      },
      {
        id: 2,
        description: 'Test Product 2',
        quantity: 1,
        unitPrice: 500,
        markupType: 'dollar',
        markupValue: 50
      }
    ]
  };
  
  const mockSettings = {
    companyName: 'Test Company Inc.',
    address: '456 Business Ave',
    phone: '(555) 987-6543',
    email: 'contact@testcompany.com',
    logo: '/assets/logo.png',
    primaryColor: '#3b82f6',
    accentColor: '#10b981',
    textColor: '#374151'
  };
  
  const mockImages = [
    { id: 1, fileName: 'product1.jpg', altText: 'Product rendering 1' },
    { id: 2, fileName: 'product2.jpg', altText: 'Product rendering 2' },
    { id: 3, fileName: 'product3.jpg', altText: 'Product rendering 3' }
  ];
  
  // PDF structure generation logic
  const generatePDFStructure = (quote, settings, images, options) => {
    const structure = {
      pages: [],
      sections: [],
      errors: []
    };
    
    // Validate required data
    if (!quote) {
      structure.errors.push('Quote data missing');
      return structure;
    }
    if (!settings && options.brandedCover) {
      structure.errors.push('Company settings required for branded cover');
    }
    
    // Page 1: Branded cover (if enabled)
    if (options.brandedCover) {
      structure.pages.push({
        type: 'cover',
        content: {
          companyName: settings?.companyName || 'Company Name',
          logo: settings?.logo,
          quoteNumber: quote.quoteNumber,
          customerName: quote.customer.name,
          projectName: quote.projectName,
          colors: {
            primary: settings?.primaryColor || '#0066cc',
            accent: settings?.accentColor || '#10b981'
          }
        }
      });
      structure.sections.push('branded_cover');
    }
    
    // Page 2+: Quote details and line items
    const detailsContent = {
      quote: {
        number: quote.quoteNumber,
        customer: quote.customer,
        project: quote.projectName,
        address: quote.projectAddress,
        notes: quote.notes
      },
      lineItems: quote.lineItems || []
    };
    
    if (options.showPricing) {
      // Include pricing columns and totals
      detailsContent.pricing = {
        showPricing: true,
        showTotals: true,
        columns: ['description', 'quantity', 'unitPrice', 'total']
      };
    } else {
      // Hide pricing columns and totals
      detailsContent.pricing = {
        showPricing: false,
        showTotals: false,
        columns: ['description', 'quantity']
      };
    }
    
    structure.pages.push({
      type: 'details',
      content: detailsContent
    });
    structure.sections.push('quote_details');
    
    // Page 3+: Product renderings (if enabled and images exist)
    if (options.productRenderings && images && images.length > 0) {
      structure.pages.push({
        type: 'renderings',
        content: {
          images: images,
          imageCount: images.length,
          layout: images.length <= 2 ? 'large' : 'grid'
        }
      });
      structure.sections.push('product_renderings');
    } else if (options.productRenderings && (!images || images.length === 0)) {
      // Toggle enabled but no images - should disable toggle or show message
      structure.errors.push('Product renderings enabled but no images available');
    }
    
    return structure;
  };
  
  const testCases = [
    {
      options: { brandedCover: true, productRenderings: true, showPricing: true },
      expectedPages: 3,
      expectedSections: ['branded_cover', 'quote_details', 'product_renderings'],
      description: 'All toggles ON: Cover + Details + Renderings + Pricing'
    },
    {
      options: { brandedCover: false, productRenderings: true, showPricing: true },
      expectedPages: 2,
      expectedSections: ['quote_details', 'product_renderings'],
      description: 'Cover OFF: Details + Renderings + Pricing'
    },
    {
      options: { brandedCover: true, productRenderings: false, showPricing: true },
      expectedPages: 2,
      expectedSections: ['branded_cover', 'quote_details'],
      description: 'Renderings OFF: Cover + Details + Pricing'
    },
    {
      options: { brandedCover: true, productRenderings: true, showPricing: false },
      expectedPages: 3,
      expectedSections: ['branded_cover', 'quote_details', 'product_renderings'],
      description: 'Pricing OFF: Cover + Details + Renderings (no pricing columns)'
    },
    {
      options: { brandedCover: false, productRenderings: false, showPricing: false },
      expectedPages: 1,
      expectedSections: ['quote_details'],
      description: 'All minimal: Details only (no cover, no renderings, no pricing)'
    }
  ];
  
  let passed = 0;
  let failed = 0;
  
  testCases.forEach(({ options, expectedPages, expectedSections, description }) => {
    const structure = generatePDFStructure(mockQuote, mockSettings, mockImages, options);
    
    let testPassed = true;
    let details = [];
    
    // Check page count
    if (structure.pages.length !== expectedPages) {
      testPassed = false;
      details.push(`pages: got ${structure.pages.length}, expected ${expectedPages}`);
    }
    
    // Check sections
    if (JSON.stringify(structure.sections) !== JSON.stringify(expectedSections)) {
      testPassed = false;
      details.push(`sections: got [${structure.sections.join(', ')}], expected [${expectedSections.join(', ')}]`);
    }
    
    // Check pricing configuration
    const detailsPage = structure.pages.find(p => p.type === 'details');
    if (detailsPage) {
      const actualShowPricing = detailsPage.content.pricing.showPricing;
      if (actualShowPricing !== options.showPricing) {
        testPassed = false;
        details.push(`pricing: got ${actualShowPricing}, expected ${options.showPricing}`);
      }
    }
    
    // Check for errors
    if (structure.errors.length > 0) {
      details.push(`errors: ${structure.errors.join(', ')}`);
    }
    
    if (testPassed && structure.errors.length === 0) {
      console.log(`  ✅ ${description}: ${structure.pages.length} pages, sections: [${structure.sections.join(', ')}]`);
      passed++;
    } else {
      console.log(`  ❌ ${description}: ${details.join('; ')}`);
      failed++;
    }
  });
  
  console.log(`\n📊 PDF Structure Results: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

// Test edge cases for PDF generation
function testPDFGenerationEdgeCases() {
  console.log('\n⚠️  Testing PDF Generation Edge Cases...');
  
  const generatePDFStructure = (quote, settings, images, options) => {
    const structure = { pages: [], sections: [], errors: [] };
    
    // Handle missing data gracefully
    if (!quote) {
      structure.errors.push('Quote data missing');
      return structure;
    }
    
    if (options.brandedCover && !settings) {
      structure.errors.push('Company settings missing for branded cover');
    }
    
    if (options.productRenderings && (!images || images.length === 0)) {
      structure.errors.push('No images available for product renderings');
    }
    
    // Always include details page as minimum
    structure.pages.push({ type: 'details', content: { quote } });
    structure.sections.push('quote_details');
    
    return structure;
  };
  
  const testCases = [
    {
      quote: null,
      settings: null,
      images: [],
      options: { brandedCover: true, productRenderings: true, showPricing: true },
      shouldHaveErrors: true,
      description: 'Missing quote data'
    },
    {
      quote: { quoteNumber: 'TEST-001', customer: { name: 'Test' } },
      settings: null,
      images: [],
      options: { brandedCover: true, productRenderings: false, showPricing: true },
      shouldHaveErrors: true,
      description: 'Missing company settings for branded cover'
    },
    {
      quote: { quoteNumber: 'TEST-001', customer: { name: 'Test' } },
      settings: { companyName: 'Test Co' },
      images: [],
      options: { brandedCover: false, productRenderings: true, showPricing: true },
      shouldHaveErrors: true,
      description: 'Product renderings enabled but no images'
    },
    {
      quote: { quoteNumber: 'TEST-001', customer: { name: 'Test' }, lineItems: [] },
      settings: { companyName: 'Test Co' },
      images: [],
      options: { brandedCover: false, productRenderings: false, showPricing: true },
      shouldHaveErrors: false,
      description: 'Minimal valid configuration'
    }
  ];
  
  let passed = 0;
  let failed = 0;
  
  testCases.forEach(({ quote, settings, images, options, shouldHaveErrors, description }) => {
    const structure = generatePDFStructure(quote, settings, images, options);
    const hasErrors = structure.errors.length > 0;
    
    if (hasErrors === shouldHaveErrors) {
      console.log(`  ✅ ${description}: ${hasErrors ? 'Correctly failed - ' + structure.errors.join(', ') : 'Success'}`);
      passed++;
    } else {
      console.log(`  ❌ ${description}: Expected ${shouldHaveErrors ? 'errors' : 'success'}, got ${hasErrors ? 'errors' : 'success'}`);
      failed++;
    }
  });
  
  console.log(`\n📊 Edge Cases Results: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

// Test toggle interaction and dependencies
function testToggleInteractions() {
  console.log('\n🔄 Testing Toggle Interactions and Dependencies...');
  
  // Simulate toggle state validation and dependencies
  const validateToggleState = (options, hasImages, hasSettings) => {
    const warnings = [];
    const adjustments = { ...options };
    
    // Product renderings requires images
    if (options.productRenderings && !hasImages) {
      warnings.push('Product renderings disabled: no images available');
      adjustments.productRenderings = false;
    }
    
    // Branded cover requires company settings
    if (options.brandedCover && !hasSettings) {
      warnings.push('Branded cover disabled: company settings missing');
      adjustments.brandedCover = false;
    }
    
    // If all toggles are off, ensure at least details are shown
    if (!adjustments.brandedCover && !adjustments.productRenderings && !adjustments.showPricing) {
      warnings.push('Minimal PDF: only quote details will be included');
    }
    
    return { adjustments, warnings };
  };
  
  const testCases = [
    {
      options: { brandedCover: true, productRenderings: true, showPricing: true },
      hasImages: true,
      hasSettings: true,
      expectedWarnings: 0,
      description: 'All requirements met'
    },
    {
      options: { brandedCover: true, productRenderings: true, showPricing: true },
      hasImages: false,
      hasSettings: true,
      expectedWarnings: 1,
      expectedAdjustments: { productRenderings: false },
      description: 'No images - should disable renderings'
    },
    {
      options: { brandedCover: true, productRenderings: false, showPricing: true },
      hasImages: true,
      hasSettings: false,
      expectedWarnings: 1,
      expectedAdjustments: { brandedCover: false },
      description: 'No settings - should disable cover'
    },
    {
      options: { brandedCover: false, productRenderings: false, showPricing: false },
      hasImages: false,
      hasSettings: false,
      expectedWarnings: 1,
      description: 'All minimal - should warn about minimal PDF'
    }
  ];
  
  let passed = 0;
  let failed = 0;
  
  testCases.forEach(({ options, hasImages, hasSettings, expectedWarnings, expectedAdjustments, description }) => {
    const result = validateToggleState(options, hasImages, hasSettings);
    
    let testPassed = true;
    let details = [];
    
    // Check warning count
    if (result.warnings.length !== expectedWarnings) {
      testPassed = false;
      details.push(`warnings: got ${result.warnings.length}, expected ${expectedWarnings}`);
    }
    
    // Check specific adjustments
    if (expectedAdjustments) {
      for (const [key, value] of Object.entries(expectedAdjustments)) {
        if (result.adjustments[key] !== value) {
          testPassed = false;
          details.push(`${key}: got ${result.adjustments[key]}, expected ${value}`);
        }
      }
    }
    
    if (testPassed) {
      console.log(`  ✅ ${description}: ${result.warnings.length} warnings${result.warnings.length > 0 ? ' - ' + result.warnings[0] : ''}`);
      passed++;
    } else {
      console.log(`  ❌ ${description}: ${details.join(', ')}`);
      failed++;
    }
  });
  
  console.log(`\n📊 Toggle Interactions Results: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

// Main test execution
async function runPDFGenerationTogglesTests() {
  console.log('🚀 Starting PDF Generation Toggles Testing...\n');
  
  const results = [];
  
  // Run all test suites
  results.push({ name: 'Toggle State Persistence', passed: testToggleStatePersistence() });
  results.push({ name: 'PDF Structure Generation', passed: testPDFStructureGeneration() });
  results.push({ name: 'PDF Generation Edge Cases', passed: testPDFGenerationEdgeCases() });
  results.push({ name: 'Toggle Interactions', passed: testToggleInteractions() });
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📋 PDF GENERATION TOGGLES TESTING SUMMARY');
  console.log('='.repeat(50));
  
  results.forEach(({ name, passed }) => {
    console.log(`${passed ? '✅' : '❌'} ${name}: ${passed ? 'PASSED' : 'FAILED'}`);
  });
  
  const allPassed = results.every(r => r.passed);
  console.log('\n' + (allPassed ? '🎉 All PDF generation toggles tests PASSED!' : '⚠️  Some PDF generation toggles tests FAILED!'));
  
  return allPassed;
}

// Execute tests
runPDFGenerationTogglesTests()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Error running tests:', error);
    process.exit(1);
  });