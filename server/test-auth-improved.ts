const BASE_URL = 'http://localhost:5000';

interface TestResult {
  success: boolean;
  message: string;
}

async function testAuthImproved(): Promise<void> {
  console.log("🔍 Testing Authentication System (Improved)...\n");
  
  // Use global-agent to handle cookies properly
  const agent = require('http').Agent();
  
  try {
    // Test 1: Login with admin credentials using curl (more reliable for cookies)
    console.log("1. Testing login with admin/admin123 using curl...");
    const { execSync } = require('child_process');
    
    // Login and save cookies
    execSync(`curl -c cookies.txt -X POST ${BASE_URL}/api/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}' -s -o login-response.json`);
    
    const loginResponse = JSON.parse(require('fs').readFileSync('login-response.json', 'utf8'));
    console.log(`   ✅ Login successful! User: ${loginResponse.username} (${loginResponse.role})`);
    console.log(`   User ID: ${loginResponse.id}\n`);
    
    // Test 2: Access protected user endpoint
    console.log("2. Testing access to /api/user (protected endpoint)...");
    const userResult = execSync(`curl -b cookies.txt ${BASE_URL}/api/user -s -w "\\n%{http_code}"`).toString();
    const userStatus = userResult.split('\n').pop();
    console.log(`   User endpoint status: ${userStatus}`);
    if (userStatus === '200') {
      console.log("   ✅ Can access protected user endpoint\n");
    } else {
      console.log("   ❌ Cannot access protected user endpoint\n");
    }
    
    // Test 3: Access accounts endpoint
    console.log("3. Testing access to /api/accounts (CRM feature)...");
    const accountsResult = execSync(`curl -b cookies.txt ${BASE_URL}/api/accounts -s -o accounts.json -w "%{http_code}"`).toString();
    console.log(`   Accounts endpoint status: ${accountsResult}`);
    if (accountsResult === '200') {
      const accounts = JSON.parse(require('fs').readFileSync('accounts.json', 'utf8'));
      console.log(`   ✅ Can access accounts! Found ${accounts.length} accounts`);
      if (accounts.length > 0) {
        console.log(`   First account: ${accounts[0].name}\n`);
      }
    } else {
      console.log("   ❌ Cannot access accounts endpoint\n");
    }
    
    // Test 4: Access quotes endpoint (Pipeline)
    console.log("4. Testing access to /api/quotes (Pipeline feature)...");
    const quotesResult = execSync(`curl -b cookies.txt ${BASE_URL}/api/quotes -s -o quotes.json -w "%{http_code}"`).toString();
    console.log(`   Quotes endpoint status: ${quotesResult}`);
    if (quotesResult === '200') {
      const quotes = JSON.parse(require('fs').readFileSync('quotes.json', 'utf8'));
      console.log(`   ✅ Can access quotes/pipeline! Found ${quotes.length} quotes\n`);
    } else {
      console.log("   ❌ Cannot access quotes endpoint\n");
    }
    
    // Test 5: Create an account
    console.log("5. Testing account creation...");
    const newAccountData = JSON.stringify({
      name: "Test Company " + Date.now(),
      email: "test" + Date.now() + "@example.com",
      phone: "555-" + Math.floor(Math.random() * 10000),
      accountType: "commercial",
      company: "Test Company Inc."
    });
    
    const createResult = execSync(`curl -b cookies.txt -X POST ${BASE_URL}/api/accounts -H "Content-Type: application/json" -d '${newAccountData}' -s -o create-account.json -w "%{http_code}"`).toString();
    console.log(`   Create account status: ${createResult}`);
    if (createResult === '201' || createResult === '200') {
      const createdAccount = JSON.parse(require('fs').readFileSync('create-account.json', 'utf8'));
      console.log(`   ✅ Successfully created account: ${createdAccount.name} (ID: ${createdAccount.id})\n`);
    } else {
      console.log("   ❌ Failed to create account\n");
    }
    
    // Test 6: Check users endpoint
    console.log("6. Testing /api/users endpoint (for rep filters)...");
    const usersResult = execSync(`curl -b cookies.txt ${BASE_URL}/api/users -s -o users.json -w "%{http_code}"`).toString();
    console.log(`   Users endpoint status: ${usersResult}`);
    if (usersResult === '200') {
      const users = JSON.parse(require('fs').readFileSync('users.json', 'utf8'));
      console.log(`   ✅ Can access users! Found ${users.length} users`);
      users.forEach((user: any) => {
        console.log(`      - ${user.username} (${user.role})`);
      });
      console.log("");
    } else {
      console.log("   ❌ Cannot access users endpoint\n");
    }
    
    // Test 7: Logout
    console.log("7. Testing logout...");
    const logoutResult = execSync(`curl -b cookies.txt -X POST ${BASE_URL}/api/logout -s -w "%{http_code}"`).toString();
    console.log(`   Logout status: ${logoutResult}`);
    if (logoutResult === '200') {
      console.log("   ✅ Logout successful\n");
    } else {
      console.log("   ❌ Logout failed\n");
    }
    
    // Clean up temp files
    require('fs').unlinkSync('cookies.txt');
    require('fs').unlinkSync('login-response.json');
    if (require('fs').existsSync('accounts.json')) require('fs').unlinkSync('accounts.json');
    if (require('fs').existsSync('quotes.json')) require('fs').unlinkSync('quotes.json');
    if (require('fs').existsSync('create-account.json')) require('fs').unlinkSync('create-account.json');
    if (require('fs').existsSync('users.json')) require('fs').unlinkSync('users.json');
    
    console.log("✅ Authentication test complete!");
    
  } catch (error) {
    console.error("❌ Test failed with error:", error);
  }
}

// Run the improved test
testAuthImproved();