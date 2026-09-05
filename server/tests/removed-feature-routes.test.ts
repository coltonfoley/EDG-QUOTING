import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockStorage = vi.hoisted(() => ({
  getQuote: vi.fn(),
  getPlanningAgreement: vi.fn(),
  getLineItemsByQuoteId: vi.fn(),
  getLineItem: vi.fn(),
  getGroup: vi.fn(),
  getQuoteWithDetails: vi.fn(),
  getQuoteBySigningToken: vi.fn(),
  getProduct: vi.fn(),
  getUser: vi.fn(),
  calculateConfigurableProductPrice: vi.fn(),
  replacePricingTablesForProduct: vi.fn(),
  getQuoteCoverPhotoById: vi.fn(),
  getQuoteProductRenderingById: vi.fn(),
  quoteExists: vi.fn(),
  validateLineItemSelection: vi.fn(),
  claimEmailDelivery: vi.fn(),
  markEmailDeliverySent: vi.fn(),
  markEmailDeliveryFailed: vi.fn(),
  recordBusinessEvent: vi.fn(),
  updateQuote: vi.fn(),
  deleteQuote: vi.fn(),
  updatePlanningAgreement: vi.fn(),
  createLineItem: vi.fn(),
  createGroup: vi.fn(),
  insertConfiguredProduct: vi.fn(),
  createQuoteCoverPhoto: vi.fn(),
  deleteLineItem: vi.fn(),
  deleteGroup: vi.fn(),
  deleteQuoteCoverPhoto: vi.fn(),
  deleteQuoteProductRendering: vi.fn(),
}));
const mockSendEmail = vi.hoisted(() => vi.fn());

