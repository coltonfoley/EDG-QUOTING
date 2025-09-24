import OpenAI from "openai";
import { z } from "zod";
import crypto from "crypto";

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
    for (const [key, entry] of this.cache.entries()) {
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
  customer: ExtractedCustomerSchema,
  quoteNumber: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
  projectDescription: z.string().nullable().optional(),
  lineItems: z.array(ExtractedLineItemSchema),
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
      model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
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
      model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
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

// Direct PDF processing with GPT-5's native PDF support
export async function extractQuoteDataFromPDF(pdfBuffer: Buffer): Promise<ExtractedQuote | null> {
  try {
    // Convert PDF buffer to base64 for API transmission
    const pdfBase64 = pdfBuffer.toString('base64');
    
    console.log(`🔍 Processing PDF directly with GPT-5 (${(pdfBuffer.length / 1024 / 1024).toFixed(2)}MB)`);
    
    const response = await openai.chat.completions.create({
      model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: `You are a specialized data extraction expert for construction and patio quotes. Analyze the provided PDF and extract comprehensive quote information with high accuracy.
          
          EXTRACTION GUIDELINES:
          - Process the entire PDF document natively
          - Look for customer details, line items, pricing, and totals
          - Pay attention to headers, footers, and continuation markers
          - Extract information visually from both text and visual elements
          
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
          - Use NUMERIC values for all prices, quantities, totals (never strings)
          - Only extract clearly visible information
          - Be thorough but accurate - don't hallucinate missing data
          - Include confidence score based on clarity of extracted data`,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Analyze this PDF document and extract all quote information.",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:application/pdf;base64,${pdfBase64}`,
              },
            },
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

    const parsedContent = JSON.parse(content);
    const extracted = ExtractedQuoteSchema.parse(parsedContent);
    
    // Calculate confidence if not present
    if (!extracted.confidence) {
      extracted.confidence = calculateExtractionConfidence(extracted);
    }
    
    console.log(`✅ Successfully extracted quote data with confidence: ${extracted.confidence}`);
    return extracted;
    
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

    return consolidated;
  } catch (error) {
    console.error('Error in consolidateQuoteParts:', error);
    // Return the first part as fallback
    return parts[0] as ExtractedQuote;
  }
}

/**
 * Calculate confidence score based on data completeness and quality indicators
 */
function calculateExtractionConfidence(quote: ExtractedQuote, sourceText?: string): number {
  let score = 0;
  let maxScore = 0;

  // Critical fields scoring (60% of total score)
  maxScore += 20; // Customer info weight
  if (quote.customer?.name || quote.customer?.company) score += 10;
  if (quote.customer?.email) score += 5;
  if (quote.customer?.phone) score += 5;

  maxScore += 15; // Financial totals weight
  if (quote.total !== null && quote.total > 0) score += 10;
  if (quote.subtotal !== null && quote.subtotal > 0) score += 3;
  if (quote.taxAmount !== null || quote.taxRate !== null) score += 2;

  maxScore += 15; // Line items weight
  if (quote.lineItems && quote.lineItems.length > 0) {
    score += 10;
    // Bonus for line items with complete data
    const completeItems = quote.lineItems.filter(item => 
      item.description && (item.price !== null || item.total !== null)
    );
    if (completeItems.length > 0) {
      score += Math.min(5, completeItems.length * 1);
    }
  }

  maxScore += 10; // Quote identification weight
  if (quote.quoteNumber) score += 5;
  if (quote.date) score += 5;

  // Secondary fields scoring (30% of total score)
  maxScore += 10; // Project details weight
  if (quote.projectDescription) score += 5;
  if (quote.customer?.address) score += 3;
  if (quote.notes || quote.terms) score += 2;

  // Data consistency checks (10% of total score)
  maxScore += 12;
  
  // Financial consistency
  if (quote.total !== null && quote.subtotal !== null) {
    const expectedTotal = quote.subtotal + (quote.taxAmount || 0) - (quote.discountAmount || 0);
    const totalDifference = Math.abs(quote.total - expectedTotal);
    if (totalDifference < 0.01) score += 3; // Perfect match
    else if (totalDifference < quote.total * 0.1) score += 2; // Within 10%
    else if (totalDifference < quote.total * 0.2) score += 1; // Within 20%
  }

  // Tax rate consistency check
  if (quote.taxRate !== null && quote.taxAmount !== null && quote.subtotal !== null && quote.subtotal > 0) {
    const expectedTaxAmount = quote.subtotal * quote.taxRate;
    const taxDifference = Math.abs(quote.taxAmount - expectedTaxAmount);
    if (taxDifference < 0.01) score += 2; // Perfect match
    else if (taxDifference < quote.taxAmount * 0.1) score += 1; // Within 10%
  }

  // Line items sum consistency
  if (quote.lineItems && quote.lineItems.length > 0 && quote.subtotal !== null) {
    const lineItemsTotal = quote.lineItems.reduce((sum, item) => {
      const itemTotal = item.total || (item.price && item.quantity ? item.price * item.quantity : 0);
      return sum + itemTotal;
    }, 0);
    
    if (lineItemsTotal > 0) {
      const difference = Math.abs(quote.subtotal - lineItemsTotal);
      if (difference < 0.01) score += 3; // Perfect match
      else if (difference < quote.subtotal * 0.1) score += 2; // Within 10%
      else if (difference < quote.subtotal * 0.2) score += 1; // Within 20%
    }
  }

  // Text quality indicators (bonus scoring)
  if (sourceText) {
    const lowerText = sourceText.toLowerCase();
    
    // Detect structured content patterns
    const structurePatterns = [
      /quote\s*#?\s*\w+/i,
      /total\s*:?\s*\$[\d,]+/i,
      /subtotal\s*:?\s*\$[\d,]+/i,
      /tax\s*:?\s*\$[\d,]+/i,
      /@[\w.-]+\.\w+/, // email pattern
      /\(\d{3}\)\s*\d{3}-\d{4}/, // phone pattern
    ];
    
    const patternMatches = structurePatterns.filter(pattern => pattern.test(lowerText)).length;
    score += Math.min(5, patternMatches * 1); // Up to 5 bonus points
    maxScore += 5;
  }

  // Calculate final confidence as percentage
  const confidence = maxScore > 0 ? Math.min(1.0, Math.max(0.0, score / maxScore)) : 0;
  
  console.log(`📊 Confidence calculation: ${score}/${maxScore} = ${(confidence * 100).toFixed(1)}%`);
  
  return parseFloat(confidence.toFixed(3)); // Round to 3 decimal places
}

/**
 * Advanced JSON parsing with multiple recovery strategies for malformed OpenAI responses
 */
function parseJsonWithRecovery(content: string): any {
  // Strategy 1: Direct JSON parse
  try {
    return JSON.parse(content);
  } catch (error) {
    console.warn("📋 Strategy 1 failed (direct parse), trying recovery strategies");
  }

  // Strategy 2: Fix common JSON issues
  try {
    let fixedContent = content
      .replace(/,\s*}/g, '}')  // Remove trailing commas
      .replace(/,\s*]/g, ']')  // Remove trailing commas in arrays
      .replace(/'/g, '"')      // Replace single quotes with double quotes
      .replace(/(\w+):/g, '"$1":');  // Add quotes to unquoted keys

    return JSON.parse(fixedContent);
  } catch (error) {
    console.warn("📋 Strategy 2 failed (fixing common issues)");
  }

  // Strategy 3: Extract JSON from markdown or text wrapping
  try {
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || 
                     content.match(/```\s*([\s\S]*?)\s*```/) ||
                     content.match(/{[\s\S]*}/);
    
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1] || jsonMatch[0]);
    }
  } catch (error) {
    console.warn("📋 Strategy 3 failed (extracting from markdown)");
  }

  // Strategy 4: Try to find and fix incomplete JSON
  try {
    let workingContent = content.trim();
    
    // If it looks like truncated JSON, try to close it
    if (workingContent.startsWith('{') && !workingContent.endsWith('}')) {
      // Count open braces vs closed braces
      const openBraces = (workingContent.match(/{/g) || []).length;
      const closeBraces = (workingContent.match(/}/g) || []).length;
      const missingBraces = openBraces - closeBraces;
      
      if (missingBraces > 0) {
        workingContent += '}'.repeat(missingBraces);
      }
      
      return JSON.parse(workingContent);
    }
  } catch (error) {
    console.warn("📋 Strategy 4 failed (fixing incomplete JSON)");
  }

  // Strategy 5: Extract individual field values using regex
  try {
    const result: any = {};
    
    // Extract string fields
    const stringFields = ['name', 'email', 'phone', 'company', 'address', 'quoteNumber', 'date', 'projectDescription', 'notes', 'terms'];
    stringFields.forEach(field => {
      const match = content.match(new RegExp(`"${field}"\\s*:\\s*"([^"]*)"`, 'i'));
      if (match) result[field] = match[1];
    });

    // Extract numeric fields
    const numericFields = ['subtotal', 'taxRate', 'taxAmount', 'discountAmount', 'total'];
    numericFields.forEach(field => {
      const match = content.match(new RegExp(`"${field}"\\s*:\\s*(\\d+(?:\\.\\d+)?)`, 'i'));
      if (match) result[field] = parseFloat(match[1]);
    });

    // If we found at least some data, return it
    if (Object.keys(result).length > 0) {
      console.warn("📋 Strategy 5 succeeded (regex field extraction)");
      return { customer: {}, ...result };
    }
  } catch (error) {
    console.warn("📋 Strategy 5 failed (regex extraction)");
  }

  console.error("❌ All JSON recovery strategies failed");
  return null;
}

