import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("../storage", () => ({ storage: {} }));

import { isAuthenticated, requireAdmin } from "../auth";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

function responseDouble() {
  const response: any = {
    status: vi.fn(() => response),
    json: vi.fn(() => response),
  };
  return response;
}

describe("authorization policy", () => {
  it("requires a Workspace session for ordinary protected routes", () => {
    const response = responseDouble();
    const next = vi.fn();

    isAuthenticated({ isAuthenticated: () => false }, response, next);
    expect(response.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("protects the dealer portal catalog with its dedicated integration key", () => {
    const catalogRoutes = source("server/routes/dealerPortalCatalogRoutes.ts");
    expect(catalogRoutes).toContain("DEALER_PORTAL_INTEGRATION_KEY");
    expect(catalogRoutes).toContain('timingSafeEqual(configuredBuffer, suppliedBuffer)');
  });

  it("permits only administrators through the admin guard", () => {
    const deniedResponse = responseDouble();
    const deniedNext = vi.fn();
    requireAdmin({ user: { role: "user" } }, deniedResponse, deniedNext);
    expect(deniedResponse.status).toHaveBeenCalledWith(403);
    expect(deniedNext).not.toHaveBeenCalled();

    const allowedNext = vi.fn();
    requireAdmin({ user: { role: "admin" } }, responseDouble(), allowedNext);
    expect(allowedNext).toHaveBeenCalledOnce();
  });

  it("protects whole-record quote and account deletion with the admin guard", () => {
    const quoteRoutes = source("server/routes/quoteRoutes.ts");
    const accountRoutes = source("server/routes/accountRoutes.ts");

    expect(quoteRoutes).toContain('app.delete("/api/quotes/:id", isAuthenticated, requireAdmin');
    expect(accountRoutes).toContain('app.delete("/api/accounts/:id", isAuthenticated, requireAdmin');
    expect(accountRoutes).toContain('app.delete("/api/clients/:id", isAuthenticated, requireAdmin');
  });

  it("limits historical quote version overrides to administrators", () => {
    const quoteRoutes = source("server/routes/quoteRoutes.ts");
    const quoteBuilder = source("client/src/pages/quote-builder.tsx");

    expect(quoteRoutes).toContain('app.post("/api/quotes/:id/use-version", isAuthenticated, requireAdmin');
    expect(quoteBuilder).toContain('const isAdmin = user?.role === "admin"');
    expect(quoteBuilder).toContain("{isArchivedVersion && isAdmin && (");
    expect(quoteBuilder).toContain("{!versionIsCurrent && isAdmin && (");
    expect(quoteBuilder).toContain("Ask an administrator to make it current");
  });

  it("hides whole-record delete controls from non-admin users", () => {
    const quotesPage = source("client/src/pages/quotes.tsx");
    const accountsPage = source("client/src/pages/accounts.tsx");

    expect(quotesPage).toContain('user?.role === "admin" && <AlertDialog>');
    expect(accountsPage).toContain('user?.role === "admin" && <AlertDialog>');
  });

  it("removes owner-confirmed dead visible controls", () => {
    expect(source("client/src/components/app-header.tsx")).not.toContain("<Bell");
    expect(source("client/src/components/quote-header.tsx")).not.toContain("Send to Ops");
    expect(source("client/src/components/quote-header.tsx")).not.toContain('label: "Ops"');
    expect(source("client/src/pages/pipeline.tsx")).not.toContain("filterRep");
    expect(source("client/src/components/pipeline-card.tsx")).not.toContain("Rep feature disabled");
    expect(source("client/src/pages/contracts.tsx")).not.toContain("/admin/templates");
    expect(source("client/src/pages/not-found.tsx")).not.toContain("Did you forget to add the page to the router?");
    for (const path of [
      "client/src/components/quote-header.tsx",
      "client/src/components/quote-summary.tsx",
      "client/src/pages/quote-builder.tsx",
      "client/src/pages/products.tsx",
    ]) {
      expect(source(path)).not.toMatch(/\bOps\b/);
    }
  });

  it("applies the central admin guard to privileged settings and import routes", () => {
    const appRoutes = source("server/routes.ts");

    expect(appRoutes).toContain("app.put('/api/pricing-defaults/sundance', isAuthenticated, requireAdmin");
    expect(appRoutes).toContain("app.get('/api/storage/usage', isAuthenticated, requireAdmin");
    expect(appRoutes).toContain("app.get('/api/admin/users', isAuthenticated, requireAdmin");
    expect(appRoutes).toContain("app.put('/api/admin/users/:id', isAuthenticated, requireAdmin");
    expect(appRoutes).toContain("app.delete('/api/admin/users/:id', isAuthenticated, requireAdmin");
    expect(appRoutes).toContain("app.post('/api/admin/import-csv-products', isAuthenticated, requireAdmin");
    expect(appRoutes).toContain("app.post('/api/admin/analyze-price-sheet', isAuthenticated, requireAdmin");
    expect(appRoutes).toContain("app.post('/api/admin/import-products-ai', isAuthenticated, requireAdmin");
    expect(appRoutes).toContain("app.post('/api/admin/bulk-update-products', isAuthenticated, requireAdmin");
  });

  it("allows authenticated template reads and limits template administration to administrators", () => {
    const appRoutes = source("server/routes.ts");

    expect(appRoutes).toContain("app.get('/api/contract-templates', isAuthenticated, async");
    expect(appRoutes).toContain("app.get('/api/contract-templates/:id', isAuthenticated, async");
    expect(appRoutes).toContain("app.post('/api/contract-templates', isAuthenticated, requireAdmin");
    expect(appRoutes).toContain("app.put('/api/contract-templates/:id', isAuthenticated, requireAdmin");
    expect(appRoutes).toContain("app.delete('/api/contract-templates/:id', isAuthenticated, requireAdmin");
  });

  it("keeps payment actions authenticated and auditable", () => {
    const planningRoutes = source("server/routes/planningAgreementRoutes.ts");

    expect(planningRoutes).toContain('app.post("/api/planning-agreements/:id/confirm-payment", isAuthenticated, requireAdmin');
    expect(planningRoutes).toContain('"payment_confirmed"');
    expect(planningRoutes).toContain("paymentConfirmedBy: actorUserId");
  });

  it("removes the retired Ops endpoint and integration", () => {
    const quoteRoutes = source("server/routes/quoteRoutes.ts");

    expect(quoteRoutes).not.toContain("send-to-ops");
    expect(quoteRoutes).not.toContain("sendQuoteToOperations");
  });

  it("requires authentication before customer email actions", () => {
    const quoteRoutes = source("server/routes/quoteRoutes.ts");
    const planningRoutes = source("server/routes/planningAgreementRoutes.ts");

    expect(quoteRoutes).toContain('app.post("/api/quotes/:id/send-signature-email", isAuthenticated');
    expect(planningRoutes).toContain('app.post("/api/planning-agreements/:id/send-signature-email", isAuthenticated, requireAdmin');
    expect(planningRoutes).toContain('app.post("/api/planning-agreements/:id/send", isAuthenticated, requireAdmin');
  });

  it("keeps the delivery integration key-gated and limits its write to an idempotent shipment email", () => {
    const routes = source("server/routes/deliveryIntegrationRoutes.ts");
    const appRoutes = source("server/routes.ts");

    expect(appRoutes).toContain("registerDeliveryIntegrationRoutes(app)");
    expect(routes).toContain('app.get("/api/integrations/delivery-bom"');
    expect(routes).toContain('app.post("/api/integrations/delivery-shipment-ready"');
    expect(routes).toContain('req.get("x-edg-integration-key")');
    expect(routes).toContain("DELIVERY_CHECK_INTEGRATION_KEY");
    expect(routes).toContain('requireEmailIdempotencyKey(req.get("Idempotency-Key"))');
    expect(routes).toContain('messageType: "delivery_shipment_ready"');
    expect(routes).toContain('const { sendEmail } = await import("../email")');
    expect(routes).not.toContain("app.patch");
    expect(routes).not.toContain("app.put");
    expect(routes).not.toContain("app.delete");
    expect(routes).not.toContain("unitPrice:");
    expect(routes).not.toContain("retailPrice:");
  });

  it("makes retryable customer email actions idempotent and auditable", () => {
    const quoteRoutes = source("server/routes/quoteRoutes.ts");
    const planningRoutes = source("server/routes/planningAgreementRoutes.ts");
    const quoteSummary = source("client/src/components/quote-summary.tsx");
    const storage = source("server/storage.ts");
    const schema = source("shared/schema.ts");
    const migration = source("migrations/0029_add_email_delivery_attempts.sql");

    for (const routeSource of [quoteRoutes, planningRoutes]) {
      expect(routeSource).toContain('requireEmailIdempotencyKey(req.get("Idempotency-Key"))');
      expect(routeSource).toContain("storage.claimEmailDelivery");
      expect(routeSource).toContain("storage.markEmailDeliverySent");
      expect(routeSource).toContain("storage.markEmailDeliveryFailed");
    }
    expect(quoteSummary).toContain('headers: { "Idempotency-Key": idempotencyKey }');
    expect(quoteSummary).toContain("crypto.randomUUID()");
    expect(storage).toContain("async claimEmailDelivery");
    expect(storage).toContain("onConflictDoNothing");
    expect(schema).toContain('pgTable("email_delivery_attempts"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "email_delivery_attempts"');
  });

  it("keeps email reconciliation redacted and gates failed confirmation recovery", () => {
    const routes = source("server/routes/emailDeliveryRoutes.ts");
    const storage = source("server/storage.ts");
    const admin = source("client/src/pages/admin.tsx");
    const healthCard = source("client/src/components/email-delivery-health-card.tsx");

    expect(routes).toContain('app.get("/api/admin/email-delivery-health", isAuthenticated, requireAdmin');
    expect(routes).toContain('app.post("/api/admin/email-delivery-attempts/:id/retry-confirmation", isAuthenticated, requireAdmin');
    expect(routes).toContain('attempt.messageType !== "quote_signature_confirmation"');
    expect(routes).toContain('attempt.status !== "failed"');
    expect(routes).toContain("attempt.idempotencyKey !== expectedKey");
    expect(routes).not.toContain("app.patch");
    expect(routes).not.toContain("app.delete");
    expect(storage).toContain("async getEmailDeliveryHealth");
    expect(storage).toContain("staleAfterMinutes ?? 15");
    expect(admin).toContain("<EmailDeliveryHealthCard />");
    expect(healthCard).toContain("Approval requests have no resend action");
    expect(healthCard).toContain('attempt.status === "failed" && attempt.messageType === "quote_signature_confirmation"');
    expect(healthCard).toContain("Send one replacement confirmation receipt?");
    expect(healthCard).not.toContain("Idempotency-Key");
    expect(healthCard).not.toContain("recipientEmail");
    expect(healthCard).not.toContain("sendEmail");
  });

  it("uses append-only minimized events and never treats zero as historical non-use", () => {
    const schema = source("shared/schema.ts");
    const migration = source("migrations/0030_add_business_events.sql");
    const routes = source("server/routes/businessEventRoutes.ts");
    const events = source("server/businessEvents.ts");
    const adoptionCard = source("client/src/components/adoption-summary-card.tsx");
    const admin = source("client/src/pages/admin.tsx");
    const productImport = source("server/productCatalogImport.ts");
    const configuredInsertion = source("server/configuredProductInsertion.ts");

    expect(schema).toContain('pgTable("business_events"');
    expect(schema).not.toMatch(/businessEvents[\s\S]{0,1600}(?:payload|metadata|email|filename|dimension|price|signingToken)/);
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "business_events"');
    expect(routes).toContain('app.get("/api/admin/adoption-summary", isAuthenticated, requireAdmin');
    expect(routes).not.toContain("app.post");
    expect(events).toContain('"customer_package_prepared"');
    expect(events).toContain('"quote_import_completed"');
    expect(events).toContain('"dimensional_price_resolved"');
    expect(events).toContain('"product_catalog_import_completed"');
    expect(events).toContain('"sundance_configuration_inserted"');
    expect(productImport).toContain("return db.transaction");
    expect(productImport).toContain("product_catalog_import_completed:${data.importRequestId}");
    expect(configuredInsertion).toContain("return db.transaction");
    expect(configuredInsertion).toContain("sundance_configuration_inserted:${quoteId}:${data.requestId}");
    expect(configuredInsertion).not.toContain("filename");
    expect(configuredInsertion).not.toContain("signingToken");
    expect(adoptionCard).toContain("A zero means no event was recorded in this window; it does not prove the feature was historically unused.");
    expect(adoptionCard).toContain("never customer content, filenames, dimensions, prices, signing tokens, or email addresses");
    expect(admin).toContain("<AdoptionSummaryCard />");
  });

  it("keeps the primary Rainmaker logo legible in both themes", () => {
    const header = source("client/src/components/app-header.tsx");
    expect(header).toContain('aria-label="EDG Rainmaker — primary logo"');
    expect(header).toContain('className="fill-[#0b1115] dark:fill-white"');
    expect(header).toContain('dark:fill-[#aab4c0]');
    expect(header).not.toContain('aria-label="EDG Rainmaker — primary logo (light)"');
  });

  it("keeps the product workspace on theme-aware surfaces", () => {
    const products = source("client/src/pages/products.tsx");
    expect(products).toContain('className="min-h-screen bg-background text-foreground"');
    expect(products).not.toContain('className="min-h-screen bg-gray-50"');
    expect(products).toContain('className="border-border bg-card"');
    expect(products).toContain('className="w-full sm:w-48"');
    expect(products).toContain('aria-label="Table view"');
    expect(products).toContain('aria-label="Grid view"');
  });

  it("keeps the pipeline board on theme-aware surfaces", () => {
    const pipeline = source("client/src/pages/pipeline.tsx");
    expect(pipeline).toContain('className="min-h-screen bg-background text-foreground"');
    expect(pipeline).not.toContain('className="min-h-screen bg-gray-50"');
    expect(pipeline).toContain("bg-muted/30 p-2");
  });

  it("keeps pipeline stage changes recoverable", () => {
    const pipeline = source("client/src/pages/pipeline.tsx");
    const quoteRoutes = source("server/routes/quoteRoutes.ts");

    expect(pipeline).toContain('data-testid="pipeline-stage-undo"');
    expect(pipeline).toContain('data-testid="button-undo-pipeline-stage"');
    expect(pipeline).toContain("previousDealStage");
    expect(pipeline).toContain("isUndo: true");
    expect(quoteRoutes).toContain("lostReason: deal_stage === 'closed_lost' ? lost_reason : null");
  });

  it("keeps client rows readable and keyboard-navigable in both themes", () => {
    const accounts = source("client/src/pages/accounts.tsx");
    expect(accounts).toContain("hover:bg-muted/50");
    expect(accounts).toContain('className="text-sm font-medium text-foreground"');
    expect(accounts).toContain('href={`/accounts/${account.id}`}');
    expect(accounts).toContain("focus-visible:ring-2 focus-visible:ring-ring");
  });

  it("isolates customer signing pages from the staff theme preference", () => {
    const hook = source("client/src/hooks/use-public-light-theme.ts");
    const quoteSign = source("client/src/pages/public-sign.tsx");
    const planningSign = source("client/src/pages/public-planning-agreement-sign.tsx");
    expect(hook).toContain('root.classList.remove("dark")');
    expect(hook).toContain('root.classList.add("light")');
    expect(hook).toContain('if (hadDark) root.classList.add("dark")');
    expect(quoteSign).toContain("usePublicLightTheme();");
    expect(planningSign).toContain("usePublicLightTheme();");
  });

  it("limits retired planning-record resolution and finance actions to administrators", () => {
    const planningRoutes = source("server/routes/planningAgreementRoutes.ts");
    for (const route of [
      'app.patch("/api/planning-agreements/:id", isAuthenticated, requireAdmin',
      'app.post("/api/planning-agreements/:id/prepare-signing", isAuthenticated, requireAdmin',
      'app.post("/api/planning-agreements/:id/mark-signed", isAuthenticated, requireAdmin',
      'app.post("/api/planning-agreements/:id/confirm-payment", isAuthenticated, requireAdmin',
      'app.post("/api/planning-agreements/:id/waive", isAuthenticated, requireAdmin',
      'app.post("/api/planning-agreements/:id/mark-delivered", isAuthenticated, requireAdmin',
      'app.post("/api/planning-agreements/:id/apply-credit", isAuthenticated, requireAdmin',
    ]) {
      expect(planningRoutes).toContain(route);
    }
    expect(planningRoutes).toContain('app.post("/api/planning-agreement-signatures/:token/sign", async');
  });

  it("does not misrepresent shared-workspace existence checks as quote ownership", () => {
    const storage = source("server/storage.ts");
    const contract = source("server/storageContract.ts");
    const quoteRoutes = source("server/routes/quoteRoutes.ts");
    const lineItemRoutes = source("server/routes/lineItemRoutes.ts");

    for (const sourceText of [storage, contract, quoteRoutes, lineItemRoutes]) {
      expect(sourceText).not.toContain("validateQuoteOwnership");
      expect(sourceText).not.toContain("validateLineItemsOwnership");
    }
    expect(storage).toContain("async quoteExists(quoteId: number)");
    expect(storage).toContain("async validateLineItemSelection(lineItemIds: number[])");
    expect(lineItemRoutes).toContain("Line items must exist and belong to the same quote");
  });

  it("protects storage mutation and proxy routes", () => {
    const imageRoutes = source("server/routes/imageRoutes.ts");
    const quoteRoutes = source("server/routes/quoteRoutes.ts");

    expect(imageRoutes).toContain('app.post("/api/images/upload-url", isAuthenticated');
    expect(imageRoutes).toContain('app.post("/api/images/finalize-upload", isAuthenticated');
    expect(imageRoutes).toContain('app.get("/api/image-proxy", isAuthenticated');
    expect(quoteRoutes).toContain('app.post("/api/quotes/:quoteId/cover-photos", isAuthenticated');
    expect(quoteRoutes).toContain('app.post("/api/quotes/:quoteId/product-renderings", isAuthenticated');
    expect(quoteRoutes).toContain('app.delete("/api/quote-images/product-rendering/:imageId", isAuthenticated');
  });

  it("uses the canonical image route and reports customer-package removal failures", () => {
    const packageBuilder = source("client/src/components/esignature-options-modal.tsx");

    expect(packageBuilder).toContain("`/api/quote-images/product-rendering/${renderingId}`");
    expect(packageBuilder).not.toContain("`/api/quotes/${quote.id}/product-renderings/${renderingId}`");
    expect(packageBuilder).toContain('title: "Remove failed"');
    expect(packageBuilder).toContain("disabled={deleteRenderingMutation.isPending}");
    expect(packageBuilder).toContain('aria-label={`Remove ${rendering.name}`}');
  });

  it("supports both drag-and-drop and picker uploads for quote visuals", () => {
    const packageBuilder = source("client/src/components/esignature-options-modal.tsx");

    expect(packageBuilder).toContain('data-testid="quote-visuals-drop-zone"');
    expect(packageBuilder).toContain("onDragOver={handleDragOver}");
    expect(packageBuilder).toContain("onDragLeave={handleDragLeave}");
    expect(packageBuilder).toContain("onDrop={handleDrop}");
    expect(packageBuilder).toContain("handleFileUpload(event.dataTransfer.files)");
    expect(packageBuilder).toContain("handleFileUpload(event.target.files)");
    expect(packageBuilder).toContain('event.target.value = ""');
    expect(packageBuilder).toContain("Click or drag and drop proposal visuals");
  });

  it("rate limits public signing surfaces and keeps retired issue reporting unavailable", () => {
    const appSource = source("server/app.ts");
    expect(appSource).toContain('app.use("/api/signatures", publicActionLimiter)');
    expect(appSource).toContain('app.use("/api/planning-agreement-signatures", publicActionLimiter)');
    expect(appSource).not.toContain('"/api/issue-reports"');
    expect(source("server/routes.ts")).not.toContain("/api/issue-reports");
    expect(source("client/src/App.tsx")).not.toContain("ReportIssueButton");
  });

  it("fails customer document generation visibly when an included visual cannot load", () => {
    const signedPdf = source("client/src/lib/generate-signed-pdf.ts");
    expect(signedPdf).toContain("normalizedImages = await Promise.all");
    expect(signedPdf).toContain("included proposal visuals could not be loaded");
    expect(signedPdf).toContain("included proposal cover image could not be loaded");
  });

  it("uses one customer package builder for preview and approval", () => {
    const quoteBuilder = source("client/src/pages/quote-builder.tsx");
    const quoteList = source("client/src/pages/quotes.tsx");
    const quoteSummary = source("client/src/components/quote-summary.tsx");
    const packageBuilder = source("client/src/components/esignature-options-modal.tsx");

    expect(quoteBuilder).not.toContain("SimpleProposalGenerator");
    expect(quoteList).not.toContain("SimpleProposalGenerator");
    expect(quoteSummary).toContain('data-testid="button-build-customer-package"');
    expect(packageBuilder).toContain("Customer Package Builder");
    expect(packageBuilder).toContain('data-testid="button-download-customer-package"');
    expect(packageBuilder).toContain('data-testid="button-generate-signing-link"');
    expect(packageBuilder).toContain("generateSignedPDF");
  });

  it("preserves line source identity and requires explicit deletion confirmation", () => {
    const lineItems = source("client/src/components/line-items-table.tsx");
    const lineRow = source("client/src/components/sortable-line-item-row.tsx");
    const groups = source("client/src/components/group-components.tsx");
    const schema = source("shared/schema.ts");

    expect(lineItems).toContain("productId: newItem.productId");
    expect(lineItems).toContain("groupId: newItemTargetGroupId");
    expect(lineItems).toContain("KeyboardSensor");
    expect(lineItems).toContain("sortableKeyboardCoordinates");
    expect(lineRow).toContain("Delete this line item?");
    expect(lineRow).toContain("button-confirm-delete-${item.id}");
    expect(groups).toContain("will be preserved as ungrouped quote items");
    expect(groups).toContain("button-confirm-delete-group-${group.id}");
    expect(schema).toContain('priceSource: text("price_source")');
    expect(schema).toContain('sourceMetadata: jsonb("source_metadata")');
  });

  it("fails dimensional pricing closed and replaces tables transactionally", () => {
    const pricing = source("server/pricingBands.ts");
    const storage = source("server/storage.ts");
    const routes = source("server/routes/productRoutes.ts");
    const manager = source("client/src/components/dimensional-pricing-manager.tsx");
    const lineItems = source("client/src/components/line-items-table.tsx");

    expect(pricing).toContain("No exact pricing band covers these dimensions");
    expect(pricing).toContain("matches.length > 1");
    expect(storage).toContain("selectPricingBand(pricingTablesForProduct, length, width)");
    expect(storage).not.toContain("closestTable");
    expect(storage).toContain("async replacePricingTablesForProduct");
    expect(routes).toContain("storage.replacePricingTablesForProduct");
    expect(manager).toContain('sourceUnit: "feet"');
    expect(lineItems).toContain('sourceUnit: "feet"');
  });

  it("uses one transactional quote import boundary with explicit target and price semantics", () => {
    const quoteRoutes = source("server/routes/quoteRoutes.ts");
    const importService = source("server/quoteImport.ts");
    const importer = source("client/src/components/quote-importer.tsx");

    expect(quoteRoutes).toContain("executeQuoteImport(importData, getActorUserId(req) ?? undefined)");
    expect(quoteRoutes).not.toContain("handleCustomerAttachment");
    expect(importService).toContain("return await db.transaction");
    expect(importService).toContain("An explicit selection always wins");
    expect(importService).toContain('priceSource: options.priceMeaning === "edg_cost" ? "import_edg_cost" : "import_customer_price"');
    expect(importService).toContain("assertQuoteMutationAllowed(targetQuote)");
    expect(importer).toContain("updatePDFLineItem");
    expect(importer).toContain("This selection overrides any client name or email extracted from the PDFs.");
    expect(importer).toContain("Extracted Price Meaning");
  });

  it("preserves inquiry history and uses current-family dashboard/account truth", () => {
    const leadRoutes = source("server/routes/leadIntakeRoutes.ts");
    const leadPersistence = source("server/leadIntakePersistence.ts");
    const bundledLeadIntake = source("server/leadIntakeHandler.ts");
    const vercelHandler = source("server/vercelHandler.ts");
    const attributionRoutes = source("server/routes/marketingAttributionRoutes.ts");
    const conversion = source("server/inquiryConversion.ts");
    const quoteBuilder = source("client/src/pages/quote-builder.tsx");
    const leads = source("client/src/pages/leads.tsx");
    const accountRoutes = source("server/routes/accountRoutes.ts");
    const accounts = source("client/src/pages/accounts.tsx");
    const home = source("client/src/pages/home.tsx");

    expect(leadRoutes).toContain("preserveAccountAndCreateInquiry");
    expect(leadPersistence).toContain(".insert(leadInquiries)");
    expect(leadPersistence).not.toContain(".set({ ...accountData, updatedAt: new Date() })");
    expect(bundledLeadIntake).toContain("preserveAccountAndCreateInquiry");
    expect(bundledLeadIntake).toContain("submissionId,");
    expect(vercelHandler).toContain('import("./leadIntakeHandler")');
    expect(vercelHandler).not.toContain('../api/lead-intake');
    expect(existsSync(resolve(process.cwd(), "api/lead-intake.ts"))).toBe(false);
    expect(attributionRoutes).toContain('"/api/marketing/lead-attribution"');
    expect(attributionRoutes).toContain("leadInquiries.submissionId");
    expect(attributionRoutes).toContain("summarizeMarketingAttribution");
    expect(attributionRoutes).toContain("containsCustomerPii: false");
    expect(conversion).toContain("INQUIRY_ALREADY_CONVERTED");
    expect(conversion).toContain("convertedQuoteId: quote.id");
    expect(quoteBuilder).toContain('newQuoteSearch?.get("inquiryId")');
    expect(quoteBuilder).toContain("quote={displayedQuote}");
    expect(quoteBuilder).toContain('aria-label="Quote sections"');
    expect(quoteBuilder).toContain('href="#quote-line-items"');
    expect(quoteBuilder).toContain('id="quote-review"');
    expect(leads).toContain("button-create-quote-${lead.inquiryId}");
    expect(accountRoutes).toContain('app.get("/api/accounts/summary"');
    expect(accountRoutes).toContain("quotes.is_latest_version = true");
    expect(accounts).toContain("debouncedSearchTerm");
    expect(accounts).toContain("Current Quote Families");
    expect(home).toContain("quote.isLatestVersion !== false");
    expect(home).toContain("q.dealStageChangedAt");
    expect(home).toContain("Est. Gross Profit — Won");
    expect(home).not.toContain("Profit This Month");
  });

  it("keeps the quote editor keyboard-navigable and announces errors and save state", () => {
    const quoteBuilder = source("client/src/pages/quote-builder.tsx");
    const quoteHeader = source("client/src/components/quote-header.tsx");
    const lineItems = source("client/src/components/line-items-table.tsx");
    const lineRow = source("client/src/components/sortable-line-item-row.tsx");
    const groups = source("client/src/components/group-components.tsx");
    const importer = source("client/src/components/quote-importer.tsx");
    const appHeader = source("client/src/components/app-header.tsx");
    const clientCombobox = source("client/src/components/client-combobox-with-create.tsx");
    const quoteSummary = source("client/src/components/quote-summary.tsx");
    const publicSign = source("client/src/pages/public-sign.tsx");
    const accessibilityAudit = source("scripts/audit-browser-accessibility.mjs");
    const ciWorkflow = source(".github/workflows/ci.yml");
    const quotes = source("client/src/pages/quotes.tsx");

    expect(quoteBuilder).toContain('className="sticky top-0 z-30');
    expect(quoteBuilder).toContain("min-h-11");
    expect(quoteHeader).toContain('data-testid="quote-form-error-summary"');
    expect(quoteHeader).toContain('role="alert"');
    expect(quoteHeader).toContain('projectName: z.string().trim().min(1, "Project name is required")');
    expect(quoteHeader).toContain('data-testid="quote-save-status"');
    expect(quoteHeader).toContain('aria-live="polite"');
    expect(quoteHeader).toContain('<h1 className="text-2xl font-bold text-foreground">');
    expect(quoteHeader).toContain('ariaLabel="Search for jobsite address"');
    expect(quoteHeader).toContain('aria-label="Pipeline stage"');
    expect(quoteHeader).toContain('htmlFor="estimated-start-date"');
    expect(clientCombobox).toContain('aria-label="Client"');
    expect(clientCombobox).toContain('<span className="min-w-0 truncate">{displayName}</span>');
    expect(quoteSummary).toContain('aria-label="Contract template"');
    expect(publicSign).toContain('"Enter fullscreen proposal view"');
    expect(lineItems).toContain('aria-label="Search product catalog"');
    expect(lineItems).toContain('aria-label="Quote line items table; scroll horizontally for all pricing columns"');
    expect(lineItems).toContain('data-testid={`product-card-${product.id}`}');
    expect(lineRow).toContain('aria-label={`Delete ${item.description || "line item"}`}');
    expect(lineRow).toContain('aria-label={`${item.description || "Line item"} quantity`}');
    expect(lineRow).toContain('aria-label={`${item.description || "Line item"} EDG cost`}');
    expect(groups).toContain('aria-label={`${group.isCollapsed ? "Expand" : "Collapse"} ${group.title}`}');
    expect(groups).toContain('aria-label={`Delete group ${group.title}`}');
    expect(importer).toContain('aria-pressed={selectedPDFId === pdf.id}');
    expect(appHeader).toContain('{ href: "/accounts", label: "Clients"');
    expect(appHeader).toContain('className="hidden xl:flex space-x-6"');
    expect(appHeader).toContain('className="xl:hidden overflow-x-auto');
    expect(accessibilityAudit).toContain('{ width: 390, height: 844 }');
    expect(accessibilityAudit).toContain('{ width: 768, height: 900 }');
    expect(accessibilityAudit).toContain('{ width: 1024, height: 900 }');
    expect(accessibilityAudit).toContain("globalThis.axe.run");
    expect(accessibilityAudit).toContain('page.keyboard.press("Tab")');
    expect(ciWorkflow).toContain("npm run audit:browser:a11y");
    expect(quotes).toContain("Active Clients");
    expect(quotes).toContain("Delete quote ${quote.quoteNumber}");
  });

  it("distinguishes core page-load failures from empty business data", () => {
    const errorAlert = source("client/src/components/error-alert.tsx");
    expect(errorAlert).toContain("export function PageLoadError");
    expect(errorAlert).toContain('data-testid="page-load-error"');
    expect(errorAlert).toContain('data-testid="button-retry-page-load"');

    for (const path of [
      "client/src/pages/home.tsx",
      "client/src/pages/leads.tsx",
      "client/src/pages/accounts.tsx",
      "client/src/pages/quotes.tsx",
      "client/src/pages/pipeline.tsx",
      "client/src/pages/products.tsx",
    ]) {
      expect(source(path)).toContain("<PageLoadError");
      expect(source(path)).toContain("refetch");
    }
    expect(source("scripts/serve-browser-fixtures.mjs")).toContain('["data-error", "admin-data-error"].includes(scenario)');
  });

  it("does not log routine customer payloads, search terms, email addresses, or filenames", () => {
    const accountRoutes = source("server/routes/accountRoutes.ts");
    const quoteRoutes = source("server/routes/quoteRoutes.ts");
    const lineItemRoutes = source("server/routes/lineItemRoutes.ts");
    const errorBoundary = source("client/src/components/error-boundary.tsx");

    for (const routeSource of [accountRoutes, quoteRoutes, lineItemRoutes]) {
      expect(routeSource).not.toContain("request body:");
      expect(routeSource).not.toContain("Raw request body:");
      expect(routeSource).not.toMatch(/console\.(?:log|error|warn)\([^\n]*(?:searchTerm|req\.body)/);
    }
    expect(quoteRoutes).not.toMatch(/console\.(?:log|error|warn)\([^\n]*(?:account\.email|file\.originalname)/);
    expect(errorBoundary).not.toContain("We've been notified");
  });

  it("adds supportable request IDs without logging public signing tokens", () => {
    const appSource = source("server/app.ts");
    const requestLogging = source("server/requestLogging.ts");
    const vercelEntry = source("api/index.ts");
    const vercelHandler = source("server/vercelHandler.ts");

    expect(appSource).toContain('res.setHeader("X-Request-Id", requestId)');
    expect(appSource).toContain('exposedHeaders: ["X-Request-Id"]');
    expect(appSource).toContain("redactedRequestPath(req.path)");
    expect(appSource).toContain("requestId,");
    expect(appSource).toContain("errorType: redactedErrorType(err)");
    expect(appSource).not.toContain('console.error("Unhandled request error:", err)');
    expect(requestLogging).toContain('return `${prefix}:token`');
    expect(requestLogging).toContain("planning-agreement-signatures");
    expect(vercelEntry).toContain('res.setHeader("X-Request-Id", randomUUID())');
    expect(vercelHandler).toContain('res.setHeader("X-Request-Id", randomUUID())');
  });

  it("keeps liveness independent and makes database readiness read only", () => {
    const database = source("server/db.ts");
    const appSource = source("server/app.ts");
    const vercelConfig = source("vercel.json");
    const buildOutput = source("scripts/bundle-vercel-function.mjs");
    const productionVerification = source("scripts/verify-production-deploy.mjs");

    expect(database).toContain("checkDatabaseReadiness");
    expect(database).toContain("information_schema.columns");
    expect(database).not.toMatch(/\b(?:ALTER|CREATE|DROP|TRUNCATE)\s+(?:TABLE|INDEX)\b/i);
    expect(appSource).toContain('app.get("/health"');
    expect(appSource).toContain('app.get("/ready"');
    expect(appSource).toContain("checkDatabaseReadiness()");
    expect(vercelConfig).toContain('"source": "/ready"');
    expect(buildOutput).toContain('{ src: "^/ready$"');
    expect(productionVerification).toContain('url: "https://rainmaker.edgpatioshade.com/ready"');
    expect(productionVerification).toContain('payload.status !== "ready"');
  });

  it("makes customer-approved quote content read only while preserving version recovery", () => {
    const quoteBuilder = source("client/src/pages/quote-builder.tsx");
    const quoteHeader = source("client/src/components/quote-header.tsx");
    const lineItems = source("client/src/components/line-items-table.tsx");
    const quoteSummary = source("client/src/components/quote-summary.tsx");

    expect(quoteBuilder).toContain('data-testid="signed-quote-read-only"');
    expect(quoteBuilder).toContain('data-testid="button-create-version-from-signed"');
    expect(quoteBuilder).toContain("isReadOnly={isCustomerApproved || isArchivedVersion}");
    expect(quoteHeader).toContain("<fieldset disabled={isReadOnly}");
    expect(quoteHeader).toContain("/api/quotes/${quote.id}/stage");
    expect(lineItems).toContain("<fieldset disabled={isReadOnly}");
    expect(quoteSummary).toContain('data-testid="button-build-customer-package"');
    expect(quoteSummary).not.toContain("toggleESignatureMutation");
    expect(quoteSummary).toContain("readOnly={isReadOnly}");
  });
});
