import { describe, expect, it } from "vitest";
import { insertLineItemSchema } from "../validation-schemas";

describe("line item validation", () => {
  it("accepts a manual custom item without a catalog product", () => {
    const result = insertLineItemSchema.safeParse({
      quoteId: 721,
      description: "Installation",
      quantity: 1,
      retailPrice: null,
      unitPrice: 0,
      markupType: "percentage",
      markupValue: 0,
      discountType: "percentage",
      discountValue: 0,
      productId: null,
      sku: null,
      manufacturer: null,
      unit: null,
      priceSource: "manual",
      configData: null,
      groupId: null,
      position: 0,
    });

    expect(result.success).toBe(true);
  });
});
