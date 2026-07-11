import { describe, it, expect } from "vitest";
import {
  ExtractedProductSchema,
  ExtractedProductsSchema,
  ExtractedLineItemSchema,
  ExtractedCustomerSchema,
  ExtractedQuoteSchema,
  ExtractedQuoteWithPageRefsSchema,
  createVisionExtractionCacheKey,
} from "../openai";

describe("OpenAI vision cache identity", () => {
  it("uses complete image bytes rather than a shared base64 prefix", () => {
    const sharedPrefix = Buffer.alloc(128, 7);
    const firstImage = Buffer.concat([sharedPrefix, Buffer.from("first-tail")]).toString("base64");
    const secondImage = Buffer.concat([sharedPrefix, Buffer.from("second-tail")]).toString("base64");

    expect(firstImage.slice(0, 100)).toBe(secondImage.slice(0, 100));
    expect(createVisionExtractionCacheKey([{ index: 0, imageBase64: firstImage }]))
      .not.toBe(createVisionExtractionCacheKey([{ index: 0, imageBase64: secondImage }]));
  });

  it("includes page identity and order in the cache key", () => {
    const imageBase64 = Buffer.from("same-image").toString("base64");

    expect(createVisionExtractionCacheKey([{ index: 0, imageBase64 }]))
      .not.toBe(createVisionExtractionCacheKey([{ index: 1, imageBase64 }]));
  });
});

