#!/usr/bin/env node

/**
 * Final Comprehensive Testing for Manufacturer Field Migration
 * 
 * This script validates that the manufacturer field migration is complete
 * and all functionality works correctly with the manufacturer-only structure.
 */

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';
const TEST_USERNAME = 'admin';
const TEST_PASSWORD = 'admin123';

let authCookies = '';

// Utility functions
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function makeRequest(method, path, body = null, headers = {}) {
  const url = `${BASE_URL}${path}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Cookie': authCookies,
      ...headers
    }
  };
  
  if (body) {
    options.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  
  const response = await fetch(url, options);
  
  // Update cookies from response
  if (response.headers.get('set-cookie')) {
    authCookies = response.headers.get('set-cookie');
  }
  
  return response;
}

async function authenticate() {
  console.log('🔐 Authenticating...');
  
  // First, login with credentials
  const loginResponse = await makeRequest('POST', '/api/login', {
    username: TEST_USERNAME,
    password: TEST_PASSWORD
  });
  
  if (!loginResponse.ok) {
    throw new Error(`Authentication failed: ${loginResponse.status} ${loginResponse.statusText}`);
  }
  
  // Verify authentication by getting user info
  const userResponse = await makeRequest('GET', '/api/user');
  if (!userResponse.ok) {
    throw new Error(`Failed to verify authentication: ${userResponse.status}`);
  }
  
  const user = await userResponse.json();
  console.log(`✅ Authenticated as: ${user.username} (${user.role})`);
  return user;
}

async function testDatabaseIntegrity() {
  console.log('\n📊 Testing Database Integrity...');
  
  // Test 1: Get all products and verify manufacturer data
  const response = await makeRequest('GET', '/api/products');
  if (!response.ok) {
    throw new Error(`Failed to fetch products: ${response.status}`);
  }
  
  const products = await response.json();
  console.log(`✅ Retrieved ${products.length} products`);
  
  // Verify all products have manufacturer data
  const missingManufacturer = products.filter(p => !p.manufacturer || p.manufacturer.trim() === '');
  if (missingManufacturer.length > 0) {
    console.error(`❌ Found ${missingManufacturer.length} products without manufacturer data`);
    return false;
  }
  
  // Check manufacturer distribution
  const manufacturerCounts = {};
  products.forEach(p => {
    manufacturerCounts[p.manufacturer] = (manufacturerCounts[p.manufacturer] || 0) + 1;
  });
  
  console.log('📈 Manufacturer distribution:');
  Object.entries(manufacturerCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([manufacturer, count]) => {
      console.log(`   ${manufacturer}: ${count} products`);
    });
  
  return products.length === 243;
}

async function testManufacturerFiltering() {
  console.log('\n🔍 Testing Manufacturer Filtering...');
  
  // Test filtering by manufacturer
  const testManufacturers = ['Bromic', 'INFRATECH', 'Brustor'];
  
  for (const manufacturer of testManufacturers) {
    const response = await makeRequest('GET', `/api/products?manufacturer=${encodeURIComponent(manufacturer)}`);
    if (!response.ok) {
      console.error(`❌ Failed to filter by manufacturer ${manufacturer}: ${response.status}`);
      return false;
    }
    
    const filteredProducts = await response.json();
    const incorrectProducts = filteredProducts.filter(p => 
      !p.manufacturer.toLowerCase().includes(manufacturer.toLowerCase())
    );
    
    if (incorrectProducts.length > 0) {
      console.error(`❌ Filtering for ${manufacturer} returned incorrect products`);
      return false;
    }
    
    console.log(`✅ Manufacturer filter "${manufacturer}": ${filteredProducts.length} products`);
  }
  
  return true;
}

async function testProductCRUD() {
  console.log('\n✏️  Testing Product CRUD Operations...');
  
  // Test CREATE
  const newProduct = {
    name: 'Test Manufacturer Product',
    description: 'A test product for manufacturer field validation',
    manufacturer: 'Test Manufacturer Inc.',
    productType: 'simple',
    defaultUnitPrice: '199.99',
    defaultMarkupType: 'percentage',
    defaultMarkupValue: '25',
    unit: 'each'
  };
  
  const createResponse = await makeRequest('POST', '/api/products', newProduct);
  if (!createResponse.ok) {
    console.error(`❌ Failed to create product: ${createResponse.status}`);
    const error = await createResponse.text();
    console.error(error);
    return false;
  }
  
  const createdProduct = await createResponse.json();
  console.log(`✅ Created product: ${createdProduct.name} (ID: ${createdProduct.id})`);
  
  // Test READ
  const readResponse = await makeRequest('GET', `/api/products/${createdProduct.id}`);
  if (!readResponse.ok) {
    console.error(`❌ Failed to read product: ${readResponse.status}`);
    return false;
  }
  
  const readProduct = await readResponse.json();
  if (readProduct.manufacturer !== newProduct.manufacturer) {
    console.error(`❌ Product manufacturer mismatch: expected ${newProduct.manufacturer}, got ${readProduct.manufacturer}`);
    return false;
  }
  console.log(`✅ Read product: manufacturer = ${readProduct.manufacturer}`);
  
  // Test UPDATE
  const updateData = {
    manufacturer: 'Updated Test Manufacturer'
  };
  
  const updateResponse = await makeRequest('PUT', `/api/products/${createdProduct.id}`, updateData);
  if (!updateResponse.ok) {
    console.error(`❌ Failed to update product: ${updateResponse.status}`);
    return false;
  }
  
  const updatedProduct = await updateResponse.json();
  if (updatedProduct.manufacturer !== updateData.manufacturer) {
    console.error(`❌ Product update failed: expected ${updateData.manufacturer}, got ${updatedProduct.manufacturer}`);
    return false;
  }
  console.log(`✅ Updated product manufacturer to: ${updatedProduct.manufacturer}`);
  
  // Test DELETE
  const deleteResponse = await makeRequest('DELETE', `/api/products/${createdProduct.id}`);
  if (!deleteResponse.ok) {
    console.error(`❌ Failed to delete product: ${deleteResponse.status}`);
    return false;
  }
  console.log(`✅ Deleted test product`);
  
  return true;
}

async function testQuoteAndLineItems() {
  console.log('\n📋 Testing Quote and Line Items with Manufacturer Data...');
  
  // Get a few products to use in quote
  const productsResponse = await makeRequest('GET', '/api/products');
  const products = await productsResponse.json();
  const testProducts = products.slice(0, 3);
  
  // Get all accounts to use for quote
  const accountsResponse = await makeRequest('GET', '/api/accounts');
  const accounts = await accountsResponse.json();
  
  if (accounts.length === 0) {
    console.log('⚠️  No accounts found, skipping quote test');
    return true;
  }
  
  // Create a test quote
  const newQuote = {
    quoteNumber: `TEST-${Date.now()}`,
    accountId: accounts[0].id,
    customerId: accounts[0].id, // Legacy field
    projectName: 'Manufacturer Test Project',
    notes: 'Test quote for manufacturer field validation'
  };
  
  const createQuoteResponse = await makeRequest('POST', '/api/quotes', newQuote);
  if (!createQuoteResponse.ok) {
    console.error(`❌ Failed to create quote: ${createQuoteResponse.status}`);
    return false;
  }
  
  const createdQuote = await createQuoteResponse.json();
  console.log(`✅ Created quote: ${createdQuote.quoteNumber}`);
  
  // Add line items with products that have manufacturers
  for (let i = 0; i < testProducts.length; i++) {
    const product = testProducts[i];
    const lineItem = {
      quoteId: createdQuote.id,
      productId: product.id,
      description: `${product.name} (${product.manufacturer})`,
      quantity: '1',
      unitPrice: product.defaultUnitPrice,
      markupType: 'percentage',
      markupValue: '25'
    };
    
    const lineItemResponse = await makeRequest('POST', '/api/line-items', lineItem);
    if (!lineItemResponse.ok) {
      console.error(`❌ Failed to create line item: ${lineItemResponse.status}`);
      return false;
    }
    
    console.log(`✅ Added line item: ${product.name} (${product.manufacturer})`);
  }
  
  // Get quote with details to verify manufacturer data
  const quoteDetailResponse = await makeRequest('GET', `/api/quotes/${createdQuote.id}/with-details`);
  if (!quoteDetailResponse.ok) {
    console.error(`❌ Failed to get quote details: ${quoteDetailResponse.status}`);
    return false;
  }
  
  const quoteWithDetails = await quoteDetailResponse.json();
  const lineItemsWithoutManufacturer = quoteWithDetails.lineItems.filter(item => {
    // Check if the product has manufacturer data
    const product = testProducts.find(p => p.id === item.productId);
    return !product || !product.manufacturer;
  });
  
  if (lineItemsWithoutManufacturer.length > 0) {
    console.error(`❌ Found line items without manufacturer data`);
    return false;
  }
  
  console.log(`✅ Quote has ${quoteWithDetails.lineItems.length} line items with manufacturer data`);
  
  // Clean up - delete the test quote
  await makeRequest('DELETE', `/api/quotes/${createdQuote.id}`);
  console.log(`✅ Cleaned up test quote`);
  
  return true;
}

async function testAPIEndpoints() {
  console.log('\n🌐 Testing API Endpoints...');
  
  const endpoints = [
    { method: 'GET', path: '/api/products', description: 'Get all products' },
    { method: 'GET', path: '/api/products?manufacturer=Bromic', description: 'Filter by manufacturer' },
    { method: 'GET', path: '/api/accounts', description: 'Get accounts' },
    { method: 'GET', path: '/api/quotes', description: 'Get quotes' },
  ];
  
  for (const endpoint of endpoints) {
    const response = await makeRequest(endpoint.method, endpoint.path);
    if (!response.ok) {
      console.error(`❌ ${endpoint.description}: ${response.status}`);
      return false;
    }
    console.log(`✅ ${endpoint.description}: ${response.status}`);
  }
  
  return true;
}

async function testPerformance() {
  console.log('\n⚡ Testing Performance...');
  
  const startTime = Date.now();
  
  // Test multiple concurrent requests
  const promises = [];
  for (let i = 0; i < 5; i++) {
    promises.push(makeRequest('GET', '/api/products'));
  }
  
  const responses = await Promise.all(promises);
  const endTime = Date.now();
  
  const allSuccessful = responses.every(r => r.ok);
  if (!allSuccessful) {
    console.error('❌ Not all concurrent requests succeeded');
    return false;
  }
  
  const duration = endTime - startTime;
  console.log(`✅ 5 concurrent requests completed in ${duration}ms`);
  
  if (duration > 5000) {
    console.warn(`⚠️  Performance concern: requests took ${duration}ms (>5s)`);
  }
  
  return true;
}

async function runAllTests() {
  console.log('🧪 Starting Final Manufacturer Field Migration Testing');
  console.log('='.repeat(60));
  
  try {
    // Authenticate first
    await authenticate();
    
    // Run all tests
    const tests = [
      { name: 'Database Integrity', fn: testDatabaseIntegrity },
      { name: 'Manufacturer Filtering', fn: testManufacturerFiltering },
      { name: 'Product CRUD', fn: testProductCRUD },
      { name: 'Quote and Line Items', fn: testQuoteAndLineItems },
      { name: 'API Endpoints', fn: testAPIEndpoints },
      { name: 'Performance', fn: testPerformance }
    ];
    
    let passed = 0;
    let failed = 0;
    
    for (const test of tests) {
      try {
        const result = await test.fn();
        if (result) {
          passed++;
          console.log(`✅ ${test.name}: PASSED`);
        } else {
          failed++;
          console.log(`❌ ${test.name}: FAILED`);
        }
      } catch (error) {
        failed++;
        console.error(`❌ ${test.name}: ERROR - ${error.message}`);
      }
      
      // Small delay between tests
      await delay(100);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('🏁 FINAL RESULTS');
    console.log('='.repeat(60));
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📊 Total: ${passed + failed}`);
    
    if (failed === 0) {
      console.log('\n🎉 ALL TESTS PASSED! Manufacturer field migration is complete and working correctly.');
      process.exit(0);
    } else {
      console.log(`\n🚨 ${failed} test(s) failed. Please review the issues above.`);
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Test suite failed:', error.message);
    process.exit(1);
  }
}

// Run the tests
runAllTests();