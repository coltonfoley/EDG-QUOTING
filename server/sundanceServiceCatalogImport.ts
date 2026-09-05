import { SUNDANCE_SERVICE_CATALOG_ROWS } from "./sundanceServices";

export type ExistingSundanceServiceRow = {
  id: number;
  sku: string | null;
  name: string;
  manufacturer: string;
  category: string | null;
  productType: string;
  unit: string | null;
  retailPrice: string;
  defaultUnitPrice: string;
  costPrice: string;
};

export function planSundanceServiceCatalogImport(existingRows: ExistingSundanceServiceRow[]) {
  return SUNDANCE_SERVICE_CATALOG_ROWS.map((row) => {
    const matches = existingRows.filter((existing) => existing.sku?.toLowerCase() === row.sku.toLowerCase()
      || (existing.manufacturer.toLowerCase() === "sundance" && existing.name.toLowerCase() === row.name.toLowerCase()));
    if (!matches.length) return { action: "insert" as const, row, productId: null, reasons: [] as string[] };
    if (matches.length !== 1) {
      return { action: "conflict" as const, row, productId: null, reasons: ["Multiple catalog rows match this service identity."] };
    }
    const existing = matches[0];
    const reasons: string[] = [];
    for (const key of ["sku", "name", "manufacturer", "category", "productType", "unit"] as const) {
      if (existing[key] !== row[key]) reasons.push(`Existing ${key} does not match the confirmed service.`);
    }
    for (const key of ["retailPrice", "defaultUnitPrice"] as const) {
      if (Number(existing[key]) !== row.customerPrice) reasons.push(`Existing ${key} does not match the confirmed customer price.`);
    }
    if (!Number.isFinite(Number(existing.costPrice)) || Number(existing.costPrice) < 0) {
      reasons.push("Existing cost is invalid; it will not be overwritten.");
    }
    return { action: reasons.length ? "conflict" as const : "unchanged" as const, row, productId: existing.id, reasons };
  });
}

type CatalogImportClient = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: ExistingSundanceServiceRow[] }>;
};

/** Read-only by default. Applies only the absent, confirmed service rows as one transaction. */
export async function runSundanceServiceCatalogImport(client: CatalogImportClient, apply = false) {
  await client.query(apply ? "BEGIN" : "BEGIN READ ONLY");
  try {
    if (apply) {
      // products.sku is not unique. Serialize inserts with other product writers
      // while checking for identity/price conflicts; never update an existing row.
      await client.query("LOCK TABLE products IN SHARE ROW EXCLUSIVE MODE");
    }
    const existing = await client.query(`
      SELECT id, sku, name, manufacturer, category, product_type AS "productType", unit,
             retail_price AS "retailPrice", default_unit_price AS "defaultUnitPrice", cost_price AS "costPrice"
      FROM products
      WHERE lower(sku) = ANY($1::text[])
         OR (lower(manufacturer) = 'sundance' AND lower(name) = ANY($2::text[]))
      ORDER BY id
    `, [SUNDANCE_SERVICE_CATALOG_ROWS.map((row) => row.sku.toLowerCase()), SUNDANCE_SERVICE_CATALOG_ROWS.map((row) => row.name.toLowerCase())]);
    const plan = planSundanceServiceCatalogImport(existing.rows);
    if (!apply || plan.some((item) => item.action === "conflict")) {
      await client.query("ROLLBACK");
      return { mode: apply ? "apply" as const : "dry-run" as const, committed: false, plan };
    }
    for (const item of plan.filter((item) => item.action === "insert")) {
      const row = item.row;
      await client.query(`
        INSERT INTO products (sku, name, description, manufacturer, category, product_type, unit,
                              retail_price, default_unit_price, cost_price, default_discount_type, default_discount_value)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'percentage', '0.00')
      `, [row.sku, row.name, row.description, row.manufacturer, row.category, row.productType, row.unit,
        row.retailPrice, row.defaultUnitPrice, row.costPrice]);
    }
    await client.query("COMMIT");
    return { mode: "apply" as const, committed: true, plan };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}
