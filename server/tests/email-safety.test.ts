import { afterEach, describe, expect, it, vi } from "vitest";

const sendGoogleWorkspaceEmail = vi.hoisted(() => vi.fn());

vi.mock("../googleWorkspaceEmail", () => ({
  sendGoogleWorkspaceEmail,
}));

import { sendEmail } from "../email";

const originalProvider = process.env.EMAIL_PROVIDER;

afterEach(() => {
  sendGoogleWorkspaceEmail.mockReset();
  if (originalProvider === undefined) {
    delete process.env.EMAIL_PROVIDER;
  } else {
    process.env.EMAIL_PROVIDER = originalProvider;
  }
});

describe("Workspace email safety boundary", () => {
  it("uses Google Workspace Gmail by default", async () => {
    delete process.env.EMAIL_PROVIDER;
    sendGoogleWorkspaceEmail.mockResolvedValue({ id: "test-message" });

    await expect(sendEmail({
      to: "recipient@example.com",
      subject: "Test",
      htmlBody: "<p>Test</p>",
    })).resolves.toEqual({ id: "test-message" });
    expect(sendGoogleWorkspaceEmail).toHaveBeenCalledTimes(1);
  });

  it("rejects non-Workspace providers before any send", async () => {
    process.env.EMAIL_PROVIDER = "resend";

    await expect(sendEmail({
      to: "recipient@example.com",
      subject: "Should not send",
      htmlBody: "<p>Blocked</p>",
    })).rejects.toThrow(/google-workspace-gmail only/);
    expect(sendGoogleWorkspaceEmail).not.toHaveBeenCalled();
  });
});
