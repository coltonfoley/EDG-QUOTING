import OpenAI from "openai";
import { z } from "zod";
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import crypto from "crypto";
import fs from "fs";
import path from "path";
import os from "os";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 240000, // 4 minutes timeout for complex PDF processing
  maxRetries: 2 // Retry failed requests up to 2 times
});

// Simple in-memory cache for OpenAI API responses
interface CacheEntry {
  response: any;
  timestamp: number;
  expiryTime: number;
}

class SimpleCache {
  private cache: Map<string, CacheEntry> = new Map();
  private maxSize: number;
  private defaultTTL: number;

  constructor(maxSize = 1000, defaultTTL = 6 * 60 * 60 * 1000) { // 6 hours default TTL
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL;
  }

  // Generate cache key from input content
  generateKey(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
  }

  set(key: string, value: any, ttl?: number): void {
    const now = Date.now();
    const expiry = now + (ttl || this.defaultTTL);
    
    // Evict oldest entries if cache is full
    if (this.cache.size >= this.maxSize) {
      const oldestKey = Array.from(this.cache.entries())
        .sort(([,a], [,b]) => a.timestamp - b.timestamp)[0][0];
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      response: value,
      timestamp: now,
      expiryTime: expiry
    });
  }

  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    // Check if expired
    if (Date.now() > entry.expiryTime) {
      this.cache.delete(key);
      return null;
    }

    return entry.response;
  }

  // Clean up expired entries
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of Array.from(this.cache.entries())) {
      if (now > entry.expiryTime) {
        this.cache.delete(key);
      }
    }
  }

  // Get cache statistics
  getStats(): { size: number; hitRate?: number } {
    return { size: this.cache.size };
  }
}

// Cache for OpenAI API responses - separate caches for different types
const textExtractionCache = new SimpleCache(200, 24 * 60 * 60 * 1000); // 24 hours for text extraction
const visionExtractionCache = new SimpleCache(300, 6 * 60 * 60 * 1000); // 6 hours for vision extraction

// Clean up expired entries every hour
setInterval(() => {
  textExtractionCache.cleanup();
  visionExtractionCache.cleanup();
}, 60 * 60 * 1000);

// Schema for extracted product data
const ExtractedProductSchema = z.object({
  sku: z.string().nullable().optional(),
  name: z.string(),
  unit: z.string().nullable().optional(),
  price: z.number(),
  description: z.string().nullable().optional(),
});

const ExtractedProductsSchema = z.object({
  products: z.array(ExtractedProductSchema),
});

export type ExtractedProduct = z.infer<typeof ExtractedProductSchema>;

// Schema for extracted quote data
const ExtractedLineItemSchema = z.object({
  description: z.string().nullable().optional(),
  quantity: z.number().nullable().optional(),
  price: z.number().nullable().optional(),
  total: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
});

const ExtractedCustomerSchema = z.object({
  name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
});

const ExtractedQuoteSchema = z.object({
  customer: ExtractedCustomerSchema.nullable().optional(),
  quoteNumber: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
  projectDescription: z.string().nullable().optional(),
  lineItems: z.array(ExtractedLineItemSchema).nullable().optional(),
  subtotal: z.number().nullable().optional(),
  taxRate: z.number().nullable().optional(),
  taxAmount: z.number().nullable().optional(),
  discountAmount: z.number().nullable().optional(),
  total: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  terms: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).optional(), // Overall extraction confidence score
});

export type ExtractedQuote = z.infer<typeof ExtractedQuoteSchema>;

// Schema for vision-based processing with page references
const ExtractedQuoteWithPageRefsSchema = ExtractedQuoteSchema.extend({
  pageRefs: z.array(z.number()).optional(), // Page indices where data was found
});

export type ExtractedQuoteWithPageRefs = z.infer<typeof ExtractedQuoteWithPageRefsSchema>;

