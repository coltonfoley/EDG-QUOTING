import { describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ db: {} }));
vi.mock("../storage", () => ({ storage: {} }));

import {
  buildDeliveryBomPayload,
  buildDeliverySearchResult,
  isDeliveryIntegrationKeyValid,
} from "../routes/deliveryIntegrationRoutes";

describe("delivery BOM integration", () => {
  it("requires a configured integration key and compares it exactly", () => {
    const configured = "0123456789abcdefghijklmnopqrstuvwxyz";
    expect(isDeliveryIntegrationKeyValid(configured, configured)).toBe(true);
    expect(isDeliveryIntegrationKeyValid("wrong", configured)).toBe(false);
    expect(isDeliveryIntegrationKeyValid(undefined, configured)).toBe(false);
    expect(isDeliveryIntegrationKeyValid(configured, undefined)).toBe(false);
    expect(isDeliveryIntegrationKeyValid("short", "short")).toBe(false);
  });

  it("returns BOM identity and material fields without pricing", () => {
    const payload = buildDeliveryBomPayload({
      id: 42,
      quoteNumber: "Q-42",
      versionNumber: 3,
      isLatestVersion: true,
      updatedAt: new Date("2026-07-23T12:00:00Z"),
      projectName: "Dealer pergola",
      dealStage: "closed_won",
      jobsiteStreetAddress: "1802 Holian Drive",
      jobsiteAddressLine2: null,
      jobsiteCity: "Spring Grove",
      jobsiteState: "IL",
      jobsiteZipCode: "60081",
      jobsiteAddress: null,
      account: {
        company: "Lakeview Outdoor Living",
        name: "Receiving Team",
        email: "receiving@example.com",
      },
      groups: [{ id: "g1", title: "Structure", position: 1 }],
      lineItems: [
        {
          id: 9,
          description: "Support post",
          sku: "POST-9",
          manufacturer: "Sundance",
          quantity: "4",
          unit: "each",
          groupId: "g1",
          position: 0,
          unitPrice: "999.99",
          retailPrice: "1499.99",
        },
      ],
    } as any);

    expect(payload.quote.customerName).toBe("Lakeview Outdoor Living");
    expect(payload.quote.jobsiteAddress).toContain("Spring Grove, IL");
    expect(payload.items[0]).toEqual({
      id: 9,
      description: "Support post",
      sku: "POST-9",
      manufacturer: "Sundance",
      quantity: "4",
      unit: "each",
      groupTitle: "Structure",
      position: 0,
    });
    expect(JSON.stringify(payload)).not.toContain("unitPrice");
    expect(JSON.stringify(payload)).not.toContain("retailPrice");
  });

  it("returns search identity without pricing or customer contact details", () => {
    const result = buildDeliverySearchResult({
      id: 42,
      quoteNumber: "Q-42",
      versionNumber: 3,
      projectName: "Dealer pergola",
      dealStage: "closed_won",
      jobsiteStreetAddress: "1802 Holian Drive",
      jobsiteAddressLine2: null,
      jobsiteCity: "Spring Grove",
      jobsiteState: "IL",
      jobsiteZipCode: "60081",
      jobsiteAddress: null,
      accountName: "Receiving Team",
      accountCompany: "Lakeview Outdoor Living",
      updatedAt: new Date("2026-07-23T12:00:00Z"),
    });

    expect(result).toEqual({
      id: 42,
      quoteNumber: "Q-42",
      versionNumber: 3,
      projectName: "Dealer pergola",
      customerName: "Lakeview Outdoor Living",
      jobsiteAddress: "1802 Holian Drive · Spring Grove, IL · 60081",
      dealStage: "closed_won",
      updatedAt: "2026-07-23T12:00:00.000Z",
    });
    expect(JSON.stringify(result)).not.toContain("email");
    expect(JSON.stringify(result)).not.toContain("price");
  });
});
