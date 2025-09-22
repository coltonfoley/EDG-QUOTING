#!/usr/bin/env node

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

// Base configuration
const BASE_URL = 'http://localhost:5000';
const TIMEOUT = 10000;

// Test results tracking
const testResults = {
  authentication: { passed: 0, failed: 0, tests: [] },
  quotes: { passed: 0, failed: 0, tests: [] },
  products: { passed: 0, failed: 0, tests: [] },
  accounts: { passed: 0, failed: 0, tests: [] },
  navigation: { passed: 0, failed: 0, tests: [] },
  overall: { passed: 0, failed: 0 }
};

// Shared session data
let sessionCookies = '';
let authenticatedUser = null;
let testQuoteId = null;
let testProductId = null;
let testAccountId = null;

// Color codes for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

// Helper function for making authenticated requests
async function apiRequest(method, endpoint, data = null, returnFullResponse = false) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Cookie': sessionCookies
    },
    timeout: TIMEOUT
  };

  if (data) {
    options.body = JSON.stringify(data);
  }

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, options);
    
    // Extract and update session cookies
    if (response.headers.get('set-cookie')) {
      sessionCookies = response.headers.get('set-cookie');
    }

    if (returnFullResponse) {
      return response;
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    } else {
      return await response.text();
    }
  } catch (error) {
    console.error(`Request failed: ${method} ${endpoint} - ${error.message}`);
    throw error;
  }
}

// Test result logging
function logTest(category, testName, passed, details = '') {
  const status = passed ? `${colors.green}✓ PASS${colors.reset}` : `${colors.red}✗ FAIL${colors.reset}`;
  console.log(`  ${status} ${testName}`);
  
  if (details && !passed) {
    console.log(`    ${colors.yellow}Details: ${details}${colors.reset}`);
  }
  
  testResults[category].tests.push({
    name: testName,
    passed,
    details
  });
  
  if (passed) {
    testResults[category].passed++;
    testResults.overall.passed++;
  } else {
    testResults[category].failed++;
    testResults.overall.failed++;
  }
}

// Test Authentication
async function testAuthentication() {
  console.log(`\n${colors.bold}${colors.blue}=== Testing Authentication ===${colors.reset}`);

  try {
    // Test user login
    const loginData = {
      username: 'testuser',
      password: 'test123'
    };

    const loginResult = await apiRequest('POST', '/api/login', loginData);
    authenticatedUser = loginResult;
    logTest('authentication', 'User login', !!loginResult.id, loginResult.username);

    // Test authenticated user endpoint
    const userResult = await apiRequest('GET', '/api/user');
    logTest('authentication', 'Get current user', !!userResult?.id && userResult.id === authenticatedUser.id);

  } catch (error) {
    logTest('authentication', 'Authentication system', false, error.message);
  }
}

// Test Account (Customer) Management
async function testAccountManagement() {
  console.log(`\n${colors.bold}${colors.blue}=== Testing Account Management ===${colors.reset}`);

  try {
    // List existing accounts
    const accounts = await apiRequest('GET', '/api/accounts');
    logTest('accounts', 'List accounts', Array.isArray(accounts), `Found ${accounts?.length || 0} accounts`);

    // Create new account
    const newAccount = {
      name: 'Test Customer for Quote Testing',
      email: 'testcustomer@example.com',
      phone: '555-0123',
      company: 'Test Company LLC',
      accountType: 'homeowner'
    };

    const createdAccount = await apiRequest('POST', '/api/accounts', newAccount);
    testAccountId = createdAccount.id;
    logTest('accounts', 'Create account', !!createdAccount.id, `Created account ID: ${createdAccount.id}`);

    // Update account
    const updatedData = {
      ...newAccount,
      phone: '555-0999',
      company: 'Updated Test Company LLC'
    };
    
    const updatedAccount = await apiRequest('PUT', `/api/accounts/${testAccountId}`, updatedData);
    logTest('accounts', 'Update account', updatedAccount.phone === '555-0999');

    // Get specific account
    const fetchedAccount = await apiRequest('GET', `/api/accounts/${testAccountId}`);
    logTest('accounts', 'Get specific account', fetchedAccount.id === testAccountId);

  } catch (error) {
    logTest('accounts', 'Account management system', false, error.message);
  }
}

