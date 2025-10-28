import { getRateLimiter } from '../rateLimit';
import type { WeatherPointDaily, WeatherPointHourly, WeatherRequestParams, WeatherSeries } from '../types';
import { WeatherProviderError } from '../types';

const PROVIDER = 'open-meteo' as const;
const BASE_URL = 'https://archive-api.open-meteo.com/v1/archive';

const HOURLY_VARIABLES = [
  'temperature_2m',
  'relativehumidity_2m',
  'precipitation',
  'rain',
  'pressure_msl',
  'windspeed_10m',
  'winddirection_10m',
  'shortwave_radiation',
];

const DAILY_VARIABLES = [
  'temperature_2m_min',
  'temperature_2m_max',
  'temperature_2m_mean',
  'precipitation_sum',
  'windspeed_10m_max',
  'sunshine_duration',
];

interface OpenMeteoResponse {
  latitude: number;
  longitude: number;
  timezone?: string;
  hourly?: Record<string, unknown>;
  daily?: Record<string, unknown>;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value == null) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeHourly(hourly: Record<string, unknown> | undefined): WeatherPointHourly[] | undefined {
  if (!hourly) return undefined;
  const times = Array.isArray(hourly.time) ? (hourly.time as string[]) : [];
  if (!times.length) return undefined;
  const normalized: WeatherPointHourly[] = [];
  times.forEach((time, index) => {
    normalized.push({
      time: new Date(time).toISOString(),
      t2m: toNumber((hourly.temperature_2m as number[] | undefined)?.[index]),
      tp: toNumber((hourly.precipitation as number[] | undefined)?.[index]),
      ws: toNumber((hourly.windspeed_10m as number[] | undefined)?.[index]),
      wd: toNumber((hourly.winddirection_10m as number[] | undefined)?.[index]),
      rh: toNumber((hourly.relativehumidity_2m as number[] | undefined)?.[index]),
      p: toNumber((hourly.pressure_msl as number[] | undefined)?.[index]),
      rad: toNumber((hourly.shortwave_radiation as number[] | undefined)?.[index]) ?? undefined,
    });
  });
  return normalized.length ? normalized : undefined;
}

function normalizeDaily(daily: Record<string, unknown> | undefined): WeatherPointDaily[] | undefined {
  if (!daily) return undefined;
  const dates = Array.isArray(daily.time) ? (daily.time as string[]) : [];
  if (!dates.length) return undefined;
  const normalized: WeatherPointDaily[] = [];
  dates.forEach((date, index) => {
    const sun = toNumber((daily.sunshine_duration as number[] | undefined)?.[index]);
    normalized.push({
      date,
      tmin: toNumber((daily.temperature_2m_min as number[] | undefined)?.[index]),
      tmax: toNumber((daily.temperature_2m_max as number[] | undefined)?.[index]),
      tavg: toNumber((daily.temperature_2m_mean as number[] | undefined)?.[index]) ?? undefined,
      prcp: toNumber((daily.precipitation_sum as number[] | undefined)?.[index]),
      ws_avg: toNumber((daily.windspeed_10m_max as number[] | undefined)?.[index]) ?? undefined,
      sun: sun != null ? sun / 3600 : undefined,
    });
  });
  return normalized.length ? normalized : undefined;
}

function buildOpenMeteoUrl(params: WeatherRequestParams): string {
  const search = new URLSearchParams();
  search.set('latitude', params.lat.toString());
  search.set('longitude', params.lon.toString());
  search.set('start_date', params.start);
  search.set('end_date', params.end);
  search.set('timezone', 'auto');
  if (params.granularity === 'hourly') {
    search.set('hourly', HOURLY_VARIABLES.join(','));
  }
  if (params.granularity === 'daily' || params.granularity === 'hourly') {
    search.set('daily', DAILY_VARIABLES.join(','));
  }
  return `${BASE_URL}?${search.toString()}`;
}

export async function fetchOpenMeteo(params: WeatherRequestParams): Promise<WeatherSeries> {
  const limiter = getRateLimiter(PROVIDER);
  const url = buildOpenMeteoUrl(params);
  const response = await limiter.schedule(
    () =>
      fetch(url, {
        headers: { Accept: 'application/json' },
        signal: params.signal,
      }),
    params.signal,
  );

  if (!response.ok) {
    throw new WeatherProviderError(PROVIDER, `Open-Meteo indisponible (${response.status})`, {
      status: response.status,
      retryable: response.status === 429,
    });
  }

  const json = (await response.json()) as OpenMeteoResponse;
  const hourly = params.granularity === 'hourly' ? normalizeHourly(json.hourly) : undefined;
  const daily = normalizeDaily(json.daily);

  if (!hourly?.length && !daily?.length) {
    throw new WeatherProviderError(PROVIDER, 'Réponse Open-Meteo vide.', { code: 'EMPTY_PAYLOAD' });
  }

  return {
    meta: {
      provider: PROVIDER,
      lat: json.latitude ?? params.lat,
      lon: json.longitude ?? params.lon,
      tz: json.timezone,
      license: '© Open-Meteo.com',
      attribution: 'Données Open-Meteo / ERA5 reanalysis',
      sources: [PROVIDER],
    },
    hourly,
    daily,
  } satisfies WeatherSeries;
}
