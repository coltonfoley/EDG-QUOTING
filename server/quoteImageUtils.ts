import sharp from 'sharp';
import puppeteer from 'puppeteer';

interface PDFPageImage {
  index: number;
  imageBase64: string;
}

/**
 * Server-side PDF to images conversion using Sharp with Puppeteer fallback
 * Pure vision-based processing - NO text extraction
 */
export async function convertPDFToImagesServer(pdfBuffer: Buffer): Promise<PDFPageImage[]> {
  try {
    // First try Sharp - it can handle PDFs if libvips has PDFium enabled
    try {
      console.log('📄 Attempting PDF conversion with Sharp...');
      
      // Get metadata to check page count
      const metadata = await sharp(pdfBuffer).metadata();
      const pageCount = metadata.pages || 1;
      const maxPages = Math.min(pageCount, 10); // Cap at 10 pages
      
      console.log(`📄 PDF has ${pageCount} pages, processing ${maxPages}`);
      
      const pages: PDFPageImage[] = [];
      
      for (let i = 0; i < maxPages; i++) {
        const pageBuffer = await sharp(pdfBuffer, {
          page: i,
          density: 180 // DPI for PDF rendering
        })
        .resize({ width: 1600, withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
        
        pages.push({
          index: i,
          imageBase64: pageBuffer.toString('base64')
        });
        
        console.log(`✅ Converted page ${i + 1}/${maxPages}`);
      }
      
      return pages;
      
    } catch (sharpError: any) {
      console.log('⚠️ Sharp PDF conversion failed, trying Puppeteer fallback:', sharpError.message);
      
      // Fallback to Puppeteer with PDF.js
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      try {
        const page = await browser.newPage();
        
        // Create HTML with PDF.js to render the PDF
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
          </head>
          <body>
            <canvas id="canvas"></canvas>
            <script>
              pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
              
              async function renderPDF(pdfData: string) {
                const pdf = await pdfjsLib.getDocument({ data: atob(pdfData) }).promise;
                const maxPages = Math.min(pdf.numPages, 10);
                const images = [];
                
                for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
                  const page = await pdf.getPage(pageNum);
                  const viewport = page.getViewport({ scale: 2.0 });
                  
                  const canvas = document.getElementById('canvas');
                  const context = canvas.getContext('2d');
                  canvas.width = Math.min(viewport.width, 1600);
                  canvas.height = viewport.height * (canvas.width / viewport.width);
                  
                  const renderViewport = page.getViewport({ scale: canvas.width / viewport.width });
                  
                  await page.render({
                    canvasContext: context,
                    viewport: renderViewport
                  }).promise;
                  
                  const imageData = canvas.toDataURL('image/jpeg', 0.85);
                  images.push({
                    index: pageNum - 1,
                    imageBase64: imageData.split(',')[1]
                  });
                }
                
                return images;
              }
            </script>
          </body>
          </html>
        `;
        
        await page.setContent(html);
        
        // Convert PDF buffer to base64 and render
        const pdfBase64 = pdfBuffer.toString('base64');
        const images = await page.evaluate(async (pdfData) => {
          return await renderPDF(pdfData);
        }, pdfBase64);
        
        console.log(`✅ Successfully converted ${images.length} pages with Puppeteer`);
        return images;
        
      } finally {
        await browser.close();
      }
    }
    
  } catch (error: any) {
    console.error('Server-side PDF conversion error:', error);
    throw new Error(`Failed to convert PDF to images on server: ${error.message || error}`);
  }
}