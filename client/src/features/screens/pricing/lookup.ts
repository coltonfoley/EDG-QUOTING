export type Matrix = {
  meta: { heightMax: number; notes?: string[] };
  table: Record<string, Record<string, number>>;
  housingRules: Array<{ maxW: number; maxH: number; housing: string; roller: string }>;
  adders: {
    remote?: number;
    uChannelPerLf?: number | null;
    colorUpchargePct?: number;
    fabricUpcharges?: Record<string, number>;
  };
  specialQuoteFlags?: { fabrics?: string[] };
};

export function bucket(valueIn: number, stops: number[]) {
  const sorted = [...stops].sort((a, b) => a - b);
  for (const s of sorted) if (valueIn <= s) return s;
  return sorted[sorted.length - 1];
}

export function computeBase(matrix: Matrix, widthIn: number, heightIn: number) {
  const hStops = Object.keys(matrix.table).map(Number);
  const firstRow = Object.values(matrix.table)[0];
  if (!firstRow) throw new Error("matrix table empty");
  const wStops = Object.keys(firstRow).map(Number);
  const h = bucket(heightIn, hStops);
  const w = bucket(widthIn, wStops);
  return matrix.table[String(h)][String(w)];
}

export function selectHousing(matrix: Matrix, w: number, h: number) {
  return (
    matrix.housingRules.find(r => w <= r.maxW && h <= r.maxH) ??
    matrix.housingRules[matrix.housingRules.length - 1]
  );
}

export function addersTotal(matrix: Matrix, opts: {
  remotesQty?: number;
  uChannelLf?: number;
  fabricKey?: string;
  colorNonStandard?: boolean;
}) {
  let extra = 0, pct = 0, notes: string[] = [];
  if (opts.remotesQty && matrix.adders.remote) extra += opts.remotesQty * matrix.adders.remote;
  if (opts.uChannelLf && matrix.adders.uChannelPerLf) extra += opts.uChannelLf * matrix.adders.uChannelPerLf;
  if (opts.colorNonStandard && matrix.adders.colorUpchargePct) pct += matrix.adders.colorUpchargePct;
  if (opts.fabricKey && matrix.adders.fabricUpcharges?.[opts.fabricKey]) pct += matrix.adders.fabricUpcharges[opts.fabricKey];
  if (opts.fabricKey && matrix.specialQuoteFlags?.fabrics?.includes(opts.fabricKey)) notes.push("Special quote required");
  return { extra, pct, notes };
}

export function priceScreen(matrix: Matrix, w: number, h: number, opts: Parameters<typeof addersTotal>[1]) {
  const base = computeBase(matrix, w, h);
  const { extra, pct, notes } = addersTotal(matrix, opts);
  const subtotal = base + extra;
  const total = Math.round(subtotal * (1 + pct));
  const housing = selectHousing(matrix, w, h);
  return { base, extra, pct, total, housing, notes };
}