export async function extractProductsFromImage(base64Image: string): Promise<ExtractedProduct[]> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: `You are a data extraction expert. Extract product information from price lists and catalogs.
          
          IMPORTANT: Limit your response to the FIRST 100 products to avoid truncation.
          
          For each product found, return JSON objects with these exact fields:
          - "sku": product code/SKU (string, or null if not found)
          - "name": product name (string, required)
          - "unit": unit of measurement (string like "each", or null if not specified)
          - "price": price as number (not string, required)
          - "description": additional details (string, or null if not found)
          
          Return valid JSON in this exact format:
          {"products": [{"sku": "ABC123", "name": "Product Name", "unit": "each", "price": 25.99, "description": "Details"}]}
          
          Only include products with valid names and prices > 0.
          Focus on complete product entries with clear pricing.
          Keep product names concise to save space.`,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract all product information from this price list image. Return as structured JSON.",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`,
              },
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 8000, // Increased token limit
      // GPT-5 only supports default temperature (1), so we remove this parameter
    });

    const content = response.choices[0].message.content;
    if (!content) {
      // Empty response from OpenAI
      return [];
    }

    // More robust JSON parsing with error handling
    let parsedContent;
    try {
      parsedContent = JSON.parse(content);
    } catch (jsonError) {
      // JSON parsing failed for image
      
      // Try to extract valid JSON from partial response
      try {
        const productsMatch = content.match(/"products"\s*:\s*\[(.*?)\]/);
        if (productsMatch) {
          const productsStr = `{"products": [${productsMatch[1]}]}`;
          parsedContent = JSON.parse(productsStr);
        } else {
          // Could not extract products array from image response
          return [];
        }
      } catch (fallbackError) {
        // Fallback parsing also failed for image
        return [];
      }
    }

    // Validate and parse with schema
    const parsed = ExtractedProductsSchema.parse(parsedContent);
    return parsed.products || [];
  } catch (error) {
    // Error extracting products from image
    return []; // Return empty array instead of throwing
  }
}

export async function extractProductsFromText(text: string): Promise<ExtractedProduct[]> {
  try {
    // Truncate text if too long to prevent token limit issues
    const maxTextLength = 15000; // Reasonable limit for GPT-4
    const truncatedText = text.length > maxTextLength 
      ? text.substring(0, maxTextLength) + "\n... (truncated)"
      : text;

    const response = await openai.chat.completions.create({
      model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: `You are a data extraction expert. Extract product information from price list text.
          
          IMPORTANT: Limit your response to the FIRST 100 products to avoid truncation.
          
          For each product found, return JSON objects with these exact fields:
          - "sku": product code/SKU (string, or null if not found)
          - "name": product name (string, required)
          - "unit": unit of measurement (string like "each", or null if not specified)
          - "price": price as number (not string, required)
          - "description": additional details (string, or null if not found)
          
          Return valid JSON in this exact format:
          {"products": [{"sku": "ABC123", "name": "Product Name", "unit": "each", "price": 25.99, "description": "Details"}]}
          
          Only include products with valid names and prices > 0.
          Focus on complete product entries with clear pricing.
          Keep product names concise to save space.`,
        },
        {
          role: "user",
          content: `Extract product information from this price list:\n\n${truncatedText}`,
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 8000, // Increased token limit
      // GPT-5 only supports default temperature (1), so we remove this parameter
    });

    const content = response.choices[0].message.content;
    if (!content) {
      // Empty response from OpenAI
      return [];
    }

    // More robust JSON parsing with error handling
    let parsedContent;
    try {
      parsedContent = JSON.parse(content);
    } catch (jsonError) {
      // JSON parsing failed
      
      // Try to extract products from truncated response
      try {
        // Attempting to parse truncated response
        
        // Find the start of the products array
        const productsStart = content.indexOf('"products": [');
        if (productsStart === -1) {
          // No products array found in response
          return [];
        }

        // Extract everything after the products array start
        let productsContent = content.substring(productsStart + 13); // Skip '"products": ['
        
        // Remove the incomplete final product by finding the last complete one
        const lastCompleteProduct = productsContent.lastIndexOf('}, {');
        if (lastCompleteProduct !== -1) {
          // Keep everything up to and including the closing brace of the last complete product
          productsContent = productsContent.substring(0, lastCompleteProduct + 1);
        } else {
          // If no multiple products, try to find at least one complete product
          const firstProductEnd = productsContent.indexOf('}');
          if (firstProductEnd !== -1) {
            productsContent = productsContent.substring(0, firstProductEnd + 1);
          } else {
            // No complete products found in truncated response
            return [];
          }
        }

        // Reconstruct valid JSON
        const fixedJson = `{"products": [${productsContent}]}`;
        parsedContent = JSON.parse(fixedJson);
        // Successfully recovered products from truncated response
      } catch (fallbackError) {
        // Fallback parsing also failed
        return [];
      }
    }

    // Validate and parse with schema
    const parsed = ExtractedProductsSchema.parse(parsedContent);
    return parsed.products || [];
  } catch (error) {
    // Error extracting products from text
    return []; // Return empty array instead of throwing
  }
}

