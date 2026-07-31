import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve } from "node:path";

const publicDirectory = resolve(process.cwd(), "dist/public");
if (!existsSync(resolve(publicDirectory, "index.html"))) {
  throw new Error("Build the application before starting browser fixtures: npm run build");
}

const port = Number(process.env.RAINMAKER_FIXTURE_PORT || 4174);
const host = "127.0.0.1";
let authRecoverAttempts = 0;
let fixtureQuoteVisuals = [];
const fixtureLeadUpdates = new Map();

const adminUser = {
  id: 9001,
  username: "fixture-admin",
  email: "admin@example.invalid",
  firstName: "Fixture",
  lastName: "Admin",
  role: "admin",
};
const normalUser = {
  id: 9002,
  username: "fixture-sales",
  email: "sales@example.invalid",
  firstName: "Fixture",
  lastName: "Sales",
  role: "user",
};
const account = {
  id: 9101,
  inquiryId: 9151,
  inquiryCount: 2,
  name: "Avery Example",
  company: "Example Hospitality Group - TEST ONLY",
  email: "avery@example.invalid",
  phone: "555-0100",
  accountType: "commercial",
};
const lineItems = [{
  id: 9201,
  quoteId: 9301,
  description: "Fictional shade structure",
  quantity: "1.00",
  unitPrice: "10000.00",
  markupType: "percentage",
  markupValue: "0.00",
  discountType: "percentage",
  discountValue: "0.00",
  isTaxable: true,
  isTariffApplicable: false,
  groupId: null,
  position: 0,
}];
const fixtureGroup = {
  id: "fixture-option-a",
  quoteId: 9301,
  title: "Fictional Option A",
  position: 0,
  isCollapsed: false,
  configData: null,
};
const fixtureProduct = {
  id: 9401,
  name: "Fictional Catalog Shade",
  sku: "TEST-CAT-9401",
  description: "TEST ONLY catalog product",
  manufacturer: "Fixture Manufacturer",
  category: "Shade",
  productType: "simple",
  retailPrice: "2500.00",
  costPrice: "1500.00",
  defaultDiscountType: "percentage",
  defaultDiscountValue: "40.00",
  unit: "each",
};
const fixtureConfigurableProduct = {
  ...fixtureProduct,
  id: 9402,
  name: "Fictional Dimensional Pergola",
  sku: "TEST-DIM-9402",
  category: "Pergola",
  productType: "configurable",
  minLength: "8.00",
  maxLength: "20.00",
  minWidth: "8.00",
  maxWidth: "20.00",
};
const fixtureSundanceProduct = {
  ...fixtureProduct,
  id: 9403,
  name: "Fictional Sundance Louver",
  sku: "TEST-SUN-9403",
  description: "TEST ONLY Sundance Builder part",
  manufacturer: "Sundance",
  category: "Louvers",
  retailPrice: "200.00",
  costPrice: "80.00",
  defaultDiscountValue: "60.00",
};
const quote = {
  id: 9301,
  quoteNumber: "TEST-Q-0001",
  projectName: "TEST ONLY - Fictional Courtyard Shade",
  accountId: account.id,
  sourceInquiryId: account.inquiryId,
  account,
  customer: account,
  lineItems,
  taxRate: "8.25",
  tariffRate: "0.00",
  discount: "0.00",
  shipping: "0.00",
  isShippingTaxable: false,
  dealStage: "quote_sent",
  dealStageChangedAt: "2026-07-10T13:00:00.000Z",
  enableESignature: true,
  esigIncludePricing: true,
  esigIncludeImages: false,
  esigIncludeContract: true,
  esigIncludeApprovalDrawing: false,
  signingToken: "test-token",
  clientSignatureData: null,
  clientSignedAt: null,
  companySignatureData: null,
  companySignedAt: null,
  parentQuoteId: null,
  versionNumber: 1,
  isLatestVersion: true,
  createdAt: "2026-07-10T13:00:00.000Z",
  updatedAt: "2026-07-10T13:00:00.000Z",
};
const signedQuote = {
  ...quote,
  clientSignatureData: { type: "type", imageData: "Fixture Customer", name: "Fixture Customer" },
  clientSignedAt: "2026-07-10T14:00:00.000Z",
  clientSignedIp: "192.0.2.10",
  signedDocumentSnapshot: {
    customerPackageVersion: 1,
    customerPackageFingerprint: "f".repeat(64),
    documentRevision: quote.updatedAt,
    packageIssues: [],
    id: quote.id,
    quoteNumber: quote.quoteNumber,
    projectName: quote.projectName,
    accountName: account.name,
    account,
    customer: account,
    lineItems,
    groups: [],
    productRenderings: [],
    taxRate: quote.taxRate,
    tariffRate: quote.tariffRate,
    discount: quote.discount,
    shipping: quote.shipping,
    isShippingTaxable: quote.isShippingTaxable,
    notes: "TEST ONLY - fictional public signing fixture.",
    customContractTerms: "No commercial obligation is created by this fixture.",
    esigIncludePricing: true,
    esigIncludeImages: false,
    esigIncludeContract: true,
    esigIncludeApprovalDrawing: false,
  },
  signatureAuditTrail: {
    documentFingerprint: "fictional-signed-document-fingerprint",
    entries: [{ event: "client_signed", signerName: "Fixture Customer", signedAt: "2026-07-10T14:00:00.000Z" }],
  },
};

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

