// Wrapper for pdf-parse to handle the test file issue
export async function parsePDF(dataBuffer: Buffer): Promise<{ text: string }> {
  try {
    // Dynamic import to avoid the test file loading issue
    const pdfParse = await import('pdf-parse/lib/pdf-parse.js');
    const data = await pdfParse.default(dataBuffer);
    return { text: data.text };
  } catch (error) {
    console.error('PDF parsing error:', error);
    // Fallback: return empty text if parsing fails
    return { text: '' };
  }
}