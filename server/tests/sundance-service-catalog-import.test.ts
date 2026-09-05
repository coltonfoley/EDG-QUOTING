import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { planSundanceServiceCatalogImport, runSundanceServiceCatalogImport } from "../sundanceServiceCatalogImport";
import { SUNDANCE_SERVICE_CATALOG_ROWS } from "../sundanceServices";

let db: PGlite;
beforeEach(async () => {
  db = new PGlite();
  await db.exec(`CREATE TABLE products (
    id serial PRIMARY KEY, sku text, name text NOT NULL, description text, manufacturer text NOT NULL,
    category text, product_type text NOT NULL DEFAULT 'simple', unit text,
    retail_price numeric(10,2) NOT NULL, default_unit_price numeric(10,2) NOT NULL,
    cost_price numeric(10,2) NOT NULL, default_discount_type text, default_discount_value numeric(10,2)
  )`);
});
afterEach(async () => { await db.close(); });

describe("confirmed Sundance service import", () => {
  it("defaults to a read-only plan for exactly three sale prices with unknown costs", async () => {
    const result = await runSundanceServiceCatalogImport(db);
    expect(result).toMatchObject({ mode: "dry-run", committed: false });
    expect(result.plan.map((item) => [item.action, item.row.sku, item.row.retailPrice, item.row.costPrice])).toEqual([
      ["insert", "EDG-SD-DRAWINGS", "500.00", "0.00"],
      ["insert", "EDG-SD-ENGINEERING", "3000.00", "0.00"],
      ["insert", "EDG-SD-DRAWINGS-ENGINEERING", "3500.00", "0.00"],
    ]);
    expect((await db.query("SELECT * FROM products")).rows).toEqual([]);
  });

  it("inserts once, preserves existing rows, and leaves later established costs untouched", async () => {
    await db.exec("INSERT INTO products (sku,name,manufacturer,retail_price,default_unit_price,cost_price) VALUES ('unrelated','Existing product','Other',12,12,7)");
    const first = await runSundanceServiceCatalogImport(db, true);
    expect(first.committed).toBe(true);
    await db.exec("UPDATE products SET cost_price=150 WHERE sku='EDG-SD-DRAWINGS'");
    const before = (await db.query("SELECT * FROM products ORDER BY id")).rows;
    const second = await runSundanceServiceCatalogImport(db, true);
    expect(second.plan.every((item) => item.action === "unchanged")).toBe(true);
    expect((await db.query("SELECT * FROM products ORDER BY id")).rows).toEqual(before);
    expect(before).toHaveLength(4);
  });

  it("aborts all inserts when an existing service has a different sale price", async () => {
    await db.exec("INSERT INTO products (sku,name,manufacturer,category,product_type,unit,retail_price,default_unit_price,cost_price) VALUES ('EDG-SD-ENGINEERING','Stamped engineering','Sundance','Services','simple','each',2900,2900,0)");
    const before = (await db.query("SELECT * FROM products")).rows;
    const result = await runSundanceServiceCatalogImport(db, true);
    expect(result.committed).toBe(false);
    expect(result.plan[1].action).toBe("conflict");
    expect((await db.query("SELECT * FROM products")).rows).toEqual(before);
  });

  it("refuses duplicate or conflicting service identities without resolving them destructively", () => {
    const row = { ...SUNDANCE_SERVICE_CATALOG_ROWS[0], id: 1 };
    expect(planSundanceServiceCatalogImport([row, { ...row, id: 2 }])[0].action).toBe("conflict");
    expect(planSundanceServiceCatalogImport([{ ...row, manufacturer: "Other" }])[0].action).toBe("conflict");
    expect(planSundanceServiceCatalogImport([{ ...row, sku: "existing-service-sku" }])[0].action).toBe("conflict");
    expect(planSundanceServiceCatalogImport([{ ...row, sku: row.sku.toLowerCase() }])[0].action).toBe("conflict");
  });

  it("rolls back the first insert if a later insert fails", async () => {
    await db.exec("ALTER TABLE products ADD CONSTRAINT simulated_failure CHECK (sku <> 'EDG-SD-ENGINEERING')");
    await expect(runSundanceServiceCatalogImport(db, true)).rejects.toThrow();
    expect((await db.query("SELECT * FROM products")).rows).toEqual([]);
  });
});
