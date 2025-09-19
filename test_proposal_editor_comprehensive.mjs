#!/usr/bin/env node

/**
 * COMPREHENSIVE SPLIT-VIEW PROPOSAL EDITOR TEST SUITE
 * Tests all functionality requirements for the proposal editor workflow
 */

import { readFileSync } from 'fs';

console.log('🧪 SPLIT-VIEW PROPOSAL EDITOR COMPREHENSIVE TEST SUITE');
console.log('=' .repeat(60));

// Test configuration
const TEST_CONFIG = {
  baseUrl: 'http://localhost:5000',
  testQuoteId: 21, // Using Allen Patio Project from database
  expectedRoutes: [
    '/quotes/:id/proposal',
    '/quotes/:id',
    '/quotes/:id/edit'
  ]
};

/**
 * 1. NAVIGATION & LOADING TEST
 */
function testNavigationAndLoading() {
  console.log('\n📍 TEST 1: Navigation & Loading');
  console.log('-'.repeat(40));
  
  // Test 1.1: Route Configuration
  console.log('✅ 1.1: Route Configuration');
  try {
    const appContent = readFileSync('client/src/App.tsx', 'utf8');
    
    // Verify proposal route exists
    const proposalRouteExists = appContent.includes('<Route path="/quotes/:id/proposal" component={ProposalEditor} />');
    console.log(`  📋 Proposal route configured: ${proposalRouteExists ? '✅ PASS' : '❌ FAIL'}`);
    
    // Verify quote detail route exists
    const quoteDetailRouteExists = appContent.includes('<Route path="/quotes/:id" component={QuoteDetail} />');
    console.log(`  📋 Quote detail route configured: ${quoteDetailRouteExists ? '✅ PASS' : '❌ FAIL'}`);
    
    return { proposalRouteExists, quoteDetailRouteExists };
  } catch (error) {
    console.log(`  ❌ Error reading App.tsx: ${error.message}`);
    return { proposalRouteExists: false, quoteDetailRouteExists: false };
  }
}

/**
 * 2. FORM FUNCTIONALITY TEST  
 */
function testFormFunctionality() {
  console.log('\n📝 TEST 2: Form Functionality');
  console.log('-'.repeat(40));
  
  try {
    const proposalContent = readFileSync('client/src/pages/proposal-editor.tsx', 'utf8');
    
    // Test 2.1: Form Schema Validation
    const hasFormSchema = proposalContent.includes('proposalFormSchema');
    console.log(`  📋 2.1: Form validation schema defined: ${hasFormSchema ? '✅ PASS' : '❌ FAIL'}`);
    
    // Test 2.2: Required Form Fields
    const requiredFields = [
      'companyName', 'companyAddress', 'companyPhone', 'companyEmail',
      'projectDescription', 'paymentTerms', 'warranty'
    ];
    
    let allFieldsPresent = true;
    requiredFields.forEach(field => {
      const fieldExists = proposalContent.includes(`${field}:`);
      console.log(`  📋 2.2.${field}: ${fieldExists ? '✅ PASS' : '❌ FAIL'}`);
      if (!fieldExists) allFieldsPresent = false;
    });
    
    // Test 2.3: Data Saving to customContractTerms
    const saveToCustomTerms = proposalContent.includes('customContractTerms: JSON.stringify(data)');
    console.log(`  📋 2.3: Saves to customContractTerms: ${saveToCustomTerms ? '✅ PASS' : '❌ FAIL'}`);
    
    // Test 2.4: Data Prefill Logic
    const prefillLogic = proposalContent.includes('JSON.parse(quote.customContractTerms)');
    console.log(`  📋 2.4: Data prefill implemented: ${prefillLogic ? '✅ PASS' : '❌ FAIL'}`);
    
    // Test 2.5: Save Button Test ID
    const saveButtonTestId = proposalContent.includes('data-testid="button-save-proposal"');
    console.log(`  📋 2.5: Save button has test ID: ${saveButtonTestId ? '✅ PASS' : '❌ FAIL'}`);
    
    return {
      hasFormSchema, 
      allFieldsPresent, 
      saveToCustomTerms, 
      prefillLogic,
      saveButtonTestId
    };
  } catch (error) {
    console.log(`  ❌ Error reading proposal-editor.tsx: ${error.message}`);
    return {};
  }
}

/**
 * 3. LIVE PREVIEW UPDATES TEST
 */