// Simple PDF text extraction using PDF.js
async function extractTextFromPDF(pdfBuffer: Buffer): Promise<string | null> {
  try {
    // Add polyfill for Promise.withResolvers if needed
    if (!Promise.withResolvers) {
      await import('@ungap/with-resolvers' as any);
    }

    const uint8Array = new Uint8Array(pdfBuffer);
    const loadingTask = getDocument({
      data: uint8Array,
      verbosity: 0 // Suppress console output
    });
    
    const pdf = await loadingTask.promise;
    const pageTexts: string[] = [];
    const maxPages = Math.min(pdf.numPages, 20); // Limit pages for efficiency
    
    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      try {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        
        const pageText = textContent.items
          .map((item: any) => {
            if (typeof item === 'string') return item;
            if (item.str) return item.str;
            return '';
          })
          .join(' ');
          
        pageTexts.push(pageText);
      } catch (pageError) {
        console.warn(`Warning: Failed to extract text from page ${pageNum}`);
      }
    }
    
    return pageTexts.join('\n\n').trim();
    
  } catch (error) {
    console.error('PDF text extraction failed:', error);
    return null;
  }
}

// Extract quote data from text using OpenAI
async function extractQuoteDataFromText(textContent: string): Promise<ExtractedQuote | null> {
  try {
    console.log('🤖 Processing text with OpenAI for quote extraction');
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert at extracting quote information from text documents. Extract all relevant quote details and return them as valid JSON.`
        },
        {
          role: "user",
          content: `Extract all quote information from this document text:

${textContent}

Return JSON with these fields (ALL OPTIONAL):
{
  "customer": {"name": string|null, "email": string|null, "phone": string|null, "company": string|null, "address": string|null},
  "quoteNumber": string|null,
  "date": string|null,
  "projectDescription": string|null,
  "lineItems": [{"description": string|null, "quantity": number|null, "price": number|null, "total": number|null, "unit": string|null}],
  "subtotal": number|null,
  "taxRate": number|null,
  "taxAmount": number|null,
  "discountAmount": number|null,
  "total": number|null,
  "notes": string|null,
  "terms": string|null,
  "confidence": number (0-1)
}

CRITICAL RULES:
- ALWAYS include ALL top-level fields in your response - NEVER omit any field
- Use null for any missing or unavailable data - do NOT omit fields entirely
- For customer: if no customer info found, return {"name": null, "email": null, "phone": null, "company": null, "address": null}
- For lineItems: if no line items found, return empty array []
- Extract ACTUAL data from the text, not example/placeholder data
- Use NUMERIC values for all prices, quantities, totals
- Only extract clearly visible information from the document
- Be thorough but accurate - don't make up missing data
- Return ONLY valid JSON, no additional text`
        }
      ],
      response_format: { type: "json_object" },
      max_tokens: 6000,
      temperature: 0.1
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.error('Empty response from OpenAI');
      return null;
    }

    let parsedContent;
    try {
      parsedContent = JSON.parse(content);
    } catch (jsonError) {
      console.error('JSON parsing failed:', jsonError);
      return null;
    }

    const extracted = ExtractedQuoteSchema.parse(parsedContent);

    // Normalize customer and lineItems to ensure consistent defaults
    extracted.customer = extracted.customer ?? { name: null, email: null, phone: null, company: null, address: null };
    extracted.lineItems = extracted.lineItems ?? [];

    // Calculate confidence if not present
    if (!extracted.confidence) {
      extracted.confidence = calculateExtractionConfidence(extracted);
    }

    return extracted;

  } catch (error) {
    console.error('Error extracting quote data from text:', error);
    return null;
  }
}

// Direct PDF processing using chat completions with file upload
export async function extractQuoteDataFromPDF(pdfBuffer: Buffer): Promise<ExtractedQuote | null> {
  try {
    console.log(`📄 Processing PDF with direct text extraction (${(pdfBuffer.length / 1024 / 1024).toFixed(2)}MB)`);
    
    // Try direct PDF text extraction first (faster and more reliable)
    const textContent = await extractTextFromPDF(pdfBuffer);
    
    if (textContent && textContent.trim().length > 0) {
      console.log(`📝 Extracted ${textContent.length} characters of text from PDF`);
      
      // Process text content with OpenAI for quote extraction
      const extractedQuote = await extractQuoteDataFromText(textContent);
      
      if (extractedQuote) {
        console.log('✅ Successfully extracted quote data from PDF text');
        return extractedQuote;
      }
    }
    
    console.log('⚠️ Text extraction insufficient, falling back to vision processing');
    
    // Fallback to vision processing if text extraction fails
    try {
      const { convertPDFToImagesServer } = await import('./quoteImageUtils');
      const images = await convertPDFToImagesServer(pdfBuffer);
      
      if (!images || images.length === 0) {
        throw new Error('Failed to convert PDF to images');
      }
      
      console.log(`📸 Converted PDF to ${images.length} images, processing with vision API`);
      return await extractQuoteDataFromImages(images);
      
    } catch (imageError) {
      console.error('Vision processing also failed:', imageError);
      throw new Error('Both text and vision processing failed for this PDF');
    }
    
  } catch (error) {
    console.error('Error in extractQuoteDataFromPDF:', error);
    return null;
  }
}

export async function extractQuoteDataFromImages(images: Array<{index: number, imageBase64: string}>): Promise<ExtractedQuote | null> {
  try {
    if (!images || images.length === 0) {
      return null;
    }

    // For small PDFs (≤5 pages), process all at once
    if (images.length <= 5) {
      return await processImagesInSingleCall(images);
    }

    // For larger PDFs, process in chunks and consolidate
    const chunkSize = 3;
    const chunks = [];
    for (let i = 0; i < images.length; i += chunkSize) {
      chunks.push(images.slice(i, i + chunkSize));
    }

    // Process chunks concurrently with controlled concurrency to avoid rate limits
    const maxConcurrency = 3; // Limit concurrent OpenAI API calls
    const chunkResults: ExtractedQuoteWithPageRefs[] = [];
    
    console.log(`🚀 Processing ${chunks.length} chunks concurrently (max ${maxConcurrency} at a time)`);
    
    // Process chunks in batches to control concurrency
    for (let i = 0; i < chunks.length; i += maxConcurrency) {
      const currentBatch = chunks.slice(i, i + maxConcurrency);
      
      // Process current batch concurrently
      const batchPromises = currentBatch.map(async (chunk, batchIndex) => {
        try {
          const globalChunkIndex = i + batchIndex;
          console.log(`📄 Processing chunk ${globalChunkIndex + 1}/${chunks.length} (${chunk.length} pages)`);
          
          const result = await processImagesInSingleCall(chunk);
          return { result, chunkIndex: globalChunkIndex };
        } catch (error) {
          console.warn(`⚠️  Chunk ${i + batchIndex + 1} failed:`, error);
          return { result: null, chunkIndex: i + batchIndex };
        }
      });
      
      // Wait for current batch to complete
      const batchResults = await Promise.all(batchPromises);
      
      // Add successful results to final array
      for (const { result } of batchResults) {
        if (result) {
          chunkResults.push(result);
        }
      }
      
      // Brief delay between batches to be respectful to API rate limits
      if (i + maxConcurrency < chunks.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Consolidate results from all chunks
    if (chunkResults.length === 0) {
      return null;
    }

    return await consolidateQuoteParts(chunkResults);
  } catch (error) {
    console.error('Error in extractQuoteDataFromImages:', error);
    return null;
  }
}

async function processImagesInSingleCall(images: Array<{index: number, imageBase64: string}>): Promise<ExtractedQuoteWithPageRefs | null> {
  try {
    // Generate cache key based on image content (use first few characters of each image for efficiency)
    const cacheKeyInput = images.map(img => `${img.index}:${img.imageBase64.slice(0, 100)}`).join('|');
    const cacheKey = visionExtractionCache.generateKey(cacheKeyInput);
    
    // Check cache first
    const cachedResult = visionExtractionCache.get(cacheKey);
    if (cachedResult) {
      console.log(`🎯 Cache hit for vision extraction (${cacheKey}) - ${images.length} pages`);
      return cachedResult;
    }
    
    console.log(`🔍 Cache miss, making OpenAI vision API call for ${images.length} pages`);
    
    const imageContent = images.map((img, idx) => {
      return [
        {
          type: "text" as const,
          text: `Page ${img.index + 1}:`,
        },
        {
          type: "image_url" as const,
          image_url: {
            url: `data:image/jpeg;base64,${img.imageBase64}`,
          },
        },
      ];
    }).flat();

    const response = await openai.chat.completions.create({
      model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: `You are a specialized data extraction expert for construction and patio quotes. Analyze the provided PDF page images and extract comprehensive quote information with high accuracy.
          
          EXTRACTION GUIDELINES:
          - Examine ALL pages carefully for complete information
          - Look for customer details, line items, pricing, and totals across all pages
          - Pay attention to headers, footers, and continuation markers
          - Identify relationships between pages (e.g., continued line items)
          - Extract information visually - don't rely solely on text positioning
          
          For multi-page documents:
          - Customer info may be on first page only
          - Line items may span multiple pages
          - Totals typically appear on the last page
          - Include page references in your extraction
          
          Return JSON with these fields (ALL OPTIONAL):
          {
            "customer": {"name": string|null, "email": string|null, "phone": string|null, "company": string|null, "address": string|null},
            "quoteNumber": string|null,
            "date": string|null,
            "projectDescription": string|null,
            "lineItems": [{"description": string|null, "quantity": number|null, "price": number|null, "total": number|null, "unit": string|null}],
            "subtotal": number|null,
            "taxRate": number|null,
            "taxAmount": number|null,
            "discountAmount": number|null,
            "total": number|null,
            "notes": string|null,
            "terms": string|null,
            "confidence": number (0-1),
            "pageRefs": [page_numbers_where_data_found]
          }
          
          CRITICAL RULES:
          - ALWAYS include ALL top-level fields in your response - NEVER omit any field
          - Use null for any missing or unavailable data - do NOT omit fields entirely
          - For customer: if no customer info found, return {"name": null, "email": null, "phone": null, "company": null, "address": null}
          - For lineItems: if no line items found, return empty array []
          - Use NUMERIC values for all prices, quantities, totals (never strings)
          - Only extract clearly visible information
          - Be thorough but accurate - don't hallucinate missing data
          - Include confidence score based on clarity of extracted data
          - Reference page numbers where key information was found`,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze these PDF pages and extract all quote information. Focus on accuracy and completeness across all ${images.length} pages.`,
            },
            ...imageContent,
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 6000, // gpt-5 doesn't support temperature parameter, do not use it
    });

    const content = response.choices[0].message.content;
    if (!content) {
      return null;
    }

    let parsedContent;
    try {
      parsedContent = JSON.parse(content);
    } catch (jsonError) {
      console.error('JSON parsing failed for vision extraction:', jsonError);
      return null;
    }

    // Validate with extended schema
    const extracted = ExtractedQuoteWithPageRefsSchema.parse(parsedContent);
    
    // Normalize customer and lineItems to ensure consistent defaults
    extracted.customer = extracted.customer ?? { name: null, email: null, phone: null, company: null, address: null };
    extracted.lineItems = extracted.lineItems ?? [];
    
    // Calculate and add confidence score if not already present
    if (!extracted.confidence) {
      // Don't pass dummy sourceText to avoid inflating denominator with unmatchable patterns
      extracted.confidence = calculateExtractionConfidence(extracted);
    }
    
    // Cache successful vision extraction result
    visionExtractionCache.set(cacheKey, extracted);
    console.log(`💾 Cached vision extraction result (${cacheKey}) - ${images.length} pages`);
    
    return extracted;
  } catch (error) {
    console.error('Error in processImagesInSingleCall:', error);
    return null;
  }
}

