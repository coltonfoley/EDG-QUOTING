import { describe, expect, it } from "vitest";
import { getSnapshotBackedCustomerPackage, getSnapshotBackedStaffQuote } from "../../client/src/lib/customer-package";
import type { QuoteWithDetails } from "@shared/schema";

describe("customer document package", () => {
  it("does not fill missing legacy snapshot content from mutable live relations", () => {
    const resolved = getSnapshotBackedCustomerPackage({
      id: 10,
      quoteNumber: "Q-LIVE",
      projectName: "Mutable live project",
      account: { name: "Changed account" },
      lineItems: [{ description: "Changed scope" }],
      groups: [{ id: "live-group", title: "Live group", position: 0 }],
      productRenderings: [{ id: 9, storageUrl: "https://example.test/live.jpg" }],
      signedDocumentSnapshot: {
        id: 10,
        quoteNumber: "Q-FROZEN",
        projectName: "Frozen project",
        account: { name: "Frozen account" },
        lineItems: [{ description: "Frozen scope" }],
      },
    } as unknown as QuoteWithDetails);

    expect(resolved.quoteNumber).toBe("Q-FROZEN");
    expect(resolved.account?.name).toBe("Frozen account");
    expect(resolved.lineItems).toEqual([{ description: "Frozen scope" }]);
    expect(resolved.groups).toEqual([]);
    expect(resolved.productRenderings).toEqual([]);
  });

  it("uses frozen commercial content while retaining staff-only pipeline state", () => {
    const resolved = getSnapshotBackedStaffQuote({
      id: 10,
      quoteNumber: "Q-LIVE",
      projectName: "Mutable live project",
      dealStage: "closed_won",
      lostReason: null,
      versionNumber: 3,
      isLatestVersion: true,
      lineItems: [{ description: "Changed scope" }],
      signedDocumentSnapshot: {
        id: 10,
        quoteNumber: "Q-FROZEN",
        projectName: "Frozen project",
        lineItems: [{ description: "Frozen scope" }],
      },
    } as unknown as QuoteWithDetails);

    expect(resolved.projectName).toBe("Frozen project");
    expect(resolved.lineItems).toEqual([{ description: "Frozen scope" }]);
    expect(resolved.dealStage).toBe("closed_won");
    expect(resolved.versionNumber).toBe(3);
  });

});
