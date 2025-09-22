#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

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

// Test navigation structure
function testNavigationStructure() {
  console.log('\n🧭 Testing Navigation Structure...');
  
  try {
    const appPath = 'client/src/App.tsx';
    const headerPath = 'client/src/components/app-header.tsx';
    
    // Check main App component
    if (fs.existsSync(appPath)) {
      const appContent = fs.readFileSync(appPath, 'utf8');
      
      const appTests = [
        { name: 'Router setup (wouter)', pattern: /import.*Router|<Router/ },
        { name: 'Route definitions', pattern: /<Route/ },
        { name: 'Quotes page route', pattern: /path.*quotes.*component|\/quotes/ },
        { name: 'Products page route', pattern: /path.*products.*component|\/products/ },
        { name: 'Quote builder route', pattern: /quotes\/.*component/ }
      ];
      
      appTests.forEach(test => {
        const hasFeature = test.pattern.test(appContent);
        logResult(`App: ${test.name}`, hasFeature);
      });
    }
    
    // Check header navigation
    if (fs.existsExists(headerPath)) {
      const headerContent = fs.readFileSync(headerPath, 'utf8');
      
      const headerTests = [
        { name: 'Navigation links', pattern: /Link.*to|href/ },
        { name: 'Authentication status', pattern: /useAuth|isAuthenticated/ },
        { name: 'Logout functionality', pattern: /logout|signOut/ },
        { name: 'User info display', pattern: /user.*name|username/ }
      ];
      
      headerTests.forEach(test => {
        const hasFeature = test.pattern.test(headerContent);
        logResult(`Header: ${test.name}`, hasFeature);
      });
    }
    
  } catch (error) {
    logResult('Navigation structure test', false, error.message);
  }
}

// Test page components exist and are structured correctly
function testPageComponents() {
  console.log('\n📄 Testing Page Components...');
  
  const pages = [
    { name: 'Quotes', path: 'client/src/pages/quotes.tsx' },
    { name: 'Quote Builder', path: 'client/src/pages/quote-builder.tsx' },
    { name: 'Products', path: 'client/src/pages/products.tsx' },
    { name: 'Auth', path: 'client/src/pages/auth-page.tsx' }
  ];
  
  pages.forEach(page => {
    try {
      if (fs.existsSync(page.path)) {
        const content = fs.readFileSync(page.path, 'utf8');
        
        // Check for basic component structure
        const hasDefaultExport = /export default/.test(content);
        const hasJSX = /<div|<Card|<Button/.test(content);
        const hasAppHeader = /AppHeader/.test(content);
        
        logResult(`${page.name} page exists and structured`, hasDefaultExport && hasJSX);
        logResult(`${page.name} includes AppHeader`, hasAppHeader);
        
        // Check for specific functionality
        if (page.name === 'Quotes') {
          const quotesFeatures = [
            { name: 'Quote list display', pattern: /quotes.*map|map.*quote/ },
            { name: 'Search functionality', pattern: /search.*term|filter/ },
            { name: 'New quote button', pattern: /New Quote|Plus.*icon/ },
            { name: 'Proposal generator integration', pattern: /SimpleProposalGenerator/ }
          ];
          
          quotesFeatures.forEach(feature => {
            const hasFeature = feature.pattern.test(content);
            logResult(`Quotes: ${feature.name}`, hasFeature);
          });
        }
        
        if (page.name === 'Products') {
          const productsFeatures = [
            { name: 'Product catalog display', pattern: /products.*map|map.*product/ },
            { name: 'Product creation', pattern: /Add Product|Plus.*icon/ },
            { name: 'Product editing', pattern: /Edit.*product|update.*product/ },
            { name: 'Search/filter functionality', pattern: /search.*term|filter/ }
          ];
          
          productsFeatures.forEach(feature => {
            const hasFeature = feature.pattern.test(content);
            logResult(`Products: ${feature.name}`, hasFeature);
          });
        }
        
      } else {
        logResult(`${page.name} page exists`, false, `File not found: ${page.path}`);
      }
    } catch (error) {
      logResult(`${page.name} page test`, false, error.message);
    }
  });
}