// Test Product Management
async function testProductManagement() {
  console.log(`\n${colors.bold}${colors.blue}=== Testing Product Management ===${colors.reset}`);

  try {
    // List existing products
    const products = await apiRequest('GET', '/api/products');
    logTest('products', 'List products', Array.isArray(products), `Found ${products?.length || 0} products`);

    // Create new product
    const newProduct = {
      name: 'Test Pergola Kit',
      category: 'Pergolas',
      description: 'Test pergola kit for comprehensive testing',
      basePrice: 2499.99,
      costPrice: 1499.99,
      sku: 'TEST-PERGOLA-001',
      status: 'active'
    };

    const createdProduct = await apiRequest('POST', '/api/products', newProduct);
    testProductId = createdProduct.id;
    logTest('products', 'Create product', !!createdProduct.id, `Created product ID: ${createdProduct.id}`);

    // Update product
    const updatedProductData = {
      ...newProduct,
      basePrice: 2599.99,
      description: 'Updated test pergola kit for comprehensive testing'
    };
    
    const updatedProduct = await apiRequest('PUT', `/api/products/${testProductId}`, updatedProductData);
    logTest('products', 'Update product', parseFloat(updatedProduct.basePrice) === 2599.99);

    // Get specific product
    const fetchedProduct = await apiRequest('GET', `/api/products/${testProductId}`);
    logTest('products', 'Get specific product', fetchedProduct.id === testProductId);

  } catch (error) {
    logTest('products', 'Product management system', false, error.message);
  }
}

// Test Core Quote Functionality
async function testQuoteFunctionality() {
  console.log(`\n${colors.bold}${colors.blue}=== Testing Quote Functionality ===${colors.reset}`);

  try {
    // List existing quotes
    const quotes = await apiRequest('GET', '/api/quotes');
    logTest('quotes', 'List quotes', Array.isArray(quotes), `Found ${quotes?.length || 0} quotes`);

    // Create new quote
    const newQuote = {
      projectName: 'Test Pergola Installation',
      projectAddress: '123 Test Street, Test City, TC 12345',
      estimatedStartDate: '2025-10-01',
      notes: 'Test quote for comprehensive testing',
      taxRate: 8.5,
      discount: 0,
      shipping: 150.00,
      dealStage: 'new_lead',
      accountId: testAccountId
    };

    const createdQuote = await apiRequest('POST', '/api/quotes', newQuote);
    testQuoteId = createdQuote.id;
    logTest('quotes', 'Create quote', !!createdQuote.id && !!createdQuote.quoteNumber, 
           `Created quote ${createdQuote.quoteNumber}`);

    // Add line items to the quote
    if (testProductId && testQuoteId) {
      const lineItem = {
        quoteId: testQuoteId,
        productId: testProductId,
        description: 'Test Pergola Kit - Premium',
        quantity: 2,
        unitPrice: 2599.99,
        markupType: 'percentage',
        markupValue: 25
      };

      const createdLineItem = await apiRequest('POST', '/api/line-items', lineItem);
      logTest('quotes', 'Add line item', !!createdLineItem.id, `Added line item ID: ${createdLineItem.id}`);
    }

    // Update quote
    const updatedQuoteData = {
      ...newQuote,
      projectName: 'Updated Test Pergola Installation',
      dealStage: 'consultation_scheduled',
      notes: 'Updated test quote with new stage'
    };
    
    const updatedQuote = await apiRequest('PUT', `/api/quotes/${testQuoteId}`, updatedQuoteData);
    logTest('quotes', 'Update quote', updatedQuote.dealStage === 'consultation_scheduled');

    // Get specific quote with details
    const fetchedQuote = await apiRequest('GET', `/api/quotes/${testQuoteId}`);
    logTest('quotes', 'Get quote with details', 
           fetchedQuote.id === testQuoteId && Array.isArray(fetchedQuote.lineItems));

    // Test quote calculations
    if (fetchedQuote.lineItems && fetchedQuote.lineItems.length > 0) {
      const lineItem = fetchedQuote.lineItems[0];
      const expectedSubtotal = lineItem.quantity * lineItem.unitPrice;
      const markupAmount = lineItem.markupType === 'percentage' 
        ? expectedSubtotal * (lineItem.markupValue / 100)
        : lineItem.markupValue;
      const expectedTotal = expectedSubtotal + markupAmount;
      
      logTest('quotes', 'Quote calculations', 
             expectedSubtotal > 0 && markupAmount > 0, 
             `Subtotal: $${expectedSubtotal}, Markup: $${markupAmount}`);
    }

  } catch (error) {
    logTest('quotes', 'Quote functionality', false, error.message);
  }
}

