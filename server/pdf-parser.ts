// Wrapper for pdf-parse to handle the test file issue
export async function parsePDF(dataBuffer: Buffer): Promise<{ text: string; error?: string }> {
  try {
    // Validate buffer
    if (!dataBuffer || dataBuffer.length === 0) {
      return { 
        text: '', 
        error: 'The PDF file appears to be empty or corrupted.' 
      };
    }
    
    // Check for PDF signature
    const pdfSignature = dataBuffer.slice(0, 4).toString();
    if (!pdfSignature.startsWith('%PDF')) {
      return { 
        text: '', 
        error: 'The file does not appear to be a valid PDF document.' 
      };
    }
    
    // Dynamic import to avoid the test file loading issue
    const pdfParse = await import('pdf-parse/lib/pdf-parse.js');
    const data = await pdfParse.default(dataBuffer);
    
    // Check if we got any text
    if (!data.text || data.text.trim().length === 0) {
      return { 
        text: '', 
        error: 'No text could be extracted from the PDF. The document may be scanned or contain only images.' 
      };
    }
    
    return { text: data.text };
  } catch (error: any) {
    console.error('PDF parsing error:', error);
    
    // Provide specific error messages based on error type
    let errorMessage = 'Failed to parse the PDF file.';
    
    if (error.message?.includes('encrypted') || error.message?.includes('password')) {
      errorMessage = 'The PDF is password-protected and cannot be processed.';
    } else if (error.message?.includes('Invalid') || error.message?.includes('corrupt')) {
      errorMessage = 'The PDF file appears to be corrupted or invalid.';
    } else if (error.message?.includes('memory')) {
      errorMessage = 'The PDF file is too large to process.';
    }
    
    return { text: '', error: errorMessage };
  }
}