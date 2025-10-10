import puppeteer from 'puppeteer';
import type { QuoteWithDetails } from '@shared/schema';

interface PDFGenerationOptions {
  quote: QuoteWithDetails;
  contractText: string;
  signingToken: string;
}

/**
 * Generate a PDF with embedded signatures on the server side using Puppeteer
 * This renders the same PDF that the client sees by loading the signing page
 */
export async function generateSignedPDF(options: PDFGenerationOptions): Promise<Buffer> {
  const { signingToken } = options;

  // Launch headless browser with system Chromium
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  try {
    const page = await browser.newPage();
    
    // Load the signing page which will generate the PDF with signatures
    const signingUrl = `${process.env.REPL_URL || 'http://localhost:5000'}/sign/${signingToken}`;
    await page.goto(signingUrl, { waitUntil: 'networkidle0' });

    // Wait for PDF to be generated
    await page.waitForSelector('[data-testid="pdf-preview"]', { timeout: 30000 });

    // Get the PDF blob URL from the iframe
    const pdfDataUrl = await page.evaluate(() => {
      const iframe = document.querySelector('[data-testid="pdf-preview"]') as HTMLIFrameElement;
      return iframe?.src || '';
    });

    // If we have a blob URL, fetch and convert to buffer
    if (pdfDataUrl.startsWith('blob:')) {
      const pdfBuffer = await page.evaluate(async (url: string) => {
        const response = await fetch(url);
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        return Array.from(new Uint8Array(arrayBuffer));
      }, pdfDataUrl);

      return Buffer.from(pdfBuffer);
    }

    // Fallback: generate PDF from page
    const pdf = await page.pdf({
      format: 'letter',
      printBackground: true
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
