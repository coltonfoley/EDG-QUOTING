export const quoteApprovalDrawingStatusValues = [
  "draft",
  "ready_for_agreement",
  "sent_for_signature",
  "signed_locked",
  "revision_needed",
  "superseded",
] as const;

export const quoteApprovalDrawingOrderStatusValues = [
  "not_reviewed",
  "reviewed",
  "order_ready",
  "override_released",
  "blocked",
] as const;

export type QuoteApprovalDrawingStatus = typeof quoteApprovalDrawingStatusValues[number];
export type QuoteApprovalDrawingOrderStatus = typeof quoteApprovalDrawingOrderStatusValues[number];
export type ApprovalDrawingSide = "A" | "B" | "C" | "D";
export type ApprovalDrawingSideFeatureType =
  | "motorized_screen"
  | "sliding_privacy_wall"
  | "lumon_glass_wall"
  | "other";

export type ApprovalDrawingSideFeature = {
  id: string;
  type: ApprovalDrawingSideFeatureType;
  label?: string;
  color?: string;
  span?: DimensionValue;
  height?: DimensionValue;
};

export const ORDER_APPROVAL_DRAWING_DISCLAIMER =
  "This Order Approval Drawing records the layout, dimensions, colors, and selected options EDG intends to use for ordering and installation planning. It is not a permit drawing, engineering drawing, sealed plan, or manufacturer shop drawing.";

export const ORDER_APPROVAL_SIGNATURE_CONSENT =
  "I have reviewed the Order Approval Drawing and approve the listed dimensions, colors, layout, and selected options for EDG's order release. I understand field conditions, HOA/code/permit review, engineering, manufacturer review, or written revisions may affect final installation details, pricing, or timeline.";

export type DimensionValue = {
  display: string;
  inches?: number;
  mm?: number;
};

export type LouveredRoofApprovalDrawingData = {
  schemaVersion: 1;
  units: "ft-in" | "in" | "mm";
  orientation: {
    sideLabelMode: "abcd";
    referenceSide: ApprovalDrawingSide;
    referenceSideLabel?: string;
    compassBySide?: Partial<Record<ApprovalDrawingSide, "north" | "east" | "south" | "west">>;
    northArrow?: boolean;
  };
  layout: {
    mountType: "attached" | "freestanding" | "other";
    overallLength: DimensionValue;
    overallProjection: DimensionValue;
    measurementBasis?: string;
    finishedHeight?: DimensionValue;
    clearanceHeight?: DimensionValue;
    louverDirection?: "length" | "projection" | "unknown";
    zones?: Array<{
      id: string;
      label: string;
      length?: DimensionValue;
      projection?: DimensionValue;
    }>;
  };
  colors: {
    frameColor?: string;
    louverColor?: string;
    postTrimGutterColor?: string;
    screenColor?: string;
    wallColor?: string;
  };
  posts: Array<{
    id: string;
    label: string;
    x: number;
    y: number;
    height?: DimensionValue;
    note?: string;
  }>;
  sides: Array<{
    side: ApprovalDrawingSide;
    label?: string;
    length?: DimensionValue;
    enclosureSpan?: DimensionValue;
    enclosureHeight?: DimensionValue;
    openingHeight?: DimensionValue;
    enclosure:
      | { type: "none" }
      | { type: "motorized_screen"; label?: string; color?: string }
      | { type: "sliding_privacy_wall"; label?: string; color?: string }
      | { type: "lumon_glass_wall"; label?: string }
      | { type: "other"; label: string };
    features?: ApprovalDrawingSideFeature[];
    notes?: string;
  }>;
  lights: Array<{
    id: string;
    type: "led_strip" | "spot" | "fan_light" | "other";
    location: string;
    quantity?: number;
    side?: ApprovalDrawingSide;
    note?: string;
  }>;
  approvals: {
    fieldVerifiedBy?: string;
    fieldVerifiedAt?: string;
    fieldVerifiedSource?: "field_measure" | "customer_measure" | "manufacturer_config" | "other";
    preparedBy?: string;
    preparedAt?: string;
    customerApprovalCopy: string;
    noTbdValuesConfirmed?: boolean;
  };
};

