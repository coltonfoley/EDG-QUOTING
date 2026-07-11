import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockStorage = vi.hoisted(() => ({
  getAdoptionSummary: vi.fn(),
}));

vi.mock("../storage", () => ({ storage: mockStorage }));
vi.mock("../auth", () => ({
  isAuthenticated: (req: any, res: any, next: any) => {
    const role = req.get("x-test-role");
    if (!role) return res.status(401).json({ message: "Unauthorized" });
    req.user = { id: role === "admin" ? 1 : 2, role };
    next();
  },
  requireAdmin: (req: any, res: any, next: any) => (
    req.user?.role === "admin"
      ? next()
      : res.status(403).json({ message: "Admin access required" })
  ),
}));

import { registerBusinessEventRoutes } from "../routes/businessEventRoutes";

function makeApp() {
  const app = express();
  registerBusinessEventRoutes(app);
  return app;
}

describe("business event adoption route", () => {
  beforeEach(() => mockStorage.getAdoptionSummary.mockReset());

  it("rejects unauthenticated and non-admin requests", async () => {
    await request(makeApp()).get("/api/admin/adoption-summary").expect(401);
    await request(makeApp()).get("/api/admin/adoption-summary").set("x-test-role", "user").expect(403);
    expect(mockStorage.getAdoptionSummary).not.toHaveBeenCalled();
  });

  it("labels counts as post-instrumentation evidence without customer content", async () => {
    mockStorage.getAdoptionSummary.mockResolvedValue({
      asOf: new Date("2026-07-10T15:00:00.000Z"),
      windowDays: 30,
      windowStart: new Date("2026-06-10T15:00:00.000Z"),
      historicalCoverage: "post_instrumentation_only",
      metrics: [{
        key: "customer_package_prepared",
        label: "Customer packages prepared",
        count: 3,
        firstRecordedAt: new Date("2026-07-08T10:00:00.000Z"),
        source: "business_events",
      }],
    });

    const response = await request(makeApp())
      .get("/api/admin/adoption-summary")
      .set("x-test-role", "admin")
      .expect(200);

    expect(mockStorage.getAdoptionSummary).toHaveBeenCalledWith({ windowDays: 30 });
    expect(response.body.historicalCoverage).toBe("post_instrumentation_only");
    expect(response.body.metrics[0]).toMatchObject({ count: 3, source: "business_events" });
    const serialized = JSON.stringify(response.body);
    for (const forbidden of ["email", "filename", "dimension", "price", "signingToken", "messageBody"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("returns a generic error without internal details", async () => {
    mockStorage.getAdoptionSummary.mockImplementationOnce(() => {
      throw new Error("private database detail");
    });
    const response = await request(makeApp())
      .get("/api/admin/adoption-summary")
      .set("x-test-role", "admin");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ message: "Failed to fetch adoption summary" });
  });
});
