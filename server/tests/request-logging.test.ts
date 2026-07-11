import { describe, expect, it } from "vitest";
import { createRequestId, redactedRequestPath } from "../requestLogging";

describe("request logging safety", () => {
  it("creates opaque request identifiers", () => {
    const first = createRequestId();
    const second = createRequestId();

    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(second).not.toBe(first);
  });

  it("redacts quote and planning-agreement signing tokens", () => {
    expect(redactedRequestPath("/api/signatures/customer-secret-token/full"))
      .toBe("/api/signatures/:token/full");
    expect(redactedRequestPath("/api/planning-agreement-signatures/another-secret/sign"))
      .toBe("/api/planning-agreement-signatures/:token/sign");
  });

  it("preserves ordinary route paths", () => {
    expect(redactedRequestPath("/api/quotes/123/versions")).toBe("/api/quotes/123/versions");
  });
});
