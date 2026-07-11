import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  createDefaultApprovalDrawingData,
  formatApprovalDrawingLightLabel,
  formatApprovalDrawingLouverDirection,
  formatApprovalDrawingSideFeatureType,
  getApprovalDrawingSideFeatures,
  getApprovalDrawingReadiness,
  inferSupportedApprovalDrawingManufacturer,
  normalizeApprovalDrawingData,
  parseApprovalDrawingLightLine,
  quoteNeedsApprovalDrawing,
} from "@shared/approvalDrawing";
import { appendQuoteApprovalDrawingInternalNoteSql } from "../approvalDrawingSql";

const completeApprovalDrawingData = () => createDefaultApprovalDrawingData({
  layout: {
    mountType: "attached",
    overallLength: { display: "16 ft 0 in", inches: 192 },
    overallProjection: { display: "12 ft 0 in", inches: 144 },
    finishedHeight: { display: "9 ft 0 in", inches: 108 },
    measurementBasis: "Field verified outside dimensions",
    louverDirection: "projection",
  },
  colors: {
    frameColor: "Textured white",
    louverColor: "Textured white",
    postTrimGutterColor: "Textured white",
  },
  posts: [
    { id: "post-a", label: "P1", x: 0, y: 0, height: { display: "9 ft 0 in" } },
    { id: "post-b", label: "P2", x: 1, y: 0, height: { display: "9 ft 0 in" } },
    { id: "post-c", label: "P3", x: 1, y: 1, height: { display: "9 ft 0 in" } },
    { id: "post-d", label: "P4", x: 0, y: 1, height: { display: "9 ft 0 in" } },
  ],
  sides: [
    { side: "A", label: "House side", enclosure: { type: "none" } },
    { side: "B", label: "Right side", enclosure: { type: "motorized_screen", color: "White mesh" }, enclosureSpan: { display: "12 ft 0 in" }, enclosureHeight: { display: "8 ft 6 in" } },
    { side: "C", label: "Front side", enclosure: { type: "none" } },
    { side: "D", label: "Left side", enclosure: { type: "none" } },
  ],
  lights: [
    { id: "light-1", type: "led_strip", location: "Perimeter", quantity: 1 },
  ],
  approvals: {
    fieldVerifiedBy: "Jacob",
    fieldVerifiedAt: "2026-06-22",
    fieldVerifiedSource: "field_measure",
    preparedBy: "EDG",
    preparedAt: "2026-06-22",
    customerApprovalCopy: "Customer approval layout only.",
    noTbdValuesConfirmed: true,
  },
});

describe("approval drawing readiness", () => {
  it("requires dimensions, colors, field verification, and non-unknown louver direction", () => {
    const readiness = getApprovalDrawingReadiness(createDefaultApprovalDrawingData());

    expect(readiness.ready).toBe(false);
    expect(readiness.missing).toEqual(expect.arrayContaining([
      "overall length",
      "projection/depth",
      "louver direction",
      "frame color",
      "louver color",
      "field verified by",
      "field verified date",
      "no TBD values confirmation",
    ]));
  });

  it("passes a completed louvered roof approval drawing", () => {
    expect(getApprovalDrawingReadiness(completeApprovalDrawingData())).toEqual({
      ready: true,
      missing: [],
    });
  });

  it("detects supported manufacturers from quote lines", () => {
    const lineItems = [
      { manufacturer: "Azenco", description: "R-Blade louvered roof" },
    ];

    expect(inferSupportedApprovalDrawingManufacturer(lineItems)).toBe("Azenco");
    expect(quoteNeedsApprovalDrawing(lineItems)).toBe(true);
  });

  it("formats customer-facing light and louver labels", () => {
    const parsed = parseApprovalDrawingLightLine("1 LED strip - perimeter", 0);

    expect(parsed).toEqual(expect.objectContaining({
      type: "led_strip",
      quantity: 1,
      location: "perimeter",
    }));
    expect(formatApprovalDrawingLightLabel(parsed)).toBe("LED strip - perimeter");
    expect(formatApprovalDrawingLightLabel({ type: "other", quantity: 1, location: "Pendant over island" })).toBe("Pendant over island");
    expect(formatApprovalDrawingLouverDirection("projection")).toBe("Louvers run with projection");
  });

  it("supports multiple side features and side-specific light labels", () => {
    const drawing = createDefaultApprovalDrawingData({
      sides: [
        {
          side: "B",
          label: "Right side",
          enclosure: { type: "motorized_screen" },
          enclosureSpan: { display: "12 ft 0 in" },
          enclosureHeight: { display: "8 ft 6 in" },
          features: [
            { id: "b-screen", type: "motorized_screen" },
            { id: "b-glass", type: "glass_wall" },
          ],
        },
      ],
    });
    const normalized = normalizeApprovalDrawingData(drawing);
    const sideB = normalized.sides.find((side) => side.side === "B");
    const parsedLight = parseApprovalDrawingLightLine("Side B - 2 spot lights", 0);

    expect(sideB).toBeDefined();
    expect(getApprovalDrawingSideFeatures(sideB!)).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "motorized_screen" }),
      expect.objectContaining({ type: "glass_wall" }),
    ]));
    expect(parsedLight).toEqual(expect.objectContaining({
      side: "B",
      type: "spot",
      quantity: 2,
    }));
    expect(formatApprovalDrawingLightLabel(parsedLight)).toBe("Side B - 2 Spot lights");
  });

  it("normalizes old manufacturer-specific glass wall values to generic customer language", () => {
    const normalized = normalizeApprovalDrawingData(createDefaultApprovalDrawingData({
      sides: [
        {
          side: "C",
          enclosure: { type: "lumon_glass_wall" },
          features: [{ id: "legacy-glass", type: "lumon_glass_wall" }],
        },
      ],
    }));
    const sideC = normalized.sides.find((side) => side.side === "C");

    expect(sideC?.enclosure).toEqual(expect.objectContaining({ type: "glass_wall" }));
    expect(getApprovalDrawingSideFeatures(sideC!)).toEqual([
      expect.objectContaining({ type: "glass_wall" }),
    ]);
    expect(formatApprovalDrawingSideFeatureType("lumon_glass_wall")).toBe("Glass wall");
    expect(formatApprovalDrawingSideFeatureType("glass_wall")).toBe("Glass wall");
  });

  it("normalizes invalid post coordinates before rendering", () => {
    const normalized = normalizeApprovalDrawingData(createDefaultApprovalDrawingData({
      posts: [
        { id: "post-a", label: "P1", x: Number.NaN, y: "bad" as unknown as number },
        { id: "post-b", label: "P2", x: "0.75" as unknown as number, y: 1.2 },
      ],
    }));

    expect(normalized.posts[0]).toEqual(expect.objectContaining({ x: 0, y: 0 }));
    expect(normalized.posts[1]).toEqual(expect.objectContaining({ x: 0.75, y: 1 }));
  });
});

describe("approval drawing SQL helpers", () => {
  it("casts appended internal notes to text for Postgres parameter inference", () => {
    const dialect = new PgDialect();
    const query = dialect.sqlToQuery(
      appendQuoteApprovalDrawingInternalNoteSql("Revision needed: line item changed after drawing readiness"),
    );

    expect(query.sql).toContain("::text");
    expect(query.sql).not.toContain("concat_ws");
    expect(query.params).toEqual([
      "Revision needed: line item changed after drawing readiness",
      "Revision needed: line item changed after drawing readiness",
    ]);
  });
});
