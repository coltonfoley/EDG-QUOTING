import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ db: {} }));
vi.mock("../storage", () => ({ storage: {} }));
vi.mock("../auth", () => ({
  isAuthenticated: (req: any, res: any, next: any) => req.get("x-test-session") === "valid"
    ? next()
    : res.status(401).json({ message: "Unauthorized" }),
}));

import {
  gmailDraftUrlSchema,
  leadStatusUpdateSchema,
  registerLeadIntakeRoutes,
} from "../routes/leadIntakeRoutes";

const acceptedDraftUrls = [
  "https://mail.google.com/mail/u/0/#drafts/FMfcgzQabc123",
  "https://mail.google.com/mail/#drafts/FMfcgzQabc123",
];

const rejectedDraftUrls = [
  "http://mail.google.com/mail/#drafts/FMfcgzQabc123",
  "https://example.com/mail/#drafts/FMfcgzQabc123",
  "https://mail.google.com/mail/#inbox/FMfcgzQabc123",
  "https://mail.google.com/mail/u/0/#sent/FMfcgzQabc123",
];

function makeApp() {
  const app = express();
  app.use(express.json());
  registerLeadIntakeRoutes(app);
  return app;
}

describe("Gmail draft URL validation", () => {
  it.each(acceptedDraftUrls)("accepts %s in both inquiry-update paths", (gmailDraftUrl) => {
    expect(gmailDraftUrlSchema.parse(gmailDraftUrl)).toBe(gmailDraftUrl);
    expect(leadStatusUpdateSchema.parse({ status: "draft_ready", gmailDraftUrl })).toMatchObject({
      status: "draft_ready",
      gmailDraftUrl,
    });
  });

  it.each(rejectedDraftUrls)("rejects %s in both inquiry-update paths", (gmailDraftUrl) => {
    expect(() => gmailDraftUrlSchema.parse(gmailDraftUrl)).toThrow();
    expect(() => leadStatusUpdateSchema.parse({ status: "draft_ready", gmailDraftUrl })).toThrow();
  });
});

describe("inquiry status update validation response", () => {
  it("describes a generic inquiry-update validation failure accurately", async () => {
    const response = await request(makeApp())
      .patch("/api/inquiries/42/status")
      .set("x-test-session", "valid")
      .send({
        status: "draft_ready",
        gmailDraftUrl: "https://mail.google.com/mail/#inbox/FMfcgzQabc123",
      })
      .expect(400);

    expect(response.body.message).toBe("Invalid inquiry update");
    expect(response.body.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: ["gmailDraftUrl"] }),
    ]));
  });
});
