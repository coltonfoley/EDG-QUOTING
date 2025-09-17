import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';

async function testAuth() {
  console.log("🔍 Testing Authentication System...\n");
  
  try {
    // Test 1: Login with admin credentials
    console.log("1. Testing login with admin/admin123...");
    const loginResponse = await fetch(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' }),
      credentials: 'include',
    });
    
    const setCookie = loginResponse.headers.get('set-cookie');
    console.log(`   Login response status: ${loginResponse.status}`);
    
    if (loginResponse.ok) {
      const userData = await loginResponse.json();
      console.log(`   ✅ Login successful! User: ${userData.username} (${userData.role})\n`);
      
      // Extract session cookie for authenticated requests
      const sessionCookie = setCookie || '';
      
      // Test 2: Access protected user endpoint
      console.log("2. Testing access to /api/user (protected endpoint)...");
      const userResponse = await fetch(`${BASE_URL}/api/user`, {
        headers: { 'Cookie': sessionCookie }
      });
      console.log(`   User endpoint status: ${userResponse.status}`);
      if (userResponse.ok) {
        console.log("   ✅ Can access protected user endpoint\n");
      } else {
        console.log("   ❌ Cannot access protected user endpoint\n");
      }
      
      // Test 3: Access accounts endpoint
      console.log("3. Testing access to /api/accounts (CRM feature)...");
      const accountsResponse = await fetch(`${BASE_URL}/api/accounts`, {
        headers: { 'Cookie': sessionCookie }
      });
      console.log(`   Accounts endpoint status: ${accountsResponse.status}`);
      if (accountsResponse.ok) {
        const accounts = await accountsResponse.json();
        console.log(`   ✅ Can access accounts! Found ${accounts.length} accounts\n`);
      } else {
        console.log("   ❌ Cannot access accounts endpoint\n");
      }
      
      // Test 4: Access quotes endpoint (Pipeline)
      console.log("4. Testing access to /api/quotes (Pipeline feature)...");
      const quotesResponse = await fetch(`${BASE_URL}/api/quotes`, {
        headers: { 'Cookie': sessionCookie }
      });
      console.log(`   Quotes endpoint status: ${quotesResponse.status}`);
      if (quotesResponse.ok) {
        const quotes = await quotesResponse.json();
        console.log(`   ✅ Can access quotes/pipeline! Found ${quotes.length} quotes\n`);
      } else {
        console.log("   ❌ Cannot access quotes endpoint\n");
      }
      
      // Test 5: Test creating an account
      console.log("5. Testing account creation...");
      const newAccount = {
        name: "Test Company",
        email: "test@testcompany.com",
        phone: "555-1234",
        accountType: "commercial",
        company: "Test Company Inc."
      };
      
      const createAccountResponse = await fetch(`${BASE_URL}/api/accounts`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Cookie': sessionCookie 
        },
        body: JSON.stringify(newAccount)
      });
      
      console.log(`   Create account status: ${createAccountResponse.status}`);
      if (createAccountResponse.ok) {
        const createdAccount = await createAccountResponse.json();
        console.log(`   ✅ Successfully created account: ${createdAccount.name} (ID: ${createdAccount.id})\n`);
      } else {
        console.log("   ❌ Failed to create account\n");
      }
      
      // Test 6: Logout
      console.log("6. Testing logout...");
      const logoutResponse = await fetch(`${BASE_URL}/api/logout`, {
        method: 'POST',
        headers: { 'Cookie': sessionCookie }
      });
      console.log(`   Logout status: ${logoutResponse.status}`);
      if (logoutResponse.ok) {
        console.log("   ✅ Logout successful\n");
      } else {
        console.log("   ❌ Logout failed\n");
      }
      
    } else {
      console.log(`   ❌ Login failed with status ${loginResponse.status}\n`);
      const errorText = await loginResponse.text();
      console.log(`   Error: ${errorText}`);
    }
    
    console.log("✅ Authentication test complete!");
    
  } catch (error) {
    console.error("❌ Test failed with error:", error);
  }
}

// Run the test
testAuth();