/**
 * Create a partial quote from potentially invalid data
 */
function createPartialQuoteFromData(data: any): ExtractedQuote | null {
  try {
    const result: ExtractedQuote = {
      customer: {
        name: data.customer?.name || data.name || null,
        email: data.customer?.email || data.email || null,
        phone: data.customer?.phone || data.phone || null,
        company: data.customer?.company || data.company || null,
        address: data.customer?.address || data.address || null
      },
      quoteNumber: data.quoteNumber || null,
      date: data.date || null,
      projectDescription: data.projectDescription || null,
      lineItems: [],
      subtotal: typeof data.subtotal === 'number' ? data.subtotal : null,
      taxRate: typeof data.taxRate === 'number' ? data.taxRate : null,
      taxAmount: typeof data.taxAmount === 'number' ? data.taxAmount : null,
      discountAmount: typeof data.discountAmount === 'number' ? data.discountAmount : null,
      total: typeof data.total === 'number' ? data.total : null,
      notes: data.notes || null,
      terms: data.terms || null
    };

    // Try to extract line items if they exist
    if (Array.isArray(data.lineItems)) {
      result.lineItems = data.lineItems.map((item: any) => ({
        description: item.description || null,
        quantity: typeof item.quantity === 'number' ? item.quantity : null,
        price: typeof item.price === 'number' ? item.price : null,
        total: typeof item.total === 'number' ? item.total : null,
        unit: item.unit || null
      }));
    }

    // Calculate confidence for partial quote
    result.confidence = calculateExtractionConfidence(result);
    
    console.log("🔧 Created partial quote from corrupted data");
    return result;
  } catch (error) {
    console.error("❌ Failed to create partial quote:", error);
    return null;
  }
}

