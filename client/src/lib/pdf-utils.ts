import jsPDF from 'jspdf';

// 1 pt = 0.352778 mm
const PT_TO_MM = 0.352778;

export function measureAcceptanceBlock(doc: jsPDF, opts: {
  heading: string,              // "CLIENT ACCEPTANCE"
  width: number,                // content width in mm
  headingFontSizePt: number,    // e.g., 14
  bodyFontSizePt: number,       // e.g., 11
  spacingTop: number,           // mm before block
  spacingAfterHeading: number,  // mm under heading
  fieldGap: number,             // vertical gap between fields (mm)
  labelGap: number,             // label -> line gap (mm)
  bottomPadding: number,        // mm after last line
  fields: Array<{label: string, lineWidthMm: number}>,
}): number {
  const headingH = opts.headingFontSizePt * PT_TO_MM * 1.2; // 1.2 line-height
  const labelH   = opts.bodyFontSizePt    * PT_TO_MM * 1.15;

  // Each field stack: label + labelGap + line (line height ~0 but give 1 mm) + fieldGap
  const fieldStack = (labelH + opts.labelGap + 1);
  const fieldsH = opts.fields.length > 0
    ? (opts.fields.length * fieldStack) - opts.fieldGap // no trailing gap after last
    : 0;

  const total =
      opts.spacingTop
    + headingH
    + opts.spacingAfterHeading
    + fieldsH
    + opts.bottomPadding;

  return total;
}

export function ensureSpace(doc: jsPDF, y: number, heightNeeded: number, opts: {
  marginTop: number,
  marginBottom: number,     // visual bottom margin (mm)
  footerReserve: number,    // reserved space for footer (mm)
  onNewPage?: () => void,   // e.g., redraw header
}): number {
  const pageH = doc.internal.pageSize.getHeight();
  const limit = pageH - (opts.marginBottom + opts.footerReserve); // last usable Y
  const fits = (y + heightNeeded) <= limit; // <= so exact-fit doesn't force a new page
  if (fits) return y;

  doc.addPage();
  opts.onNewPage?.();
  return opts.marginTop; // reset y to top content area
}