type ApprovalDrawingLike = {
  id: number;
  quoteId?: number | null;
  status?: string | null;
  manufacturer?: string | null;
  productSystem?: string | null;
  title?: string | null;
  revisionLabel?: string | null;
  drawingData?: unknown;
  publicSnapshot?: unknown;
  customerNotes?: string | null;
  readyAt?: Date | string | null;
  sentForSignatureAt?: Date | string | null;
  signedLockedAt?: Date | string | null;
};

const sideLabels: ApprovalDrawingSide[] = ["A", "B", "C", "D"];

const blankDimension = (): DimensionValue => ({ display: "" });

function coerceUnitCoordinate(value: unknown, fallback: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(1, Math.max(0, numeric));
}

function normalizePost(
  post: Partial<LouveredRoofApprovalDrawingData["posts"][number]>,
  index: number,
): LouveredRoofApprovalDrawingData["posts"][number] {
  const fallback = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ][index] || { x: 0.5, y: 0.5 };

  return {
    id: String(post.id || `post-${index + 1}`),
    label: String(post.label || `P${index + 1}`),
    x: coerceUnitCoordinate(post.x, fallback.x),
    y: coerceUnitCoordinate(post.y, fallback.y),
    height: post.height,
    note: post.note,
  };
}

function normalizeSideFeature(
  feature: Partial<ApprovalDrawingSideFeature>,
  side: ApprovalDrawingSide,
  index: number,
): ApprovalDrawingSideFeature | null {
  if (
    feature.type !== "motorized_screen" &&
    feature.type !== "sliding_privacy_wall" &&
    feature.type !== "lumon_glass_wall" &&
    feature.type !== "other"
  ) {
    return null;
  }

  return {
    id: String(feature.id || `${side}-${feature.type}-${index + 1}`),
    type: feature.type,
    label: feature.label,
    color: feature.color,
    span: feature.span,
    height: feature.height,
  };
}

function sideFeaturesFromLegacyEnclosure(
  side: Partial<LouveredRoofApprovalDrawingData["sides"][number]>,
): ApprovalDrawingSideFeature[] {
  const enclosure = side.enclosure;
  if (!enclosure || enclosure.type === "none") return [];
  const feature = normalizeSideFeature({
    id: `${side.side || "side"}-${enclosure.type}`,
    type: enclosure.type,
    label: "label" in enclosure ? enclosure.label : undefined,
    color: "color" in enclosure ? enclosure.color : undefined,
    span: side.enclosureSpan || side.length,
    height: side.enclosureHeight || side.openingHeight,
  }, side.side || "A", 0);
  return feature ? [feature] : [];
}

function legacyEnclosureFromFeatures(features: ApprovalDrawingSideFeature[]): LouveredRoofApprovalDrawingData["sides"][number]["enclosure"] {
  const first = features[0];
  if (!first) return { type: "none" };
  if (first.type === "other") return { type: "other", label: first.label || "Other" };
  if (first.type === "motorized_screen") return { type: "motorized_screen", label: first.label, color: first.color };
  if (first.type === "sliding_privacy_wall") return { type: "sliding_privacy_wall", label: first.label, color: first.color };
  return { type: "lumon_glass_wall", label: first.label };
}

function normalizeSide(
  side: Partial<LouveredRoofApprovalDrawingData["sides"][number]> | undefined,
  sideLabel: ApprovalDrawingSide,
): LouveredRoofApprovalDrawingData["sides"][number] {
  const rawFeatures = Array.isArray(side?.features)
    ? side.features
        .map((feature, index) => normalizeSideFeature(feature, sideLabel, index))
        .filter((feature): feature is ApprovalDrawingSideFeature => Boolean(feature))
    : sideFeaturesFromLegacyEnclosure({ ...side, side: sideLabel });

  return {
    side: sideLabel,
    label: side?.label || (sideLabel === "A" ? "House/wall side" : `Side ${sideLabel}`),
    length: side?.length,
    enclosureSpan: side?.enclosureSpan,
    enclosureHeight: side?.enclosureHeight,
    openingHeight: side?.openingHeight,
    enclosure: legacyEnclosureFromFeatures(rawFeatures),
    features: rawFeatures,
    notes: side?.notes,
  };
}

