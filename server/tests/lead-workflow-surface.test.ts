import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("lead inquiry workflow surface", () => {
  it("returns every inquiry instead of grouping by the latest account inquiry", () => {
    const routes = source("server/routes/leadIntakeRoutes.ts");
    expect(routes).not.toContain("latestInquiry");
    expect(routes).toContain(".from(leadInquiries)");
    expect(routes).toContain(".orderBy(desc(leadInquiries.receivedAt), desc(leadInquiries.id))");
    expect(routes).toContain("attachment.submissionId === lead.submissionId");
  });

  it("exposes only the approved visible states and actions", () => {
    const leads = source("client/src/pages/leads.tsx");
    expect(leads).toContain('{ value: "draft_ready", label: "Draft Ready" }');
    expect(leads).toContain("Open Gmail Draft");
    expect(leads).toContain("Mark Draft Ready");
    expect(leads).toContain("Gmail draft link (optional)");
    expect(leads).toContain("Email draft content");
    expect(leads).toContain("draft-email-content-${lead.inquiryId}");
    expect(leads).toContain("Create Quote");
    expect(leads).toContain("Open Quote");
    expect(leads).toContain("Archive / Disqualify");
    expect(leads).toContain('data-testid="button-new-lead"');
    expect(leads).toContain("Add New Lead");
    expect(leads).not.toContain(">New Quote</Button>");
    expect(leads).not.toContain("Start Follow-Up");
    expect(leads).not.toContain('label: "Qualified"');
    expect(leads).not.toContain('label: "No Reply"');
    expect(leads).not.toContain('label: "Converted"');
  });

  it("adds manual leads through an authenticated inquiry route", () => {
    const routes = source("server/routes/leadIntakeRoutes.ts");
    expect(routes).toContain('app.post("/api/leads/manual", isAuthenticated');
    expect(routes).toContain('source: "manual"');
    expect(routes).toContain("preserveAccountAndCreateInquiry(lead, submissionId!");
    expect(routes).toContain("createdQuote: false");
  });

  it("reuses the quote workflow Google address autocomplete for manual leads", () => {
    const leads = source("client/src/pages/leads.tsx");
    const autocomplete = source("client/src/components/address-autocomplete.tsx");
    const addressComponents = source("client/src/lib/address-components.ts");
    expect(leads).toContain('import { AddressAutocomplete } from "@/components/address-autocomplete"');
    expect(leads).toContain('testId="input-manual-lead-location"');
    expect(leads).toContain('value={manualLead.location}');
    expect(leads).toContain('onAddressSelect={handleManualLeadAddressSelect}');
    expect(autocomplete).toContain('onValueChange?.(event.target.value)');
    expect(addressComponents).toContain('formattedAddress: place.formatted_address || ""');
  });

  it("stores and returns a plain-text email snapshot without changing Gmail send behavior", () => {
    const migration = source("migrations/0036_add_lead_draft_email_content.sql");
    const routes = source("server/routes/leadIntakeRoutes.ts");
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "draft_email_content" text');
    expect(routes).toContain("manualDraftEmailContent: leadInquiries.draftEmailContent");
    expect(routes).toContain("assessmentDraftEmailContent");
    expect(routes).toContain("draftEmailContent: status === \"draft_ready\"");
  });

  it("keeps inquiry-to-quote links and account detail history aligned", () => {
    const leads = source("client/src/pages/leads.tsx");
    const storage = source("server/storage.ts");
    const account = source("client/src/pages/account-detail.tsx");
    expect(leads).toContain("convertedQuoteId");
    expect(leads).toContain("inquiryId=${lead.inquiryId}");
    expect(storage).toContain("workflowStatus: projectLeadWorkflowStatus");
    expect(storage).toContain("attachments: accountLeadAttachments.filter");
    expect(account).toContain("Inquiry History");
    expect(account).toContain("Open linked quote");
  });

  it("audits future status changes and retains optional archive reasons", () => {
    const migration = source("migrations/0035_add_lead_inquiry_status_audit.sql");
    const routes = source("server/routes/leadIntakeRoutes.ts");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "lead_inquiry_status_events"');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "archive_reason"');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "gmail_draft_url"');
    expect(routes).toContain("fromStatus: existing.status");
    expect(routes).toContain("reason: status === \"archived\"");
  });

  it("lets every local fixture inquiry exercise status transitions", () => {
    const fixture = source("scripts/serve-browser-fixtures.mjs");
    expect(fixture).toContain("const mutableInquiry = (overrides)");
    expect(fixture).toContain("fixtureLeadUpdates.get(overrides.inquiryId)");
    expect(fixture).toContain("mutableInquiry({ inquiryId: 9153");
  });
});
