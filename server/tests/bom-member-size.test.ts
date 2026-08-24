import { describe, expect, it } from 'vitest';
import { detectHighlightedMemberSize } from '../../client/src/lib/bom-member-size';

describe('detectHighlightedMemberSize', () => {
  it.each([
    ['Structural beam 2x8', null, '2x8'],
    ['Structural beam 2 x 8', null, '2x8'],
    ['Attachment for 2 × 8 member', null, '2x8'],
    ['Heavy structural beam 4x8', null, '4x8'],
    ['Heavy structural beam', 'BEAM-4X8-BLK', '4x8'],
  ] as const)('detects an exact highlighted member size from description or SKU', (description, sku, expected) => {
    expect(detectHighlightedMemberSize({ description, sku })).toBe(expected);
  });

  it.each([
    ['Fictional 12x8 canopy', 'CANOPY-12X8'],
    ['Fictional 24x8 canopy', 'CANOPY-24X8'],
    ['Fictional 2x80 member', 'MEMBER-2X80'],
    ['General shop hardware', null],
  ] as const)('does not turn larger dimensions into a highlighted member size', (description, sku) => {
    expect(detectHighlightedMemberSize({ description, sku })).toBeNull();
  });

  it('leaves conflicting size evidence unmarked', () => {
    expect(detectHighlightedMemberSize({
      description: 'Description says 2x8',
      sku: 'REFERENCE-4X8',
    })).toBeNull();
  });
});
