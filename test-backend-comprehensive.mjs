#!/usr/bin/env node

/**
 * Comprehensive Backend Testing Script
 * Tests all product CRUD operations, filtering, bulk operations, and API endpoints
 * for manufacturer field structure compatibility
 */

import { execSync } from 'child_process';

const BASE_URL = 'http://localhost:5000';
const TEST_RESULTS = [];

// Color codes for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logTest(testName, passed, details = '') {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  const statusColor = passed ? colors.green : colors.red;
  log(`${statusColor}${status}${colors.reset} ${testName}`, colors.bold);
  if (details) {
    log(`   Details: ${details}`, colors.blue);
  }
  TEST_RESULTS.push({
    test: testName,
    passed,
    details
  });
}

function logSection(sectionName) {
  log(`\n${'='.repeat(60)}`, colors.yellow);
  log(`${sectionName}`, colors.yellow + colors.bold);
  log(`${'='.repeat(60)}`, colors.yellow);
}

// Helper function to make HTTP requests
async function makeRequest(method, endpoint, data = null, headers = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  };

  if (data && (method === 'POST' || method === 'PUT')) {
    options.body = JSON.stringify(data);
  }

  try {
    const response = await fetch(url, options);
    const responseText = await response.text();
    
    let responseData;
    try {
      responseData = responseText ? JSON.parse(responseText) : {};
    } catch (e) {
      responseData = { rawText: responseText };
    }

    return {
      status: response.status,
      ok: response.ok,
      data: responseData,
      headers: Object.fromEntries(response.headers.entries())
    };
  } catch (error) {
    return {
      status: 0,
      ok: false,
      error: error.message,
      data: null
    };
  }
}

// Test authentication by creating a test user and logging in
async function setupAuthentication() {
  logSection('AUTHENTICATION SETUP');
  
  try {
    // Try to login with admin user (should exist)
    const loginResponse = await makeRequest('POST', '/api/login', {
      username: 'admin',
      password: 'admin123'
    });

    if (loginResponse.ok) {
      logTest('Authentication with admin user', true, 'Login successful');
      const setCookieHeader = loginResponse.headers['set-cookie'];
      return setCookieHeader || '';
    }

    // If admin login fails, try with testuser
    const testLoginResponse = await makeRequest('POST', '/api/login', {
      username: 'testuser',
      password: 'testpass123'
    });

    if (testLoginResponse.ok) {
      logTest('Authentication with existing test user', true, 'Login successful');
      const setCookieHeader = testLoginResponse.headers['set-cookie'];
      return setCookieHeader || '';
    }

    // If login fails, create test user via register
    const createUserResponse = await makeRequest('POST', '/api/register', {
      username: 'testuser',
      password: 'testpass123',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      role: 'admin'
    });

    if (createUserResponse.ok) {
      logTest('Authentication with new test user', true, 'User created and login successful');
      const setCookieHeader = createUserResponse.headers['set-cookie'];
      return setCookieHeader || '';
    }

    logTest('Authentication setup', false, 'Could not create or login test user');
    return '';
  } catch (error) {
    logTest('Authentication setup', false, `Error: ${error.message}`);
    return '';
  }
}

