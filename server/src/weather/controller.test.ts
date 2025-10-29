import request from 'supertest';
import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';

vi.mock('./stations.js', () => ({
  findNearestStations: vi.fn(),
  refreshStations: vi.fn(),
  getAllStations: vi.fn(),
}));

vi.mock('./infoclimatClient.js', () => ({
  getObservationsForStation: vi.fn(),
}));

vi.mock('./openMeteoFallback.js', () => ({
  fetchOpenMeteoObservations: vi.fn(),
}));

vi.mock('./observations.js', async () => {
  const actual = await vi.importActual<typeof import('./observations.js')>('./observations.js');
  return {
    ...actual,
    mergeStationsObservations: vi.fn(actual.mergeStationsObservations),
  };
});

import { createApp } from '../app.js';
import { findNearestStations } from './stations.js';
import { getObservationsForStation } from './infoclimatClient.js';
import { mergeStationsObservations } from './observations.js';
import { fetchOpenMeteoObservations } from './openMeteoFallback.js';

describe('GET /api/weather/analyze', () => {
  const station = {
    id: 'station-1',
    name: 'Station 1',
    city: null,
    lat: 0,
    lon: 0,
    altitude: null,
    type: 'auto',
    distanceKm: 0,
  } as const;

  let warnSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    vi.mocked(findNearestStations).mockReset();
    vi.mocked(findNearestStations).mockResolvedValue([station]);
    vi.mocked(mergeStationsObservations).mockReset();
    vi.mocked(mergeStationsObservations).mockReturnValue([]);
    vi.mocked(getObservationsForStation).mockReset();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy?.mockRestore();
    warnSpy = null;
  });

  const app = createApp();

  it('returns 502 when the Infoclimat API key is missing', async () => {
    vi
      .mocked(getObservationsForStation)
      .mockRejectedValue(new Error('Missing INFOCLIMAT_API_KEY environment variable'));

    const response = await request(app)
      .get('/api/weather/analyze')
      .query({ lat: 1, lon: 2, phaseStart: 10, phaseEnd: 20, yearsBack: 5 });

    expect(response.status).toBe(502);
    expect(response.body).toEqual({
      error:
        "Impossible de contacter l'API Infoclimat : configurez la variable d'environnement INFOCLIMAT_API_KEY.",
    });
  });

  it('returns 502 when Infoclimat observations cannot be loaded', async () => {
    vi
      .mocked(getObservationsForStation)
      .mockRejectedValue(new Error('Infoclimat API responded with status 500'));

    const response = await request(app)
      .get('/api/weather/analyze')
      .query({ lat: 1, lon: 2, phaseStart: 10, phaseEnd: 20, yearsBack: 5 });

    expect(response.status).toBe(502);
    expect(response.body).toEqual({
      error: 'Impossible de récupérer les observations Infoclimat pour la période demandée.',
    });
  });

  it('returns 404 when no observations are available', async () => {
    vi.mocked(getObservationsForStation).mockResolvedValue([]);

    const response = await request(app)
      .get('/api/weather/analyze')
      .query({ lat: 1, lon: 2, phaseStart: 10, phaseEnd: 20, yearsBack: 5 });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: 'Aucune observation disponible pour la période demandée.',
    });
  });
});

describe('GET /api/weather/summary', () => {
  const station = {
    id: 'station-1',
    name: 'Station 1',
    city: 'Paris',
    lat: 48.85,
    lon: 2.35,
    altitude: 35,
    type: 'auto',
    distanceKm: 1.2,
  } as const;

  beforeEach(() => {
    vi.mocked(findNearestStations).mockReset();
    vi.mocked(findNearestStations).mockResolvedValue([station]);
    vi.mocked(getObservationsForStation).mockReset();
    vi
      .mocked(getObservationsForStation)
      .mockResolvedValue([
        {
          ts: '2024-04-01T06:00:00.000Z',
          t: 10,
          tmin: 5,
          tmax: 12,
          rr: 2,
          rr24: null,
          ff: 3,
          fx: null,
          rh: 80,
          p: 1012,
        },
        {
          ts: '2024-04-01T18:00:00.000Z',
          t: 6,
          tmin: 4,
          tmax: 11,
          rr: 0,
          rr24: null,
          ff: 2,
          fx: null,
          rh: 85,
          p: 1015,
        },
      ]);
    vi.mocked(mergeStationsObservations).mockReset();
    vi.mocked(mergeStationsObservations).mockReturnValue([
      {
        ts: '2024-04-01T06:00:00.000Z',
        t: 10,
        tmin: 5,
        tmax: 12,
        rr: 2,
        rr24: null,
        ff: 3,
        fx: null,
        rh: 80,
        p: 1012,
      },
      {
        ts: '2024-04-01T18:00:00.000Z',
        t: 6,
        tmin: 4,
        tmax: 11,
        rr: 0,
        rr24: null,
        ff: 2,
        fx: null,
        rh: 85,
        p: 1015,
      },
    ]);
    vi.mocked(fetchOpenMeteoObservations).mockReset();
    vi.mocked(fetchOpenMeteoObservations).mockResolvedValue([]);
  });

  const app = createApp();

  it('returns a computed summary when observations are available', async () => {
    const response = await request(app)
      .get('/api/weather/summary')
      .query({ lat: 48.85, lon: 2.35, year: 2024 });

    expect(response.status).toBe(200);
    expect(response.body.summary.avgDayTemp).toBe(10);
    expect(response.body.summary.avgNightTemp).toBe(6);
    expect(response.body.summary.totalPrecipitation).toBe(2);
    expect(response.body.summary.precipitationDayCount).toBe(1);
    expect(response.body.metadata.source).toBe('Infoclimat (Open Data)');
    expect(response.body.metadata.stationsUsed).toEqual([
      expect.objectContaining({ id: 'station-1', name: 'Station 1' }),
    ]);
    expect(fetchOpenMeteoObservations).not.toHaveBeenCalled();
  });

  it('falls back to Open-Meteo when no Infoclimat data is available', async () => {
    vi.mocked(mergeStationsObservations).mockReturnValue([]);
    vi.mocked(fetchOpenMeteoObservations).mockResolvedValue([
      {
        ts: '2024-04-01T06:00:00.000Z',
        t: 9,
        tmin: 4,
        tmax: 11,
        rr: 1,
        rr24: 1,
        ff: 3,
        fx: 6,
        rh: 75,
        p: 1011,
      },
    ]);

    const response = await request(app)
      .get('/api/weather/summary')
      .query({ lat: 48.85, lon: 2.35, year: 2024 });

    expect(response.status).toBe(200);
    expect(response.body.metadata.source).toBe('Open-Meteo (Archive API – fallback)');
    expect(response.body.metadata.stationsUsed[0]?.id).toBe('open-meteo-grid');
    expect(fetchOpenMeteoObservations).toHaveBeenCalled();
  });

  it('skips malformed observations without failing', async () => {
    vi.mocked(mergeStationsObservations).mockReturnValue([
      {
        ts: '2024-04-01T06:00:00.000Z',
        t: 12,
        tmin: null,
        tmax: null,
        rr: 0,
        rr24: null,
        ff: null,
        fx: null,
        rh: null,
        p: null,
      },
      // @ts-expect-error – emulate a corrupted observation
      { foo: 'bar' },
    ]);

    const response = await request(app)
      .get('/api/weather/summary')
      .query({ lat: 48.85, lon: 2.35, year: 2024 });

    expect(response.status).toBe(200);
    expect(response.body.summary.daySampleCount).toBe(1);
  });
});
