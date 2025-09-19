#!/usr/bin/env node

// Image Upload System Testing Script
// Tests file validation, image storage, and upload functionality

import fs from 'fs';
import path from 'path';

// Test file validation functions (matching image-upload.tsx)
function testFileValidation() {
  console.log('\n📁 Testing File Validation Functions...');
  
  // File validation logic from image-upload.tsx
  const validateFile = (file, existingCount = 0, uploadingCount = 0) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    const maxSize = 10 * 1024 * 1024; // 10MB

    if (!allowedTypes.includes(file.type)) {
      return 'Invalid file type. Please upload JPEG, PNG, WebP, or GIF images.';
    }

    if (file.size > maxSize) {
      return 'File size exceeds 10MB limit.';
    }

    if (existingCount + uploadingCount >= 20) {
      return 'Maximum of 20 images per quote allowed.';
    }

    return null;
  };
  
  const testCases = [
    {
      file: { type: 'image/jpeg', size: 1024 * 1024, name: 'test.jpg' },
      expected: null,
      description: 'Valid JPEG file (1MB)'
    },
    {
      file: { type: 'image/png', size: 5 * 1024 * 1024, name: 'test.png' },
      expected: null,
      description: 'Valid PNG file (5MB)'
    },
    {
      file: { type: 'image/webp', size: 2 * 1024 * 1024, name: 'test.webp' },
      expected: null,
      description: 'Valid WebP file (2MB)'
    },
    {
      file: { type: 'image/gif', size: 500 * 1024, name: 'test.gif' },
      expected: null,
      description: 'Valid GIF file (500KB)'
    },
    {
      file: { type: 'image/bmp', size: 1024 * 1024, name: 'test.bmp' },
      expected: 'Invalid file type. Please upload JPEG, PNG, WebP, or GIF images.',
      description: 'Invalid BMP file type'
    },
    {
      file: { type: 'text/plain', size: 1024, name: 'test.txt' },
      expected: 'Invalid file type. Please upload JPEG, PNG, WebP, or GIF images.',
      description: 'Invalid text file'
    },
    {
      file: { type: 'image/jpeg', size: 15 * 1024 * 1024, name: 'large.jpg' },
      expected: 'File size exceeds 10MB limit.',
      description: 'File too large (15MB)'
    },
    {
      file: { type: 'image/jpeg', size: 1024 * 1024, name: 'test.jpg' },
      existingCount: 20,
      expected: 'Maximum of 20 images per quote allowed.',
      description: 'Too many existing images'
    },
    {
      file: { type: 'image/jpeg', size: 1024 * 1024, name: 'test.jpg' },
      existingCount: 10,
      uploadingCount: 10,
      expected: 'Maximum of 20 images per quote allowed.',
      description: 'Too many images including uploads'
    }
  ];
  
  let passed = 0;
  let failed = 0;
  
  testCases.forEach(({ file, existingCount = 0, uploadingCount = 0, expected, description }) => {
    const result = validateFile(file, existingCount, uploadingCount);
    if (result === expected) {
      console.log(`  ✅ ${description}: ${result || 'Valid'}`);
      passed++;
    } else {
      console.log(`  ❌ ${description}: Got "${result}", expected "${expected}"`);
      failed++;
    }
  });
  
  console.log(`\n📊 File Validation Results: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

// Test image metadata validation
function testImageMetadataValidation() {
  console.log('\n🖼️  Testing Image Metadata Validation...');
  
  const validateImageMetadata = (metadata) => {
    const errors = [];
    
    // Required fields
    if (!metadata.fileName || metadata.fileName.trim().length === 0) {
      errors.push('File name is required');
    }
    if (!metadata.filePath || metadata.filePath.trim().length === 0) {
      errors.push('File path is required');
    }
    if (!metadata.mimeType) {
      errors.push('MIME type is required');
    }
    if (typeof metadata.fileSize !== 'number' || metadata.fileSize <= 0) {
      errors.push('Valid file size is required');
    }
    
    // File name validation
    if (metadata.fileName && metadata.fileName.length > 255) {
      errors.push('File name is too long (max 255 characters)');
    }
    
    // MIME type validation
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (metadata.mimeType && !allowedMimeTypes.includes(metadata.mimeType)) {
      errors.push('Invalid MIME type');
    }
    
    // Alt text validation (optional but if provided, should be reasonable length)
    if (metadata.altText && metadata.altText.length > 500) {
      errors.push('Alt text is too long (max 500 characters)');
    }
    
    // Display order validation
    if (metadata.displayOrder !== undefined && (typeof metadata.displayOrder !== 'number' || metadata.displayOrder < 0)) {
      errors.push('Display order must be a non-negative number');
    }
    
    return { valid: errors.length === 0, errors };
  };
  
  const testCases = [
    {
      metadata: {
        fileName: 'test-image.jpg',
        filePath: '/uploads/quote-1/test-image.jpg',
        mimeType: 'image/jpeg',
        fileSize: 1024 * 1024,
        displayOrder: 0
      },
      valid: true,
      description: 'Valid image metadata'
    },
    {
      metadata: {
        fileName: '',
        filePath: '/uploads/quote-1/test-image.jpg',
        mimeType: 'image/jpeg',
        fileSize: 1024 * 1024
      },
      valid: false,
      description: 'Empty file name'
    },
    {
      metadata: {
        fileName: 'test-image.jpg',
        filePath: '',
        mimeType: 'image/jpeg',
        fileSize: 1024 * 1024
      },
      valid: false,
      description: 'Empty file path'
    },
    {
      metadata: {
        fileName: 'test-image.jpg',
        filePath: '/uploads/quote-1/test-image.jpg',
        mimeType: 'image/bmp',
        fileSize: 1024 * 1024
      },
      valid: false,
      description: 'Invalid MIME type'
    },
    {
      metadata: {
        fileName: 'test-image.jpg',
        filePath: '/uploads/quote-1/test-image.jpg',
        mimeType: 'image/jpeg',
        fileSize: 0
      },
      valid: false,
      description: 'Invalid file size (zero)'
    },
    {
      metadata: {
        fileName: 'a'.repeat(300), // 300 characters
        filePath: '/uploads/quote-1/test-image.jpg',
        mimeType: 'image/jpeg',
        fileSize: 1024 * 1024
      },
      valid: false,
      description: 'File name too long'
    },
    {
      metadata: {
        fileName: 'test-image.jpg',
        filePath: '/uploads/quote-1/test-image.jpg',
        mimeType: 'image/jpeg',
        fileSize: 1024 * 1024,
        altText: 'a'.repeat(600), // 600 characters
      },
      valid: false,
      description: 'Alt text too long'
    },
    {
      metadata: {
        fileName: 'test-image.jpg',
        filePath: '/uploads/quote-1/test-image.jpg',
        mimeType: 'image/jpeg',
        fileSize: 1024 * 1024,
        displayOrder: -1
      },
      valid: false,
      description: 'Negative display order'
    }
  ];
  
  let passed = 0;
  let failed = 0;
  
  testCases.forEach(({ metadata, valid, description }) => {
    const result = validateImageMetadata(metadata);
    if (result.valid === valid) {
      console.log(`  ✅ ${description}: ${result.valid ? 'Valid' : 'Invalid (' + result.errors.join(', ') + ')'}`);
      passed++;
    } else {
      console.log(`  ❌ ${description}: Got ${result.valid}, expected ${valid}`);
      failed++;
    }
  });
  
  console.log(`\n📊 Metadata Validation Results: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

// Test image ordering and management
function testImageOrdering() {
  console.log('\n🔢 Testing Image Ordering and Management...');
  
  // Simulate image reordering logic
  const reorderImages = (images, newOrder) => {
    if (!Array.isArray(images) || !Array.isArray(newOrder)) {
      return { success: false, error: 'Invalid input parameters' };
    }
    
    if (images.length !== newOrder.length) {
      return { success: false, error: 'Order array length must match images array length' };
    }
    
    // Check all image IDs are present
    const imageIds = images.map(img => img.id).sort();
    const orderIds = [...newOrder].sort();
    
    if (JSON.stringify(imageIds) !== JSON.stringify(orderIds)) {
      return { success: false, error: 'All image IDs must be present in new order' };
    }
    
    // Reorder images
    const reordered = newOrder.map(id => images.find(img => img.id === id));
    return { success: true, images: reordered };
  };
  
  const testCases = [
    {
      images: [
        { id: 1, fileName: 'img1.jpg' },
        { id: 2, fileName: 'img2.jpg' },
        { id: 3, fileName: 'img3.jpg' }
      ],
      newOrder: [3, 1, 2],
      expectedOrder: ['img3.jpg', 'img1.jpg', 'img2.jpg'],
      shouldSucceed: true,
      description: 'Valid reordering'
    },
    {
      images: [
        { id: 1, fileName: 'img1.jpg' },
        { id: 2, fileName: 'img2.jpg' }
      ],
      newOrder: [2, 1, 3],
      shouldSucceed: false,
      description: 'Order array length mismatch'
    },
    {
      images: [
        { id: 1, fileName: 'img1.jpg' },
        { id: 2, fileName: 'img2.jpg' }
      ],
      newOrder: [2, 3],
      shouldSucceed: false,
      description: 'Missing image ID in order'
    },
    {
      images: [],
      newOrder: [],
      expectedOrder: [],
      shouldSucceed: true,
      description: 'Empty arrays'
    }
  ];
  
  let passed = 0;
  let failed = 0;
  
  testCases.forEach(({ images, newOrder, expectedOrder, shouldSucceed, description }) => {
    const result = reorderImages(images, newOrder);
    
    if (result.success === shouldSucceed) {
      if (shouldSucceed && expectedOrder) {
        const resultOrder = result.images.map(img => img.fileName);
        if (JSON.stringify(resultOrder) === JSON.stringify(expectedOrder)) {
          console.log(`  ✅ ${description}: Success, order = [${resultOrder.join(', ')}]`);
          passed++;
        } else {
          console.log(`  ❌ ${description}: Wrong order. Got [${resultOrder.join(', ')}], expected [${expectedOrder.join(', ')}]`);
          failed++;
        }
      } else if (!shouldSucceed) {
        console.log(`  ✅ ${description}: Correctly failed - ${result.error}`);
        passed++;
      } else {
        console.log(`  ✅ ${description}: Success`);
        passed++;
      }
    } else {
      console.log(`  ❌ ${description}: Expected ${shouldSucceed ? 'success' : 'failure'}, got ${result.success ? 'success' : 'failure'}`);
      failed++;
    }
  });
  
  console.log(`\n📊 Image Ordering Results: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

// Test security considerations for image uploads
function testImageUploadSecurity() {
  console.log('\n🔒 Testing Image Upload Security...');
  
  const securityTests = [
    {
      fileName: 'normal-image.jpg',
      safe: true,
      description: 'Normal image filename'
    },
    {
      fileName: '../../../etc/passwd',
      safe: false,
      description: 'Path traversal attempt'
    },
    {
      fileName: 'image.jpg.php',
      safe: false,
      description: 'Double extension attack'
    },
    {
      fileName: '<script>alert(1)</script>.jpg',
      safe: false,
      description: 'XSS in filename'
    },
    {
      fileName: 'CON.jpg',
      safe: false,
      description: 'Windows reserved name'
    },
    {
      fileName: 'image with spaces.jpg',
      safe: true,
      description: 'Filename with spaces'
    },
    {
      fileName: 'image-with-dashes_and_underscores.jpg',
      safe: true,
      description: 'Filename with special chars'
    },
    {
      fileName: 'img.exe',
      safe: false,
      description: 'Executable extension'
    }
  ];
  
  const isSecureFileName = (fileName) => {
    // Basic security checks
    if (fileName.includes('..')) return false; // Path traversal
    if (fileName.includes('<') || fileName.includes('>')) return false; // XSS
    if (/\.(php|exe|bat|cmd|com|pif|scr|vbs|js)$/i.test(fileName)) return false; // Dangerous extensions
    if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(fileName.split('.')[0])) return false; // Windows reserved
    return true;
  };
  
  let passed = 0;
  let failed = 0;
  
  securityTests.forEach(({ fileName, safe, description }) => {
    const result = isSecureFileName(fileName);
    if (result === safe) {
      console.log(`  ✅ ${description}: "${fileName}" -> ${result ? 'Safe' : 'Blocked'}`);
      passed++;
    } else {
      console.log(`  ❌ ${description}: "${fileName}" -> ${result ? 'Safe' : 'Blocked'} (expected ${safe ? 'Safe' : 'Blocked'})`);
      failed++;
    }
  });
  
  console.log(`\n📊 Security Results: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

// Main test execution
async function runImageUploadTests() {
  console.log('🚀 Starting Image Upload System Testing...\n');
  
  const results = [];
  
  // Run all test suites
  results.push({ name: 'File Validation', passed: testFileValidation() });
  results.push({ name: 'Image Metadata Validation', passed: testImageMetadataValidation() });
  results.push({ name: 'Image Ordering', passed: testImageOrdering() });
  results.push({ name: 'Upload Security', passed: testImageUploadSecurity() });
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📋 IMAGE UPLOAD TESTING SUMMARY');
  console.log('='.repeat(50));
  
  results.forEach(({ name, passed }) => {
    console.log(`${passed ? '✅' : '❌'} ${name}: ${passed ? 'PASSED' : 'FAILED'}`);
  });
  
  const allPassed = results.every(r => r.passed);
  console.log('\n' + (allPassed ? '🎉 All image upload tests PASSED!' : '⚠️  Some image upload tests FAILED!'));
  
  return allPassed;
}

// Execute tests
runImageUploadTests()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Error running tests:', error);
    process.exit(1);
  });