/**
 * Intelligent text preprocessing for PDF quote extraction
 * Identifies and prioritizes sections most likely to contain quote information
 */
function preprocessTextForExtraction(text: string): string {
  const maxTextLength = 20000;
  
  if (text.length <= maxTextLength) {
    return text;
  }

  // Define keywords that indicate important quote sections
  const quoteKeywords = [
    // Customer/Client info
    'bill to', 'ship to', 'customer', 'client', 'account', 'contact',
    // Quote identification
    'quote', 'estimate', 'proposal', 'invoice', 'order',
    // Financial terms
    'total', 'subtotal', 'tax', 'amount', 'price', 'cost', 'payment',
    // Line items
    'description', 'item', 'product', 'service', 'quantity', 'unit',
    // Project details
    'project', 'job', 'site', 'address', 'location',
    // Dates and terms
    'date', 'terms', 'conditions', 'due', 'expiry'
  ];

  const pricePattern = /\$[\d,]+\.?\d*/g;
  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const phonePattern = /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
  const quoteNumberPattern = /(quote|estimate|invoice|order)\s*#?\s*\w+/gi;

  // Split text into sections (by line breaks or other natural separators)
  const sections = text.split(/\n\n+|\n(?=\S)/).filter(section => section.trim().length > 10);
  
  // Score each section based on relevance
  const scoredSections = sections.map(section => {
    let score = 0;
    const lowerSection = section.toLowerCase();
    
    // Keyword scoring
    quoteKeywords.forEach(keyword => {
      const matches = lowerSection.split(keyword).length - 1;
      score += matches * 2;
    });

    // Pattern scoring
    const priceMatches = section.match(pricePattern) || [];
    score += priceMatches.length * 3;
    
    const emailMatches = section.match(emailPattern) || [];
    score += emailMatches.length * 4;
    
    const phoneMatches = section.match(phonePattern) || [];
    score += phoneMatches.length * 3;
    
    const quoteNumberMatches = section.match(quoteNumberPattern) || [];
    score += quoteNumberMatches.length * 5;

    // Section position bonus (beginning and end sections often contain important info)
    const sectionIndex = sections.indexOf(section);
    if (sectionIndex < 3) score += 2; // Early sections bonus
    if (sectionIndex >= sections.length - 3) score += 1; // Late sections bonus

    return { section, score, length: section.length };
  });

  // Sort by score (descending)
  scoredSections.sort((a, b) => b.score - a.score);

  // Select sections that fit within token limit
  let selectedText = '';
  let currentLength = 0;
  
  for (const { section, score } of scoredSections) {
    if (currentLength + section.length <= maxTextLength * 0.95) { // Leave some buffer
      selectedText += section + '\n\n';
      currentLength += section.length + 2;
    } else {
      break;
    }
  }

  // If we still have significant text excluded, add a summary note
  const excludedLength = text.length - currentLength;
  if (excludedLength > 1000) {
    selectedText += `\n... [${excludedLength} characters of additional content excluded] ...`;
  }

  return selectedText.trim();
}

