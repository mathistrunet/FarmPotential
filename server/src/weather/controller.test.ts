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