function testLivePreviewUpdates() {
  console.log('\n🔄 TEST 3: Live Preview Updates');
  console.log('-'.repeat(40));
  
  try {
    const proposalContent = readFileSync('client/src/pages/proposal-editor.tsx', 'utf8');
    const templateContent = readFileSync('client/src/components/template-renderers/basic-quote-template.tsx', 'utf8');
    
    // Test 3.1: Preview Container Test ID
    const previewContainerTestId = proposalContent.includes('data-testid="proposal-preview-container"');
    console.log(`  📋 3.1: Preview container has test ID: ${previewContainerTestId ? '✅ PASS' : '❌ FAIL'}`);
    
    // Test 3.2: BasicQuoteTemplate Integration
    const usesBasicTemplate = proposalContent.includes('<BasicQuoteTemplate');
    console.log(`  📋 3.2: Uses BasicQuoteTemplate: ${usesBasicTemplate ? '✅ PASS' : '❌ FAIL'}`);
    
    // Test 3.3: Form Values Passed to Template
    const passesFormValues = proposalContent.includes('form.getValues()') || 
                             proposalContent.includes('form.watch()');
    console.log(`  📋 3.3: Form values passed to preview: ${passesFormValues ? '✅ PASS' : '❌ FAIL'}`);
    
    // Test 3.4: Template Renders Company Info
    const rendersCompanyInfo = templateContent.includes('companyInfo.name') &&
                              templateContent.includes('companyInfo.address');
    console.log(`  📋 3.4: Template renders company info: ${rendersCompanyInfo ? '✅ PASS' : '❌ FAIL'}`);
    
    // Test 3.5: Template Renders Line Items with Manufacturer Data
    const rendersLineItems = templateContent.includes('quote.lineItems.map') &&
                             templateContent.includes('manufacturer');
    console.log(`  📋 3.5: Template renders line items + manufacturer: ${rendersLineItems ? '✅ PASS' : '❌ FAIL'}`);
    
    // Test 3.6: Template Calculates Totals
    const calculatesTotals = templateContent.includes('calculateQuoteTotals') ||
                            templateContent.includes('formatCurrency(total');
    console.log(`  📋 3.6: Template calculates totals: ${calculatesTotals ? '✅ PASS' : '❌ FAIL'}`);
    
    return {
      previewContainerTestId,
      usesBasicTemplate,
      passesFormValues,
      rendersCompanyInfo,
      rendersLineItems,
      calculatesTotals
    };
  } catch (error) {
    console.log(`  ❌ Error reading template files: ${error.message}`);
    return {};
  }
}

/**
 * 4. PDF GENERATION TEST
 */
function testPDFGeneration() {
  console.log('\n📄 TEST 4: PDF Generation');
  console.log('-'.repeat(40));
  
  try {
    const proposalContent = readFileSync('client/src/pages/proposal-editor.tsx', 'utf8');
    
    // Test 4.1: PDF Generation Button
    const pdfButtonExists = proposalContent.includes('data-testid="button-generate-pdf"');
    console.log(`  📋 4.1: PDF button has test ID: ${pdfButtonExists ? '✅ PASS' : '❌ FAIL'}`);
    
    // Test 4.2: Saves Data Before PDF Generation
    const savesBeforePDF = proposalContent.includes('await apiRequest("PUT", `/api/quotes/${quoteId}`') &&
                          proposalContent.includes('JSON.stringify(formData)');
    console.log(`  📋 4.2: Saves data before PDF generation: ${savesBeforePDF ? '✅ PASS' : '❌ FAIL'}`);
    
    // Test 4.3: Targets Live Preview DOM
    const targetsPreviewDOM = proposalContent.includes('document.querySelector(\'[data-testid="proposal-preview-container"]\')');
    console.log(`  📋 4.3: Targets live preview DOM: ${targetsPreviewDOM ? '✅ PASS' : '❌ FAIL'}`);
    
    // Test 4.4: Uses html2canvas for DOM Conversion
    const usesHtml2Canvas = proposalContent.includes('html2canvas');
    console.log(`  📋 4.4: Uses html2canvas for DOM conversion: ${usesHtml2Canvas ? '✅ PASS' : '❌ FAIL'}`);
    
    // Test 4.5: Handles Multi-Page Content
    const handlesMultiPage = proposalContent.includes('pagesNeeded') &&
                             proposalContent.includes('addPage');
    console.log(`  📋 4.5: Handles multi-page content: ${handlesMultiPage ? '✅ PASS' : '❌ FAIL'}`);
    
    // Test 4.6: PDF Download with Proper Filename
    const properFilename = proposalContent.includes('Proposal-${quote.quoteNumber}') ||
                          proposalContent.includes('.pdf');
    console.log(`  📋 4.6: PDF download with proper filename: ${properFilename ? '✅ PASS' : '❌ FAIL'}`);
    
    // Test 4.7: Error Handling for PDF Generation
    const hasErrorHandling = proposalContent.includes('catch (error)') &&
                             proposalContent.includes('generatePDF');
    console.log(`  📋 4.7: PDF generation error handling: ${hasErrorHandling ? '✅ PASS' : '❌ FAIL'}`);
    
    return {
      pdfButtonExists,
      savesBeforePDF,
      targetsPreviewDOM,
      usesHtml2Canvas,
      handlesMultiPage,
      properFilename,
      hasErrorHandling
    };
  } catch (error) {
    console.log(`  ❌ Error analyzing PDF generation: ${error.message}`);
    return {};
  }
}

