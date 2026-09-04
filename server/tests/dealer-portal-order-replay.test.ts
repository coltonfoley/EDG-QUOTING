import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerDealerPortalOrderRoutes } from "../routes/dealerPortalOrderRoutes";
import { hashDealerPortalOrder, type DealerPortalOrder } from "../dealerPortalOrder";

const mocks = vi.hoisted(() => ({ execute: vi.fn(), select: vi.fn(), insert: vi.fn(), submission: null as unknown }));
vi.mock("../db", () => ({ db: { transaction: async (run: (transaction: unknown) => unknown) => run(mocks) } }));
const order: DealerPortalOrder = {
  portalOrderId: "109566de-79ce-4f46-825d-2e24bdb5b89e", portalCompanyId: "0e8d5a20-dcf3-4355-a522-1f38dbbb03f9",
  snapshotHash: "a".repeat(64), rulesVersion: "2026-08-25.3", projectName: "Test order", purchaseOrderNumber: null,
  company: { name: "Test company", billingEmail: "test@example.invalid", billingPhone: "555-0100", billingAddress: { line1: "100 Test St", line2: null, city: "Chicago", region: "IL", postalCode: "60601", country: "US" } },
  fulfillment: "Pickup", shippingAddress: null,
  agreement: { version: "2026-08-25.1", signerName: "Test Signer", acceptedAt: "2026-08-25T18:00:00.000Z" },
  quickBooks: { invoiceId: "test-invoice", invoiceNumber: "TEST-1", depositPaidAt: "2026-08-25T19:00:00.000Z", depositAmountCents: 5000 },
  materials: { currency: "USD", customerTotalCents: 10000, lines: [{ role: "beam-2x8-16", sku: "beam16", description: "Beam", quantity: 2, color: "Black", customerUnitPriceCents: 5000, customerLineTotalCents: 10000 }] },
};
const key = "test-only-integration-key-at-least-32-characters";
const app = express();
app.use(express.json());
registerDealerPortalOrderRoutes(app);
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DEALER_PORTAL_INTEGRATION_KEY", key);
  mocks.submission = { requestHash: hashDealerPortalOrder(order), snapshotHash: order.snapshotHash, quoteId: 123 };
  mocks.select.mockImplementation(() => ({ from: () => ({ where: () => ({ limit: async () => [mocks.submission] }) }) }));
});
afterEach(() => vi.unstubAllEnvs());

describe("authenticated existing portal-order replay", () => {
  it("returns the existing quote without rereading prices or inserting records", async () => {
    const response = await request(app).post("/api/integrations/dealer-portal/orders").set("Authorization", `Bearer ${key}`).send(order);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ outcome: "existing", rainmakerOrderId: 123 });
    expect(mocks.select).toHaveBeenCalledOnce();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("rejects altered price evidence under an existing order identity", async () => {
    const changed = { ...order, quickBooks: { ...order.quickBooks, depositAmountCents: 6000 }, materials: { ...order.materials, customerTotalCents: 12000, lines: [{ ...order.materials.lines[0], customerUnitPriceCents: 6000, customerLineTotalCents: 12000 }] } };
    const response = await request(app).post("/api/integrations/dealer-portal/orders").set("Authorization", `Bearer ${key}`).send(changed);
    expect(response.status).toBe(409);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("rejects untrusted requests before reading or writing any order", async () => {
    const response = await request(app).post("/api/integrations/dealer-portal/orders").send(order);
    expect(response.status).toBe(401);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