export async function extractQuoteDataFromText(text: string): Promise<ExtractedQuote | null> {
  try {
    // Apply intelligent preprocessing to optimize token usage
    const processedText = preprocessTextForExtraction(text);
    
    console.log(`📄 Text preprocessing: ${text.length} → ${processedText.length} characters`);
    
    // Check cache first
    const cacheKey = textExtractionCache.generateKey(processedText);
    const cachedResult = textExtractionCache.get(cacheKey);
    
    if (cachedResult) {
      console.log(`🎯 Cache hit for text extraction (${cacheKey})`);
      return cachedResult;
    }
    
    console.log(`🔍 Cache miss, making OpenAI API call for text extraction`);
    
    const response = await openai.chat.completions.create({
      model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user // Using proven working model for PDF extraction
      messages: [
        {
          role: "system",
          content: `You are a data extraction expert specializing in construction quotes and estimates. Extract available quote information from text, accommodating different supplier formats.
          
          Extract the following information and return as JSON (ALL FIELDS ARE OPTIONAL):
          
          1. Customer Information:
             - name (string or null) - individual name, company contact, or any identifiable customer reference
             - email (string or null)
             - phone (string or null)
             - company (string or null) - company/business name
             - address (string or null) - any address information
          
          2. Quote Details:
             - quoteNumber (string or null) - quote/estimate number or reference
             - date (string or null) - quote date, creation date, or any relevant date
             - projectDescription (string or null) - project name, description, or work details
             - notes (string or null) - any additional notes or special instructions
             - terms (string or null) - payment terms, conditions, or contract details
          
          3. Line Items (array of objects, can be empty):
             - description (string or null) - item name, product, or service description
             - quantity (number or null) - quantity or amount
             - price (number or null) - unit price
             - total (number or null) - line total
             - unit (string or null) - unit of measurement (e.g., "each", "sqft", "linear ft")
          
          4. Financial Summary:
             - subtotal (number or null)
             - taxRate (number or null, as decimal like 0.08 for 8%)
             - taxAmount (number or null)
             - discountAmount (number or null)
             - total (number or null)
          
          Return valid JSON in this exact format:
          {
            "customer": {"name": null, "email": null, "phone": null, "company": "Supplier Company", "address": null},
            "quoteNumber": null,
            "date": null,
            "projectDescription": null,
            "lineItems": [],
            "subtotal": null,
            "taxRate": null,
            "taxAmount": null,
            "discountAmount": null,
            "total": null,
            "notes": null,
            "terms": null
          }
          
          IMPORTANT RULES:
          - ALL fields are optional - if information is not clearly present, use null
          - Extract only information that is explicitly available in the document
          - For numbers, always use numeric values (not strings)
          - Line items array can be empty if no clear items are found
          - Be flexible with different quote formats from various suppliers and vendors
          - Don't invent or assume missing information
          - Focus on extracting what's clearly available rather than forcing missing data
          - Handle catalogs, price lists, estimates, and formal quotes equally well`,
        },
        {
          role: "user",
          content: `Extract quote information from this document:\n\n${processedText}`,
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 4000,
      temperature: 0
    });

    const content = response.choices[0].message.content;
    if (!content) {
      // Empty response from OpenAI for quote extraction
      return null;
    }

    // Parse JSON with multiple recovery strategies
    const parsedContent = parseJsonWithRecovery(content);
    if (!parsedContent) {
      console.warn("❌ Failed to parse JSON response from OpenAI");
      return null;
    }

    // Validate and parse with schema
    try {
      const extracted = ExtractedQuoteSchema.parse(parsedContent);
      
      // Calculate and add confidence score
      extracted.confidence = calculateExtractionConfidence(extracted, processedText);
      
      // Cache successful result
      textExtractionCache.set(cacheKey, extracted);
      console.log(`💾 Cached text extraction result (${cacheKey})`);
      
      return extracted;
    } catch (validationError) {
      console.warn("⚠️  Schema validation failed, attempting partial extraction:", validationError);
      // Try to extract what we can from partially valid data
      const partialQuote = createPartialQuoteFromData(parsedContent);
      if (partialQuote) {
        partialQuote.confidence = calculateExtractionConfidence(partialQuote, processedText);
        // Cache partial result with shorter TTL
        textExtractionCache.set(cacheKey, partialQuote, 2 * 60 * 60 * 1000); // 2 hours for partial results
      }
      return partialQuote;
    }
  } catch (error) {
    // Error extracting quote data from text
    return null;
  }
}