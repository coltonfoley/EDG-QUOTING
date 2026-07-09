import type { Express } from "express";
import { storage } from "../storage";
import { z } from "zod";
import { db } from "../db";
import { accounts, quotes } from "@shared/schema";
import { or, ilike, sql, desc } from "drizzle-orm";
import { isAuthenticated, requireAdmin } from "../auth";
import {
  insertAccountSchema,
  insertCustomerSchema,
  updateAccountSchema,
  idParamSchema
} from "../validation-schemas";

export function registerAccountRoutes(app: Express) {
  // Account routes (formerly customer routes)
  app.get("/api/accounts", isAuthenticated, async (req, res) => {
    try {
      const searchTerm = req.query.search as string;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = parseInt(req.query.offset as string) || 0;

      const accountFields = {
        id: accounts.id,
        name: accounts.name,
        email: accounts.email,
        phone: accounts.phone,
        company: accounts.company,
        accountType: accounts.accountType,
        paymentTerms: accounts.paymentTerms,
        billingAddress: accounts.billingAddress,
        firstName: accounts.firstName,
        lastName: accounts.lastName,
        secondaryContacts: accounts.secondaryContacts,
        leadStatus: accounts.leadStatus,
        leadSource: accounts.leadSource,
        leadProjectType: accounts.leadProjectType,
        leadMessage: accounts.leadMessage,
        leadReceivedAt: accounts.leadReceivedAt,
        leadLastContactedAt: accounts.leadLastContactedAt,
        leadConvertedAt: accounts.leadConvertedAt,
        createdAt: accounts.createdAt,
        updatedAt: accounts.updatedAt,
        projectCount: sql<number>`(SELECT COUNT(*)::int FROM quotes WHERE quotes.account_id = accounts.id)`,
      };
      
      if (searchTerm && searchTerm.length > 0) {
        console.log(`[SEARCH] Account search request: search="${searchTerm}"`);
        const term = searchTerm.toLowerCase();
        
        const accountResults = await db
          .select(accountFields)
          .from(accounts)
          .where(
            or(
              ilike(accounts.name, `%${term}%`),
              ilike(accounts.email, `%${term}%`),
              ilike(accounts.company, `%${term}%`)
            )
          )
          .orderBy(desc(accounts.createdAt))
          .limit(limit)
          .offset(offset);
        
        console.log(`[SEARCH] Found ${accountResults.length} accounts for term "${term}"`);
        res.json(accountResults);
      } else {
        const allAccounts = await db
          .select(accountFields)
          .from(accounts)
          .orderBy(desc(accounts.createdAt))
          .limit(limit)
          .offset(offset);
        res.json(allAccounts);
      }
    } catch (error) {
      console.error("Error fetching accounts:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Account search endpoint for autocomplete - MUST be before :id routes
  app.get("/api/accounts/search", isAuthenticated, async (req, res) => {
    try {
      const searchTerm = req.query.q as string;
      console.log(`[SEARCH] Account search request: q="${searchTerm}"`);
      
      if (!searchTerm || searchTerm.length < 1) {
        console.log("[SEARCH] Empty or short search term, returning empty array");
        return res.json([]);
      }
      
      // Direct database query to avoid any storage layer issues
      const term = searchTerm.toLowerCase();
      console.log(`[SEARCH] Searching for term: "${term}"`);
      
      // Search accounts directly
      const accountResults = await db
        .select()
        .from(accounts)
        .where(
          or(
            ilike(accounts.name, `%${term}%`),
            ilike(accounts.email, `%${term}%`),
            ilike(accounts.company, `%${term}%`)
          )
        )
        .limit(10);
      
      console.log(`[SEARCH] Found ${accountResults.length} accounts`);
      console.log(`[SEARCH] Returning ${accountResults.length} results`);
      res.json(accountResults.slice(0, 10));
    } catch (error) {
      console.error("[SEARCH ERROR] Account search error:", error);
      if (error instanceof Error) {
        console.error("[SEARCH ERROR] Message:", error.message);
        console.error("[SEARCH ERROR] Stack:", error.stack);
      }
      res.status(500).json({ message: "Search failed", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.get("/api/accounts/:id", isAuthenticated, async (req, res) => {
    try {
      // Validate ID parameter
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }
      
      const account = await storage.getAccount(params.data.id);
      if (!account) {
        return res.status(404).json({ message: "Account not found" });
      }
      res.json(account);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/accounts/:id/details", isAuthenticated, async (req, res) => {
    try {
      // Validate ID parameter
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }
      
      const accountDetails = await storage.getAccountWithDetails(params.data.id);
      if (!accountDetails) {
        return res.status(404).json({ message: "Account not found" });
      }
      res.json(accountDetails);
    } catch (error) {
      console.error("Error fetching account details:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/accounts/:id", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }
      
      const deleted = await storage.deleteAccount(params.data.id);
      if (!deleted) {
        return res.status(404).json({ message: "Account not found" });
      }
      res.status(204).send();
    } catch (error: any) {
      if (error.message?.includes("Cannot delete account with existing quotes")) {
        return res.status(409).json({ 
          message: "Cannot delete account with existing projects. Please delete or reassign all projects first." 
        });
      }
      console.error("Account deletion error:", error);
      res.status(500).json({ message: "Failed to delete account" });
    }
  });

  // Legacy customer route for backward compatibility
  app.get("/api/customers/:id", isAuthenticated, async (req, res) => {
    try {
      // Validate ID parameter
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }
      
      const customer = await storage.getCustomer(params.data.id);
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }
      res.json(customer);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Legacy customer search endpoint for backward compatibility
  app.get("/api/customers/search", isAuthenticated, async (req, res) => {
    try {
      const searchTerm = req.query.q as string;
      console.log(`Customer search request: q="${searchTerm}"`);
      
      if (!searchTerm) {
        console.log("Empty search term, returning empty array");
        return res.json([]);
      }
      
      console.log("Calling storage.searchCustomers...");
      const customers = await storage.searchCustomers(searchTerm);
      console.log(`Search completed, found ${customers.length} results`);
      res.json(customers);
    } catch (error) {
      console.error("Customer search error:", error);
      if (error instanceof Error) {
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
      }
      res.status(400).json({ message: "Invalid request parameter", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.post("/api/accounts", isAuthenticated, async (req, res) => {
    try {
      console.log("Account creation request body:", JSON.stringify(req.body, null, 2));
      const accountData = insertAccountSchema.parse(req.body);
      
      // Options for duplicate handling and contact creation
      const allowDuplicate = req.body.allowDuplicate === true;
      const updateIfExists = req.body.updateIfExists !== false; // Default to true
      const createPrimaryContact = req.body.createPrimaryContact !== false; // Default to true
      
      const account = await storage.createAccount(accountData, {
        allowDuplicate,
        updateIfExists,
        createPrimaryContact
      });
      
      // Check if this was an update of existing account or new creation
      // by checking if the account existed before (we can detect this from logs)
      const duplicate = await storage.findDuplicateAccount(accountData);
      
      if (duplicate && duplicate.id === account.id && !allowDuplicate) {
        // This was an update of existing account
        res.status(200).json({
          ...account,
          _wasExisting: true,
          _message: "Account already existed and was updated with new information"
        });
      } else {
        // This was a new account creation
        res.status(201).json(account);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("Account validation error:", JSON.stringify(error.errors, null, 2));
        return res.status(400).json({ message: "Invalid account data", errors: error.errors });
      }
      console.error("Account creation error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Legacy customer route for backward compatibility
  app.post("/api/customers", isAuthenticated, async (req, res) => {
    try {
      const customerData = insertCustomerSchema.parse(req.body);
      
      // Options for duplicate handling and contact creation
      const allowDuplicate = req.body.allowDuplicate === true;
      const updateIfExists = req.body.updateIfExists !== false; // Default to true
      const createPrimaryContact = req.body.createPrimaryContact !== false; // Default to true
      
      const customer = await storage.createCustomer(customerData, {
        allowDuplicate,
        updateIfExists,
        createPrimaryContact
      });
      
      // Check if this was an update of existing customer or new creation
      // by checking if the customer existed before (we can detect this from logs)
      const duplicate = await storage.findDuplicateCustomer(customerData);
      
      if (duplicate && duplicate.id === customer.id && !allowDuplicate) {
        // This was an update of existing customer
        res.status(200).json({
          ...customer,
          _wasExisting: true,
          _message: "Customer already existed and was updated with new information"
        });
      } else {
        // This was a new customer creation
        res.status(201).json(customer);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid customer data", errors: error.errors });
      }
      console.error("Customer creation error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/accounts/:id", isAuthenticated, async (req, res) => {
    try {
      // Validate ID parameter
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }
      
      console.log("Account update request body:", JSON.stringify(req.body, null, 2));
      const accountData = updateAccountSchema.parse(req.body);
      const account = await storage.updateAccount(params.data.id, accountData);
      if (!account) {
        return res.status(404).json({ message: "Account not found" });
      }
      res.json(account);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid account data", errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Legacy customer route for backward compatibility
  app.put("/api/customers/:id", isAuthenticated, async (req, res) => {
    try {
      // Validate ID parameter
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }
      
      const customerData = insertCustomerSchema.partial().parse(req.body);
      const customer = await storage.updateCustomer(params.data.id, customerData);
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }
      res.json(customer);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid customer data", errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Client routes - unified model for accounts with integrated contact info
  // These provide a cleaner API for the new unified client model
  app.get("/api/clients", isAuthenticated, async (req, res) => {
    try {
      const searchTerm = req.query.search as string;
      
      if (searchTerm && searchTerm.length > 0) {
        // Search functionality
        console.log(`[CLIENT SEARCH] Search request: search="${searchTerm}"`);
        const clients = await storage.searchClients(searchTerm);
        console.log(`[CLIENT SEARCH] Found ${clients.length} clients for term "${searchTerm}"`);
        res.json(clients);
      } else {
        // Return all clients when no search term
        const clients = await storage.getAllClients();
        res.json(clients);
      }
    } catch (error) {
      console.error("Error fetching clients:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/clients/search", isAuthenticated, async (req, res) => {
    try {
      const searchTerm = req.query.q as string;
      console.log(`[CLIENT SEARCH] Autocomplete request: q="${searchTerm}"`);
      
      if (!searchTerm || searchTerm.length < 1) {
        console.log("[CLIENT SEARCH] Empty search term, returning empty array");
        return res.json([]);
      }
      
      const clients = await storage.searchClients(searchTerm);
      console.log(`[CLIENT SEARCH] Found ${clients.length} clients`);
      res.json(clients);
    } catch (error) {
      console.error("Client search error:", error);
      res.status(400).json({ message: "Invalid request parameter", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.get("/api/clients/:id", isAuthenticated, async (req, res) => {
    try {
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }
      
      const client = await storage.getClient(params.data.id);
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }
      res.json(client);
    } catch (error) {
      console.error("Error fetching client:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/clients/:id/details", isAuthenticated, async (req, res) => {
    try {
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }
      
      const clientDetails = await storage.getClientWithDetails(params.data.id);
      if (!clientDetails) {
        return res.status(404).json({ message: "Client not found" });
      }
      res.json(clientDetails);
    } catch (error) {
      console.error("Error fetching client details:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/clients", isAuthenticated, async (req, res) => {
    try {
      console.log("Client creation request body:", JSON.stringify(req.body, null, 2));
      const clientData = insertAccountSchema.parse(req.body);
      
      // Options for duplicate handling (no contact creation since info is integrated)
      const allowDuplicate = req.body.allowDuplicate === true;
      const updateIfExists = req.body.updateIfExists !== false; // Default to true
      
      const client = await storage.createClient(clientData, {
        allowDuplicate,
        updateIfExists
      });
      
      res.status(201).json(client);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("Client validation error:", JSON.stringify(error.errors, null, 2));
        return res.status(400).json({ message: "Invalid client data", errors: error.errors });
      }
      console.error("Client creation error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/clients/:id", isAuthenticated, async (req, res) => {
    try {
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }
      
      console.log("Client update request body:", JSON.stringify(req.body, null, 2));
      const clientData = updateAccountSchema.parse(req.body);
      const client = await storage.updateClient(params.data.id, clientData);
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }
      res.json(client);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid client data", errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/clients/:id", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: params.error.errors 
        });
      }
      
      const deleted = await storage.deleteClient(params.data.id);
      if (!deleted) {
        return res.status(404).json({ message: "Client not found or has existing quotes" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Client deletion error:", error);
      if (error instanceof Error && error.message.includes("existing quotes")) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to delete client" });
    }
  });
}
