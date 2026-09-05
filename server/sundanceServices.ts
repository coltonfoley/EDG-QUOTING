/**
 * Confirmed customer service prices from EDG's Sundance Notes, reviewed 2026-09-05.
 * These are sale prices, not supplier costs. Do not apply material markup to them.
 * https://docs.google.com/document/d/194zJ_0VW-yn6WFqLuSo-zbo5aGXbwIawA3l1EbiMvnY/edit
 * Keep identifiers aligned with the portal's products/sundance/options.ts contract.
 */
export const SUNDANCE_SERVICES = {
  drawings: {
    sku: "EDG-SD-DRAWINGS",
    name: "Project drawings",
    customerPrice: 500,
    description: "EDG project drawings for review. Separate from the automatic materials build plan; no engineering stamp is included. Customer service price confirmed; internal cost is not established.",
  },
  engineering: {
    sku: "EDG-SD-ENGINEERING",
    name: "Stamped engineering",
    customerPrice: 3000,
    description: "Project-specific engineering review and stamped documents after the required project information is confirmed. Customer service price confirmed; internal cost is not established.",
  },
  "drawings-and-engineering": {
    sku: "EDG-SD-DRAWINGS-ENGINEERING",
    name: "Drawings with stamped engineering",
    customerPrice: 3500,
    description: "Project drawings and project-specific stamped engineering together. Combined customer service price confirmed; internal cost is not established.",
  },
} as const;

export const SUNDANCE_SERVICE_CATALOG_ROWS = Object.values(SUNDANCE_SERVICES).map((service) => ({
  ...service,
  manufacturer: "Sundance" as const,
  category: "Services" as const,
  productType: "simple" as const,
  unit: "each" as const,
  retailPrice: service.customerPrice.toFixed(2),
  defaultUnitPrice: service.customerPrice.toFixed(2),
  // The existing schema requires a number. Zero means unknown, not free fulfillment.
  costPrice: "0.00",
}));

export function getSundanceServiceBySku(sku: string | null) {
  return Object.values(SUNDANCE_SERVICES).find((service) => service.sku.toLowerCase() === sku?.toLowerCase());
}