async function consolidateQuoteParts(parts: ExtractedQuoteWithPageRefs[]): Promise<ExtractedQuote> {
  try {
    // Consolidate multiple extraction results into a single quote
    const consolidated: ExtractedQuote = {
      customer: { name: null, email: null, phone: null, company: null, address: null },
      quoteNumber: null,
      date: null,
      projectDescription: null,
      lineItems: [],
      subtotal: null,
      taxRate: null,
      taxAmount: null,
      discountAmount: null,
      total: null,
      notes: null,
      terms: null,
      confidence: 0 // Initialize with default confidence
    };

    // Consolidate customer information (take first non-null values)
    for (const part of parts) {
      if (part.customer?.name && !consolidated.customer.name) consolidated.customer.name = part.customer.name;
      if (part.customer?.email && !consolidated.customer.email) consolidated.customer.email = part.customer.email;
      if (part.customer?.phone && !consolidated.customer.phone) consolidated.customer.phone = part.customer.phone;
      if (part.customer?.company && !consolidated.customer.company) consolidated.customer.company = part.customer.company;
      if (part.customer?.address && !consolidated.customer.address) consolidated.customer.address = part.customer.address;
    }

    // Consolidate quote metadata (take first non-null values)
    for (const part of parts) {
      if (part.quoteNumber && !consolidated.quoteNumber) consolidated.quoteNumber = part.quoteNumber;
      if (part.date && !consolidated.date) consolidated.date = part.date;
      if (part.projectDescription && !consolidated.projectDescription) consolidated.projectDescription = part.projectDescription;
      if (part.notes && !consolidated.notes) consolidated.notes = part.notes;
      if (part.terms && !consolidated.terms) consolidated.terms = part.terms;
    }

    // Consolidate line items (combine all, dedupe by description+price)
    const seenItems = new Set<string>();
    for (const part of parts) {
      if (part.lineItems) {
        for (const item of part.lineItems) {
          if (item.description && item.price) {
            const itemKey = `${item.description.toLowerCase()}-${item.price}-${item.quantity || 1}`;
            if (!seenItems.has(itemKey)) {
              consolidated.lineItems.push(item);
              seenItems.add(itemKey);
            }
          }
        }
      }
    }

    // Consolidate financial totals (take the highest confidence or last page values)
    let bestFinancialPart = parts[parts.length - 1]; // Default to last part
    for (const part of parts) {
      if (part.total && (!bestFinancialPart.total || (part.confidence || 0) > (bestFinancialPart.confidence || 0))) {
        bestFinancialPart = part;
      }
    }

    consolidated.subtotal = bestFinancialPart.subtotal;
    consolidated.taxRate = bestFinancialPart.taxRate;
    consolidated.taxAmount = bestFinancialPart.taxAmount;
    consolidated.discountAmount = bestFinancialPart.discountAmount;
    consolidated.total = bestFinancialPart.total;

    // Calculate consolidated confidence as weighted average of individual part confidences
    const validParts = parts.filter(part => part.confidence !== undefined);
    if (validParts.length > 0) {
      const avgConfidence = validParts.reduce((sum, part) => sum + (part.confidence || 0), 0) / validParts.length;
      // Re-calculate confidence based on consolidated data to ensure accuracy
      const recalculatedConfidence = calculateExtractionConfidence(consolidated);
      // Use the higher of the two as the final confidence
      consolidated.confidence = Math.max(avgConfidence, recalculatedConfidence);
    } else {
      // No confidence data available, calculate fresh
      consolidated.confidence = calculateExtractionConfidence(consolidated);
    }

    console.log(`📊 Consolidated ${parts.length} parts into single quote with confidence: ${consolidated.confidence?.toFixed(2) || 'N/A'}`);
    return consolidated;
  } catch (error) {
    console.error('Error consolidating quote parts:', error);
    // Return minimal valid quote on error
    return {
      customer: { name: null, email: null, phone: null, company: null, address: null },
      quoteNumber: null,
      date: null,
      projectDescription: null,
      lineItems: [],
      subtotal: null,
      taxRate: null,
      taxAmount: null,
      discountAmount: null,
      total: null,
      notes: null,
      terms: null,
      confidence: 0
    };
  }
}

