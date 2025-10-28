import { findNearestStation } from '../stations';
import { getRateLimiter } from '../rateLimit';
import type { WeatherPointDaily, WeatherPointHourly, WeatherRequestParams, WeatherSeries } from '../types';
import { WeatherProviderError } from '../types';

const PROVIDER = 'infoclimat' as const;

export interface InfoclimatRequest extends WeatherRequestParams {
  stationId?: string;
}

export interface InfoclimatRawHourlyPoint {
  time: string;
  temperature?: number | string | null;
  dew_point?: number | string | null;
  humidity?: number | string | null;
  wind_speed?: number | string | null;
  wind_direction?: number | string | null;
  pressure?: number | string | null;
  precipitation?: number | string | null;
  global_radiation?: number | string | null;
}

export interface InfoclimatRawDailyPoint {
  date: string;
  tmin?: number | string | null;
  tmax?: number | string | null;
  tavg?: number | string | null;
  precipitation?: number | string | null;
  wind_avg?: number | string | null;
  humidity_avg?: number | string | null;
  pressure_avg?: number | string | null;
  sunshine_duration?: number | string | null;
}

export interface InfoclimatRawResponse {
  station?: { id?: string; name?: string; lat?: number; lon?: number; tz?: string | null };
  hourly?: InfoclimatRawHourlyPoint[];
  daily?: InfoclimatRawDailyPoint[];
  license?: string;
  attribution?: string;
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeHourly(points?: InfoclimatRawHourlyPoint[]): WeatherPointHourly[] | undefined {
  if (!Array.isArray(points)) return undefined;
  const normalized: WeatherPointHourly[] = [];
  for (const point of points) {
    if (!point?.time) continue;
    normalized.push({
      time: new Date(point.time).toISOString(),
      t2m: toNumber(point.temperature),
      tp: toNumber(point.precipitation),
      ws: toNumber(point.wind_speed),
      wd: toNumber(point.wind_direction),
      rh: toNumber(point.humidity),
      p: toNumber(point.pressure),
      rad: toNumber(point.global_radiation) ?? undefined,
    });
  }
  return normalized.length ? normalized : undefined;
}

function normalizeDaily(points?: InfoclimatRawDailyPoint[]): WeatherPointDaily[] | undefined {
  if (!Array.isArray(points)) return undefined;
  const normalized: WeatherPointDaily[] = [];
  for (const point of points) {
    if (!point?.date) continue;
    normalized.push({
      date: point.date,
      tmin: toNumber(point.tmin),
      tmax: toNumber(point.tmax),
      tavg: toNumber(point.tavg) ?? undefined,
      prcp: toNumber(point.precipitation),
      ws_avg: toNumber(point.wind_avg) ?? undefined,
      rh_avg: toNumber(point.humidity_avg) ?? undefined,
      p_avg: toNumber(point.pressure_avg) ?? undefined,
      sun: toNumber(point.sunshine_duration) ?? undefined,
    });
  }
  return normalized.length ? normalized : undefined;
}

export function buildInfoclimatUrl(params: {
  baseUrl?: string;
  stationId: string;
  start: string;
  end: string;
  granularity: 'hourly' | 'daily';
  token: string;
}): string {
  const { baseUrl = 'https://api.infoclimat.fr/v1', stationId, start, end, granularity, token } = params;
  const search = new URLSearchParams();
  search.set('token', token);
  search.set('station', stationId);
  search.set('start', start);
  search.set('end', end);
  search.set('granularity', granularity);
  search.set('format', 'json');
  // TODO: Renseigner l'URL et les paramètres exacts selon la documentation Infoclimat.
  return `${baseUrl}/historique?${search.toString()}`;
}

export async function fetchInfoclimat(params: InfoclimatRequest): Promise<WeatherSeries> {
  const token = import.meta.env.VITE_INFOCLIMAT_TOKEN as string | undefined;
  if (!token) {
    throw new WeatherProviderError(PROVIDER, 'Clé Infoclimat manquante.', { code: 'TOKEN_MISSING' });
  }

  const limiter = getRateLimiter(PROVIDER);
  const station = await findNearestStation({
    provider: PROVIDER,
    lat: params.lat,
    lon: params.lon,
    stationId: params.stationId,
    signal: params.signal,
  });

  if (!station) {
    throw new WeatherProviderError(PROVIDER, 'Aucune station Infoclimat à proximité.', { code: 'NO_STATION' });
  }

  const url = buildInfoclimatUrl({
    stationId: station.id,
    start: params.start,
    end: params.end,
    granularity: params.granularity,
    token,
  });

  const response = await limiter.schedule(
    () =>
      fetch(url, {
        headers: { Accept: 'application/json' },
        signal: params.signal,
      }),
    params.signal,
  );

  if (!response.ok) {
    throw new WeatherProviderError(PROVIDER, `Infoclimat indisponible (${response.status})`, {
      status: response.status,
      retryable: response.status === 429,
    });
  }

  const json = (await response.json()) as InfoclimatRawResponse;

  const hourly = normalizeHourly(json.hourly);
  const daily = normalizeDaily(json.daily);

  if (!hourly?.length && !daily?.length) {
    throw new WeatherProviderError(PROVIDER, 'Réponse Infoclimat vide.', { code: 'EMPTY_PAYLOAD' });
  }

  return {
    meta: {
      provider: PROVIDER,
      stationId: station.id,
      stationName: station.name ?? undefined,
      lat: station.lat,
      lon: station.lon,
      tz: json.station?.tz ?? undefined,
      license: json.license ?? '© Infoclimat',
      attribution: json.attribution ?? 'Données © Infoclimat',
      sources: [PROVIDER],
    },
    hourly,
    daily,
  } satisfies WeatherSeries;
}
