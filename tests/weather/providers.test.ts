import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchInfoclimat } from '../../src/weather/providers/infoclimat';
import { fetchMeteostat } from '../../src/weather/providers/meteostat';
import { fetchOpenMeteo } from '../../src/weather/providers/openmeteo';
import type { WeatherSeries } from '../../src/weather';
import infoclimatFixture from './__fixtures__/infoclimat.json';
import meteostatFixture from './__fixtures__/meteostat.json';
import openmeteoFixture from './__fixtures__/openmeteo.json';

vi.mock('../../src/weather/stations', () => ({
  findNearestStation: vi.fn(async () => ({
    id: 'FR0001',
    name: 'Paris-Montsouris',
    lat: 48.82,
    lon: 2.33,
    distanceKm: 2.1,
  })),
}));

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('fetchInfoclimat', () => {
  it('normalizes Infoclimat payloads', async () => {
    vi.stubEnv('VITE_INFOCLIMAT_TOKEN', 'token');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => infoclimatFixture,
    });
    vi.stubGlobal('fetch', fetchMock);

    const series = await fetchInfoclimat({
      lat: 48.82,
      lon: 2.33,
      start: '2024-01-01',
      end: '2024-01-02',
      granularity: 'hourly',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(series.meta.provider).toBe('infoclimat');
    expect(series.meta.stationId).toBe('FR0001');
    expect(series.hourly?.[0]?.t2m).toBeCloseTo(5.1, 5);
    expect(series.daily?.[0]?.tmax).toBeCloseTo(7.0, 5);
    expect(series.meta.attribution).toContain('Infoclimat');
  });
});

describe('fetchMeteostat', () => {
  it('normalizes Meteostat payloads', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => meteostatFixture,
    });
    vi.stubGlobal('fetch', fetchMock);

    const series = await fetchMeteostat({
      lat: 48.73,
      lon: 2.37,
      start: '2024-01-01',
      end: '2024-01-02',
      granularity: 'daily',
    });

    expect(series.meta.provider).toBe('meteostat');
    expect(series.daily?.length).toBe(2);
    expect(series.daily?.[0]?.sun).toBeCloseTo(6, 5);
    expect(series.meta.license).toContain('Meteostat');
  });
});

describe('fetchOpenMeteo', () => {
  it('normalizes Open-Meteo payloads', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => openmeteoFixture,
    });
    vi.stubGlobal('fetch', fetchMock);

    const series: WeatherSeries = await fetchOpenMeteo({
      lat: 48.86,
      lon: 2.35,
      start: '2024-01-01',
      end: '2024-01-02',
      granularity: 'hourly',
    });

    expect(series.meta.provider).toBe('open-meteo');
    expect(series.hourly?.[1]?.tp).toBeCloseTo(0.1, 5);
    expect(series.daily?.[0]?.sun).toBeCloseTo(4, 5);
  });
});
