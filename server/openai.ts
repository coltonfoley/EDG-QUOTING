import OpenAI from "openai";
import { z } from "zod";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import os from "os";

let openai: OpenAI | null = null;

export function isOpenAIConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

function getOpenAI(): OpenAI {
  if (!isOpenAIConfigured()) {
    throw new Error("OPENAI_API_KEY is required for AI-powered quote extraction.");
  }

  openai ??= new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 240000, // 4 minutes timeout for complex PDF processing
    maxRetries: 2 // Retry failed requests up to 2 times
  });

  return openai;
}

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

// Schema for extracted product data (exported for testing)
export const ExtractedProductSchema = z.object({
  sku: z.string().nullable().optional(),
  name: z.string(),
  manufacturer: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  unit: z.string().nullable().optional(),
  price: z.number(),
  cost: z.number().nullable().optional(),
  description: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const DetectedColumnSchema = z.object({
  index: z.number(),
  header: z.string(),
  role: z.enum(['sku', 'name', 'price', 'cost', 'unknown']),
  sampleValues: z.array(z.string()),
});

export type DetectedColumn = z.infer<typeof DetectedColumnSchema>;

export const ExtractedProductsSchema = z.object({
  products: z.array(ExtractedProductSchema),
  detectedManufacturer: z.string().nullable().optional(),
  detectedColumns: z.array(DetectedColumnSchema).optional(),
});

export type ExtractedProduct = z.infer<typeof ExtractedProductSchema>;

// Schema for extracted quote data (exported for testing)
export const ExtractedLineItemSchema = z.object({
  description: z.string().nullable().optional(),
  quantity: z.number().nullable().optional(),
  price: z.number().nullable().optional(),
  total: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
});

export const ExtractedCustomerSchema = z.object({
  name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  address: z.string().nullable().optional(), // Legacy flat address
  // Structured address fields
  streetAddress: z.string().nullable().optional(),
  addressLine2: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  zipCode: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
});

export const ExtractedQuoteSchema = z.object({
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

// Schema for vision-based processing with page references (exported for testing)
export const ExtractedQuoteWithPageRefsSchema = ExtractedQuoteSchema.extend({
  pageRefs: z.array(z.number()).optional(), // Page indices where data was found
});

export type ExtractedQuoteWithPageRefs = z.infer<typeof ExtractedQuoteWithPageRefsSchema>;

export type ExtractedProductsResult = z.infer<typeof ExtractedProductsSchema>;

export async function extractProductsFromImage(base64Image: string, originalName?: string): Promise<ExtractedProductsResult> {
  try {
    const response = await getOpenAI().chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a data extraction expert specializing in construction industry price lists and catalogs.
          
          IMPORTANT: Extract up to 200 products. Be thorough — capture every product row.
          
          For each product found, return JSON objects with these exact fields:
          - "sku": product code/SKU/item number (string, or null if not found)
          - "name": product name (string, required)
          - "manufacturer": manufacturer or brand name (string, or null if not in this row — check document header/title)
          - "category": product category/group (string, or null if not found)
          - "unit": unit of measurement like "each", "sq ft", "linear ft" (string, or null if not specified)
          - "price": retail/list/dealer price as number (not string, required — use the HIGHER price if multiple price columns exist)
          - "cost": your cost/net price/wholesale price as number (or null if only one price column exists)
          - "description": additional details (string, or null if not found)
          - "confidence": how confident you are in this extraction, 0.0 to 1.0
          
          Also detect the manufacturer/brand name. IMPORTANT: The "detectedManufacturer" should be the BRAND or COMPANY that makes these products, NOT a generic header or document title. For example, if the header says "US SMART-HEATING PRICE LIST" but the products are from "Bromic", use "Bromic". Look at the filename, product naming patterns, logos, and brand references to determine the actual manufacturer.
          
          Return valid JSON in this exact format:
          {"detectedManufacturer": "Company Name or null", "products": [{"sku": "ABC123", "name": "Product Name", "manufacturer": "Brand", "category": "Category", "unit": "each", "price": 25.99, "cost": 18.50, "description": "Details", "confidence": 0.95}]}
          
          Only include products with valid names and prices > 0.
          If there are two price columns, the higher one is typically retail/list price and the lower is cost/net.
          Focus on complete product entries with clear pricing.`,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Extract all product information from this price list image. Detect the actual manufacturer/brand name (not just header text).${originalName ? ` The filename is: ${originalName}` : ''} Return as structured JSON.`,
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
      max_tokens: 8000,
    });

    const content = response.choices[0].message.content;
    if (!content) {
      return { products: [], detectedManufacturer: null };
    }

    let parsedContent;
    try {
      parsedContent = JSON.parse(content);
    } catch (jsonError) {
      try {
        const productsMatch = content.match(/"products"\s*:\s*\[(.*?)\]/);
        if (productsMatch) {
          const productsStr = `{"products": [${productsMatch[1]}]}`;
          parsedContent = JSON.parse(productsStr);
        } else {
          return { products: [], detectedManufacturer: null };
        }
      } catch (fallbackError) {
        return { products: [], detectedManufacturer: null };
      }
    }

    const parsed = ExtractedProductsSchema.parse(parsedContent);
    return parsed;
  } catch (error) {
    return { products: [], detectedManufacturer: null };
  }
}

export async function extractProductsFromText(text: string, originalName?: string): Promise<ExtractedProductsResult> {
  try {
    const maxTextLength = 15000;
    const truncatedText = text.length > maxTextLength 
      ? text.substring(0, maxTextLength) + "\n... (truncated)"
      : text;

    const response = await getOpenAI().chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a data extraction expert specializing in construction industry price lists and catalogs.
          
          IMPORTANT: Extract ALL products found. Be thorough — capture every product row.
          
          For each product found, return JSON objects with these exact fields:
          - "sku": product code/SKU/item number (string, or null if not found)
          - "name": product name (string, required)
          - "manufacturer": manufacturer or brand name (string, or null if not in this row — check document header/title)
          - "category": product category/group/section heading (string, or null if not found)
          - "unit": unit of measurement like "each", "sq ft", "linear ft" (string, or null if not specified)
          - "price": retail/list/dealer price as number (not string, required — use the HIGHER price if multiple price columns exist)
          - "cost": your cost/net price/wholesale price as number (or null if only one price column exists)
          - "description": additional details (string, or null if not found)
          - "confidence": how confident you are in this extraction, 0.0 to 1.0
          
          Also detect the manufacturer/brand name. IMPORTANT: The "detectedManufacturer" should be the BRAND or COMPANY that makes these products, NOT a generic header or document title. For example, if the header says "US SMART-HEATING PRICE LIST" but the products are from "Bromic", use "Bromic". Look at the filename, product naming patterns, and brand references to determine the actual manufacturer. If the filename contains a brand name (e.g., "Bromic_Retail_Price_List"), prefer that.
          
          Return valid JSON in this exact format:
          {"detectedManufacturer": "Company Name or null", "products": [{"sku": "ABC123", "name": "Product Name", "manufacturer": "Brand", "category": "Category", "unit": "each", "price": 25.99, "cost": 18.50, "description": "Details", "confidence": 0.95}]}
          
          Only include products with valid names and prices > 0.
          If there are two price columns, the higher one is typically retail/list price and the lower is cost/net.
          Focus on complete product entries with clear pricing.`,
        },
        {
          role: "user",
          content: `Extract all product information from this price list. Detect the actual manufacturer/brand name (not just the document header text). The filename is relevant context for identifying the manufacturer.\n\nFilename: ${originalName || 'unknown'}\n\n${truncatedText}`,
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 8000,
    });

    const content = response.choices[0].message.content;
    if (!content) {
      console.warn('extractProductsFromText: empty response from OpenAI');
      return { products: [], detectedManufacturer: null };
    }

    console.log(`extractProductsFromText: got ${content.length} char response`);

    let parsedContent;
    try {
      parsedContent = JSON.parse(content);
    } catch (jsonError) {
      console.warn('extractProductsFromText: JSON parse failed, trying fallback...');
      try {
        const productsStart = content.indexOf('"products": [');
        if (productsStart === -1) {
          console.warn('extractProductsFromText: no products array found in response');
          return { products: [], detectedManufacturer: null };
        }

        let productsContent = content.substring(productsStart + 13);
        
        const lastCompleteProduct = productsContent.lastIndexOf('}, {');
        if (lastCompleteProduct !== -1) {
          productsContent = productsContent.substring(0, lastCompleteProduct + 1);
        } else {
          const firstProductEnd = productsContent.indexOf('}');
          if (firstProductEnd !== -1) {
            productsContent = productsContent.substring(0, firstProductEnd + 1);
          } else {
            return { products: [], detectedManufacturer: null };
          }
        }

        const fixedJson = `{"products": [${productsContent}]}`;
        parsedContent = JSON.parse(fixedJson);
      } catch (fallbackError) {
        console.error('extractProductsFromText: fallback parse also failed:', fallbackError);
        return { products: [], detectedManufacturer: null };
      }
    }

    const rawProductCount = parsedContent?.products?.length ?? 0;
    console.log(`extractProductsFromText: parsed ${rawProductCount} raw products, manufacturer: ${parsedContent?.detectedManufacturer || 'none'}`);

    try {
      const parsed = ExtractedProductsSchema.parse(parsedContent);
      console.log(`extractProductsFromText: validated ${parsed.products.length} products`);
      return parsed;
    } catch (zodError: any) {
      console.error('extractProductsFromText: Zod validation failed:', zodError.errors || zodError.message);
      const safeProducts = (parsedContent?.products || []).filter((p: any) => p && typeof p.name === 'string' && typeof p.price === 'number' && p.price > 0);
      console.log(`extractProductsFromText: recovered ${safeProducts.length} products after Zod failure`);
      return {
        products: safeProducts.map((p: any) => ({
          sku: p.sku || null,
          name: p.name,
          manufacturer: p.manufacturer || null,
          category: p.category || null,
          unit: p.unit || null,
          price: Number(p.price),
          cost: p.cost != null ? Number(p.cost) : null,
          description: p.description || null,
          confidence: typeof p.confidence === 'number' ? Math.min(1, Math.max(0, p.confidence)) : undefined,
        })),
        detectedManufacturer: parsedContent?.detectedManufacturer || null,
      };
    }
  } catch (error) {
    console.error('extractProductsFromText error:', error);
    return { products: [], detectedManufacturer: null };
  }
}

export type ProgressCallback = (progress: { phase: string; current: number; total: number; productsFound: number }) => void;

function detectManufacturerFromFilename(filename?: string): string | null {
  if (!filename) return null;
  const clean = filename
    .replace(/\.\w+$/, '')
    .replace(/[_\-,]/g, ' ')
    .replace(/\d{4}/g, '')
    .replace(/\d+/g, '')
    .trim();
  const stopWords = ['retail', 'price', 'list', 'effective', 'excel', 'sheet', 'catalog', 'catalogue', 'wholesale', 'dealer', 'msrp'];
  const words = clean.split(/\s+/).filter(w => w.length > 1 && !stopWords.includes(w.toLowerCase()));
  if (words.length > 0 && words.length <= 4) {
    return words.join(' ');
  }
  if (words.length > 4) {
    return words.slice(0, 3).join(' ');
  }
  return null;
}

function matchesColumnAlias(cellValue: string, aliases: string[]): boolean {
  const lower = cellValue.toLowerCase().trim();
  if (aliases.includes(lower)) return true;
  for (const alias of aliases) {
    if (lower.includes(alias)) return true;
  }
  return false;
}

function classifyColumn(header: string): 'sku' | 'name' | 'price' | 'cost' | 'unknown' {
  const lower = header.toLowerCase().trim();

  const exactCostMatches = ['cost', 'net', 'net price', 'wholesale', 'your price', 'dealer cost', 'your cost', 'deal cost', 'dealer'];
  const exactPriceMatches = ['list price', 'retail price', 'price', 'msrp', 'list', 'retail', 'dealer price', 'unit price', 'umrp', 'srp'];
  const exactSkuMatches = ['code', 'sku', 'item', 'item number', 'part', 'part number', 'model', 'product code', 'item #', 'part #', 'model no.', 'model no', 'model #'];
  const exactNameMatches = ['description', 'name', 'product', 'product name', 'item description', 'desc'];

  if (exactCostMatches.includes(lower)) return 'cost';
  if (exactPriceMatches.includes(lower)) return 'price';
  if (exactSkuMatches.includes(lower)) return 'sku';
  if (exactNameMatches.includes(lower)) return 'name';

  const containsCostKeywords = ['cost', 'net price', 'wholesale'];
  const containsPriceKeywords = ['msrp', 'umrp', 'srp', 'list price', 'retail price', 'unit price'];
  const containsSkuKeywords = ['part num', 'item num', 'product code'];
  const containsNameKeywords = ['description', 'product name'];

  if (containsCostKeywords.some(k => lower.includes(k))) return 'cost';
  if (containsPriceKeywords.some(k => lower.includes(k))) return 'price';
  if (containsSkuKeywords.some(k => lower.includes(k))) return 'sku';
  if (containsNameKeywords.some(k => lower.includes(k))) return 'name';

  return 'unknown';
}

interface ParseOptions {
  retailPriceColumn?: number;
  costColumn?: number;
}

function parseStructuredPriceSheet(rows: any[][], options?: ParseOptions): ExtractedProductsResult | null {
  const skuColAliases = ['code', 'sku', 'item', 'item number', 'part', 'part number', 'model', 'product code', 'item #', 'part #'];
  const nameColAliases = ['description', 'name', 'product', 'product name', 'item description', 'desc'];

  let skuCol = -1, nameCol = -1, priceCol = -1, costCol = -1;
  let currentCategory = '';
  const products: ExtractedProduct[] = [];
  let headerFound = false;
  let detectedColumns: DetectedColumn[] = [];
  let headerRowIndex = -1;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const cells = row.map((c: any) => String(c ?? '').trim());
    const cellsLower = cells.map((c: string) => c.toLowerCase());

    if (!headerFound || (cells.length >= 2 && cellsLower.some(c => matchesColumnAlias(c, skuColAliases) || matchesColumnAlias(c, nameColAliases)))) {
      const foundSku = cellsLower.findIndex(c => matchesColumnAlias(c, skuColAliases));
      const foundName = cellsLower.findIndex(c => matchesColumnAlias(c, nameColAliases));

      const priceColumns: { index: number; header: string; role: 'price' | 'cost' }[] = [];
      cells.forEach((cell, ci) => {
        const role = classifyColumn(cell);
        if (role === 'price' || role === 'cost') {
          priceColumns.push({ index: ci, header: cell, role });
        }
      });

      const hasAnyPriceCol = priceColumns.length > 0;

      if ((foundSku >= 0 || foundName >= 0) && hasAnyPriceCol) {
        skuCol = foundSku;
        nameCol = foundName >= 0 ? foundName : (foundSku >= 0 ? foundSku : -1);
        headerRowIndex = i;

        detectedColumns = cells.map((cell, ci) => ({
          index: ci,
          header: cell,
          role: classifyColumn(cell) as any,
          sampleValues: [] as string[],
        })).filter(c => c.header.length > 0);

        if (options?.retailPriceColumn !== undefined) {
          priceCol = options.retailPriceColumn;
        } else {
          const msrpCol = priceColumns.find(c => c.header.toLowerCase().includes('msrp'));
          const retailCol = priceColumns.find(c => c.role === 'price');
          priceCol = msrpCol?.index ?? retailCol?.index ?? priceColumns[priceColumns.length - 1]?.index ?? -1;
        }

        if (options?.costColumn !== undefined) {
          costCol = options.costColumn;
        } else {
          const costColFound = priceColumns.find(c => c.role === 'cost');
          costCol = costColFound?.index ?? -1;
        }

        headerFound = true;
        continue;
      }
    }

    const nonEmpty = cells.filter(c => c.length > 0);
    if (nonEmpty.length === 1) {
      const val = nonEmpty[0];
      if (!/^\d+(\.\d+)?$/.test(val) && val.length > 2) {
        currentCategory = val;
        continue;
      }
    }
    if (headerFound && nameCol >= 0 && nonEmpty.length <= 2) {
      const nameVal = cells[nameCol];
      if (nameVal && nameVal.length > 2) {
        const hasPrice = priceCol >= 0 && cells[priceCol] && !isNaN(parseFloat(String(cells[priceCol]).replace(/[$,]/g, '')));
        const hasSku = skuCol >= 0 && cells[skuCol] && cells[skuCol].length > 0;
        if (!hasPrice && !hasSku) {
          currentCategory = nameVal;
          continue;
        }
      }
    }

    if (!headerFound) continue;

    if (products.length < 3) {
      detectedColumns.forEach(col => {
        const cellVal = cells[col.index] || '';
        if (cellVal && col.sampleValues.length < 3) {
          col.sampleValues.push(cellVal);
        }
      });
    }

    const nameVal = nameCol >= 0 ? cells[nameCol] : '';
    const skuVal = skuCol >= 0 ? cells[skuCol] : '';
    const priceRaw = priceCol >= 0 ? cells[priceCol] : '';
    const costRaw = costCol >= 0 ? cells[costCol] : '';

    const priceNum = parseFloat(priceRaw.replace(/[$,]/g, ''));
    const costNum = costRaw ? parseFloat(costRaw.replace(/[$,]/g, '')) : null;

    if (!nameVal && !skuVal) continue;
    if (isNaN(priceNum) || priceNum <= 0) continue;

    const productName = nameVal || skuVal;
    if (productName.length < 2) continue;

    products.push({
      sku: skuVal || null,
      name: productName,
      manufacturer: null,
      category: currentCategory || null,
      unit: 'each',
      price: priceNum,
      cost: costNum && !isNaN(costNum) && costNum > 0 ? costNum : null,
      description: null,
      confidence: 0.99,
    });
  }

  if (products.length >= 3) {
    console.log(`Deterministic parser found ${products.length} products (priceCol=${priceCol}, costCol=${costCol})`);
    return { products, detectedManufacturer: null, detectedColumns };
  }

  return null;
}

export async function analyzePriceSheetColumns(
  fileBuffer: Buffer,
  fileType: 'csv' | 'excel' | 'pdf',
  originalName?: string,
): Promise<{ detectedColumns: DetectedColumn[]; detectedManufacturer: string | null; totalRows: number } | null> {
  if (fileType === 'pdf') return null;

  const XLSX = await import('xlsx');
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!rows || rows.length === 0) return null;

  const result = parseStructuredPriceSheet(rows);
  if (!result || !result.detectedColumns || result.detectedColumns.length === 0) return null;

  const priceOrCostCols = result.detectedColumns.filter(c => c.role === 'price' || c.role === 'cost');
  if (priceOrCostCols.length < 2) return null;

  const filenameMfr = detectManufacturerFromFilename(originalName);
  return {
    detectedColumns: result.detectedColumns,
    detectedManufacturer: filenameMfr,
    totalRows: result.products.length,
  };
}

export async function extractProductsFromPriceSheet(
  fileBuffer: Buffer,
  fileType: 'csv' | 'excel' | 'pdf',
  originalName?: string,
  onProgress?: ProgressCallback,
  columnOptions?: ParseOptions,
): Promise<ExtractedProductsResult> {
  try {
    if (fileType === 'pdf') {
      return await extractProductsFromPDF(fileBuffer, onProgress, originalName);
    }

    onProgress?.({ phase: 'reading', current: 0, total: 1, productsFound: 0 });

    const XLSX = await import('xlsx');
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    const fullText = XLSX.utils.sheet_to_csv(sheet);

    if (!rows || rows.length === 0) {
      return { products: [], detectedManufacturer: null };
    }

    console.log(`extractProductsFromPriceSheet: ${rows.length} rows, first 3:`, rows.slice(0, 3).map(r => r.map(String).join(' | ')));

    onProgress?.({ phase: 'extracting', current: 0, total: 1, productsFound: 0 });

    const deterministicResult = parseStructuredPriceSheet(rows, columnOptions);
    if (deterministicResult && deterministicResult.products.length > 0) {
      const filenameMfr = detectManufacturerFromFilename(originalName);
      deterministicResult.detectedManufacturer = filenameMfr;
      console.log(`Deterministic parse successful: ${deterministicResult.products.length} products, manufacturer: ${filenameMfr || 'none'}`);
      onProgress?.({ phase: 'done', current: 1, total: 1, productsFound: deterministicResult.products.length });
      return deterministicResult;
    }

    console.log('Deterministic parse failed, falling back to AI extraction...');

    if (!fullText || fullText.trim().length === 0) {
      return { products: [], detectedManufacturer: null };
    }

    const lines = fullText.split('\n');
    const CHUNK_SIZE = 150;

    if (lines.length <= CHUNK_SIZE + 10) {
      onProgress?.({ phase: 'extracting', current: 1, total: 1, productsFound: 0 });
      const result = await extractProductsFromText(fullText, originalName);
      onProgress?.({ phase: 'done', current: 1, total: 1, productsFound: result.products.length });
      return result;
    }

    console.log(`Large file detected (${lines.length} lines). Processing in chunks...`);
    const headerLines = lines.slice(0, 5).join('\n');
    const chunks: string[] = [];
    
    for (let i = 5; i < lines.length; i += CHUNK_SIZE) {
      const chunkLines = lines.slice(i, i + CHUNK_SIZE);
      chunks.push(headerLines + '\n' + chunkLines.join('\n'));
    }

    const allProducts: ExtractedProduct[] = [];
    let detectedManufacturer: string | null = null;
    const seenNames = new Set<string>();
    let completedChunks = 0;
    const CONCURRENCY = 3;

    for (let batchStart = 0; batchStart < chunks.length; batchStart += CONCURRENCY) {
      const batch = chunks.slice(batchStart, batchStart + CONCURRENCY);
      onProgress?.({ phase: 'extracting', current: completedChunks + 1, total: chunks.length, productsFound: allProducts.length });

      const batchResults = await Promise.all(
        batch.map((chunk, idx) => {
          console.log(`Processing chunk ${batchStart + idx + 1}/${chunks.length}...`);
          return extractProductsFromText(chunk, originalName);
        })
      );

      for (const result of batchResults) {
        if (result.detectedManufacturer && !detectedManufacturer) {
          detectedManufacturer = result.detectedManufacturer;
        }
        for (const product of result.products) {
          const key = product.name.toLowerCase().trim();
          if (!seenNames.has(key)) {
            seenNames.add(key);
            allProducts.push(product);
          }
        }
      }
      completedChunks += batch.length;
      onProgress?.({ phase: 'extracting', current: completedChunks, total: chunks.length, productsFound: allProducts.length });
    }

    onProgress?.({ phase: 'done', current: chunks.length, total: chunks.length, productsFound: allProducts.length });
    console.log(`Chunked extraction complete: ${allProducts.length} products from ${chunks.length} chunks`);
    return { products: allProducts, detectedManufacturer };

  } catch (error) {
    console.error('Error in extractProductsFromPriceSheet:', error);
    return { products: [], detectedManufacturer: null };
  }
}

async function extractProductsFromPDF(pdfBuffer: Buffer, onProgress?: ProgressCallback, originalName?: string): Promise<ExtractedProductsResult> {
  try {
    onProgress?.({ phase: 'reading_pdf', current: 0, total: 1, productsFound: 0 });
    const textContent = await extractTextFromPDF(pdfBuffer);
    
    if (textContent && textContent.trim().length > 50) {
      console.log(`PDF text extracted (${textContent.length} chars). Processing with text extraction...`);
      const lines = textContent.split('\n');
      const CHUNK_SIZE = 200;
      
      if (lines.length <= CHUNK_SIZE + 10) {
        onProgress?.({ phase: 'extracting', current: 1, total: 1, productsFound: 0 });
        const result = await extractProductsFromText(textContent, originalName);
        onProgress?.({ phase: 'done', current: 1, total: 1, productsFound: result.products.length });
        return result;
      }

      const headerLines = lines.slice(0, 5).join('\n');
      const chunks: string[] = [];
      for (let i = 5; i < lines.length; i += CHUNK_SIZE) {
        chunks.push(headerLines + '\n' + lines.slice(i, i + CHUNK_SIZE).join('\n'));
      }

      const allProducts: ExtractedProduct[] = [];
      let detectedManufacturer: string | null = null;
      const seenNames = new Set<string>();
      let completedChunks = 0;
      const PDF_CONCURRENCY = 3;

      for (let batchStart = 0; batchStart < chunks.length; batchStart += PDF_CONCURRENCY) {
        const batch = chunks.slice(batchStart, batchStart + PDF_CONCURRENCY);
        onProgress?.({ phase: 'extracting', current: completedChunks + 1, total: chunks.length, productsFound: allProducts.length });

        const batchResults = await Promise.all(batch.map(c => extractProductsFromText(c, originalName)));
        for (const result of batchResults) {
          if (result.detectedManufacturer && !detectedManufacturer) {
            detectedManufacturer = result.detectedManufacturer;
          }
          for (const product of result.products) {
            const key = product.name.toLowerCase().trim();
            if (!seenNames.has(key)) {
              seenNames.add(key);
              allProducts.push(product);
            }
          }
        }
        completedChunks += batch.length;
        onProgress?.({ phase: 'extracting', current: completedChunks, total: chunks.length, productsFound: allProducts.length });
      }

      onProgress?.({ phase: 'done', current: chunks.length, total: chunks.length, productsFound: allProducts.length });
      return { products: allProducts, detectedManufacturer };
    }

    console.log('PDF text extraction insufficient, falling back to vision...');
    onProgress?.({ phase: 'converting_pages', current: 0, total: 1, productsFound: 0 });
    const { convertPDFToImagesServer } = await import('./quoteImageUtils');
    const pageImages = await convertPDFToImagesServer(pdfBuffer);
    const MAX_VISION_PAGES = 20;
    const images = pageImages.map(p => p.imageBase64).slice(0, MAX_VISION_PAGES);
    if (pageImages.length > MAX_VISION_PAGES) {
      console.warn(`PDF has ${pageImages.length} pages, processing only first ${MAX_VISION_PAGES} via vision.`);
    }
    
    if (!images || images.length === 0) {
      return { products: [], detectedManufacturer: null };
    }

    const allProducts: ExtractedProduct[] = [];
    let detectedManufacturer: string | null = null;
    const seenNames = new Set<string>();
    let completedPages = 0;
    const VISION_CONCURRENCY = 2;

    for (let batchStart = 0; batchStart < images.length; batchStart += VISION_CONCURRENCY) {
      const batch = images.slice(batchStart, batchStart + VISION_CONCURRENCY);
      onProgress?.({ phase: 'extracting_vision', current: completedPages + 1, total: images.length, productsFound: allProducts.length });

      const batchResults = await Promise.all(batch.map(img => extractProductsFromImage(img, originalName)));
      for (const result of batchResults) {
        if (result.detectedManufacturer && !detectedManufacturer) {
          detectedManufacturer = result.detectedManufacturer;
        }
        for (const product of result.products) {
          const key = product.name.toLowerCase().trim();
          if (!seenNames.has(key)) {
            seenNames.add(key);
            allProducts.push(product);
          }
        }
      }
      completedPages += batch.length;
      onProgress?.({ phase: 'extracting_vision', current: completedPages, total: images.length, productsFound: allProducts.length });
    }

    onProgress?.({ phase: 'done', current: images.length, total: images.length, productsFound: allProducts.length });
    return { products: allProducts, detectedManufacturer };
  } catch (error) {
    console.error('Error extracting products from PDF:', error);
    return { products: [], detectedManufacturer: null };
  }
}

// Simple PDF text extraction using PDF.js
async function extractTextFromPDF(pdfBuffer: Buffer): Promise<string | null> {
  try {
    // Add polyfill for Promise.withResolvers if needed
    if (!Promise.withResolvers) {
      await import('@ungap/with-resolvers' as any);
    }

    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
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
  let parsedContent: any;
  
  try {
    console.log('🤖 Processing text with OpenAI for quote extraction');
    
    const response = await getOpenAI().chat.completions.create({
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
  "customer": {
    "name": string|null, 
    "email": string|null, 
    "phone": string|null, 
    "company": string|null, 
    "address": string|null,
    "streetAddress": string|null,
    "addressLine2": string|null,
    "city": string|null,
    "state": string|null,
    "zipCode": string|null,
    "country": string|null
  },
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
- For customer: if no customer info found, return {"name": null, "email": null, "phone": null, "company": null, "address": null, "streetAddress": null, "addressLine2": null, "city": null, "state": null, "zipCode": null, "country": null}
- For customer address: provide both the full "address" string AND structured fields (streetAddress, city, state, zipCode, country) when possible
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

    try {
      parsedContent = JSON.parse(content);
    } catch (jsonError) {
      console.error('JSON parsing failed:', jsonError);
      return null;
    }

    const extracted = ExtractedQuoteSchema.parse(parsedContent);

    // Normalize customer and lineItems to ensure consistent defaults
    extracted.customer = extracted.customer ?? { 
      name: null, email: null, phone: null, company: null, address: null,
      streetAddress: null, addressLine2: null, city: null, state: null, zipCode: null, country: null
    };
    extracted.lineItems = extracted.lineItems ?? [];

    // Calculate confidence if not present
    if (!extracted.confidence) {
      extracted.confidence = calculateExtractionConfidence(extracted);
    }

    return extracted;

  } catch (error) {
    // Handle Zod validation errors specifically
    if (error instanceof z.ZodError) {
      const validationIssues = error.issues.map(issue => 
        `${issue.path.join('.')}: ${issue.message}`
      );
      
      console.error('📋 Quote data validation failed:', {
        message: 'AI response did not match expected quote structure',
        validationIssues: validationIssues,
        // Log truncated/redacted data (remove potential PII)
        receivedDataSample: parsedContent ? 
          JSON.stringify(parsedContent, null, 2).substring(0, 500) + '...' : 
          'No data parsed'
      });
    } else {
      console.error('Error extracting quote data from text:', error);
    }
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
  let parsedContent: any;
  
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

    const response = await getOpenAI().chat.completions.create({
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
            "customer": {
              "name": string|null, 
              "email": string|null, 
              "phone": string|null, 
              "company": string|null, 
              "address": string|null,
              "streetAddress": string|null,
              "addressLine2": string|null,
              "city": string|null,
              "state": string|null,
              "zipCode": string|null,
              "country": string|null
            },
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
          - For customer: if no customer info found, return {"name": null, "email": null, "phone": null, "company": null, "address": null, "streetAddress": null, "addressLine2": null, "city": null, "state": null, "zipCode": null, "country": null}
          - For customer address: provide both the full "address" string AND structured fields (streetAddress, city, state, zipCode, country) when possible
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

    try {
      parsedContent = JSON.parse(content);
    } catch (jsonError) {
      console.error('JSON parsing failed for vision extraction:', jsonError);
      return null;
    }

    // Validate with extended schema
    const extracted = ExtractedQuoteWithPageRefsSchema.parse(parsedContent);
    
    // Normalize customer and lineItems to ensure consistent defaults
    extracted.customer = extracted.customer ?? { 
      name: null, email: null, phone: null, company: null, address: null,
      streetAddress: null, addressLine2: null, city: null, state: null, zipCode: null, country: null
    };
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
    // Handle Zod validation errors specifically  
    if (error instanceof z.ZodError) {
      const validationIssues = error.issues.map(issue => 
        `${issue.path.join('.')}: ${issue.message}`
      );
      
      console.error('📋 Quote data validation failed (vision processing):', {
        message: 'AI response did not match expected quote structure',
        validationIssues: validationIssues,
        // Log truncated/redacted data (remove potential PII)
        receivedDataSample: parsedContent ? 
          JSON.stringify(parsedContent, null, 2).substring(0, 500) + '...' : 
          'No data parsed'
      });
    } else {
      console.error('Error in processImagesInSingleCall:', error);
    }
    return null;
  }
}

async function consolidateQuoteParts(parts: ExtractedQuoteWithPageRefs[]): Promise<ExtractedQuote> {
  try {
    // Consolidate multiple extraction results into a single quote
    const consolidated: ExtractedQuote & {
      customer: NonNullable<ExtractedQuote["customer"]>;
      lineItems: NonNullable<ExtractedQuote["lineItems"]>;
    } = {
      customer: { 
        name: null, email: null, phone: null, company: null, address: null,
        streetAddress: null, addressLine2: null, city: null, state: null, zipCode: null, country: null
      },
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
