import { useId } from "react";

import {
  formatApprovalDrawingLightLabel,
  formatApprovalDrawingLouverDirection,
  formatApprovalDrawingSideFeatureType,
  formatDimension,
  getApprovalDrawingSideFeatures,
  normalizeApprovalDrawingData,
  type ApprovalDrawingSide,
  type ApprovalDrawingSideFeature,
  type LouveredRoofApprovalDrawingData,
} from "@shared/approvalDrawing";

type QuoteApprovalDrawingPreviewProps = {
  drawingData: unknown;
  compact?: boolean;
};

const sideFeatureStroke: Record<string, string> = {
  motorized_screen: "#2563eb",
  sliding_privacy_wall: "#111827",
  lumon_glass_wall: "#0891b2",
  other: "#7c3aed",
};

function getRatio(data: LouveredRoofApprovalDrawingData) {
  const length = data.layout.overallLength.inches || data.layout.overallLength.mm || 240;
  const projection = data.layout.overallProjection.inches || data.layout.overallProjection.mm || 144;
  const safeLength = Math.max(1, length);
  const safeProjection = Math.max(1, projection);
  return Math.min(1.8, Math.max(0.65, safeLength / safeProjection));
}

function isPerimeterLight(light: LouveredRoofApprovalDrawingData["lights"][number]) {
  return light.type === "led_strip" && /perimeter|around|border|edge/i.test(light.location || "");
}

function getSideFeatureLine(
  side: ApprovalDrawingSide,
  index: number,
  originX: number,
  originY: number,
  boxW: number,
  boxH: number,
) {
  const offset = 16 + index * 6;
  switch (side) {
    case "A":
      return { x1: originX + 8, y1: originY + offset, x2: originX + boxW - 8, y2: originY + offset };
    case "B":
      return { x1: originX + boxW - offset, y1: originY + 8, x2: originX + boxW - offset, y2: originY + boxH - 8 };
    case "C":
      return { x1: originX + 8, y1: originY + boxH - offset, x2: originX + boxW - 8, y2: originY + boxH - offset };
    case "D":
    default:
      return { x1: originX + offset, y1: originY + 8, x2: originX + offset, y2: originY + boxH - 8 };
  }
}

function formatSideFeatures(side: LouveredRoofApprovalDrawingData["sides"][number]) {
  const features = getApprovalDrawingSideFeatures(side);
  if (features.length === 0) return `Side ${side.side}: none`;

  const label = side.label && side.label !== `Side ${side.side}`
    ? ` (${side.label})`
    : "";
  return `Side ${side.side}${label}: ${features.map((feature) => formatApprovalDrawingSideFeatureType(feature.type)).join(" + ")}`;
}

