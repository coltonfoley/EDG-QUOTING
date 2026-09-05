import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { dealerPortalCompanyMappings, dealerPortalPricingRequests, quotes } from "@shared/schema";
import { type DealerPortalPricingRequest, hashDealerPortalPricingRequest } from "../dealerPortalPricingRequest";
import { registerDealerPortalPricingRequestRoutes } from "../routes/dealerPortalPricingRequestRoutes";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(), select: vi.fn(), insert: vi.fn(),
  submission: null as Record<string, unknown> | null,
  quote: null as Record<string, unknown> | null,
}));
vi.mock("../db", () => ({ db: { transaction: async (run: (transaction: unknown) => unknown) => run(mocks) } }));

const fixture: DealerPortalPricingRequest = {
  portalPricingRequestId: "55555555-5555-4555-8555-555555555555",
  portalCompanyId: "22222222-2222-4222-8222-222222222222",
  submittedAt: "2026-09-05T20:00:00.000Z", projectName: "Fictional options review", purchaseOrderNumber: null,
  company: { name: "Fictional company", billingEmail: "test@example.invalid", billingPhone: "555-0100", billingAddress: { line1: "100 Test St", line2: null, city: "Chicago", region: "IL", postalCode: "60601", country: "US" } },
  product: { key: "sundance-freestanding", requestedLengthInches: 168, requestedWidthInches: 144, frameColor: "Black", louverColor: "White", operation: "Motorized", rainSensor: "No", fulfillment: "Pickup", requestReason: "Please review the requested Sundance options." },
  shippingAddress: null,
};
const key = "test-only-integration-key-at-least-32-characters";
const app = express();
app.use(express.json());
registerDealerPortalPricingRequestRoutes(app);
const endpoint = "/api/integrations/dealer-portal/pricing-requests";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DEALER_PORTAL_INTEGRATION_KEY", key);
  mocks.submission = null;
  mocks.quote = null;
  mocks.select.mockImplementation(() => ({ from: (table: unknown) => ({ where: () => ({ limit: async () => {
    if (table === dealerPortalPricingRequests) return mocks.submission ? [mocks.submission] : [];
    if (table === dealerPortalCompanyMappings) return [{ accountId: 55 }];
    throw new Error("Unexpected query in pricing request test");
  } }) }) }));
  mocks.insert.mockImplementation((table: unknown) => ({ values: (value: Record<string, unknown>) => {
    if (table === quotes) {
      mocks.quote = value;
      return { returning: async () => [{ id: 123 }] };
    }
    if (table === dealerPortalPricingRequests) {
      mocks.submission = value;
      return Promise.resolve();
    }
    throw new Error("Unexpected insert in pricing request test");
  } }));
});
afterEach(() => vi.unstubAllEnvs());

describe("dealer pricing-request option persistence and retries", () => {
  it("saves every option in request evidence and the review quote, then replays without inserts", async () => {
    const payload: DealerPortalPricingRequest = { ...fixture, product: { ...fixture.product, options: {
      lighting: { mode: "warm-white", sides: ["B1", "B4"] }, service: "drawings-and-engineering",
      cantilever: { b3EndOverhangInches: 12, b4EndOverhangInches: 0 },
      screens: [{ side: "B2", widthInches: 160, heightInches: 90, purpose: "insect", mount: "under-header", finish: "custom-ral", ralCode: "7016" }],
    } } };
    const created = await request(app).post(endpoint).set("Authorization", `Bearer ${key}`).send(payload);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ outcome: "created", rainmakerQuoteId: 123 });
    expect(mocks.submission?.payload).toEqual(payload);
    expect(mocks.quote?.notes).toContain("requested drawing or engineering service");
    expect(mocks.quote?.internalNotes).toContain("Warm-white lighting requested on B1, B4");
    expect(mocks.quote?.internalNotes).toContain("$3,500 service price");
    expect(mocks.quote?.internalNotes).toContain("B3 end 12 in; B4 end 0 in");
    expect(mocks.quote?.internalNotes).toContain("Screen B2: 160 in clear width × 90 in clear height; insect; under-header; finish custom RAL 7016");
    expect(mocks.quote).toMatchObject({ dealStage: "building_estimate", enableESignature: false, esigIncludeApprovalDrawing: false });
    mocks.insert.mockClear();
    const replayed = await request(app).post(endpoint).set("Authorization", `Bearer ${key}`).send(payload);
    expect(replayed.status).toBe(200);
    expect(replayed.body).toMatchObject({ outcome: "existing", rainmakerQuoteId: 123 });
    expect(mocks.insert).not.toHaveBeenCalled();
    const changed = { ...payload, product: { ...payload.product, options: { ...payload.product.options, service: "drawings" } } };
    const conflict = await request(app).post(endpoint).set("Authorization", `Bearer ${key}`).send(changed);
    expect(conflict.status).toBe(409);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("replays historical requests without options under their original identity", async () => {
    mocks.submission = { requestHash: hashDealerPortalPricingRequest(fixture), quoteId: 111 };
    const response = await request(app).post(endpoint).set("Authorization", `Bearer ${key}`).send(fixture);
    expect(response.status).toBe(200);
    expect(response.body.rainmakerQuoteId).toBe(111);
    expect(mocks.select).toHaveBeenCalledOnce();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("rejects unknown options before any database work", async () => {
    const response = await request(app).post(endpoint).set("Authorization", `Bearer ${key}`)
      .send({ ...fixture, product: { ...fixture.product, options: { unknownUpgrade: true } } });
    expect(response.status).toBe(400);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("requires authentication before accepting a request", async () => {
    const response = await request(app).post(endpoint).send(fixture);
    expect(response.status).toBe(401);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
