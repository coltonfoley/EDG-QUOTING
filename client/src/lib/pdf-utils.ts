import jsPDF from 'jspdf';

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