export function QuoteApprovalDrawingPreview({ drawingData, compact = false }: QuoteApprovalDrawingPreviewProps) {
  const clipId = `approval-drawing-clip-${useId().replace(/:/g, "")}`;
  const data = normalizeApprovalDrawingData(drawingData);
  const ratio = getRatio(data);
  const boxW = ratio >= 1 ? 245 : 185;
  const boxH = ratio >= 1 ? Math.max(116, boxW / ratio) : 190;
  const originX = (360 - boxW) / 2;
  const originY = 78;
  const sideMap = new Map(data.sides.map((side) => [side.side, side]));
  const lengthLabel = formatDimension(data.layout.overallLength) || "Length";
  const projectionLabel = formatDimension(data.layout.overallProjection) || "Projection/depth";
  const louverDirectionLabel = formatApprovalDrawingLouverDirection(data.layout.louverDirection);
  const activeEnclosures = data.sides
    .map(formatSideFeatures)
    .filter((line) => !line.endsWith(": none"));
  const lightsLabel = data.lights.length > 0
    ? data.lights.map(formatApprovalDrawingLightLabel).join("; ")
    : "No lights/accessories listed";
  const perimeterLights = data.lights.filter(isPerimeterLight);
  const pointLights = data.lights.filter((light) => !isPerimeterLight(light));
  const louverLines = Array.from(
    { length: data.layout.louverDirection === "length" ? Math.floor(boxH / 10) : Math.floor(boxW / 10) },
    (_, index) => index,
  );
  const louverArrow =
    data.layout.louverDirection === "projection"
      ? { x1: originX + 26, y1: originY + boxH - 44, x2: originX + 26, y2: originY + boxH - 18 }
      : { x1: originX + 28, y1: originY + boxH - 24, x2: originX + 78, y2: originY + boxH - 24 };
  const summaryRows = [
    ["Dimensions", `${lengthLabel} x ${projectionLabel}`],
    ["Height", formatDimension(data.layout.finishedHeight) || formatDimension(data.layout.clearanceHeight) || "See post labels"],
    ["Colors", `Frame ${data.colors.frameColor || "not set"}; louvers ${data.colors.louverColor || "not set"}`],
    ["Louvers", louverDirectionLabel],
    ["Side features", activeEnclosures.length ? activeEnclosures.join("; ") : "None listed"],
    ["Lights", lightsLabel],
    ["Legend", "Orange outline = perimeter LED; dashed blue = motorized screen; black = privacy wall; teal = glass wall"],
  ];

  const sides = [
    { id: "A", x1: originX, y1: originY, x2: originX + boxW, y2: originY, labelX: originX + boxW / 2, labelY: originY + 13 },
    { id: "B", x1: originX + boxW, y1: originY, x2: originX + boxW, y2: originY + boxH, labelX: originX + boxW - 13, labelY: originY + boxH / 2 },
    { id: "C", x1: originX + boxW, y1: originY + boxH, x2: originX, y2: originY + boxH, labelX: originX + boxW / 2, labelY: originY + boxH - 10 },
    { id: "D", x1: originX, y1: originY + boxH, x2: originX, y2: originY, labelX: originX + 13, labelY: originY + boxH / 2 },
  ] as const;

  return (
    <div className="rounded-md border bg-white p-2 sm:p-3">
      <svg viewBox="0 0 360 286" className="w-full" role="img" aria-label="Order approval drawing preview">
        <defs>
          <clipPath id={clipId}>
            <rect x={originX} y={originY} width={boxW} height={boxH} />
          </clipPath>
          <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L0,6 L6,3 z" fill="#64748b" />
          </marker>
        </defs>
        <rect x={originX} y={originY} width={boxW} height={boxH} fill="#f8fafc" stroke="#111827" strokeWidth="2" />
        <g clipPath={`url(#${clipId})`}>
          {data.layout.louverDirection === "projection"
            ? louverLines.map((index) => {
              const x = originX + 10 + index * 10;
              return <line key={index} x1={x} y1={originY} x2={x} y2={originY + boxH} stroke="#cbd5e1" strokeWidth="1" />;
            })
            : louverLines.map((index) => {
              const y = originY + 10 + index * 10;
              return <line key={index} x1={originX} y1={y} x2={originX + boxW} y2={y} stroke="#cbd5e1" strokeWidth="1" />;
            })}
        </g>
        <text x="180" y="22" textAnchor="middle" className="fill-slate-900 text-[14px] font-semibold">
          Top-Down Order Approval Layout
        </text>
        <text x="180" y="38" textAnchor="middle" className="fill-slate-500 text-[9px]">
          Customer approval only. Not permit or shop drawings.
        </text>

        <line x1={originX} y1={originY - 17} x2={originX + boxW} y2={originY - 17} stroke="#64748b" strokeWidth="1.2" markerEnd="url(#arrow)" />
        <line x1={originX + boxW} y1={originY - 17} x2={originX} y2={originY - 17} stroke="#64748b" strokeWidth="1.2" markerEnd="url(#arrow)" />
        <text x={originX + boxW / 2} y={originY - 24} textAnchor="middle" className="fill-slate-700 text-[10px] font-semibold">
          Length {lengthLabel}
        </text>

        <line x1={originX + boxW + 20} y1={originY} x2={originX + boxW + 20} y2={originY + boxH} stroke="#64748b" strokeWidth="1.2" markerEnd="url(#arrow)" />
        <line x1={originX + boxW + 20} y1={originY + boxH} x2={originX + boxW + 20} y2={originY} stroke="#64748b" strokeWidth="1.2" markerEnd="url(#arrow)" />
        <text x={originX + boxW + 31} y={originY + boxH / 2} className="fill-slate-700 text-[9px] font-semibold" transform={`rotate(90 ${originX + boxW + 31} ${originY + boxH / 2})`}>
          Projection {projectionLabel}
        </text>

        {sides.map((side) => {
          const sideData = sideMap.get(side.id);
          const type = sideData?.enclosure?.type || "none";
          const isReference = data.orientation.referenceSide === side.id;
          return (
            <g key={side.id}>
              <line
                x1={side.x1}
                y1={side.y1}
                x2={side.x2}
                y2={side.y2}
                stroke={isReference ? "#111827" : "#94a3b8"}
                strokeWidth={isReference ? 5 : 2}
              />
              <text
                x={side.labelX}
                y={side.labelY}
                textAnchor="middle"
                dominantBaseline="middle"
                paintOrder="stroke"
                stroke="#ffffff"
                strokeWidth="3"
                className="fill-slate-800 text-[11px] font-semibold"
              >
                {side.id}
              </text>
            </g>
          );
        })}

        {data.sides.flatMap((side) => (
          getApprovalDrawingSideFeatures(side).map((feature: ApprovalDrawingSideFeature, index) => {
            const line = getSideFeatureLine(side.side, index, originX, originY, boxW, boxH);
            return (
              <line
                key={`${side.side}-${feature.id}-${index}`}
                {...line}
                stroke={sideFeatureStroke[feature.type]}
                strokeWidth="3"
                strokeDasharray={feature.type === "motorized_screen" ? "7 4" : undefined}
                opacity="0.95"
              />
            );
          })
        ))}

        {data.posts.map((post) => (
          <g key={post.id}>
            <rect
              x={originX + post.x * boxW - 5}
              y={originY + post.y * boxH - 5}
              width="10"
              height="10"
              rx="1"
              fill="#111827"
            />
            <text
              x={originX + post.x * boxW + (post.x > 0.5 ? -9 : 9)}
              y={originY + post.y * boxH + (post.y > 0.5 ? -10 : 18)}
              textAnchor={post.x > 0.5 ? "end" : "start"}
              paintOrder="stroke"
              stroke="#ffffff"
              strokeWidth="2.5"
              className="fill-slate-700 text-[8px]"
            >
              {post.label}
            </text>
          </g>
        ))}

        {perimeterLights.map((light, index) => (
          <g key={light.id || index}>
            <rect
              x={originX + 8 + index * 3}
              y={originY + 8 + index * 3}
              width={boxW - 16 - index * 6}
              height={boxH - 16 - index * 6}
              fill="none"
              stroke="#f59e0b"
              strokeWidth="3"
              rx="2"
            />
          </g>
        ))}

        {pointLights.map((light, index) => (
          <g key={light.id || index}>
            <circle cx={originX + 44} cy={originY + boxH / 2 + Math.floor(index / 3) * 16} r="4" fill="#f59e0b" />
            <text
              x={originX + 52}
              y={originY + boxH / 2 + 3 + Math.floor(index / 3) * 16}
              paintOrder="stroke"
              stroke="#ffffff"
              strokeWidth="2.5"
              className="fill-slate-700 text-[8px]"
            >
              {formatApprovalDrawingLightLabel(light)}
            </text>
          </g>
        ))}

        <line x1={louverArrow.x1} y1={louverArrow.y1} x2={louverArrow.x2} y2={louverArrow.y2} stroke="#64748b" strokeWidth="1.5" markerEnd="url(#arrow)" />
      </svg>
      {!compact && (
        <dl className="mt-3 grid grid-cols-1 gap-2 border-t pt-3 text-xs text-slate-700 sm:grid-cols-2">
          {summaryRows.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="font-semibold text-slate-900">{label}</dt>
              <dd className="mt-0.5 break-words">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