export function createDefaultApprovalDrawingData(
  overrides: Partial<LouveredRoofApprovalDrawingData> = {},
): LouveredRoofApprovalDrawingData {
  const base: LouveredRoofApprovalDrawingData = {
    schemaVersion: 1,
    units: "ft-in",
    orientation: {
      sideLabelMode: "abcd",
      referenceSide: "A",
      referenceSideLabel: "House/wall side",
      northArrow: false,
    },
    layout: {
      mountType: "attached",
      overallLength: blankDimension(),
      overallProjection: blankDimension(),
      measurementBasis: "Field verified outside dimensions",
      louverDirection: "unknown",
    },
    colors: {},
    posts: [
      { id: "post-a", label: "P1", x: 0, y: 0 },
      { id: "post-b", label: "P2", x: 1, y: 0 },
      { id: "post-c", label: "P3", x: 1, y: 1 },
      { id: "post-d", label: "P4", x: 0, y: 1 },
    ],
    sides: sideLabels.map((side) => ({
      side,
      label: side === "A" ? "House/wall side" : `Side ${side}`,
      enclosure: { type: "none" },
      features: [],
    })),
    lights: [],
    approvals: {
      customerApprovalCopy: ORDER_APPROVAL_DRAWING_DISCLAIMER,
      fieldVerifiedSource: "field_measure",
      noTbdValuesConfirmed: false,
    },
  };

  return {
    ...base,
    ...overrides,
    orientation: { ...base.orientation, ...(overrides.orientation || {}) },
    layout: { ...base.layout, ...(overrides.layout || {}) },
    colors: { ...base.colors, ...(overrides.colors || {}) },
    posts: overrides.posts || base.posts,
    sides: overrides.sides || base.sides,
    lights: overrides.lights || base.lights,
    approvals: { ...base.approvals, ...(overrides.approvals || {}) },
  };
}

export function normalizeApprovalDrawingData(input: unknown): LouveredRoofApprovalDrawingData {
  if (!input || typeof input !== "object") {
    return createDefaultApprovalDrawingData();
  }

  const raw = input as Partial<LouveredRoofApprovalDrawingData>;
  const normalized = createDefaultApprovalDrawingData(raw);

  return {
    ...normalized,
    posts: normalized.posts.map(normalizePost),
    sides: sideLabels.map((side) => normalizeSide(
      normalized.sides.find((row) => row.side === side),
      side,
    )),
  };
}

export function formatDimension(value?: DimensionValue | null): string {
  return value?.display?.trim() || "";
}

export function formatApprovalDrawingLightType(type?: string | null): string {
  switch (type) {
    case "led_strip":
      return "LED strip";
    case "spot":
      return "Spot light";
    case "fan_light":
      return "Fan light";
    case "other":
      return "Accessory";
    default:
      return "Light/accessory";
  }
}

export function formatApprovalDrawingLightLabel(
  light: Pick<LouveredRoofApprovalDrawingData["lights"][number], "type" | "location" | "quantity" | "side">,
): string {
  const quantity = light.quantity && light.quantity > 1 ? `${light.quantity} ` : "";
  const location = light.location?.trim();
  let typeLabel = formatApprovalDrawingLightType(light.type);
  if (light.quantity && light.quantity > 1) {
    if (typeLabel === "Spot light") typeLabel = "Spot lights";
    if (typeLabel === "Fan light") typeLabel = "Fan lights";
    if (typeLabel === "LED strip") typeLabel = "LED strips";
  }

  const sidePrefix = light.side ? `Side ${light.side} - ` : "";

  if (!location) return `${sidePrefix}${quantity}${typeLabel}`.trim();

  const normalizedLocation = location.replace(/^\d+\s+/i, "").trim();
  const locationAlreadyNamesType =
    /led\s*strip|spot\s*light|fan\s*light|accessor/i.test(normalizedLocation);

  if (light.type === "other" || locationAlreadyNamesType) {
    return `${sidePrefix}${quantity}${normalizedLocation}`.trim();
  }

  return `${sidePrefix}${quantity}${typeLabel} - ${normalizedLocation}`.trim();
}