// Test UI components and their structure
function testUIComponents() {
  console.log('\n🎨 Testing UI Components...');
  
  try {
    const uiComponentsPath = 'client/src/components/ui';
    
    if (fs.existsSync(uiComponentsPath)) {
      const uiFiles = fs.readdirSync(uiComponentsPath);
      
      const requiredUIComponents = [
        'button.tsx',
        'dialog.tsx', 
        'card.tsx',
        'form.tsx',
        'input.tsx',
        'table.tsx',
        'badge.tsx',
        'switch.tsx'
      ];
      
      requiredUIComponents.forEach(component => {
        const exists = uiFiles.includes(component);
        logResult(`UI Component: ${component.replace('.tsx', '')}`, exists);
      });
      
      logResult('UI components directory exists', true, `Found ${uiFiles.length} UI components`);
    } else {
      logResult('UI components directory exists', false, 'UI components directory not found');
    }
    
    // Test core business components
    const businessComponents = [
      'client/src/components/quote-header.tsx',
      'client/src/components/line-items-table.tsx',
      'client/src/components/quote-summary.tsx',
      'client/src/components/simple-proposal-generator.tsx'
    ];
    
    businessComponents.forEach(componentPath => {
      const componentName = path.basename(componentPath, '.tsx');
      const exists = fs.existsSync(componentPath);
      logResult(`Business Component: ${componentName}`, exists);
      
      if (exists) {
        const content = fs.readFileSync(componentPath, 'utf8');
        const hasProperExport = /export.*function|export default/.test(content);
        const usesTypeScript = /interface|type.*=/.test(content);
        
        logResult(`${componentName}: Proper exports`, hasProperExport);
        logResult(`${componentName}: TypeScript usage`, usesTypeScript);
      }
    });
    
  } catch (error) {
    logResult('UI components test', false, error.message);
  }
}

// Test for old image management UI removal
function testOldImageUIRemoval() {
  console.log('\n🗑️ Testing Old Image Management UI Removal...');
  
  try {
    const searchDirectories = [
      'client/src/components',
      'client/src/pages'
    ];
    
    const oldUIPatterns = [
      'ImageManagerDialog',
      'ComplexImageUploader',
      'ImageProcessingUI',
      'AdvancedFileManager',
      'image-management-ui',
      'complex-image-system',
      'old-image-manager'
    ];
    
    let foundOldUI = 0;
    let checkedFiles = 0;
    
    function searchDirectory(dirPath) {
      if (!fs.existsSync(dirPath)) return;
      
      const items = fs.readdirSync(dirPath, { withFileTypes: true });
      
      for (const item of items) {
        const fullPath = path.join(dirPath, item.name);
        
        if (item.isDirectory()) {
          searchDirectory(fullPath);
        } else if (item.isFile() && (item.name.endsWith('.tsx') || item.name.endsWith('.ts'))) {
          checkedFiles++;
          
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            
            oldUIPatterns.forEach(pattern => {
              if (content.includes(pattern)) {
                foundOldUI++;
                console.log(`   ⚠️  Found old UI pattern '${pattern}' in ${fullPath}`);
              }
            });
          } catch (error) {
            // Skip files that can't be read
          }
        }
      }
    }
    
    searchDirectories.forEach(dir => searchDirectory(dir));
    
    logResult('Old image management UI completely removed', foundOldUI === 0,
              foundOldUI > 0 ? `Found ${foundOldUI} old UI references in ${checkedFiles} files` : 
              `Checked ${checkedFiles} files, no old UI found`);
    
  } catch (error) {
    logResult('Old image UI removal test', false, error.message);
  }
}