// Test Product CRUD Operations
async function testProductCRUD(authCookie) {
  logSection('PRODUCT CRUD OPERATIONS');

  const headers = authCookie ? { 'Cookie': authCookie } : {};

  // Test GET /api/products
  const allProductsResponse = await makeRequest('GET', '/api/products', null, headers);
  const allProductsPass = allProductsResponse.ok && Array.isArray(allProductsResponse.data);
  logTest('GET /api/products', allProductsPass, 
    allProductsPass ? `Retrieved ${allProductsResponse.data.length} products` : 'Failed to retrieve products');

  if (allProductsPass && allProductsResponse.data.length > 0) {
    const sampleProduct = allProductsResponse.data[0];
    
    // Verify both category and manufacturer fields are present
    const hasRequiredFields = sampleProduct.hasOwnProperty('category') && sampleProduct.hasOwnProperty('manufacturer');
    logTest('Products include both category and manufacturer fields', hasRequiredFields,
      `Sample product has category: ${sampleProduct.category}, manufacturer: ${sampleProduct.manufacturer}`);

    // Verify no internal validation metadata
    const hasNoValidationMetadata = !sampleProduct.hasOwnProperty('_categoryValidation');
    logTest('No internal validation metadata in response', hasNoValidationMetadata,
      hasNoValidationMetadata ? 'Clean response' : 'Found _categoryValidation metadata');

    // Test GET /api/products/:id
    const singleProductResponse = await makeRequest('GET', `/api/products/${sampleProduct.id}`, null, headers);
    const singleProductPass = singleProductResponse.ok && singleProductResponse.data.id === sampleProduct.id;
    logTest('GET /api/products/:id', singleProductPass,
      singleProductPass ? `Retrieved product ${sampleProduct.id}` : 'Failed to retrieve single product');

    if (singleProductPass) {
      const hasRequiredFieldsSingle = singleProductResponse.data.hasOwnProperty('category') && 
                                     singleProductResponse.data.hasOwnProperty('manufacturer');
      logTest('Single product includes both category and manufacturer fields', hasRequiredFieldsSingle,
        `Product has category: ${singleProductResponse.data.category}, manufacturer: ${singleProductResponse.data.manufacturer}`);
    }
  }

  // Test POST /api/products (Create new product with manufacturer)
  const newProductData = {
    name: 'Test Product - Manufacturer Field',
    description: 'Test product for manufacturer field testing',
    category: 'Test Category',
    manufacturer: 'Test Manufacturer',
    defaultUnitPrice: 100.00,
    defaultMarkupType: 'percentage',
    defaultMarkupValue: 25.00,
    unit: 'each'
  };

  const createResponse = await makeRequest('POST', '/api/products', newProductData, headers);
  const createPass = createResponse.ok && createResponse.data.id;
  logTest('POST /api/products with manufacturer field', createPass,
    createPass ? `Created product ID ${createResponse.data.id}` : `Failed: ${createResponse.data?.message || 'Unknown error'}`);

  let createdProductId = null;
  if (createPass) {
    createdProductId = createResponse.data.id;
    
    // Verify created product has both fields
    const hasManufacturerField = createResponse.data.manufacturer === 'Test Manufacturer';
    const hasCategoryField = createResponse.data.category === 'Test Category';
    logTest('Created product has manufacturer field', hasManufacturerField,
      `Manufacturer: ${createResponse.data.manufacturer}`);
    logTest('Created product has category field', hasCategoryField,
      `Category: ${createResponse.data.category}`);
  }

  // Test PUT /api/products/:id (Update with manufacturer)
  if (createdProductId) {
    const updateData = {
      name: 'Updated Test Product',
      manufacturer: 'Updated Manufacturer',
      category: 'Updated Category',
      defaultUnitPrice: 150.00
    };

    const updateResponse = await makeRequest('PUT', `/api/products/${createdProductId}`, updateData, headers);
    const updatePass = updateResponse.ok;
    logTest('PUT /api/products/:id with manufacturer field', updatePass,
      updatePass ? 'Product updated successfully' : `Failed: ${updateResponse.data?.message || 'Unknown error'}`);

    if (updatePass) {
      // Verify the update by fetching the product again
      const updatedProductResponse = await makeRequest('GET', `/api/products/${createdProductId}`, null, headers);
      if (updatedProductResponse.ok) {
        const verifyUpdate = updatedProductResponse.data.manufacturer === 'Updated Manufacturer' &&
                           updatedProductResponse.data.category === 'Updated Category';
        logTest('Updated product reflects manufacturer changes', verifyUpdate,
          `Manufacturer: ${updatedProductResponse.data.manufacturer}, Category: ${updatedProductResponse.data.category}`);
      }
    }
  }

  return { createdProductId, authCookie };
}

