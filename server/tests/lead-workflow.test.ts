import { describe, expect, it } from "vitest";
import { gmailDraftHref, projectLeadWorkflowStatus } from "@shared/leadWorkflow";

describe("lead workflow projection", () => {
  it.each([
    ["new", "new"],
    ["contacted", "contacted"],
    ["qualified", "contacted"],
    ["unresponsive", "archived"],
    ["archived", "archived"],
    ["converted", "contacted"],
  ])("maps legacy %s to %s", (storedStatus, expected) => {
    expect(projectLeadWorkflowStatus({ storedStatus })).toBe(expected);
  });

  it("requires a fit assessment and a Gmail message pointer for Draft Ready", () => {
    expect(projectLeadWorkflowStatus({ storedStatus: "new", assessmentOutcome: "fit" })).toBe("new");
    expect(projectLeadWorkflowStatus({ storedStatus: "new", gmailMessageId: "message-1" })).toBe("new");
    expect(projectLeadWorkflowStatus({ storedStatus: "new", assessmentOutcome: "fit", gmailMessageId: "message-1" })).toBe("draft_ready");
  });

  it("projects not-fit assessments to the terminal state without changing stored status", () => {
    const input = { storedStatus: "new", assessmentOutcome: "not_fit" };
    expect(projectLeadWorkflowStatus(input)).toBe("archived");
    expect(input.storedStatus).toBe("new");
  });

  it("keeps linked quotes in Contacted and builds a safe Gmail draft link", () => {
    expect(projectLeadWorkflowStatus({ storedStatus: "new", convertedQuoteId: 91 })).toBe("contacted");
    expect(projectLeadWorkflowStatus({ storedStatus: "converted", assessmentOutcome: "not_fit", convertedQuoteId: 91 })).toBe("contacted");
    expect(gmailDraftHref({ gmailMessageId: "message/id" })).toBe("https://mail.google.com/mail/u/0/#drafts/message%2Fid");
    expect(gmailDraftHref({ gmailDraftUrl: "https://evil.example/draft", gmailMessageId: null })).toBeNull();
  });
});