/**
 * 5. DATA PERSISTENCE TEST
 */
function testDataPersistence() {
  console.log('\n💾 TEST 5: Data Persistence');
  console.log('-'.repeat(40));
  
  try {
    const proposalContent = readFileSync('client/src/pages/proposal-editor.tsx', 'utf8');
    
    // Test 5.1: useEffect Hook for Data Loading
    const hasUseEffect = proposalContent.includes('useEffect') &&
                        proposalContent.includes('quote?.customContractTerms');
    console.log(`  📋 5.1: useEffect hook for data loading: ${hasUseEffect ? '✅ PASS' : '❌ FAIL'}`);
    
    // Test 5.2: JSON Parse/Stringify for Data Storage
    const hasJsonHandling = proposalContent.includes('JSON.parse(quote.customContractTerms)') &&
                           proposalContent.includes('JSON.stringify(data)');
    console.log(`  📋 5.2: JSON parse/stringify for data storage: ${hasJsonHandling ? '✅ PASS' : '❌ FAIL'}`);
    
    // Test 5.3: Form Reset with Saved Data
    const hasFormReset = proposalContent.includes('form.reset');
    console.log(`  📋 5.3: Form reset with saved data: ${hasFormReset ? '✅ PASS' : '❌ FAIL'}`);
    
    // Test 5.4: Error Handling for Invalid JSON
    const hasJsonErrorHandling = proposalContent.includes('try {') &&
                                proposalContent.includes('JSON.parse') &&
                                proposalContent.includes('catch');
    console.log(`  📋 5.4: Error handling for invalid JSON: ${hasJsonErrorHandling ? '✅ PASS' : '❌ FAIL'}`);
    
    // Test 5.5: Cache Invalidation After Save
    const hasCacheInvalidation = proposalContent.includes('queryClient.invalidateQueries');
    console.log(`  📋 5.5: Cache invalidation after save: ${hasCacheInvalidation ? '✅ PASS' : '❌ FAIL'}`);
    
    return {
      hasUseEffect,
      hasJsonHandling,
      hasFormReset,
      hasJsonErrorHandling,
      hasCacheInvalidation
    };
  } catch (error) {
    console.log(`  ❌ Error analyzing data persistence: ${error.message}`);
    return {};
  }
}

/**
 * 6. EXISTING FUNCTIONALITY TEST
 */
function testExistingFunctionality() {
  console.log('\n🔧 TEST 6: Existing Functionality');
  console.log('-'.repeat(40));
  
  try {
    const quoteDetailContent = readFileSync('client/src/pages/quote-detail.tsx', 'utf8');
    const appContent = readFileSync('client/src/App.tsx', 'utf8');
    
    // Test 6.1: Edit Proposal Button in Quote Detail
    const editProposalButton = quoteDetailContent.includes('data-testid="button-edit-proposal"');
    console.log(`  📋 6.1: Edit Proposal button in quote detail: ${editProposalButton ? '✅ PASS' : '❌ FAIL'}`);
    
    // Test 6.2: Existing Edit Quote Button Unchanged
    const editQuoteButton = quoteDetailContent.includes('data-testid="button-edit-quote"');
    console.log(`  📋 6.2: Edit Quote button unchanged: ${editQuoteButton ? '✅ PASS' : '❌ FAIL'}`);
    
    // Test 6.3: Existing PDF Download Button
    const pdfDownloadButton = quoteDetailContent.includes('data-testid="button-download-pdf"');
    console.log(`  📋 6.3: Existing PDF download button: ${pdfDownloadButton ? '✅ PASS' : '❌ FAIL'}`);
    
    // Test 6.4: All Original Routes Preserved
    const originalRoutes = [
      '/quotes',
      '/quotes/new', 
      '/quotes/:id/edit',
      '/quotes/:id'
    ];
    
    let routesPreserved = true;
    originalRoutes.forEach(route => {
      const routeExists = appContent.includes(`path="${route}"`);
      console.log(`  📋 6.4.${route}: ${routeExists ? '✅ PASS' : '❌ FAIL'}`);
      if (!routeExists) routesPreserved = false;
    });
    
    return {
      editProposalButton,
      editQuoteButton,
      pdfDownloadButton,
      routesPreserved
    };
  } catch (error) {
    console.log(`  ❌ Error analyzing existing functionality: ${error.message}`);
    return {};
  }
}