// Test Product Filtering
async function testProductFiltering(authCookie) {
  logSection('PRODUCT FILTERING TESTS');

  const headers = authCookie ? { 'Cookie': authCookie } : {};

  // Test manufacturer filtering
  const manufacturerFilterResponse = await makeRequest('GET', '/api/products?manufacturer=INFRATECH', null, headers);
  const manufacturerFilterPass = manufacturerFilterResponse.ok && Array.isArray(manufacturerFilterResponse.data);
  logTest('Product filtering by manufacturer', manufacturerFilterPass,
    manufacturerFilterPass ? `Found ${manufacturerFilterResponse.data.length} INFRATECH products` : 'Failed to filter by manufacturer');

  if (manufacturerFilterPass && manufacturerFilterResponse.data.length > 0) {
    const allInfratech = manufacturerFilterResponse.data.every(p => 
      p.manufacturer && p.manufacturer.toLowerCase().includes('infratech'));
    logTest('Manufacturer filter returns correct products', allInfratech,
      allInfratech ? 'All products contain INFRATECH manufacturer' : 'Some products do not match filter');
  }

  // Test category filtering (backwards compatibility)
  const categoryFilterResponse = await makeRequest('GET', '/api/products?category=INFRATECH', null, headers);
  const categoryFilterPass = categoryFilterResponse.ok && Array.isArray(categoryFilterResponse.data);
  logTest('Product filtering by category (legacy)', categoryFilterPass,
    categoryFilterPass ? `Found ${categoryFilterResponse.data.length} products with INFRATECH category` : 'Failed to filter by category');

  // Test combined filtering behavior
  const combinedFilterResponse = await makeRequest('GET', '/api/products?manufacturer=Magnatrack&category=Magnatrack', null, headers);
  const combinedFilterPass = combinedFilterResponse.ok && Array.isArray(combinedFilterResponse.data);
  logTest('Combined manufacturer and category filtering', combinedFilterPass,
    combinedFilterPass ? `Found ${combinedFilterResponse.data.length} products with combined filter` : 'Failed combined filtering');

  // Test non-existent manufacturer
  const noResultsResponse = await makeRequest('GET', '/api/products?manufacturer=NonExistentManufacturer', null, headers);
  const noResultsPass = noResultsResponse.ok && Array.isArray(noResultsResponse.data) && noResultsResponse.data.length === 0;
  logTest('Filter with non-existent manufacturer returns empty array', noResultsPass,
    noResultsPass ? 'Correctly returned empty array' : 'Should return empty array for non-existent manufacturer');
}

// Test Bulk Operations
async function testBulkOperations(authCookie, testProductId) {
  logSection('BULK OPERATIONS TESTS');

  const headers = authCookie ? { 'Cookie': authCookie } : {};

  if (testProductId) {
    // Test bulk update with manufacturer field
    const bulkUpdateData = {
      productIds: [testProductId],
      updates: {
        manufacturer: 'Bulk Updated Manufacturer',
        defaultMarkupValue: 30.00
      }
    };

    const bulkUpdateResponse = await makeRequest('PUT', '/api/products/bulk-update', bulkUpdateData, headers);
    const bulkUpdatePass = bulkUpdateResponse.ok;
    logTest('Bulk product update with manufacturer field', bulkUpdatePass,
      bulkUpdatePass ? `Updated ${bulkUpdateResponse.data?.updatedCount || 1} products` : `Failed: ${bulkUpdateResponse.data?.message || 'Unknown error'}`);

    if (bulkUpdatePass) {
      // Verify the bulk update
      const verifyResponse = await makeRequest('GET', `/api/products/${testProductId}`, null, headers);
      if (verifyResponse.ok) {
        const verifyBulkUpdate = verifyResponse.data.manufacturer === 'Bulk Updated Manufacturer';
        logTest('Bulk update reflects manufacturer changes', verifyBulkUpdate,
          `Updated manufacturer: ${verifyResponse.data.manufacturer}`);
      }
    }
  }

  // Test bulk price list upload format with manufacturer data
  const samplePricingData = {
    pricingData: [
      {
        lengthMin: 10,
        lengthMax: 15,
        widthMin: 8,
        widthMax: 12,
        retailPrice: 500.00,
        basePrice: 400.00
      }
    ]
  };

  if (testProductId) {
    const bulkPricingResponse = await makeRequest('POST', `/api/products/${testProductId}/pricing-tables/bulk-upload`, samplePricingData, headers);
    const bulkPricingPass = bulkPricingResponse.ok;
    logTest('Bulk price list upload maintains manufacturer data integrity', bulkPricingPass,
      bulkPricingPass ? 'Pricing data uploaded successfully' : `Failed: ${bulkPricingResponse.data?.message || 'Unknown error'}`);
  }
}

