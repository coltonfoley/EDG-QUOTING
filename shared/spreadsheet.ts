export type SpreadsheetFormat = "csv" | "excel";
export type SpreadsheetRow = Array<string | number>;
export type SpreadsheetRecord = Record<string, string | number>;

function parseCsv(text: string): SpreadsheetRow[] {
  const rows: SpreadsheetRow[] = [];
  let row: SpreadsheetRow = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (character !== "\r") {
      field += character;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function decodeText(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  return new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "");
}

export async function readSpreadsheetRows(
  data: ArrayBuffer | Uint8Array,
  format: SpreadsheetFormat,
): Promise<SpreadsheetRow[]> {
  if (format === "csv") {
    return parseCsv(decodeText(data));
  }

  const { readSheet } = await import("read-excel-file/universal");
  const arrayBuffer = data instanceof Uint8Array
    ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
    : data;
  const rows = await readSheet(arrayBuffer);

  return rows.map((row) => row.map((value) => {
    if (value === null || value === undefined) return "";
    if (typeof value === "number") return value;
    if (value instanceof Date) return value.toISOString();
    return String(value);
  }));
}

export function spreadsheetRowsToRecords(rows: SpreadsheetRow[]): SpreadsheetRecord[] {
  if (!rows.length) return [];

  const usedHeaders = new Map<string, number>();
  const headers = rows[0].map((value, index) => {
    const base = String(value || `Column ${index + 1}`).trim() || `Column ${index + 1}`;
    const count = (usedHeaders.get(base) || 0) + 1;
    usedHeaders.set(base, count);
    return count === 1 ? base : `${base} ${count}`;
  });

  return rows.slice(1).flatMap((row) => {
    if (row.every((value) => String(value ?? "").trim() === "")) return [];
    const record: SpreadsheetRecord = {};
    headers.forEach((header, index) => {
      record[header] = row[index] ?? "";
    });
    return [record];
  });
}

export function spreadsheetRowsToCsv(rows: SpreadsheetRow[]): string {
  return rows.map((row) => row.map((value) => {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }).join(",")).join("\n");
}