export function parseApprovalDrawingLightLine(line: string, index: number): LouveredRoofApprovalDrawingData["lights"][number] {
  const rawLine = line.trim();
  const sideMatch = rawLine.match(/^side\s*([abcd])\s*[-:]\s*(.*)$/i);
  const side = sideMatch ? sideMatch[1].toUpperCase() as ApprovalDrawingSide : undefined;
  const raw = (sideMatch ? sideMatch[2] : rawLine).trim();
  const quantityMatch = raw.match(/^(\d+)\s+(.*)$/);
  const quantity = quantityMatch ? Number(quantityMatch[1]) : 1;
  const withoutQuantity = (quantityMatch ? quantityMatch[2] : raw).trim();
  const lower = withoutQuantity.toLowerCase();

  let type: LouveredRoofApprovalDrawingData["lights"][number]["type"] = "other";
  let location = withoutQuantity;

  if (lower.includes("led") && lower.includes("strip")) {
    type = "led_strip";
    location = withoutQuantity.replace(/led\s*strip\s*-?/i, "").trim() || withoutQuantity;
  } else if (lower.includes("spot")) {
    type = "spot";
    location = withoutQuantity.replace(/spot\s*(lights?|fixtures?)?\s*-?/i, "").trim();
  } else if (lower.includes("fan")) {
    type = "fan_light";
    location = withoutQuantity.replace(/fan\s*(lights?)?\s*-?/i, "").trim();
  }

  return {
    id: `light-${index + 1}`,
    type,
    quantity,
    location,
    side,
  };
}

export function formatApprovalDrawingLouverDirection(value?: string | null): string {
  if (value === "length") return "Louvers run with length";
  if (value === "projection") return "Louvers run with projection";
  return "Louver direction not set";
}

export function formatApprovalDrawingEnclosureType(type?: string | null): string {
  switch (type) {
    case "motorized_screen":
      return "Motorized screen";
    case "sliding_privacy_wall":
      return "Sliding privacy wall";
    case "lumon_glass_wall":
      return "Lumon glass wall";
    case "other":
      return "Other enclosure";
    case "none":
    default:
      return "None";
  }
}

export function formatApprovalDrawingSideFeatureType(type?: string | null): string {
  return formatApprovalDrawingEnclosureType(type);
}

export function getApprovalDrawingSideFeatures(
  side: Pick<LouveredRoofApprovalDrawingData["sides"][number], "side" | "enclosure" | "features" | "enclosureSpan" | "enclosureHeight" | "length" | "openingHeight">,
): ApprovalDrawingSideFeature[] {
  if (Array.isArray(side.features) && side.features.length > 0) {
    return side.features
      .map((feature, index) => normalizeSideFeature(feature, side.side, index))
      .filter((feature): feature is ApprovalDrawingSideFeature => Boolean(feature));
  }
  return sideFeaturesFromLegacyEnclosure(side);
}

function hasDimension(value?: DimensionValue | null): boolean {
  if (!value) return false;
  if (typeof value.display === "string" && value.display.trim()) return true;
  return typeof value.inches === "number" || typeof value.mm === "number";
}

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasTbdValue(value: unknown): boolean {
  if (typeof value === "string") {
    return /\b(tbd|to be determined|n\/a pending)\b/i.test(value);
  }

  if (Array.isArray(value)) {
    return value.some(hasTbdValue);
  }

  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(hasTbdValue);
  }

  return false;
}