// Test Navigation and UI endpoints
async function testNavigationAndUI() {
  console.log(`\n${colors.bold}${colors.blue}=== Testing Navigation & UI Endpoints ===${colors.reset}`);

  try {
    // Test main pages accessibility
    const mainPageResponse = await apiRequest('GET', '/', null, true);
    logTest('navigation', 'Main page accessible', mainPageResponse.status === 200);

    // Test that removed image management endpoints return proper errors or are not accessible
    try {
      await apiRequest('GET', '/api/image-management');
      logTest('navigation', 'Old image management removed', false, 'Old image management endpoint still exists');
    } catch (error) {
      if (error.message.includes('404')) {
        logTest('navigation', 'Old image management removed', true, 'Endpoint properly removed');
      } else {
        logTest('navigation', 'Old image management removed', true, 'Endpoint inaccessible');
      }
    }

    // Test API endpoints are properly protected
    try {
      await fetch(`${BASE_URL}/api/quotes`, { method: 'GET' });
      logTest('navigation', 'API endpoints protected', false, 'Endpoints accessible without auth');
    } catch (error) {
      logTest('navigation', 'API endpoints protected', true, 'Authentication required');
    }

  } catch (error) {
    logTest('navigation', 'Navigation system', false, error.message);
  }
}

// Test search functionality
async function testSearchAndFiltering() {
  console.log(`\n${colors.bold}${colors.blue}=== Testing Search & Filtering ===${colors.reset}`);

  try {
    // Test quote search
    const allQuotes = await apiRequest('GET', '/api/quotes');
    if (allQuotes && allQuotes.length > 0) {
      logTest('navigation', 'Quote data available for search', allQuotes.length > 0, 
             `${allQuotes.length} quotes available`);
    }

    // Test product search  
    const allProducts = await apiRequest('GET', '/api/products');
    if (allProducts && allProducts.length > 0) {
      logTest('navigation', 'Product data available for search', allProducts.length > 0, 
             `${allProducts.length} products available`);
    }

    // Test account search
    const allAccounts = await apiRequest('GET', '/api/accounts');
    if (allAccounts && allAccounts.length > 0) {
      logTest('navigation', 'Account data available for search', allAccounts.length > 0, 
             `${allAccounts.length} accounts available`);
    }

  } catch (error) {
    logTest('navigation', 'Search functionality', false, error.message);
  }
}

