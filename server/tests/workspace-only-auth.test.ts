import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Workspace-only human authentication", () => {
  it("does not expose password login, registration, or password-change routes", () => {
    const authSource = source("server/auth.ts");
    const routesSource = source("server/routes.ts");

    expect(authSource).not.toContain('app.post("/api/login"');
    expect(authSource).not.toContain('app.post("/api/register"');
    expect(routesSource).not.toContain("/api/user/change-password");
    expect(routesSource).not.toContain("app.post('/api/admin/users'");
  });

  it("keeps Google Workspace sign-in and removes password UI", () => {
    const authSource = source("server/auth.ts");
    const authPageSource = source("client/src/pages/auth-page.tsx");
    const appSource = source("client/src/App.tsx");

    expect(authSource).toContain('app.get("/api/auth/google"');
    expect(authPageSource).toContain("Continue with Google Workspace");
    expect(authPageSource).not.toContain('type="password"');
    expect(appSource).not.toContain("change-password");
  });

  it("requires Workspace credentials in the environment check", () => {
    const envCheckSource = source("scripts/validate-env.mjs");
    expect(envCheckSource).toContain("Google Workspace is Rainmaker's only human sign-in method.");
  });

  it("does not register or render the retired AI chat", () => {
    const routesSource = source("server/routes.ts");
    const appSource = source("client/src/App.tsx");

    expect(routesSource).not.toContain("registerAIAssistantRoutes");
    expect(appSource).not.toContain("AIAssistant");
  });

  it("does not grant general application access to bearer API keys", () => {
    const authSource = source("server/auth.ts");
    const leadRoutesSource = source("server/routes/leadIntakeRoutes.ts");

    expect(authSource).not.toContain("apiKeyAuthenticated");
    expect(authSource).not.toContain("validateApiKey");
    expect(authSource).toContain("if (req.isAuthenticated())");
    expect(leadRoutesSource).toContain("isConfiguredWebsiteApiKey");
  });

  it("uses production-safe session and request defaults", () => {
    const authSource = source("server/auth.ts");
    const appSource = source("server/app.ts");

    expect(authSource).toContain("SESSION_SECRET is required in production");
    expect(authSource).toContain("sameSite: 'lax'");
    expect(appSource).not.toContain("'unsafe-eval'");
    expect(appSource).not.toContain("*.replit.app");
    expect(appSource).toContain('express.json({ limit: "10mb" })');
  });

  it("defaults object storage to Vercel Blob instead of a retired Replit runtime", () => {
    const objectStorageSource = source("server/objectStorage.ts");
    const routesSource = source("server/routes.ts");
    const envCheckSource = source("scripts/validate-env.mjs");

    expect(objectStorageSource).toContain('process.env.OBJECT_STORAGE_PROVIDER || "vercel-blob"');
    expect(routesSource).toContain('process.env.OBJECT_STORAGE_PROVIDER || "vercel-blob"');
    expect(envCheckSource).toContain('["replit", "vercel-blob"], "vercel-blob"');
  });
});