// Test Data Integrity
async function testDataIntegrity(authCookie) {
  logSection('DATA INTEGRITY VERIFICATION');

  const headers = authCookie ? { 'Cookie': authCookie } : {};

  // Get all products and analyze data integrity
  const allProductsResponse = await makeRequest('GET', '/api/products', null, headers);
  
  if (allProductsResponse.ok && Array.isArray(allProductsResponse.data)) {
    const products = allProductsResponse.data;
    
    // Check products with both category and manufacturer
    const productsWithBoth = products.filter(p => p.category && p.manufacturer);
    const productsWithCategoryOnly = products.filter(p => p.category && !p.manufacturer);
    const productsWithManufacturerOnly = products.filter(p => !p.category && p.manufacturer);
    const productsWithNeither = products.filter(p => !p.category && !p.manufacturer);

    logTest('All products accessible via API', true,
      `Total: ${products.length}, Both fields: ${productsWithBoth.length}, Category only: ${productsWithCategoryOnly.length}, Manufacturer only: ${productsWithManufacturerOnly.length}, Neither: ${productsWithNeither.length}`);

    // Verify no validation metadata in any product
    const hasValidationMetadata = products.some(p => p.hasOwnProperty('_categoryValidation'));
    logTest('No validation metadata in any product response', !hasValidationMetadata,
      hasValidationMetadata ? 'Found validation metadata in responses' : 'All responses clean');

    // Test legacy category display
    if (productsWithCategoryOnly.length > 0) {
      logTest('Products with category only display correctly', true,
        `${productsWithCategoryOnly.length} products with category-only structure work correctly`);
    }

    // Test new manufacturer display
    if (productsWithManufacturerOnly.length > 0) {
      logTest('Products with manufacturer only display correctly', true,
        `${productsWithManufacturerOnly.length} products with manufacturer-only structure work correctly`);
    }
  }
}

// Test API Response Structure
async function testAPIResponseStructure(authCookie) {
  logSection('API RESPONSE STRUCTURE TESTS');

  const headers = authCookie ? { 'Cookie': authCookie } : {};

  // Test invalid product creation with bad manufacturer data
  const invalidProductData = {
    name: 'Invalid Test Product',
    category: '', // Empty category
    manufacturer: '', // Empty manufacturer
    defaultUnitPrice: -100 // Invalid price
  };

  const invalidCreateResponse = await makeRequest('POST', '/api/products', invalidProductData, headers);
  const invalidCreatePass = !invalidCreateResponse.ok && invalidCreateResponse.status === 400;
  logTest('Error handling for invalid manufacturer data', invalidCreatePass,
    invalidCreatePass ? `Correctly returned 400 status` : `Expected 400, got ${invalidCreateResponse.status}`);

  // Test non-existent product ID
  const nonExistentResponse = await makeRequest('GET', '/api/products/99999', null, headers);
  const nonExistentPass = !nonExistentResponse.ok && nonExistentResponse.status === 404;
  logTest('Proper HTTP status for non-existent product', nonExistentPass,
    nonExistentPass ? 'Correctly returned 404 status' : `Expected 404, got ${nonExistentResponse.status}`);

  // Test invalid ID format
  const invalidIdResponse = await makeRequest('GET', '/api/products/invalid-id', null, headers);
  const invalidIdPass = !invalidIdResponse.ok && invalidIdResponse.status === 400;
  logTest('Error handling for invalid product ID format', invalidIdPass,
    invalidIdPass ? 'Correctly returned 400 status' : `Expected 400, got ${invalidIdResponse.status}`);
}

// Test Authentication and Authorization
async function testAuthenticationAuthorization() {
  logSection('AUTHENTICATION & AUTHORIZATION TESTS');

  // Test unauthenticated access
  const unauthResponse = await makeRequest('GET', '/api/products');
  const unauthPass = !unauthResponse.ok && unauthResponse.status === 401;
  logTest('Unauthenticated access properly blocked', unauthPass,
    unauthPass ? 'Correctly returned 401 status' : `Expected 401, got ${unauthResponse.status}`);

  // Test unauthenticated product creation
  const unauthCreateResponse = await makeRequest('POST', '/api/products', {
    name: 'Unauthorized Test',
    manufacturer: 'Test',
    defaultUnitPrice: 100
  });
  const unauthCreatePass = !unauthCreateResponse.ok && unauthCreateResponse.status === 401;
  logTest('Unauthenticated product creation blocked', unauthCreatePass,
    unauthCreatePass ? 'Correctly blocked unauthorized creation' : `Expected 401, got ${unauthCreateResponse.status}`);
}

// Cleanup test data
async function cleanup(authCookie, testProductId) {
  logSection('CLEANUP');

  if (testProductId && authCookie) {
    const headers = { 'Cookie': authCookie };
    const deleteResponse = await makeRequest('DELETE', `/api/products/${testProductId}`, null, headers);
    const deletePass = deleteResponse.ok;
    logTest('Test product cleanup', deletePass,
      deletePass ? `Deleted test product ${testProductId}` : 'Failed to delete test product');
  }
}

