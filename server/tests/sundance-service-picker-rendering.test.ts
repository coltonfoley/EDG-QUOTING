import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { Product } from "../../shared/schema";
import { SUNDANCE_SERVICE_CATALOG_ROWS } from "../sundanceServices";
import { SundanceCatalogConfigurator } from "../../client/src/components/sundance-catalog-configurator";
import { LineItemsTable } from "../../client/src/components/line-items-table";

// Render the native catalog dialog contents without browser portals.
vi.mock("../../client/src/components/ui/dialog", () => {
  const content = ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children);
  return { Dialog: content, DialogTrigger: content, DialogContent: content, DialogHeader: content, DialogTitle: content, DialogDescription: content, DialogFooter: content };
});

const services = SUNDANCE_SERVICE_CATALOG_ROWS.map((service, index) => ({ ...service, id: index + 100 })) as Product[];
const material = { ...services[0], id: 1, name: "Standard material", sku: "STANDARD-MATERIAL", category: "Extrusions", retailPrice: "200.00", costPrice: "80.00" };

function render(component: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false } } });
  client.setQueryData(["/api/products", "Sundance"], [material, ...services]);
  client.setQueryData(["/api/products"], [material, ...services]);
  client.setQueryData(["/api/pricing-defaults/sundance"], { markupType: "percentage", markupValue: "100" });
  const html = renderToStaticMarkup(React.createElement(QueryClientProvider, { client }, component));
  client.clear();
  return html;
}

describe("native material selectors exclude unsupported service pricing", () => {
  it("retains the Sundance materials chooser and directs services to review", () => {
    const html = render(React.createElement(SundanceCatalogConfigurator, { quoteId: 12, onInsert: vi.fn(), onCancel: vi.fn() }));
    expect(html).toContain('data-testid="product-1"');
    for (const service of services) expect(html).not.toContain(`data-testid="product-${service.id}"`);
    expect(html).toContain("Internal costs and service fulfillment need review");
    expect(html).not.toContain("100% profit");
  });

  it("retains generic material selection without exposing the services as zero-cost products", () => {
    const html = render(React.createElement(LineItemsTable, { quoteId: 12, lineItems: [], tariffRate: 0 }));
    expect(html).toContain('data-testid="product-card-1"');
    for (const service of services) expect(html).not.toContain(`data-testid="product-card-${service.id}"`);
    expect(html).toContain("Internal costs and service fulfillment need review");
    expect(html).toContain("$80.00");
  });
});
