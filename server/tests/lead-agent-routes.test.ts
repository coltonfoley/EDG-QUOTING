import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRecordAssessment = vi.hoisted(() => vi.fn());

vi.mock("../db", () => ({ db: {} }));
vi.mock("../storage", () => ({ storage: {} }));
vi.mock("../auth", () => ({
  isAuthenticated: (req: any, res: any, next: any) => (
    req.get("x-test-session") === "valid"
      ? next()
      : res.status(401).json({ message: "Unauthorized" })
  ),
}));
vi.mock("../leadAgentAssessment", () => {
  class LeadAgentAssessmentError extends Error {
    constructor(
      readonly code: string,
      message: string,
      readonly status = 409,
    ) {
      super(message);
    }
  }
  return {
    LeadAgentAssessmentError,
    recordLeadAgentAssessment: mockRecordAssessment,
  };
});

import { registerLeadIntakeRoutes } from "../routes/leadIntakeRoutes";

function makeApp() {
  const app = express();
  app.use(express.json());
  registerLeadIntakeRoutes(app);
  return app;
}

describe("lead agent writeback routes", () => {
  beforeEach(() => {
    process.env.RAINMAKER_API_KEY = "fixture-website-key";
    mockRecordAssessment.mockReset();
    mockRecordAssessment.mockResolvedValue({
      assessment: {
        id: 1,
        inquiryId: 42,
        outcome: "fit",
        reason: "In the service area.",
        gmailMessageId: "fixture-message-id",
      },
      replayed: false,
    });
  });

  afterEach(() => {
    delete process.env.RAINMAKER_API_KEY;
  });

  it("uses the existing Rainmaker session to write an assessment", async () => {
    const payload = {
      outcome: "fit",
      reason: "In the service area.",
      gmailMessageId: "fixture-message-id",
      idempotencyKey: "fixture-assessment-key",
    };

    await request(makeApp())
      .put("/api/inquiries/42/agent-assessment")
      .send(payload)
      .expect(401);
    await request(makeApp())
      .put("/api/inquiries/42/agent-assessment")
      .set("Authorization", "Bearer fixture-website-key")
      .send(payload)
      .expect(401);

    const response = await request(makeApp())
      .put("/api/inquiries/42/agent-assessment")
      .set("x-test-session", "valid")
      .send(payload)
      .expect(201);

    expect(response.body.replayed).toBe(false);
    expect(mockRecordAssessment).toHaveBeenCalledWith({
      inquiryId: 42,
      ...payload,
    });
  });

  it("requires a Gmail message ID for fit and forbids Gmail data for not fit", async () => {
    const authenticated = (payload: Record<string, unknown>) => request(makeApp())
      .put("/api/inquiries/42/agent-assessment")
      .set("x-test-session", "valid")
      .send(payload);

    await authenticated({
      outcome: "fit",
      reason: "In the service area.",
      idempotencyKey: "missing-message-id",
    }).expect(400);

    await authenticated({
      outcome: "not_fit",
      reason: "Outside the service area.",
      gmailMessageId: "must-not-be-present",
      idempotencyKey: "not-fit-with-gmail",
    }).expect(400);

    expect(mockRecordAssessment).not.toHaveBeenCalled();
  });

  it("accepts an exact replay response without creating a second result", async () => {
    mockRecordAssessment.mockResolvedValueOnce({
      assessment: {
        id: 1,
        inquiryId: 42,
        outcome: "fit",
        reason: "In the service area.",
        gmailMessageId: "fixture-message-id",
      },
      replayed: true,
    });

    const response = await request(makeApp())
      .put("/api/inquiries/42/agent-assessment")
      .set("x-test-session", "valid")
      .send({
        outcome: "fit",
        reason: "In the service area.",
        gmailMessageId: "fixture-message-id",
        idempotencyKey: "fixture-assessment-key",
      })
      .expect(200);

    expect(response.body.replayed).toBe(true);
  });
});
