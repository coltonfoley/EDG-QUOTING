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
 * Parse PDF buffer and extract text content
 * Uses dynamic import to avoid issues with test files and SSR
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

    // Dynamic import to avoid module loading issues in tests
    const pdfParse = await import('pdf-parse');
    const parseFunction = pdfParse.default || pdfParse;

    // Parse the PDF with options for better text extraction
    const options = {
      // Normalize whitespace and line breaks
      normalizeWhitespace: false,
      // Don't use worker (can cause issues in server environment)
      useWorkerFetch: false,
      // Maximum pages to process (prevent memory issues)
      max: 50
    };

    const result = await parseFunction(buffer, options);

    // Validate that we extracted some text
    if (!result.text || result.text.trim().length === 0) {
      return {
        error: "No text content found in PDF - the file may contain only images, be password-protected, or be corrupted",
        pageCount: result.numpages || 0
      };
    }

    // Clean and validate extracted text
    const cleanedText = result.text
      .replace(/\r\n/g, '\n')  // Normalize line endings
      .replace(/\r/g, '\n')    // Handle old Mac line endings
      .replace(/\n{3,}/g, '\n\n') // Reduce excessive line breaks
      .trim();

    return {
      text: cleanedText,
      pageCount: result.numpages || 0,
      metadata: {
        title: result.info?.Title,
        author: result.info?.Author,
        creator: result.info?.Creator,
        producer: result.info?.Producer,
        creationDate: result.info?.CreationDate ? new Date(result.info.CreationDate) : undefined,
        modificationDate: result.info?.ModDate ? new Date(result.info.ModDate) : undefined,
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

    // Use a lightweight approach to just get metadata
    const pdfParse = await import('pdf-parse');
    const parseFunction = pdfParse.default || pdfParse;

    // Parse with minimal options for metadata only
    const result = await parseFunction(buffer, { 
      pagerender: () => '', // Don't render pages for text
      max: 1 // Only process first page for metadata
    });

    return {
      pageCount: result.numpages,
      title: result.info?.Title,
      author: result.info?.Author,
      encrypted: result.info?.IsEncrypted === 'true' || result.info?.Encrypted === 'true'
    };

  } catch (error: any) {
    return {
      error: `Failed to extract PDF metadata: ${error.message || 'Unknown error'}`
    };
  }
}