describe("OpenAI Quote Import Schemas", () => {
  describe("ExtractedProductSchema", () => {
    it("should validate a complete product object", () => {
      const validProduct = {
        sku: "ABC123",
        name: "Test Product",
        unit: "each",
        price: 29.99,
        description: "A test product",
      };

      const result = ExtractedProductSchema.parse(validProduct);
      expect(result).toEqual(validProduct);
    });

    it("should validate product with minimal required fields", () => {
      const minimalProduct = {
        name: "Minimal Product",
        price: 10.0,
      };

      const result = ExtractedProductSchema.parse(minimalProduct);
      expect(result.name).toBe("Minimal Product");
      expect(result.price).toBe(10.0);
    });

    it("should accept null optional fields", () => {
      const productWithNulls = {
        sku: null,
        name: "Product with Nulls",
        unit: null,
        price: 15.0,
        description: null,
      };

      const result = ExtractedProductSchema.parse(productWithNulls);
      expect(result.sku).toBeNull();
      expect(result.unit).toBeNull();
    });

    it("should reject product without name", () => {
      const invalidProduct = {
        price: 10.0,
      };

      expect(() => ExtractedProductSchema.parse(invalidProduct)).toThrow();
    });

    it("should reject product without price", () => {
      const invalidProduct = {
        name: "No Price Product",
      };

      expect(() => ExtractedProductSchema.parse(invalidProduct)).toThrow();
    });

    it("should reject non-numeric price", () => {
      const invalidProduct = {
        name: "Invalid Price",
        price: "29.99",
      };

      expect(() => ExtractedProductSchema.parse(invalidProduct)).toThrow();
    });
  });

  describe("ExtractedProductsSchema", () => {
    it("should validate array of products", () => {
      const productsData = {
        products: [
          { name: "Product 1", price: 10.0 },
          { name: "Product 2", price: 20.0 },
          { name: "Product 3", price: 30.0 },
        ],
      };

      const result = ExtractedProductsSchema.parse(productsData);
      expect(result.products).toHaveLength(3);
    });

    it("should validate empty products array", () => {
      const emptyProducts = { products: [] };
      const result = ExtractedProductsSchema.parse(emptyProducts);
      expect(result.products).toHaveLength(0);
    });
  });

  describe("ExtractedLineItemSchema", () => {
    it("should validate a complete line item", () => {
      const lineItem = {
        description: "Installation Service",
        quantity: 2,
        price: 150.0,
        total: 300.0,
        unit: "hours",
      };

      const result = ExtractedLineItemSchema.parse(lineItem);
      expect(result.description).toBe("Installation Service");
      expect(result.quantity).toBe(2);
      expect(result.total).toBe(300.0);
    });

    it("should validate partial line item", () => {
      const partialLineItem = {
        description: "Basic Service",
        price: 100.0,
      };

      const result = ExtractedLineItemSchema.parse(partialLineItem);
      expect(result.description).toBe("Basic Service");
      expect(result.quantity).toBeUndefined();
    });

    it("should accept empty object", () => {
      const emptyLineItem = {};
      const result = ExtractedLineItemSchema.parse(emptyLineItem);
      expect(result).toBeDefined();
    });
  });

  describe("ExtractedCustomerSchema", () => {
    it("should validate complete customer with structured address", () => {
      const customer = {
        name: "John Doe",
        email: "john@example.com",
        phone: "555-123-4567",
        company: "Acme Corp",
        streetAddress: "123 Main St",
        addressLine2: "Suite 100",
        city: "Austin",
        state: "TX",
        zipCode: "78701",
        country: "United States",
      };

      const result = ExtractedCustomerSchema.parse(customer);
      expect(result.name).toBe("John Doe");
      expect(result.city).toBe("Austin");
      expect(result.state).toBe("TX");
    });

    it("should validate customer with legacy flat address", () => {
      const customer = {
        name: "Jane Smith",
        email: "jane@example.com",
        address: "456 Oak Ave, Dallas, TX 75201",
      };

      const result = ExtractedCustomerSchema.parse(customer);
      expect(result.address).toContain("Dallas");
    });

    it("should validate minimal customer", () => {
      const minimalCustomer = {
        name: "Minimal Customer",
      };

      const result = ExtractedCustomerSchema.parse(minimalCustomer);
      expect(result.name).toBe("Minimal Customer");
      expect(result.email).toBeUndefined();
    });
  });

  describe("ExtractedQuoteSchema", () => {
    it("should validate a complete quote extraction", () => {
      const quote = {
        customer: {
          name: "Test Customer",
          email: "test@example.com",
          company: "Test Co",
          city: "Houston",
          state: "TX",
        },
        quoteNumber: "Q-2024-001",
        date: "2024-11-25",
        projectDescription: "Pool installation project",
        lineItems: [
          { description: "Pool Kit", quantity: 1, price: 5000, total: 5000 },
          { description: "Installation", quantity: 8, price: 100, total: 800 },
        ],
        subtotal: 5800,
        taxRate: 8.25,
        taxAmount: 478.5,
        discountAmount: 0,
        total: 6278.5,
        notes: "Installation within 2 weeks",
        terms: "Net 30",
        confidence: 0.92,
      };

      const result = ExtractedQuoteSchema.parse(quote);
      expect(result.quoteNumber).toBe("Q-2024-001");
      expect(result.lineItems).toHaveLength(2);
      expect(result.confidence).toBe(0.92);
    });

    it("should validate partial quote extraction", () => {
      const partialQuote = {
        projectDescription: "Basic project",
        total: 1000,
      };

      const result = ExtractedQuoteSchema.parse(partialQuote);
      expect(result.projectDescription).toBe("Basic project");
      expect(result.customer).toBeUndefined();
    });

    it("should validate confidence between 0 and 1", () => {
      const validConfidence = { confidence: 0.5 };
      const result = ExtractedQuoteSchema.parse(validConfidence);
      expect(result.confidence).toBe(0.5);
    });

    it("should reject confidence greater than 1", () => {
      const invalidConfidence = { confidence: 1.5 };
      expect(() => ExtractedQuoteSchema.parse(invalidConfidence)).toThrow();
    });

    it("should reject confidence less than 0", () => {
      const invalidConfidence = { confidence: -0.1 };
      expect(() => ExtractedQuoteSchema.parse(invalidConfidence)).toThrow();
    });
  });

  describe("ExtractedQuoteWithPageRefsSchema", () => {
    it("should validate quote with page references", () => {
      const quoteWithRefs = {
        projectDescription: "Multi-page quote",
        total: 5000,
        pageRefs: [0, 1, 3],
      };

      const result = ExtractedQuoteWithPageRefsSchema.parse(quoteWithRefs);
      expect(result.pageRefs).toEqual([0, 1, 3]);
    });

    it("should validate quote without page references", () => {
      const quoteWithoutRefs = {
        projectDescription: "Single page quote",
        total: 1000,
      };

      const result = ExtractedQuoteWithPageRefsSchema.parse(quoteWithoutRefs);
      expect(result.pageRefs).toBeUndefined();
    });
  });
});

