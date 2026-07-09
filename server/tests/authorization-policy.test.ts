import { readFileSync } from "node:fs";
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

  it("keeps payment and Ops actions authenticated and auditable", () => {
    const quoteRoutes = source("server/routes/quoteRoutes.ts");
    const planningRoutes = source("server/routes/planningAgreementRoutes.ts");

    expect(quoteRoutes).toContain('app.post("/api/quotes/:id/send-to-ops", isAuthenticated');
    expect(planningRoutes).toContain('app.post("/api/planning-agreements/:id/confirm-payment", isAuthenticated');
    expect(planningRoutes).toContain('"payment_confirmed"');
    expect(planningRoutes).toContain("paymentConfirmedBy: actorUserId");
  });
});
