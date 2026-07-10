import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("database logging security", () => {
  it("does not serialize pool errors that can contain database credentials", () => {
    const databaseSource = readFileSync(resolve(process.cwd(), "server/db.ts"), "utf8");

    expect(databaseSource).toContain("errorType: error instanceof Error");
    expect(databaseSource).not.toContain("connection will be recycled):', err");
    expect(databaseSource).not.toContain("connectionString: error");
  });
});