describe("OpenAI Response Parsing", () => {
  describe("JSON parsing edge cases", () => {
    it("should handle valid JSON products response", () => {
      const jsonResponse = '{"products": [{"name": "Product A", "price": 100}]}';
      const parsed = JSON.parse(jsonResponse);
      const result = ExtractedProductsSchema.parse(parsed);
      
      expect(result.products).toHaveLength(1);
      expect(result.products[0].name).toBe("Product A");
    });

    it("should handle products with special characters", () => {
      const productsData = {
        products: [
          { name: "Product with \"quotes\"", price: 10.0 },
          { name: "Product with unicode ñ é ü", price: 20.0 },
          { name: "Product with $pecial ch@r$", price: 30.0 },
        ],
      };

      const result = ExtractedProductsSchema.parse(productsData);
      expect(result.products).toHaveLength(3);
    });

    it("should handle very large price values", () => {
      const product = {
        name: "Expensive Item",
        price: 999999999.99,
      };

      const result = ExtractedProductSchema.parse(product);
      expect(result.price).toBe(999999999.99);
    });

    it("should handle zero price", () => {
      const product = {
        name: "Free Item",
        price: 0,
      };

      const result = ExtractedProductSchema.parse(product);
      expect(result.price).toBe(0);
    });

    it("should handle decimal precision", () => {
      const product = {
        name: "Precise Price",
        price: 123.456789,
      };

      const result = ExtractedProductSchema.parse(product);
      expect(result.price).toBeCloseTo(123.456789);
    });
  });

  describe("Quote data transformation", () => {
    it("should extract customer info from quote", () => {
      const quoteData = {
        customer: {
          name: "ABC Company",
          email: "contact@abc.com",
          phone: "512-555-1234",
          streetAddress: "100 Tech Blvd",
          city: "Austin",
          state: "TX",
          zipCode: "78701",
        },
        total: 5000,
      };

      const result = ExtractedQuoteSchema.parse(quoteData);
      expect(result.customer?.name).toBe("ABC Company");
      expect(result.customer?.city).toBe("Austin");
    });

    it("should handle null customer", () => {
      const quoteWithNullCustomer = {
        customer: null,
        total: 1000,
      };

      const result = ExtractedQuoteSchema.parse(quoteWithNullCustomer);
      expect(result.customer).toBeNull();
    });

    it("should handle empty line items array", () => {
      const quoteWithEmptyItems = {
        lineItems: [],
        total: 0,
      };

      const result = ExtractedQuoteSchema.parse(quoteWithEmptyItems);
      expect(result.lineItems).toHaveLength(0);
    });

    it("should handle null line items", () => {
      const quoteWithNullItems = {
        lineItems: null,
        total: 1000,
      };

      const result = ExtractedQuoteSchema.parse(quoteWithNullItems);
      expect(result.lineItems).toBeNull();
    });
  });

  describe("Negative validation tests", () => {
    it("should reject invalid product with wrong field types", () => {
      const invalidProduct = {
        name: 123,
        price: "not a number",
      };

      expect(() => ExtractedProductSchema.parse(invalidProduct)).toThrow();
    });

    it("should reject quote with invalid customer structure", () => {
      const invalidQuote = {
        customer: "not an object",
        total: 1000,
      };

      expect(() => ExtractedQuoteSchema.parse(invalidQuote)).toThrow();
    });

    it("should reject quote with invalid line items", () => {
      const invalidQuote = {
        lineItems: "not an array",
        total: 1000,
      };

      expect(() => ExtractedQuoteSchema.parse(invalidQuote)).toThrow();
    });
  });
});
