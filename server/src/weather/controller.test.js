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
vi.mock('./infoclimat.js', () => ({
    fetchInfoclimat: vi.fn(),
    fetchInfoclimatRange: vi.fn(),
}));
vi.mock('./observations.js', async () => {
    const actual = await vi.importActual('./observations.js');
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
import { fetchInfoclimat, fetchInfoclimatRange } from './infoclimat.js';

describe('GET /api/weather/infoclimat', () => {
    const app = createApp();
    beforeEach(() => {
        vi.mocked(fetchInfoclimat).mockReset();
    });
    it('returns normalized hourly data for the requested station', async () => {
        vi.mocked(fetchInfoclimat).mockResolvedValue({
            hourly: {
                '07015': [
                    { dh_utc: '2025-10-28 00:00:00', temperature: '9.6' },
                ],
            },
            daily: {
                '07015': [
                    { date: '2025-10-28', tmax: '12.4', tmin: '7.5' },
                ],
            },
            license: '© Infoclimat',
            attribution: 'Données © Infoclimat',
        });

        const response = await request(app)
            .get('/api/weather/infoclimat')
            .query({ station: '07015', dateStart: '2025-10-28', dateEnd: '2025-10-30' });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            source: 'Infoclimat (Open Data)',
            station: '07015',
            dateStart: '2025-10-28',
            dateEnd: '2025-10-30',
            hourly: [
                { dh_utc: '2025-10-28 00:00:00', temperature: '9.6' },
            ],
            daily: [
                { date: '2025-10-28', tmax: '12.4', tmin: '7.5' },
            ],
            stations: [],
            metadata: null,
            license: '© Infoclimat',
            attribution: 'Données © Infoclimat',
        });
        expect(fetchInfoclimat).toHaveBeenCalledWith({
            station: '07015',
            start: '2025-10-28',
            end: '2025-10-30',
        });
    });

    it('returns 400 on invalid query', async () => {
        const response = await request(app)
            .get('/api/weather/infoclimat')
            .query({ station: '', dateStart: '2025-10-28', dateEnd: '2025-10-30' });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid query');
    });

    it('returns 500 when the upstream call fails', async () => {
        vi.mocked(fetchInfoclimat).mockRejectedValue(new Error('boom'));

        const response = await request(app)
            .get('/api/weather/infoclimat')
            .query({ station: '07015', dateStart: '2025-10-28', dateEnd: '2025-10-30' });

        expect(response.status).toBe(500);
        expect(response.body).toEqual({ error: 'Cannot fetch Infoclimat data' });
    });
});
describe('GET /api/weather/analyze', () => {
    const app = createApp();
    beforeEach(() => {
        vi.mocked(fetchInfoclimatRange).mockReset();
    });
    it('returns hourly data from Infoclimat', async () => {
        vi.mocked(fetchInfoclimatRange).mockResolvedValue({
            status: 'OK',
            stations: [{ id: '07015', name: 'Lille-Lesquin' }],
            metadata: { temperature: 'temperature,°C' },
            hourly: {
                '07015': [
                    {
                        id_station: '07015',
                        dh_utc: '2025-10-28 00:00:00',
                        temperature: '9.6',
                    },
                ],
            },
        });
        const response = await request(app)
            .get('/api/weather/analyze')
            .query({ station: '07015', dateStart: '2025-10-28', dateEnd: '2025-10-30' });
        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            source: 'Infoclimat (Open Data)',
            station: '07015',
            dateStart: '2025-10-28',
            dateEnd: '2025-10-30',
            stations: [{ id: '07015', name: 'Lille-Lesquin' }],
            metadata: { temperature: 'temperature,°C' },
            hourly: [
                {
                    id_station: '07015',
                    dh_utc: '2025-10-28 00:00:00',
                    temperature: '9.6',
                },
            ],
        });
    });
    it('defaults to station 07015 when none is provided', async () => {
        vi.mocked(fetchInfoclimatRange).mockResolvedValue({ hourly: { '07015': [] } });
        const response = await request(app)
            .get('/api/weather/analyze')
            .query({ dateStart: '2025-10-28', dateEnd: '2025-10-30', lat: '48.8', lon: '2.3' });
        expect(response.status).toBe(200);
        expect(fetchInfoclimatRange).toHaveBeenCalledWith('07015', '2025-10-28', '2025-10-30');
        expect(response.body.station).toBe('07015');
    });
    it('returns 400 when the query is invalid', async () => {
        const response = await request(app)
            .get('/api/weather/analyze')
            .query({ station: '07015', dateStart: '2025-10-28' });
        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid request');
    });
    it('returns 500 when Infoclimat fetch fails', async () => {
        const error = new Error('boom');
        vi.mocked(fetchInfoclimatRange).mockRejectedValue(error);
        const response = await request(app)
            .get('/api/weather/analyze')
            .query({ station: '07015', dateStart: '2025-10-28', dateEnd: '2025-10-30' });
        expect(response.status).toBe(500);
        expect(response.body).toEqual({ error: 'Weather analyze failed' });
    });
});
describe('GET /api/weather/availability', () => {
    const station = {
        id: 'station-availability',
        name: 'Station disponibilité',
        city: null,
        lat: 0,
        lon: 0,
        altitude: null,
        type: 'auto',
        distanceKm: 0,
    };
    beforeEach(() => {
        vi.mocked(findNearestStations).mockReset();
        vi.mocked(findNearestStations).mockResolvedValue([station]);
        vi.mocked(getObservationsForStation).mockReset();
    });
    const app = createApp();
    it('returns available years for the nearest station', async () => {
        vi.mocked(getObservationsForStation).mockResolvedValue([
            { ts: '2023-01-01T00:00:00.000Z', t: 10, tmin: null, tmax: null, rr: null, rr24: null, ff: null, fx: null, rh: null, p: null },
            { ts: '2024-02-01T00:00:00.000Z', t: 11, tmin: null, tmax: null, rr: null, rr24: null, ff: null, fx: null, rh: null, p: null },
        ]);
        const response = await request(app)
            .get('/api/weather/availability')
            .query({ lat: 1, lon: 2, maxYears: 5 });
        expect(response.status).toBe(200);
        expect(response.body.stations).toEqual([
            expect.objectContaining({
                id: 'station-availability',
                availableYears: [2023, 2024],
            }),
        ]);
        expect(response.body.startYear).toBeLessThanOrEqual(response.body.endYear);
    });
    it('returns 400 when lat/lon are invalid', async () => {
        const response = await request(app).get('/api/weather/availability').query({ lat: 'abc', lon: 2 });
        expect(response.status).toBe(400);
        expect(response.body).toEqual({ error: 'Paramètres lat/lon invalides.' });
    });
    it('returns 502 when the API key is missing', async () => {
        vi
            .mocked(getObservationsForStation)
            .mockRejectedValue(new Error('Missing INFOCLIMAT_API_KEY environment variable'));
        const response = await request(app)
            .get('/api/weather/availability')
            .query({ lat: 1, lon: 2 });
        expect(response.status).toBe(502);
        expect(response.body).toEqual({
            error: "Impossible de contacter l'API Infoclimat : configurez la variable d'environnement INFOCLIMAT_API_KEY.",
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
    };
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
