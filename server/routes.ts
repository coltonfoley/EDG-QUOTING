import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertCustomerSchema, insertQuoteSchema, insertLineItemSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Customer routes
  app.get("/api/customers/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const customer = await storage.getCustomer(id);
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }
      res.json(customer);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/customers", async (req, res) => {
    try {
      const customerData = insertCustomerSchema.parse(req.body);
      
      // Check if customer already exists by email
      const existingCustomer = await storage.getCustomerByEmail(customerData.email);
      if (existingCustomer) {
        return res.json(existingCustomer);
      }
      
      const customer = await storage.createCustomer(customerData);
      res.status(201).json(customer);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid customer data", errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Quote routes
  app.get("/api/quotes", async (req, res) => {
    try {
      const quotes = await storage.getAllQuotes();
      res.json(quotes);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/quotes/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const quote = await storage.getQuoteWithDetails(id);
      if (!quote) {
        return res.status(404).json({ message: "Quote not found" });
      }
      res.json(quote);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/quotes", async (req, res) => {
    try {
      const quoteData = insertQuoteSchema.parse(req.body);
      const quote = await storage.createQuote(quoteData);
      res.status(201).json(quote);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid quote data", errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/quotes/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const quoteData = insertQuoteSchema.partial().parse(req.body);
      const quote = await storage.updateQuote(id, quoteData);
      if (!quote) {
        return res.status(404).json({ message: "Quote not found" });
      }
      res.json(quote);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid quote data", errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/quotes/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteQuote(id);
      if (!deleted) {
        return res.status(404).json({ message: "Quote not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Line item routes
  app.get("/api/quotes/:quoteId/line-items", async (req, res) => {
    try {
      const quoteId = parseInt(req.params.quoteId);
      const lineItems = await storage.getLineItemsByQuoteId(quoteId);
      res.json(lineItems);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/quotes/:quoteId/line-items", async (req, res) => {
    try {
      const quoteId = parseInt(req.params.quoteId);
      const lineItemData = insertLineItemSchema.parse({ ...req.body, quoteId });
      const lineItem = await storage.createLineItem(lineItemData);
      res.status(201).json(lineItem);
    } catch (error) {

      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid line item data", errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/line-items/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const lineItemData = insertLineItemSchema.partial().parse(req.body);
      const lineItem = await storage.updateLineItem(id, lineItemData);
      if (!lineItem) {
        return res.status(404).json({ message: "Line item not found" });
      }
      res.json(lineItem);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid line item data", errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/line-items/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteLineItem(id);
      if (!deleted) {
        return res.status(404).json({ message: "Line item not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // DocuSign integration placeholder
  app.post("/api/quotes/:id/send-to-docusign", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const quote = await storage.getQuoteWithDetails(id);
      if (!quote) {
        return res.status(404).json({ message: "Quote not found" });
      }

      // Update quote status to sent
      await storage.updateQuote(id, { status: "sent" });

      // In a real implementation, this would integrate with DocuSign API
      res.json({ 
        message: "Quote sent to DocuSign successfully",
        envelopeId: `env_${Date.now()}`,
        signingUrl: `https://demo.docusign.net/signing/quote_${id}`
      });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // PDF generation placeholder
  app.get("/api/quotes/:id/pdf", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const quote = await storage.getQuoteWithDetails(id);
      if (!quote) {
        return res.status(404).json({ message: "Quote not found" });
      }

      // In a real implementation, this would generate a PDF
      res.json({ 
        message: "PDF generated successfully",
        downloadUrl: `/api/quotes/${id}/download-pdf`
      });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
