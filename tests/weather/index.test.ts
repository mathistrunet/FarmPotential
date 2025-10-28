import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getWeather, type WeatherSeries } from '../../src/weather';
import { WeatherProviderError } from '../../src/weather/types';
import { fetchInfoclimat } from '../../src/weather/providers/infoclimat';
import { fetchMeteostat } from '../../src/weather/providers/meteostat';
import { fetchOpenMeteo } from '../../src/weather/providers/openmeteo';

vi.mock('../../src/weather/providers/infoclimat', () => ({
  fetchInfoclimat: vi.fn(),
}));

vi.mock('../../src/weather/providers/meteostat', () => ({
  fetchMeteostat: vi.fn(),
}));

vi.mock('../../src/weather/providers/openmeteo', () => ({
  fetchOpenMeteo: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('getWeather', () => {
  it('falls back when the primary provider fails', async () => {
    vi.stubEnv('VITE_INFOCLIMAT_TOKEN', 'token');

    (fetchInfoclimat as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new WeatherProviderError('infoclimat', 'unauthorized', { status: 401 }),
    );
    (fetchMeteostat as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      meta: {
        provider: 'meteostat',
        lat: 48.73,
        lon: 2.37,
        attribution: 'Meteostat',
        license: '© Meteostat',
      },
      daily: [
        {
          date: '2024-01-01',
          tmin: 0,
          tmax: 5,
          prcp: 0,
        },
      ],
    } satisfies WeatherSeries);
    (fetchOpenMeteo as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      meta: {
        provider: 'open-meteo',
        lat: 48.73,
        lon: 2.37,
        attribution: 'Open-Meteo',
      },
      daily: [],
    } satisfies WeatherSeries);

    const series = await getWeather({
      lat: 48.73,
      lon: 2.37,
      start: '2024-01-01',
      end: '2024-01-02',
      granularity: 'daily',
    });

    expect(fetchInfoclimat).toHaveBeenCalled();
    expect(fetchMeteostat).toHaveBeenCalled();
    expect(series.meta.provider).toBe('meteostat');
  });

  it('merges supplemental fields from fallback providers', async () => {
    vi.stubEnv('VITE_INFOCLIMAT_TOKEN', 'token');

    (fetchInfoclimat as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      meta: {
        provider: 'infoclimat',
        lat: 48.8,
        lon: 2.3,
        attribution: 'Infoclimat',
      },
      hourly: [
        {
          time: '2024-01-01T00:00:00Z',
          t2m: 5,
          tp: null,
          ws: 2,
          wd: null,
          rh: null,
          p: null,
          rad: null,
        },
      ],
      daily: [
        {
          date: '2024-01-01',
          tmin: 1,
          tmax: 6,
          prcp: null,
          ws_avg: null,
        },
      ],
    } satisfies WeatherSeries);

    (fetchMeteostat as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      meta: {
        provider: 'meteostat',
        lat: 48.8,
        lon: 2.3,
        attribution: 'Meteostat',
      },
      hourly: [
        {
          time: '2024-01-01T00:00:00Z',
          t2m: 5.2,
          tp: 0.1,
          ws: 2.4,
          wd: 190,
          rh: 82,
          p: 1015,
          rad: null,
        },
      ],
      daily: [
        {
          date: '2024-01-01',
          tmin: 1,
          tmax: 6,
          prcp: 0.5,
          ws_avg: 2.3,
          rh_avg: 78,
          p_avg: 1013,
          sun: 3.5,
        },
      ],
    } satisfies WeatherSeries);

    (fetchOpenMeteo as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      meta: {
        provider: 'open-meteo',
        lat: 48.8,
        lon: 2.3,
        attribution: 'Open-Meteo',
      },
      hourly: [
        {
          time: '2024-01-01T00:00:00Z',
          t2m: 5.1,
          tp: 0.2,
          ws: 2.5,
          wd: 200,
          rh: 85,
          p: 1014,
          rad: 95,
        },
      ],
    } satisfies WeatherSeries);

    const series = await getWeather({
      lat: 48.8,
      lon: 2.3,
      start: '2024-01-01',
      end: '2024-01-02',
      granularity: 'hourly',
    });

    expect(series.hourly?.[0]?.tp).toBeCloseTo(0.1, 5);
    expect(series.hourly?.[0]?.rh).toBe(82);
    expect(series.hourly?.[0]?.rad).toBe(95);
    expect(series.meta.sources?.length).toBeGreaterThan(1);
    expect(series.meta.attribution).toContain('Données Infoclimat + Meteostat + Open-Meteo / ERA5');
  });
});
