import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateIdempotentLead = vi.hoisted(() => vi.fn());

vi.mock("../db", () => ({ db: {} }));
vi.mock("../storage", () => ({ storage: {} }));
vi.mock("../auth", () => ({
  isAuthenticated: (req: any, res: any, next: any) => {
    if (req.get("x-test-session") !== "valid") return res.status(401).json({ message: "Unauthorized" });
    req.user = { id: 77 };
    next();
  },
}));
vi.mock("../leadIntakeIdempotency", () => {
  class LeadIntakeIdempotencyError extends Error {
    constructor(readonly status: 400 | 409 | 500, message: string) { super(message); }
  }
  return {
    LeadIntakeIdempotencyError,
    createIdempotentLead: mockCreateIdempotentLead,
    resolveLeadIntakeSubmissionId: ({ bodyValue }: { bodyValue?: string }) => bodyValue,
  };
});

import { registerLeadIntakeRoutes } from "../routes/leadIntakeRoutes";

function makeApp() {
  const app = express();
  app.use(express.json());
  registerLeadIntakeRoutes(app);
  return app;
}

describe("manual lead creation", () => {
  beforeEach(() => {
    mockCreateIdempotentLead.mockReset();
    mockCreateIdempotentLead.mockResolvedValue({
      account: { id: 12, inquiryId: 34, leadStatus: "new" },
      replayed: false,
    });
  });

  it("requires a signed-in Rainmaker user", async () => {
    await request(makeApp()).post("/api/leads/manual").send({}).expect(401);
    expect(mockCreateIdempotentLead).not.toHaveBeenCalled();
  });

  it("validates required customer identity", async () => {
    await request(makeApp()).post("/api/leads/manual").set("x-test-session", "valid").send({
      firstName: "Taylor",
      idempotencyKey: "f8209c5e-2b25-4b4a-8ad4-e679fb6b72cd",
    }).expect(400);
    expect(mockCreateIdempotentLead).not.toHaveBeenCalled();
  });

  it("creates a New inquiry without creating a quote or contacting the customer", async () => {
    const payload = {
      firstName: "Taylor",
      lastName: "Example",
      email: "TAYLOR@example.invalid",
      phone: "555-0199",
      company: "Example Patio Co.",
      location: "100 Test Plaza, Granger, IN 46530, USA",
      streetAddress: "100 Test Plaza",
      addressLine2: "Suite 200",
      city: "Granger",
      state: "IN",
      zipCode: "46530",
      country: "United States",
      placeId: "fictional-place-id",
      projectType: "Motorized pergola",
      customerType: "homeowner",
      message: "Interested in shade for a west-facing patio.",
      idempotencyKey: "f8209c5e-2b25-4b4a-8ad4-e679fb6b72cd",
    };

    const response = await request(makeApp())
      .post("/api/leads/manual")
      .set("x-test-session", "valid")
      .send(payload)
      .expect(201);

    expect(response.body).toMatchObject({
      success: true,
      accountId: 12,
      inquiryId: 34,
      leadStatus: "new",
      createdQuote: false,
      replayed: false,
    });
    expect(mockCreateIdempotentLead).toHaveBeenCalledWith(expect.objectContaining({
      submissionId: payload.idempotencyKey,
      lead: expect.objectContaining({
        firstName: "Taylor",
        email: "taylor@example.invalid",
        company: "Example Patio Co.",
        streetAddress: "100 Test Plaza",
        addressLine2: "Suite 200",
        city: "Granger",
        state: "IN",
        zipCode: "46530",
        country: "United States",
        placeId: "fictional-place-id",
        source: "manual",
        metadata: { entryMethod: "rainmaker_manual", actorUserId: 77 },
      }),
      createLead: expect.any(Function),
    }));
  });
});