// Calculate confidence score based on extracted data completeness and patterns
function calculateExtractionConfidence(extracted: ExtractedQuote | ExtractedQuoteWithPageRefs, sourceText?: string): number {
  let confidence = 0;
  let maxScore = 0;
  
  // Customer information (20 points)
  maxScore += 20;
  if (extracted.customer) {
    if (extracted.customer.name) confidence += 5;
    if (extracted.customer.email) confidence += 4;
    if (extracted.customer.phone) confidence += 4;
    if (extracted.customer.company) confidence += 4;
    if (extracted.customer.address) confidence += 3;
  }
  
  // Quote metadata (15 points)
  maxScore += 15;
  if (extracted.quoteNumber) confidence += 5;
  if (extracted.date) confidence += 5;
  if (extracted.projectDescription) confidence += 5;
  
  // Line items (35 points)
  maxScore += 35;
  if (extracted.lineItems && extracted.lineItems.length > 0) {
    confidence += 10; // Has line items
    
    // Check line item completeness
    let completeItems = 0;
    for (const item of extracted.lineItems) {
      if (item.description && item.quantity && item.price) {
        completeItems++;
      }
    }
    
    const itemCompleteness = extracted.lineItems.length > 0 
      ? completeItems / extracted.lineItems.length 
      : 0;
    confidence += itemCompleteness * 15;
    
    // Check for reasonable number of line items
    if (extracted.lineItems.length >= 3) confidence += 10;
  }
  
  // Financial totals (20 points)
  maxScore += 20;
  if (extracted.subtotal) confidence += 5;
  if (extracted.taxRate !== null || extracted.taxAmount !== null) confidence += 5;
  if (extracted.total) confidence += 10;
  
  // Additional information (10 points)
  maxScore += 10;
  if (extracted.notes) confidence += 5;
  if (extracted.terms) confidence += 5;
  
  // Calculate final confidence score (0-1)
  const finalConfidence = Math.min(1, confidence / maxScore);
  
  return Number(finalConfidence.toFixed(2));
}