import { findNearestStation } from '../stations';
import { getRateLimiter } from '../rateLimit';
import type { WeatherPointDaily, WeatherPointHourly, WeatherRequestParams, WeatherSeries } from '../types';
import { WeatherProviderError } from '../types';

const PROVIDER = 'infoclimat' as const;

export interface InfoclimatRequest extends WeatherRequestParams {
  stationId?: string;
}

export interface InfoclimatRawHourlyPoint {
  time?: string;
  dh_utc?: string;
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
  metadata?: Record<string, unknown> | null;
}

export interface InfoclimatBackendResponse {
  source?: string;
  station: string;
  dateStart: string;
  dateEnd: string;
  hourly?: InfoclimatRawHourlyPoint[] | Record<string, InfoclimatRawHourlyPoint[]>;
  daily?: InfoclimatRawDailyPoint[] | Record<string, InfoclimatRawDailyPoint[]>;
  stations?: Array<{ id?: string; name?: string | null; tz?: string | null }>;
  metadata?: Record<string, unknown> | null;
  license?: string | null;
  attribution?: string | null;
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
    const rawTime = point?.time ?? point?.dh_utc;
    if (!rawTime || typeof rawTime !== 'string') continue;
    const trimmed = rawTime.trim();
    if (!trimmed.length) continue;
    const isoCandidate = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
    const withTimezone = /Z$|[+-]\d{2}:?\d{2}$/.test(isoCandidate)
      ? isoCandidate
      : `${isoCandidate}Z`;
    const timestamp = new Date(withTimezone);
    if (Number.isNaN(timestamp.getTime())) continue;
    normalized.push({
      time: timestamp.toISOString(),
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

export function buildInfoclimatRequestParams({
  station,
  dateStart,
  dateEnd,
}: {
  station: string;
  dateStart: string;
  dateEnd: string;
}) {
  return {
    station,
    dateStart,
    dateEnd,
  };
}

export async function fetchInfoclimat(params: InfoclimatRequest): Promise<WeatherSeries> {
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

  const request = buildInfoclimatRequestParams({
    station: station.id,
    dateStart: params.start,
    dateEnd: params.end,
  });

  const search = new URLSearchParams();
  search.set('station', request.station);
  search.set('dateStart', request.dateStart);
  search.set('dateEnd', request.dateEnd);

  const response = await limiter.schedule(
    () =>
      fetch(`/api/weather/infoclimat?${search.toString()}`, {
        headers: { Accept: 'application/json' },
        signal: params.signal,
      }),
    params.signal,
  );

  if (!response.ok) {
    let errorMessage = `Infoclimat indisponible (${response.status})`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload?.error) {
        errorMessage = payload.error;
      }
    } catch {
      // Ignore JSON parsing errors, keep default message
    }
    throw new WeatherProviderError(PROVIDER, errorMessage, {
      status: response.status,
      retryable: response.status === 429,
    });
  }

  const payload = (await response.json()) as InfoclimatBackendResponse;

  const hourlyMap =
    payload.hourly && !Array.isArray(payload.hourly) && typeof payload.hourly === 'object'
      ? (payload.hourly as Record<string, InfoclimatRawHourlyPoint[]>)
      : undefined;
  const dailyMap =
    payload.daily && !Array.isArray(payload.daily) && typeof payload.daily === 'object'
      ? (payload.daily as Record<string, InfoclimatRawDailyPoint[]>)
      : undefined;

  const hourlyRaw = Array.isArray(payload.hourly)
    ? payload.hourly
    : hourlyMap?.[station.id] ?? hourlyMap?.[station.id.toUpperCase()] ?? hourlyMap?.[station.id.toLowerCase()];
  const dailyRaw = Array.isArray(payload.daily)
    ? payload.daily
    : dailyMap?.[station.id] ?? dailyMap?.[station.id.toUpperCase()] ?? dailyMap?.[station.id.toLowerCase()];

  const hourly = normalizeHourly(hourlyRaw as InfoclimatRawHourlyPoint[] | undefined);
  const daily = normalizeDaily(dailyRaw as InfoclimatRawDailyPoint[] | undefined);

  if (!hourly?.length && !daily?.length) {
    throw new WeatherProviderError(PROVIDER, 'Réponse Infoclimat vide.', { code: 'EMPTY_PAYLOAD' });
  }

  const metadata = payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : undefined;
  const timezone = metadata
    ? typeof (metadata as Record<string, unknown>).timezone === 'string'
      ? ((metadata as Record<string, unknown>).timezone as string)
      : typeof (metadata as Record<string, unknown>).time_zone === 'string'
        ? ((metadata as Record<string, unknown>).time_zone as string)
        : undefined
    : undefined;

  return {
    meta: {
      provider: PROVIDER,
      stationId: station.id,
      stationName: station.name ?? undefined,
      lat: station.lat,
      lon: station.lon,
      tz: timezone ?? payload.stations?.find((item) => item?.id === station.id)?.tz ?? undefined,
      license: payload.license ?? '© Infoclimat',
      attribution: payload.attribution ?? 'Données © Infoclimat',
      sources: [PROVIDER],
    },
    hourly,
    daily,
  } satisfies WeatherSeries;
}