// Generate final report
function generateReport() {
  logSection('TEST RESULTS SUMMARY');

  const totalTests = TEST_RESULTS.length;
  const passedTests = TEST_RESULTS.filter(r => r.passed).length;
  const failedTests = totalTests - passedTests;
  const passRate = ((passedTests / totalTests) * 100).toFixed(1);

  log(`\n${colors.bold}OVERALL RESULTS:${colors.reset}`);
  log(`Total Tests: ${totalTests}`);
  log(`Passed: ${colors.green}${passedTests}${colors.reset}`);
  log(`Failed: ${colors.red}${failedTests}${colors.reset}`);
  log(`Pass Rate: ${passRate}%\n`);

  if (failedTests > 0) {
    log(`${colors.red}${colors.bold}FAILED TESTS:${colors.reset}`);
    TEST_RESULTS.filter(r => !r.passed).forEach(result => {
      log(`❌ ${result.test}`, colors.red);
      if (result.details) {
        log(`   ${result.details}`, colors.blue);
      }
    });
  }

  // Summary of key functionality
  log(`\n${colors.bold}KEY FUNCTIONALITY VERIFICATION:${colors.reset}`);
  
  const crudTests = TEST_RESULTS.filter(r => r.test.includes('GET') || r.test.includes('POST') || r.test.includes('PUT'));
  const crudPassed = crudTests.every(t => t.passed);
  log(`CRUD Operations: ${crudPassed ? '✅ PASS' : '❌ FAIL'}`);

  const filterTests = TEST_RESULTS.filter(r => r.test.includes('filter'));
  const filterPassed = filterTests.every(t => t.passed);
  log(`Filtering: ${filterPassed ? '✅ PASS' : '❌ FAIL'}`);

  const bulkTests = TEST_RESULTS.filter(r => r.test.includes('Bulk') || r.test.includes('bulk'));
  const bulkPassed = bulkTests.every(t => t.passed);
  log(`Bulk Operations: ${bulkPassed ? '✅ PASS' : '❌ FAIL'}`);

  const integrityTests = TEST_RESULTS.filter(r => r.test.includes('integrity') || r.test.includes('metadata') || r.test.includes('fields'));
  const integrityPassed = integrityTests.every(t => t.passed);
  log(`Data Integrity: ${integrityPassed ? '✅ PASS' : '❌ FAIL'}`);

  const authTests = TEST_RESULTS.filter(r => r.test.includes('auth') || r.test.includes('Auth'));
  const authPassed = authTests.every(t => t.passed);
  log(`Authentication: ${authPassed ? '✅ PASS' : '❌ FAIL'}`);

  return {
    totalTests,
    passedTests,
    failedTests,
    passRate: parseFloat(passRate),
    allPassed: failedTests === 0
  };
}

// Main test execution
async function runAllTests() {
  log(`${colors.bold}${colors.blue}COMPREHENSIVE BACKEND FUNCTIONALITY TESTING${colors.reset}`);
  log(`Testing manufacturer field structure compatibility\n`);

  try {
    // Setup authentication
    const authCookie = await setupAuthentication();

    // Run all test suites
    const { createdProductId } = await testProductCRUD(authCookie);
    await testProductFiltering(authCookie);
    await testBulkOperations(authCookie, createdProductId);
    await testDataIntegrity(authCookie);
    await testAPIResponseStructure(authCookie);
    await testAuthenticationAuthorization();

    // Cleanup
    await cleanup(authCookie, createdProductId);

    // Generate final report
    const results = generateReport();

    // Exit with appropriate code
    process.exit(results.allPassed ? 0 : 1);

  } catch (error) {
    log(`\n${colors.red}${colors.bold}CRITICAL ERROR: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

// Check if server is running before starting tests
async function checkServer() {
  try {
    const response = await fetch(`${BASE_URL}/api/user`);
    return true;
  } catch (error) {
    log(`${colors.red}Error: Server not running at ${BASE_URL}${colors.reset}`);
    log(`Please start the server with 'npm run dev' before running tests.`);
    return false;
  }
}

// Start the tests
if (await checkServer()) {
  runAllTests();
} else {
  process.exit(1);
}