function parseCookies(header = "") {
  return Object.fromEntries(header.split(";").map((part) => {
    const [key, ...value] = part.trim().split("=");
    return [key, decodeURIComponent(value.join("="))];
  }).filter(([key]) => key));
}

function json(response, status, value) {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(value));
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

function fixtureUser(scenario) {
  if (["admin", "admin-data-error"].includes(scenario)) return adminUser;
  if (["user", "signed", "empty", "not-found", "auth-recover", "quote-403", "quote-404", "quote-error", "data-error"].includes(scenario)) return normalUser;
  return null;
}

async function serveApi(request, response, pathname, scenario) {
  const fixtureQuote = scenario === "signed" ? signedQuote : quote;
  if (pathname === "/api/user") {
    if (scenario === "auth-error") {
      json(response, 503, { message: "Fictional authentication service error" });
      return;
    }
    if (scenario === "auth-recover" && authRecoverAttempts++ === 0) {
      json(response, 503, { message: "Fictional one-time authentication error" });
      return;
    }
    const user = fixtureUser(scenario);
    json(response, user ? 200 : 401, user || { message: "Unauthorized" });
    return;
  }

  if (["data-error", "admin-data-error"].includes(scenario) && [
    "/api/quotes",
    "/api/accounts",
    "/api/accounts/summary",
    "/api/leads",
    "/api/products",
    "/api/admin/email-delivery-health",
    "/api/admin/adoption-summary",
  ].includes(pathname)) {
    json(response, 503, { message: "Fictional local data-source failure" });
    return;
  }
  if (pathname === "/api/quotes") {
    if (request.method === "POST") {
      json(response, 201, {
        ...quote,
        id: 9399,
        quoteNumber: "TEST-Q-KEYBOARD-9399",
        projectName: "TEST ONLY - Keyboard Quote Readiness",
      });
      return;
    }
    json(response, 200, scenario === "empty" ? [] : [fixtureQuote]);
    return;
  }
  if (pathname === "/api/images/upload-url" && request.method === "POST") {
    json(response, 200, {
      uploadMode: "signed-url",
      uploadUrl: `http://${host}:${port}/api/fixture-quote-visual-upload`,
      objectPath: "product-renderings/test-only-dragged-quote-visual.svg",
      publicUrl: "/fixture-quote-visual.svg",
    });
    return;
  }
  if (pathname === "/api/fixture-quote-visual-upload" && request.method === "PUT") {
    response.writeHead(200, { "cache-control": "no-store" });
    response.end();
    return;
  }
  if (pathname === "/api/images/finalize-upload" && request.method === "POST") {
    json(response, 200, {
      success: true,
      objectPath: "product-renderings/test-only-dragged-quote-visual.svg",
      publicUrl: "/fixture-quote-visual.svg",
    });
    return;
  }
  if (pathname === "/api/leads") {
    const inquiry = (overrides) => ({
      ...account,
      submissionId: `fixture-submission-${overrides.inquiryId}`,
      storedLeadStatus: "new",
      leadSource: "website",
      leadProjectType: "Motorized pergola",
      leadMessage: "TEST ONLY fictional inquiry for local browser verification.",
      leadReceivedAt: "2026-07-31T13:00:00.000Z",
      projectCount: 1,
      convertedQuoteId: null,
      convertedQuoteNumber: null,
      assessmentOutcome: null,
      assessmentReason: null,
      gmailMessageId: null,
      gmailDraftUrl: null,
      archiveReason: null,
      attachments: [],
      leadAttachments: [],
      ...overrides,
    });
    const mutableInquiry = (overrides) => inquiry({
      ...overrides,
      ...(fixtureLeadUpdates.get(overrides.inquiryId) || {}),
    });
    json(response, 200, scenario === "empty" ? [] : [
      mutableInquiry({ inquiryId: 9154, leadStatus: "new", leadReceivedAt: "2026-07-31T15:00:00.000Z" }),
      mutableInquiry({ inquiryId: 9153, leadStatus: "draft_ready", storedLeadStatus: "draft_ready", manualGmailDraftUrl: "https://mail.google.com/mail/u/0/#drafts/fixture-gmail-message" }),
      mutableInquiry({ inquiryId: 9152, leadStatus: "contacted", storedLeadStatus: "converted", convertedQuoteId: quote.id, convertedQuoteNumber: quote.quoteNumber }),
      mutableInquiry({ inquiryId: 9151, leadStatus: "archived", storedLeadStatus: "unresponsive", archiveReason: "no_response" }),
    ]);
    return;
  }
  if (/^\/api\/inquiries\/\d+\/status$/.test(pathname) && request.method === "PATCH") {
    const inquiryId = Number(pathname.split("/")[3]);
    const body = await readJsonBody(request);
    fixtureLeadUpdates.set(inquiryId, {
      leadStatus: body.status,
      storedLeadStatus: body.status,
      manualGmailDraftUrl: body.gmailDraftUrl || null,
      archiveReason: body.reason || null,
    });
    json(response, 200, { id: inquiryId, status: body.status });
    return;
  }
  if (pathname === "/api/admin/import-csv-products" && request.method === "POST") {
    json(response, 200, { created: 1, updated: 0, errors: [], total: 1, replayed: false, fixtureOnly: true });
    return;
  }
  if (pathname === `/api/quotes/${quote.id}/configure-product` && request.method === "POST") {
    json(response, 201, {
      success: true,
      groupId: "config-fixture-browser-request",
      replayed: false,
      message: "Configuration inserted successfully",
      fixtureOnly: true,
    });
    return;
  }
  if (pathname === `/api/quotes/${quote.id}`) {
    if (scenario === "quote-403") {
      json(response, 403, { message: "Fixture quote access denied" });
      return;
    }
    if (scenario === "quote-404") {
      json(response, 404, { message: "Fixture quote not found" });
      return;
    }
    if (scenario === "quote-error") {
      json(response, 503, { message: "Fixture quote service unavailable" });
      return;
    }
    json(response, 200, fixtureQuote);
    return;
  }
  if (pathname === `/api/quotes/${quote.id}/versions`) {
    json(response, 200, [fixtureQuote]);
    return;
  }
  if (pathname === "/api/accounts") {
    json(response, 200, scenario === "empty" ? [] : [{ ...account, projectCount: 1 }]);
    return;
  }
  if (pathname === "/api/accounts/summary") {
    json(response, 200, { totalClients: 1, currentQuoteFamilies: 1 });
    return;
  }
  if (pathname === `/api/accounts/${account.id}/inquiries`) {
    json(response, 200, [{
      id: account.inquiryId,
      accountId: account.id,
      status: "new",
      source: "website",
      projectType: "Pergola",
      message: "TEST ONLY fictional inquiry",
      receivedAt: "2026-07-10T13:00:00.000Z",
    }]);
    return;
  }
  if (pathname === `/api/accounts/${account.id}`) {
    json(response, 200, account);
    return;
  }
  if (pathname === `/api/clients/${account.id}`) {
    json(response, 200, account);
    return;
  }
  if (pathname === "/api/admin/users") {
    json(response, 200, [adminUser, normalUser]);
    return;
  }
  if (pathname === "/api/admin/email-delivery-health") {
    json(response, 200, {
      asOf: "2026-07-10T15:00:00.000Z",
      staleAfterMinutes: 15,
      summary: { pending: 1, stalePending: 1, failed: 1, sent: 4, sentLast24Hours: 2 },
      attentionTotal: 2,
      attentionTruncated: false,
      attention: [{
        id: 9601,
        messageType: "quote_signature_confirmation",
        quoteId: quote.id,
        planningAgreementId: null,
        status: "failed",
        attemptCount: 2,
        lastErrorType: "ProviderUnavailable",
        createdAt: "2026-07-10T14:00:00.000Z",
        updatedAt: "2026-07-10T14:01:00.000Z",
      }, {
        id: 9602,
        messageType: "planning_signature_request",
        quoteId: null,
        planningAgreementId: 88,
        status: "pending",
        attemptCount: 1,
        lastErrorType: null,
        createdAt: "2026-07-10T13:00:00.000Z",
        updatedAt: "2026-07-10T13:00:00.000Z",
      }],
    });
    return;
  }
  if (pathname === "/api/admin/adoption-summary") {
    json(response, 200, {
      asOf: "2026-07-10T15:00:00.000Z",
      windowDays: 30,
      windowStart: "2026-06-10T15:00:00.000Z",
      historicalCoverage: "post_instrumentation_only",
      metrics: [
        { key: "customer_package_prepared", label: "Customer packages prepared", count: 3, firstRecordedAt: "2026-07-08T10:00:00.000Z", source: "business_events" },
        { key: "quote_customer_signed", label: "Customer approvals completed", count: 2, firstRecordedAt: "2026-07-08T11:00:00.000Z", source: "business_events" },
        { key: "quote_company_signed", label: "EDG signatures completed", count: 1, firstRecordedAt: "2026-07-08T12:00:00.000Z", source: "business_events" },
        { key: "lead_converted_to_quote", label: "Lead inquiries converted to quotes", count: 4, firstRecordedAt: "2026-07-07T09:00:00.000Z", source: "business_events" },
        { key: "quote_import_completed", label: "Quote import actions completed", count: 1, firstRecordedAt: "2026-07-09T09:00:00.000Z", source: "business_events" },
        { key: "dimensional_price_resolved", label: "Exact dimensional prices resolved", count: 5, firstRecordedAt: "2026-07-06T09:00:00.000Z", source: "business_events" },
        { key: "product_catalog_import_completed", label: "Product catalog imports completed", count: 2, firstRecordedAt: "2026-07-09T10:00:00.000Z", source: "business_events" },
        { key: "sundance_configuration_inserted", label: "Sundance packages inserted", count: 6, firstRecordedAt: "2026-07-08T09:30:00.000Z", source: "business_events" },
        { key: "approval_email_accepted", label: "Approval emails accepted by provider", count: 2, firstRecordedAt: "2026-07-08T10:30:00.000Z", source: "email_delivery_attempts" },
        { key: "quote_version_created", label: "Quote versions created", count: 2, firstRecordedAt: "2026-07-05T08:00:00.000Z", source: "quote_version_events" },
      ],
    });
    return;
  }
  if (pathname === "/api/storage/usage") {
    json(response, 200, {
      provider: "fixture",
      usedBytes: 12_345_678,
      quotaBytes: 5_000_000_000,
      objectCount: 24,
      calculatedAt: "2026-07-10T15:00:00.000Z",
      unavailableReason: "Fictional local fixture; no storage provider was queried.",
    });
    return;
  }
  if (pathname === "/api/contract-templates") {
    json(response, 200, []);
    return;
  }
  if (pathname === "/api/products") {
    json(response, 200, [fixtureProduct, fixtureConfigurableProduct, fixtureSundanceProduct]);
    return;
  }
  if (pathname === "/api/products/manufacturers") {
    json(response, 200, [fixtureProduct.manufacturer]);
    return;
  }
  if (pathname === `/api/quotes/${quote.id}/groups`) {
    json(response, 200, [fixtureGroup]);
    return;
  }
  if (
    pathname === "/api/colors"
    || pathname === `/api/quotes/${quote.id}/cover-photos`
  ) {
    json(response, 200, []);
    return;
  }
  if (pathname === "/api/signatures/test-token/full") {
    json(response, 200, {
      ...fixtureQuote,
      customerPackageVersion: 1,
      customerPackageFingerprint: "e".repeat(64),
      documentRevision: fixtureQuote.updatedAt,
      packageIssues: [],
      accountName: account.name,
      groups: [],
      productRenderings: [],
      jobsiteAddress: "100 Test Plaza, Example City, IL 60000",
      notes: "TEST ONLY - fictional public signing fixture.",
      customContractTerms: "No commercial obligation is created by this fixture.",
    });
    return;
  }
  if (pathname === "/api/signatures/test-token/sign" && request.method === "POST") {
    json(response, 200, { success: true, emailSent: false, fixtureOnly: true });
    return;
  }
  if (pathname === "/api/signatures/invalid-token/full") {
    json(response, 404, { message: "Invalid signing link. Please contact EDG for a new link." });
    return;
  }
  if (pathname === "/api/signatures/expired-token/full") {
    json(response, 404, { message: "This signing link has expired. Please contact EDG for a new link." });
    return;
  }
  if (pathname === "/api/signatures/archived-token/full") {
    json(response, 410, {
      message: "This quote version is archived. Make it the current version before you review or sign it.",
      code: "QUOTE_VERSION_ARCHIVED",
    });
    return;
  }
  if (pathname === "/api/signatures/incomplete-token/full") {
    json(response, 200, {
      ...quote,
      customerPackageVersion: 1,
      customerPackageFingerprint: "d".repeat(64),
      documentRevision: quote.updatedAt,
      packageIssues: [{
        code: "MISSING_VISUALS",
        message: "Visuals are included, but no proposal visuals are attached.",
      }],
      esigIncludeImages: true,
      accountName: account.name,
      groups: [],
      productRenderings: [],
      jobsiteAddress: "100 Test Plaza, Example City, IL 60000",
      notes: "TEST ONLY - fictional public signing fixture.",
      customContractTerms: "No commercial obligation is created by this fixture.",
    });
    return;
  }
  if (pathname === `/api/quotes/${quote.id}/product-rendering` && request.method === "POST") {
    const rendering = {
      id: 9701,
      quoteId: quote.id,
      filename: "TEST_ONLY_-_Dragged_Quote_Visual.svg",
      originalName: "TEST ONLY - Dragged Quote Visual.svg",
      storageUrl: "/fixture-quote-visual.svg",
      mimeType: "image/svg+xml",
      fileSize: 183,
      uploadedAt: "2026-07-27T20:00:00.000Z",
    };
    fixtureQuoteVisuals = [rendering];
    json(response, 201, rendering);
    return;
  }
  if (pathname === `/api/quotes/${quote.id}/product-renderings`) {
    json(response, 200, fixtureQuoteVisuals);
    return;
  }
  if (pathname === "/api/quote-images/product-rendering/9701" && request.method === "DELETE") {
    fixtureQuoteVisuals = [];
    response.writeHead(204, { "cache-control": "no-store" });
    response.end();
    return;
  }
  if (pathname === `/api/quotes/${quote.id}/planning-agreement`) {
    json(response, 200, null);
    return;
  }
  if (pathname === `/api/products/${fixtureConfigurableProduct.id}/calculate-price`) {
    json(response, 422, {
      message: "No exact pricing band covers these dimensions. Manual pricing review is required.",
      code: "PRICING_MANUAL_REVIEW",
    });
    return;
  }
  if (pathname === "/api/quotes/import-vision") {
    json(response, 200, {
      success: true,
      filename: "fictional-signed-quote.pdf",
      message: "Fictional quote data extracted for local UI verification",
      processingMethod: "vision",
      extractedData: {
        customer: {
          firstName: "Avery",
          lastName: "Example",
          email: "avery@example.invalid",
          company: "Example Hospitality Group - TEST ONLY",
        },
        quoteNumber: "TEST-IMPORT-001",
        date: "2026-07-10",
        projectDescription: "TEST ONLY - Imported courtyard structure",
        lineItems: [{
          description: "Fictional imported shade structure",
          quantity: 2,
          price: 1250,
          total: 2500,
          unit: "each",
        }],
        subtotal: 2500,
        taxRate: 8.25,
        total: 2706.25,
        confidence: 0.93,
      },
    });
    return;
  }
  json(response, 200, {});
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${host}:${port}`);
  const pathname = decodeURIComponent(url.pathname);
  const scenario = parseCookies(request.headers.cookie).rainmaker_fixture || "user";

  if (pathname.startsWith("/__fixture/")) {
    const selected = pathname.slice("/__fixture/".length);
    if (selected === "auth-recover") authRecoverAttempts = 0;
    const next = url.searchParams.get("next") || "/";
    const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
    response.writeHead(302, {
      "cache-control": "no-store",
      "set-cookie": `rainmaker_fixture=${encodeURIComponent(selected)}; Path=/; SameSite=Lax`,
      location: safeNext,
    });
    response.end();
    return;
  }

  if (pathname.startsWith("/api/")) {
    await serveApi(request, response, pathname, scenario);
    return;
  }

  if (pathname === "/fixture-quote-visual.svg") {
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": "image/svg+xml; charset=utf-8",
    });
    response.end('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"><rect width="160" height="100" fill="#244d37"/><text x="80" y="55" text-anchor="middle" fill="white" font-size="14">TEST VISUAL</text></svg>');
    return;
  }

  const requestedFile = resolve(publicDirectory, `.${pathname}`);
  const safeFile = requestedFile.startsWith(publicDirectory) && existsSync(requestedFile) && statSync(requestedFile).isFile()
    ? requestedFile
    : resolve(publicDirectory, "index.html");
  response.writeHead(200, {
    "cache-control": "no-store",
    "content-type": contentTypes[extname(safeFile)] || "application/octet-stream",
  });
  createReadStream(safeFile).pipe(response);
});

server.listen(port, host, () => {
  process.stdout.write(`Rainmaker browser fixtures: http://${host}:${port}/__fixture/admin?next=/quotes\n`);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
