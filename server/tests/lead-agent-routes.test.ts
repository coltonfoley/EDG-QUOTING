import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRecordAssessment = vi.hoisted(() => vi.fn());
vi.mock("../db", () => ({ db: {} }));
vi.mock("../storage", () => ({ storage: {} }));
vi.mock("../auth", () => ({
  isAuthenticated: (req: any, res: any, next: any) => req.get("x-test-session") === "valid"
    ? next() : res.status(401).json({ message: "Unauthorized" }),
}));
vi.mock("../leadAgentAssessment", () => {
  class LeadAgentAssessmentError extends Error {
    constructor(readonly code: string, message: string, readonly status = 409) { super(message); }
  }
  return { LeadAgentAssessmentError, recordLeadAgentAssessment: mockRecordAssessment };
});

import { registerLeadIntakeRoutes } from "../routes/leadIntakeRoutes";

function makeApp() {
  const app = express();
  app.use(express.json());
  registerLeadIntakeRoutes(app);
  return app;
}

describe("lead agent assessment writeback", () => {
  beforeEach(() => {
    mockRecordAssessment.mockReset();
    mockRecordAssessment.mockResolvedValue({ assessment: { id: 1, inquiryId: 42 }, replayed: false });
  });

  it("requires an authenticated Rainmaker session", async () => {
    await request(makeApp()).put("/api/inquiries/42/agent-assessment").send({
      outcome: "fit", reason: "Good fit", gmailMessageId: "message-1", idempotencyKey: "key-1",
    }).expect(401);
    expect(mockRecordAssessment).not.toHaveBeenCalled();
  });

  it("requires a real Gmail message pointer before accepting fit", async () => {
    await request(makeApp()).put("/api/inquiries/42/agent-assessment").set("x-test-session", "valid").send({
      outcome: "fit", reason: "Good fit", idempotencyKey: "key-1",
    }).expect(400);
    expect(mockRecordAssessment).not.toHaveBeenCalled();
  });

  it("records an inquiry-specific assessment and reports exact replays", async () => {
    const payload = { outcome: "fit", reason: "Good fit", gmailMessageId: "message-1", idempotencyKey: "key-1" };
    await request(makeApp()).put("/api/inquiries/42/agent-assessment").set("x-test-session", "valid").send(payload).expect(201);
    expect(mockRecordAssessment).toHaveBeenCalledWith({ inquiryId: 42, ...payload });

    mockRecordAssessment.mockResolvedValueOnce({ assessment: { id: 1, inquiryId: 42 }, replayed: true });
    await request(makeApp()).put("/api/inquiries/42/agent-assessment").set("x-test-session", "valid").send(payload).expect(200);
  });
});
