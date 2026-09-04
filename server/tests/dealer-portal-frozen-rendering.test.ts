import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { jsPDF } from "jspdf";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { LineItem } from "../../shared/schema";
import { frozenLine } from "./fixtures/dealer-portal-frozen-line";
import { SortableLineItemRow } from "../../client/src/components/sortable-line-item-row";
import { calculateLineItemTotal, calculateLineItemMargin, formatCurrency } from "../../client/src/lib/utils";
import { calculateSellPrice } from "../../client/src/lib/generate-bom-pdf";
import { drawLineItemsSection } from "../../client/src/lib/pdf-sections";
import { barlowRegularBase64, barlowSemiBoldBase64 } from "../../client/src/lib/fonts";
import { QuoteSummary } from "../../client/src/components/quote-summary";
import { fictionalSignedQuote } from "./fixtures/fictional-signed-quote";

function line(groupId: string | null = null) {
  return { ...frozenLine(), id: 1, quoteId: 1, description: "Frozen beam", sku: "beam16", groupId, configData: null } as LineItem;
}

describe("accepted portal price in rendered rows and PDF paths", () => {
  it("renders the accepted unit/line prices and actual gross loss, with accepted quantity fixed", () => {
    const item = line();
    const row = React.createElement(SortableLineItemRow, {
      item, rowIndex: 0, getCurrentValue: (_id, field) => String(item[field]),
      handleFieldChange: vi.fn(), markActive: vi.fn(), handleKeyDown: vi.fn(), handleFieldBlur: vi.fn(),
      validationErrors: {}, tariffRate: 0, updateLineItemMutation: {}, deleteLineItemMutation: {},
      formatCurrency, calculateLineItemTotal, calculateLineItemMargin,
    });
    const html = renderToStaticMarkup(React.createElement("table", null, React.createElement("tbody", null, row)));
    expect(html).toContain('data-testid="text-price-1">$50.00</td>');
    expect(html).toContain('data-testid="text-total-1">$100.00</td>');
    expect(html).toContain('data-testid="text-margin-1">-$20.00</td>');
    expect(html).toMatch(/<input(?=[^>]*data-testid="input-quantity-1")(?=[^>]*readonly)/);
    expect(html).toContain("Accepted price");
    expect(html).not.toContain('data-testid="input-markup-value-1"');
  });

  it("uses the same accepted cents in the BOM sell-price helper", () => {
    expect(calculateSellPrice(line(), 0)).toEqual({ unitSellPrice: 50, lineTotal: 100 });
    const fractionalPrice = { ...line(), ...frozenLine("3.11", 3, 501) };
    expect(calculateSellPrice(fractionalPrice, 0)).toEqual({ unitSellPrice: 5.01, lineTotal: 15.03 });
    expect(() => calculateSellPrice({ ...line(), retailPrice: "60.00" }, 0)).toThrow("frozen price evidence");
  });

  it("keeps frozen evidence through the rendered quote summary", () => {
    const quote = { ...fictionalSignedQuote, lineItems: [line()], taxRate: "0", tariffRate: "0", discount: "0", shipping: "0" };
    const client = new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false } } });
    client.setQueryData(["/api/contract-templates"], []);
    const html = renderToStaticMarkup(React.createElement(QueryClientProvider, { client }, React.createElement(QuoteSummary, { quote, onUpdateQuote: vi.fn(), isReadOnly: true })));
    expect(html).toContain("$100.00");
    expect(html).not.toContain("$240.00");
    client.clear();
  });

  it.each([null, "materials"])("draws accepted PDF row/group and summary amounts for group %s", (groupId) => {
    const pdf = new jsPDF({ unit: "mm", format: "letter" });
    pdf.addFileToVFS("Barlow-Regular.ttf", barlowRegularBase64);
    pdf.addFont("Barlow-Regular.ttf", "Barlow-Regular", "normal");
    pdf.addFileToVFS("Barlow-SemiBold.ttf", barlowSemiBoldBase64);
    pdf.addFont("Barlow-SemiBold.ttf", "Barlow-SemiBold", "normal");
    const calls = vi.spyOn(pdf, "text");
    drawLineItemsSection(pdf, {
      quote: { lineItems: [line(groupId)], taxRate: 0, discount: 0, shipping: 0, tariffRate: 0 },
      showPricing: true, logoDataUrl: "data:image/png;base64,AA==",
      company: { name: "Test only", address: "Test", phone: "Test", email: "test@example.invalid" },
      margin: 15, contentW: 185.9, pageW: 215.9, pageH: 279.4,
      groups: groupId ? [{ id: groupId, title: "Materials", position: 0 }] : [],
    });
    const drawnText = calls.mock.calls.flatMap(([value]) => Array.isArray(value) ? value : [value]);
    expect(drawnText.filter((value) => value === "$100.00").length).toBeGreaterThanOrEqual(3);
    expect(drawnText).not.toContain("$240.00");
    expect(pdf.output("arraybuffer").byteLength).toBeGreaterThan(1000);
  });
});
