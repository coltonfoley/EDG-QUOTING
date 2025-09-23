/**
 * PDF Parser Module - Handles PDF text extraction with robust error handling
 * Acts as a wrapper for pdf-parse library with validation and processing
 */

import type { Buffer } from 'buffer';

// Interface for PDF parsing results
export interface PDFParseResult {
  text?: string;
  error?: string;
  pageCount?: number;
  metadata?: {
    title?: string;
    author?: string;
    creator?: string;
    producer?: string;
    creationDate?: Date;
    modificationDate?: Date;
  };
}

/**
 * Parse PDF buffer and extract text content using PDF.js
 * More reliable than pdf-parse and avoids dependency issues
 */
export async function parsePDF(buffer: Buffer): Promise<PDFParseResult> {
  try {
    // Validate PDF signature
    if (!buffer || buffer.length < 4) {
      return {
        error: "Invalid PDF file - file is too small or corrupted"
      };
    }

    // Check PDF magic bytes
    const pdfSignature = buffer.subarray(0, 4).toString();
    if (pdfSignature !== '%PDF') {
      return {
        error: "Invalid PDF file - missing PDF signature"
      };
    }

    // Add polyfill for Promise.withResolvers (required for Node.js < v22)
    if (!Promise.withResolvers) {
      await import('@ungap/with-resolvers');
    }

    // Use PDF.js for reliable text extraction - correct server-side import
    const pdfjs = await import('pdfjs-dist');
    
    // Convert buffer to Uint8Array for PDF.js
    const uint8Array = new Uint8Array(buffer);
    
    // Load the PDF document using the default export or named export
    const getDocument = pdfjs.getDocument || pdfjs.default?.getDocument;
    if (!getDocument) {
      throw new Error('PDF.js getDocument function not found');
    }
    
    const loadingTask = getDocument({
      data: uint8Array,
      verbosity: 0 // Suppress console output
    });
    
    const pdf = await loadingTask.promise;
    
    const pageTexts: string[] = [];
    const maxPages = Math.min(pdf.numPages, 50); // Limit to prevent memory issues
    
    // Extract text from each page
    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      try {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        
        // Combine all text items with proper spacing
        const pageText = textContent.items
          .map((item: any) => {
            // Handle different text item types
            if (typeof item === 'string') return item;
            if (item.str) return item.str;
            return '';
          })
          .join(' ');
          
        pageTexts.push(pageText);
      } catch (pageError) {
        console.warn(`Warning: Failed to extract text from page ${pageNum}:`, pageError);
        // Continue with other pages
      }
    }
    
    // Combine all page texts
    const fullText = pageTexts.join('\n\n');
    
    // Validate that we extracted some text
    if (!fullText || fullText.trim().length === 0) {
      return {
        error: "No text content found in PDF - the file may contain only images, be password-protected, or be corrupted",
        pageCount: pdf.numPages
      };
    }

    // Clean and validate extracted text
    const cleanedText = fullText
      .replace(/\r\n/g, '\n')  // Normalize line endings
      .replace(/\r/g, '\n')    // Handle old Mac line endings
      .replace(/\n{3,}/g, '\n\n') // Reduce excessive line breaks
      .replace(/\s+/g, ' ')    // Normalize spaces
      .trim();

    return {
      text: cleanedText,
      pageCount: pdf.numPages,
      metadata: {
        // PDF.js metadata access is more complex, keeping it simple for now
        title: undefined,
        author: undefined,
        creator: undefined,
        producer: undefined,
        creationDate: undefined,
        modificationDate: undefined
      }
    };

  } catch (error: any) {
    console.error('PDF parsing error:', error);

    // Provide specific error messages for common issues
    if (error.message?.includes('Invalid PDF structure') || error.message?.includes('PDF parsing failed')) {
      return {
        error: "PDF structure is invalid or corrupted - unable to extract text"
      };
    }

    if (error.message?.includes('password') || error.message?.includes('encrypted')) {
      return {
        error: "PDF is password-protected or encrypted - cannot extract text"
      };
    }

    if (error.message?.includes('memory') || error.message?.includes('heap')) {
      return {
        error: "PDF file is too large or complex to process - try a smaller file"
      };
    }

    // Generic error fallback
    return {
      error: `Failed to parse PDF: ${error.message || 'Unknown parsing error'}`
    };
  }
}

/**
 * Validate PDF buffer before processing
 */
export function validatePDFBuffer(buffer: Buffer): { isValid: boolean; error?: string } {
  if (!buffer || buffer.length === 0) {
    return { isValid: false, error: "Empty or invalid file buffer" };
  }

  // Check minimum size (PDF header is at least 8 bytes)
  if (buffer.length < 8) {
    return { isValid: false, error: "File is too small to be a valid PDF" };
  }

  // Check PDF magic bytes
  const header = buffer.subarray(0, 4).toString();
  if (header !== '%PDF') {
    return { isValid: false, error: "File is not a valid PDF - missing PDF signature" };
  }

  // Check for PDF version
  const versionBytes = buffer.subarray(4, 8).toString();
  const versionMatch = versionBytes.match(/^-(\d\.\d)/);
  if (!versionMatch) {
    return { isValid: false, error: "Invalid PDF version format" };
  }

  const version = parseFloat(versionMatch[1]);
  if (version < 1.0 || version > 2.0) {
    return { isValid: false, error: `Unsupported PDF version: ${version}` };
  }

  return { isValid: true };
}

/**
 * Get PDF metadata without full text extraction (faster for validation)
 */
export async function getPDFMetadata(buffer: Buffer): Promise<{
  pageCount?: number;
  title?: string;
  author?: string;
  encrypted?: boolean;
  error?: string;
}> {
  try {
    const validation = validatePDFBuffer(buffer);
    if (!validation.isValid) {
      return { error: validation.error };
    }

    // Add polyfill for Promise.withResolvers if needed
    if (!Promise.withResolvers) {
      await import('@ungap/with-resolvers');
    }

    // Use PDF.js for metadata extraction - consistent with parsePDF
    const pdfjs = await import('pdfjs-dist');
    const uint8Array = new Uint8Array(buffer);
    
    const getDocument = pdfjs.getDocument || pdfjs.default?.getDocument;
    if (!getDocument) {
      throw new Error('PDF.js getDocument function not found');
    }
    
    const loadingTask = getDocument({
      data: uint8Array,
      verbosity: 0
    });
    
    const pdf = await loadingTask.promise;
    
    // Try to get metadata if available
    let title, author;
    try {
      const metadata = await pdf.getMetadata();
      const info = metadata.info as any; // Type assertion for metadata info
      title = info?.Title;
      author = info?.Author;
    } catch (metadataError) {
      // Metadata extraction is optional
    }

    return {
      pageCount: pdf.numPages,
      title,
      author,
      encrypted: false // PDF.js handles decryption automatically for non-password protected files
    };

  } catch (error: any) {
    return {
      error: `Failed to extract PDF metadata: ${error.message || 'Unknown error'}`
    };
  }
}