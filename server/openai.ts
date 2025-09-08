import OpenAI from "openai";
import { z } from "zod";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
  description: z.string(),
  quantity: z.number(),
  price: z.number(),
  total: z.number(),
  unit: z.string().nullable().optional(),
});

const ExtractedCustomerSchema = z.object({
  name: z.string(),
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
});

export type ExtractedQuote = z.infer<typeof ExtractedQuoteSchema>;

export async function extractProductsFromImage(base64Image: string): Promise<ExtractedProduct[]> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
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
      max_completion_tokens: 8000, // Increased token limit
      temperature: 0, // More deterministic output
    });

    const content = response.choices[0].message.content;
    if (!content) {
      console.error("Empty response from OpenAI for image");
      return [];
    }

    // More robust JSON parsing with error handling
    let parsedContent;
    try {
      parsedContent = JSON.parse(content);
    } catch (jsonError) {
      console.error("JSON parsing failed for image:", jsonError);
      console.error("Raw content:", content);
      
      // Try to extract valid JSON from partial response
      try {
        const productsMatch = content.match(/"products"\s*:\s*\[(.*?)\]/);
        if (productsMatch) {
          const productsStr = `{"products": [${productsMatch[1]}]}`;
          parsedContent = JSON.parse(productsStr);
        } else {
          console.error("Could not extract products array from image response");
          return [];
        }
      } catch (fallbackError) {
        console.error("Fallback parsing also failed for image:", fallbackError);
        return [];
      }
    }

    // Validate and parse with schema
    const parsed = ExtractedProductsSchema.parse(parsedContent);
    return parsed.products || [];
  } catch (error) {
    console.error("Error extracting products from image:", error);
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
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
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
      max_completion_tokens: 8000, // Increased token limit
      temperature: 0, // More deterministic output
    });

    const content = response.choices[0].message.content;
    if (!content) {
      console.error("Empty response from OpenAI");
      return [];
    }

    // More robust JSON parsing with error handling
    let parsedContent;
    try {
      parsedContent = JSON.parse(content);
    } catch (jsonError) {
      console.error("JSON parsing failed:", jsonError);
      console.error("Raw content:", content);
      
      // Try to extract products from truncated response
      try {
        console.log("Attempting to parse truncated response...");
        
        // Find the start of the products array
        const productsStart = content.indexOf('"products": [');
        if (productsStart === -1) {
          console.error("No products array found in response");
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
            console.error("No complete products found in truncated response");
            return [];
          }
        }

        // Reconstruct valid JSON
        const fixedJson = `{"products": [${productsContent}]}`;
        parsedContent = JSON.parse(fixedJson);
        console.log(`Successfully recovered ${parsedContent.products?.length || 0} products from truncated response`);
      } catch (fallbackError) {
        console.error("Fallback parsing also failed:", fallbackError);
        return [];
      }
    }

    // Validate and parse with schema
    const parsed = ExtractedProductsSchema.parse(parsedContent);
    return parsed.products || [];
  } catch (error) {
    console.error("Error extracting products from text:", error);
    return []; // Return empty array instead of throwing
  }
}

export async function extractQuoteDataFromText(text: string): Promise<ExtractedQuote | null> {
  try {
    // Truncate text if too long to prevent token limit issues
    const maxTextLength = 20000; // Reasonable limit for GPT-5
    const truncatedText = text.length > maxTextLength 
      ? text.substring(0, maxTextLength) + "\n... (truncated)"
      : text;

    const response = await openai.chat.completions.create({
      model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: `You are a data extraction expert specializing in construction quotes and estimates. Extract complete quote information from text.
          
          Extract the following information and return as JSON:
          
          1. Customer Information:
             - name (string, required)
             - email (string or null)
             - phone (string or null)
             - company (string or null)
             - address (string or null)
          
          2. Quote Details:
             - quoteNumber (string or null)
             - date (string or null)
             - projectDescription (string or null)
             - notes (string or null)
             - terms (string or null)
          
          3. Line Items (array of objects):
             - description (string, required)
             - quantity (number, required)
             - price (number per unit, required)
             - total (number, required)
             - unit (string or null, e.g., "each", "sqft", "linear ft")
          
          4. Financial Summary:
             - subtotal (number or null)
             - taxRate (number or null, as decimal like 0.08 for 8%)
             - taxAmount (number or null)
             - discountAmount (number or null)
             - total (number or null)
          
          Return valid JSON in this exact format:
          {
            "customer": {"name": "John Doe", "email": "john@example.com", "phone": "555-1234", "company": "ABC Corp", "address": "123 Main St"},
            "quoteNumber": "Q-2024-001",
            "date": "2024-01-15",
            "projectDescription": "Patio construction",
            "lineItems": [
              {"description": "Materials", "quantity": 1, "price": 500.00, "total": 500.00, "unit": "each"}
            ],
            "subtotal": 500.00,
            "taxRate": 0.08,
            "taxAmount": 40.00,
            "discountAmount": null,
            "total": 540.00,
            "notes": "Additional notes",
            "terms": "Payment terms"
          }
          
          If information is missing or unclear, use null for optional fields.
          Ensure all numbers are valid and line item totals match quantity × price.
          Focus on accuracy and completeness.`,
        },
        {
          role: "user",
          content: `Extract quote information from this document:\n\n${truncatedText}`,
        },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 4000,
      temperature: 0, // More deterministic output
    });

    const content = response.choices[0].message.content;
    if (!content) {
      console.error("Empty response from OpenAI for quote extraction");
      return null;
    }

    // Parse and validate JSON
    let parsedContent;
    try {
      parsedContent = JSON.parse(content);
    } catch (jsonError) {
      console.error("JSON parsing failed for quote extraction:", jsonError);
      console.error("Raw content:", content);
      return null;
    }

    // Validate and parse with schema
    const extracted = ExtractedQuoteSchema.parse(parsedContent);
    return extracted;
  } catch (error) {
    console.error("Error extracting quote data from text:", error);
    return null;
  }
}