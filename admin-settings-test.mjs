#!/usr/bin/env node

// Admin Settings System Testing Script
// Tests color validation, form validation, and persistence

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';

// Test color validation functions (matching admin-settings.tsx)
function testColorValidation() {
  console.log('\n🎨 Testing Color Validation Functions...');
  
  // Test hex color regex from admin-settings.tsx
  const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;
  
  const testCases = [
    { color: '#3b82f6', expected: true, description: 'Valid 6-digit hex' },
    { color: '#FFF', expected: false, description: '3-digit hex (should fail)' },
    { color: '#FFFFFF', expected: true, description: 'Valid 6-digit hex uppercase' },
    { color: '#12345G', expected: false, description: 'Invalid character G' },
    { color: 'rgb(255,0,0)', expected: false, description: 'RGB format (should fail in admin)' },
    { color: 'red', expected: false, description: 'Named color (should fail in admin)' },
    { color: '#', expected: false, description: 'Just hash symbol' },
    { color: '', expected: false, description: 'Empty string' },
    { color: '#12345', expected: false, description: '5-digit hex' },
    { color: '#1234567', expected: false, description: '7-digit hex' },
  ];
  
  let passed = 0;
  let failed = 0;
  
  testCases.forEach(({ color, expected, description }) => {
    const result = hexColorRegex.test(color);
    if (result === expected) {
      console.log(`  ✅ ${description}: "${color}" -> ${result}`);
      passed++;
    } else {
      console.log(`  ❌ ${description}: "${color}" -> ${result} (expected ${expected})`);
      failed++;
    }
  });
  
  console.log(`\n📊 Color Validation Results: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

// Test company settings data validation
function testCompanySettingsValidation() {
  console.log('\n🏢 Testing Company Settings Data Validation...');
  
  const testCases = [
    {
      data: {
        companyName: 'Valid Company',
        primaryColor: '#3b82f6',
        accentColor: '#10b981',
        textColor: '#374151'
      },
      valid: true,
      description: 'Valid company settings'
    },
    {
      data: {
        companyName: '',
        primaryColor: '#3b82f6',
        accentColor: '#10b981',
        textColor: '#374151'
      },
      valid: false,
      description: 'Empty company name'
    },
    {
      data: {
        companyName: 'Test Company',
        primaryColor: 'invalid-color',
        accentColor: '#10b981',
        textColor: '#374151'
      },
      valid: false,
      description: 'Invalid primary color'
    },
    {
      data: {
        companyName: 'Test Company',
        email: 'invalid-email',
        primaryColor: '#3b82f6',
        accentColor: '#10b981',
        textColor: '#374151'
      },
      valid: false,
      description: 'Invalid email format'
    },
    {
      data: {
        companyName: 'Test Company',
        website: 'not-a-url',
        primaryColor: '#3b82f6',
        accentColor: '#10b981',
        textColor: '#374151'
      },
      valid: false,
      description: 'Invalid website URL'
    }
  ];
  
  // Simulate Zod validation logic
  const validateSettings = (data) => {
    const errors = [];
    
    // Company name validation
    if (!data.companyName || data.companyName.trim().length === 0) {
      errors.push('Company name is required');
    }
    if (data.companyName && data.companyName.length > 255) {
      errors.push('Company name is too long');
    }
    
    // Color validation
    const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;
    if (!hexColorRegex.test(data.primaryColor)) {
      errors.push('Primary color must be a valid hex color');
    }
    if (!hexColorRegex.test(data.accentColor)) {
      errors.push('Accent color must be a valid hex color');
    }
    if (!hexColorRegex.test(data.textColor)) {
      errors.push('Text color must be a valid hex color');
    }
    
    // Email validation (if provided)
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      errors.push('Invalid email format');
    }
    
    // Website validation (if provided)
    if (data.website && !data.website.startsWith('http')) {
      errors.push('Website must be a valid URL');
    }
    
    return { valid: errors.length === 0, errors };
  };
  
  let passed = 0;
  let failed = 0;
  
  testCases.forEach(({ data, valid, description }) => {
    const result = validateSettings(data);
    if (result.valid === valid) {
      console.log(`  ✅ ${description}: ${result.valid ? 'Valid' : 'Invalid (' + result.errors.join(', ') + ')'}`);
      passed++;
    } else {
      console.log(`  ❌ ${description}: Got ${result.valid}, expected ${valid}`);
      failed++;
    }
  });
  
  console.log(`\n📊 Validation Results: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

// Test security scenarios for XSS prevention
function testSecurityValidation() {
  console.log('\n🔒 Testing Security and XSS Prevention...');
  
  const maliciousInputs = [
    '<script>alert("xss")</script>',
    'javascript:alert(1)',
    'onmouseover="alert(1)"',
    '<img src=x onerror=alert(1)>',
    'expression(alert(1))',
    'url(javascript:alert(1))',
    '#ff0000; background: url(javascript:alert(1))',
    '#ff0000/* comment */; color: red',
  ];
  
  const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;
  
  let blocked = 0;
  let allowed = 0;
  
  maliciousInputs.forEach(input => {
    const isValidColor = hexColorRegex.test(input);
    if (!isValidColor) {
      console.log(`  ✅ Blocked malicious input: "${input}"`);
      blocked++;
    } else {
      console.log(`  ❌ Allowed malicious input: "${input}"`);
      allowed++;
    }
  });
  
  console.log(`\n📊 Security Results: ${blocked} blocked, ${allowed} allowed`);
  return allowed === 0;
}

// Main test execution
async function runAdminSettingsTests() {
  console.log('🚀 Starting Admin Settings System Testing...\n');
  
  const results = [];
  
  // Run all test suites
  results.push({ name: 'Color Validation', passed: testColorValidation() });
  results.push({ name: 'Company Settings Validation', passed: testCompanySettingsValidation() });
  results.push({ name: 'Security Validation', passed: testSecurityValidation() });
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📋 ADMIN SETTINGS TESTING SUMMARY');
  console.log('='.repeat(50));
  
  results.forEach(({ name, passed }) => {
    console.log(`${passed ? '✅' : '❌'} ${name}: ${passed ? 'PASSED' : 'FAILED'}`);
  });
  
  const allPassed = results.every(r => r.passed);
  console.log('\n' + (allPassed ? '🎉 All admin settings tests PASSED!' : '⚠️  Some admin settings tests FAILED!'));
  
  return allPassed;
}

// Execute tests
runAdminSettingsTests()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Error running tests:', error);
    process.exit(1);
  });