export function getApprovalDrawingReadiness(input: unknown): { ready: boolean; missing: string[] } {
  const data = normalizeApprovalDrawingData(input);
  const missing: string[] = [];

  if (!hasDimension(data.layout.overallLength)) missing.push("overall length");
  if (!hasDimension(data.layout.overallProjection)) missing.push("projection/depth");
  if (!hasText(data.layout.measurementBasis)) missing.push("measurement basis");
  if (!data.orientation.referenceSide) missing.push("reference side");
  if (!data.layout.mountType) missing.push("mount type");
  if (!data.layout.louverDirection || data.layout.louverDirection === "unknown") missing.push("louver direction");
  if (!hasText(data.colors.frameColor)) missing.push("frame color");
  if (!hasText(data.colors.louverColor)) missing.push("louver color");

  const sidesByLabel = new Map(data.sides.map((side) => [side.side, side]));
  for (const side of sideLabels) {
    const sideRow = sidesByLabel.get(side);
    if (!sideRow) {
      missing.push(`side ${side}`);
      continue;
    }

    const sideFeatures = getApprovalDrawingSideFeatures(sideRow);
    for (const feature of sideFeatures) {
      if (!hasDimension(feature.span) && !hasDimension(sideRow.enclosureSpan) && !hasDimension(sideRow.length)) {
        missing.push(`side ${side} ${formatApprovalDrawingSideFeatureType(feature.type)} span`);
      }
      if (!hasDimension(feature.height) && !hasDimension(sideRow.enclosureHeight) && !hasDimension(sideRow.openingHeight)) {
        missing.push(`side ${side} ${formatApprovalDrawingSideFeatureType(feature.type)} height/opening`);
      }
    }
  }

  if (!data.posts.length) {
    missing.push("post/column locations");
  }

  const hasHeight =
    hasDimension(data.layout.finishedHeight) ||
    hasDimension(data.layout.clearanceHeight) ||
    data.posts.some((post) => hasDimension(post.height));
  if (!hasHeight) {
    missing.push("finished height or post height");
  }

  if (!hasText(data.approvals.fieldVerifiedBy)) missing.push("field verified by");
  if (!hasText(data.approvals.fieldVerifiedAt)) missing.push("field verified date");
  if (!data.approvals.fieldVerifiedSource) missing.push("field verification source");
  if (data.approvals.noTbdValuesConfirmed !== true) missing.push("no TBD values confirmation");
  if (hasTbdValue(data)) missing.push("remove TBD/unknown values");

  return {
    ready: missing.length === 0,
    missing,
  };
}

export function isApprovalDrawingFrozen(status?: string | null): boolean {
  return status === "sent_for_signature" || status === "signed_locked";
}

export function sanitizeQuoteApprovalDrawingForPublic(drawing: ApprovalDrawingLike | null | undefined) {
  if (!drawing) return null;

  if (drawing.publicSnapshot && typeof drawing.publicSnapshot === "object") {
    return drawing.publicSnapshot;
  }

  return {
    id: drawing.id,
    quoteId: drawing.quoteId ?? null,
    status: drawing.status || "draft",
    title: drawing.title || "Order Approval Drawing",
    manufacturer: drawing.manufacturer || null,
    productSystem: drawing.productSystem || null,
    revisionLabel: drawing.revisionLabel || null,
    drawingData: normalizeApprovalDrawingData(drawing.drawingData),
    customerNotes: drawing.customerNotes || null,
    disclaimer: ORDER_APPROVAL_DRAWING_DISCLAIMER,
    readyAt: drawing.readyAt || null,
    sentForSignatureAt: drawing.sentForSignatureAt || null,
    signedLockedAt: drawing.signedLockedAt || null,
  };
}

export function inferSupportedApprovalDrawingManufacturer(lineItems: Array<{ manufacturer?: string | null; description?: string | null }> = []): string | null {
  const haystack = lineItems
    .map((item) => `${item.manufacturer || ""} ${item.description || ""}`.toLowerCase())
    .join(" ");

  if (haystack.includes("azenco")) return "Azenco";
  if (haystack.includes("brustor")) return "Brustor";
  if (haystack.includes("sundance")) return "Sundance";
  return null;
}

export function quoteNeedsApprovalDrawing(lineItems: Array<{ manufacturer?: string | null; description?: string | null }> = []): boolean {
  return inferSupportedApprovalDrawingManufacturer(lineItems) !== null;
}