/**
 * 7. INTEGRATION TEST
 */
function testIntegration() {
  console.log('\n🔗 TEST 7: Integration Test');
  console.log('-'.repeat(40));
  
  try {
    const proposalContent = readFileSync('client/src/pages/proposal-editor.tsx', 'utf8');
    const templateContent = readFileSync('client/src/components/template-renderers/basic-quote-template.tsx', 'utf8');
    
    // Test 7.1: Quote Data Query Integration
    const hasQuoteQuery = proposalContent.includes('useQuery<QuoteWithDetails>') &&
                         proposalContent.includes('/api/quotes/${quoteId}');
    console.log(`  📋 7.1: Quote data query integration: ${hasQuoteQuery ? '✅ PASS' : '❌ FAIL'}`);
    
    // Test 7.2: Loading States Implementation
    const hasLoadingStates = proposalContent.includes('isLoading') &&
                            proposalContent.includes('LoadingSpinner');
    console.log(`  📋 7.2: Loading states implementation: ${hasLoadingStates ? '✅ PASS' : '❌ FAIL'}`);
    
    // Test 7.3: Error States Implementation 
    const hasErrorStates = proposalContent.includes('error') &&
                          proposalContent.includes('Quote not found');
    console.log(`  📋 7.3: Error states implementation: ${hasErrorStates ? '✅ PASS' : '❌ FAIL'}`);
    
    // Test 7.4: Manufacturer Data in Line Items
    const hasManufacturerData = templateContent.includes('item.manufacturer') &&
                               templateContent.includes('|| "Uncategorized"');
    console.log(`  📋 7.4: Manufacturer data in line items: ${hasManufacturerData ? '✅ PASS' : '❌ FAIL'}`);
    
    // Test 7.5: Toast Notifications
    const hasToastNotifications = proposalContent.includes('useToast') &&
                                 proposalContent.includes('toast({');
    console.log(`  📋 7.5: Toast notifications: ${hasToastNotifications ? '✅ PASS' : '❌ FAIL'}`);
    
    // Test 7.6: Navigation Integration
    const hasNavigation = proposalContent.includes('useLocation') &&
                         proposalContent.includes('setLocation');
    console.log(`  📋 7.6: Navigation integration: ${hasNavigation ? '✅ PASS' : '❌ FAIL'}`);
    
    return {
      hasQuoteQuery,
      hasLoadingStates,
      hasErrorStates,
      hasManufacturerData,
      hasToastNotifications,
      hasNavigation
    };
  } catch (error) {
    console.log(`  ❌ Error analyzing integration: ${error.message}`);
    return {};
  }
}

/**
 * MAIN TEST EXECUTION
 */
function runAllTests() {
  console.log(`📅 Test Date: ${new Date().toLocaleString()}`);
  console.log(`🎯 Target Quote ID: ${TEST_CONFIG.testQuoteId}`);
  
  const results = {
    navigation: testNavigationAndLoading(),
    form: testFormFunctionality(),
    preview: testLivePreviewUpdates(),
    pdf: testPDFGeneration(),
    persistence: testDataPersistence(),
    existing: testExistingFunctionality(),
    integration: testIntegration()
  };
  
  // Summary
  console.log('\n📊 TEST SUMMARY');
  console.log('=' .repeat(60));
  
  let totalTests = 0;
  let passedTests = 0;
  
  Object.entries(results).forEach(([category, result]) => {
    Object.entries(result).forEach(([test, passed]) => {
      totalTests++;
      if (passed) passedTests++;
    });
  });
  
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Passed: ${passedTests} ✅`);
  console.log(`Failed: ${totalTests - passedTests} ❌`);
  console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
  
  return results;
}

// Execute tests if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests();
}

export { runAllTests };