export type HighlightedMemberSize = '2x8' | '4x8';

interface BomMemberSizeSource {
  description: string;
  sku?: string | null;
}

export function detectHighlightedMemberSize(item: BomMemberSizeSource): HighlightedMemberSize | null {
  const sizes = new Set<HighlightedMemberSize>();
  const sizePattern = /(?:^|[^0-9])([24])\s*(?:x|×)\s*8(?=$|[^0-9])/gi;

  for (const value of [item.description, item.sku]) {
    if (!value) continue;

    for (const match of value.matchAll(sizePattern)) {
      sizes.add(match[1] === '2' ? '2x8' : '4x8');
    }
  }

  return sizes.size === 1 ? [...sizes][0] : null;
}
