import { describe, it, expect, beforeEach, vi } from 'vitest';

const upsertStations = vi.hoisted(() => vi.fn());
const fetchJsonMock = vi.hoisted(() => vi.fn());

vi.mock('./db.js', () => ({
  upsertStations,
}));

vi.mock('./infoclimatShared.js', () => ({
  INFOCLIMAT_STATIONS_URL: 'https://example.test/catalog',
  fetchJson: fetchJsonMock,
  toNumber(value: unknown) {
    if (value == null) return null;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const normalized = value.replace(',', '.').trim();
      if (!normalized) return null;
      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  },
}));

import { fetchStationsCatalog } from './infoclimatStations.js';

describe('fetchStationsCatalog', () => {
  beforeEach(() => {
    upsertStations.mockReset();
    fetchJsonMock.mockReset();
  });

  it('normalises GeoJSON station features', async () => {
    fetchJsonMock.mockResolvedValue({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [1.834, 50.136],
          },
          properties: {
            id: '07005',
            name: 'Abbeville',
            elevation: 69,
          },
        },
        {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [3.0975, 50.57],
          },
          properties: {
            station_id: '07015',
            station_name: 'Lille-Lesquin',
            altitude: '47',
            nature: 'Synop',
          },
        },
      ],
    });

    const stations = await fetchStationsCatalog();

    expect(fetchJsonMock).toHaveBeenCalledWith('https://example.test/catalog');
    expect(stations).toEqual([
      {
        id: '07005',
        name: 'Abbeville',
        city: null,
        lat: 50.136,
        lon: 1.834,
        altitude: 69,
        type: null,
      },
      {
        id: '07015',
        name: 'Lille-Lesquin',
        city: null,
        lat: 50.57,
        lon: 3.0975,
        altitude: 47,
        type: 'Synop',
      },
    ]);
    expect(upsertStations).toHaveBeenCalledWith(stations);
  });

  it('throws when payload is not a FeatureCollection', async () => {
    fetchJsonMock.mockResolvedValue({ type: 'SomethingElse' });
    await expect(fetchStationsCatalog()).rejects.toThrow(/FeatureCollection/);
    expect(upsertStations).not.toHaveBeenCalled();
  });
});