// Test form validation and error handling
function testFormValidation() {
  console.log('\n📝 Testing Form Validation...');
  
  try {
    const formComponents = [
      'client/src/components/quote-header.tsx',
      'client/src/pages/auth-page.tsx'
    ];
    
    formComponents.forEach(componentPath => {
      if (fs.existsSync(componentPath)) {
        const content = fs.readFileSync(componentPath, 'utf8');
        const componentName = path.basename(componentPath, '.tsx');
        
        const formTests = [
          { name: 'React Hook Form usage', pattern: /useForm|react-hook-form/ },
          { name: 'Zod validation', pattern: /zodResolver|zod/ },
          { name: 'Form component usage', pattern: /<Form|FormField|FormControl/ },
          { name: 'Error handling', pattern: /form.*error|errors/ },
          { name: 'Toast notifications', pattern: /useToast|toast\(/ }
        ];
        
        formTests.forEach(test => {
          const hasFeature = test.pattern.test(content);
          logResult(`${componentName}: ${test.name}`, hasFeature);
        });
      }
    });
    
  } catch (error) {
    logResult('Form validation test', false, error.message);
  }
}

// Test routing and navigation
function testRoutingNavigation() {
  console.log('\n🔗 Testing Routing & Navigation...');
  
  try {
    // Check App.tsx for routing setup
    const appPath = 'client/src/App.tsx';
    
    if (fs.existsSync(appPath)) {
      const content = fs.readFileSync(appPath, 'utf8');
      
      const routingTests = [
        { name: 'Wouter router imported', pattern: /import.*Router.*wouter/ },
        { name: 'Route components defined', pattern: /<Route/ },
        { name: 'Protected routes', pattern: /ProtectedRoute|isAuthenticated/ },
        { name: 'Fallback route (404)', pattern: /Route.*path.*\*|NotFound/ }
      ];
      
      routingTests.forEach(test => {
        const hasFeature = test.pattern.test(content);
        logResult(`Routing: ${test.name}`, hasFeature);
      });
      
      // Check for specific routes
      const requiredRoutes = ['/auth', '/quotes', '/products', '/quotes/new', '/quotes/:id'];
      
      requiredRoutes.forEach(route => {
        const routePattern = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(':id', '.*');
        const hasRoute = new RegExp(routePattern).test(content);
        logResult(`Route defined: ${route}`, hasRoute);
      });
    }
    
    // Check for navigation links in components
    const headerPath = 'client/src/components/app-header.tsx';
    
    if (fs.existsSync(headerPath)) {
      const content = fs.readFileSync(headerPath, 'utf8');
      
      const navTests = [
        { name: 'Link component usage', pattern: /Link.*to|<Link/ },
        { name: 'Navigation menu', pattern: /nav|menu/ },
        { name: 'Active link styling', pattern: /useLocation|pathname/ }
      ];
      
      navTests.forEach(test => {
        const hasFeature = test.pattern.test(content);
        logResult(`Navigation: ${test.name}`, hasFeature);
      });
    }
    
  } catch (error) {
    logResult('Routing and navigation test', false, error.message);
  }
}

// Generate final report
function generateReport() {
  console.log('\n📊 NAVIGATION & UI TEST REPORT');
  console.log('================================');
  
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
    console.log('🎉 ALL NAVIGATION & UI TESTS PASSED!');
  } else if (successRate >= 80) {
    console.log('⚠️ MOSTLY WORKING: Some minor issues need attention.');
  } else {
    console.log('❌ SIGNIFICANT ISSUES: Multiple navigation/UI problems detected.');
  }
  
  // Save report
  const reportData = {
    timestamp: new Date().toISOString(),
    category: 'Navigation & UI',
    summary: {
      totalTests: total,
      passed: testResults.passed,
      failed: testResults.failed,
      successRate: parseFloat(successRate)
    },
    issues: testResults.issues
  };
  
  fs.writeFileSync('NAVIGATION_UI_TEST_REPORT.json', JSON.stringify(reportData, null, 2));
  console.log('\n📄 Report saved to: NAVIGATION_UI_TEST_REPORT.json');
  
  return successRate >= 80;
}

// Main test runner
function runNavigationUITests() {
  console.log('🧪 NAVIGATION & UI TESTING');
  console.log('==========================');
  console.log(`Timestamp: ${new Date().toISOString()}\n`);
  
  testNavigationStructure();
  testPageComponents();
  testUIComponents();
  testOldImageUIRemoval();
  testFormValidation();
  testRoutingNavigation();
  
  const success = generateReport();
  process.exit(success ? 0 : 1);
}

// Fix the typo in the original code
fs.existsExists = fs.existsSync;

// Run the tests
runNavigationUITests();