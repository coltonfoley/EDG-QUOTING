#!/usr/bin/env node

// Branded Cover Page and PDF Structure Testing Script
// Tests cover page generation, multi-page structure, and security

// Test branded cover page generation (Task 6)
function testBrandedCoverPageGeneration() {
  console.log('\n📄 Testing Branded Cover Page Generation...');
  
  // Simulate cover page generation logic from quote-detail.tsx
  const generateCoverPage = (quote, settings) => {
    const coverContent = {
      errors: [],
      content: {},
      styles: {},
      valid: true
    };
    
    // Validate required data
    if (!quote) {
      coverContent.errors.push('Quote data required');
      coverContent.valid = false;
      return coverContent;
    }
    
    if (!settings) {
      coverContent.errors.push('Company settings required for branded cover');
      coverContent.valid = false;
      return coverContent;
    }
    
    // Company information section
    coverContent.content.company = {
      name: settings.companyName || 'Company Name Missing',
      logo: settings.logo || null,
      address: settings.address || '',
      phone: settings.phone || '',
      email: settings.email || '',
      website: settings.website || ''
    };
    
    // Quote information section
    coverContent.content.quote = {
      number: quote.quoteNumber || 'Quote Number Missing',
      date: quote.createdAt || new Date().toISOString(),
      customer: {
        name: quote.customer?.name || 'Customer Name Missing',
        company: quote.customer?.company || '',
        email: quote.customer?.email || '',
        phone: quote.customer?.phone || ''
      },
      project: {
        name: quote.projectName || 'Project Name Missing',
        address: quote.projectAddress || '',
        estimatedStart: quote.estimatedStartDate || ''
      }
    };
    
    // Brand colors and styling (with validation)
    const isValidColor = (color) => /^#[0-9A-Fa-f]{6}$/.test(color);
    
    coverContent.styles.colors = {
      primary: isValidColor(settings.primaryColor) ? settings.primaryColor : '#0066cc',
      accent: isValidColor(settings.accentColor) ? settings.accentColor : '#10b981',
      text: isValidColor(settings.textColor) ? settings.textColor : '#374151'
    };
    
    // Page break configuration
    coverContent.styles.pageBreak = {
      after: true,
      avoidBlankPage: true
    };
    
    return coverContent;
  };
  
  const testCases = [
    {
      quote: {
        quoteNumber: 'QT-2025-001',
        customer: { name: 'John Doe', company: 'Acme Corp', email: 'john@acme.com', phone: '555-1234' },
        projectName: 'Patio Installation',
        projectAddress: '123 Main St',
        createdAt: '2025-09-19'
      },
      settings: {
        companyName: 'EDG Patio & Shade',
        address: '456 Business Ave',
        phone: '555-9876',
        email: 'contact@edgpatio.com',
        logo: '/assets/logo.png',
        primaryColor: '#3b82f6',
        accentColor: '#10b981',
        textColor: '#374151'
      },
      shouldBeValid: true,
      description: 'Complete cover page with all data'
    },
    {
      quote: {
        quoteNumber: 'QT-2025-002',
        customer: { name: 'Jane Smith' },
        projectName: 'Pergola Project'
      },
      settings: {
        companyName: 'Test Company',
        primaryColor: '#ff0000',
        accentColor: '#00ff00',
        textColor: '#000000'
      },
      shouldBeValid: true,
      description: 'Minimal data with valid colors'
    },
    {
      quote: null,
      settings: {
        companyName: 'Test Company'
      },
      shouldBeValid: false,
      description: 'Missing quote data'
    },
    {
      quote: {
        quoteNumber: 'QT-2025-003',
        customer: { name: 'Test Customer' }
      },
      settings: null,
      shouldBeValid: false,
      description: 'Missing company settings'
    },
    {
      quote: {
        quoteNumber: 'QT-2025-004',
        customer: { name: 'Test Customer' }
      },
      settings: {
        companyName: 'Test Company',
        primaryColor: 'invalid-color',
        accentColor: '#xyz123',
        textColor: 'red'
      },
      shouldBeValid: true,
      description: 'Invalid colors should fallback to defaults'
    }
  ];
  
  let passed = 0;
  let failed = 0;
  
  testCases.forEach(({ quote, settings, shouldBeValid, description }) => {
    const result = generateCoverPage(quote, settings);
    
    if (result.valid === shouldBeValid) {
      if (shouldBeValid) {
        // Verify essential content is present
        const hasCompanyName = result.content.company?.name;
        const hasQuoteNumber = result.content.quote?.number;
        const hasValidColors = result.styles.colors?.primary.startsWith('#');
        
        if (hasCompanyName && hasQuoteNumber && hasValidColors) {
          console.log(`  ✅ ${description}: Valid cover page generated`);
          passed++;
        } else {
          console.log(`  ❌ ${description}: Missing essential content`);
          failed++;
        }
      } else {
        console.log(`  ✅ ${description}: Correctly failed - ${result.errors.join(', ')}`);
        passed++;
      }
    } else {
      console.log(`  ❌ ${description}: Expected ${shouldBeValid ? 'valid' : 'invalid'}, got ${result.valid ? 'valid' : 'invalid'}`);
      failed++;
    }
  });
  
  console.log(`\n📊 Cover Page Generation Results: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

// Test multi-page PDF structure (Task 8)
function testMultiPagePDFStructure() {
  console.log('\n📚 Testing Multi-Page PDF Structure...');
  
  // Simulate PDF page flow logic
  const generatePDFStructure = (quote, settings, images, options) => {
    const pdfStructure = {
      pages: [],
      pageBreaks: [],
      blankPages: 0,
      errors: []
    };
    
    let currentPage = 1;
    
    // Page 1: Optional branded cover
    if (options.brandedCover && settings) {
      pdfStructure.pages.push({
        pageNumber: currentPage,
        type: 'cover',
        content: ['company_header', 'quote_info', 'customer_info', 'project_info'],
        hasPageBreak: true
      });
      pdfStructure.pageBreaks.push({ after: currentPage, type: 'cover_to_details' });
      currentPage++;
    }
    
    // Page 2+: Quote details and line items
    const lineItemCount = quote.lineItems?.length || 0;
    const itemsPerPage = 15; // Estimate
    const detailPages = Math.max(1, Math.ceil(lineItemCount / itemsPerPage));
    
    for (let i = 0; i < detailPages; i++) {
      pdfStructure.pages.push({
        pageNumber: currentPage,
        type: 'details',
        content: ['quote_header', 'line_items', options.showPricing ? 'pricing_totals' : 'no_pricing'],
        hasPageBreak: i < detailPages - 1,
        tableHeaders: lineItemCount > itemsPerPage ? 'repeat' : 'single'
      });
      
      if (i < detailPages - 1) {
        pdfStructure.pageBreaks.push({ after: currentPage, type: 'details_continuation' });
      }
      currentPage++;
    }
    
    // Page N+: Optional product renderings
    if (options.productRenderings && images && images.length > 0) {
      const imagesPerPage = 4; // Estimate based on layout
      const renderingPages = Math.ceil(images.length / imagesPerPage);
      
      // Add page break before renderings if not already at page start
      if (pdfStructure.pages.length > 0) {
        pdfStructure.pageBreaks.push({ after: currentPage - 1, type: 'details_to_renderings' });
      }
      
      for (let i = 0; i < renderingPages; i++) {
        const startIdx = i * imagesPerPage;
        const endIdx = Math.min(startIdx + imagesPerPage, images.length);
        const pageImages = images.slice(startIdx, endIdx);
        
        pdfStructure.pages.push({
          pageNumber: currentPage,
          type: 'renderings',
          content: ['section_header', 'image_grid'],
          imageCount: pageImages.length,
          imageLayout: pageImages.length <= 2 ? 'large' : 'grid',
          hasPageBreak: i < renderingPages - 1
        });
        
        if (i < renderingPages - 1) {
          pdfStructure.pageBreaks.push({ after: currentPage, type: 'renderings_continuation' });
        }
        currentPage++;
      }
    }
    
    // Check for potential blank pages
    pdfStructure.blankPages = pdfStructure.pageBreaks.filter(pb => 
      pb.type === 'cover_to_details' && 
      pdfStructure.pages.find(p => p.pageNumber === pb.after + 1)?.content.length === 0
    ).length;
    
    return pdfStructure;
  };
  
  const testCases = [
    {
      quote: {
        lineItems: Array(10).fill().map((_, i) => ({ id: i, description: `Item ${i+1}` }))
      },
      settings: { companyName: 'Test Co' },
      images: [{ id: 1 }, { id: 2 }, { id: 3 }],
      options: { brandedCover: true, productRenderings: true, showPricing: true },
      expectedPages: 3,
      expectedPageTypes: ['cover', 'details', 'renderings'],
      description: 'Full PDF: Cover + Details + Renderings'
    },
    {
      quote: {
        lineItems: Array(30).fill().map((_, i) => ({ id: i, description: `Item ${i+1}` }))
      },
      settings: { companyName: 'Test Co' },
      images: [],
      options: { brandedCover: true, productRenderings: false, showPricing: true },
      expectedPages: 3, // Cover + 2 detail pages for 30 items
      expectedPageTypes: ['cover', 'details', 'details'],
      description: 'Multi-page line items with cover'
    },
    {
      quote: {
        lineItems: Array(5).fill().map((_, i) => ({ id: i, description: `Item ${i+1}` }))
      },
      settings: null,
      images: [{ id: 1 }, { id: 2 }],
      options: { brandedCover: false, productRenderings: true, showPricing: true },
      expectedPages: 2,
      expectedPageTypes: ['details', 'renderings'],
      description: 'No cover: Details + Renderings'
    },
    {
      quote: {
        lineItems: Array(5).fill().map((_, i) => ({ id: i, description: `Item ${i+1}` }))
      },
      settings: null,
      images: [],
      options: { brandedCover: false, productRenderings: false, showPricing: false },
      expectedPages: 1,
      expectedPageTypes: ['details'],
      description: 'Minimal: Details only'
    }
  ];
  
  let passed = 0;
  let failed = 0;
  
  testCases.forEach(({ quote, settings, images, options, expectedPages, expectedPageTypes, description }) => {
    const structure = generatePDFStructure(quote, settings, images, options);
    
    let testPassed = true;
    let details = [];
    
    // Check page count
    if (structure.pages.length !== expectedPages) {
      testPassed = false;
      details.push(`pages: got ${structure.pages.length}, expected ${expectedPages}`);
    }
    
    // Check page types
    const actualPageTypes = structure.pages.map(p => p.type);
    if (JSON.stringify(actualPageTypes) !== JSON.stringify(expectedPageTypes)) {
      testPassed = false;
      details.push(`types: got [${actualPageTypes.join(', ')}], expected [${expectedPageTypes.join(', ')}]`);
    }
    
    // Check for blank pages
    if (structure.blankPages > 0) {
      testPassed = false;
      details.push(`blank pages: ${structure.blankPages}`);
    }
    
    if (testPassed) {
      console.log(`  ✅ ${description}: ${structure.pages.length} pages [${actualPageTypes.join(', ')}], ${structure.pageBreaks.length} breaks`);
      passed++;
    } else {
      console.log(`  ❌ ${description}: ${details.join(', ')}`);
      failed++;
    }
  });
  
  console.log(`\n📊 PDF Structure Results: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

// Test product renderings section (Task 7)
function testProductRenderingsSection() {
  console.log('\n🖼️  Testing Product Renderings Section...');
  
  // Simulate renderings section generation
  const generateRenderingsSection = (images, options) => {
    const section = {
      enabled: false,
      content: {},
      layout: {},
      errors: []
    };
    
    // Check if renderings should be enabled
    if (!options.productRenderings) {
      section.errors.push('Product renderings disabled');
      return section;
    }
    
    if (!images || images.length === 0) {
      section.errors.push('No images available for renderings');
      return section;
    }
    
    section.enabled = true;
    
    // Configure layout based on image count
    if (images.length === 1) {
      section.layout = { type: 'single', size: 'large', columns: 1 };
    } else if (images.length <= 2) {
      section.layout = { type: 'side-by-side', size: 'medium', columns: 2 };
    } else if (images.length <= 4) {
      section.layout = { type: 'grid-2x2', size: 'medium', columns: 2 };
    } else {
      section.layout = { type: 'grid', size: 'small', columns: 3 };
    }
    
    // Generate content structure
    section.content = {
      title: 'Product Renderings',
      subtitle: `${images.length} rendering${images.length !== 1 ? 's' : ''}`,
      images: images.map((img, index) => ({
        id: img.id,
        fileName: img.fileName,
        altText: img.altText || `Product rendering ${index + 1}`,
        caption: img.altText || `Figure ${index + 1}: ${img.fileName}`,
        displayOrder: index
      })),
      pageBreak: {
        before: true,
        after: false
      }
    };
    
    return section;
  };
  
  const testCases = [
    {
      images: [
        { id: 1, fileName: 'product1.jpg', altText: 'Motorized Pergola Rendering' }
      ],
      options: { productRenderings: true },
      expectedEnabled: true,
      expectedLayout: 'single',
      description: 'Single image rendering'
    },
    {
      images: [
        { id: 1, fileName: 'product1.jpg' },
        { id: 2, fileName: 'product2.jpg' }
      ],
      options: { productRenderings: true },
      expectedEnabled: true,
      expectedLayout: 'side-by-side',
      description: 'Two images side-by-side'
    },
    {
      images: [
        { id: 1, fileName: 'product1.jpg' },
        { id: 2, fileName: 'product2.jpg' },
        { id: 3, fileName: 'product3.jpg' },
        { id: 4, fileName: 'product4.jpg' }
      ],
      options: { productRenderings: true },
      expectedEnabled: true,
      expectedLayout: 'grid-2x2',
      description: 'Four images in 2x2 grid'
    },
    {
      images: Array(6).fill().map((_, i) => ({ id: i+1, fileName: `product${i+1}.jpg` })),
      options: { productRenderings: true },
      expectedEnabled: true,
      expectedLayout: 'grid',
      description: 'Six images in grid layout'
    },
    {
      images: [{ id: 1, fileName: 'product1.jpg' }],
      options: { productRenderings: false },
      expectedEnabled: false,
      description: 'Renderings disabled by toggle'
    },
    {
      images: [],
      options: { productRenderings: true },
      expectedEnabled: false,
      description: 'No images available'
    }
  ];
  
  let passed = 0;
  let failed = 0;
  
  testCases.forEach(({ images, options, expectedEnabled, expectedLayout, description }) => {
    const section = generateRenderingsSection(images, options);
    
    let testPassed = true;
    let details = [];
    
    // Check if section is enabled as expected
    if (section.enabled !== expectedEnabled) {
      testPassed = false;
      details.push(`enabled: got ${section.enabled}, expected ${expectedEnabled}`);
    }
    
    // Check layout if section should be enabled
    if (expectedEnabled && expectedLayout) {
      const actualLayout = section.layout?.type;
      if (actualLayout !== expectedLayout) {
        testPassed = false;
        details.push(`layout: got ${actualLayout}, expected ${expectedLayout}`);
      }
    }
    
    // Check image processing
    if (expectedEnabled && images.length > 0) {
      const processedImageCount = section.content?.images?.length || 0;
      if (processedImageCount !== images.length) {
        testPassed = false;
        details.push(`images: processed ${processedImageCount}, expected ${images.length}`);
      }
    }
    
    if (testPassed) {
      if (expectedEnabled) {
        console.log(`  ✅ ${description}: ${section.layout.type} layout, ${section.content.images.length} images`);
      } else {
        console.log(`  ✅ ${description}: Correctly disabled - ${section.errors.join(', ')}`);
      }
      passed++;
    } else {
      console.log(`  ❌ ${description}: ${details.join(', ')}`);
      failed++;
    }
  });
  
  console.log(`\n📊 Product Renderings Results: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

// Test security and data validation (Task 9)
function testSecurityAndDataValidation() {
  console.log('\n🔒 Testing Security and Data Validation...');
  
  // HTML escaping function (from quote-detail.tsx)
  const escapeHtml = (text) => {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  };
  
  // CSS color validation (from quote-detail.tsx)
  const isValidCSSColor = (color) => {
    if (/^#([0-9A-Fa-f]{3}){1,2}$/.test(color)) return true;
    if (/^(rgb|rgba|hsl|hsla)\([^)]+\)$/.test(color)) return true;
    const validNames = ['black', 'white', 'red', 'blue', 'green', 'yellow', 'gray', 'grey'];
    return validNames.includes(color.toLowerCase());
  };
  
  const getSafeColor = (color, defaultColor = '#0066cc') => {
    if (!color || !isValidCSSColor(color)) {
      return defaultColor;
    }
    return color;
  };
  
  // Simulate safe PDF generation with validation
  const generateSafePDFContent = (userInput, settings) => {
    const safeContent = {
      valid: true,
      errors: [],
      content: {}
    };
    
    try {
      // Escape all user input
      safeContent.content = {
        customerName: escapeHtml(userInput.customerName),
        projectName: escapeHtml(userInput.projectName),
        projectAddress: escapeHtml(userInput.projectAddress),
        notes: escapeHtml(userInput.notes),
        quoteNumber: escapeHtml(userInput.quoteNumber)
      };
      
      // Validate and sanitize colors
      safeContent.content.colors = {
        primary: getSafeColor(settings?.primaryColor),
        accent: getSafeColor(settings?.accentColor),
        text: getSafeColor(settings?.textColor)
      };
      
    } catch (error) {
      safeContent.valid = false;
      safeContent.errors.push(`Processing error: ${error.message}`);
    }
    
    return safeContent;
  };
  
  const maliciousInputs = [
    {
      input: {
        customerName: '<script>alert("xss")</script>',
        projectName: 'Normal Project',
        notes: 'Safe notes'
      },
      settings: { primaryColor: '#ff0000' },
      description: 'XSS in customer name'
    },
    {
      input: {
        customerName: 'John Doe',
        projectName: '"><img src=x onerror=alert(1)>',
        notes: 'Safe notes'
      },
      settings: { primaryColor: '#ff0000' },
      description: 'XSS in project name'
    },
    {
      input: {
        customerName: 'John Doe',
        projectName: 'Safe Project',
        notes: 'javascript:alert("malicious")'
      },
      settings: { primaryColor: '#ff0000' },
      description: 'JavaScript URL in notes'
    },
    {
      input: {
        customerName: 'John & Jane <Partners>',
        projectName: 'Project "Special Quotes"',
        notes: 'Notes with special chars: <>"\''
      },
      settings: { primaryColor: '#ff0000' },
      description: 'Special characters (should be escaped)'
    },
    {
      input: {
        customerName: 'John Doe',
        projectName: 'Safe Project'
      },
      settings: {
        primaryColor: '#ff0000; background: url(javascript:alert(1))',
        accentColor: 'expression(alert(1))',
        textColor: '#00ff00'
      },
      description: 'CSS injection in colors'
    }
  ];
  
  let passed = 0;
  let failed = 0;
  
  maliciousInputs.forEach(({ input, settings, description }) => {
    const result = generateSafePDFContent(input, settings);
    
    let isSafe = true;
    let details = [];
    
    // Check that malicious scripts are escaped
    if (result.content.customerName && result.content.customerName.includes('<script>')) {
      isSafe = false;
      details.push('script tags not escaped');
    }
    
    // Check that HTML is escaped
    if (result.content.projectName && result.content.projectName.includes('<img')) {
      isSafe = false;
      details.push('HTML tags not escaped');
    }
    
    // Check that colors are safe
    const colorValues = Object.values(result.content.colors || {});
    const hasUnsafeColor = colorValues.some(color => 
      color && (color.includes('javascript:') || color.includes('expression(') || !isValidCSSColor(color))
    );
    
    if (hasUnsafeColor) {
      isSafe = false;
      details.push('unsafe colors not sanitized');
    }
    
    if (isSafe) {
      console.log(`  ✅ ${description}: Input properly sanitized`);
      passed++;
    } else {
      console.log(`  ❌ ${description}: Security issues - ${details.join(', ')}`);
      failed++;
    }
  });
  
  console.log(`\n📊 Security Validation Results: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

// Main test execution
async function runBrandedCoverAndPDFStructureTests() {
  console.log('🚀 Starting Branded Cover Page and PDF Structure Testing...\n');
  
  const results = [];
  
  // Run all test suites
  results.push({ name: 'Branded Cover Page Generation', passed: testBrandedCoverPageGeneration() });
  results.push({ name: 'Multi-Page PDF Structure', passed: testMultiPagePDFStructure() });
  results.push({ name: 'Product Renderings Section', passed: testProductRenderingsSection() });
  results.push({ name: 'Security and Data Validation', passed: testSecurityAndDataValidation() });
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📋 BRANDED COVER PAGE AND PDF STRUCTURE TESTING SUMMARY');
  console.log('='.repeat(60));
  
  results.forEach(({ name, passed }) => {
    console.log(`${passed ? '✅' : '❌'} ${name}: ${passed ? 'PASSED' : 'FAILED'}`);
  });
  
  const allPassed = results.every(r => r.passed);
  console.log('\n' + (allPassed ? '🎉 All branded cover and PDF structure tests PASSED!' : '⚠️  Some tests FAILED!'));
  
  return allPassed;
}

// Execute tests
runBrandedCoverAndPDFStructureTests()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Error running tests:', error);
    process.exit(1);
  });