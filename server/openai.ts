import OpenAI from "openai";
import { z } from "zod";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Schema for extracted product data
const ExtractedProductSchema = z.object({
  sku: z.string().optional(),
  name: z.string(),
  unit: z.string().optional(),
  price: z.number(),
  description: z.string().optional(),
});

const ExtractedProductsSchema = z.object({
  products: z.array(ExtractedProductSchema),
});

export type ExtractedProduct = z.infer<typeof ExtractedProductSchema>;

export async function extractProductsFromImage(base64Image: string): Promise<ExtractedProduct[]> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a data extraction expert. Extract product information from price lists and catalogs.
          
          For each product row you find, extract:
          - SKU or product code (if available)
          - Product name
          - Unit of measurement (each, sq ft, linear ft, etc.)
          - Price (numerical value only)
          - Description (if available)
          
          Return the data as JSON with a "products" array containing objects with these fields.
          If a field is not found, omit it or set as null.
          Ensure prices are numeric values (not strings).`,
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
      max_tokens: 4000,
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("No content in response");
    }

    const parsed = ExtractedProductsSchema.parse(JSON.parse(content));
    return parsed.products;
  } catch (error) {
    console.error("Error extracting products from image:", error);
    throw new Error("Failed to extract products from image");
  }
}

export async function extractProductsFromText(text: string): Promise<ExtractedProduct[]> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a data extraction expert. Extract product information from price list text.
          
          For each product row you find, extract:
          - SKU or product code (if available)
          - Product name
          - Unit of measurement (each, sq ft, linear ft, etc.)
          - Price (numerical value only)
          - Description (if available)
          
          Return the data as JSON with a "products" array containing objects with these fields.
          If a field is not found, omit it or set as null.
          Ensure prices are numeric values (not strings).`,
        },
        {
          role: "user",
          content: `Extract all product information from this price list text:\n\n${text}`,
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 4000,
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("No content in response");
    }

    const parsed = ExtractedProductsSchema.parse(JSON.parse(content));
    return parsed.products;
  } catch (error) {
    console.error("Error extracting products from text:", error);
    throw new Error("Failed to extract products from text");
  }
}