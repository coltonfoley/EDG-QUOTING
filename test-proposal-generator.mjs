#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test results tracking
const testResults = {
  passed: 0,
  failed: 0,
  issues: []
};

function logResult(testName, passed, details = '') {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${status} ${testName}`);
  
  if (details && !passed) {
    console.log(`   Details: ${details}`);
  }
  
  if (passed) {
    testResults.passed++;
  } else {
    testResults.failed++;
    testResults.issues.push({ test: testName, details });
  }
}

// Test 1: Verify SimpleProposalGenerator component exists and is properly structured
function testProposalGeneratorComponent() {
  console.log('\n📋 Testing Simple Proposal Generator Component Structure...');
  
  try {
    const componentPath = 'client/src/components/simple-proposal-generator.tsx';
    
    if (!fs.existsSync(componentPath)) {
      logResult('Component file exists', false, `File not found: ${componentPath}`);
      return;
    }
    
    const componentContent = fs.readFileSync(componentPath, 'utf8');
    
    // Test key component features
    const requiredFeatures = [
      { name: 'Show pricing toggle', pattern: /showPricing.*useState|useState.*showPricing/ },
      { name: 'Include cover page toggle', pattern: /includeCoverPage.*useState|useState.*includeCoverPage/ },
      { name: 'Cover photo upload', pattern: /coverPhoto.*useState|useState.*coverPhoto/ },
      { name: 'Product renderings upload', pattern: /productRenderings.*useState|useState.*productRenderings/ },
      { name: 'File upload handling', pattern: /handleFileUpload/ },
      { name: 'PDF generation', pattern: /generatePDF/ },
      { name: 'jsPDF integration', pattern: /jsPDF|new jsPDF/ },
      { name: 'Image format handling', pattern: /getImageFormat|convertImageToSupportedFormat/ },
      { name: 'Error handling for uploads', pattern: /toast.*title.*error|toast.*variant.*destructive/ }
    ];
    
    requiredFeatures.forEach(feature => {
      const hasFeature = feature.pattern.test(componentContent);
      logResult(`${feature.name} implementation`, hasFeature, 
                hasFeature ? '' : 'Feature not found in component');
    });
    
    // Test for old complex image management remnants
    const oldImagePatterns = [
      { name: 'Old image manager references', pattern: /ImageManager|ImageManagement/ },
      { name: 'Complex image processing', pattern: /ImageProcessor|ComplexImageHandler/ },
      { name: 'Old file management UI', pattern: /FileManagerUI|ComplexFileManager/ }
    ];
    
    oldImagePatterns.forEach(pattern => {
      const hasOldPattern = pattern.pattern.test(componentContent);
      logResult(`No ${pattern.name}`, !hasOldPattern, 
                hasOldPattern ? 'Old image management code still present' : '');
    });
    
  } catch (error) {
    logResult('Component structure test', false, error.message);
  }
}

// Test 2: Verify integration with quotes system
function testQuoteIntegration() {
  console.log('\n🔗 Testing Quote System Integration...');
  
  try {
    // Check quote-builder integration
    const quoteBuilderPath = 'client/src/pages/quote-builder.tsx';
    const quotesPagePath = 'client/src/pages/quotes.tsx';
    
    if (fs.existsSync(quoteBuilderPath)) {
      const content = fs.readFileSync(quoteBuilderPath, 'utf8');
      
      const integrationTests = [
        { name: 'SimpleProposalGenerator import', pattern: /import.*SimpleProposalGenerator/ },
        { name: 'Proposal generator dialog state', pattern: /proposalGeneratorOpen.*useState/ },
        { name: 'Generate Proposal button', pattern: /Generate Proposal|FileText/ },
        { name: 'Dialog integration', pattern: /<SimpleProposalGenerator/ }
      ];
      
      integrationTests.forEach(test => {
        const hasFeature = test.pattern.test(content);
        logResult(`Quote Builder: ${test.name}`, hasFeature);
      });
    }
    
    if (fs.existsSync(quotesPagePath)) {
      const content = fs.readFileSync(quotesPagePath, 'utf8');
      
      const quotesPageTests = [
        { name: 'SimpleProposalGenerator import', pattern: /import.*SimpleProposalGenerator/ },
        { name: 'Proposal generator integration', pattern: /SimpleProposalGenerator|proposalGeneratorOpen/ }
      ];
      
      quotesPageTests.forEach(test => {
        const hasFeature = test.pattern.test(content);
        logResult(`Quotes Page: ${test.name}`, hasFeature);
      });
    }
    
  } catch (error) {
    logResult('Quote integration test', false, error.message);
  }
}

// Test 3: Verify required dependencies are present
function testDependencies() {
  console.log('\n📦 Testing Required Dependencies...');
  
  try {
    const packageJsonPath = 'package.json';
    
    if (!fs.existsSync(packageJsonPath)) {
      logResult('package.json exists', false, 'package.json not found');
      return;
    }
    
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const allDeps = { 
      ...packageJson.dependencies, 
      ...packageJson.devDependencies 
    };
    
    const requiredDeps = [
      'jspdf',
      'lucide-react',
      '@react-pdf/renderer'
    ];
    
    requiredDeps.forEach(dep => {
      const hasDeenedeDep = dep in allDeps;
      logResult(`Dependency: ${dep}`, hasDeenedDep, 
                hasDeenedDep ? `Version: ${allDeps[dep]}` : 'Dependency missing');
    });
    
  } catch (error) {
    logResult('Dependencies test', false, error.message);
  }
}

// Test 4: Check for proper TypeScript types
function testTypeScriptTypes() {
  console.log('\n📝 Testing TypeScript Types and Interfaces...');
  
  try {
    const schemaPath = 'shared/schema.ts';
    
    if (fs.existsSync(schemaPath)) {
      const schemaContent = fs.readFileSync(schemaPath, 'utf8');
      
      const typeTests = [
        { name: 'QuoteWithDetails type', pattern: /QuoteWithDetails.*type|type.*QuoteWithDetails/ },
        { name: 'Quote schema export', pattern: /export.*QuoteWithDetails/ }
      ];
      
      typeTests.forEach(test => {
        const hasType = test.pattern.test(schemaContent);
        logResult(`Schema: ${test.name}`, hasType);
      });
    }
    
    const componentPath = 'client/src/components/simple-proposal-generator.tsx';
    if (fs.existsSync(componentPath)) {
      const content = fs.readFileSync(componentPath, 'utf8');
      
      const componentTypeTests = [
        { name: 'Props interface', pattern: /interface.*SimpleProposalGeneratorProps/ },
        { name: 'UploadedFile interface', pattern: /interface.*UploadedFile/ },
        { name: 'Proper type imports', pattern: /import.*type.*QuoteWithDetails/ }
      ];
      
      componentTypeTests.forEach(test => {
        const hasType = test.pattern.test(content);
        logResult(`Component Types: ${test.name}`, hasType);
      });
    }
    
  } catch (error) {
    logResult('TypeScript types test', false, error.message);
  }
}

// Test 5: Verify no old image management UI remains
function testOldImageManagementRemoval() {
  console.log('\n🗑️ Testing Old Image Management System Removal...');
  
  try {
    const searchPaths = [
      'client/src/components',
      'client/src/pages',
      'server'
    ];
    
    const oldPatterns = [
      'ImageManager',
      'ImageManagement',
      'ComplexImageProcessor',
      'AdvancedFileManager',
      'image-management-complex',
      'old-image-system'
    ];
    
    let foundOldReferences = 0;
    
    function searchInDirectory(dirPath, patterns) {
      if (!fs.existsSync(dirPath)) return;
      
      const items = fs.readdirSync(dirPath, { withFileTypes: true });
      
      for (const item of items) {
        const fullPath = path.join(dirPath, item.name);
        
        if (item.isDirectory()) {
          searchInDirectory(fullPath, patterns);
        } else if (item.isFile() && (item.name.endsWith('.ts') || item.name.endsWith('.tsx'))) {
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            
            patterns.forEach(pattern => {
              if (content.includes(pattern)) {
                foundOldReferences++;
                console.log(`   ⚠️  Found old reference '${pattern}' in ${fullPath}`);
              }
            });
          } catch (error) {
            // Skip files that can't be read
          }
        }
      }
    }
    
    searchPaths.forEach(searchPath => {
      searchInDirectory(searchPath, oldPatterns);
    });
    
    logResult('Old image management code removed', foundOldReferences === 0,
              foundOldReferences > 0 ? `Found ${foundOldReferences} old references` : '');
    
  } catch (error) {
    logResult('Old system removal test', false, error.message);
  }
}

// Test 6: Basic functionality validation
function testBasicFunctionality() {
  console.log('\n🔧 Testing Basic Functionality...');
  
  try {
    const componentPath = 'client/src/components/simple-proposal-generator.tsx';
    
    if (!fs.existsSync(componentPath)) {
      logResult('Component file for functionality test', false, 'Component file not found');
      return;
    }
    
    const content = fs.readFileSync(componentPath, 'utf8');
    
    // Test for critical functions
    const functionalityTests = [
      { name: 'File validation (size and type)', pattern: /file\.size|file\.type/ },
      { name: 'Image preview generation', pattern: /URL\.createObjectURL/ },
      { name: 'PDF content generation', pattern: /pdf\.text|pdf\.addImage/ },
      { name: 'Error handling with toasts', pattern: /toast.*variant.*destructive/ },
      { name: 'Loading states', pattern: /setIsGenerating|isGenerating/ },
      { name: 'File cleanup', pattern: /URL\.revokeObjectURL/ },
      { name: 'Format conversion support', pattern: /convertImageToSupportedFormat/ }
    ];
    
    functionalityTests.forEach(test => {
      const hasFunction = test.pattern.test(content);
      logResult(`Functionality: ${test.name}`, hasFunction);
    });
    
  } catch (error) {
    logResult('Basic functionality test', false, error.message);
  }
}

// Generate comprehensive report
function generateReport() {
  console.log('\n📊 TEST SUMMARY REPORT');
  console.log('========================');
  
  const total = testResults.passed + testResults.failed;
  const successRate = total > 0 ? ((testResults.passed / total) * 100).toFixed(1) : 0;
  
  console.log(`Total Tests: ${total}`);
  console.log(`Passed: ✅ ${testResults.passed}`);
  console.log(`Failed: ❌ ${testResults.failed}`);
  console.log(`Success Rate: ${successRate}%`);
  
  if (testResults.issues.length > 0) {
    console.log('\n❌ ISSUES FOUND:');
    testResults.issues.forEach((issue, index) => {
      console.log(`${index + 1}. ${issue.test}`);
      if (issue.details) {
        console.log(`   ${issue.details}`);
      }
    });
  }
  
  console.log('\n🎯 ASSESSMENT:');
  if (testResults.failed === 0) {
    console.log('🎉 ALL TESTS PASSED! Simplified proposal generator is working correctly.');
  } else if (successRate >= 80) {
    console.log('⚠️ MOSTLY WORKING: Some issues need attention but core functionality intact.');
  } else {
    console.log('❌ SIGNIFICANT ISSUES: Multiple problems detected that need immediate attention.');
  }
  
  // Save detailed report
  const reportData = {
    timestamp: new Date().toISOString(),
    summary: {
      totalTests: total,
      passed: testResults.passed,
      failed: testResults.failed,
      successRate: parseFloat(successRate)
    },
    issues: testResults.issues
  };
  
  fs.writeFileSync('PROPOSAL_GENERATOR_TEST_REPORT.json', JSON.stringify(reportData, null, 2));
  console.log('\n📄 Detailed report saved to: PROPOSAL_GENERATOR_TEST_REPORT.json');
  
  return successRate >= 80;
}

// Main test runner
function runTests() {
  console.log('🧪 SIMPLIFIED PROPOSAL GENERATOR TESTING');
  console.log('==========================================');
  console.log(`Timestamp: ${new Date().toISOString()}\n`);
  
  testProposalGeneratorComponent();
  testQuoteIntegration();
  testDependencies();
  testTypeScriptTypes();
  testOldImageManagementRemoval();
  testBasicFunctionality();
  
  const success = generateReport();
  process.exit(success ? 0 : 1);
}

// Run the tests
runTests();