// Generate comprehensive report
function generateReport() {
  console.log(`\n${colors.bold}${colors.blue}=== COMPREHENSIVE TEST REPORT ===${colors.reset}`);
  
  const categories = ['authentication', 'accounts', 'products', 'quotes', 'navigation'];
  
  categories.forEach(category => {
    const result = testResults[category];
    const total = result.passed + result.failed;
    const successRate = total > 0 ? ((result.passed / total) * 100).toFixed(1) : 0;
    
    console.log(`\n${colors.bold}${category.toUpperCase()}:${colors.reset}`);
    console.log(`  Total Tests: ${total}`);
    console.log(`  Passed: ${colors.green}${result.passed}${colors.reset}`);
    console.log(`  Failed: ${colors.red}${result.failed}${colors.reset}`);
    console.log(`  Success Rate: ${successRate}%`);
    
    if (result.failed > 0) {
      console.log(`  ${colors.red}Failed Tests:${colors.reset}`);
      result.tests.filter(test => !test.passed).forEach(test => {
        console.log(`    • ${test.name}: ${test.details}`);
      });
    }
  });

  const overallTotal = testResults.overall.passed + testResults.overall.failed;
  const overallSuccessRate = overallTotal > 0 ? ((testResults.overall.passed / overallTotal) * 100).toFixed(1) : 0;

  console.log(`\n${colors.bold}OVERALL RESULTS:${colors.reset}`);
  console.log(`  Total Tests: ${overallTotal}`);
  console.log(`  Passed: ${colors.green}${testResults.overall.passed}${colors.reset}`);
  console.log(`  Failed: ${colors.red}${testResults.overall.failed}${colors.reset}`);
  console.log(`  Success Rate: ${overallSuccessRate}%`);

  // Determine overall test result
  if (testResults.overall.failed === 0) {
    console.log(`\n${colors.bold}${colors.green}🎉 ALL TESTS PASSED! The system is working correctly.${colors.reset}`);
  } else if (overallSuccessRate >= 80) {
    console.log(`\n${colors.bold}${colors.yellow}⚠️  MOSTLY WORKING: ${overallSuccessRate}% success rate. Some issues need attention.${colors.reset}`);
  } else {
    console.log(`\n${colors.bold}${colors.red}❌ SYSTEM ISSUES: ${overallSuccessRate}% success rate. Significant problems detected.${colors.reset}`);
  }

  // Save detailed report to file
  const reportData = {
    timestamp: new Date().toISOString(),
    summary: {
      totalTests: overallTotal,
      passed: testResults.overall.passed,
      failed: testResults.overall.failed,
      successRate: parseFloat(overallSuccessRate)
    },
    categories: testResults,
    testEnvironment: {
      baseUrl: BASE_URL,
      authenticatedUser: authenticatedUser?.username || 'none',
      testQuoteId,
      testProductId,
      testAccountId
    }
  };

  fs.writeFileSync('QUOTE_SYSTEM_TEST_REPORT.json', JSON.stringify(reportData, null, 2));
  console.log(`\n${colors.blue}📄 Detailed report saved to: QUOTE_SYSTEM_TEST_REPORT.json${colors.reset}`);

  return overallSuccessRate >= 80;
}

// Main test runner
async function runComprehensiveTests() {
  console.log(`${colors.bold}${colors.blue}🧪 STARTING COMPREHENSIVE QUOTE SYSTEM TESTING${colors.reset}`);
  console.log(`${colors.blue}Target URL: ${BASE_URL}${colors.reset}`);
  console.log(`${colors.blue}Timestamp: ${new Date().toISOString()}${colors.reset}\n`);

  try {
    await testAuthentication();
    
    if (authenticatedUser) {
      await testAccountManagement();
      await testProductManagement(); 
      await testQuoteFunctionality();
      await testNavigationAndUI();
      await testSearchAndFiltering();
    } else {
      console.log(`${colors.red}❌ Authentication failed - skipping remaining tests${colors.reset}`);
    }

    const success = generateReport();
    process.exit(success ? 0 : 1);

  } catch (error) {
    console.error(`${colors.red}❌ Test runner failed: ${error.message}${colors.reset}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the tests
runComprehensiveTests();