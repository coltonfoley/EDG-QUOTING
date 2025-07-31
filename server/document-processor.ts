import OpenAI from "openai";
import type { InsertProduct } from "@shared/schema";
import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";
import pdf2pic from "pdf2pic";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface ProcessedDocument {
  products: InsertProduct[];
  summary: string;
  totalProducts: number;
}

async function convertPdfToImage(pdfBuffer: Buffer): Promise<{ base64: string; mimeType: string }> {
  try {
    // Create temporary directory for PDF processing
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Write PDF to temporary file with unique name
    const timestamp = Date.now();
    const tempPdfPath = path.join(tempDir, `temp_${timestamp}.pdf`);
    fs.writeFileSync(tempPdfPath, pdfBuffer);

    // Initialize pdf2pic converter with different approach
    const convert = pdf2pic.fromPath(tempPdfPath, {
      density: 100,
      saveFilename: `converted_${timestamp}`,
      savePath: tempDir,
      format: "jpg",
      width: 1500,
      height: 1500
    });

    // Convert first page only and get result
    const result = await convert(1);
    
    // Check if we got a file path result
    if (result && result.path) {
      // Read the converted image file
      const imageBuffer = fs.readFileSync(result.path);
      const base64 = imageBuffer.toString('base64');
      
      // Clean up temporary files
      fs.unlinkSync(tempPdfPath);
      fs.unlinkSync(result.path);

      return {
        base64,
        mimeType: 'image/jpeg'
      };
    } else {
      throw new Error("PDF conversion failed - no output generated");
    }
  } catch (error) {
    console.error("PDF conversion error:", error);
    throw new Error(`Failed to convert PDF to image: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function processManufacturerDocument(
  fileBuffer: Buffer,
  mimeType: string
): Promise<ProcessedDocument> {
  let base64Image: string;
  let finalMimeType: string;

  // Handle PDF conversion to image
  if (mimeType === 'application/pdf') {
    try {
      const converted = await convertPdfToImage(fileBuffer);
      base64Image = converted.base64;
      finalMimeType = converted.mimeType;
    } catch (error) {
      throw new Error('PDF processing is not available. Please convert your PDF to an image (PNG/JPG) and try again.');
    }
  } else {
    base64Image = fileBuffer.toString('base64');
    finalMimeType = mimeType;
  }
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an expert at analyzing manufacturer price lists and product catalogs. Extract product information from the uploaded document and format it as JSON.

For each product found, extract:
- name: Product name/title
- description: Brief description of the product
- category: Product category (e.g., "Shade Structures", "Hardware", "Fabric", "Installation")
- defaultUnitPrice: Base price as a number (remove currency symbols)
- unit: Unit of measurement (e.g., "sq ft", "linear ft", "each", "hour")
- defaultMarkupType: "percentage" 
- defaultMarkupValue: 50 (default 50% markup)

Respond with JSON in this exact format:
{
  "products": [
    {
      "name": "Product Name",
      "description": "Product description",
      "category": "Category",
      "defaultUnitPrice": 123.45,
      "unit": "sq ft",
      "defaultMarkupType": "percentage",
      "defaultMarkupValue": 50
    }
  ],
  "summary": "Brief summary of what was found",
  "totalProducts": 5
}`
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Please analyze this manufacturer document and extract all product information. Focus on finding products with prices, descriptions, and specifications."
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${finalMimeType};base64,${base64Image}`
              }
            }
          ],
        },
      ],
      max_tokens: 4000,
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    
    return {
      products: result.products || [],
      summary: result.summary || "No products found in document",
      totalProducts: result.totalProducts || 0
    };
  } catch (error) {
    console.error("Error processing document:", error);
    throw new Error(`Failed to process document: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function analyzeDocumentStructure(fileBuffer: Buffer, mimeType: string): Promise<string> {
  let base64Image: string;
  let finalMimeType: string;

  // Handle PDF conversion to image
  if (mimeType === 'application/pdf') {
    try {
      const converted = await convertPdfToImage(fileBuffer);
      base64Image = converted.base64;
      finalMimeType = converted.mimeType;
    } catch (error) {
      throw new Error('PDF processing is not available. Please convert your PDF to an image (PNG/JPG) and try again.');
    }
  } else {
    base64Image = fileBuffer.toString('base64');
    finalMimeType = mimeType;
  }
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Analyze this document and describe its structure, content type, and whether it contains product pricing information. What kind of manufacturer document is this?"
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${finalMimeType};base64,${base64Image}`
              }
            }
          ],
        },
      ],
      max_tokens: 500,
    });

    return response.choices[0].message.content || "Could not analyze document structure";
  } catch (error) {
    console.error("Error analyzing document:", error);
    throw new Error(`Failed to analyze document: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}