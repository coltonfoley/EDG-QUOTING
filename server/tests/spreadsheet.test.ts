import { describe, expect, it } from "vitest";
import {
  readSpreadsheetRows,
  spreadsheetRowsToCsv,
  spreadsheetRowsToRecords,
} from "@shared/spreadsheet";

describe("spreadsheet parsing", () => {
  it("parses quoted CSV fields and converts rows to records", async () => {
    const csv = 'Name,Description,Price\nShade,"Large, motorized",1250\n';
    const rows = await readSpreadsheetRows(new TextEncoder().encode(csv), "csv");

    expect(rows).toEqual([
      ["Name", "Description", "Price"],
      ["Shade", "Large, motorized", "1250"],
    ]);
    expect(spreadsheetRowsToRecords(rows)).toEqual([
      { Name: "Shade", Description: "Large, motorized", Price: "1250" },
    ]);
  });

  it("escapes CSV output safely", () => {
    expect(spreadsheetRowsToCsv([["Name", "Description"], ["Shade", 'He said "yes", today']]))
      .toBe('Name,Description\nShade,"He said ""yes"", today"');
  });
});
