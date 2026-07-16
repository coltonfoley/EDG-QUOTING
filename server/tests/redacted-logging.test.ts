import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { redactedErrorType, validationIssueSummary } from "../redactedLogging";

describe("redacted logging", () => {
  it("reports an error type without serializing its message", () => {
    const sensitive = new Error("avery@example.invalid should never be logged");

    expect(redactedErrorType(sensitive)).toBe("Error");
    expect(redactedErrorType(sensitive)).not.toContain("avery@example.invalid");
  });

  it("summarizes validation shape without including rejected values or messages", () => {
    const summary = validationIssueSummary({
      errors: [
        { code: "invalid_string", path: ["email"] },
        { code: "too_small", path: ["name"] },
        { code: "invalid_string", path: ["email"] },
      ],
    });

    expect(summary).toEqual({
      issueCount: 3,
      codes: ["invalid_string", "too_small"],
      paths: ["email", "name"],
    });
    expect(JSON.stringify(summary)).not.toContain("@example.invalid");
  });

  it("does not serialize database pool errors that can contain connection credentials", () => {
    const databaseSource = readFileSync(resolve(process.cwd(), "server/db.ts"), "utf8");

    expect(databaseSource).toContain('errorType: error instanceof Error ? error.name : "UnknownError"');
    expect(databaseSource).not.toContain('console.error("[db] Unexpected pool error (connection will be recycled):", error)');
    expect(databaseSource).not.toContain("connectionString: error");
  });

  it("does not serialize raw errors in website-lead or marketing-attribution routes", () => {
    const sources = [
      "api/lead-intake.ts",
      "server/routes/leadIntakeRoutes.ts",
      "server/routes/marketingAttributionRoutes.ts",
    ].map((file) => readFileSync(resolve(process.cwd(), file), "utf8"));

    for (const source of sources) {
      expect(source).toContain("redactedErrorType(error)");
      expect(source).not.toMatch(/console\.error\([^\n]*,\s*error\s*\)/);
    }
  });
});
