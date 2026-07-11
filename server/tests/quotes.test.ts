import { afterAll, beforeAll, describe, it, expect, vi } from "vitest";
import type { InsertQuote } from "@shared/schema";
import { businessEvents, emailDeliveryAttempts, groups, leadInquiries, lineItems, products } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { randomUUID } from "node:crypto";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const databaseWritesEnabled = process.env.ALLOW_DATABASE_TEST_WRITES === "true";
const isSeparateFromConfiguredDatabase = Boolean(
  testDatabaseUrl && (!process.env.DATABASE_URL || testDatabaseUrl !== process.env.DATABASE_URL),
);
const shouldRunDatabaseTests = Boolean(
  testDatabaseUrl && databaseWritesEnabled && isSeparateFromConfiguredDatabase,
);

let storage: typeof import("../storage").storage;
let executeQuoteImport: typeof import("../quoteImport").executeQuoteImport;
let createIdempotentLead: typeof import("../leadIntakeIdempotency").createIdempotentLead;
let preserveAccountAndCreateInquiry: typeof import("../routes/leadIntakeRoutes").preserveAccountAndCreateInquiry;
let createQuoteFromInquiry: typeof import("../inquiryConversion").createQuoteFromInquiry;
let database: typeof import("../db").db;
let pool: typeof import("../db").pool | undefined;

