import { afterAll, beforeAll, describe, it, expect } from "vitest";
import type { InsertQuote } from "@shared/schema";
import { nanoid } from "nanoid";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const databaseWritesEnabled = process.env.ALLOW_DATABASE_TEST_WRITES === "true";
const isSeparateFromConfiguredDatabase = Boolean(
  testDatabaseUrl && (!process.env.DATABASE_URL || testDatabaseUrl !== process.env.DATABASE_URL),
);
const shouldRunDatabaseTests = Boolean(
  testDatabaseUrl && databaseWritesEnabled && isSeparateFromConfiguredDatabase,
);

let storage: typeof import("../storage").storage;
let pool: typeof import("../db").pool | undefined;

beforeAll(async () => {
  if (!shouldRunDatabaseTests) return;
  process.env.DATABASE_URL = testDatabaseUrl!;
  ({ storage } = await import("../storage"));
  ({ pool } = await import("../db"));
});

afterAll(async () => {
  await pool?.end();
});

describe.skipIf(!shouldRunDatabaseTests)("Quote Storage Layer", () => {
  describe("createQuote", () => {
    it("should create a new quote with minimal data", async () => {
      const quoteData: InsertQuote = {
        projectName: "Test Project Minimal",
      };

      const quote = await storage.createQuote(quoteData);

      expect(quote).toBeDefined();
      expect(quote.id).toBeDefined();
      expect(quote.projectName).toBe("Test Project Minimal");
      expect(quote.quoteNumber).toBeDefined();
    });

    it("should create a quote with specific deal stage", async () => {
      const quoteData: InsertQuote = {
        projectName: "Quote with Stage",
        dealStage: "quote_sent",
      };

      const quote = await storage.createQuote(quoteData);

      expect(quote).toBeDefined();
      expect(quote.dealStage).toBe("quote_sent");
    });

    it("should create a quote with full details", async () => {
      const quoteData: InsertQuote = {
        projectName: "Full Detail Project",
        dealStage: "building_estimate",
        taxRate: "8.25",
        tariffRate: "5.00",
        discount: "10.00",
        shipping: "25.00",
        isShippingTaxable: true,
        jobsiteStreetAddress: "123 Main St",
        jobsiteCity: "Austin",
        jobsiteState: "TX",
        jobsiteZipCode: "78701",
        jobsiteCountry: "United States",
      };

      const quote = await storage.createQuote(quoteData);

      expect(quote.projectName).toBe("Full Detail Project");
      expect(quote.dealStage).toBe("building_estimate");
      expect(quote.taxRate).toBe("8.25");
      expect(quote.tariffRate).toBe("5.00");
      expect(quote.discount).toBe("10.00");
      expect(quote.shipping).toBe("25.00");
      expect(quote.isShippingTaxable).toBe(true);
      expect(quote.jobsiteStreetAddress).toBe("123 Main St");
      expect(quote.jobsiteCity).toBe("Austin");
      expect(quote.jobsiteState).toBe("TX");
    });

    it("should auto-generate quote number", async () => {
      const quote = await storage.createQuote({
        projectName: "Auto Number Test",
      });

      expect(quote.quoteNumber).toBeDefined();
      expect(quote.quoteNumber).toMatch(/^QT-\d{4}-\d+$/);
    });
  });

  describe("getQuote", () => {
    it("should retrieve a quote by id", async () => {
      const created = await storage.createQuote({
        projectName: "Get Quote Test " + Date.now(),
      });

      const retrieved = await storage.getQuote(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.projectName).toContain("Get Quote Test");
    });

    it("should return undefined for non-existent quote", async () => {
      const result = await storage.getQuote(999999);
      expect(result).toBeUndefined();
    });
  });

  describe("getQuoteWithDetails", () => {
    it("should retrieve quote with line items", async () => {
      const quote = await storage.createQuote({
        projectName: "Quote with Details Test " + Date.now(),
      });

      await storage.createLineItem({
        quoteId: quote.id,
        description: "Test Line Item",
        quantity: "2",
        unitPrice: "100.00",
        markupType: "percentage",
        markupValue: "0",
      });

      const quoteWithDetails = await storage.getQuoteWithDetails(quote.id);

      expect(quoteWithDetails).toBeDefined();
      expect(quoteWithDetails?.id).toBe(quote.id);
      expect(quoteWithDetails?.lineItems).toBeDefined();
      expect(Array.isArray(quoteWithDetails?.lineItems)).toBe(true);
    });

    it("should retrieve quote with grouped line items", async () => {
      const quote = await storage.createQuote({
        projectName: "Quote with Groups " + Date.now(),
      });

      const groupId = nanoid();
      await storage.createGroup({
        id: groupId,
        quoteId: quote.id,
        title: "Test Group",
        position: 0,
      });

      await storage.createLineItem({
        quoteId: quote.id,
        groupId: groupId,
        description: "Grouped Line Item",
        quantity: "1",
        unitPrice: "50.00",
        markupType: "dollar",
        markupValue: "10",
      });

      const quoteWithDetails = await storage.getQuoteWithDetails(quote.id);

      expect(quoteWithDetails).toBeDefined();
      expect(quoteWithDetails?.lineItems).toBeDefined();
      expect(Array.isArray(quoteWithDetails?.lineItems)).toBe(true);
      expect(quoteWithDetails?.lineItems?.length).toBeGreaterThan(0);
      expect(quoteWithDetails?.lineItems?.[0].groupId).toBe(groupId);
    });
  });

  describe("updateQuote", () => {
    it("should update quote deal stage", async () => {
      const quote = await storage.createQuote({
        projectName: "Stage Update Test " + Date.now(),
        dealStage: "new_lead",
      });

      const updated = await storage.updateQuote(quote.id, {
        dealStage: "quote_sent",
      });

      expect(updated).toBeDefined();
      expect(updated?.dealStage).toBe("quote_sent");
    });

    it("should update multiple quote fields", async () => {
      const quote = await storage.createQuote({
        projectName: "Multi-field Update Test " + Date.now(),
      });

      const updated = await storage.updateQuote(quote.id, {
        projectName: "Updated Project Name",
        taxRate: "10.00",
        discount: "15.00",
        dealStage: "closed_won",
      });

      expect(updated).toBeDefined();
      expect(updated?.projectName).toBe("Updated Project Name");
      expect(updated?.taxRate).toBe("10.00");
      expect(updated?.discount).toBe("15.00");
      expect(updated?.dealStage).toBe("closed_won");
    });

    it("should return undefined when updating non-existent quote", async () => {
      const result = await storage.updateQuote(999999, {
        projectName: "Non-existent",
      });

      expect(result).toBeUndefined();
    });
  });

  describe("deleteQuote", () => {
    it("should delete an existing quote", async () => {
      const quote = await storage.createQuote({
        projectName: "Delete Test " + Date.now(),
      });

      const deleted = await storage.deleteQuote(quote.id);
      expect(deleted).toBe(true);

      const retrieved = await storage.getQuote(quote.id);
      expect(retrieved).toBeUndefined();
    });

    it("should return false when deleting non-existent quote", async () => {
      const result = await storage.deleteQuote(999999);
      expect(result).toBe(false);
    });
  });

  describe("getAllQuotes", () => {
    it("should retrieve all quotes", async () => {
      const quotes = await storage.getAllQuotes();

      expect(quotes).toBeDefined();
      expect(Array.isArray(quotes)).toBe(true);
    });

    it("should support pagination", async () => {
      const pageOne = await storage.getAllQuotes({ page: 1, pageSize: 5 });
      const pageTwo = await storage.getAllQuotes({ page: 2, pageSize: 5 });

      expect(Array.isArray(pageOne)).toBe(true);
      expect(Array.isArray(pageTwo)).toBe(true);
    });
  });

  describe("Quote Versioning", () => {
    it("should create a new version of a quote", async () => {
      const originalQuote = await storage.createQuote({
        projectName: "Original Quote for Versioning " + Date.now(),
        dealStage: "closed_won",
      });

      const newVersion = await storage.createQuoteVersion(originalQuote.id);

      expect(newVersion).toBeDefined();
      expect(newVersion.projectName).toBe(originalQuote.projectName);
      expect(newVersion.parentQuoteId).toBe(originalQuote.id);
      expect(newVersion.isLatestVersion).toBe(true);
    });

    it("should get all versions of a quote", async () => {
      const originalQuote = await storage.createQuote({
        projectName: "Quote with Versions " + Date.now(),
      });

      const versions = await storage.getQuoteVersions(originalQuote.id);

      expect(versions).toBeDefined();
      expect(Array.isArray(versions)).toBe(true);
    });
  });

  describe("Design + Planning Agreements", () => {
    it("keeps normal quotes without planning agreement state", async () => {
      const quote = await storage.createQuote({
        projectName: "No Planning Required " + Date.now(),
      });

      const quoteWithDetails = await storage.getQuoteWithDetails(quote.id);

      expect(quoteWithDetails).toBeDefined();
      expect(quoteWithDetails?.planningAgreement).toBeUndefined();
    });

    it("attaches one planning agreement to the full quote family", async () => {
      const originalQuote = await storage.createQuote({
        projectName: "Planning Family " + Date.now(),
      });

      const agreement = await storage.createPlanningAgreement({
        quoteId: originalQuote.id,
        quoteFamilyRootId: originalQuote.id,
        accountId: originalQuote.accountId,
        status: "required",
        tier: "standard_design",
        amount: "1500.00",
        creditEligible: true,
      });

      const newVersion = await storage.createQuoteVersion(originalQuote.id);
      const versionDetails = await storage.getQuoteWithDetails(newVersion.id);

      expect(versionDetails?.planningAgreement?.id).toBe(agreement.id);
      expect(versionDetails?.planningAgreement?.quoteFamilyRootId).toBe(originalQuote.id);
    });

    it("records an audit event when manual planning payment is confirmed", async () => {
      const quote = await storage.createQuote({
        projectName: "Planning Payment Audit " + Date.now(),
      });

      const agreement = await storage.createPlanningAgreement({
        quoteId: quote.id,
        quoteFamilyRootId: quote.id,
        status: "sent",
        tier: "complex_planning",
        amount: "2500.00",
        creditEligible: true,
      });

      const paid = await storage.updatePlanningAgreement(
        agreement.id,
        {
          status: "paid_active",
          paymentConfirmedAt: new Date(),
          paymentMethod: "quickbooks",
          paymentReference: "QB-123",
          paymentNotes: "Verified outside Rainmaker",
        },
        null,
        "payment_confirmed",
        { verified: true, paymentReference: "QB-123" },
      );
      const events = await storage.getPlanningAgreementEvents(agreement.id);

      expect(paid?.status).toBe("paid_active");
      expect(paid?.paymentMethod).toBe("quickbooks");
      expect(events.some((event) => event.eventType === "payment_confirmed")).toBe(true);
    });
  });

  describe("E-Signature Flow", () => {
    it("should enable e-signature and generate token", async () => {
      const quote = await storage.createQuote({
        projectName: "E-Signature Test Quote " + Date.now(),
        dealStage: "quote_sent",
      });

      const signingToken = `sig_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      
      const updated = await storage.updateQuote(quote.id, {
        enableESignature: true,
        signingToken: signingToken,
      });

      expect(updated).toBeDefined();
      expect(updated?.enableESignature).toBe(true);
      expect(updated?.signingToken).toBe(signingToken);
    });

    it("should retrieve quote by signing token", async () => {
      const signingToken = `sig_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      
      const quote = await storage.createQuote({
        projectName: "Token Retrieval Test " + Date.now(),
        dealStage: "quote_sent",
        enableESignature: true,
        signingToken: signingToken,
      });

      const retrieved = await storage.getQuoteBySigningToken(signingToken);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(quote.id);
    });
  });

  describe("Quote Calculations", () => {
    it("should handle tax rate calculations", async () => {
      const quote = await storage.createQuote({
        projectName: "Tax Calculation Test " + Date.now(),
        taxRate: "8.25",
      });

      expect(quote.taxRate).toBe("8.25");
    });

    it("should handle discount values", async () => {
      const quote = await storage.createQuote({
        projectName: "Discount Test " + Date.now(),
        discount: "100.00",
      });

      expect(quote.discount).toBe("100.00");
    });

    it("should handle tariff rate", async () => {
      const quote = await storage.createQuote({
        projectName: "Tariff Test " + Date.now(),
        tariffRate: "25.00",
      });

      expect(quote.tariffRate).toBe("25.00");
    });
  });
});
