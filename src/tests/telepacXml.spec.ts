import { describe, expect, it } from 'vitest';
import { buildTelepacXML } from '../services/telepacXml.js';

type SimpleFeature = {
  type: 'Feature';
  geometry: { type: 'Polygon'; coordinates: number[][][] };
  properties?: Record<string, unknown>;
};

const square = [
  [0, 0],
  [0.001, 0],
  [0.001, 0.001],
  [0, 0.001],
  [0, 0],
];

const baseFeature: SimpleFeature = {
  type: 'Feature',
  geometry: { type: 'Polygon', coordinates: [square] },
  properties: { numero: '1', code: 'BTH' },
};

describe('buildTelepacXML', () => {
  it('includes agri-bio flag when conduite_bio is true', () => {
    const xml = buildTelepacXML([
      { ...baseFeature, properties: { ...baseFeature.properties, conduite_bio: true } },
    ]);

    expect(xml).toContain('<agri-bio conduite-bio="true" />');
  });

  it('omits agri-bio node when conduite_bio is falsey', () => {
    const xml = buildTelepacXML([
      { ...baseFeature, properties: { ...baseFeature.properties, conduite_bio: false } },
    ]);

    expect(xml).not.toContain('<agri-bio conduite-bio="true" />');
  });
});