beforeAll(async () => {
  if (!shouldRunDatabaseTests) return;
  if (process.env.RAINMAKER_TEST_DATABASE_DRIVER === "node-postgres") {
    vi.doMock("../db", () => import("./support/pglite-db"));
  }
  process.env.DATABASE_URL = testDatabaseUrl!;
  ({ storage } = await import("../storage"));
  ({ executeQuoteImport } = await import("../quoteImport"));
  ({ createIdempotentLead } = await import("../leadIntakeIdempotency"));
  ({ preserveAccountAndCreateInquiry } = await import("../routes/leadIntakeRoutes"));
  ({ createQuoteFromInquiry } = await import("../inquiryConversion"));
  ({ pool, db: database } = await import("../db"));
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

    it("loads the complete customer package relations", async () => {
      const quote = await storage.createQuote({
        projectName: "Customer Package Details " + Date.now(),
      });
      const groupId = nanoid();
      await storage.createGroup({ id: groupId, quoteId: quote.id, title: "Option A", position: 0 });
      await storage.createQuoteCoverPhoto({
        quoteId: quote.id,
        filename: "cover.jpg",
        originalName: "Cover.jpg",
        storageUrl: "https://example.test/cover.jpg",
        mimeType: "image/jpeg",
        fileSize: 100,
      });
      await storage.createQuoteProductRendering({
        quoteId: quote.id,
        filename: "visual.jpg",
        originalName: "Visual.jpg",
        storageUrl: "https://example.test/visual.jpg",
        mimeType: "image/jpeg",
        fileSize: 100,
        displayOrder: 0,
      });

      const quoteWithDetails = await storage.getQuoteWithDetails(quote.id);

      expect(quoteWithDetails?.groups).toEqual([expect.objectContaining({ id: groupId, title: "Option A" })]);
      expect(quoteWithDetails?.coverPhoto).toEqual(expect.objectContaining({ filename: "cover.jpg" }));
      expect(quoteWithDetails?.productRenderings).toEqual([
        expect.objectContaining({ filename: "visual.jpg", displayOrder: 0 }),
      ]);
    });

    it("deletes a group while preserving its items in deterministic ungrouped order", async () => {
      const quote = await storage.createQuote({ projectName: "Delete Group Recovery " + Date.now() });
      const groupId = nanoid();
      await storage.createGroup({ id: groupId, quoteId: quote.id, title: "Option A", position: 0 });
      await storage.createLineItem({ quoteId: quote.id, description: "Existing ungrouped", quantity: "1", unitPrice: "10", markupType: "percentage", markupValue: "0", position: 0 });
      await storage.createLineItem({ quoteId: quote.id, groupId, description: "First grouped", quantity: "1", unitPrice: "20", markupType: "percentage", markupValue: "0", position: 0 });
      await storage.createLineItem({ quoteId: quote.id, groupId, description: "Second grouped", quantity: "1", unitPrice: "30", markupType: "percentage", markupValue: "0", position: 1 });

      expect(await storage.deleteGroup(groupId)).toBe(true);
      const remaining = (await storage.getLineItemsByQuoteId(quote.id)).sort((left, right) => left.position - right.position);

      expect(remaining.map((item) => ({ description: item.description, groupId: item.groupId, position: item.position }))).toEqual([
        { description: "Existing ungrouped", groupId: null, position: 0 },
        { description: "First grouped", groupId: null, position: 1 },
        { description: "Second grouped", groupId: null, position: 2 },
      ]);
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

    it("locks commercial fields after customer approval but permits pipeline stage", async () => {
      const quote = await storage.createQuote({
        projectName: "Signed Lock Test " + Date.now(),
        dealStage: "quote_sent",
      });

      await storage.updateQuote(quote.id, {
        clientSignatureData: { type: "type", name: "Fictional Signer" },
        clientSignedAt: new Date("2026-07-10T12:00:00.000Z"),
        clientSignedIp: "192.0.2.1",
        signedDocumentSnapshot: { quoteNumber: quote.quoteNumber },
        signatureAuditTrail: { entries: [{ event: "client_signed" }] },
      }, { mutationKind: "customer_signature" });

      await expect(storage.updateQuote(quote.id, {
        projectName: "Unauthorized signed edit",
      })).rejects.toMatchObject({ code: "QUOTE_SIGNED_LOCKED", status: 409 });

      const staged = await storage.updateQuote(quote.id, {
        dealStage: "closed_won",
      }, { mutationKind: "pipeline_stage" });
      expect(staged?.dealStage).toBe("closed_won");
      expect(staged?.projectName).toContain("Signed Lock Test");
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

    it("does not delete a customer-approved quote", async () => {
      const quote = await storage.createQuote({
        projectName: "Signed Delete Guard " + Date.now(),
      });
      await storage.updateQuote(quote.id, {
        clientSignedAt: new Date("2026-07-10T12:00:00.000Z"),
        signedDocumentSnapshot: { quoteNumber: quote.quoteNumber },
      }, { mutationKind: "customer_signature" });

      await expect(storage.deleteQuote(quote.id))
        .rejects.toMatchObject({ code: "QUOTE_SIGNED_LOCKED", status: 409 });
      expect(await storage.getQuote(quote.id)).toBeDefined();
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

  describe("customer-approved quote content lock", () => {
    it("blocks line, group, bulk, reorder, and image mutations", async () => {
      const quote = await storage.createQuote({ projectName: "Signed Content Guard " + Date.now() });
      const group = await storage.createGroup({
        id: nanoid(),
        quoteId: quote.id,
        title: "Signed group",
        position: 0,
      });
      const lineItem = await storage.createLineItem({
        quoteId: quote.id,
        groupId: group.id,
        description: "Signed line",
        quantity: "1",
        unitPrice: "100.00",
        markupType: "percentage",
        markupValue: "20",
        position: 0,
      });
      const cover = await storage.createQuoteCoverPhoto({
        quoteId: quote.id,
        filename: "signed-cover.jpg",
        originalName: "signed-cover.jpg",
        storageUrl: "https://example.invalid/signed-cover.jpg",
        mimeType: "image/jpeg",
      });
      const rendering = await storage.createQuoteProductRendering({
        quoteId: quote.id,
        filename: "signed-rendering.jpg",
        originalName: "signed-rendering.jpg",
        storageUrl: "https://example.invalid/signed-rendering.jpg",
        mimeType: "image/jpeg",
      });

      await storage.updateQuote(quote.id, {
        clientSignedAt: new Date("2026-07-10T12:00:00.000Z"),
        signedDocumentSnapshot: { quoteNumber: quote.quoteNumber },
      }, { mutationKind: "customer_signature" });

      const blockedMutations: Array<() => Promise<unknown>> = [
        () => storage.createLineItem({
          quoteId: quote.id,
          description: "Blocked create",
          quantity: "1",
          unitPrice: "1.00",
          markupType: "percentage",
          markupValue: "0",
        }),
        () => storage.updateLineItem(lineItem.id, { description: "Blocked update" }),
        () => storage.deleteLineItem(lineItem.id),
        () => storage.bulkUpdateLineItems([lineItem.id], { markupValue: "99" }),
        () => storage.bulkDeleteLineItems([lineItem.id]),
        () => storage.reorderLineItems(quote.id, [{ id: lineItem.id, groupId: group.id, position: 1 }]),
        () => storage.createGroup({ id: nanoid(), quoteId: quote.id, title: "Blocked group", position: 1 }),
        () => storage.updateGroup(group.id, { title: "Blocked group update" }),
        () => storage.deleteGroup(group.id),
        () => storage.reorderGroups(quote.id, [{ id: group.id, position: 1 }]),
        () => storage.createQuoteCoverPhoto({
          quoteId: quote.id,
          filename: "blocked.jpg",
          originalName: "blocked.jpg",
          storageUrl: "https://example.invalid/blocked.jpg",
          mimeType: "image/jpeg",
        }),
        () => storage.createQuoteProductRendering({
          quoteId: quote.id,
          filename: "blocked-rendering.jpg",
          originalName: "blocked-rendering.jpg",
          storageUrl: "https://example.invalid/blocked-rendering.jpg",
          mimeType: "image/jpeg",
        }),
        () => storage.updateQuoteCoverPhoto(cover.id, { originalName: "blocked-update.jpg" }),
        () => storage.updateQuoteProductRendering(rendering.id, { displayOrder: 99 }),
        () => storage.deleteQuoteCoverPhoto(cover.id),
        () => storage.deleteQuoteProductRendering(rendering.id),
      ];

      for (const mutate of blockedMutations) {
        await expect(mutate()).rejects.toMatchObject({ code: "QUOTE_SIGNED_LOCKED", status: 409 });
      }

      expect((await storage.getLineItem(lineItem.id))?.description).toBe("Signed line");
      expect((await storage.getGroup(group.id))?.title).toBe("Signed group");
      expect((await storage.getQuoteCoverPhotoById(cover.id))?.isActive).toBe(true);
      expect((await storage.getQuoteProductRenderingById(rendering.id))?.isActive).toBe(true);
    });

    it("rejects a customer signature built from a stale content revision", async () => {
      const quote = await storage.createQuote({ projectName: "Stale Signature Guard " + Date.now() });
      const openedRevision = quote.updatedAt;
      await storage.createLineItem({
        quoteId: quote.id,
        description: "Change after customer opened approval",
        quantity: "1",
        unitPrice: "50.00",
        markupType: "percentage",
        markupValue: "0",
      });

      await expect(storage.updateQuote(quote.id, {
        clientSignedAt: new Date("2026-07-10T12:00:00.000Z"),
        signedDocumentSnapshot: { quoteNumber: quote.quoteNumber },
      }, {
        mutationKind: "customer_signature",
        expectedUpdatedAt: openedRevision,
      })).rejects.toMatchObject({ code: "QUOTE_CHANGED_BEFORE_SIGNATURE", status: 409 });

      expect((await storage.getQuote(quote.id))?.clientSignedAt).toBeNull();
    });

    it("serializes a commercial edit racing a customer signature", async () => {
      const quote = await storage.createQuote({ projectName: "Signature Race Original " + Date.now() });
      const signature = storage.updateQuote(quote.id, {
        clientSignedAt: new Date("2026-07-10T12:00:00.000Z"),
        signedDocumentSnapshot: { projectName: quote.projectName },
      }, {
        mutationKind: "customer_signature",
        expectedUpdatedAt: quote.updatedAt,
      });
      const edit = storage.updateQuote(quote.id, { projectName: "Racing commercial edit" });

      const results = await Promise.allSettled([signature, edit]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);

      const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
      expect(["QUOTE_SIGNED_LOCKED", "QUOTE_CHANGED_BEFORE_SIGNATURE"])
        .toContain(rejected.reason?.code);

      const finalQuote = await storage.getQuote(quote.id);
      if (finalQuote?.clientSignedAt) {
        expect(finalQuote.projectName).toBe(quote.projectName);
      } else {
        expect(finalQuote?.projectName).toBe("Racing commercial edit");
      }
    });

    it("appends the company signature audit without replacing the customer audit", async () => {
      const quote = await storage.createQuote({ projectName: "Append-only Signature Audit " + Date.now() });
      const customerSignedAt = new Date("2026-07-10T12:00:00.000Z");
      const customerAudit = {
        event: "client_signed",
        signerType: "client",
        signerName: "Fictional Customer",
        signedAt: customerSignedAt.toISOString(),
      };
      await storage.updateQuote(quote.id, {
        clientSignedAt: customerSignedAt,
        signedDocumentSnapshot: { quoteNumber: quote.quoteNumber },
        signatureAuditTrail: {
          documentFingerprint: "customer-fingerprint",
          entries: [customerAudit],
        },
      }, { mutationKind: "customer_signature" });

      const companySignedAt = new Date("2026-07-10T12:05:00.000Z");
      const companyAudit = {
        event: "company_signed",
        signerType: "company",
        signerName: "Fictional EDG Signer",
        signedAt: companySignedAt.toISOString(),
      };
      const updated = await storage.updateQuote(quote.id, {
        companySignedAt,
        companySignatureData: { type: "type", name: "Fictional EDG Signer" },
        signatureAuditTrail: {
          documentFingerprint: "stale-company-fingerprint",
          entries: [companyAudit],
        },
      }, { mutationKind: "company_signature" });

      const audit = updated?.signatureAuditTrail as any;
      expect(audit.documentFingerprint).toBe("customer-fingerprint");
      expect(audit.entries.map((entry: any) => entry.event)).toEqual([
        "client_signed",
        "company_signed",
      ]);
      expect(updated?.signedDocumentSnapshot).toEqual({ quoteNumber: quote.quoteNumber });
      const signatureEvents = await database
        .select()
        .from(businessEvents)
        .where(eq(businessEvents.quoteId, quote.id));
      expect(signatureEvents.map((event) => event.eventType).sort()).toEqual([
        "quote_company_signed",
        "quote_customer_signed",
      ]);
    });
  });

  describe("Dimensional Pricing", () => {
    it("replaces bands atomically and fails closed outside exact coverage", async () => {
      const product = await storage.createProduct({
        name: "Pricing Fixture " + Date.now(),
        sku: `PRICE-${Date.now()}-${nanoid()}`,
        manufacturer: "Fixture Manufacturer",
        productType: "configurable",
        retailPrice: "1000",
        costPrice: "700",
        defaultDiscountType: "percentage",
        defaultDiscountValue: "30",
      });
      await storage.replacePricingTablesForProduct(product.id, [{
        productId: product.id,
        lengthMin: "120",
        lengthMax: "143.99",
        widthMin: "96",
        widthMax: "119.99",
        retailPrice: "1000",
        basePrice: "700",
      }]);

      await expect(storage.calculateConfigurableProductPrice(product.id, 130, 100)).resolves.toBe(700);
      await expect(storage.calculateConfigurableProductPrice(product.id, 200, 100)).rejects.toEqual(
        expect.objectContaining({ code: "PRICING_MANUAL_REVIEW", status: 422 }),
      );

      await expect(storage.replacePricingTablesForProduct(product.id, [
        {
          productId: product.id,
          lengthMin: "120",
          lengthMax: "144",
          widthMin: "96",
          widthMax: "120",
          retailPrice: "1000",
          basePrice: "700",
        },
        {
          productId: product.id,
          lengthMin: "144",
          lengthMax: "168",
          widthMin: "96",
          widthMax: "120",
          retailPrice: "1200",
          basePrice: "840",
        },
      ])).rejects.toEqual(expect.objectContaining({ code: "PRICING_BANDS_INVALID" }));

      const preserved = await storage.getPricingTablesByProductId(product.id);
      expect(preserved).toHaveLength(1);
      expect(preserved[0].basePrice).toBe("700.00");
    });

    it("never recalculates a negative EDG cost", async () => {
      const product = await storage.createProduct({
        name: "Dollar Discount Fixture " + Date.now(),
        sku: `DOLLAR-${Date.now()}-${nanoid()}`,
        manufacturer: "Fixture Manufacturer",
        productType: "configurable",
        retailPrice: "1000",
        costPrice: "0",
        defaultDiscountType: "dollar",
        defaultDiscountValue: "2000",
      });
      await storage.replacePricingTablesForProduct(product.id, [{
        productId: product.id,
        lengthMin: "120",
        lengthMax: "143.99",
        widthMin: "96",
        widthMax: "119.99",
        retailPrice: "1000",
        basePrice: "700",
      }]);

      await storage.recalculatePricingTables(product.id);
      const [updated] = await storage.getPricingTablesByProductId(product.id);
      expect(updated.basePrice).toBe("0.00");
    });
  });

  describe("Quote PDF Import", () => {
    it("honors the exact selected client and preserves explicit imported-price provenance", async () => {
      const suffix = `${Date.now()}-${nanoid()}`;
      const selectedAccount = await storage.createAccount({
        name: `Selected Import Client ${suffix}`,
        email: `selected-${suffix}@example.invalid`,
        phone: "555-0198",
        accountType: "commercial",
      });
      await storage.createAccount({
        name: `Extracted Match ${suffix}`,
        email: `extracted-${suffix}@example.invalid`,
        phone: "555-0199",
        accountType: "commercial",
      });

      const result = await executeQuoteImport({
        importOptions: {
          createNewQuote: true,
          combineIntoSingleQuote: false,
          attachCustomer: "match_only",
          existingCustomerId: selectedAccount.id,
          priceMeaning: "edg_cost",
          defaultMarkupPercent: 35,
        },
        extractedQuotes: [{
          pdfId: `pdf-${suffix}`,
          filename: "fictional-supplier-quote.pdf",
          customer: {
            name: `Extracted Match ${suffix}`,
            email: `extracted-${suffix}@example.invalid`,
          },
          quoteNumber: `IMPORT-${suffix}`,
          projectDescription: "Fictional import verification",
          lineItems: [{
            description: "Fictional imported structure",
            quantity: 2,
            price: 500,
            total: 1000,
            unit: "each",
          }],
          confidence: 0.91,
        }],
      });

      expect(result.summary).toEqual({ quotesCreated: 1, lineItemsAdded: 1, customersCreated: 0, failed: 0 });
      const imported = await storage.getQuoteWithDetails(result.imported[0].quoteId);
      expect(imported?.accountId).toBe(selectedAccount.id);
      expect(imported?.lineItems[0]).toEqual(expect.objectContaining({
        unitPrice: "500.00",
        markupType: "percentage",
        markupValue: "35.00",
        unit: "each",
        priceSource: "import_edg_cost",
        sourceMetadata: expect.objectContaining({
          source: "quote_pdf_import",
          filename: "fictional-supplier-quote.pdf",
          extractionConfidence: 0.91,
          priceMeaning: "edg_cost",
        }),
      }));
      const importEvents = await database
        .select()
        .from(businessEvents)
        .where(and(
          eq(businessEvents.eventType, "quote_import_completed"),
          eq(businessEvents.quoteId, result.imported[0].quoteId),
        ));
      expect(importEvents).toHaveLength(1);
    });

    it("rolls back the client, first quote, and first lines when a later quote conflicts", async () => {
      const suffix = `${Date.now()}-${nanoid()}`;
      const rollbackEmail = `rollback-${suffix}@example.invalid`;
      const duplicateQuoteNumber = `ROLLBACK-${suffix}`;
      const extractedQuote = (pdfId: string) => ({
        pdfId,
        filename: `${pdfId}.pdf`,
        customer: { name: `Rollback Client ${suffix}`, email: rollbackEmail },
        quoteNumber: duplicateQuoteNumber,
        projectDescription: "Rollback verification",
        lineItems: [{ description: "Rollback line", quantity: 1, price: 100, total: 100, unit: "each" }],
      });

      await expect(executeQuoteImport({
        importOptions: {
          createNewQuote: true,
          combineIntoSingleQuote: false,
          attachCustomer: "auto",
          priceMeaning: "customer_unit_price",
          defaultMarkupPercent: 0,
        },
        extractedQuotes: [extractedQuote("rollback-one"), extractedQuote("rollback-two")],
      })).rejects.toEqual(expect.objectContaining({ code: "IMPORT_DUPLICATE_RECORD", status: 409 }));

      expect(await storage.getAccountByEmail(rollbackEmail)).toBeUndefined();
      const allQuotes = await storage.getAllQuotes({ pageSize: 500 });
      expect(allQuotes.some((quote) => quote.quoteNumber === duplicateQuoteNumber)).toBe(false);
    });
  });

  describe("Lead inquiry history and conversion", () => {
    it("preserves established account truth while appending returning inquiries", async () => {
      const suffix = `${Date.now()}-${nanoid()}`;
      const email = `returning-${suffix}@example.invalid`;
      const established = await storage.createAccount({
        name: `Established Client ${suffix}`,
        firstName: "Established",
        lastName: "Client",
        email,
        phone: "555-0101",
        accountType: "commercial",
        leadStatus: "qualified",
        leadMessage: "Established history",
      });

      const returningLead = {
        email,
        firstName: "Replacement",
        lastName: "Name",
        phone: "555-9999",
        location: "New location",
        projectType: "Pergola",
        message: "A new and separate inquiry",
        source: "website",
        customerType: "homeowner",
        metadata: { fixture: true },
      };
      const first = await createIdempotentLead({
        submissionId: `submission-one-${suffix}`,
        lead: returningLead,
        createLead: (tx) => preserveAccountAndCreateInquiry(returningLead, `submission-one-${suffix}`, tx),
      });
      const second = await createIdempotentLead({
        submissionId: `submission-two-${suffix}`,
        lead: { ...returningLead, message: "Another separate inquiry" },
        createLead: (tx) => preserveAccountAndCreateInquiry(
          { ...returningLead, message: "Another separate inquiry" },
          `submission-two-${suffix}`,
          tx,
        ),
      });

      expect(first.account.id).toBe(established.id);
      expect(second.account.id).toBe(established.id);
      const preserved = await storage.getAccount(established.id);
      expect(preserved).toEqual(expect.objectContaining({
        name: `Established Client ${suffix}`,
        firstName: "Established",
        lastName: "Client",
        phone: "555-0101",
        accountType: "commercial",
        leadStatus: "qualified",
        leadMessage: "Established history",
      }));
      const inquiries = await database
        .select()
        .from(leadInquiries)
        .where(eq(leadInquiries.accountId, established.id));
      expect(inquiries).toHaveLength(2);
      expect(inquiries.map((inquiry) => inquiry.message).sort()).toEqual([
        "A new and separate inquiry",
        "Another separate inquiry",
      ]);
    });

    it("creates and links one quote while marking the exact inquiry converted", async () => {
      const suffix = `${Date.now()}-${nanoid()}`;
      const account = await storage.createAccount({
        name: `Conversion Client ${suffix}`,
        email: `conversion-${suffix}@example.invalid`,
        phone: "555-0110",
        accountType: "homeowner",
      });
      const [inquiry] = await database.insert(leadInquiries).values({
        accountId: account.id,
        submissionId: `conversion-${suffix}`,
        status: "qualified",
        source: "website",
        projectType: "Shade",
        message: "Ready for a quote",
      }).returning();

      const quote = await createQuoteFromInquiry({
        sourceInquiryId: inquiry.id,
        accountId: account.id,
        quoteNumber: `CONVERT-${suffix}`,
        projectName: "Inquiry conversion fixture",
        taxRate: "0",
        tariffRate: "0",
        discount: "0",
        shipping: "0",
        isShippingTaxable: false,
        dealStage: "new_lead",
      });

      expect(quote.accountId).toBe(account.id);
      expect(quote.sourceInquiryId).toBe(inquiry.id);
      const [converted] = await database
        .select()
        .from(leadInquiries)
        .where(eq(leadInquiries.id, inquiry.id));
      expect(converted).toEqual(expect.objectContaining({
        status: "converted",
        convertedQuoteId: quote.id,
      }));
      const conversionEvents = await database
        .select()
        .from(businessEvents)
        .where(and(
          eq(businessEvents.eventType, "lead_converted_to_quote"),
          eq(businessEvents.inquiryId, inquiry.id),
        ));
      expect(conversionEvents).toEqual([
        expect.objectContaining({
          quoteId: quote.id,
          accountId: account.id,
          inquiryId: inquiry.id,
        }),
      ]);
      await expect(createQuoteFromInquiry({
        sourceInquiryId: inquiry.id,
        accountId: account.id,
        quoteNumber: `CONVERT-AGAIN-${suffix}`,
        projectName: "Duplicate conversion fixture",
        taxRate: "0",
        tariffRate: "0",
        discount: "0",
        shipping: "0",
        isShippingTaxable: false,
        dealStage: "new_lead",
      })).rejects.toEqual(expect.objectContaining({ code: "INQUIRY_ALREADY_CONVERTED" }));
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

    it("creates an unsigned current version from a customer-approved quote", async () => {
      const original = await storage.createQuote({
        projectName: "Signed Version Source " + Date.now(),
        enableESignature: true,
        signingToken: `signed_${Date.now()}_${nanoid()}`,
        esigIncludePricing: false,
        esigIncludeImages: true,
        esigIncludeContract: false,
      });
      const sourceGroupId = nanoid();
      await storage.createGroup({
        id: sourceGroupId,
        quoteId: original.id,
        title: "Catalog option",
        position: 0,
        configData: { manufacturer: "Fixture Manufacturer", selection: "Option A" },
      });
      await storage.createLineItem({
        quoteId: original.id,
        productId: 987654,
        sku: "FIXTURE-SKU",
        manufacturer: "Fixture Manufacturer",
        unit: "each",
        priceSource: "catalog_cost",
        sourceMetadata: { productSnapshot: { id: 987654, sku: "FIXTURE-SKU" } },
        description: "Tariff-bearing source line",
        quantity: "1",
        unitPrice: "100.00",
        markupType: "percentage",
        markupValue: "25",
        isTariffApplicable: true,
        groupId: sourceGroupId,
      });
      await storage.updateQuote(original.id, {
        clientSignatureData: { type: "type", name: "Fictional Signer" },
        clientSignedAt: new Date("2026-07-10T12:00:00.000Z"),
        signedDocumentSnapshot: { quoteNumber: original.quoteNumber },
        signatureAuditTrail: { entries: [{ event: "client_signed" }] },
      }, { mutationKind: "customer_signature" });

      const next = await storage.createQuoteVersion(original.id);
      const family = await storage.getQuoteVersions(original.id);
      const nextDetails = await storage.getQuoteWithDetails(next.id);
      const creationEvents = await storage.getQuoteVersionEvents(original.id);

      expect(next.enableESignature).toBe(false);
      expect(next.signingToken).toBeNull();
      expect(next.clientSignedAt).toBeNull();
      expect(next.clientSignatureData).toBeNull();
      expect(next.signedDocumentSnapshot).toBeNull();
      expect(next.signatureAuditTrail).toBeNull();
      expect(next.esigIncludePricing).toBe(false);
      expect(next.esigIncludeImages).toBe(true);
      expect(next.esigIncludeContract).toBe(false);
      expect(nextDetails?.lineItems[0]?.isTariffApplicable).toBe(true);
      expect(nextDetails?.lineItems[0]).toEqual(expect.objectContaining({
        productId: 987654,
        sku: "FIXTURE-SKU",
        manufacturer: "Fixture Manufacturer",
        unit: "each",
        priceSource: "catalog_cost",
        sourceMetadata: { productSnapshot: { id: 987654, sku: "FIXTURE-SKU" } },
      }));
      expect(nextDetails?.groups?.[0]?.configData).toEqual({
        manufacturer: "Fixture Manufacturer",
        selection: "Option A",
      });
      expect(nextDetails?.lineItems[0]?.groupId).toBe(nextDetails?.groups?.[0]?.id);
      expect(family.filter((version) => version.isLatestVersion)).toHaveLength(1);
      expect(family.find((version) => version.id === next.id)?.isLatestVersion).toBe(true);
      expect(creationEvents.map((event) => event.eventType)).toContain("version_created");

      await storage.setCurrentQuoteVersion(original.id);
      const currentFamily = await storage.getQuoteVersions(original.id);
      const allEvents = await storage.getQuoteVersionEvents(original.id);
      expect(currentFamily.filter((version) => version.isLatestVersion)).toHaveLength(1);
      expect(currentFamily.find((version) => version.id === original.id)?.isLatestVersion).toBe(true);
      expect(allEvents.map((event) => event.eventType)).toEqual([
        "version_created",
        "version_made_current",
      ]);
      expect(allEvents[1]).toEqual(expect.objectContaining({
        fromQuoteId: next.id,
        toQuoteId: original.id,
      }));
    });

    it("serializes concurrent version creation and keeps one current version", async () => {
      const original = await storage.createQuote({ projectName: "Concurrent Version Family " + Date.now() });
      const created = await Promise.all([
        storage.createQuoteVersion(original.id),
        storage.createQuoteVersion(original.id),
      ]);
      const family = await storage.getQuoteVersions(original.id);
      const events = await storage.getQuoteVersionEvents(original.id);

      expect(created.map((version) => version.versionNumber).sort()).toEqual([2, 3]);
      expect(family.filter((version) => version.isLatestVersion)).toHaveLength(1);
      expect(family.find((version) => version.isLatestVersion)?.versionNumber).toBe(3);
      expect(events.filter((event) => event.eventType === "version_created")).toHaveLength(2);
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

    it("records credit atomically on an unsigned quote and blocks a signed target", async () => {
      const unsignedQuote = await storage.createQuote({ projectName: "Planning Credit Target " + Date.now() });
      const unsignedAgreement = await storage.createPlanningAgreement({
        quoteId: unsignedQuote.id,
        quoteFamilyRootId: unsignedQuote.id,
        status: "paid_active",
        tier: "standard_design",
        amount: "1500.00",
        creditEligible: true,
        paymentConfirmedAt: new Date(),
      });
      const beforeCreditRevision = (await storage.getQuote(unsignedQuote.id))?.updatedAt;
      const credited = await storage.applyPlanningAgreementCredit(
        unsignedAgreement.id,
        unsignedQuote.id,
        "1000.00",
      );
      const afterCreditRevision = (await storage.getQuote(unsignedQuote.id))?.updatedAt;
      expect(credited?.status).toBe("credited");
      expect(credited?.appliedCreditAmount).toBe("1000.00");
      expect(afterCreditRevision?.getTime()).not.toBe(beforeCreditRevision?.getTime());

      const signedQuote = await storage.createQuote({ projectName: "Signed Planning Credit Target " + Date.now() });
      const signedAgreement = await storage.createPlanningAgreement({
        quoteId: signedQuote.id,
        quoteFamilyRootId: signedQuote.id,
        status: "paid_active",
        tier: "standard_design",
        amount: "1500.00",
        creditEligible: true,
        paymentConfirmedAt: new Date(),
      });
      await storage.updateQuote(signedQuote.id, {
        clientSignedAt: new Date("2026-07-10T12:00:00.000Z"),
        signedDocumentSnapshot: { quoteNumber: signedQuote.quoteNumber },
      }, { mutationKind: "customer_signature" });

      await expect(storage.applyPlanningAgreementCredit(
        signedAgreement.id,
        signedQuote.id,
        "1000.00",
      )).rejects.toMatchObject({ code: "QUOTE_SIGNED_LOCKED", status: 409 });
      expect((await storage.getPlanningAgreement(signedAgreement.id))?.status).toBe("paid_active");
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
      }, { mutationKind: "package_preparation" });
      await storage.updateQuote(quote.id, {
        enableESignature: true,
        signingToken: signingToken,
      }, { mutationKind: "package_preparation" });

      expect(updated).toBeDefined();
      expect(updated?.enableESignature).toBe(true);
      expect(updated?.signingToken).toBe(signingToken);
      const packageEvents = await database
        .select()
        .from(businessEvents)
        .where(and(
          eq(businessEvents.eventType, "customer_package_prepared"),
          eq(businessEvents.quoteId, quote.id),
        ));
      expect(packageEvents).toHaveLength(1);
      expect(packageEvents[0].eventKey).not.toContain(signingToken);
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

  describe("Email Delivery Evidence", () => {
    it("claims, retries, finalizes, replays, and rejects conflicting action keys", async () => {
      const firstQuote = await storage.createQuote({
        projectName: "Email delivery fixture " + Date.now(),
      });
      const secondQuote = await storage.createQuote({
        projectName: "Email delivery conflict fixture " + Date.now(),
      });
      const idempotencyKey = `quote-email:${firstQuote.id}:${nanoid()}`;

      const claimed = await storage.claimEmailDelivery({
        idempotencyKey,
        messageType: "quote_signature_request",
        quoteId: firstQuote.id,
      });
      expect(claimed.outcome).toBe("claimed");
      expect(claimed.attempt).toMatchObject({
        status: "pending",
        attemptCount: 1,
        quoteId: firstQuote.id,
      });
      await expect(storage.getEmailDeliveryAttempt(claimed.attempt!.id)).resolves.toMatchObject({
        id: claimed.attempt!.id,
        idempotencyKey,
        messageType: "quote_signature_request",
      });

      const pendingReplay = await storage.claimEmailDelivery({
        idempotencyKey,
        messageType: "quote_signature_request",
        quoteId: firstQuote.id,
      });
      expect(pendingReplay.outcome).toBe("in_progress");

      const failed = await storage.markEmailDeliveryFailed(claimed.attempt!.id, "ProviderUnavailable");
      expect(failed).toMatchObject({
        status: "failed",
        lastErrorType: "ProviderUnavailable",
      });

      const retried = await storage.claimEmailDelivery({
        idempotencyKey,
        messageType: "quote_signature_request",
        quoteId: firstQuote.id,
      });
      expect(retried.outcome).toBe("claimed");
      expect(retried.attempt).toMatchObject({
        status: "pending",
        attemptCount: 2,
        lastErrorType: null,
      });

      const sentAt = new Date("2026-07-10T12:00:00.000Z");
      const sent = await storage.markEmailDeliverySent(
        retried.attempt!.id,
        sentAt,
        "gmail-provider-message-1",
      );
      expect(sent).toMatchObject({
        status: "sent",
        providerMessageId: "gmail-provider-message-1",
        sentAt,
      });

      const sentReplay = await storage.claimEmailDelivery({
        idempotencyKey,
        messageType: "quote_signature_request",
        quoteId: firstQuote.id,
      });
      expect(sentReplay.outcome).toBe("sent");

      const conflict = await storage.claimEmailDelivery({
        idempotencyKey,
        messageType: "quote_signature_request",
        quoteId: secondQuote.id,
      });
      expect(conflict.outcome).toBe("conflict");
    });

    it("summarizes failed and stale attempts without exposing action keys or message content", async () => {
      const quote = await storage.createQuote({
        projectName: "Email reconciliation fixture " + Date.now(),
      });
      const stale = await storage.claimEmailDelivery({
        idempotencyKey: `quote-email:${quote.id}:stale-${nanoid()}`,
        messageType: "quote_signature_request",
        quoteId: quote.id,
      });
      const failed = await storage.claimEmailDelivery({
        idempotencyKey: `quote-email:${quote.id}:failed-${nanoid()}`,
        messageType: "quote_signature_request",
        quoteId: quote.id,
      });
      const staleTimestamp = new Date(Date.now() - 60 * 60_000);
      await database
        .update(emailDeliveryAttempts)
        .set({ updatedAt: staleTimestamp })
        .where(eq(emailDeliveryAttempts.id, stale.attempt!.id));
      await storage.markEmailDeliveryFailed(failed.attempt!.id, "ProviderUnavailable");

      const [storedStaleAttempt] = await database
        .select()
        .from(emailDeliveryAttempts)
        .where(eq(emailDeliveryAttempts.id, stale.attempt!.id));
      expect(storedStaleAttempt.updatedAt?.getTime()).toBe(staleTimestamp.getTime());

      const health = await storage.getEmailDeliveryHealth({ staleAfterMinutes: 15, limit: 1 });
      expect(health.summary.pending).toBeGreaterThanOrEqual(1);
      expect(health.summary.stalePending).toBeGreaterThanOrEqual(1);
      expect(health.summary.failed).toBeGreaterThanOrEqual(1);
      expect(health.attentionTotal).toBeGreaterThanOrEqual(2);
      expect(health.attention).toHaveLength(1);
      expect(health.attentionTruncated).toBe(true);
      expect(health.attention[0]).toEqual(expect.objectContaining({
        messageType: "quote_signature_request",
        quoteId: quote.id,
      }));
      expect(JSON.stringify(health)).not.toContain("idempotencyKey");
      expect(JSON.stringify(health)).not.toContain("providerMessageId");
      expect(JSON.stringify(health)).not.toContain("recipient");
    });
  });

  describe("Adoption Evidence", () => {
    it("deduplicates authoritative events and reports only post-instrumentation counts", async () => {
      const quote = await storage.createQuote({ projectName: "Adoption evidence fixture " + Date.now() });
      const eventKey = `customer_package_prepared:test-${nanoid()}`;
      const first = await storage.recordBusinessEvent({
        eventType: "customer_package_prepared",
        eventKey,
        quoteId: quote.id,
      });
      const replay = await storage.recordBusinessEvent({
        eventType: "customer_package_prepared",
        eventKey,
        quoteId: quote.id,
      });
      await storage.recordBusinessEvent({ eventType: "quote_import_completed", quoteId: quote.id });
      await storage.recordBusinessEvent({ eventType: "dimensional_price_resolved" });

      const delivery = await storage.claimEmailDelivery({
        idempotencyKey: `quote-email:${quote.id}:adoption-${nanoid()}`,
        messageType: "quote_signature_request",
        quoteId: quote.id,
      });
      await storage.markEmailDeliverySent(delivery.attempt!.id, new Date(), "fixture-provider-id");
      await storage.createQuoteVersion(quote.id);

      expect(first).toBeDefined();
      expect(replay).toBeUndefined();
      expect(Object.keys(first!)).not.toEqual(expect.arrayContaining([
        "payload",
        "metadata",
        "email",
        "filename",
        "dimensions",
        "price",
        "signingToken",
      ]));

      const summary = await storage.getAdoptionSummary({ windowDays: 30 });
      const metric = (key: string) => summary.metrics.find((item) => item.key === key);
      expect(summary.historicalCoverage).toBe("post_instrumentation_only");
      expect(metric("customer_package_prepared")?.count).toBeGreaterThanOrEqual(1);
      expect(metric("quote_import_completed")?.count).toBeGreaterThanOrEqual(1);
      expect(metric("dimensional_price_resolved")?.count).toBeGreaterThanOrEqual(1);
      expect(metric("approval_email_accepted")?.count).toBeGreaterThanOrEqual(1);
      expect(metric("quote_version_created")?.count).toBeGreaterThanOrEqual(1);
      expect(summary.metrics.filter((item) => item.count > 0).every((item) => item.firstRecordedAt instanceof Date)).toBe(true);
    });

    it("imports a product catalog atomically and deduplicates a completed request", async () => {
      const importRequestId = randomUUID();
      const productName = `Transactional catalog fixture ${importRequestId}`;
      const request = {
        importRequestId,
        products: [{
          name: productName,
          sku: `FIX-${importRequestId.slice(0, 8)}`,
          manufacturer: "Fixture Manufacturer",
          category: "Fixtures",
          unit: "each",
          description: "Synthetic database test product",
          retailPrice: 125,
          cost: 75,
        }],
      };

      const first = await storage.importProductCatalog(request, null);
      const replay = await storage.importProductCatalog(request, null);
      expect(first).toEqual(expect.objectContaining({ created: 1, updated: 0, replayed: false }));
      expect(replay).toEqual(expect.objectContaining({ created: 0, updated: 0, replayed: true }));

      const storedProducts = await database.select().from(products).where(eq(products.name, productName));
      const storedEvents = await database.select().from(businessEvents).where(eq(
        businessEvents.eventKey,
        `product_catalog_import_completed:${importRequestId}`,
      ));
      expect(storedProducts).toHaveLength(1);
      expect(storedProducts[0]).toEqual(expect.objectContaining({
        retailPrice: "125.00",
        defaultUnitPrice: "125.00",
        costPrice: "75.00",
      }));
      expect(storedEvents).toHaveLength(1);
      expect((await storage.getAdoptionSummary()).metrics.find(
        (metric) => metric.key === "product_catalog_import_completed",
      )?.count).toBeGreaterThanOrEqual(1);

      const rejectedName = `Rejected catalog fixture ${randomUUID()}`;
      await expect(storage.importProductCatalog({
        importRequestId: randomUUID(),
        products: [
          { ...request.products[0], name: rejectedName },
          { ...request.products[0], name: "Invalid product", cost: -1 },
        ],
      } as any, null)).rejects.toThrow();
      expect(await database.select().from(products).where(eq(products.name, rejectedName))).toHaveLength(0);
    });

    it("inserts one configured Sundance package and its event in one idempotent transaction", async () => {
      const importRequestId = randomUUID();
      const productName = `Sundance insertion fixture ${importRequestId}`;
      await storage.importProductCatalog({
        importRequestId,
        products: [{
          name: productName,
          sku: `SUN-${importRequestId.slice(0, 8)}`,
          manufacturer: "Sundance",
          category: "Fixtures",
          unit: "each",
          description: "Synthetic configured product",
          retailPrice: 200,
          cost: 80,
        }],
      }, null);
      const product = (await storage.getAllProducts()).find((row) => row.name === productName)!;
      const quote = await storage.createQuote({ projectName: `Configured insertion ${randomUUID()}` });
      const requestId = randomUUID();
      const input = {
        requestId,
        items: [{
          productId: product.id,
          quantity: 2,
          productSnapshot: {
            name: "Stale client name",
            manufacturer: "Sundance",
            retailPrice: "9999",
            costPrice: "9999",
            defaultDiscountType: "percentage",
            defaultDiscountValue: "0",
          },
          configData: { colors: [] },
        }],
      };

      const first = await storage.insertConfiguredProduct(quote.id, input, null);
      const replay = await storage.insertConfiguredProduct(quote.id, input, null);
      expect(first).toEqual({ success: true, groupId: `config-${requestId}`, replayed: false });
      expect(replay).toEqual({ success: true, groupId: `config-${requestId}`, replayed: true });

      const storedGroups = await database.select().from(groups).where(eq(groups.id, first.groupId));
      const storedLines = await database.select().from(lineItems).where(eq(lineItems.groupId, first.groupId));
      const storedEvents = await database.select().from(businessEvents).where(eq(
        businessEvents.eventKey,
        `sundance_configuration_inserted:${quote.id}:${requestId}`,
      ));
      expect(storedGroups).toHaveLength(1);
      expect(storedLines).toHaveLength(1);
      expect(storedLines[0]).toEqual(expect.objectContaining({
        description: productName,
        retailPrice: "200.00",
        unitPrice: "80.00",
        priceSource: "configured_catalog",
      }));
      expect(storedEvents).toHaveLength(1);
      expect((await storage.getAdoptionSummary()).metrics.find(
        (metric) => metric.key === "sundance_configuration_inserted",
      )?.count).toBeGreaterThanOrEqual(1);
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
