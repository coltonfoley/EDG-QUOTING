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

  it("limits contract-template administration to administrators", () => {
    const appRoutes = source("server/routes.ts");

    expect(appRoutes).toContain("app.get('/api/contract-templates', isAuthenticated, requireAdmin");
    expect(appRoutes).toContain("app.get('/api/contract-templates/:id', isAuthenticated, requireAdmin");
    expect(appRoutes).toContain("app.post('/api/contract-templates', isAuthenticated, requireAdmin");
    expect(appRoutes).toContain("app.put('/api/contract-templates/:id', isAuthenticated, requireAdmin");
    expect(appRoutes).toContain("app.delete('/api/contract-templates/:id', isAuthenticated, requireAdmin");
  });

  it("keeps payment and Ops actions authenticated and auditable", () => {
    const quoteRoutes = source("server/routes/quoteRoutes.ts");
    const planningRoutes = source("server/routes/planningAgreementRoutes.ts");

    expect(quoteRoutes).toContain('app.post("/api/quotes/:id/send-to-ops", isAuthenticated');
    expect(planningRoutes).toContain('app.post("/api/planning-agreements/:id/confirm-payment", isAuthenticated');
    expect(planningRoutes).toContain('"payment_confirmed"');
    expect(planningRoutes).toContain("paymentConfirmedBy: actorUserId");
  });

  it("requires authentication before customer email actions", () => {
    const quoteRoutes = source("server/routes/quoteRoutes.ts");
    const planningRoutes = source("server/routes/planningAgreementRoutes.ts");

    expect(quoteRoutes).toContain('app.post("/api/quotes/:id/send-signature-email", isAuthenticated');
    expect(planningRoutes).toContain('app.post("/api/planning-agreements/:id/send-signature-email", isAuthenticated');
    expect(planningRoutes).toContain('app.post("/api/planning-agreements/:id/send", isAuthenticated');
  });

  it("protects storage mutation and proxy routes", () => {
    const imageRoutes = source("server/routes/imageRoutes.ts");
    const quoteRoutes = source("server/routes/quoteRoutes.ts");

    expect(imageRoutes).toContain('app.post("/api/images/upload-url", isAuthenticated');
    expect(imageRoutes).toContain('app.post("/api/images/finalize-upload", isAuthenticated');
    expect(imageRoutes).toContain('app.get("/api/image-proxy", isAuthenticated');
    expect(quoteRoutes).toContain('app.post("/api/quotes/:quoteId/cover-photos", isAuthenticated');
    expect(quoteRoutes).toContain('app.post("/api/quotes/:quoteId/product-renderings", isAuthenticated');
  });

  it("rate limits public signing and issue-report surfaces", () => {
    const appSource = source("server/app.ts");
    expect(appSource).toContain('app.use("/api/signatures", publicActionLimiter)');
    expect(appSource).toContain('app.use("/api/planning-agreement-signatures", publicActionLimiter)');
    expect(appSource).toContain('app.use("/api/issue-reports", issueReportLimiter)');
  });
});
