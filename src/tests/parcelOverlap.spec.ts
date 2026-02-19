import { describe, expect, it } from 'vitest';
import { findOverlappingParcels } from '../utils/parcelOverlap';

const METERS_TO_DEGREES = 1 / 111_320;

function squareFeature(id: string, xMeters: number, yMeters: number, sizeMeters: number) {
  const x = xMeters * METERS_TO_DEGREES;
  const y = yMeters * METERS_TO_DEGREES;
  const size = sizeMeters * METERS_TO_DEGREES;

  return {
    type: 'Feature',
    id,
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [x, y],
        [x + size, y],
        [x + size, y + size],
        [x, y + size],
        [x, y],
      ]],
    },
  };
}

describe('findOverlappingParcels', () => {
  it('ignores parcels that only touch by border with 1 meter tolerance', () => {
    const a = squareFeature('a', 0, 0, 20);
    const b = squareFeature('b', 20, 0, 20); // touch only on x = 20m

    const overlaps = findOverlappingParcels([a, b], 1);

    expect(overlaps).toHaveLength(0);
  });

  it('detects true overlap after applying 1 meter tolerance', () => {
    const a = squareFeature('a', 0, 0, 20);
    const b = squareFeature('b', 18, 0, 20); // 2m overlap

    const overlaps = findOverlappingParcels([a, b], 1);

    expect(overlaps).toHaveLength(1);
  });
});