vi.mock("../auth", () => ({
  isAuthenticated: (_req: any, _res: any, next: any) => next(),
  requireAdmin: (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../storage", () => ({
  storage: mockStorage,
}));

vi.mock("../db", () => ({
  db: {},
  ensureProductCatalogColumns: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../email", () => ({
  sendEmail: mockSendEmail,
}));

import { registerPlanningAgreementRoutes } from "../routes/planningAgreementRoutes";
import { registerQuoteRoutes } from "../routes/quoteRoutes";
import { registerLineItemRoutes } from "../routes/lineItemRoutes";
import { registerProductRoutes } from "../routes/productRoutes";
import { QuoteSignedLockedError } from "../quoteLock";
import { buildPublicSigningQuote } from "../quotePublicSigning";
import { PricingBandValidationError, PricingManualReviewError } from "../pricingBands";
import { SUNDANCE_SERVICE_CATALOG_ROWS } from "../sundanceServices";

const makeApp = () => {
  const app = express();
  app.use(express.json());
  registerPlanningAgreementRoutes(app);
  registerQuoteRoutes(app);
  registerLineItemRoutes(app);
  registerProductRoutes(app);
  return app;
};

describe("removed quote feature routes", () => {
  beforeEach(() => {
    mockStorage.getQuote.mockReset();
    mockStorage.getQuoteWithDetails.mockReset();
    mockStorage.getQuoteBySigningToken.mockReset();
    mockStorage.getProduct.mockReset();
    mockStorage.getUser.mockReset();
    mockStorage.getUser.mockResolvedValue({ id: 1, role: "admin" });
    mockStorage.calculateConfigurableProductPrice.mockReset();
    mockStorage.replacePricingTablesForProduct.mockReset();
    mockStorage.getPlanningAgreement.mockReset();
    mockStorage.getLineItem.mockReset();
    mockStorage.getGroup.mockReset();
    mockStorage.getQuoteCoverPhotoById.mockReset();
    mockStorage.getQuoteProductRenderingById.mockReset();
    mockStorage.quoteExists.mockReset();
    mockStorage.validateLineItemSelection.mockReset();
    mockStorage.claimEmailDelivery.mockReset();
    mockStorage.markEmailDeliverySent.mockReset();
    mockStorage.markEmailDeliveryFailed.mockReset();
    mockStorage.recordBusinessEvent.mockReset();
    mockStorage.recordBusinessEvent.mockResolvedValue({ id: 1 });
    mockStorage.updateQuote.mockReset();
    mockStorage.deleteQuote.mockReset();
    mockStorage.updatePlanningAgreement.mockReset();
    mockStorage.getLineItemsByQuoteId.mockReset();
    mockStorage.createLineItem.mockReset();
    mockStorage.createGroup.mockReset();
    mockStorage.insertConfiguredProduct.mockReset();
    mockStorage.createQuoteCoverPhoto.mockReset();
    mockStorage.deleteLineItem.mockReset();
    mockStorage.deleteGroup.mockReset();
    mockStorage.deleteQuoteCoverPhoto.mockReset();
    mockStorage.deleteQuoteProductRendering.mockReset();
    mockSendEmail.mockReset();
  });

  it.each(SUNDANCE_SERVICE_CATALOG_ROWS)("rejects portal-only service $sku before creating a native quote line", async (service) => {
    mockStorage.getLineItemsByQuoteId.mockResolvedValue([]);
    mockStorage.getProduct.mockResolvedValue({ ...service, id: 71 });
    const response = await request(makeApp()).post("/api/quotes/123/line-items").send({
      productId: 71, description: "Stale client material", quantity: "1", unitPrice: "0", markupType: "percentage", markupValue: "100", discountType: "percentage", discountValue: "0",
    });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: "SUNDANCE_SERVICE_REVIEW_REQUIRED" });
    expect(mockStorage.createLineItem).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("does not allow a reserved service SKU to bypass review as a manual line", async () => {
    mockStorage.getLineItemsByQuoteId.mockResolvedValue([]);
    const response = await request(makeApp()).post("/api/quotes/123/line-items").send({
      sku: " edg-sd-drawings ", description: "Drawings", quantity: "1", unitPrice: "500", markupType: "percentage", markupValue: "0", discountType: "percentage", discountValue: "0",
    });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe("SUNDANCE_SERVICE_REVIEW_REQUIRED");
    expect(mockStorage.createLineItem).not.toHaveBeenCalled();
  });

  it("requires an idempotency key and delegates configured package insertion atomically", async () => {
    const item = {
      productId: 42,
      quantity: 2,
      productSnapshot: {
        name: "Fixture Sundance part",
        manufacturer: "Sundance",
        retailPrice: "200.00",
        costPrice: "80.00",
        defaultDiscountType: "percentage",
        defaultDiscountValue: "60",
      },
      configData: { colors: [] },
    };
    await request(makeApp())
      .post("/api/quotes/123/configure-product")
      .send({ items: [item] })
      .expect(400);
    expect(mockStorage.insertConfiguredProduct).not.toHaveBeenCalled();

    const requestId = "4d5ee45a-08ac-4f03-9336-6a489451cf26";
    mockStorage.insertConfiguredProduct.mockResolvedValueOnce({
      success: true,
      groupId: `config-${requestId}`,
      replayed: false,
    });
    const created = await request(makeApp())
      .post("/api/quotes/123/configure-product")
      .send({ requestId, items: [item] })
      .expect(201);
    expect(created.body).toMatchObject({ success: true, replayed: false });
    expect(mockStorage.insertConfiguredProduct).toHaveBeenCalledWith(123, { requestId, items: [item] }, null);

    mockStorage.insertConfiguredProduct.mockResolvedValueOnce({
      success: true,
      groupId: `config-${requestId}`,
      replayed: true,
    });
    const replayed = await request(makeApp())
      .post("/api/quotes/123/configure-product")
      .send({ requestId, items: [item] })
      .expect(200);
    expect(replayed.body).toMatchObject({ success: true, replayed: true });
  });

  it("rejects new Design + Planning Agreement creation", async () => {
    const response = await request(makeApp())
      .post("/api/quotes/123/planning-agreement")
      .send({ amount: "1500.00" })
      .expect(410);

    expect(response.body).toEqual({
      message: "Design + Planning Agreement creation has been removed from the quote workflow.",
      code: "PLANNING_AGREEMENT_REMOVED",
    });
  });

  it("returns a stable conflict when editing a customer-approved quote", async () => {
    mockStorage.getQuote.mockResolvedValue({
      id: 123,
      isLatestVersion: true,
      clientSignedAt: new Date("2026-07-10T12:00:00.000Z"),
      signedDocumentSnapshot: { quoteNumber: "TEST-123" },
    });

    const response = await request(makeApp())
      .put("/api/quotes/123")
      .send({ projectName: "Blocked edit" })
      .expect(409);

    expect(response.body).toEqual({
      message: "This customer-approved quote is read-only. Create a new version to make changes.",
      code: "QUOTE_SIGNED_LOCKED",
    });
    expect(mockStorage.updateQuote).not.toHaveBeenCalled();
  });

  it("records the actual pipeline stage-change time and clears stale lost reasons outside Closed Lost", async () => {
    mockStorage.getQuote
      .mockResolvedValueOnce({ id: 123, dealStage: "quote_sent", isLatestVersion: true })
      .mockResolvedValueOnce({
        id: 123,
        dealStage: "closed_won",
        dealStageChangedAt: new Date("2026-07-10T12:00:00.000Z"),
        isLatestVersion: true,
      });
    mockStorage.updateQuote.mockResolvedValue({ id: 123, dealStage: "closed_won" });

    await request(makeApp())
      .patch("/api/quotes/123/stage")
      .send({ deal_stage: "closed_won" })
      .expect(200);

    expect(mockStorage.updateQuote).toHaveBeenNthCalledWith(
      1,
      123,
      expect.objectContaining({
        dealStage: "closed_won",
        dealStageChangedAt: expect.any(Date),
        lostReason: null,
      }),
      { mutationKind: "pipeline_stage" },
    );

    await request(makeApp())
      .patch("/api/quotes/123/stage")
      .send({ deal_stage: "closed_won" })
      .expect(200);

    expect(mockStorage.updateQuote).toHaveBeenNthCalledWith(
      2,
      123,
      { dealStage: "closed_won", lostReason: null },
      { mutationKind: "pipeline_stage" },
    );
  });

  it("maps storage lock conflicts for quote deletion", async () => {
    mockStorage.deleteQuote.mockRejectedValue(new QuoteSignedLockedError(123));

    await request(makeApp())
      .delete("/api/quotes/123")
      .expect(409, {
        message: "This customer-approved quote is read-only. Create a new version to make changes.",
        code: "QUOTE_SIGNED_LOCKED",
      });
  });

  it("maps storage lock conflicts for line-item creation", async () => {
    mockStorage.getLineItemsByQuoteId.mockResolvedValue([]);
    mockStorage.getQuote.mockResolvedValue({ id: 123, tariffRate: "0" });
    mockStorage.createLineItem.mockRejectedValue(new QuoteSignedLockedError(123));

    await request(makeApp())
      .post("/api/quotes/123/line-items")
      .send({
        description: "Blocked line",
        quantity: "1",
        unitPrice: "100.00",
        markupType: "percentage",
        markupValue: "0",
        discountType: "percentage",
        discountValue: "0",
      })
      .expect(409, {
        message: "This customer-approved quote is read-only. Create a new version to make changes.",
        code: "QUOTE_SIGNED_LOCKED",
      });
  });

  it("preserves canonical catalog identity and the requested group on line creation", async () => {
    mockStorage.getLineItemsByQuoteId.mockResolvedValue([]);
    mockStorage.getQuote.mockResolvedValue({ id: 123, tariffRate: "0" });
    mockStorage.getProduct.mockResolvedValue({
      id: 55,
      name: "Canonical Shade",
      sku: "CANON-55",
      manufacturer: "Canonical Manufacturer",
      category: "Shade",
      productType: "simple",
      unit: "each",
      retailPrice: "200",
      costPrice: "120",
      defaultDiscountType: "percentage",
      defaultDiscountValue: "40",
    });
    mockStorage.createLineItem.mockImplementation(async (value) => ({ id: 99, ...value }));

    await request(makeApp())
      .post("/api/quotes/123/line-items")
      .send({
        productId: 55,
        sku: "SPOOFED",
        manufacturer: "Spoofed Manufacturer",
        description: "Edited customer description",
        quantity: 1,
        retailPrice: 200,
        unitPrice: 120,
        markupType: "percentage",
        markupValue: 25,
        discountType: "percentage",
        discountValue: 0,
        groupId: "option-a",
      })
      .expect(201);

    expect(mockStorage.createLineItem).toHaveBeenCalledWith(expect.objectContaining({
      productId: 55,
      sku: "CANON-55",
      manufacturer: "Canonical Manufacturer",
      unit: "each",
      priceSource: "catalog_cost",
      groupId: "option-a",
      sourceMetadata: expect.objectContaining({
        productSnapshot: expect.objectContaining({ id: 55, sku: "CANON-55" }),
        enteredUnitPrice: "120",
      }),
    }));
  });

  it("converts declared feet to inches and returns a stable manual-review pricing response", async () => {
    mockStorage.calculateConfigurableProductPrice.mockRejectedValue(
      new PricingManualReviewError(
        "PRICING_MANUAL_REVIEW",
        "No exact pricing band covers these dimensions. Manual pricing review is required.",
        422,
      ),
    );

    const response = await request(makeApp())
      .post("/api/products/55/calculate-price")
      .send({ length: 10, width: 8, sourceUnit: "feet" })
      .expect(422);

    expect(mockStorage.calculateConfigurableProductPrice).toHaveBeenCalledWith(55, 120, 96);
    expect(response.body).toEqual({
      message: "No exact pricing band covers these dimensions. Manual pricing review is required.",
      code: "PRICING_MANUAL_REVIEW",
    });
    expect(mockStorage.recordBusinessEvent).not.toHaveBeenCalled();
  });

  it("records a successful exact dimensional-pricing use without dimensions or price payload", async () => {
    mockStorage.calculateConfigurableProductPrice.mockResolvedValue(4321);

    const response = await request(makeApp())
      .post("/api/products/55/calculate-price")
      .send({ length: 10, width: 8, sourceUnit: "feet" })
      .expect(200);

    expect(response.body.price).toBe(4321);
    expect(mockStorage.recordBusinessEvent).toHaveBeenCalledWith({
      eventType: "dimensional_price_resolved",
      productId: 55,
      actorUserId: null,
    });
    expect(JSON.stringify(mockStorage.recordBusinessEvent.mock.calls)).not.toContain("4321");
    expect(JSON.stringify(mockStorage.recordBusinessEvent.mock.calls)).not.toContain("length");
  });

  it("does not replace pricing tables when the uploaded set is ambiguous", async () => {
    mockStorage.replacePricingTablesForProduct.mockRejectedValue(
      new PricingBandValidationError(["Entries 1 and 2 overlap or share an inclusive boundary."]),
    );

    const response = await request(makeApp())
      .post("/api/products/55/pricing-tables/bulk-upload")
      .send({
        sourceUnit: "feet",
        pricingData: [
          { lengthMin: 10, lengthMax: 12, widthMin: 8, widthMax: 10, retailPrice: 1000, basePrice: 700 },
          { lengthMin: 12, lengthMax: 14, widthMin: 8, widthMax: 10, retailPrice: 1200, basePrice: 840 },
        ],
      })
      .expect(409);

    expect(response.body.code).toBe("PRICING_BANDS_INVALID");
    expect(mockStorage.replacePricingTablesForProduct).toHaveBeenCalledTimes(1);
  });

  it("requires an explicit quote target before an existing-quote PDF import", async () => {
    const response = await request(makeApp())
      .post("/api/quotes/import-batch")
      .send({
        importOptions: {
          createNewQuote: false,
          combineIntoSingleQuote: false,
          attachCustomer: "none",
          priceMeaning: "customer_unit_price",
          defaultMarkupPercent: 0,
        },
        extractedQuotes: [{
          pdfId: "fixture-import",
          filename: "fixture.pdf",
          customer: {},
          quoteNumber: "FIXTURE-IMPORT",
          lineItems: [{ description: "Fixture line", quantity: 1, price: 100, unit: "each" }],
        }],
      })
      .expect(400);

    expect(response.body.code).toBe("IMPORT_INVALID");
    expect(response.body.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: ["importOptions", "existingQuoteId"] }),
    ]));
  });

  it("maps storage lock conflicts for group creation", async () => {
    mockStorage.createGroup.mockRejectedValue(new QuoteSignedLockedError(123));

    await request(makeApp())
      .post("/api/quotes/123/groups")
      .send({ id: "blocked-group", title: "Blocked", position: 0 })
      .expect(409, {
        message: "This customer-approved quote is read-only. Create a new version to make changes.",
        code: "QUOTE_SIGNED_LOCKED",
      });
  });

  it("rejects direct planning-agreement status mutation", async () => {
    await request(makeApp())
      .patch("/api/planning-agreements/88")
      .send({ status: "credited" })
      .expect(400);

    expect(mockStorage.updatePlanningAgreement).not.toHaveBeenCalled();
  });

  it("rejects new order approval drawing creation", async () => {
    const response = await request(makeApp())
      .post("/api/quotes/123/approval-drawing")
      .send({ title: "Order Approval Drawing" })
      .expect(410);

    expect(response.body).toEqual({
      message: "Order approval drawing creation has been removed from the quote workflow.",
      code: "APPROVAL_DRAWING_REMOVED",
    });
  });

  it("forces approval links to exclude order approval drawings from stale clients", async () => {
    mockStorage.getQuoteWithDetails.mockResolvedValue({
      id: 123,
      isLatestVersion: true,
      signingToken: null,
      lineItems: [{ id: 1, quoteId: 123, description: "Scope", quantity: "1", unitPrice: "100" }],
      approvalDrawing: {
        id: 77,
        status: "ready_for_agreement",
      },
    });
    mockStorage.updateQuote.mockResolvedValue({ id: 123 });

    const response = await request(makeApp())
      .post("/api/quotes/123/enable-esignature")
      .send({
        esigIncludePricing: true,
        esigIncludeImages: false,
        esigIncludeContract: false,
        esigIncludeApprovalDrawing: true,
      })
      .expect(200);

    expect(mockStorage.updateQuote).toHaveBeenCalledWith(
      123,
      expect.objectContaining({
        enableESignature: true,
        esigIncludeApprovalDrawing: false,
      }),
      { mutationKind: "package_preparation", actorUserId: null },
    );
    expect(response.body).toEqual(expect.objectContaining({
      success: true,
      approvalDrawingIncluded: false,
    }));
  });

  it("does not prepare an incomplete customer package", async () => {
    mockStorage.getQuoteWithDetails.mockResolvedValue({
      id: 123,
      isLatestVersion: true,
      signingToken: null,
      lineItems: [],
      productRenderings: [],
    });

    const response = await request(makeApp())
      .post("/api/quotes/123/enable-esignature")
      .send({
        esigIncludePricing: true,
        esigIncludeImages: true,
        esigIncludeContract: false,
      })
      .expect(409);

    expect(response.body.code).toBe("CUSTOMER_PACKAGE_INCOMPLETE");
    expect(response.body.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "NO_LINE_ITEMS" }),
      expect.objectContaining({ code: "MISSING_VISUALS" }),
    ]));
    expect(mockStorage.updateQuote).not.toHaveBeenCalled();
  });

  it("does not email an archived quote to a customer", async () => {
    mockStorage.getQuoteWithDetails.mockResolvedValue({
      id: 123,
      isLatestVersion: false,
      enableESignature: true,
      signingToken: "archived-signing-token",
      account: { email: "customer@example.com" },
    });

    const response = await request(makeApp())
      .post("/api/quotes/123/send-signature-email")
      .set("Idempotency-Key", "quote-email:123:archived-test")
      .send({ personalizedMessage: "Please review." })
      .expect(409);

    expect(response.body).toEqual({
      message: "This quote version is archived. Make it the current version before you send it for customer approval.",
      code: "QUOTE_VERSION_ARCHIVED",
    });
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockStorage.updateQuote).not.toHaveBeenCalled();
  });

  it("requires an idempotency key before starting a quote email action", async () => {
    const response = await request(makeApp())
      .post("/api/quotes/123/send-signature-email")
      .send({ message: "Please review." })
      .expect(400);

    expect(response.body).toEqual({
      message: "This email action needs an idempotency key. Refresh Rainmaker and try again.",
      code: "EMAIL_IDEMPOTENCY_KEY_REQUIRED",
    });
    expect(mockStorage.getQuoteWithDetails).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("requires an idempotency key before starting a legacy planning email action", async () => {
    const response = await request(makeApp())
      .post("/api/planning-agreements/88/send-signature-email")
      .send({ message: "Please review." })
      .expect(400);

    expect(response.body.code).toBe("EMAIL_IDEMPOTENCY_KEY_REQUIRED");
    expect(mockStorage.getPlanningAgreement).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("sends a claimed quote email once and records provider evidence", async () => {
    const quote = {
      id: 123,
      isLatestVersion: true,
      enableESignature: true,
      signingToken: "current-signing-token",
      quoteNumber: "QT-2026-123",
      projectName: "Safe retry fixture",
      esigIncludeImages: false,
      esigIncludeContract: false,
      lineItems: [{ id: 1, quoteId: 123, description: "Scope" }],
      account: { email: "customer@example.com", name: "Test Customer" },
    };
    mockStorage.getQuoteWithDetails.mockResolvedValue(quote);
    mockStorage.claimEmailDelivery.mockResolvedValue({
      outcome: "claimed",
      attempt: { id: 91, status: "pending" },
    });
    mockSendEmail.mockResolvedValue({ id: "gmail-provider-message-1" });
    mockStorage.markEmailDeliverySent.mockResolvedValue({ id: 91, status: "sent" });
    mockStorage.updateQuote.mockResolvedValue(quote);

    const response = await request(makeApp())
      .post("/api/quotes/123/send-signature-email")
      .set("Idempotency-Key", "quote-email:123:test-action-1")
      .send({ message: "Please review." })
      .expect(200);

    expect(mockStorage.claimEmailDelivery).toHaveBeenCalledWith({
      idempotencyKey: "quote-email:123:test-action-1",
      messageType: "quote_signature_request",
      quoteId: 123,
    });
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockStorage.markEmailDeliverySent).toHaveBeenCalledWith(
      91,
      expect.any(Date),
      "gmail-provider-message-1",
    );
    expect(mockStorage.updateQuote).toHaveBeenCalledWith(123, expect.objectContaining({
      signatureEmailSentAt: expect.any(Date),
      signatureEmailMessage: "Please review.",
    }), { mutationKind: "signature_email" });
    expect(response.body).toEqual(expect.objectContaining({ success: true, replayed: false }));
  });

  it("does not resend an already-completed quote email action", async () => {
    const sentAt = new Date("2026-07-10T12:00:00.000Z");
    mockStorage.getQuoteWithDetails.mockResolvedValue({
      id: 123,
      isLatestVersion: true,
      enableESignature: true,
      signingToken: "current-signing-token",
      quoteNumber: "QT-2026-123",
      projectName: "Replay fixture",
      esigIncludeImages: false,
      esigIncludeContract: false,
      lineItems: [{ id: 1, quoteId: 123, description: "Scope" }],
      account: { email: "customer@example.com", name: "Test Customer" },
    });
    mockStorage.claimEmailDelivery.mockResolvedValue({
      outcome: "sent",
      attempt: { id: 91, status: "sent", sentAt },
    });

    const response = await request(makeApp())
      .post("/api/quotes/123/send-signature-email")
      .set("Idempotency-Key", "quote-email:123:test-action-1")
      .send({ message: "Please review." })
      .expect(200);

    expect(response.body).toEqual(expect.objectContaining({
      success: true,
      replayed: true,
      sentAt: sentAt.toISOString(),
    }));
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockStorage.markEmailDeliverySent).not.toHaveBeenCalled();
    expect(mockStorage.updateQuote).not.toHaveBeenCalled();
  });

  it("records a provider failure without exposing its raw message", async () => {
    mockStorage.getQuoteWithDetails.mockResolvedValue({
      id: 123,
      isLatestVersion: true,
      enableESignature: true,
      signingToken: "current-signing-token",
      quoteNumber: "QT-2026-123",
      projectName: "Failure fixture",
      esigIncludeImages: false,
      esigIncludeContract: false,
      lineItems: [{ id: 1, quoteId: 123, description: "Scope" }],
      account: { email: "customer@example.com", name: "Test Customer" },
    });
    mockStorage.claimEmailDelivery.mockResolvedValue({
      outcome: "claimed",
      attempt: { id: 92, status: "pending" },
    });
    mockSendEmail.mockRejectedValue(new Error("provider detail must stay private"));
    mockStorage.markEmailDeliveryFailed.mockResolvedValue({ id: 92, status: "failed" });

    const response = await request(makeApp())
      .post("/api/quotes/123/send-signature-email")
      .set("Idempotency-Key", "quote-email:123:test-action-2")
      .send({ message: "Please review." })
      .expect(500);

    expect(mockStorage.markEmailDeliveryFailed).toHaveBeenCalledWith(92, "Error");
    expect(response.body).toEqual({ message: "Failed to send email" });
  });

  it("does not overwrite an existing customer signature", async () => {
    mockStorage.getQuoteBySigningToken.mockResolvedValue({
      id: 123,
      isLatestVersion: true,
      enableESignature: true,
      clientSignedAt: new Date("2026-01-01T12:00:00.000Z"),
    });

    const response = await request(makeApp())
      .post("/api/signatures/existing-signature-token/sign")
      .send({
        signerType: "client",
        signatureData: {
          type: "type",
          imageData: "signed-by-customer",
          name: "Existing Customer",
        },
      })
      .expect(409);

    expect(response.body).toEqual({ message: "Client signature has already been recorded" });
    expect(mockStorage.updateQuote).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("serves groups and selected visuals through the signing token package", async () => {
    mockStorage.getQuoteBySigningToken.mockResolvedValue({
      id: 123,
      quoteNumber: "TEST-123",
      isLatestVersion: true,
      enableESignature: true,
      updatedAt: new Date("2026-07-10T12:00:00.000Z"),
      esigIncludeContract: false,
      esigIncludeImages: true,
      lineItems: [{ id: 1, quoteId: 123, description: "Scope", quantity: "1", unitPrice: "100" }],
      groups: [{ id: "group-a", quoteId: 123, title: "Option A", position: 0, configData: { internal: true } }],
      productRenderings: [{
        id: 7,
        quoteId: 123,
        storageUrl: "https://example.test/visual.jpg",
        filename: "visual.jpg",
        originalName: "Visual.jpg",
        mimeType: "image/jpeg",
        fileSize: 100,
        displayOrder: 0,
      }],
    });

    const response = await request(makeApp())
      .get("/api/signatures/package-token/full")
      .expect(200);

    expect(response.body.groups).toEqual([{ id: "group-a", title: "Option A", position: 0 }]);
    expect(response.body.productRenderings).toEqual([
      expect.objectContaining({ id: 7, storageUrl: "https://example.test/visual.jpg" }),
    ]);
    expect(response.body.customerPackageFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(response.body.productRenderings[0]).not.toHaveProperty("quoteId");
  });

  it("binds customer signing to the reviewed quote revision", async () => {
    const reviewedAt = new Date("2026-07-10T11:59:00.000Z");
    const reviewedQuote = {
      id: 123,
      quoteNumber: "TEST-123",
      projectName: "Fictional reviewed quote",
      isLatestVersion: true,
      enableESignature: true,
      signingToken: "reviewed-signature-token",
      clientSignedAt: null,
      clientSignatureData: null,
      signedDocumentSnapshot: null,
      signatureAuditTrail: null,
      updatedAt: reviewedAt,
      esigIncludeContract: false,
      esigIncludeImages: false,
      lineItems: [{
        id: 1,
        quoteId: 123,
        description: "Fictional scope",
        quantity: "1",
        unitPrice: "1000",
      }],
      account: { name: "Fictional Customer", email: null },
    };
    mockStorage.getQuoteBySigningToken.mockResolvedValue(reviewedQuote);
    mockStorage.updateQuote.mockResolvedValue({ id: 123 });
    const reviewedPackage = buildPublicSigningQuote(reviewedQuote);

    await request(makeApp())
      .post("/api/signatures/reviewed-signature-token/sign")
      .send({
        signerType: "client",
        signatureData: {
          type: "type",
          imageData: "Fictional Customer",
          name: "Fictional Customer",
        },
        documentRevision: reviewedAt.toISOString(),
        customerPackageFingerprint: reviewedPackage.customerPackageFingerprint,
      })
      .expect(200);

    expect(mockStorage.updateQuote).toHaveBeenCalledWith(
      123,
      expect.objectContaining({
        clientSignedAt: expect.any(Date),
        signedDocumentSnapshot: expect.any(Object),
      }),
      {
        mutationKind: "customer_signature",
        expectedUpdatedAt: reviewedAt,
      },
    );
  });

  it("records and finalizes an idempotent customer confirmation receipt", async () => {
    const reviewedAt = new Date("2026-07-10T11:59:00.000Z");
    const reviewedQuote = {
      id: 123,
      quoteNumber: "TEST-123",
      projectName: "Fictional confirmation fixture",
      isLatestVersion: true,
      enableESignature: true,
      signingToken: "confirmation-signature-token",
      clientSignedAt: null,
      updatedAt: reviewedAt,
      esigIncludeContract: false,
      esigIncludeImages: false,
      lineItems: [{ id: 1, quoteId: 123, description: "Fictional scope", quantity: "1", unitPrice: "1000" }],
      account: { name: "Fictional Customer", email: "fixture@example.invalid" },
    };
    mockStorage.getQuoteBySigningToken.mockResolvedValue(reviewedQuote);
    mockStorage.updateQuote.mockResolvedValue({ id: 123 });
    mockStorage.claimEmailDelivery.mockResolvedValue({ outcome: "claimed", attempt: { id: 77 } });
    mockStorage.markEmailDeliverySent.mockResolvedValue({ id: 77, status: "sent" });
    mockSendEmail.mockResolvedValue({ id: "fixture-provider-id" });
    const reviewedPackage = buildPublicSigningQuote(reviewedQuote);

    const response = await request(makeApp())
      .post("/api/signatures/confirmation-signature-token/sign")
      .send({
        signerType: "client",
        signatureData: { type: "type", imageData: "Fictional Customer", name: "Fictional Customer" },
        customerPackageFingerprint: reviewedPackage.customerPackageFingerprint,
      })
      .expect(200);

    expect(response.body.emailSent).toBe(true);
    expect(mockStorage.claimEmailDelivery).toHaveBeenCalledWith({
      idempotencyKey: expect.stringMatching(/^quote-signature-confirmation:123:[a-f0-9]{64}$/),
      messageType: "quote_signature_confirmation",
      quoteId: 123,
      planningAgreementId: null,
    });
    expect(mockStorage.markEmailDeliverySent).toHaveBeenCalledWith(77, expect.any(Date), "fixture-provider-id");
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  it("keeps a recorded signature successful when its confirmation receipt fails", async () => {
    const reviewedAt = new Date("2026-07-10T11:59:00.000Z");
    const reviewedQuote = {
      id: 123,
      quoteNumber: "TEST-123",
      isLatestVersion: true,
      enableESignature: true,
      signingToken: "failed-confirmation-token",
      clientSignedAt: null,
      updatedAt: reviewedAt,
      esigIncludeContract: false,
      esigIncludeImages: false,
      lineItems: [{ id: 1, quoteId: 123, description: "Fictional scope", quantity: "1", unitPrice: "1000" }],
      account: { name: "Fictional Customer", email: "fixture@example.invalid" },
    };
    mockStorage.getQuoteBySigningToken.mockResolvedValue(reviewedQuote);
    mockStorage.updateQuote.mockResolvedValue({ id: 123 });
    mockStorage.claimEmailDelivery.mockResolvedValue({ outcome: "claimed", attempt: { id: 78 } });
    mockStorage.markEmailDeliveryFailed.mockResolvedValue({ id: 78, status: "failed" });
    mockSendEmail.mockRejectedValue(new Error("private provider detail"));
    const reviewedPackage = buildPublicSigningQuote(reviewedQuote);

    const response = await request(makeApp())
      .post("/api/signatures/failed-confirmation-token/sign")
      .send({
        signerType: "client",
        signatureData: { type: "type", imageData: "Fictional Customer", name: "Fictional Customer" },
        customerPackageFingerprint: reviewedPackage.customerPackageFingerprint,
      })
      .expect(200);

    expect(response.body).toMatchObject({ success: true, emailSent: false });
    expect(mockStorage.updateQuote).toHaveBeenCalledWith(123, expect.objectContaining({ clientSignedAt: expect.any(Date) }), expect.any(Object));
    expect(mockStorage.markEmailDeliveryFailed).toHaveBeenCalledWith(78, "Error");
  });

  it("rejects signing when the customer did not submit the reviewed revision", async () => {
    const reviewedAt = new Date("2026-07-10T11:59:00.000Z");
    mockStorage.getQuoteBySigningToken.mockResolvedValue({
      id: 123,
      quoteNumber: "TEST-123",
      isLatestVersion: true,
      enableESignature: true,
      updatedAt: reviewedAt,
      lineItems: [{ id: 1, quoteId: 123, description: "Scope", quantity: "1", unitPrice: "100" }],
      esigIncludeContract: false,
      esigIncludeImages: false,
    });

    const response = await request(makeApp())
      .post("/api/signatures/reviewed-signature-token/sign")
      .send({
        signerType: "client",
        signatureData: { type: "type", imageData: "Customer", name: "Customer" },
      })
      .expect(409);

    expect(response.body).toEqual({
      message: "This quote changed after it was opened for approval. Refresh and review the latest version before signing.",
      code: "QUOTE_CHANGED_BEFORE_SIGNATURE",
    });
    expect(mockStorage.updateQuote).not.toHaveBeenCalled();
  });

  it("rejects signing after the reviewed customer package changes", async () => {
    const currentQuote = {
      id: 123,
      quoteNumber: "TEST-123",
      isLatestVersion: true,
      enableESignature: true,
      updatedAt: new Date("2026-07-10T12:05:00.000Z"),
      lineItems: [{ id: 1, quoteId: 123, description: "Changed scope", quantity: "1", unitPrice: "200" }],
      esigIncludeContract: false,
      esigIncludeImages: false,
    };
    mockStorage.getQuoteBySigningToken.mockResolvedValue(currentQuote);

    const response = await request(makeApp())
      .post("/api/signatures/reviewed-signature-token/sign")
      .send({
        signerType: "client",
        signatureData: { type: "type", imageData: "Customer", name: "Customer" },
        customerPackageFingerprint: "a".repeat(64),
      })
      .expect(409);

    expect(response.body.code).toBe("QUOTE_CHANGED_BEFORE_SIGNATURE");
    expect(mockStorage.updateQuote).not.toHaveBeenCalled();
  });

  it("does not reconfirm or overwrite a recorded payment", async () => {
    mockStorage.getPlanningAgreement.mockResolvedValue({
      id: 88,
      status: "paid_active",
      amount: "1500.00",
      paymentConfirmedAt: new Date("2026-01-02T12:00:00.000Z"),
    });

    const response = await request(makeApp())
      .post("/api/planning-agreements/88/confirm-payment")
      .send({ verified: true, paymentMethod: "check", paymentReference: "duplicate" })
      .expect(409);

    expect(response.body).toEqual({
      message: "Payment has already been confirmed for this planning agreement.",
    });
    expect(mockStorage.updatePlanningAgreement).not.toHaveBeenCalled();
  });

  it("does not mark unpaid planning work delivered", async () => {
    mockStorage.getPlanningAgreement.mockResolvedValue({
      id: 88,
      status: "signed_awaiting_payment",
      paymentConfirmedAt: null,
    });

    const response = await request(makeApp())
      .post("/api/planning-agreements/88/mark-delivered")
      .send({})
      .expect(409);

    expect(response.body).toEqual({
      message: "Confirm payment before marking planning work delivered.",
    });
    expect(mockStorage.updatePlanningAgreement).not.toHaveBeenCalled();
  });

  it("does not delete a line item whose quote no longer exists", async () => {
    mockStorage.getLineItem.mockResolvedValue({ id: 7, quoteId: 55 });
    mockStorage.quoteExists.mockResolvedValue(false);

    await request(makeApp())
      .delete("/api/line-items/7")
      .expect(404);

    expect(mockStorage.deleteLineItem).not.toHaveBeenCalled();
  });

  it("does not delete a group whose quote no longer exists", async () => {
    mockStorage.getGroup.mockResolvedValue({ id: "group-7", quoteId: 55 });
    mockStorage.quoteExists.mockResolvedValue(false);

    await request(makeApp())
      .delete("/api/groups/group-7")
      .expect(404);

    expect(mockStorage.deleteGroup).not.toHaveBeenCalled();
  });

  it("does not delete a quote image whose quote no longer exists", async () => {
    mockStorage.getQuoteCoverPhotoById.mockResolvedValue({ id: 7, quoteId: 55 });
    mockStorage.quoteExists.mockResolvedValue(false);

    await request(makeApp())
      .delete("/api/quote-images/cover-photo/7")
      .expect(404);

    expect(mockStorage.deleteQuoteCoverPhoto).not.toHaveBeenCalled();
  });
});
