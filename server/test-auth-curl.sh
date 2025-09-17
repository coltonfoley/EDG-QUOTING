#!/bin/bash

BASE_URL="http://localhost:5000"

echo "🔍 Testing Authentication System..."
echo ""

# Test 1: Login
echo "1. Testing login with admin/admin123..."
curl -c cookies.txt -X POST ${BASE_URL}/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' \
  -s -o login-response.json

if [ $? -eq 0 ]; then
  echo "   ✅ Login successful!"
  cat login-response.json | grep -o '"username":"[^"]*"' | sed 's/"username":"/   User: /; s/"$//'
  echo ""
else
  echo "   ❌ Login failed"
  exit 1
fi

# Test 2: Access user endpoint
echo "2. Testing access to /api/user (protected endpoint)..."
STATUS=$(curl -b cookies.txt ${BASE_URL}/api/user -s -w "%{http_code}" -o user-response.json)
echo "   User endpoint status: $STATUS"
if [ "$STATUS" = "200" ]; then
  echo "   ✅ Can access protected user endpoint"
else
  echo "   ❌ Cannot access protected user endpoint"
fi
echo ""

# Test 3: Access accounts
echo "3. Testing access to /api/accounts (CRM feature)..."
STATUS=$(curl -b cookies.txt ${BASE_URL}/api/accounts -s -w "%{http_code}" -o accounts.json)
echo "   Accounts endpoint status: $STATUS"
if [ "$STATUS" = "200" ]; then
  ACCOUNT_COUNT=$(cat accounts.json | grep -o '"id"' | wc -l)
  echo "   ✅ Can access accounts! Found $ACCOUNT_COUNT accounts"
else
  echo "   ❌ Cannot access accounts endpoint"
fi
echo ""

# Test 4: Access quotes/pipeline
echo "4. Testing access to /api/quotes (Pipeline feature)..."
STATUS=$(curl -b cookies.txt ${BASE_URL}/api/quotes -s -w "%{http_code}" -o quotes.json)
echo "   Quotes endpoint status: $STATUS"
if [ "$STATUS" = "200" ]; then
  QUOTE_COUNT=$(cat quotes.json | grep -o '"id"' | wc -l)
  echo "   ✅ Can access quotes/pipeline! Found $QUOTE_COUNT quotes"
else
  echo "   ❌ Cannot access quotes endpoint"
fi
echo ""

# Test 5: Create account
echo "5. Testing account creation..."
TIMESTAMP=$(date +%s)
STATUS=$(curl -b cookies.txt -X POST ${BASE_URL}/api/accounts \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Test Company $TIMESTAMP\",\"email\":\"test$TIMESTAMP@example.com\",\"phone\":\"555-1234\",\"accountType\":\"commercial\"}" \
  -s -w "%{http_code}" -o create-account.json)
echo "   Create account status: $STATUS"
if [ "$STATUS" = "201" ] || [ "$STATUS" = "200" ]; then
  echo "   ✅ Successfully created account"
  cat create-account.json | grep -o '"name":"[^"]*"' | sed 's/"name":"/      Name: /; s/"$//'
else
  echo "   ❌ Failed to create account"
fi
echo ""

# Test 6: Check users endpoint
echo "6. Testing /api/users endpoint (for rep filters)..."
STATUS=$(curl -b cookies.txt ${BASE_URL}/api/users -s -w "%{http_code}" -o users.json)
echo "   Users endpoint status: $STATUS"
if [ "$STATUS" = "200" ]; then
  USER_COUNT=$(cat users.json | grep -o '"username"' | wc -l)
  echo "   ✅ Can access users! Found $USER_COUNT users"
else
  echo "   ❌ Cannot access users endpoint"
fi
echo ""

# Test 7: Logout
echo "7. Testing logout..."
STATUS=$(curl -b cookies.txt -X POST ${BASE_URL}/api/logout -s -w "%{http_code}" -o /dev/null)
echo "   Logout status: $STATUS"
if [ "$STATUS" = "200" ]; then
  echo "   ✅ Logout successful"
else
  echo "   ❌ Logout failed"
fi
echo ""

# Test 8: Verify logout (should fail)
echo "8. Verifying logout (should now be unauthorized)..."
STATUS=$(curl -b cookies.txt ${BASE_URL}/api/user -s -w "%{http_code}" -o /dev/null)
echo "   User endpoint after logout status: $STATUS"
if [ "$STATUS" = "401" ]; then
  echo "   ✅ Correctly unauthorized after logout"
else
  echo "   ❌ Still authorized after logout (unexpected)"
fi
echo ""

# Clean up
rm -f cookies.txt login-response.json user-response.json accounts.json quotes.json create-account.json users.json

echo "✅ Authentication test complete!"