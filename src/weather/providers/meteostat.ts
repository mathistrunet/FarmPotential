import { getRateLimiter } from '../rateLimit';
import type { WeatherPointDaily, WeatherPointHourly, WeatherRequestParams, WeatherSeries } from '../types';
import { WeatherProviderError } from '../types';

const PROVIDER = 'meteostat' as const;

interface MeteostatHourlyPoint {
  time: string;
  temp?: number | null;
  dwpt?: number | null;
  rhum?: number | null;
  prcp?: number | null;
  snow?: number | null;
  wdir?: number | null;
  wspd?: number | null;
  wpgt?: number | null;
  pres?: number | null;
  tsun?: number | null;
}

interface MeteostatDailyPoint {
  date: string;
  tmin?: number | null;
  tmax?: number | null;
  tavg?: number | null;
  prcp?: number | null;
  snow?: number | null;
  wdir?: number | null;
  wspd?: number | null;
  wpgt?: number | null;
  pres?: number | null;
  tsun?: number | null;
}

interface MeteostatResponse {
  meta?: { station?: string; timezone?: string; name?: string; latitude?: number; longitude?: number };
  data?: (MeteostatHourlyPoint | MeteostatDailyPoint)[];
  units?: Record<string, string>;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value == null) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeHourly(points?: MeteostatHourlyPoint[]): WeatherPointHourly[] | undefined {
  if (!Array.isArray(points)) return undefined;
  const normalized: WeatherPointHourly[] = [];
  for (const point of points) {
    if (!point?.time) continue;
    normalized.push({
      time: new Date(point.time).toISOString(),
      t2m: toNumber(point.temp),
      tp: toNumber(point.prcp),
      ws: toNumber(point.wspd),
      wd: toNumber(point.wdir),
      rh: toNumber(point.rhum),
      p: toNumber(point.pres),
      rad: toNumber(point.tsun) ?? undefined,
    });
  }
  return normalized.length ? normalized : undefined;
}

function normalizeDaily(points?: MeteostatDailyPoint[]): WeatherPointDaily[] | undefined {
  if (!Array.isArray(points)) return undefined;
  const normalized: WeatherPointDaily[] = [];
  for (const point of points) {
    if (!point?.date) continue;
    const sunshineMinutes = toNumber(point.tsun);
    normalized.push({
      date: point.date,
      tmin: toNumber(point.tmin),
      tmax: toNumber(point.tmax),
      tavg: toNumber(point.tavg) ?? undefined,
      prcp: toNumber(point.prcp),
      ws_avg: toNumber(point.wspd) ?? undefined,
      rh_avg: undefined,
      p_avg: toNumber(point.pres) ?? undefined,
      sun: sunshineMinutes != null ? sunshineMinutes / 60 : undefined,
    });
  }
  return normalized.length ? normalized : undefined;
}

function buildMeteostatUrl(params: WeatherRequestParams & { granularity: 'hourly' | 'daily' }): string {
  const baseUrl = 'https://meteostat.net/api/point';
  const search = new URLSearchParams();
  search.set('lat', params.lat.toString());
  search.set('lon', params.lon.toString());
  search.set('start', params.start);
  search.set('end', params.end);
  const path = params.granularity === 'hourly' ? 'hourly' : 'daily';
  return `${baseUrl}/${path}?${search.toString()}`;
}

function getMeteostatHeaders(): HeadersInit {
  const headers: HeadersInit = { Accept: 'application/json' };
  const token = import.meta.env.VITE_METEOSTAT_TOKEN as string | undefined;
  if (token) {
    headers['x-api-key'] = token;
  }
  return headers;
}

export async function fetchMeteostat(params: WeatherRequestParams): Promise<WeatherSeries> {
  const limiter = getRateLimiter(PROVIDER);
  const url = buildMeteostatUrl(params);

  const response = await limiter.schedule(
    () =>
      fetch(url, {
        headers: getMeteostatHeaders(),
        signal: params.signal,
      }),
    params.signal,
  );

  if (!response.ok) {
    throw new WeatherProviderError(PROVIDER, `Meteostat indisponible (${response.status})`, {
      status: response.status,
      retryable: response.status === 429,
    });
  }

  const json = (await response.json()) as MeteostatResponse;
  const data = Array.isArray(json.data) ? json.data : [];

  const hourly = params.granularity === 'hourly' ? normalizeHourly(data as MeteostatHourlyPoint[]) : undefined;
  const daily = params.granularity === 'daily' ? normalizeDaily(data as MeteostatDailyPoint[]) : undefined;

  if (!hourly?.length && !daily?.length) {
    throw new WeatherProviderError(PROVIDER, 'Réponse Meteostat vide.', { code: 'EMPTY_PAYLOAD' });
  }

  const lat = json.meta?.latitude ?? params.lat;
  const lon = json.meta?.longitude ?? params.lon;

  return {
    meta: {
      provider: PROVIDER,
      stationId: json.meta?.station,
      stationName: json.meta?.name,
      lat,
      lon,
      tz: json.meta?.timezone,
      license: '© Meteostat',
      attribution: 'Source: meteostat.net',
      sources: [PROVIDER],
    },
    hourly,
    daily,
  } satisfies WeatherSeries;
}
