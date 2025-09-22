# Comprehensive Manual Testing Checklist

## Testing Environment
- **Application URL**: http://localhost:5000
- **Test User**: testuser / test123
- **Date**: 2025-09-22

## Test Results Legend
- ✅ PASS - Feature works as expected
- ❌ FAIL - Feature broken or doesn't work
- ⚠️ ISSUE - Partial functionality or minor issues
- 🔍 NOT TESTED - Not yet verified

---

## 1. Authentication Testing

### Login/Logout Flow
- [ ] Navigate to application URL
- [ ] Verify redirect to login page if not authenticated  
- [ ] Login with testuser/test123 credentials
- [ ] Verify successful login and redirect to dashboard
- [ ] Test logout functionality
- [ ] Verify logout clears session and redirects to login

**Result**: 🔍 NOT TESTED
**Notes**: 

---

## 2. Core Quote Functionality Testing

### Quote Creation
- [ ] Navigate to Quotes page
- [ ] Click "New Quote" button
- [ ] Fill in customer details (Name, Email, Phone, Company)
- [ ] Add project details (Name, Address, Start Date)
- [ ] Save new quote
- [ ] Verify quote number is generated automatically

**Result**: 🔍 NOT TESTED
**Notes**: 

### Quote Editing
- [ ] Open existing quote
- [ ] Edit customer information
- [ ] Update project details
- [ ] Modify quote settings (tax rate, discount, shipping)
- [ ] Save changes
- [ ] Verify changes are persisted

**Result**: 🔍 NOT TESTED
**Notes**: 

### Line Items Management
- [ ] Add products to quote as line items
- [ ] Modify quantities and unit prices
- [ ] Test markup calculations (percentage and fixed)
- [ ] Remove line items
- [ ] Verify totals update correctly

**Result**: 🔍 NOT TESTED
**Notes**: 

### Quote Status/Stage Management
- [ ] Change deal stage (new_lead → qualifying → consultation_scheduled, etc.)
- [ ] Update quote status (draft → sent → approved/rejected)
- [ ] Add notes to quote
- [ ] Verify status changes are saved

**Result**: 🔍 NOT TESTED
**Notes**: 

---

## 3. Product Management Testing

### Product Catalog
- [ ] Navigate to Products page
- [ ] View existing products list
- [ ] Search/filter products
- [ ] Verify product details display correctly

**Result**: 🔍 NOT TESTED
**Notes**: 

### Product Creation
- [ ] Click "Add Product" or create new product
- [ ] Fill in product details (name, SKU, description, pricing)
- [ ] Set product category and status
- [ ] Save new product
- [ ] Verify product appears in catalog

**Result**: 🔍 NOT TESTED
**Notes**: 

### Product Editing
- [ ] Select existing product
- [ ] Edit product information
- [ ] Update pricing and availability
- [ ] Save changes
- [ ] Verify updates are reflected in catalog

**Result**: 🔍 NOT TESTED
**Notes**: 

---

## 4. Simplified Proposal Generator Testing

### Basic Proposal Generation
- [ ] Open a quote that has line items
- [ ] Locate "Generate Proposal" button
- [ ] Click to open proposal generator dialog
- [ ] Verify default settings are loaded correctly

**Result**: 🔍 NOT TESTED
**Notes**: 

### Proposal Customization Options
- [ ] Test "Show Pricing" toggle (on/off)
- [ ] Test "Include Cover Page" toggle (on/off)
- [ ] Verify preview updates with toggle changes

**Result**: 🔍 NOT TESTED
**Notes**: 

### Cover Photo Upload
- [ ] Toggle "Include Cover Page" to ON
- [ ] Click to upload cover photo
- [ ] Select an image file (JPG, PNG)
- [ ] Verify image uploads successfully
- [ ] Test image preview display
- [ ] Test removing uploaded cover photo

**Result**: 🔍 NOT TESTED
**Notes**: 

### Product Renderings Upload
- [ ] Upload multiple product rendering images
- [ ] Test maximum file size limits
- [ ] Verify multiple images can be uploaded
- [ ] Test image preview functionality
- [ ] Test removing individual images

**Result**: 🔍 NOT TESTED
**Notes**: 

### PDF Generation and Download
- [ ] Configure proposal settings (pricing on/off, cover page, images)
- [ ] Click "Generate PDF" button
- [ ] Verify PDF generation process starts (loading indicator)
- [ ] Wait for PDF generation to complete
- [ ] Test PDF download functionality
- [ ] Open and verify PDF contains correct information

**Result**: 🔍 NOT TESTED
**Notes**: 

### PDF Content Verification
- [ ] Check PDF contains quote information (number, customer details)
- [ ] Verify line items are included with correct quantities and prices
- [ ] If pricing toggle was OFF, verify prices are hidden
- [ ] If cover page enabled, verify it's included with uploaded image
- [ ] Check product renderings are included in PDF
- [ ] Verify calculations (subtotals, tax, total) are correct

**Result**: 🔍 NOT TESTED
**Notes**: 

---

## 5. Navigation and UI Testing

### Page Navigation
- [ ] Test navigation between Quotes and Products pages
- [ ] Verify header/navigation menu works correctly
- [ ] Test breadcrumbs and back buttons
- [ ] Check responsive design on different screen sizes

**Result**: 🔍 NOT TESTED
**Notes**: 

### UI Components
- [ ] Test all buttons function correctly
- [ ] Verify forms validate input properly
- [ ] Check loading states and error messages
- [ ] Test modal dialogs open and close properly

**Result**: 🔍 NOT TESTED
**Notes**: 

### Old Image Management System Removal
- [ ] Look for any references to old complex image management
- [ ] Verify no broken links or missing components
- [ ] Check that only simplified image upload is available
- [ ] Confirm old image management UI is completely removed

**Result**: 🔍 NOT TESTED
**Notes**: 

---

## 6. Regression Testing

### Search Functionality
- [ ] Test search on Quotes page (by customer, project, quote number)
- [ ] Test search on Products page (by name, SKU, category)
- [ ] Verify search results are accurate
- [ ] Test search clearing/reset

**Result**: 🔍 NOT TESTED
**Notes**: 

### Data Persistence
- [ ] Create data (quotes, products, customers)
- [ ] Refresh browser and verify data persists
- [ ] Test data integrity after edits
- [ ] Verify no data loss during operations

**Result**: 🔍 NOT TESTED
**Notes**: 

### Error Handling
- [ ] Test form validation errors
- [ ] Test network error scenarios
- [ ] Verify error messages are user-friendly
- [ ] Check error recovery mechanisms

**Result**: 🔍 NOT TESTED
**Notes**: 

---

## Overall Test Summary

### Test Statistics
- Total Tests Planned: 
- Tests Passed: 
- Tests Failed: 
- Tests with Issues: 
- Tests Not Completed: 

### Critical Issues Found
1. 
2. 
3. 

### Recommendations
1. 
2. 
3. 

### Final Assessment
**System Status**: 🔍 TESTING IN PROGRESS
**Release Ready**: 🔍 TO BE DETERMINED

---

*Testing completed by: [Your Name]*  
*Date: [Test Date]*  
*Application Version: Current*